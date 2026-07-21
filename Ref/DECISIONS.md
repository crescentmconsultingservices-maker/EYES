# DECISIONS.md — append-only

Every entry: date · decision · why. Per ARCHITECTURE.md §9, this file is appended
**before** any structural change. Deviations from the LOCKED architecture are
recorded here rather than made silently.

---

## 2026-07-18 — Budget-driven deviations from ARCHITECTURE.md (v1 Stage 1)

Standing constraint: **€0 hard cap.** No new paid vendors until the first paid
report clears. Every deviation below trades a paid/heavy dependency for an
open-source or built-in one **without changing the module structure**, so the
§11 merge path into EYES survives intact.

| # | Architecture says | Built as | Why |
|---|---|---|---|
| 1 | pnpm monorepo, multi-package | **npm workspaces-free single package**, identical internal directory layout (`src/core`, `src/schemas`, `src/adapters`, `src/shared`) | pnpm is not installed on the build machine; multi-package TS project references cost setup time for zero Stage-1 benefit. Directory structure is preserved exactly, so lifting `src/core` + `src/schemas` into the EYES monorepo stays a folder move. Boundary rule enforced by `npm run check:boundaries` instead of eslint `import/no-restricted-paths`. |
| 2 | Supabase Postgres (EU-Frankfurt) | **JSON-on-disk** behind the same `ScanStore` port (`src/adapters/store-json`) | Stage 1 is a local console pipeline; there is no web app and no multi-user access yet. A hosted DB is a recurring cost with no Stage-1 function. Port is unchanged, so `store-postgres` drops in at Stage 3 with no core changes. |
| 3 | `render-pdf` via playwright-chromium | **pdfkit** (`src/adapters/render-pdf`) | Playwright pulls a ~300MB Chromium binary and needs a container to run in. pdfkit is pure JS, deterministic, already proven in `eyes-investigation-lab/server/src/report/pdfGenerator.ts` (founder's own code). Zero download, zero hosting. |
| 4 | Worker on Railway + pg-boss | **In-process sequential pipeline**, run from CLI | No queue is needed for a single-operator, one-scan-at-a-time workflow. pg-boss + Railway are Stage 4+ concerns. |
| 5 | Stripe Payment Link | **Deferred entirely** — `ManualProvider` only | Pre-Kbis. Architecture §7 already anticipates this bridge. No Stripe account, no code, no cost until report #1 is sold. |
| 6 | `LLM_MODEL: "claude-sonnet-4-6"` | **`claude-sonnet-5`** | `claude-sonnet-4-6` is superseded. `claude-sonnet-5` is the current Sonnet and is what `eyes-investigation-lab` already runs against the existing key. Model id is recorded per detection either way, so provenance is unaffected. |
| 7 | Vercel (fra1) web app | **Not built in Stage 1** | Per §10, Stage 1 is deliberately "no OAuth, no web, no Stripe — the analytical spine first." |

**Reused from the founder's own prior work** (clean-room safe — §0 permits the
founder's own specifications and code): the `structuredCall` tool_choice pattern
and the pdfkit report approach, both from `eyes-investigation-lab`. No Crescent
Moon code was opened, referenced, or consulted.

**New open-source dependency added:** `mailparser` (MIT). Rationale: real
Google Takeout / Outlook MBOX exports carry quoted-printable and base64
encodings, MIME multipart bodies, and mixed charsets. A hand-rolled parser would
silently corrupt bodies — and a corrupted body breaks the ReceiptVerifier's
verbatim-substring guarantee, which is the product's core promise. This is the
one place a dependency is load-bearing for correctness.

---

## 2026-07-18 — Stage 3 web surface: Express, not Next.js/Vercel

| Architecture says | Built as | Why |
|---|---|---|
| `apps/web` — Next.js 14 App Router on Vercel (fra1) | **Express + server-rendered HTML** (`apps/web/server.ts`, `src/adapters/render-html/`) | The report page is a *document*, not an application: no client state, no interactivity beyond a theme toggle and a language switch. Next.js would add a build step, a framework dependency and a hosting bill for zero function. `HtmlReportRenderer` implements the same `ReportRenderer` port as the PDF renderer, so swapping in Next.js later changes no core code. |

Pages are bilingual FR/EN via `?lang=`. French is the default because the
go-to-market is walking into agencies in Rennes.

---

## 2026-07-18 — Localisation completed: core emits data, adapters compose sentences

The half-French report had a root cause worth naming: **core was emitting prose.**
`valueBasis` and `recoveryBasis` were English sentences built inside the engine, so
no renderer could translate them without re-running the scan.

Fixed by making core emit **structure**:

```ts
type ValueBasis =
  | { kind: 'T1_STATED'; quote: string }
  | { kind: 'T2_COMPUTED'; quantity; unitPriceEur; unitHint; totalEur }
  | { kind: 'T3_BENCHMARK'; averageEur; industry }
  | { kind: 'T4_UNKNOWN' };
```

Sentences are composed at render time in `src/core/i18n.ts`. `LeakTypeDefinition.label`
and `.recoveryRationale`, `CategoryRollup.label` and the whole methodology block are
now `LocalizedText = Record<Lang, string>`, so a delivered `report.json` stays
self-contained **and** presentable in either language without regeneration.

**The rule, enforced and tested:**

> Everything that is **our explanation** is localized.
> Everything that is **their evidence** stays verbatim, untranslated, forever.

A translated receipt is not a receipt — the customer must be able to find those exact
characters in their own mailbox. Verified: `?lang=en` renders English chrome around
French quotes, unchanged. Three tests pin it, including one asserting the French
output never contains the English rationale.

`definition`, `requires` and `excludes` stay English on purpose — they are prompt
instructions for the classifier, never shown to a customer.

---

## 2026-07-18 — Report access is a capability, not an identifier

`ReportModel.reportToken` = `scan_` + 24 CSPRNG bytes (base64url), minted per scan
in the CLI and resolved through a `token → scanId` index in the store.

**The `/report/:scanId` route is deleted.** A scanId is a database key: it appears in
logs, ops URLs and audit records, so anything reachable by scanId is effectively
public. A customer's commercial correspondence sits behind a capability instead.
`loadReportByToken` shape-checks before touching disk, and malformed, unknown and
traversal inputs all return an identical 404 so there is nothing to enumerate.

Verified: old route 404, scanId-as-token 404, guessed token 404, path traversal 404,
valid token 200.

**Withheld amounts are not sent to the browser.** The preview previously blurred them
in CSS, which is a visual effect and not an access control.

---

## 2026-07-18 — Retention is enforced, not promised

`ReportModel.purgeAt` is computed at build time from `generatedAt +
DELETE_AFTER_DAYS`. The report prints that **date** — "supprimée le 25 juillet
2026", not "deleted after 7 days" — and `cli/purge.ts` reads the same field. The
promise and the mechanism cannot drift apart because they are one value.

- `npm run purge` — purge everything due, once
- `npm run purge -- --status` — **exits 1 when anything is overdue**, so it drives
  an alert instead of relying on someone remembering to look
- `npm run purge -- --daemon` — continuous, default 6h
- `npm run purge -- --scan <id>` — immediate erasure, bypasses the date, because a
  right-to-erasure request does not wait for a retention window

`purge()` is idempotent and returns the original proof on re-run: a retried or
overlapping cron run must not be able to rewrite the evidence that deletion
happened. The audit entry is written *before* the proof file, so a crash between
them still leaves the deletion recorded durably.

Reports written before `purgeAt` existed derive theirs from `generatedAt` rather
than being treated as instantly due — otherwise the first run would delete every
legacy scan on sight.

No scheduler dependency: `--daemon` is `setInterval`, and a failing tick logs and
retries rather than killing the process.

---

## 2026-07-18 — A path from priors to measurements

The base recovery rates are printed in every customer report as methodology,
which makes them public claims. They stay priors until real outcomes are recorded
against them, so the mechanism to do that now exists:

- `npm run outcome -- --list <token>` — findings and what has been recorded
- `npm run outcome -- --scan <id> --rank 1 --status recovered --amount 26000`
- `npm run calibrate` — observed vs predicted, per category and per decay band

Design choices worth not undoing:

1. **Compared against predicted probability, not the raw base rate.** The
   prediction already includes decay, so a cohort of old threads is not scored
   against a base rate that assumed they were fresh.
2. **No recommendation below `MIN_SAMPLES = 20` resolved outcomes.** Re-tuning a
   published rate on eight data points replaces a defensible guess with an
   indefensible one that merely looks empirical. Verified by test: 19 outcomes all
   recovered still yields `INSUFFICIENT_DATA`.
3. **A prior is left alone while the rate it predicts sits inside the observed
   Wilson interval.** Only a clear miss justifies moving a number customers have
   already been shown.
4. **`pending` is excluded entirely** — not evidence in either direction.
5. **Decay bands are calibrated separately.** If every leak type misses in the
   same direction within one silence band, the decay multiplier is wrong, not
   four independent base rates.
6. **Outcomes are append-only JSONL.** A correction is a new line, never an edit.
   Calibration that can be silently rewritten is not evidence of anything.

`calibrate` never edits the schema. Changing a rate is a manual edit plus a
DECISIONS.md entry, because a rate that moves silently between two customer
reports is exactly what destroys the credibility this product sells.

---

## 2026-07-18 — Stripe deliberately deferred

Confirmed with the founder: for early customers the flow is
generate → invoice → receive payment → unlock manually. Payment integration before
proven demand is the classic pre-launch time sink. `ManualProvider` per §7; the
unlock button stays a placeholder until report #1 is actually sold.

---

## 2026-07-18 — Valuation methodology defined (fills the gap in §2)

ARCHITECTURE.md specified `est_value_eur` on the detection row but never defined
how it is derived. Undefined valuation is the single biggest credibility risk in
the product ("how did you calculate that?"), so the method is now specified in
`src/core/valuation/` and is authoritative.

**Three quantities, kept strictly separate. They are never multiplied together
into one figure:**

1. **Detection confidence** — "is this really a ghosted proposal?" Gates
   *inclusion only* at `CONFIDENCE_GATE = 0.80`. Never enters the euro figure.
2. **Value tier** — "how sure are we of the € amount?" Evidence ladder T1–T4.
3. **Recovery probability** — "how likely is this actually recoverable?" The
   only multiplier applied to money.

```
recoverable = grossValueEur(tier) × recoveryProbability(leakType, daysSilent)
```

**Two headline numbers are reported, and the large one never makes a promise:**

- **Gross at risk** = sum of receipt-verified deal values in threads that went
  cold. This is a *fact about the mailbox*, not a claim of recovery. It is the
  emotional hook precisely because it promises nothing.
- **Recoverable (risk-adjusted)** = the sum after recovery probability. This is
  the defensible estimate and is always displayed directly beneath the gross.

T4 (value unknown) detections are surfaced and counted as opportunities but
**excluded from both euro totals** — never padded with a default value.
`DEFAULT_DEAL_VALUE_EUR` is therefore used only for optional
what-if display, never for the headline.
