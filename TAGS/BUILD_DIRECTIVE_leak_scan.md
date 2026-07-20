# EYES — BUILD DIRECTIVE · REVENUE LEAK SCAN
**Owner:** Saravanan (acute + ingestion lane) · **Authored:** Founder Office · **Date:** 17 Jul 2026
**Deadline:** 5 working days from receipt · **Status:** LOCKED — scope questions go to §7 (cut list) before they go to the founder.

---

## §0 — Tuning constants (single source of truth; change here, nowhere else)

```
SCAN_WINDOW_DAYS        = 182      # mailbox lookback
SILENCE_THRESHOLD_DAYS  = 10       # min days of silence before a thread is leak-eligible
CONFIDENCE_GATE         = 0.80     # detection pass threshold; below gate = not flagged (consistent with Understanding API)
MAX_TEASER_RECEIPTS     = 3        # receipts shown in free preview
MAX_TEASER_LOCKED_ROWS  = 5        # blurred rows in preview
DEFAULT_DEAL_VALUE_EUR  = 7000     # fallback when client states no avg fee
MIN_THREAD_MSGS         = 2        # ignore single-message threads except UNANSWERED_INBOUND
BATCH_PAGE_SIZE         = 100      # Gmail API list pagination
MAX_MAILBOX_THREADS     = 20000    # hard stop; abort + report if exceeded
DELETE_AFTER_DAYS       = 7        # post-delivery data deletion (GDPR promise printed in report)
```

## §1 — Purpose (one paragraph)

Point the existing EYES spine at an external business mailbox and produce a paid deliverable in 48 hours. The pipeline ingests up to 182 days of Gmail history read-only, runs the detection pass against a four-relation **leak schema**, and renders two documents from one `report.json`: a free preview (counts, value, 3 receipts, locked rows) and a full €250 report (all leaks, all receipts, drafted recovery emails). Nothing analytical is manual. This is not a new product; it is the existing perception layer with a new schema and a report renderer.

## §2 — What already exists (reuse, do not rebuild)

OAuth Gmail connection and token handling — reuse as-is. Thread reconstruction — reuse. Detection pass (second model call per item) — reuse the harness; only the schema and prompt contract are new. Provenance/anchoring (every claim carries source record + span) — reuse; receipts in the report are this, rendered. pgvector EU Frankfurt storage — reuse; scan data lives in an isolated per-client namespace tagged with a `purge_at` timestamp.

## §3 — New build A: batch historical ingest

A one-shot backfill job, triggered internally by client email + window: page through `threads.list` (`newer_than:182d`, BATCH_PAGE_SIZE), fetch full threads, normalize to the existing record shape, tag every record with `scan_id`. Directionality matters and must be explicit per message: `outbound` (from client mailbox) vs `inbound`. Skip: spam/trash, newsletters and bulk senders (List-Unsubscribe header present), calendar machine mail. Abort cleanly with a count report if MAX_MAILBOX_THREADS is exceeded. Output: a `scan_manifest` (threads found, threads eligible, skipped + reason counts) logged before detection begins.

## §4 — New build B: the leak schema (detection pass contract)

Four relations. A thread is classified only if evidence clears CONFIDENCE_GATE; a thread can carry at most ONE primary leak type (priority order below resolves conflicts).

**OPEN_PROPOSAL** — an outbound message containing a proposal/quote/terms/pricing signal, followed by ≥ SILENCE_THRESHOLD_DAYS with no counterparty decision AND no outbound follow-up. Priority 1.
**DROPPED_COMMITMENT** — an outbound message containing a dated or datable promise ("by Friday", "this week", "I'll send…") with no evidence of delivery in any later message, past its implied date. Priority 2.
**GHOSTED_CLIENT** — an active multi-message exchange with a counterparty showing engagement (questions, "come back to you", scheduling) that ends without rejection, silent ≥ SILENCE_THRESHOLD_DAYS. Explicit rejection anywhere in thread = NOT a leak. Priority 3.
**UNANSWERED_INBOUND** — an inbound first-touch or warm referral requesting service, with zero outbound reply, ≥ 5 days old. Exempt from MIN_THREAD_MSGS. Priority 4.

**Required output fields per flagged thread (strict JSON, no prose):**
`scan_id, thread_id, leak_type, confidence, counterparty_name, counterparty_domain, last_activity_date, days_silent, evidence: {message_id, from, date, subject, quoted_line}, commitment_due_date (nullable), est_value_eur (nullable — filled by aggregator, not the model), recovery_angle (one sentence: the honest reopening line)`

The model NEVER invents quoted_line: it must be a verbatim substring of the source message or the record is dropped. Enforce with a post-pass substring check — a failed check decrements to below gate automatically.

## §5 — New build C: aggregation + report generation

Aggregator: dedupe by counterparty_domain (keep highest-value), assign `est_value_eur` = client-stated fee (or DEFAULT_DEAL_VALUE_EUR), rank by value × recency factor, compute summary stats (totals per type, total € at risk, oldest leak age, threads scanned). Emit one `report.json`.

Renderer: two HTML templates already exist in house style — `leak_scan_preview_teaser.html` and `leak_scan_report_full.html` (founder office, delivered with this directive). Bind `report.json` into them (simple server-side template pass; no framework), render to PDF via headless Chrome, A4. Recovery email drafts in the full report come from `recovery_angle` expanded by one templated model call per leak using the fixed drafting prompt in `/prompts/recovery_email.txt` (tone: honest, short, one question at the end, never grovel twice).

## §6 — Privacy rail (non-negotiable, printed in the report — so it mustbe true)

Read-only scopes only. All processing EU (Frankfurt); verify the pin, do not assume it. Per-scan namespace with `purge_at = delivery + DELETE_AFTER_DAYS`; a nightly job hard-deletes expired namespaces and logs the deletion. No scan data enters Layer 2, embeddings training, or any cross-client structure — Layer 1 is never mined. Access revocation by the client must orphan the pipeline gracefully mid-run (fail soft, notify, purge).

## §7 — Cut list (explicitly OUT of this directive; raising these = scope creep)

No self-serve onboarding or client-facing UI — trigger is internal. No Microsoft 365 / Graph connector — M365 clients go through manual export in the concierge phase. No continuous-monitoring automation — the €149/mo tier is a manual re-scan until 5 paid reports exist. No changes to the chronic lane, the gate process, or Chandra's workstreams. No new infrastructure, no new vendors, no queue systems. No multilingual report rendering — English only, French later.

## §8 — Acceptance gates (all four, in order — no partial GO)

1. **Dogfood run:** full pipeline against the founder's own mailbox completes end-to-end < 30 min, produces both PDFs, manifest numbers reconcile.
2. **Precision spot-check:** founder manually judges 20 flagged threads; ≥ 16/20 are real leaks (80%). Below that: tighten prompts/thresholds, re-run. No placeholder GO.
3. **Receipt integrity:** 100% of quoted_lines pass the verbatim substring check; every receipt in the PDF traces to a real message id.
4. **Purge proof:** create a test namespace, expire it, show the deletion log.

**Done looks like:** the founder can take any consenting business mailbox on a live call and have the preview on screen during that call, and the paid report in the client's inbox within 48 hours, with zero manual analysis — only manual sending.

**Hands off to →** the sales motion (founder-run) and, after 5 paid reports, the continuous-monitoring automation directive.
