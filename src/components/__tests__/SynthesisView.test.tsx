/** @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock the icons module to prevent SVG import issues in tests
vi.mock('@/components/common/icons/PlatformIcons', () => {
  const MockIcon = ({ size }: { size?: number }) => <span data-testid="mock-icon" />;
  return {
    SearchIcon: MockIcon,
    ArrowRightIcon: MockIcon,
    GmailIconOfficial: MockIcon,
    GitHubIconOfficial: MockIcon,
    SlackIconOfficial: MockIcon,
    DiscordIconOfficial: MockIcon,
    NotionIconOfficial: MockIcon,
    CalendarIconOfficial: MockIcon,
    LinearIconOfficial: MockIcon,
    TrelloIconOfficial: MockIcon,
    DropboxIconOfficial: MockIcon,
    VercelIconOfficial: MockIcon,
  };
});

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock('remark-gfm', () => ({ default: () => {} }));

import { SynthesisView } from '@/components/dashboard/SynthesisView';

describe('SynthesisView', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/alerts')) {
        return new Response(JSON.stringify({
          alerts: [
            {
              id: 'alert-1',
              alert_type: 'commitment',
              title: 'Unfulfilled Promise',
              body: 'You promised to send the deck by Monday.',
              created_at: new Date().toISOString(),
            },
          ],
        }), { status: 200 });
      }

      if (url.includes('/api/topic-clusters')) {
        return new Response(JSON.stringify({ clusters: [] }), { status: 200 });
      }

      if (url.includes('/api/cognitive')) {
        return new Response(JSON.stringify({ loops: [], driftGaps: [], correlations: [], inference: null }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('renders the hero title when no messages exist', async () => {
    const ref = { current: null };
    render(
      <SynthesisView
        query=""
        setQuery={vi.fn()}
        messages={[]}
        isStreaming={false}
        onSubmit={vi.fn()}
        messagesEndRef={ref}
        setView={vi.fn()}
        totalMemories={5000}
      />
    );

    expect(screen.getByText('Everything You Ever Said')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask me anything about your life...')).toBeInTheDocument();
  });

  it('renders chat messages when messages are provided', async () => {
    const ref = { current: null };
    render(
      <SynthesisView
        query=""
        setQuery={vi.fn()}
        messages={[
          { role: 'user', content: 'What did I promise last week?' },
          { role: 'assistant', content: 'You promised to send the quarterly report to John by Friday.' },
        ]}
        isStreaming={false}
        onSubmit={vi.fn()}
        messagesEndRef={ref}
        setView={vi.fn()}
        totalMemories={5000}
      />
    );

    expect(screen.getByText('What did I promise last week?')).toBeInTheDocument();
    // The assistant message is rendered via ReactMarkdown mock
    expect(screen.getByText('You promised to send the quarterly report to John by Friday.')).toBeInTheDocument();
  });

  it('fetches and renders alerts on mount', async () => {
    const ref = { current: null };
    render(
      <SynthesisView
        query=""
        setQuery={vi.fn()}
        messages={[]}
        isStreaming={false}
        onSubmit={vi.fn()}
        messagesEndRef={ref}
        setView={vi.fn()}
        totalMemories={5000}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unfulfilled Promise')).toBeInTheDocument();
    });
  });

  it('disables input and send button while streaming', () => {
    const ref = { current: null };
    render(
      <SynthesisView
        query="test"
        setQuery={vi.fn()}
        messages={[{ role: 'assistant', content: 'Thinking...', pending: true }]}
        isStreaming={true}
        onSubmit={vi.fn()}
        messagesEndRef={ref}
        setView={vi.fn()}
        totalMemories={5000}
      />
    );

    const textarea = screen.getByPlaceholderText('Ask a follow up...');
    expect(textarea).toBeDisabled();
  });

  it('calls onSubmit when Enter is pressed (non-shift)', () => {
    const ref = { current: null };
    const onSubmit = vi.fn();
    render(
      <SynthesisView
        query="my question"
        setQuery={vi.fn()}
        messages={[]}
        isStreaming={false}
        onSubmit={onSubmit}
        messagesEndRef={ref}
        setView={vi.fn()}
        totalMemories={5000}
      />
    );

    const textarea = screen.getByPlaceholderText('Ask me anything about your life...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalledWith('my question');
  });
});
