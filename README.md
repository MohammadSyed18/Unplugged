# Unplugged

A React Native / Expo focus app with a timestamp-based timer, durable session recovery, interruption tracking, and local progress insights.

## Run

```sh
npm ci
npm test
npm start
# npm run ios / npm run android
```

Open the Expo app on a simulator or compatible device. Enter an intention, choose a duration, and begin. Pause, resume, log distractions, or end early. Insights shows daily focus, goals, recent sessions, and completion by session length.

## Code map

| Module | Responsibility |
| --- | --- |
| [App.js](App.js) | Focus and Insights screens; foreground recovery; visible persistence errors |
| [focusEngine.js](src/focusEngine.js) | Pure session state transitions and elapsed-time calculations |
| [sessionRepository.js](src/sessionRepository.js) | Serialized storage operations, validation, legacy migration, archive import/export, recovery |
| [goals.js](src/goals.js) | Daily and weekly goals, streaks, focus/break routine construction, interruption summaries |
| [insights.js](src/insights.js) | Duration-level completion intervals, period comparisons, UTC hourly patterns, safe CSV export |
| [analytics.js](src/analytics.js) | Weekly totals and history-based session-length suggestions |
| [store.js](src/store.js) | AsyncStorage adapter |

## Session lifecycle

The timer stores a start timestamp plus accumulated time from previous runs. Paused time is excluded. Returning after app suspension recomputes elapsed time; a finished session is recorded once at its expected completion timestamp. An interval drives display refreshes, not the clock itself.

Storage operations queue read-modify-write changes so overlapping UI events do not drop interruptions. A second active session is rejected. Disk failures are surfaced, and invalid saved data is not silently replaced with an empty history. Legacy history migrates from the original array format. Versioned archives support deduplication and reject conflicting session IDs.

The repository exposes `exportArchive()` and `importArchive(raw)`; `sessionsToCsv()` supplies an escaped, spreadsheet-safe export. These are library interfaces; the mobile screens do not yet expose file pickers or sharing controls.

## Insights and boundaries

Day and hour buckets use UTC consistently. Streaks allow the current day to remain in progress. Completion intervals widen when there is little evidence. Duration suggestions summarize local history and are not a trained behavioral model.

`buildRoutine()` creates bounded focus/break plans; it does not schedule operating-system notifications. Cross-device synchronization and background reminders are not implemented in this version.

## Verification

```sh
npm test
npx expo export --platform ios --output-dir dist/ios
```

Tests cover pause/resume, app suspension, single completion, concurrent events, failed writes, malformed archives, migration, streaks, period boundaries, uncertainty intervals, and CSV formula escaping. A bundle check verifies the React Native source can compile; physical-device lifecycle and accessibility testing remain separate checks.
