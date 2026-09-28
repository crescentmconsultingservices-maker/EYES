# EYES (Everything You Ever Said)

EYES is an advanced, AI-powered digital memory and cognitive assistant. It securely ingests and indexes your personal data from 14+ connected platforms, extracts actionable insights (commitments, tasks, and requests), and provides a unified interface to investigate and act on your digital life.

## Core Features

- **Omnichannel Sync:** Continuous, background synchronization across 14+ platforms (Gmail, Slack, Meta, Google Meet, Notion, GitHub, Linear, Canva, Stripe, Spotify, Discord, Reddit, Twitter, etc.).
- **Real-Time Webhooks:** Secure, authenticated webhook receivers (OIDC JWTs, HMAC-SHA256 signatures) for instant processing of incoming messages from Slack, Gmail, and Meta.
- **Cognitive Engine:** Powered by an OpenAI-compatible LiteLLM gateway (Anthropic Claude 3.5 Sonnet) and Python FastAPI microservices to extract entities, summarize long contexts, and generate temporal drift analytics.
- **Action Queue & Inngest:** Background task processing for asynchronous AI extraction, remediation, and alerting.
- **Universal Investigate UI:** A rich Next.js dashboard featuring timeline stats, memory feeds, topic clusters, and a chat interface to converse directly with your personal memory graph.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, TailwindCSS
- **Database & Auth:** Supabase (PostgreSQL, pgvector for embeddings, Row-Level Security)
- **Task Orchestration:** QStash (Crons), Inngest (Background Actions)
- **AI/ML:** LiteLLM Gateway, text-embedding-3-small

## Environment Setup

Ensure the following critical environment variables are set in your `.env.local` or Vercel dashboard:

### Database & Auth
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Used for background syncs)

### Security & Webhooks
- `TOKEN_ENCRYPTION_KEY` (Used to encrypt OAuth tokens at rest)
- `GMAIL_PUSH_AUDIENCE` & `GMAIL_PUSH_SERVICE_ACCOUNT` (Pub/Sub auth)
- `SLACK_SIGNING_SECRET`
- `META_APP_SECRET`

### Platform Integrations
- Set standard `CLIENT_ID` and `CLIENT_SECRET` pairs for each supported platform (e.g., `LINEAR_CLIENT_ID`, `GOOGLE_CLIENT_ID`, etc.).

### AI Gateway
- `GROQ_BASE_URL` (e.g., `https://eyes-llm-gateway.fly.dev/v1`)
- `GROQ_API_KEY`

## Architecture & Background Jobs

- **Cron Jobs (QStash):** The 30-minute sync loop (`/api/cron/sync`) runs via Upstash QStash, not standard Vercel Crons. Vercel Crons are limited to daily maintenance tasks (`chronic` and `purge-leak-scans`).
- **Data Pipeline:** The AI pipeline (`analysis-pipeline.ts`) continuously monitors the `raw_events` table for new entries, embeds them into the `vector(1536)` space, and pushes them to the cognitive clusters.

## Running Locally

```bash
# Install dependencies
npm install

# Start both Next.js and the local Python FastAPI engine concurrently
npm run dev:all
```
Open <http://localhost:3003> to view the app.

