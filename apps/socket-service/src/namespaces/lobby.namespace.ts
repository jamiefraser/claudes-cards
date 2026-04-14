/**
 * /lobby Namespace
 *
 * Handles presence, DMs, room updates, and admin events per SPEC.md §24.2.
 * Events: dm_send, report_message, disconnect
 */

import { randomUUID } from 'crypto';
import type { Server, Socket } from 'socket.io';
import { socketAuthMiddleware } from '../middleware/socketAuth';
import { setPresence, startPresenceHeartbeat, clearPresence } from '../handlers/presence';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { DMSendPayload, ReportMessagePayload, ChatMessage } from '@card-platform/shared-types';

export function setupLobbyNamespace(io: Server): void {
  const lobbyNsp = io.of('/lobby');

  // Register auth middleware
  lobbyNsp.use(socketAuthMiddleware);

  lobbyNsp.on('connection', (socket: Socket) => {
    const { playerId, role } = socket.data.user;
    logger.info('Player connected to /lobby', { playerId, socketId: socket.id });

    // Auto-join player-specific room
    socket.join(`player:${playerId}`);

    // Auto-join role rooms for moderators and admins
    if (role === 'moderator' || role === 'admin') {
      socket.join('role:moderator');
    }
    if (role === 'admin') {
      socket.join('role:admin');
    }

    // Set initial presence
    setPresence(socket, 'online').catch((err: Error) => {
      logger.error('Failed to set lobby presence', { err: err.message });
    });

    const heartbeat = startPresenceHeartbeat(socket, 'online');

    // -----------------------------------------------------------------------
    // DM handler
    // -----------------------------------------------------------------------

    socket.on('dm_send', (payload: DMSendPayload) => {
      handleDMSend(socket, payload, lobbyNsp).catch((err: Error) => {
        logger.error('dm_send error', { err: err.message, playerId });
      });
    });

    // -----------------------------------------------------------------------
    // Report message handler
    // -----------------------------------------------------------------------

    socket.on('report_message', (payload: ReportMessagePayload) => {
      handleReportMessage(socket, payload, lobbyNsp).catch((err: Error) => {
        logger.error('report_message error', { err: err.message, playerId });
      });
    });

    // -----------------------------------------------------------------------
    // Disconnect
    // -----------------------------------------------------------------------

    socket.on('disconnect', () => {
      clearInterval(heartbeat);
      clearPresence(playerId).catch((err: Error) => {
        logger.error('clearPresence error on lobby disconnect', { err: err.message });
      });
      logger.info('Player disconnected from /lobby', { playerId, socketId: socket.id });
    });
  });
}

// ---------------------------------------------------------------------------
// Private handlers
// ---------------------------------------------------------------------------

async function handleDMSend(
  socket: Socket,
  payload: DMSendPayload,
  lobbyNsp: ReturnType<Server['of']>,
): Promise<void> {
  const { toPlayerId, content } = payload;
  const { playerId, displayName } = socket.data.user;

  if (!toPlayerId || !content) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'toPlayerId and content are required' });
    return;
  }

  const message: ChatMessage = {
    id: randomUUID(),
    roomId: `dm:${playerId}:${toPlayerId}`,
    senderId: playerId,
    senderDisplayName: displayName,
    content: content.trim(),
    type: 'dm',
    sentAt: new Date().toISOString(),
  };

  // Increment unread count for recipient
  await redis.set(
    `dm:unread:${toPlayerId}:${playerId}`,
    String((parseInt(await redis.get(`dm:unread:${toPlayerId}:${playerId}`) ?? '0', 10)) + 1),
  );

  // Deliver to recipient's room if online
  lobbyNsp.to(`player:${toPlayerId}`).emit('dm_message', { message });

  // Echo back to sender for confirmation
  socket.emit('dm_message', { message });

  logger.debug('DM sent', { from: playerId, to: toPlayerId });
}

async function handleReportMessage(
  socket: Socket,
  payload: ReportMessagePayload,
  lobbyNsp: ReturnType<Server['of']>,
): Promise<void> {
  const { messageId, reportedPlayerId, reason } = payload;
  const { playerId } = socket.data.user;

  if (!messageId || !reportedPlayerId || !reason) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'messageId, reportedPlayerId, and reason are required' });
    return;
  }

  // Forward report to moderators/admins
  const report = {
    id: randomUUID(),
    messageId,
    reportedPlayerId,
    reportingPlayerId: playerId,
    reason,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };

  lobbyNsp.to('role:moderator').emit('admin_report_received', { report });

  // Acknowledge to reporter
  socket.emit('report_acknowledged', { reportId: report.id });

  logger.info('Message reported', { messageId, reportedPlayerId, reportingPlayerId: playerId });
}
