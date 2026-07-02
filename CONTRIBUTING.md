# Contributing

Create a `codex/` feature branch, preserve unrelated work, and keep domain logic independent of HTTP and UI adapters. Add a failing test before a behavior change, then run:

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Never commit secrets, sessions, data copies, screenshots, coverage or browser output. Changes to schemas or migrations require count/hash evidence and a rollback note. UI changes require keyboard, mobile and console verification.
