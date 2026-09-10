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
  message: z.string().trim().min(1, 'No message provided').max(8_000),
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
  platform: z.string().max(50).nullable().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
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

// ── /api/user/feedback POST ──────────────────────────────────────────────────
export const FeedbackSubmitSchema = z.object({
  type: z.enum(['bug', 'feature', 'feedback']).default('feedback'),
  area: z.string().max(50).default('general'),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(150),
  message: z.string().min(10, 'Please provide more details (at least 10 characters)').max(5000),
  systemContext: z.record(z.string(), z.unknown()).optional(),
});
export type FeedbackSubmitInput = z.infer<typeof FeedbackSubmitSchema>;

// ── /api/admin/feedback PATCH ────────────────────────────────────────────────
export const FeedbackAdminReplySchema = z.object({
  id: z.string().uuid('Invalid ticket ID'),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  adminResponse: z.string().min(2, 'Response is required'),
});
export type FeedbackAdminReplyInput = z.infer<typeof FeedbackAdminReplySchema>;

// ── Validation helper ────────────────────────────────────────────────────────
export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): 
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const message = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { success: false, error: message };
}
