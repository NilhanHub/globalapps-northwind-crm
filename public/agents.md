# Northwind CRM — Agent Instructions

Hello, agent. This document is the **only thing you need to read** to create
company cards here. Read it once, then act.

> Base URL for everything: **`http://localhost:8787`**
> All endpoints are JSON. No authentication. No registration.

---

## 1. Your access model

| Action        | Allowed? |
| ------------- | -------- |
| Read companies| yes      |
| Create a company | yes   |
| Log outreach activity | yes |
| Delete a company | **no** |

You have **write access, but not delete access**. Deleting data is reserved
for the human operator in the UI. If a card is wrong, edit it (create a new
one with the corrected data) rather than deleting — the human can clean up.

You do **not** need to register, authenticate, or announce yourself before
working. Just read the relevant company list and start creating cards.

You **cannot** delete anything. The `DELETE` method is refused for agents
(HTTP `403`). Don't try.

---

## 2. How to identify yourself

When you create a company, set `createdBy` to:

```
agent:<YourName>
```

For example: `"createdBy": "agent:Atlas"`.

This is the **only** way the system knows a card came from an agent rather
than a human. It is surfaced in the UI as a small `agent` tag on the card, so
the human operator can see at a glance which cards are machine-made. Without
this prefix, the card is treated as human-made.

Pick one name and use it consistently.

---

## 3. Endpoints

### Create a company

```
POST /api/companies
Content-Type: application/json
```

This is the **only** way to add a card. See the schema in section 4.

**Example — minimal viable card:**

```bash
curl -X POST http://localhost:8787/api/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Contoso Ltd",
    "createdBy": "agent:Atlas"
  }'
```

→ `201 Created` with the full company object back (including computed `warmth`).

**Example — complete card:**

```bash
curl -X POST http://localhost:8787/api/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Contoso Ltd",
    "industry": "Logistics",
    "size": 240,
    "status": "New",
    "contactName": "Lara Pereira",
    "email": "lara@contoso.example",
    "phone": "+1 (415) 555-0148",
    "nextStep": { "type": "email", "note": "Intro from the conference." },
    "createdBy": "agent:Atlas"
  }'
```

### List all companies

```
GET /api/companies
```

Returns an array of company objects, each with a computed `warmth` field.
Use this to see what already exists before creating duplicates.

### Log outreach activity (warms a company up)

```
POST /api/companies/:id/activity
Content-Type: application/json
```

```bash
curl -X POST http://localhost:8787/api/companies/contoso-ltd-a1b2/activity \
  -H "Content-Type: application/json" \
  -d '{ "type": "email" }'
```

`type` must be one of:

- `email` — you sent an email (+20 warmth)
- `call`  — you placed a call  (+25 warmth)
- `reply` — they replied       (+40 warmth)

`at` is optional (defaults to now); send an ISO timestamp if you are back-filling.

> The `:id` is the company's `id` field, returned by POST/GET. Don't guess it —
> read it from the list.

### Update a company (merge / partial edit)

```
PATCH /api/companies/:id
Content-Type: application/json
```

Send **only the fields you want to change** — everything else (activity history,
intel block, `createdAt`, `createdBy`) is preserved. This is the correct way to
edit a card or move it between stages (e.g. set `status` after outreach).

```bash
curl -X PATCH http://localhost:8787/api/companies/fabrikam-inc-3f9c \
  -H "Content-Type: application/json" \
  -d '{ "status": "Contacted", "contactName": "Mira Okafor" }'
```

→ `200` with the full updated company object.

---

## 4. Company schema

Fields you can send on create. **Only `name` is required**; everything else
is optional and partial payloads are fine. The card has two layers:
**outreach/contact** (top, always visible) and **opportunity intelligence**
(`intel`, scroll-down context).

### Layer 1 — outreach & contact

| Field         | Type    | Required | Notes                                             |
| ------------- | ------- | -------- | ------------------------------------------------- |
| `name`        | string  | **yes**  | Must be non-empty. Used to build the `id`.        |
| `sector`      | string  | no       | Business sector, e.g. `"Food manufacturing"`.     |
| `country`     | string  | no       | e.g. `"United Kingdom"`, `"Ireland"`.             |
| `industry`    | string  | no       | Free text, e.g. `"Retail"`, `"SaaS"`.             |
| `size`        | number  | no       | Employee count. Send `null` or omit if unknown.   |
| `status`      | string  | no       | One of the 5 values below. Defaults to `New`.     |
| `contactName` | string  | no       | Your contact at the company.                      |
| `email`       | string  | no       | Contact email.                                    |
| `phone`       | string  | no       | Free text.                                        |
| `nextStep`    | object  | no       | `{ "type": "email"\|"call", "note": "…" }`.       |
| `createdBy`   | string  | no       | **Set to `agent:<YourName>`** (see §2).           |

**`status`** must be exactly one of:

```
New · Contacted · Awaiting reply · Won · Lost
```

Any other value is rejected.

### Layer 2 — opportunity intelligence (`intel`)

Optional. Send an `intel` object to capture the "why this company is worth
calling" — typically populated from a signal report. Omit the whole object
(or send only empty values) and the card simply shows no intelligence section.

| Field                   | Type     | Notes                                                        |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `intel.signal`          | string   | The core signal, e.g. `"D365 ERP implementation with recovery signals"`. |
| `intel.signalType`      | string   | Category, e.g. `"ERP implementation / rescue"`.              |
| `intel.signalTier`      | string   | One of `Strong`, `Promising`, `Emerging`.                    |
| `intel.whyItMatters`    | string   | The business reason this is an opportunity.                  |
| `intel.commercialOpening` | string | How to credibly open the conversation.                       |
| `intel.evidenceUrl`     | string   | Public evidence/proof link.                                  |
| `intel.doNotClaim`      | string[] | Guardrail list — what NOT to claim on a call. One string per item. |
| `intel.uncertainty`     | string   | What remains unknown / unverified.                           |

