# Comprehensive Architectural Deep Analysis: The EYES Neural Memory OS

**Date:** September 2, 2026  
**Version:** 2.0 (Full System In-Depth Code & Infrastructure Audit)  
**System Name:** The EYES (Everything You Ever Said) — Neural Memory OS  
**Classification:** Technical Architecture & System Audit  

---

## 1. Executive Summary & Core Mission

**The EYES** is an enterprise-grade Neural Memory OS designed to ingest, index, structure, and query personal and organizational digital footprints across connected communication, development, and productivity tools (Gmail, Slack, GitHub, Google Calendar, Linear, Notion, Discord). 

By transforming unstructured raw events into a dual-layer cognitive store—a **Vector Search Index** for instant semantic retrieval and a **Bitemporal Knowledge Graph** for entity-relationship and commitment tracking—The EYES provides:
1. **Conversational Digital Memory Retrieval**: Sub-second hybrid search (Cosine Vector + Full-Text Search) with receipt verification.
2. **Autonomous Action Bridge**: Proactive extraction of implied promises and action items into a managed Action Queue for direct tool execution (Linear tickets, Slack replies, Google Calendar events, Resend emails).
3. **Commitment & Reputation Auditing**: Longitudinal diligence analysis assessing follow-through, delay loops, and behavioral reliability.
4. **GDPR/CCPA Privacy Shield & Multi-Tenancy**: Granular exclusion rules, PII regular-expression masking, tenant-isolated Row-Level Security (RLS), and a single-click transactional Kill Switch.

```mermaid
graph TD
    subgraph Data Ingestion & Perception Layer
        A[Gmail / Slack / GitHub / Calendar] -->|OAuth & Cursor Sync| B[/api/sync Routes & Inngest Workers]
        B --> C{Privacy Shield & Exclusions}
        C -->|Excluded Senders / Channels| D[Dropped / Masked]
        C -->|Valid Content| E[PII Regex Masking & Risk Scorer]
        E --> F[(Supabase memories Table)]
    end

    subgraph Neural Index & Graph Engine
        F -->|1024-dim Vector Ingestion| G[pgvector HNSW Cosine Index]
        F -->|Speech-Act Candidate Filter| H[FastAPI Chronic Engine]
        H -->|GLiNER / LiteLLM Extraction| I[(chronic_nodes & chronic_edges)]
        I -->|Nightly Leiden Batch Engine| J[cognitive_clusters / Brain Clusters]
    end

    subgraph Interface & Action Infrastructure
        F & I --> K[IRIS Understanding API / Chat UI]
        F & I --> L[Model Context Protocol MCP Server]
        H --> M[Action Queue Bridge]
        M -->|Human-in-the-Loop Approval| N[Linear / Slack / Google Calendar / Resend]
    end
```

---

## 2. Technical Stack Breakdown

| Layer | Technology / Framework | Primary Purpose |
| :--- | :--- | :--- |
| **Frontend Shell** | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4, Framer Motion, Lenis, @xyflow/react | Responsive high-performance UI dashboard, 2D/3D Force Knowledge Graph, IRIS chat console |
| **Database & Search** | Supabase PostgreSQL, pgvector (HNSW Indexing), FTS (`tsvector`), Row-Level Security (RLS) | Unified `memories` table, hybrid vector-keyword RPC, multi-tenant B2B isolation |
| **AI Gateway Routing** | LiteLLM AI Gateway Proxy, Gemini REST (`text-embedding-004`), Voyage AI, OpenRouter, Groq | Standardized model capability aliases (`auto-chat`, `auto-extract`, `auto-classify`, `auto-embed`) |
| **Chronic Graph Engine** | Python 3.11, FastAPI, Uvicorn, NetworkX, `cdlib` / `leidenalg` (Louvain fallback), Modal GLiNER | Speech-act relationship extraction, Leiden community detection, bitemporal edge invalidation |
| **Background Processing** | Inngest, Upstash QStash, Vercel Cron, Local Cron Daemon (`local-cron-daemon.mjs`) | Unattended platform sync, retry queues, dead-letter monitoring, decay cycles |
| **Protocol Integration** | Model Context Protocol (MCP) SDK (`@modelcontextprotocol/sdk`) | Stdio transport bridging local AI clients (Claude Desktop) with personal memory tools |

