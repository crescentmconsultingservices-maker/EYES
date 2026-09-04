/**
 * Zod validation schemas for critical API routes.
 * Centralized here to be reusable and testable.
 */
import { z } from 'zod';

// ── /api/actions/approve ─────────────────────────────────────────────────────
export const ActionApproveSchema = z.object({
  id: z.string().uuid('Action ID must be a valid UUID'),
  title: z.string().max(500).optional(),
  suggested_action: z.string().max(10_000).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});
export type ActionApproveInput = z.infer<typeof ActionApproveSchema>;

// ── /api/chat ────────────────────────────────────────────────────────────────
export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(8_000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional().default([]),
  threadId: z.string().nullable().optional().default(null),
  summary: z.string().max(2_000).optional().default(''),
});
export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;

// ── /api/memories ────────────────────────────────────────────────────────────
export const MemoriesQuerySchema = z.object({
  cursor: z.string().nullable().optional(),
  platform: z.string().max(50).optional(),
});
export type MemoriesQueryInput = z.infer<typeof MemoriesQuerySchema>;

// ── /api/organization/invite/accept ──────────────────────────────────────────
export const InviteAcceptSchema = z.object({
  token: z.string().min(10, 'Invitation token is invalid'),
});
export type InviteAcceptInput = z.infer<typeof InviteAcceptSchema>;

// ── /api/actions/queue PATCH ─────────────────────────────────────────────────
export const ActionQueuePatchSchema = z.object({
  id: z.string().uuid('Action ID must be a valid UUID'),
  status: z.enum(['pending', 'approved', 'dismissed', 'executed', 'failed', 'snoozed']),
});
export type ActionQueuePatchInput = z.infer<typeof ActionQueuePatchSchema>;

// ── Validation helper ────────────────────────────────────────────────────────
export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): 
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const message = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { success: false, error: message };
}
