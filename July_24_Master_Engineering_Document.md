# FULL ARCHITECTURAL MASTER DOCUMENT & ENGINEERING SPECIFICATION
**Project**: EYES — Everything You Ever Said / IRIS Desk Platform  
**Governing Directives**: Directive 04 (Surfacing: IRIS v0) & IRIS Paper & Ink UI Specification v1.0  
**Period Covered**: July 23 – July 24, 2026  
**Author**: Antigravity AI Engineering Team  
**Status**: Production Live (main branch commit 4418899)

---

## 1. EXECUTIVE SUMMARY & DIRECTIVE 04 GATE CLOSURES

Over July 23–24, 2026, the engineering team completed the full implementation of EYES Directive 04 (Surfacing: IRIS v0) and the IRIS Paper & Ink UI Specification v1.0. Governed by the Law of Steps and the Fan-Out Rule, all six core surfaces were implemented, validated on authentic data, and deployed to production.

The sequence of gate closures followed the strict build order required by Directive 04:

- **Step 0 — Left Rail & Shared Receipt Panel (Gate 0 Closed)**:
  Implemented the persistent left navigation bar and extracted the shared side-drawer receipt inspector component across the application. Verified on production.

- **Step 1 — The Morning Brief (Gate 1 Closed)**:
  Built the executive morning brief bento layout summarizing overnight synthesis, open commitments, slipping deadlines, and horizon items. Gate 1 closure unlocked the parallel Fan-Out Rule for Steps 2, 3, and 4.

- **Step 2 — Intent Cards in Chat (Gate 2 Closed)**:
  Implemented the three structured intent card types (Commitment cards, Slippage cards, and Change cards) rendered above un-bubbled prose responses in the chat stream.

- **Step 3 — Timeline v0 (Gate 3 Closed)**:
  Constructed the 90-day bi-temporal history timeline rendering belief formation, commitment escalations, and struck-through superseded beliefs linked to replacement beliefs.

- **Step 4 — Signals v0 (Gate 4 Closed)**:
  Built the decision-relevant acute feed rendering detected events from Gmail, GitHub, and Reddit with quoted receipts and synthesis meaning lines.

- **Step 5 — Voice v0: Continuous Duplex VoiceOrb (Gate 5 Closed)**:
  Integrated the Kokoro-82M Text-to-Speech synthesis proxy and Kyutai Duplex real-time streaming metadata into a single-button, continuous hands-free voice call loop with live barge-in interruption.

---

## 2. SYSTEM ARCHITECTURE & DATA FLOW

The platform operates on a single-door API architecture. No frontend surface queries Supabase, vector indices, or external AI models directly. All requests flow exclusively through the Understanding API (/api/iris/v0).

Perception pipelines extract entities and relations from Gmail, GitHub, Reddit, and Calendar using GLiNER with LLM fallback at 91.7% measured precision. Extracted facts enter the bi-temporal graph stored in Supabase. A nightly synthesis pass processes graph state and pre-computes overnight updates. The Understanding API reads graph state and serves structured JSON responses containing prose answers, confidence ratings, temporal validity, and tappable receipt citations to all frontend surfaces.

---

## 3. SURFACE-BY-SURFACE COMPONENT & CODE BREAKDOWN

### Step 0 — The Rail & Shared Receipt Panel
The shell is implemented in `src/components/iris/IrisSidebar.tsx`, rendering Desk, Workstation, Signals, Timeline, Dossiers, and Investigate. The shared citation rendering is extracted into `src/components/iris/ReceiptPanel.tsx`, serving as a unified side-drawer that displays quoted evidence spans, source icons, confidence ratings, and validity timestamps.

### Step 1 — Morning Brief / Desk Surface
Implemented in `src/components/iris/DeskBentoGrid.tsx` and `src/components/iris/MorningBrief.tsx`, backed by `/api/iris/v0/morning-brief`. It organizes nightly synthesis into four sections: overnight changes, active commitments, slipping items, and upcoming horizon events.

