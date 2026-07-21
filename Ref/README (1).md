# LeakScan

Finds commercial opportunities that went cold in a business mailbox, puts a
defensible euro figure on them, and proves every claim with a verbatim receipt.

Stage 1 of `ARCHITECTURE.md`: the analytical spine, end to end, offline.

```
MBOX → Normalizer → DetectionEngine(LEAK_SCHEMA_V1) → ReceiptVerifier → Valuation → ReportModel → PDF
```

## Run it

```bash
npm install
npm run make-fixture          # writes fixtures/demo.mbox + prints golden expectations
npm run demo                  # offline, deterministic, zero API spend
npm test                      # 14 regression tests
```

Against a real mailbox:

```bash
npm run scan -- --mbox ~/Downloads/export.mbox \
                --industry staffing --avg-deal 12000 --pdf
```

| Flag | Meaning |
|---|---|
| `--mbox <file>` | Google Takeout / Outlook / Thunderbird export |
| `--industry <name>` | Context for T3 benchmark valuation |
| `--avg-deal <eur>` | Average deal value — the one thing the mailbox cannot know |
| `--window <days>` | Scan window (default 182) |
| `--owner-domain <d>` | Override inferred owner domain (repeatable) |
| `--limit <n>` | Cap analysed threads — use to bound spend on a first run |
| `--fixture` | Offline classifier, no API calls, €0 |
| `--pdf` | Render preview + full PDFs |
| `--json` | Emit report.json to stdout |

## The two numbers

The product is the number; the report exists to answer "prove it". So two
figures are always reported and **never collapsed into one**:

- **Value in cold conversations** — the sum of deal values found verbatim in
  threads that then went silent. A *fact about the mailbox*. It promises
  nothing, which is exactly why it cannot be argued with.
- **Estimated recoverable** — that value multiplied by a published recovery rate
  per category, decayed by how long the thread has been silent. The defensible
  estimate, always printed directly beneath the gross.

```
recoverable = grossValue(evidence tier) × recoveryProbability(leak type, days silent)
```

Three quantities stay strictly separate:

| Quantity | Answers | Role |
|---|---|---|
| Detection confidence | "is this really a ghosted proposal?" | Gates inclusion at 0.80. **Never touches the money.** |
| Value tier (T1–T4) | "how sure are we of the € amount?" | Sets the gross and the stated confidence |
| Recovery probability | "how likely is this recoverable?" | The only multiplier applied to money |

**The evidence ladder** descends and stops — it never invents a figure:

| Tier | Basis | Confidence |
|---|---|---|
| T1 | Amount stated verbatim in the thread | high |
| T2 | Quantity × unit price, both in the thread | medium-high |
| T3 | Customer's own stated average deal value | medium |
| T4 | Unknown — counted as an opportunity, **left unpriced** | low |

T4 never enters a euro total. `DEFAULT_DEAL_VALUE_EUR` is not used to pad headlines.

## The receipt rule

Every quoted line must appear **verbatim** in the message it cites. This is
checked programmatically, not trusted. A quote that fails drops the whole
detection — not down-weighted, dropped. The only folding allowed is whitespace
and unicode punctuation, because mail transport genuinely rewrites those. Never
fuzzy, never semantic.

`src/core/receipts/verify.ts` is a pure function with no dependencies. It is the
embryo of the EYES Receipt Engine and must stay that way.

## Architecture boundary

`src/core` may not import adapters, apps, vendor SDKs, or Node I/O. That rule
*is* the architecture — it is what lets `core` + `schemas` lift into the EYES
monorepo unchanged as the perception module (§11).

```bash
npm run check:boundaries
```

`LEAK_SCHEMA_V1` is **data**, not code. The engine knows nothing about leaks —
it knows definitions, evidence requirements, gates, priority, valuation. Hand it
`COMMITMENT_SCHEMA` and it does EYES commitment tracking unchanged.

## Cost

Runs at €0 by default. `--fixture` exercises the entire pipeline offline. Real
scans cost one Claude call per qualifying thread; bulk senders, calendar mail,
internal-only threads and still-active conversations are skipped *before* any
call is spent. Use `--limit` to bound a first run.

See `DECISIONS.md` for every deviation from `ARCHITECTURE.md` and why.

## Web

```bash
npm run web     # http://localhost:5250
```

- `/` — landing page. `?lang=fr` (default) or `?lang=en`.
- `/r/:token` — preview report. `?tier=full` for the paid view.
- `/r/:token/pdf` — the rendered PDF.

Reports are addressed **only** by their unguessable token, printed as a delivery
URL at the end of every scan. There is no route that accepts a scanId: a scanId
is a database key that appears in logs and ops URLs, so anything reachable by it
is effectively public.

The landing page links to the most recent scan as its sample and takes its
illustrative figures from that same report, so the two can never disagree.

## Language

> Everything that is **our explanation** is localized.
> Everything that is **their evidence** stays verbatim, untranslated, forever.

`?lang=en` renders English chrome around French quotes, unchanged. A translated
receipt is not a receipt — the customer must be able to find those exact
characters in their own mailbox.

This works because `src/core` emits **structure**, not prose: `ValueBasis` and
`RecoveryBasis` are data, and the sentence is composed at render time in
`src/core/i18n.ts`. Adding a language touches that one file and never the engine.

## Retention

The report prints a **date** — "supprimée le 25 juillet 2026" — and the purge job
reads the same `purgeAt` field, so the promise and the mechanism are one value.

```bash
npm run purge                    # purge everything due, once
npm run purge -- --status        # exits 1 if anything is overdue
npm run purge -- --daemon        # continuous, default every 6h
npm run purge -- --scan <id>     # immediate erasure request
```

`--status` exiting non-zero is the point: wire it to an alert rather than relying
on someone remembering to look. `purge()` is idempotent — a retried cron run
returns the original proof instead of rewriting it. Message bodies are deleted;
`report.json` and `purge-proof.json` survive, and the deletion is provable from
`audit.log` alone.

## Calibration

The published recovery rates are **priors**. They become measurements only if you
record what actually happened:

```bash
npm run outcome -- --list <reportToken>
npm run outcome -- --scan <id> --rank 1 --status recovered --amount 26000
npm run calibrate
```

`calibrate` compares observed against *predicted* probability (decay already
applied), per category and per decay band, with Wilson intervals. It refuses to
suggest changing anything below **20 resolved outcomes**, and leaves a prior alone
while the rate it predicts sits inside the observed interval.

It never edits the schema. Changing a rate is a manual edit plus a `DECISIONS.md`
entry — these numbers are printed in customers' reports, so they do not move
silently.

## Status

**Working and verified end to end** — mbox ingest, normalization, engine,
receipts, valuation, aggregation, PDF, landing page, preview report, retention,
calibration. 33 tests. Live Claude verified against a real key: 10 threads →
5 detections, 0 false positives, ~13s, French output.

**Known gaps**

- **The unlock button is a dead link.** Deliberate. Early flow is
  generate → invoice → receive payment → unlock manually (`ManualProvider`).
  Stripe waits until report #1 is sold.
- **The purge daemon is not installed anywhere.** It runs on demand or under
  `--daemon`; nothing starts it at boot. On macOS wire `npm run purge` to a
  launchd job, or run `--status` from cron and alert on exit 1.
- **Zero outcomes recorded so far**, so every recovery rate is still a prior.
  The mechanism to change that exists; the data does not yet.
- Not built: Gmail OAuth (Stage 4), Stripe (Stage 5).
