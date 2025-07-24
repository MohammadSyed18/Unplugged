# Unplugged

A React Native / Expo focus app with a timestamp-based timer, durable session recovery, interruption tracking, and local progress insights.

## Run

```sh
npm ci
npm test
npm start
# npm run ios / npm run android
```

Open the Expo app on a simulator or compatible device. Enter an intention, choose a duration, and begin. Pause, resume, log distractions, or end early. Insights shows daily focus, goals, recent sessions, and completion by session length. Plan lets you save tasks, set priorities, choose a time budget, and start a scheduled focus block.

## Code map

| Module | Responsibility |
| --- | --- |
| [App.js](App.js) | Focus and Insights screens; foreground recovery; visible persistence errors |
| [focusEngine.js](src/focusEngine.js) | Pure session state transitions and elapsed-time calculations |
| [sessionRepository.js](src/sessionRepository.js) | Serialized storage operations, validation, legacy migration, archive import/export, recovery |
| [goals.js](src/goals.js) | Daily and weekly goals, streaks, focus/break routine construction, interruption summaries |
| [insights.js](src/insights.js) | Duration-level completion intervals, period comparisons, UTC hourly patterns, safe CSV export |
| [analytics.js](src/analytics.js) | Weekly totals and history-based session-length suggestions |
| [planner.js](src/planner.js) | Budget-constrained focus blocks, break allocation, deadline ordering, and session progress credit |
| [plannerRepository.js](src/plannerRepository.js) | Serialized task persistence and idempotent reconciliation of finished sessions |
| [PlannerScreen.js](src/PlannerScreen.js) | Saved task list, priorities, time budgets, and direct session launch |
| [store.js](src/store.js) | AsyncStorage adapter |

## Session lifecycle

The timer stores a start timestamp plus accumulated time from previous runs. Paused time is excluded. Returning after app suspension recomputes elapsed time; a finished session is recorded once at its expected completion timestamp. An interval drives display refreshes, not the clock itself.

Storage operations queue read-modify-write changes so overlapping UI events do not drop interruptions. A second active session is rejected. Disk failures are surfaced, and invalid saved data is not silently replaced with an empty history. Legacy history migrates from the original array format. Versioned archives support deduplication and reject conflicting session IDs.

The repository exposes `exportArchive()` and `importArchive(raw)`; `sessionsToCsv()` supplies an escaped, spreadsheet-safe export. The Data screen previews imports and shares JSON or CSV through the device share sheet. Imports accept pasted JSON; a native file picker is not included.

## Insights and boundaries

Day and hour buckets use UTC consistently. Streaks allow the current day to remain in progress. Completion intervals widen when there is little evidence. Duration suggestions summarize local history and are not a trained behavioral model.

`buildRoutine()` creates bounded focus/break plans; it does not schedule operating-system notifications. Cross-device synchronization and background reminders are not implemented in this version.

## Verification

```sh
npm test
npx expo export --platform ios --output-dir dist/ios
```

Tests cover pause/resume, app suspension, single completion, concurrent events, failed writes, malformed archives, migration, streaks, period boundaries, uncertainty intervals, and CSV formula escaping. A bundle check verifies the React Native source can compile; physical-device lifecycle and accessibility testing remain separate checks.

## Daily planning

Plans rank overdue tasks first, then priority and deadline. Breaks consume the available time; there is no trailing break. A short final fragment is absorbed when it fits, otherwise remaining work is shown explicitly. Starting a block uses the same durable focus-session engine as the main timer. Finishing or ending a linked session credits only whole focused minutes, capped at the task estimate. Reopening Plan reconciles saved history once per session ID, so recovery and repeated renders do not double-count work. Paused time earns no progress.

Planning is local and deterministic. It neither syncs tasks to a server nor schedules device notifications. Task progress can be reconciled from retained session history; deleting a task removes its link from future planning.

## History transfer

The Data screen exports all history or the last 7/30 days, with optional redaction of intention and interruption text. JSON is suitable for backups; CSV uses spreadsheet-safe escaping. Import preview reports new records, duplicates, and any sessions outside the 1,000-record retention limit. Conflicting IDs are rejected rather than overwritten; semantic equality ignores JSON field order. Active sessions cannot be imported. The repository validates again inside its write queue, so a successful preview cannot bypass a later conflict. Archives have a five-million-character input limit. Redacted exports retain session IDs and should be shared as summaries; restoring them over an unredacted backup is deliberately a conflict.

`sessionSchema.js` owns validation, `archiveTools.js` owns preview/merge/redaction, and `ArchiveScreen.js` owns the mobile controls. Device-specific share-sheet behavior still requires physical-device verification.
