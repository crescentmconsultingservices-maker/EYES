import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from '../organization/members/route';
import { NextRequest } from 'next/server';

let mockCurrentUser: { id: string; email: string } | null = {
  id: 'owner-1',
  email: 'owner@acme.com',
};

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: mockCurrentUser },
        error: mockCurrentUser ? null : new Error('Not authenticated'),
      })),
    },
  })),
}));

let mockDbData = {
  user_profiles: [
    { user_id: 'owner-1', organization_id: 'org-1' },
    { user_id: 'admin-1', organization_id: 'org-1' },
    { user_id: 'member-1', organization_id: 'org-1' },
  ],
  organization_members: [
    { id: 'm-owner', user_id: 'owner-1', organization_id: 'org-1', role: 'owner' },
    { id: 'm-admin', user_id: 'admin-1', organization_id: 'org-1', role: 'admin' },
    { id: 'm-member', user_id: 'member-1', organization_id: 'org-1', role: 'member' },
  ],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn(() => {
                const found = mockDbData.user_profiles.find((p: any) => p[col] === val);
                return Promise.resolve({ data: found || null, error: null });
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          })),
        };
      }
      if (table === 'organization_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col1: string, val1: string) => ({
              eq: vi.fn((col2: string, val2: string) => ({
                maybeSingle: vi.fn(() => {
                  const found = mockDbData.organization_members.find(
                    (m: any) => m[col1] === val1 && m[col2] === val2
                  );
                  return Promise.resolve({ data: found || null, error: null });
                }),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      return {};
    }),
  })),
}));

describe('DELETE /api/organization/members', () => {
  beforeEach(() => {
    mockCurrentUser = { id: 'owner-1', email: 'owner@acme.com' };
  });

  it('returns 401 when user is unauthenticated', async () => {
    mockCurrentUser = null;
    const req = new NextRequest('http://localhost/api/organization/members?memberId=m-member');
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when missing memberId and userId', async () => {
    const req = new NextRequest('http://localhost/api/organization/members');
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it('returns 403 when trying to remove the workspace owner', async () => {
    const req = new NextRequest('http://localhost/api/organization/members?memberId=m-owner');
    const res = await DELETE(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toContain('Cannot remove the workspace owner');
  });

  it('successfully removes a member when requested by the owner', async () => {
    const req = new NextRequest('http://localhost/api/organization/members?memberId=m-member');
    const res = await DELETE(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('allows a member to remove themselves (leave workspace)', async () => {
    mockCurrentUser = { id: 'member-1', email: 'member@acme.com' };
    const req = new NextRequest('http://localhost/api/organization/members?memberId=m-member');
    const res = await DELETE(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('left the workspace');
  });

  it('forbids a regular member from removing another member', async () => {
    mockCurrentUser = { id: 'member-1', email: 'member@acme.com' };
    const req = new NextRequest('http://localhost/api/organization/members?memberId=m-admin');
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });
});
