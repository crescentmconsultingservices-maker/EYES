/** @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock' } } })
    }
  }),
}));

vi.mock('@/components/dashboard/ThinkingVeil', () => ({
  ThinkingVeil: ({ onComplete, onError, onReturnToDashboard }: any) => (
    <div data-testid="thinking-veil">
      <button onClick={onComplete}>Complete</button>
      <button onClick={() => onError('Test Error')}>Error</button>
      <button onClick={onReturnToDashboard}>Return</button>
    </div>
  ),
}));

vi.mock('@/components/common/AnimatedNumber', () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));

import { AuditView } from '@/components/dashboard/AuditView';

describe('AuditView', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost/',
        search: '',
      },
      writable: true,
    });

    fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/audit/history')) {
        return new Response(JSON.stringify({
          audits: [
            { id: 'audit-hist-1', riskScore: 8.5, createdAt: new Date().toISOString(), metadata: { audit_type: 'reputation' } }
          ]
        }), { status: 200 });
      }

      if (url.includes('/api/audit/create')) {
        return new Response(JSON.stringify({ success: true, auditId: 'audit-new-123' }), { status: 200 });
      }

      if (url.includes('/api/audit/latest') || url.includes('/api/audit/')) {
        // Default to returning null/empty for latest unless mocked otherwise in specific tests
        return new Response(JSON.stringify(null), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('renders dashboard state by default', async () => {
    render(<AuditView onBack={vi.fn()} />);

    expect(screen.getByText('Audit Control Center')).toBeInTheDocument();
    expect(screen.getByText('Full Reputation Audit')).toBeInTheDocument();
  });

  it('loads audit history on mount', async () => {
    render(<AuditView onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('PAST AUDITS')).toBeInTheDocument();
      expect(screen.getByText('8.5')).toBeInTheDocument();
    });
  });

  it('initiates audit directly on clicking start audit without payment', async () => {
    render(<AuditView onBack={vi.fn()} />);

    const startBtn = screen.getByText('START FULL SCAN');
    fireEvent.click(startBtn);

    expect(startBtn).toHaveTextContent('INITIALIZING...');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/audit/create', expect.any(Object));
      expect(screen.getByTestId('thinking-veil')).toBeInTheDocument();
    });
  });

  it('renders error state correctly', async () => {
    // To transition to error, we'll force it via the mocked ThinkingVeil
    window.location.search = '?audit=success';
    
    // We need to re-mock fetch to simulate a running audit
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/audit/latest')) {
        return new Response(JSON.stringify({ id: 'running-audit', status: 'pending' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { unmount } = render(<AuditView onBack={vi.fn()} />);
    
    await waitFor(() => {
      expect(screen.getByTestId('thinking-veil')).toBeInTheDocument();
    });

    const errBtn = screen.getByText('Error');
    fireEvent.click(errBtn);

    await waitFor(() => {
      expect(screen.getByText('Analysis Error')).toBeInTheDocument();
      expect(screen.getByText('Test Error')).toBeInTheDocument();
    });

    unmount();
  });
});