Example payload with intel:

```json
{
  "name": "Weetabix Food Company",
  "sector": "Food manufacturing",
  "country": "United Kingdom",
  "intel": {
    "signal": "D365 ERP implementation with struggle and recovery signals",
    "signalType": "ERP implementation / rescue",
    "signalTier": "Strong",
    "whyItMatters": "ERP programmes needing recovery create post-go-live demand for stabilisation, reporting clean-up, and enhancement delivery.",
    "commercialOpening": "Non-invasive ERP health-check offer; identify bottlenecks and quick wins.",
    "evidenceUrl": "https://ninefeettall.com/case-studies/weetabix",
    "doNotClaim": [
      "Current pain or unresolved failure",
      "Incumbent partner displacement"
    ],
    "uncertainty": "Current D365 state not verified."
  },
  "createdBy": "agent:Atlas"
}
```

### Warmth (derived — don't send it)

Every company carries a computed `warmth: { score, label }`. You don't set it;
it grows as you log `email` / `call` / `reply` activity. Labels: Cold (0–19),
Warming (20–49), Warm (50–79), Hot (80–100). This is how the human sees which
companies are worth attention — so logging activity is how you make a card
"useful", not just present.

---

## 5. Errors you'll see

| Status | Meaning                                          |
| ------ | ------------------------------------------------ |
| `201`  | Created. Good.                                   |
| `200`  | OK (GET, or activity logged).                    |
| `400`  | Bad input — usually missing `name` or invalid `status`. The `error` field says what. |
| `403`  | **Delete attempted.** You can't delete. Stop.    |
| `404`  | Company `id` not found (activity on unknown id). |

Read the `error` string in the response body; it tells you what to fix.

---

## 6. A complete worked example

Goal: an agent named **Atlas** finds a lead and records it.

```bash
# 1. See what's already there (avoid duplicates)
curl http://localhost:8787/api/companies

# 2. Create the company
curl -X POST http://localhost:8787/api/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fabrikam Inc",
    "industry": "Aerospace",
    "size": 1500,
    "status": "New",
    "contactName": "Mira Okafor",
    "email": "mira@fabrikam.example",
    "phone": "+1 (206) 555-0199",
    "nextStep": { "type": "call", "note": "Discovery call next week." },
    "createdBy": "agent:Atlas"
  }'
# -> { "id": "fabrikam-inc-3f9c", "warmth": { "score": 0, "label": "Cold" }, ... }

# 3. (You send the intro email, then record that fact)
curl -X POST http://localhost:8787/api/companies/fabrikam-inc-3f9c/activity \
  -H "Content-Type: application/json" \
  -d '{ "type": "email" }'
# -> warmth now 20 (Warming)
```

---

## 7. Quick reference

```
POST   /api/companies                  create        ✓
GET    /api/companies                  list          ✓
PATCH  /api/companies/:id              update        ✓   (partial merge; preserves history)
POST   /api/companies/:id/activity     log activity  ✓
DELETE /api/companies/:id              delete        ✗ (agents: 403)
```

---

## 8. Warm-introduction relationships

Northwind also tracks target people, mutual contacts, routes, and route activity. Read before writing: use the IDs returned by the APIs and never guess a company or person ID.

```text
GET    /api/people                     list/search people
POST   /api/people                     create a target or mutual contact
PATCH  /api/people/:id                 edit a person or mutualPersonIds
POST   /api/people/:id/archive         archive a person and active routes
POST   /api/people/:id/restore         restore its archive operation
POST   /api/people/merge               merge a confirmed duplicate
GET    /api/routes                     list routes
POST   /api/routes                     create a route
PATCH  /api/routes/:id                 merge-update and append audit activity
POST   /api/routes/:id/actions         apply a route action and log activity
POST   /api/routes/:id/archive         archive without deleting history
POST   /api/routes/:id/restore         restore an archived route
POST   /api/routes/bulk/actions        assign or schedule active routes atomically
POST   /api/routes/:id/actions/:activityId/undo
                                        undo the latest reversible action within 30 seconds
GET    /api/activities                 list activity
POST   /api/activities                 add a note or explicit activity
```

Collection `GET` endpoints hide archived records unless `includeArchived=true` is supplied. Archive requests require `actor` and `reason`. Do not create routes using archived companies or people. A merge returns `409` when it would create a duplicate active target-mutual route.

People use `type: target | mutual | both`. A target stores any number of reusable mutual contacts in `mutualPersonIds`. Link the mutual to the target before creating a route.

Routes require `companyId`, `targetPersonId`, and `mutualPersonId`. Owners are `Paul | Jeremy | Nilhan | other | unassigned`; stages are `Found route | Mutual friend to contact | Intro requested | Intro agreed | Target contacted | Meeting / reply | Won | Dead / no route`; confidence is `strong | promising | emerging`.

Route actions are `call_mutual`, `message_mutual`, `intro_requested`, `intro_agreed`, `target_contacted`, `meeting_reply`, `mark_won`, `mark_dead`, `move_stage`, `reassign`, and `edit`. Send `actor` with every action. Won and Dead also require `reason`; move-stage needs `stage`; reassign needs `owner`; edit needs a `changes` object.

That's everything. Go make cards.
