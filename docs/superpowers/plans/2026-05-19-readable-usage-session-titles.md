# Readable Usage Session Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace opaque usage-session IDs in analytics reports with readable first-user-message summaries while preserving a short ID for traceability.

**Architecture:** `usageBackfill` extracts a per-session first user prompt from Claude and Codex JSONL files and writes it into the existing `sessions` table. `historyStore.getTopTokenUsageSessions()` joins token usage with session summary columns, and the HTML report renders the readable summary as the primary session label. The renderer Analytics hero cards use primary/secondary text so top agent/model values do not get crushed into one line.

**Tech Stack:** TypeScript, SQLite via `node:sqlite`, Vitest, React renderer, HTML report generator.

---

### Task 1: Persist Backfilled Session Summaries

**Files:**
- Modify: `src/main/history/usageBackfill.test.ts`
- Modify: `src/main/history/usageBackfill.ts`
- Modify: `src/main/history/historyStore.ts`
- Modify: `src/shared/usageTypes.ts`

- [x] **Step 1: Write the failing test**

Add Claude and Codex user-message rows to the backfill fixture, then assert `store.getTopTokenUsageSessions()` returns `title` values derived from the first user message.

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/main/history/usageBackfill.test.ts`

Expected: fail because `SessionTokenStats` does not include readable titles and backfill does not write session summaries.

- [x] **Step 3: Implement minimal storage support**

Add `title` to `SessionTokenStats`, add `writeUsageSessionSummary()` to the history store, and make backfill call it once per parsed Claude/Codex session.

- [x] **Step 4: Run the focused test**

Run: `npm test -- src/main/history/usageBackfill.test.ts`

Expected: pass.

### Task 2: Render Readable Top Sessions

**Files:**
- Modify: `src/main/report/generateHtmlReport.test.ts`
- Modify: `src/main/report/generateHtmlReport.ts`

- [x] **Step 1: Write the failing test**

Assert the HTML report contains the readable title and a shortened session ID instead of only a raw UUID in the Top Sessions table.

- [x] **Step 2: Run the report test to verify it fails**

Run: `npm test -- src/main/report/generateHtmlReport.test.ts`

Expected: fail because Top Sessions currently renders `session.sessionId` as the main cell.

- [x] **Step 3: Implement the report rendering**

Render `<div class="session-title">title</div>` and `<div class="session-id">shortId</div>`, with fallback to the full ID only when no title exists.

- [x] **Step 4: Run the report test**

Run: `npm test -- src/main/report/generateHtmlReport.test.ts`

Expected: pass.

### Task 3: Improve Compact Analytics Cards

**Files:**
- Modify: `src/renderer/components/AnalyticsPage.tsx`
- Modify: `src/renderer/styles.css`

- [x] **Step 1: Change hero stats shape**

Represent hero cards as `{ label, value, detail? }`, using `Claude` / `725K tokens` and `gpt-5.5` / `Codex` style text for top agent/model.

- [x] **Step 2: Update styles**

Add `.analytics-page__hero-detail` and keep hero values single-line without hiding useful secondary context.

- [x] **Step 3: Run validation**

Run: `npm run lint && npm test -- src/main/history/usageBackfill.test.ts src/main/report/generateHtmlReport.test.ts && npm run build`

Expected: all pass.
