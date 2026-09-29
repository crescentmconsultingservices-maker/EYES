import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizeLensType, AuditLensService } from '@/services/audit/lens-service';

const hoisted = vi.hoisted(() => ({
  auditId: '11111111-2222-3333-4444-555555555555',
  userId: 'user-abc-123',
  mockAudit: {
    id: '11111111-2222-3333-4444-555555555555',
    user_id: 'user-abc-123',
    status: 'completed',
    risk_score: 4.0,
    summary_narrative: 'Base full narrative',
    extracted_findings: {
      entities: ['Project Alpha', 'Acme Corp'],
      commitments: [{ text: 'Ship v1', status: 'pending' }],
      flagged_items: [],
      sentiment: { balance: 0.9 },
      connectors_covered: ['gmail', 'slack'],
      mentions_count: 50,
    },
    metadata: {},
  },
  existingInvestorLens: null as any,
}));

vi.mock('@/utils/supabase/server', () => ({
  createAdminClient: vi.fn(async () => {
    return {
      from: vi.fn((table: string) => {
        if (table === 'reputation_audits') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: hoisted.mockAudit, error: null })),
          };
        }
        if (table === 'audit_lenses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: hoisted.existingInvestorLens, error: null })),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn(async () => ({
                  data: {
                    id: 'new-lens-id',
                    audit_id: hoisted.auditId,
                    lens_type: 'investor',
                    risk_score: 3.5,
                    narrative: 'Generated investor narrative.',
                    metadata: {},
                    generated_at: new Date().toISOString(),
                  },
                  error: null,
                })),
              }),
            }),
          };
        }
        return {};
      }),
    };
  }),
}));

vi.mock('@/services/ai/ai', () => ({
  invokeModel: vi.fn(async () => {
    return JSON.stringify({
      narrative: 'Generated investor narrative.',
      riskScore: 3.5,
    });
  }),
}));

describe('AuditLensService & Multi-Lens System', () => {
  beforeEach(() => {
    hoisted.existingInvestorLens = null;
  });

  it('correctly normalizes lens types', () => {
    expect(normalizeLensType('full')).toBe('full');
    expect(normalizeLensType('investor')).toBe('investor');
    expect(normalizeLensType('reputation')).toBe('investor'); // alias
    expect(normalizeLensType('hiring')).toBe('hiring');
    expect(normalizeLensType('behavioral')).toBe('behavioral');
    expect(normalizeLensType('')).toBe('full');
    expect(normalizeLensType('unknown')).toBe('full');
  });

  it('generates a lens on-demand when not cached', async () => {
    const lens = await AuditLensService.getOrCreateLens(hoisted.auditId, 'investor', hoisted.userId);
    expect(lens).toBeDefined();
    expect(lens.lensType).toBe('investor');
    expect(lens.riskScore).toBe(3.5);
    expect(lens.narrative).toBe('Generated investor narrative.');
  });

  it('returns existing cached lens without generating new one', async () => {
    hoisted.existingInvestorLens = {
      id: 'cached-lens-id',
      audit_id: hoisted.auditId,
      lens_type: 'investor',
      risk_score: 2.8,
      narrative: 'Already cached investor narrative.',
      metadata: {},
      generated_at: '2026-09-01T00:00:00Z',
    };

    const lens = await AuditLensService.getOrCreateLens(hoisted.auditId, 'investor', hoisted.userId);
    expect(lens).toBeDefined();
    expect(lens.id).toBe('cached-lens-id');
    expect(lens.riskScore).toBe(2.8);
    expect(lens.narrative).toBe('Already cached investor narrative.');
  });
});
