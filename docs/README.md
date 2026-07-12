# Northwind documentation map

This page is the canonical index for repository documentation. Start here to determine which document is authoritative for a decision, which material is historical, and which guidance applies only to compatibility code.

## Source-of-truth order

When documents appear to disagree, use this order:

1. Current code, shared schemas and automated tests for implemented behavior.
2. Normative architecture and security documents for system boundaries.
3. The operational runbook for deployment and recovery procedures.
4. Current limitations and reviewed dependency exceptions.
5. Dated status snapshots, lessons and incident reports for context.
6. Compatibility documentation only for the legacy surface it names.

Ignored local verification output is optional corroboration, not a durable source of truth. Permanent documentation must stand on tracked files, tests, scripts and commits.

## Start here

- [Repository instructions](../AGENTS.md) — concise rules automatically discovered by repository agents.
- [AI agent handbook](AI_AGENT_HANDBOOK.md) — safe orientation, implementation, data, cloud, release and recovery workflows.
- [Troubleshooting](TROUBLESHOOTING.md) — symptom-led diagnosis and escalation.
- [Lessons learned](LESSONS_LEARNED.md) — resolved problems and their permanent guardrails.
- [Known issues](KNOWN_ISSUES.md) — accepted limitations that still exist.

## Documentation classes

### Normative architecture and security guidance

These documents define enduring boundaries. Change them when the boundary changes, not merely when an incident occurs.

- [Architecture](ARCHITECTURE.md)
- [API contracts](API.md)
- [Authentication](../AUTH.md)
- [Security policy](../SECURITY.md)
- [Architecture decision records](adr/README.md)

### Operational runbooks

- [Hostinger deployment runbook](HOSTINGER_DEPLOYMENT.md) — the sole authoritative Hostinger deployment and release procedure.
- [Data migration and recovery](DATA_RECOVERY.md)
- [AI agent handbook](AI_AGENT_HANDBOOK.md)
- [Troubleshooting](TROUBLESHOOTING.md)

### Current limitations and temporary exceptions

- [Known issues](KNOWN_ISSUES.md) — current product, platform and operating limitations.
- [Dependency exceptions](DEPENDENCY_EXCEPTIONS.md) — time-bounded, reviewed dependency risk decisions.

Resolved defects do not belong in known issues. Temporary dependency risk must include a review date.

### Dated status snapshots

- [Cloud release status](CLOUD_STATUS.md)

Status snapshots explain what was observed at a point in time. Re-verify live state before using them for an operational decision.

### Historical lessons and incidents

- [Lessons learned](LESSONS_LEARNED.md) — append-only resolved-problem registry.
- [Incident reports and template](incidents/README.md)

Lessons explain reusable guardrails. Incident reports preserve the sequence and impact of material failures. Neither overrides current code or normative guidance.

### Compatibility and integration material

- [Legacy desktop-agent API guide](../public/agents.md) — compatibility guidance for desktop agents, not repository-maintenance instructions.
- [Bifrost MCP bridge](BIFROST_MCP.md) — optional tool-routing integration.
- Root `server.js`, root JSON stores and the legacy `public` frontend — preserved compatibility surfaces; new product development belongs under `apps/` and `packages/`.

## Documentation governance

Classify new knowledge before adding it:

- A resolved recurring defect becomes a stable entry in [Lessons learned](LESSONS_LEARNED.md).
- A material outage or failed release becomes an [incident report](incidents/README.md).
- An enduring architectural choice becomes an [ADR](adr/README.md).
- A limitation that still exists belongs in [Known issues](KNOWN_ISSUES.md).
- A temporary dependency risk belongs in [Dependency exceptions](DEPENDENCY_EXCEPTIONS.md) with a review date.

Run `npm run docs:check` after documentation changes. Markdown is the maintained knowledge source; do not create a parallel machine-readable agent-context file.