---

## 3. Comprehensive Codebase Subsystem Audit

### A. Ingestion & Perception Engine (`/api/sync/*`, `/src/utils/sync`)
- **Multi-Source Connectors**: Dedicated handlers for Gmail, Slack, GitHub, Google Calendar, and Notion. Sync states are persisted in `sync_status` with incremental timestamp/ID cursors.
- **Data Lifecycle & Token Security**: Connected tokens are encrypted using AES-256 (`TOKEN_ENCRYPTION_KEY`) in the `oauth_tokens` table. Refresh routines log status and HTTP codes to `oauth_refresh_logs`.
- **Throttling & Backoff**: Standardized sleep cycles (800ms delays on Google API pagination) prevent rate-limit hits (429), while failed jobs enqueue into `sync_retry_queue` with exponential backoff before landing in `sync_retry_dead_letters`.

### B. Privacy Shield & GDPR Architecture (`src/utils/privacy/filter.ts`, Migration `039`, `083`)
- **Exclusion Engine**: Senders, channels, repos, and Discord servers added to `privacy_excludes` are filtered prior to vector embedding generation.
- **PII Stripping**: Runtime regular-expression masking (`maskPII`) strips credit card numbers, SSNs, phone numbers, and API tokens from evidence blocks.
- **Data Sovereignty Kill Switch**: User-initiated account deletion invokes a cascading delete across `memories`, `oauth_tokens`, `chronic_nodes`, `chronic_edges`, `action_queue`, and `query_behavior`.

### C. Supabase Hybrid Vector & Multi-Tenant Search (`030_fix_hybrid_search_768.sql`, `20260831_add_organizations_schema.sql`)
- **Unified Schema**: `memories` table stores normalized content, `user_id`, `organization_id`, `scope` (`personal` vs `organizational`), and `embedding` (`vector(1024)`).
- **Hybrid Search Engine (`hybrid_search` RPC)**:
  $$\text{Combined Score} = (0.7 \times \text{Cosine Similarity}) + (0.3 \times \text{FTS Rank})$$
- **Multi-Tenant RLS Policies**: Individual users access only `user_id = auth.uid()`. Organization admins/owners access `scope = 'organizational'` records tied to their shared `organization_id`.

### D. Python Chronic Layer Engine & Leiden Clustering (`src/engine/main.py`, `batch_leiden.py`)
- **Speech-Act Candidate Filtering**: Uses optimized regex patterns (commitments, delays, decisions) to filter text before routing to LiteLLM, reducing LLM costs by ~70–80%.
- **Leiden Community Detection**: Nightly NetworkX and `cdlib` clustering algorithms analyze active graph edges (`valid_to IS NULL`) per user to discover dense cognitive node clusters, writing directly to `cognitive_clusters`.
- **Bitemporal Invalidation**: Relationships track `valid_from` and `valid_to`. When new conflicting evidence arises, old edges are soft-invalidated by populating `valid_to`.

### E. Action Command Bridge (`ActionQueueView.tsx`, `/api/actions/*`, `mcp-server.ts`)
- **Automated Workflow Parsing**: Directives and action items extracted during ingestion build `action_queue` records with confidence scores.
- **Human-in-the-Loop Execution**: Supports execution of:
  - `EMAIL_REPLY`: Transmits formatted email via Gmail API or Resend.
  - `LINEAR_TICKET`: Creates structured tickets in specified Linear teams (`LINEAR_DEFAULT_TEAM_ID`).
  - `CALENDAR`: Schedules Google Calendar events.
  - `SLACK_REPLY`: Threads replies to original Slack channels.
