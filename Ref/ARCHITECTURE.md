# LEAKSCAN — STANDALONE ARCHITECTURE
## The EYES Perception Module, shipped first as a product
**Owner:** Founder (personal repo) · **Built with:** Claude Code · **Status:** LOCKED for v1 — deviations require editing this file first
**Prime directive:** this codebase is simultaneously (1) a revenue product, (2) the reference implementation of EYES's future perception/detection module, and (3) legally clean-room. Every decision below serves all three.

---

## §0 — CLEAN-ROOM RULES (legal, non-negotiable)

1. New repository under the founder's personal GitHub. No Crescent Moon code is ever opened, copied, referenced, or pasted into any Claude Code session — not "for inspiration," not "to check how they did it."
2. Only inputs allowed: this document, the founder's own specification/directive documents, the leak schema, the report HTML templates (founder-authored), and public documentation.
3. Commit history is evidence of independent creation: small commits, honest messages, no bulk "initial commit" dumps of suspicious size.
4. Repo stays private; IP assigns to the SASU at incorporation via the founder-IP deed (already drafted).

## §1 — TUNING CONSTANTS (one module, imported everywhere: `packages/shared/src/config.ts`)

```ts
export const CONFIG = {
  SCAN_WINDOW_DAYS: 182,
  SILENCE_THRESHOLD_DAYS: 10,
  CONFIDENCE_GATE: 0.80,
  MIN_THREAD_MSGS: 2,            // UNANSWERED_INBOUND exempt
  MAX_MAILBOX_THREADS: 20_000,
  BATCH_PAGE_SIZE: 100,
  MAX_TEASER_RECEIPTS: 3,
  MAX_TEASER_LOCKED_ROWS: 5,
  DEFAULT_DEAL_VALUE_EUR: 7_000,
  DELETE_AFTER_DAYS: 7,
  PRICE_FULL_REPORT_EUR: 250,
  PRICE_MONITOR_MONTHLY_EUR: 149,
  LLM_MODEL: "claude-sonnet-4-6",   // pinned; recorded per detection
  LLM_MAX_THREAD_TOKENS: 6_000,     // thread digest truncation budget
} as const;
```

## §2 — THE CORE ABSTRACTION (why nothing gets rebuilt later)

The product is a pipeline of five pure stages behind ports:

```
MailSource → Normalizer → DetectionEngine(schema) → ReceiptVerifier → Aggregator → ReportModel
```

The **DetectionEngine takes a Schema as input data**. Leak detection is `detect(threads, LEAK_SCHEMA_V1)`. EYES later calls `detect(records, COMMITMENT_SCHEMA)` on the same engine. The engine knows nothing about "leaks" — it knows: relations, definitions, evidence requirements, confidence gates, priority resolution. This one decision is the merge path into EYES: the engine, receipt verifier, and schema format lift into the EYES monorepo untouched; only adapters get re-bound.

## §3 — REPOSITORY STRUCTURE (pnpm monorepo, TypeScript strict everywhere)

```
leakscan/
├── ARCHITECTURE.md              # this file
├── DECISIONS.md                 # append-only decision log (date, decision, why)
├── pnpm-workspace.yaml
├── .github/workflows/ci.yml     # lint → typecheck → test → deploy
├── apps/
│   ├── web/                     # Next.js 14 App Router (Vercel, region fra1)
│   │   ├── app/
│   │   │   ├── (marketing)/page.tsx          # one-page landing + payment link
│   │   │   ├── report/[token]/page.tsx       # magic-token report delivery page
│   │   │   ├── connect/[scanId]/page.tsx     # client OAuth consent entry
│   │   │   ├── ops/                          # operator console (founder-only allowlist)
│   │   │   │   ├── page.tsx                  # scans dashboard
│   │   │   │   └── scan/[id]/page.tsx        # manifest, detections, verify, deliver
│   │   │   └── api/
│   │   │       ├── oauth/google/route.ts     # OAuth callback → store tokens
│   │   │       ├── stripe/webhook/route.ts   # payment → unlock full report
│   │   │       └── scan/[id]/status/route.ts
│   └── worker/                  # long-running pipeline (Railway, EU region)
│       └── src/
│           ├── index.ts         # pg-boss consumer: jobs = ingest, detect, aggregate, render, purge
│           └── jobs/
├── packages/
│   ├── core/                    # ★ FUTURE EYES MODULE — zero framework/vendor imports
│   │   └── src/
│   │       ├── engine/          # DetectionEngine: schema-driven classification orchestration
│   │       ├── receipts/        # ReceiptVerifier: verbatim-substring proof (future Receipt Engine)
│   │       ├── valuation/       # est_value assignment, ranking (value × recency)
│   │       ├── report/          # ReportModel: report.json shape + summary stats
│   │       ├── ports.ts         # ALL interfaces (below)
│   │       └── types.ts         # Thread, Message, Detection, Evidence, Schema
│   ├── schemas/
│   │   └── src/leak.v1.ts       # LEAK_SCHEMA_V1 as typed data + zod validators
│   ├── adapters/
│   │   ├── ingest-mbox/         # Google Takeout / Outlook export parser  ← BUILD FIRST
│   │   ├── ingest-gmail/        # Gmail API batch ingest (OAuth offline, readonly)
│   │   ├── llm-claude/          # Classifier port impl: prompt files versioned in /prompts
│   │   ├── store-postgres/      # ScanStore impl (Supabase EU) + RLS + purge
│   │   ├── render-pdf/          # binds report.json → founder's HTML templates → PDF (playwright-chromium)
│   │   └── billing-stripe/      # payment links + webhook verification
│   └── shared/                  # config, logger, error types, crypto (token encryption)
└── prompts/
    ├── detect.leak.v1.md        # versioned; model id + prompt hash recorded per detection
    └── recovery_email.v1.md
```

