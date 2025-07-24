# unplugged

focus timer / React Native + Expo

- start, pause, finish, or abandon a session
- log interruptions
- weekly completion + distraction patterns
- session-length suggestions from recent history, not a trained model

```sh
npm install
npm test
npm start
```

the timer, local storage, interruption tracking, recommendations, and weekly analytics are implemented. reminders and cross-device sync are still being tested.

## Implementation details

Weekly analytics include elapsed time from running sessions, exclude future sessions, and use consistent UTC date buckets.
