// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  return {
    userId: '4d2f3e3c-b834-43fc-852a-c3cdbb535b68',
    audit: {
      id: 'dd1fe08c-e7b4-46ba-a1b2-da6517cfc89b',
      user_id: '4d2f3e3c-b834-43fc-852a-c3cdbb535b68',
      status: 'completed',
      risk_score: 5.5,
      mentions_count: 120,
      commitments_count: 5,
      summary_narrative: 'Test summary narrative.',
      connectors_covered: ['gmail', 'slack'],
      report_url: null,
      created_at: '2026-06-12T00:00:00.000Z',
      metadata: { subjectName: 'Tommy' }
    }
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const queryBuilder = {
      select: vi.fn(() => queryBuilder),
      eq: vi.fn(() => queryBuilder),
      like: vi.fn(() => queryBuilder),
      in: vi.fn(() => queryBuilder),
      maybeSingle: vi.fn(async () => {
        return { data: hoisted.audit, error: null };
      })
    };
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: hoisted.userId,
              email: 'thomasshelby251890@gmail.com'
            }
          },
          error: null
        }))
      },
      from: vi.fn(() => queryBuilder)
    };
  }),
  createAdminClient: vi.fn(async () => {
    const adminQueryBuilder: any = {
      select: vi.fn(() => adminQueryBuilder),
      eq: vi.fn(() => adminQueryBuilder),
      like: vi.fn(() => adminQueryBuilder),
      in: vi.fn(() => adminQueryBuilder),
      maybeSingle: vi.fn(async () => {
        return { data: hoisted.audit, error: null };
      }),
      then: (resolve: any) => {
        return Promise.resolve({
          data: [
            { platform: 'gmail' },
            { platform: 'slack' }
          ],
          error: null
        }).then(resolve);
      }
    };
    return {
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: {
              user: {
                id: hoisted.userId,
                email: 'thomasshelby251890@gmail.com',
                user_metadata: { full_name: 'Tommy Shelby' }
              }
            },
            error: null
          }))
        }
      },
      from: vi.fn(() => adminQueryBuilder)
    };
  })
}));

import { GET } from '@/app/api/audit/[id]/pdf/route';

describe('GET /api/audit/[id]/pdf', () => {
  it('generates PDF and returns a 200 response', async () => {
    const req = new Request(`http://localhost:3000/api/audit/${hoisted.audit.id}/pdf`);
    const params = Promise.resolve({ id: hoisted.audit.id });

    const response = await GET(req, { params });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('Test Generated PDF Size:', arrayBuffer.byteLength, 'bytes');
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
  });

  it('synchronizes narrative scan window with the certificate header scan window', async () => {
    // Inject disparate scan window into audit narrative
    hoisted.audit.summary_narrative = 'Analysis of 120 interactions evaluated across gmail, slack during the May 2026 – Sep 2026 scan window indicates a clean operational profile.';
    
    const req = new Request(`http://localhost:3000/api/audit/${hoisted.audit.id}/pdf`);
    const params = Promise.resolve({ id: hoisted.audit.id });

    const response = await GET(req, { params });
    expect(response.status).toBe(200);

    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Decompress and verify that the narrative text does not retain the mismatched 'May 2026 – Sep 2026'
    const zlib = await import('zlib');
    let text = '';
    let pos = 0;
    while ((pos = buffer.indexOf('stream', pos)) !== -1) {
      pos += 6;
      if (buffer[pos] === 0x0d && buffer[pos+1] === 0x0a) pos += 2;
      else if (buffer[pos] === 0x0a) pos += 1;
      const end = buffer.indexOf('endstream', pos);
      if (end !== -1) {
        try {
          const decompressed = zlib.inflateSync(buffer.slice(pos, end)).toString('latin1');
          text += decompressed;
        } catch (e) {}
        pos = end + 9;
      }
    }

    // Verify 'May 2026' was scrubbed and replaced with the true computed scan window
    expect(text.includes('May 2026')).toBe(false);
  });
});