## §4 — PORTS (interfaces in `core/src/ports.ts` — adapters may depend on core; core depends on nothing)

```ts
export interface MailSource {            // impls: MboxSource, GmailSource, (later) EyesRecordSource, OutlookSource
  manifest(windowDays: number): Promise<ScanManifest>;
  threads(windowDays: number): AsyncIterable<RawThread>;
}
export interface Classifier {            // impls: ClaudeClassifier, (later) MistralClassifier
  classify(thread: NormalizedThread, schema: DetectionSchema): Promise<CandidateDetection[]>;
}
export interface ScanStore {             // impl: PostgresScanStore
  saveThreads(scanId: string, t: NormalizedThread[]): Promise<void>;
  saveDetections(scanId: string, d: Detection[]): Promise<void>;
  purge(scanId: string): Promise<PurgeProof>;
  // ... narrow, intention-revealing methods only; no generic query passthrough
}
export interface ReportRenderer {        // impl: HtmlPdfRenderer
  render(model: ReportModel, tier: "preview" | "full"): Promise<Buffer>;
}
export interface PaymentProvider {       // impls: StripeProvider, ManualProvider (portage-bridge era)
  createCheckout(scanId: string, amountEur: number): Promise<{ url: string }>;
  verifyWebhook(payload: unknown, sig: string): PaymentEvent;
}
```

**ReceiptVerifier is a pure function, not a port** — `verify(detection, sourceMessages): VerifiedDetection | Rejection`. Rule: `evidence.quoted_line` must be a verbatim substring of the cited message body; failure auto-drops the detection below gate. This function is the embryo of EYES's Receipt Engine and must stay dependency-free.

## §5 — DATABASE SCHEMA (Supabase Postgres, EU-Frankfurt; RLS on; no pgvector in v1 — deliberately)

```sql
accounts(id uuid pk, email text unique, name text, created_at timestamptz)
mail_connections(id uuid pk, account_id fk, provider text, tokens_enc bytea, status text, created_at)
scans(id uuid pk, account_id fk, source_type text, window_days int, status text
      CHECK (status IN ('queued','ingesting','detecting','aggregating','rendering','delivered','purged')),
      stated_deal_value_eur int, counts jsonb, report_token text unique,  -- magic delivery token
      purge_at timestamptz, created_at, updated_at)
threads(id uuid pk, scan_id fk, provider_thread_id text, subject text, participants jsonb,
        first_msg_at timestamptz, last_msg_at timestamptz, outbound_count int, inbound_count int,
        skipped_reason text null)
messages(id uuid pk, thread_id fk, provider_msg_id text, from_addr text, to_addrs text[],
         sent_at timestamptz, direction text, body_text text, headers jsonb)   -- purged w/ scan
detections(id uuid pk, scan_id fk, thread_id fk, leak_type text, confidence numeric,
           evidence jsonb, verified bool, commitment_due_date date null,
           est_value_eur int, recovery_angle text, recovery_email text, rank int,
           model_id text, prompt_hash text)                                     -- provenance
reports(id uuid pk, scan_id fk, tier text, storage_path text, delivered_at timestamptz)
payments(id uuid pk, scan_id fk, provider text, provider_ref text, amount_eur int, status text, at timestamptz)
audit_log(id bigserial pk, scan_id fk null, event text, meta jsonb, at timestamptz default now())
```

