/**
 * Winston logger singleton for worker-service.
 * Use this throughout worker-service — never console.log.
 * Per CLAUDE.md rule 7.
 */

import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});
