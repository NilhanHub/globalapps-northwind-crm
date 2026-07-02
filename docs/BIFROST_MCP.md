# Bifrost Bridge (`aladdin-one-ring`) — MCP Gateway for opencode

The Bifrost Bridge is a single local MCP server registered in `opencode.jsonc` as `aladdin-one-ring`. opencode connects to a **wrapper** at `C:\Users\Nilhan.dev\.config\opencode\bifrost-opencode.js` (not the raw Antigravity `mcp_server.js`). The wrapper imports `bifrost_runtime.js`, reads `bifrost_health_report.json` at startup, and exposes **one tool**, `aladdin_one_ring`, whose `description` and `inputSchema` enums are auto-populated with the currently-healthy routes — so the model sees the valid `server` values directly in `tools/list` without an extra round-trip.

opencode uses this gateway to reach MCP connections it does **not** already have a direct connection to. Direct opencode MCPs (`context7`, `playwright`) take precedence — do not route those through Bifrost.

## Invocation

The `aladdin_one_ring` tool has 4 modes. Defaults to `read` when `mode` is omitted.

| Mode | Purpose | Required args |
|------|---------|---------------|
| `read` | Return a skill's `SKILL.md` as instructions | `skill`, `query` |
| `catalog` | List all routes + health summary | (none) — optional `healthyOnly`, `source`, `authMode` |
| `probe` | Health-check one downstream MCP route | `server` (or `skill`), optional `timeoutMs` |
| `execute` | Forward a tool call to a downstream MCP route | `server` (or `skill`), `tool`, `arguments` |

### Examples

```
# Read a skill's instructions (from .gemini/.kilocode skill roots)
aladdin_one_ring(mode="read", skill="thanos-metagpt", query="Plan a multi-stage PRD")

# List only healthy downstream MCPs
aladdin_one_ring(mode="catalog", healthyOnly=true)

# Probe one route
aladdin_one_ring(mode="probe", server="official-time")

# Execute a tool on a downstream MCP
aladdin_one_ring(mode="execute", server="official-git", tool="git_status", arguments={"repoPath":"."})
```

## Live health snapshot (probed 2026-07-02)

Catalog: `C:\Users\Nilhan.dev\.gemini\antigravity\skills\skill-grid\scripts\bifrost_catalog.generated.json`
Total routes: **79** — **15 healthy** / **64 unhealthy**

### Working MCPs (reachable via Bifrost `execute`)

| Route | Transport | Tools | Latency (ms) |
|-------|-----------|------:|-------------:|
| `google-cloud-gcloud-mcp` | command | 1 | 384 |
| `google-cloud-observability-mcp` | command | 13 | 1079 |
| `google-cloud-storage-mcp` | command | 17 | 526 |
| `google-developer-knowledge` | http | 3 | 577 |
| `hostinger-api-mcp` | command | 119 | 359 |
| `hostinger-mcp` | command | 119 | 903 |
| `k6-mcp-2` | command | 2 | 2198 |
| `npm-google-cloud-observability-mcp` | command | 13 | 1711 |
| `npm-google-cloud-storage-mcp` | command | 17 | 1129 |
| `npm-hostinger-api-mcp` | command | 119 | 310 |
| `official-fetch` | command | 1 | 1569 |
| `official-git` | command | 12 | 1781 |
| `official-time` | command | 2 | 1650 |
| `opensearch-mcp` | command | 11 | 3206 |
| `stitch` | http | 14 | 3601 |

**Most useful for this repo:** `official-git` (12 git tools), `google-developer-knowledge` (Google library docs), `google-cloud-storage-mcp` (17 tools), `opensearch-mcp` (11 search tools), `stitch` (14 UI design tools), `k6-mcp-2` (load testing).

> Note: `hostinger-api-mcp`, `hostinger-mcp`, and `npm-hostinger-api-mcp` overlap (same 119 tools). `google-cloud-observability-mcp` / `npm-google-cloud-observability-mcp` and `google-cloud-storage-mcp` / `npm-google-cloud-storage-mcp` also overlap (npm- vs local- variants). Prefer the non-`npm-` variant to avoid npx fetch latency.

### Not working (do not attempt — 64 routes)

All fail with `process_exit` (child MCP exits before responding) or `stdin_write_error`/`EPIPE` (binary missing or crashes immediately). Re-probe with `mode="probe"` if you fix one.