Purge job (worker cron, nightly): hard-delete `messages`, `threads` bodies for scans past `purge_at`, write `audit_log(event='purged', meta=PurgeProof)`. The GDPR promise printed in the report must be provable from `audit_log` alone.

## §6 — AUTH MODEL (three distinct concerns, never conflated)

1. **Operator auth:** Supabase Auth, email allowlist = founder only. Gates `/ops`.
2. **Client mailbox authorization:** Google OAuth (`gmail.readonly`, offline). Consent regime: Workspace clients via admin whitelist (doesn't consume test-user quota), personal Gmail via test-user list (100 lifetime cap), M365/other via MBOX upload. Tokens encrypted at rest (app-level AES-GCM, key in platform secret store); revocation → pipeline fails soft, notifies, purges.
3. **Report access:** no client accounts in v1. Delivery = unguessable `report_token` URL + email. Accounts come with the €149 monitor tier, not before.

## §7 — BILLING

v1: Stripe Payment Link (€250) pasted in the call chat; webhook flips `payments.status` → full report renders + delivery email. **Pre-Kbis bridge:** `ManualProvider` — operator marks paid after portage invoice settles; same pipeline, zero code waste. €149/month: Stripe Billing subscription, activated only after 5 paid reports (per the standing cut list). All Stripe objects created with `metadata.scan_id` for reconciliation.

## §8 — DEPLOYMENT

Web → Vercel, functions pinned `fra1`. Worker → Railway (EU region), single always-on Node process running pg-boss against Supabase Postgres (no Redis, no new vendors). DB/storage → Supabase EU-Frankfurt (reports bucket private, signed URLs). CI → GitHub Actions: `pnpm lint && pnpm typecheck && pnpm test` gate, auto-deploy main. Secrets only in platform vaults; `.env.example` documents every variable. Playwright-chromium for PDF lives in the worker image (never in Vercel functions).

## §9 — CODING STANDARDS (enforced, not aspirational)

TypeScript strict; `any` forbidden (eslint error). zod validation at every boundary: adapter outputs, LLM responses, API inputs, env. ESLint `import/no-restricted-paths`: `packages/core` may not import from `adapters/`, `apps/`, or any vendor SDK — CI fails the build on violation (this rule IS the architecture). Every LLM call: versioned prompt file, recorded `model_id` + `prompt_hash` on the detection row. Errors: typed error classes, fail-soft in pipeline (a bad thread skips with `audit_log`, never aborts a scan). Tests: golden-set fixtures — 20 hand-written threads with expected detections; ReceiptVerifier property tests; schema zod round-trips. Conventional commits. `DECISIONS.md` appended before any structural change.

## §10 — BUILD SEQUENCE FOR CLAUDE CODE (dopamine-first; each stage ends runnable)

**Stage 1 — MBOX end-to-end (target: 2 days).** Scaffold monorepo → `ingest-mbox` → normalizer → `llm-claude` classifier with `leak.v1` schema → ReceiptVerifier → aggregator → `report.json` → console output. Prove it on the founder's own Takeout export. *No OAuth, no web, no Stripe — the analytical spine first.* This stage alone makes every demo deliverable (client sends Takeout → report in 48h).
**Stage 2 — Render (1 day).** Bind founder's two HTML templates to `report.json` → PDFs. Dogfood report generated.
**Stage 3 — Web + delivery (1-2 days).** Landing, `/report/[token]`, ops console minimal, delivery email (Resend or SMTP).
**Stage 4 — Gmail OAuth (1-2 days).** Consent flow, batch ingest with pagination + skip rules (bulk senders, calendar mail), live-call ingest path.
**Stage 5 — Billing + purge (1 day).** Stripe adapter + webhook + ManualProvider; nightly purge cron + PurgeProof.
**Acceptance = the four gates from the standing directive:** dogfood run <30 min; founder-judged precision ≥16/20 flagged threads; 100% receipts pass verbatim check; purge proof demonstrated. No placeholder GO.

## §11 — MERGE PATH INTO EYES (written now so future-you can't improvise)

At merge time: `packages/core`, `packages/schemas`, `adapters/llm-claude` move into the EYES monorepo as the **perception module** — unchanged. `store-postgres` is re-implemented against the EYES record store behind the same `ScanStore` port. `MailSource` gains an `EyesRecordSource` impl reading the platform's ingestion layer. The LeakScan web app survives as a product surface that reads the Understanding API. `LEAK_SCHEMA_V1` becomes one entry in the EYES schema registry alongside commitment/drift/contradiction schemas. Nothing is discarded; the module was the point all along.
