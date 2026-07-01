# Northwind CRM

A cheerful, light, premium CRM for tracking companies and relationship-led warm introductions. Built for **both humans and desktop agents**: company, people, route, and activity records persist through a local HTTP API.

- Light-only "Warm Editorial" design (Fraunces serif + Inter, warm paper, peach→sage warmth meter)
- Zero npm dependencies — pure Node
- One tiny server is the **single source of truth** (UI + API + persistence)

---

## Run it

Requires [Node.js](https://nodejs.org) installed.

```cmd
cd C:\Users\Nilhan.dev\ZCodeProject\CRM
node server.js
```

Then open **http://localhost:8787** in your browser.

> Agents POST to `http://localhost:8787/api/companies`.

To change the port: `set PORT=9000 && node server.js`

---

## Using it

- **+ New company** — opens a form to add a card manually.
- **⚡ Agent** — the built-in agent drafts a company and POSTs it, tagged `agent:Atlas`. This hits the exact same endpoint an external agent would.
- **Click a row** to expand it: see contact details, the activity timeline, and **Log email / Log call / Log reply** buttons. Each logged action grows the **warmth meter** (peach → sage).
- **Edit / Delete** from the expanded panel.
- Rows are sorted hottest-first so your attention lands where momentum is highest.

### The warmth meter (signature element)

Derived from activity, not stored:

| Action | Points |
|--------|--------|
| Email sent | +20 |
| Call made | +25 |
| Reply received | +40 |

- Capped at 100. Minus 10 if the last activity is older than 14 days.
- Bands: **0–19 Cold · 20–49 Warming · 50–79 Warm · 80–100 Hot**.

---

## Agent API (the agent's whole interface)

The API is permissive (CORS open, partial bodies accepted) so any local desktop agent can create cards. Base URL: `http://localhost:8787`.

### `POST /api/companies` — create a company

Only `name` is required; everything else is optional and filled with sensible defaults.

```bash
curl -X POST http://localhost:8787/api/companies ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Globex Corporation\",\"industry\":\"Manufacturing\",\"size\":1500,\"contactName\":\"Hank Scorpio\",\"email\":\"hank@globex.example\",\"createdBy\":\"agent:Atlas\"}"
```

Body fields:

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | **required** |
| `industry` | string | e.g. "Retail" |
| `size` | number | employee count |
| `status` | string | `New` (default), `Contacted`, `Awaiting reply`, `Won`, `Lost` |
| `contactName` | string | |
| `email` | string | |
| `phone` | string | |
| `nextStep` | object | `{ "type": "email"|"call", "note": "..." }` |
| `createdBy` | string | `agent:<Name>` marks it as agent-created (shown in the UI). Default `Sam`. |

Returns the created company (with computed `warmth`). Unknown/extra fields are accepted and passed through, so agents can attach their own metadata.

### `GET /api/companies` — list all

```bash
curl http://localhost:8787/api/companies
```

### `POST /api/companies/:id/activity` — log outreach

```bash
curl -X POST http://localhost:8787/api/companies/globex-corporation-ab12/activity ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"email\"}"
```

`type` must be `email`, `call`, or `reply`. Bumps `lastContactAt` and the warmth meter.

### `DELETE /api/companies/:id` — remove

```bash
curl -X DELETE http://localhost:8787/api/companies/globex-corporation-ab12
```

---

## Data

The app uses four formatted JSON stores:

- `companies.json` — existing company pipeline and company outreach
- `people.json` — target people, reusable mutual contacts, and target-to-mutual links
- `routes.json` — one warm-introduction path per company, target, and mutual contact
- `activities.json` — route notes, calls, messages, stage events, and outcomes

Writes use temporary-file replacement so a partial write cannot leave invalid JSON. Set `CRM_DATA_DIR` to use an isolated data directory for tests; the default remains this project folder.

## Relationship tracker

Open **Routes** to use the eight-stage board, Owner Dashboard, and Warm Intro Process. Open a company and choose **People** to add unlimited targets, attach unlimited existing or new mutual contacts, then assign selected paths to Paul, Jeremy, Nilhan, another owner, or leave them unassigned.

Open the primary **People** workspace to search the whole network, filter targets and mutual contacts, review and merge possible duplicates, manage reusable links, create routes, and restore archived people. The Routes work queue can select unfinished routes and assign an owner, due date, and next action in one atomic update.

Relationship API:

```text
GET/POST   /api/people
PATCH      /api/people/:id
POST       /api/people/:id/archive | /restore
POST       /api/people/merge
GET/POST   /api/routes
PATCH      /api/routes/:id
POST       /api/routes/:id/actions
POST       /api/routes/:id/archive | /restore
POST       /api/routes/bulk/actions
POST       /api/routes/:id/actions/:activityId/undo
GET/POST   /api/activities
POST       /api/companies/:id/archive | /restore
```

Collection `GET` endpoints accept `includeArchived=true`; active records remain the default. Route actions are `call_mutual`, `message_mutual`, `intro_requested`, `intro_agreed`, `target_contacted`, `meeting_reply`, `mark_won`, `mark_dead`, `move_stage`, `reassign`, and `edit`. Every route mutation appends structured activity. Won and Dead require a reason. The latest reversible route action can be undone for 30 seconds.

Archive is the normal removal path. Company archives cascade to its people and active routes; person archives cascade to active routes involving that person. Restore revives only records from the same archive operation. Completed history and activities are preserved. Permanent `DELETE` remains UI-only and succeeds only for an archived record with no dependencies.

---

## Project layout

```
CRM/
  server.js          tiny server: static UI + REST API + persistence + warmth logic
  lib/               atomic transactions and archive semantics
  companies.json     the data store (seeded with samples)
  people.json        target people and reusable mutual contacts
  routes.json        warm-introduction routes
  activities.json    route activity timeline
  tests/              isolated API coverage using node:test
  public/
    index.html       Warm Editorial UI shell
    styles.css       tokens, warmth meter, list rows
    app.js           company fetch / render / create / log activity
    relationships.js routes, relationship tabs, dashboards, and process UI
    people.js        global People directory, duplicates, merge, archive/restore
    ui.js            shared icons and form helpers
  README.md          this file
```

---

## Current scope

✅ Light premium UI, warmth meter, seeded samples
✅ Manual create + agent create (in-app button & external API)
✅ Log email / call / reply, watch warmth grow
✅ Edit / delete, persisted to disk

✅ Unlimited company targets and mutual contacts
✅ Persistent warm-introduction routes and activity timelines
✅ Routes board, owner accountability, and process guide
✅ Recoverable archives, dependency-safe purge, transaction recovery, and route undo
✅ Global People workspace, duplicate merge, bulk route setup, and auditable movement

Not included: authentication, cloud deployment, or a database. This remains a local, zero-dependency application.
