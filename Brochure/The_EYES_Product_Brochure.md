![Crescent Moon Consulting Services Logo](./crescent_moon_logo.png)

# THE EYES (Everything You Ever Said)
## The Neural Memory OS & Reputation Auditing Pipeline
*Confidential Product Brochure — Version 2.0 (Production-Ready Release)*

**Live Platform**: [eyes-app-sigma.vercel.app](https://eyes-app-sigma.vercel.app/)

---

## 1. Executive System Summary

**The EYES** is a privacy-first, enterprise-grade AI-powered **Everything You Ever Said** designed to ingest, index, and analyze personal digital footprint telemetry across connected productivity, development, and social platforms. By unifying communication logs into a bi-temporal knowledge graph and a privacy-guarded semantic index, the platform provides two core pillars:

1. **Conversational Digital Memory Retrieval (Acute Chat AI)**: Seamless, near-instant semantic lookup across all connected platforms (Gmail, Slack, GitHub, Notion, Discord, Dropbox) via a natural language chat interface with strict citation anchoring.
2. **Commitment & Reputation Auditing (Chronic Intelligence)**: Diligence-grade diagnostics that assess personal and professional reliability, trace follow-through on verbal/written promises, and highlight destructive behavioral stress loops.

```mermaid
graph TD
    subgraph Data Ingestion & Sync
        A[Gmail / Slack / GitHub Connectors] -->|OAuth Tokens / Sync cursor| B[Platform Sync Route]
        B -->|Check Ingestion Lock| C{Active Audit?}
        C -->|Yes: Paused| D[Sync Blocked]
        C -->|No| E[Apply Privacy Exclusions]
        E -->|Drop Excluded Senders| F[Extract Content / PII / Risk Scorer]
        F -->|Upsert Raw events| G[(memories Table)]
        G -->|Trigger| H[Action Queue / Resend Notifications]
    end

    subgraph Retrieval & AI Gateway
        I[User Turn / Chat Route] -->|Conversational Core| J[Retrieval Planner]
        J -->|Generate Intents| K[LiteLLM AI Gateway]
        K -->|Fallback Pathway| L[Groq / OpenRouter / Gemini REST]
        K -->|Embeddings| M[Voyage AI / Gemini REST]
        M -->|1024-dim Vector| N[(memories Table Vector Search)]
        N -->|Hybrid Search Cosine + FTS| O[Evidence Block]
        O -->|System Prompt Persona| P[Grounded Response]
        P -->|Telemetrics| Q[(query_behavior Table)]
    end

    subgraph Reputation Auditing
        R[Audit Trigger] -->|AuditAnalysisService| S[Smart Selection & Sampling]
        S -->|Limit to 60 high-signal records| T[Batched Extraction]
        T -->|Verbatim promises| U[Commitment Ledger]
        U -->|Reconciliation| V{Calendar overlapping keywords & date window}
        V -->|Verify| W[Resolved Commitments]
        W -->|Score & Consistency Check| X[Finalized Audit Record]
        X -->|Write Report| Y[(reputation_audits Table)]
    end
```

---

## 2. Core Pillars & Product Capabilities

### A. Conversational Memory Retrieval (Acute Chat AI)
The Conversational Core allows users to query their historical footprint in plain language (e.g., *"What did I promise to send Sai regarding the project scope on Slack three weeks ago?"*).
* **Hybrid Search Engine**: Combines semantic vector similarity and keyword search inside a single PostgreSQL query.
  * **Semantic Cosine Score (Weight: 0.7)**: Retrieves matches based on conceptual meaning.
  * **FTS Keyword Rank (Weight: 0.3)**: Matches exact names, dates, or search terms using PostgreSQL `ts_rank_cd`.
  * **Result**: Highly accurate retrieval that matches the user's intent even if they do not remember the exact phrasing.
* **Citation Anchoring (The Trust Moat)**: Instead of summarizing text blindly, every response is backed by a clickable citation that links directly to the original external resource (e.g., the actual Gmail thread, GitHub commit, or Slack message link), ensuring zero AI hallucination.
* **Graph-Injected System Prompt**: The system injects the top 30 live nodes from the user's personal knowledge graph and narrative identity directly into the AI’s system prompt. The chat response is fully aware of the user's historical context, active projects, and past behaviors.

### B. Reputation Audit & Commitment Ledger (Chronic Layer)
The EYES tracks reliability and commitment follow-through by translating unstructured communications into a chronological, queryable ledger.
* **Smart Record Sampling**: Out of thousands of raw logs, the engine identifies exactly **60 high-signal records** using a combination of keyword pre-filters (detecting deadlines, agreements, and deliverables), chronological recency (last 30 days), connector variety, and historical baseline samples.
* **High-Speed Parallel Analysis**: Splitting the selected records into concurrent batches of 20 ensures the reputation audit runs in **under 5 seconds** (staying safely within standard 60-second serverless execution limits) and isolating any individual connector failures.
* **Moat Edge Mapping**: Tracks three primary relational edge types between entities:
  * `commitment`: Verbatim promises or deliverables scheduled for a target date.
  * `delayed_on`: Commitments that missed their target window or experienced blockers.
  * `decided_against`: Stalled paths, cancelled commitments, or explicit pivots.
* **Calendar Reconciliation**: The engine automatically cross-references commitments with Google Calendar events. A commitment is resolved as `completed` if a calendar event shares overlapping keywords and occurs within $\pm$ 7 days of the target date. If no calendar record is found, the commitment is flagged as `pending`.
* **The Executive Dossier PDF**: Streams a polished 9-page executive PDF report to the client on-demand, containing risk score trajectories, PII exposure warnings, opportunity priority matrices, and compliance logs.

### C. Seeded Pattern Library (Life-Shape Detection)
The EYES contains a specialized **Signal Detection Engine** that scans the knowledge graph for cyclical psychological and operational behavioral loops. It maps users to **15 Seeded Life-Shapes**:

| Pattern ID | Pattern Name | Behavioral Profile & Signal Trigger |
| :--- | :--- | :--- |
| `builder-loop` | **The Builder's Loop** | High initial execution $\rightarrow$ deep research spike $\rightarrow$ project stall $\rightarrow$ start new project. |
| `perfectionist-hold` | **The Perfectionist Hold** | Constant delays on deliverables due to continuous rewriting or scope refinement. |
| `avoidance-research` | **Avoidance-via-Research** | Delaying execution on key deliverables by prioritizing academic or tertiary research. |
| `execute-others` | **Executes for Others** | Meeting external commitments with 100% reliability while consistently delaying personal goals. |
| `hyper-promise` | **The Hyper-Promiser** | Over-committing in public channels followed by private rescheduling or delayed deliveries. |
| `stealth-operator` | **The Stealth Operator** | High execution rates with low public communication footprint; relies on commits and direct files. |
| `cycle-divergent` | **Cycle Divergence** | Divergent opinions across channels (e.g., optimistic on Slack, highly critical on GitHub commits). |
| `stress-loop` | **Stress-Induced Isolation** | Drop in outgoing communication volume combined with a spike in unresolved private reminders. |

---

## 3. Security, Privacy & Data Sovereignty

Because The EYES processes sensitive communications, security and privacy are built directly into the database schema and application runtime:

* **Active Ingestion Lock**: To guarantee snapshot integrity, database mutations and ingestion runs are temporarily paused while a user is actively generating a reputation audit.
* **Unified Privacy Shield**: A centralized `privacy_excludes` database table allows users to specify exclusions at the connector and item level. Emails from blocked domains or channels are dropped before reaching the database, preventing indexing entirely.
* **PII Masking**: Incoming queries and retrieved evidence blocks are dynamically parsed through regular-expression-based masking, stripping credit cards, SSNs, and passwords, replacing them with `[MASKED_PII]` tokens before transmitting data to the AI model.
* **The GDPR Kill Switch**: Users retain absolute sovereignty over their data. Triggering the **Kill Switch** inside settings triggers a cascading transactional delete that permanently purges:
  1. All OAuth credentials, access keys, and profile records.
  2. All indexed memory logs, historical conversations, and query telemetry.
  3. All generated vector embeddings and HNSW neural index blocks.
  *This operation runs directly on database disks and is completely non-reversible.*
* **Enterprise AI Zero-Retention**: All Large Language Model (LLM) communications route through enterprise API endpoints. Under strict agreements, customer data is never retained by third-party AI providers and is never used to train public generative models.
* **Row-Level Security (RLS)**: Enforced across all 48+ database tables, ensuring that users can only view, edit, or delete their own data under explicit `auth.uid() = user_id` policies.

---

## 4. Technical Architecture

The EYES is built on a high-performance modern web stack designed to run locally or at scale with minimal operational latency and zero cost overhead during development:

```
[ Gmail / Slack / GitHub / Notion ]  <-- (OAuth 2.0 / API Sync)
                │
                ▼
      [ Next.js 16 Website ]  <───> [ Supabase PostgreSQL ] (RLS Protected)
                │                       ├── memories Table (Unified Data)
                │                       ├── HNSW Vector Index (1024-dim)
                │                       └── sync_retry_queue (Cron Engine)
                ▼
     [ Local Python Engine ] (FastAPI / localhost:8000)
                │
                ├── GLiNER2 Multitask Model (1.5GB RAM - zero-token relationship mapper)
                └── batch_leiden.py (Leiden community clustering)
```

* **Core Stack**: Next.js 16 (App Router), React 19, TypeScript 5, Supabase PostgreSQL, and Python FastAPI.
* **Zero-Cost Local Extraction Engine (GLiNER2)**: Core entity and relationship mapping are processed by the state-of-the-art `knowledgator/gliner-multitask-large-v0.5` model loaded directly in RAM inside a local FastAPI service. This bypasses expensive LLM API calls, slashes extraction costs to absolute zero, and reduces latency from seconds to milliseconds.
* **Unified AI Gateway Routing (LiteLLM)**: All external AI operations are routed through a single abstraction using capability-based aliases:
  * `auto-chat` (Conversational core interaction)
  * `auto-extract` (Entity and commitment mapping fallback)
  * `auto-classify` (Intent mapping and profiling)
  * `auto-embed` (1024-dimensional vector embeddings, aligned with PostgreSQL)
* **Circuit Breakers & Fallbacks**: If the primary AI gateway experiences latency or failures, the system implements a 5-minute per-endpoint cooldown and falls back along a robust path: **LiteLLM Gateway $\rightarrow$ Groq $\rightarrow$ OpenRouter $\rightarrow$ Gemini REST**.
* **1024-Dimension HNSW Indexing**: Uses a cosine-distance hierarchical navigable small world (HNSW) index (`vector_cosine_ops`) optimized for Gemini `text-embedding-004` or Voyage AI vectors.

---

## 5. Scaling Roadmap & Operating Costs

The EYES is transition-ready from developer beta to a 100-user production deployment:

### Infrastructure Metrics Comparison

| Metric | Phase 1 (Developer Beta) | Phase 2 (100-User Production) | Required Upgrades |
| :--- | :--- | :--- | :--- |
| **Max Concurrent Users** | 1–3 users | 100 users | Paid provider subscriptions |
| **Sync Capacity** | 10 Users / Daily | 100 Users / Daily | Cron concurrency & plan upgrades |
| **Serverless Timeout** | 10s (Vercel Free) | 60s (Vercel Pro) | Vercel Pro Plan ($20/mo) |
| **Database Tier** | Free tier (Supabase) | Pro tier (Supabase) | Supabase Pro ($25/mo) |
| **AI API Limits** | Shared Free Keys (15 RPM) | Paid Accounts (2,000+ RPM) | Enabled billing on Google AI & OpenRouter |
| **Embeddings Key** | Free tier (Cohere/Gemini) | Production key | Move to production endpoint credits |

### Fixed & Variable Costs Analysis (100 Users)

1. **Fixed Infrastructure Costs ($45.00/mo)**:
   * **Vercel Pro ($20.00/mo)**: Increases serverless timeouts to 60s, allowing long platform syncs to run without interruption.
   * **Supabase Pro ($25.00/mo)**: Enables vector database index maintenance, daily backups, and connection pooling.
2. **Variable AI Costs (~$1.95 - $3.45 per active user/mo)**:
   * **Chat Reasoning**: ~$1.00 - $2.50 per user/mo (assuming ~500 chat queries monthly).
   * **Embeddings Generation**: ~$0.20 - $0.50 per user/mo (assuming up to 10k synced records monthly).
3. **Cost-Reduction Design**: Setting the primary chat preference to `gemini` and utilizing the `gemini-2.0-flash` model reduces variable token costs by nearly 60% with negligible impact on retrieval accuracy.

### Engineered Performance Optimizations
* **Batch Retry Fetching**: Fetches up to 100 due retries from `sync_retry_queue` in a single query rather than polling individually, reducing database cycles by 99%.
* **Stale-While-Revalidate Caching**: Caches the dashboard bootstrap profile for 30s with a 5-minute stale revalidation window, reducing the initial load database burden by 90%.
* **Connection Pooling**: Restricts concurrent cron jobs via `CRON_USER_CONCURRENCY` and pools database connections up to 20 to protect PostgreSQL against connection exhaustion during high-concurrency sync runs.

---

## 6. Compliance & Accessibility

* **GDPR Conformity**: Supports "Right to be Forgotten" via cascading database purges on deletion, ensuring absolute deletion of vector data, backups, and authorization tokens.
* **CCPA (California Notice at Collection)**: Full disclosures of data categories collected, strict zero-sale policies on personal records, and direct controls to limit processing of sensitive personal information.
* **Web Accessibility (WCAG 2.1 Level AA)**: 
  * Full keyboard navigability (focusable rings on all menus, tabs, and chat inputs).
  * High contrast ratios (minimum 4.5:1 text-to-background contrast).
  * Reduced motion configuration (automatically turns off loading animations, scanner lines, and boot terminals if system-level reduced motion is active).

---
*To explore the platform live, visit [eyes-app-sigma.vercel.app](https://eyes-app-sigma.vercel.app/). For questions, inquiries, or enterprise pilot onboarding, contact the product team at **info@the-eyes.com**.*