| Route | Reason |
|-------|--------|
| `ai-dev-standards-cli` | process_exit |
| `aws-mcp` | process_exit |
| `backstage-plugin-mcp-actions-backend` | process_exit |
| `cloud-run-mcp` | stdin_write_error (EPIPE) |
| `codex-local` | process_exit |
| `genkit-ai-mcp-examples-client-stdio` | process_exit |
| `genkit-ai-mcp-examples-server` | process_exit |
| `gke-mcp` | stdin_write_error (EPIPE) |
| `google-cloud-cloud-run-mcp` | process_exit |
| `google-cloud-databases-mcp` | stdin_write_error (EPIPE) |
| `google-example` | process_exit |
| `k6-mcp` | process_exit |
| `mcp-example` | process_exit |
| `mcp-server-example` | process_exit |
| `mcp-server-example-2` | process_exit |
| `mcp-server-example-3` | process_exit |
| `n8n` | process_exit |
| `n8n-n8n-nodes-langchain` | process_exit |
| `next`, `next-2`, `next-3` | process_exit |
| `npm-atom8n-inspector` | process_exit |
| `npm-bitbucket-mcp` | process_exit |
| `npm-bitbucket-mcp-server` | process_exit |
| `npm-codex-mcp-server` | process_exit |
| `npm-diskd-ai-email-mcp` | process_exit |
| `npm-gcp-mcp` | process_exit |
| `npm-gleanwork-local-mcp-server` | process_exit |
| `npm-kubernetes-mcp-server` | process_exit |
| `npm-mcp-atlassian` | process_exit |
| `npm-mcp-hello-world` | process_exit |
| `npm-mcp-server-docker` | process_exit |
| `npm-mcp-server-kubernetes` | process_exit |
| `npm-metorial-mcp-session` | process_exit |
| `npm-modelcontextprotocol-inspector` | process_exit |
| `npm-modelcontextprotocol-inspector-server` | process_exit |
| `npm-modelcontextprotocol-server-sequential-thinking` | process_exit |
| `npm-nexus2520-bitbucket-mcp-server` | process_exit |
| `npm-preply-ds-mcp` | process_exit |
| `npm-search-mcp-server` | process_exit |
| `npm-structured-world-gitlab-mcp` | process_exit |
| `npm-transcend-io-mcp-server-core` | process_exit |
| `npm-wong2-mcp-cli` | process_exit |
| `npm-yoda-digital-gitlab-mcp-server` | process_exit |
| `npm-zereight-mcp-gitlab` | process_exit |
| `openclaw` | process_exit |
| `oracle-mcp` | process_exit |
| `plaid-mcp`, `plaid-mcp-server` | process_exit |
| `pw-browserstack-mcp`, `pw-testrail-mcp` | process_exit |
| `redis-mcp` | process_exit |
| `repo-mcp-observability` | process_exit |
| `security-ops-mcp` | process_exit |
| `skill-installer` | stdin_write_error (EPIPE) |
| `trivy-mcp` | stdin_write_error (EPIPE) |
| `vercel-example` | process_exit |
| `vscode-azure-mcp-server`, `vscode-azure-mcp-server-2` | process_exit |
| `vscode-fabric-mcp-server`, `vscode-template-mcp-server` | process_exit |
| `waldzellai-analogical-reasoning` | process_exit |
| `waldzellai-structured-argumentation` | process_exit |
| `xero-mcp` | process_exit |

## `read` mode — skills not in opencode's own set

Beyond MCP routing, `mode="read"` returns any `SKILL.md` from these roots (opencode's own `D:\codex_skills` set is separate):

- `C:\Users\Nilhan.dev\.gemini\antigravity\skills` (canonical Antigravity crate)
- `C:\Users\Nilhan.dev\.kilocode\skills`
- `C:\Users\Nilhan Work\.gemini\antigravity\skills` (work profile)

These include the "Thanos" / god-tier skill instructions (e.g. `thanos-metagpt`, `thanos-sent-clamav`, `apex-pro-design-standard`, `the-visionary-gpt-pilot`) that are **not** in opencode's registered skill list. Use `read` to pull their instructions on demand.

## Security notes

- The Bifrost catalog contains credentials for the `http` routes (`google-developer-knowledge`, `stitch`). Do not print catalog contents. Never commit `bifrost_catalog.json` or `bifrost_catalog.generated.json`.
- `execute` mode forwards arbitrary tool calls to downstream MCPs (e.g. `hostinger-api-mcp` exposes 119 tools). opencode `permission` is `allow` — calls are not gated per-tool.
- The server writes a log to `C:\Users\Nilhan.dev\aladdin_mcp.log` on every invocation.

## Refreshing the route list

The wrapper reads `bifrost_health_report.json` once at startup (cached for the session). To refresh:

```powershell
node "C:\Users\Nilhan.dev\.gemini\antigravity\skills\skill-grid\scripts\verify_bifrost_health.js"
```

This regenerates `bifrost_health_report.json` + `.md` with a fresh probe of all 79 routes, then **restart opencode** so the wrapper reloads and the `tools/list` enums update.

To check the wrapper's current state without starting a session:

```powershell
node "C:\Users\Nilhan.dev\.config\opencode\bifrost-opencode.js" --list
```

## Re-probing
