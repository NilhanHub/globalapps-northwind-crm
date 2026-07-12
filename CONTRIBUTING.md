# Contributing

Start with the [canonical documentation map](docs/README.md) and [AI agent handbook](docs/AI_AGENT_HANDBOOK.md). Create a `codex/` feature branch from `staging`, preserve unrelated work, and keep domain logic independent of HTTP and UI adapters. Add a failing test before a behavior change, then run:

```text
npm run docs:check
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Never commit secrets, sessions, data copies, screenshots, coverage or browser output. Changes to schemas or migrations require count/hash evidence and a rollback note. UI changes require keyboard, mobile and console verification.

Classify maintained knowledge consistently:

- Resolved recurring defect → [Lessons learned](docs/LESSONS_LEARNED.md)
- Material outage or failed release → [Incident report](docs/incidents/README.md)
- Enduring architectural decision → [ADR](docs/adr/README.md)
- Limitation that still exists → [Known issues](docs/KNOWN_ISSUES.md)
- Temporary dependency risk → [Dependency exception](docs/DEPENDENCY_EXCEPTIONS.md) with a review date

Run `npm run docs:check` after documentation changes. Do not create a duplicate machine-readable agent context; tracked Markdown remains the maintained knowledge source.
