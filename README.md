# Northwind CRM

Boutique D365 opportunity-tracking CRM for tracking outreach to UK/IE accounts.
A single-user shared-state CRM — every authenticated visitor sees the same data.

## Tech Stack

- **Runtime**: Node.js >= 18 (tested on 22)
- **Dependencies**: Zero. Pure Node.js `http` server, vanilla JS frontend.
- **Persistence**: Flat-file JSON (`companies.json`, `people.json`, `routes.json`, `activities.json`)
- **Auth**: Server-side session with SHA-256 password hash, `HttpOnly` cookie
- **Design**: Warm cream + burgundy palette, editorial serif display, premium boutique UI

## Quick Start

```bash
node server.js
```

Open `http://localhost:8787` — you'll be redirected to `/login`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Server listen port |
| `CRM_DATA_DIR` | `.` (project root) | Directory for JSON data files |
| `CRM_USERNAME` | `1bt-user` | Login username |
| `CRM_PASSWORD_HASH` | (see below) | SHA-256 hex of the password |
| `BYPASS_AUTH` | (unset) | Set to `1` to disable auth (testing only) |
| `NODE_ENV` | (unset) | Set to `production` for Hostinger |

### Setting the Password

The default password hash is for `1bt-pass`. To set a custom password:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('your-password').digest('hex'))"
```

Then set `CRM_PASSWORD_HASH` to the output.

## Scripts

- `npm test` — runs 22 API + UI contract tests
- `npm run start` — `node server.js`

## Project Structure

```
CRM/
├── server.js          # Backend API server
├── public/
│   ├── index.html     # SPA shell
│   ├── login.html     # Login page
│   ├── styles.css     # Design system (1919 lines)
│   ├── app.js         # Main SPA (companies CRUD, views)
│   ├── people.js      # People workspace
│   ├── relationships.js # Route tracker
│   └── ui.js          # Shared UI helpers, SVG icons
├── tests/
│   ├── hardening-api.test.js
│   ├── relationship-api.test.js
│   └── ui-contract.test.js
├── Data/              # JSON data files (auto-created)
├── Evidence/          # Audit, design, and deployment docs
├── AUTH.md            # Credential reference
└── README.md
```
