/**
 * ReportsQueue — table of pending moderation reports.
 * Review button opens modal with action buttons.
 * Subscribes to admin_report_received socket event for real-time updates.
 * SPEC.md §22 Story 11.2
 */
import React, { useEffect, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getReports, updateReport, applyMute } from '@/api/admin.api';
import { getLobbySocket } from '@/hooks/useSocket';
import { Modal } from '@/components/shared/Modal';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import type { ModerationReport, MuteDuration } from '@shared/admin';
import en from '@/i18n/en.json';

type ReportAction = 'dismiss' | 'warn' | MuteDuration;

const MUTE_ACTIONS: { action: ReportAction; label: string }[] = [
  { action: 'dismiss',    label: en.admin.dismiss },
  { action: 'warn',       label: en.admin.warn },
  { action: '15min',      label: en.admin.mute15min },
  { action: '1hr',        label: en.admin.mute1hr },
  { action: '24hr',       label: en.admin.mute24hr },
  { action: '7day',       label: en.admin.mute7day },
  { action: 'permanent',  label: en.admin.mutePermanent },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ReportsQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reviewReport, setReviewReport] = useState<ModerationReport | null>(null);
  const [isActioning, setIsActioning] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: () => getReports('pending'),
  });

  // Subscribe to admin_report_received for real-time queue updates
  useEffect(() => {
    const socket = getLobbySocket();

    function onReportReceived(report: ModerationReport) {
      logger.info('ReportsQueue: new report received', { reportId: report.id });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    }

    socket.on('admin_report_received', onReportReceived);
    return () => {
      socket.off('admin_report_received', onReportReceived);
    };
  }, [queryClient]);

  const handleAction = useCallback(
    async (report: ModerationReport, action: ReportAction) => {
      setIsActioning(true);
      try {
        if (action === 'dismiss') {
          await updateReport(report.id, 'dismiss');
          toast('Report dismissed', 'info');
        } else if (action === 'warn') {
          await updateReport(report.id, 'actioned');
          toast('Warning sent to player', 'success');
        } else {
          // Mute action
          await applyMute({
            playerId: report.reportedPlayerId,
            duration: action as MuteDuration,
            reason: `Actioned via report ${report.id}`,
          });
          await updateReport(report.id, 'actioned');
          toast(en.admin.playerMuted.replace('{action}', action), 'success');
        }

        void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
        setReviewReport(null);
      } catch (err) {
        logger.error('ReportsQueue: action failed', { err, action });
        toast(en.app.error, 'error');
      } finally {
        setIsActioning(false);
      }
    },
    [queryClient, toast],
  );

  if (isLoading) {
    return <p className="text-slate-400 text-sm">{en.app.loading}</p>;
  }

  const reports = data?.reports ?? [];

  if (reports.length === 0) {
    return <p className="text-slate-400 text-sm">{en.admin.noReports}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
              <th className="pb-2 pr-4 text-left">{en.admin.reportedPlayer}</th>
              <th className="pb-2 pr-4 text-left">{en.admin.reportedBy}</th>
              <th className="pb-2 pr-4 text-left">{en.admin.reason}</th>
              <th className="pb-2 pr-4 text-left">{en.admin.timestamp}</th>
              <th className="pb-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {reports.map(report => (
              <tr key={report.id} className="border-b border-slate-700/50">
                <td className="py-2 pr-4 text-white">{report.reportedPlayerId}</td>
                <td className="py-2 pr-4 text-slate-300">{report.reportedByPlayerId}</td>
                <td className="py-2 pr-4 text-slate-300 max-w-xs truncate">{report.reason}</td>
                <td className="py-2 pr-4 text-slate-400 text-xs">{formatDate(report.createdAt)}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setReviewReport(report)}
                    aria-label={`${en.admin.review} report ${report.id}`}
                    className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1 rounded transition-colors"
                  >
                    {en.admin.review}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Review modal */}
      <Modal
        isOpen={reviewReport !== null}
        onClose={() => setReviewReport(null)}
        title={`${en.admin.review}: ${reviewReport?.reportedPlayerId ?? ''}`}
        className="max-w-lg"
      >
        {reviewReport && (
          <div className="space-y-4">
            <div className="bg-slate-700 rounded-lg p-3">
              <p className="text-sm font-medium text-slate-300 mb-1">{en.admin.reason}</p>
              <p className="text-sm text-white">{reviewReport.reason}</p>
            </div>
            <div className="text-xs text-slate-400">
              <span>Reported: {formatDate(reviewReport.createdAt)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {MUTE_ACTIONS.map(({ action, label }) => (
                <button
                  key={action}
                  onClick={() => handleAction(reviewReport, action)}
                  disabled={isActioning}
                  aria-label={label}
                  className={`text-sm font-medium px-3 py-2 rounded transition-colors disabled:opacity-50 ${
                    action === 'dismiss'
                      ? 'bg-slate-600 hover:bg-slate-500 text-white'
                      : action === 'warn'
                        ? 'bg-amber-700 hover:bg-amber-600 text-white'
                        : 'bg-red-800 hover:bg-red-700 text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