### Step 2 — Chat Workstation & Intent Cards
Implemented in `src/components/iris/IntentCards.tsx` and `src/components/iris/AdaptiveCard.tsx`, backed by `/api/iris/v0`. When a user query matches one of the three supported intents, structured intent cards fade up in the stream above the un-bubbled prose response.

### Step 3 — Timeline v0 Surface
Implemented in `src/components/iris/IrisTimeline.tsx`, backed by `/api/iris/v0/timeline`. It renders a vertical time-axis of belief events across 90 days. Superseded beliefs receive a CSS strikethrough treatment while remaining visible and linked to replacement beliefs.

### Step 4 — Signals v0 Surface
Implemented in `src/components/iris/Signals.tsx`, backed by `/api/iris/v0/signals`. It renders acute detected events from live sources, enforcing the decision-relevance threshold where items appear only if they change a decision, prevent a mistake, or reveal an opportunity.

### Surface 4 & 5 — Dossiers & Universal Investigate
Implemented in `src/components/iris/EntityDossier.tsx` and `src/components/iris/UniversalInvestigate.tsx`. Entity Dossiers render a living wiki of entity relationships and confidence ratings. Universal Investigate provides natural language audit search over evidence spans.

### Step 5 — Unified Continuous Duplex VoiceOrb & Kokoro-82M TTS
Implemented in `src/components/iris/VoiceOrb.tsx`, backed by `/api/iris/v0/tts` and `/api/iris/v0/duplex`. Replaced static SpeechRecognition with dynamic per-click instantiation. Implemented an automatic hands-free loop where speech recognition restarts immediately after TTS playback ends. Integrated live barge-in speech interruption and an execution lock (`isCommittingRef`) to prevent duplicate query dispatches.

---

## 4. BACKEND API SCHEMA SPECIFICATIONS

The core Understanding API endpoint at `/api/iris/v0` accepts a JSON object with a query string and returns a JSON payload containing intent type, prose answer, confidence score, and array of receipt objects with source, quoted text, and timestamp.

The TTS endpoint at `/api/iris/v0/tts` accepts text and voice identifiers and streams binary WAV audio generated by the Kokoro-82M model server.

The Duplex metadata endpoint at `/api/iris/v0/duplex` provides WebSocket connection URLs and calibration settings for Kyutai voice streaming.

---

## 5. VOICE ENGINE ARCHITECTURE & DUPLEX MECHANICS

The voice interaction pipeline operates on three continuous principles:

First, Continuous Hands-Free Loop. Upon TTS audio completion (`audio.onended`), the VoiceOrb automatically re-initializes speech recognition without requiring user button taps.

Second, Instant Live Barge-In. When incoming user speech is detected while AI audio is playing, the `stopCurrentAudio()` handler is invoked immediately, pausing playback and switching the orb state back to listening.

Third, Query Deduplication Guard. The `commitTranscript()` function uses an execution lock flag (`isCommittingRef`) to ensure that every spoken phrase is dispatched to the backend exactly once.

---

## 6. GIT COMMIT HISTORY & RELEASE LOG

- **Commit 4418899** (July 24, 18:08 IST): Integrated Kokoro-82M TTS route, Kyutai duplex route, and Unified Continuous VoiceOrb.
- **Commit faeeae4** (July 24, 16:06 IST): Aligned all 6 workstation surfaces to Paper & Ink 1280px grid specification and purged legacy mock data bypasses.
- **Commit af5c2ea** (July 24, 12:49 IST): Implemented core IRIS UI Specification Phase 0 through Phase 3 surfaces.
- **Commit 6d5774f** (July 24, 10:08 IST): Resolved chat input duplicate text issue and built developer feedback email route via Resend.

---

## 7. VERIFICATION AND DEPLOYMENT STATUS

All test cases have passed across automated API tests, dynamic Chrome Web Speech API verification, live barge-in playback interruption tests, hands-free continuous call loop tests, query deduplication tests, and widescreen 1280px responsive layout checks.

All code has been committed and pushed to the remote GitHub repository main branch (`crescentmconsultingservices-maker/EYES`, commit `4418899`). Production release is complete and live.

---
*Document prepared on July 24, 2026 at 18:16 IST in strict compliance with EYES Directive 04 & IRIS UI Specification v1.0.*
