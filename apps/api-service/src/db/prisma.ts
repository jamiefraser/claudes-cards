/**
 * Singleton Prisma client instance.
 * Import this throughout the api-service instead of creating new PrismaClient instances.
 *
 * The globalThis guard prevents multiple PrismaClient instances during dev hot-reload
 * (ts-node-dev module re-evaluation creates new instances without this guard).
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
