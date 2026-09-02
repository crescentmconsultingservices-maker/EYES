import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../organization/details/route';

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: 'test-user-123', email: 'owner@acme.com', user_metadata: { full_name: 'Test Owner' } } },
        error: null,
      })),
    },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { organization_id: 'org-999' } }))
            })),
            in: vi.fn(() => Promise.resolve({ data: [{ user_id: 'test-user-123', name: 'Test Owner', avatar: 'T' }] }))
          })),
          upsert: vi.fn(() => Promise.resolve({ error: null }))
        };
      }
      if (table === 'organizations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'org-999', name: 'Acme Robotics', corporate_domain: 'acme.com', privacy_shield_enabled: true } }))
            }))
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'org-999', name: 'Acme Robotics' } }))
            }))
          }))
        };
      }
      if (table === 'organization_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [{ id: 'm-1', user_id: 'test-user-123', role: 'owner', joined_at: new Date().toISOString() }] }))
          })),
          upsert: vi.fn(() => Promise.resolve({ error: null }))
        };
      }
      if (table === 'organization_invitations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [] }))
            }))
          }))
        };
      }
      return {};
    })
  }))
}));

describe('/api/organization/details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns organization info and members list', async () => {
    const req = new Request('http://localhost/api/organization/details');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.organization.name).toBe('Acme Robotics');
  });

  it('POST creates a new organization workspace cleanly', async () => {
    const req = new Request('http://localhost/api/organization/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Robotics' })
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.organization.id).toBe('org-999');
  });
});
