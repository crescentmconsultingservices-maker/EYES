/** @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase client
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }),
    }),
    removeChannel: vi.fn(),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock' } } }) },
  }),
}));

vi.mock('@/config/platforms', () => ({
  ALL_POSSIBLE_PLATFORMS: [
    { id: 'gmail', name: 'Gmail' },
    { id: 'slack', name: 'Slack' },
  ],
}));

import { ActionQueueView } from '@/components/dashboard/ActionQueueView';

describe('ActionQueueView', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/actions/queue')) {
        return new Response(JSON.stringify({
          actions: [
            {
              id: 'act-1',
              memory_id: 'mem-1',
              platform: 'gmail',
              title: 'Reply to John',
              description: 'John asked about the quarterly report.',
              suggested_action: 'Hi John, thanks for the reminder...',
              action_type: 'EMAIL_REPLY',
              confidence: 92,
              status: 'pending',
              extracted_at: new Date().toISOString(),
            },
            {
              id: 'act-2',
              memory_id: 'mem-2',
              platform: 'slack',
              title: 'Review PR #42',
              description: 'PR review requested on the auth module.',
              suggested_action: 'Review and approve PR.',
              action_type: 'REMINDER',
              confidence: 78,
              status: 'pending',
              extracted_at: new Date().toISOString(),
            },
          ],
          lastRunAt: new Date().toISOString(),
          recentlyHandled: [],
        }), { status: 200 });
      }

      if (url.includes('/api/actions/approve')) {
        return new Response(JSON.stringify({ success: true, finalStatus: 'executed' }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('renders the action queue heading and fetches actions', async () => {
    const onBack = vi.fn();
    render(<ActionQueueView onBack={onBack} />);

    // Should show the component title
    expect(screen.getByText(/Action Command Bridge/i)).toBeInTheDocument();

    // Should fetch actions and render them
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/actions/queue'),
        expect.anything()
      );
    });

    // Wait for action titles to appear
    await waitFor(() => {
      expect(screen.getByText('Reply to John')).toBeInTheDocument();
      expect(screen.getByText('Review PR #42')).toBeInTheDocument();
    });
  });

  it('displays confidence badges with correct styling cues', async () => {
    const onBack = vi.fn();
    render(<ActionQueueView onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText('Reply to John')).toBeInTheDocument();
    });

    // High confidence (92) should show
    expect(screen.getByText(/92/)).toBeInTheDocument();
    // Medium confidence (78) should show
    expect(screen.getByText(/78/)).toBeInTheDocument();
  });

  it('renders empty state when no actions returned', async () => {
    fetchMock.mockRestore();
    fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({
        actions: [],
        lastRunAt: null,
        recentlyHandled: [],
      }), { status: 200 });
    });

    const onBack = vi.fn();
    render(<ActionQueueView onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Queue Clear/i)).toBeInTheDocument();
    });
  });
});