- **Audit Tracking**: Executed actions are logged to `action_sent_log` to maintain historical traceability.

### F. Model Context Protocol (MCP) Server (`src/mcp-server.ts`)
- **Protocol Server**: Implements `@modelcontextprotocol/sdk` over stdio transport.
- **Exposed Tools**:
  1. `search_memories`: 1024-dim hybrid memory lookup.
  2. `manage_calendar_event`: Google Calendar CRUD.
  3. `get_recent_commitments`: Filtered commitment list.
  4. `get_recent_memories`: Platform-filtered recent feed.
  5. `get_pending_actions`: Inspect Action Queue.
  6. `approve_action`: Execute queued action with optional title/reply overwrites.

---

## 4. Test Suite Audit & Verification

As of September 2, 2026, the complete test suite was executed and verified:

```
Test Files  26 passed (26)
     Tests  160 passed (160)
  Duration  11.19s
```

### Verified Test Domains:
- **API Endpoints**: `actions-execute.test.ts`, `ai-readiness.test.ts`, `connector-settings.test.ts`, `cron-sync-retry.test.ts`, `cron-sync-escalation.test.ts`, `memory-chat.test.ts`, `pdf-route.test.ts`, `topic-clusters.test.ts`, `account-data.test.ts`.
- **End-to-End Pipeline**: `pipeline-e2e.test.ts` (sync -> embedding -> hybrid search -> chat retrieval).
- **Core Algorithms**: `scorer.test.ts`, `scorer.edge.test.ts` (Risk scoring edge cases), `pipeline-helpers.test.ts` (60-record audit selection logic).
- **UI Components**: `MainContent.test.tsx`, `ActionQueueView.helpers.test.ts`.

---

## 5. Identified Technical Debt & Bottlenecks

1. **Cron Hop via External HTTP (`runPlatformSyncViaHttp`)**:
   - *Issue*: `/api/cron/sync` calls child sync routes over HTTP loops, incurring Vercel edge runtime connection overhead and 10s serverless timeout risk on Vercel Hobby plans.
   - *Fix*: Complete the `runPlatformSyncDirect` function to execute sync jobs directly in-process without network hops.
2. **Leiden Clustering Memory Consumption**:
   - *Issue*: `batch_leiden.py` loads all active edges into an in-memory NetworkX graph per user execution.
   - *Fix*: Introduce chunked streaming edge reads for power users with $>10,000$ active edges.
3. **Embedding Vector Alignment Risk**:
   - *Issue*: Statically set at 1024 dimensions (`vector(1024)`). Changing providers (e.g., to 1536-dim OpenAI or 3072-dim Gemini) will crash pgvector queries unless migrations run.
   - *Fix*: Maintain strict model alias enforcement (`auto-embed` -> 1024d Voyage/Gemini) and guard RPC params.

---

## 6. Strategic Scaling Roadmap

### Phase 1: Developer Beta (Current State)
- Fully functional single-user and early multi-tenant B2B testing.
- Complete 26-suite unit test coverage.
- Integrated MCP server for local Claude Desktop connectivity.

### Phase 2: 100-User Production Deployment
- **Infrastructure Upgrade**: Upgrade Vercel to Pro ($20/mo) for 60s function timeouts; upgrade Supabase to Pro ($25/mo) for dedicated pgvector compute.
- **Async Execution**: Route all platform sync operations through Inngest or Upstash QStash workers rather than synchronous cron endpoints.

### Phase 3: Enterprise Neural Mesh
- **Cross-Organization Graph Synthesis**: Enable multi-user organizational knowledge graph aggregation while preserving role-based RLS visibility controls.
- **Proactive Agentic Intelligence**: Allow IRIS to propose background workflow automations with adaptive confidence thresholds.
