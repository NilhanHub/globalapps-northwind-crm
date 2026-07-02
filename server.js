// Northwind CRM — tiny local server (zero npm dependencies, pure Node http).
//
// Acts as the SINGLE SOURCE OF TRUTH so cards created by humans in the UI and
// cards POSTed by desktop agents land in the same list and persist to disk.
//
//   node server.js   ->   http://localhost:8787

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { createStores } from './lib/store.js';
import { createSessionStore } from './lib/session-store.js';
import { archiveRecord, restoreRecord, archiveInput } from './lib/archive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const DATA_DIR = process.env.CRM_DATA_DIR || ROOT;
const PUBLIC_DIR = path.join(ROOT, 'public');

// --- shared auth (single credential gate) -----------------------------------
// One shared username/password for all visitors. The login is only an access
// gate. Every authenticated user sees the same application state. No
// multi-tenancy, no per-user data, no role-based access control.
const CRM_USERNAME = process.env.CRM_USERNAME || '';
const CRM_PASSWORD_SCRYPT = process.env.CRM_PASSWORD_SCRYPT || '';
const BYPASS_AUTH = process.env.BYPASS_AUTH === '1' && process.env.NODE_ENV === 'test';
if (!BYPASS_AUTH && (!CRM_USERNAME || !CRM_PASSWORD_SCRYPT)) {
  throw new Error('CRM_USERNAME and CRM_PASSWORD_SCRYPT are required.');
}
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const sessions = new Map(); // token -> { createdAt }
const sessionStore = createSessionStore(DATA_DIR);
// Restore persisted sessions on startup
for (const [token, data] of Object.entries(sessionStore.load())) {
  sessions.set(token, data);
}
const SESSION_COOKIE = 'crm_session';
const MAX_FIELD_LENGTH = 2000;
const MAX_INTEL_FIELD_LENGTH = 5000;
const MAX_BODY_BYTES = 1024 * 100; // 100KB max request body
const STATIC_CACHE_MAX_AGE = 31536000; // 1 year for fingerprinted assets
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW = 60000;
const API_RATE_LIMIT = 60;
const API_RATE_WINDOW = 60000;
const JSON_PARSE_DEPTH_LIMIT = 20;
const loginAttempts = new Map();
const apiRateLimits = new Map();
const STATIC_ALLOW_LIST = ['/login', '/login.html', '/styles.css', '/ui.js', '/favicon.svg', '/robots.txt'];

// --- rate limiter -----------------------------------------------------------
function createRateLimit(store, max, windowMs) {
  return (key) => {
    const now = Date.now();
    const record = store.get(key);
    if (record && now < record.resetAt && record.count >= max) return false;
    if (!record || now >= record.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      record.count++;
    }
    return true;
  };
}

const checkLoginRate = createRateLimit(loginAttempts, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW);
const checkApiRate = createRateLimit(apiRateLimits, API_RATE_LIMIT, API_RATE_WINDOW);

// --- structured logger ------------------------------------------------------
function logEvent(level, message, meta = {}) {
  const entry = { time: new Date().toISOString(), level, msg: message, ...meta };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// --- safe JSON.parse with depth limit ---------------------------------------
function safeJsonParse(text) {
  let depth = 0;
  const parsed = JSON.parse(text, (key, value) => {
    if (key === '') return value;
    depth++;
    if (depth > JSON_PARSE_DEPTH_LIMIT) throw new Error('Object nesting too deep');
    return value;
  });
  return parsed;
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyPassword(password) {
  const [algorithm, , , , salt, expected] = CRM_PASSWORD_SCRYPT.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return safeEqual(derived, expected);
}

function persistSessions() {
  const obj = {};
  for (const [token, data] of sessions) obj[token] = data;
  sessionStore.save(obj);
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(crypto.createHash('sha256').update(token).digest('hex'), { createdAt: Date.now() });
  persistSessions();
  return token;
}

function getSession(token) {
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (!sessions.has(tokenHash)) return null;
  const session = sessions.get(tokenHash);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(tokenHash);
    persistSessions();
    return null;
  }
  return session;
}

function deleteSession(token) {
  sessions.delete(crypto.createHash('sha256').update(token).digest('hex'));
  persistSessions();
}

function isPublicPath(urlPath) {
  const p = urlPath.split('?')[0].split('#')[0];
  if (p.startsWith('/api/auth/')) return true;
  return STATIC_ALLOW_LIST.some((allowed) => p === allowed || p === allowed + '.html');
}

function authenticate(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  const session = getSession(token);
  if (session) return true;
  // For API requests, return 401. For page requests, redirect to login.
  if (req.url.startsWith('/api/')) {
    sendJSON(res, 401, { error: 'Authentication required' });
    return false;
  }
  // Serve login page for non-API requests without auth
  const urlPath = req.url.split('?')[0];
  if (urlPath !== '/login' && urlPath !== '/login.html') {
    res.writeHead(302, { Location: '/login' });
    res.end();
    return false;
  }
  return true; // let the login page through
}

function parseCookies(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return {};
  const result = {};
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return result;
}

// --- persistence -----------------------------------------------------------
const stores = createStores(DATA_DIR);
const loadCompanies = () => stores.load('companies');
const loadPeople = () => stores.load('people');
const loadRoutes = () => stores.load('routes');
const loadActivities = () => stores.load('activities');
const saveCompanies = (value) => stores.save('companies', value);
const savePeople = (value) => stores.save('people', value);
const saveRoutes = (value) => stores.save('routes', value);
const saveActivities = (value) => stores.save('activities', value);
const coordinatedWrite = (changes) => stores.transaction(changes);
const recoverCoordinatedWrite = () => stores.recover();

// --- domain logic ----------------------------------------------------------

// Warmth is DERIVED from activity, never stored. Returns { score, label }.
//   email = 20 pts, call = 25 pts, reply = 40 pts, capped at 100.
//   subtract 10 if the last activity is older than 14 days (keeps it honest).
const ACTIVITY_POINTS = { email: 20, call: 25, reply: 40 };
const WARMTH_BANDS = [
  { max: 19, label: 'Cold' },
  { max: 49, label: 'Warming' },
  { max: 79, label: 'Warm' },
  { max: 100, label: 'Hot' },
];

function computeWarmth(company) {
  const activity = Array.isArray(company.activity) ? company.activity : [];
  let score = 0;
  for (const act of activity) {
    score += ACTIVITY_POINTS[act.type] || 0;
  }
  score = Math.min(score, 100);

  const lastAt = latestActivityAt(activity);
  if (lastAt) {
    const ageDays = (Date.now() - new Date(lastAt).getTime()) / 86400000;
    if (ageDays > 14) score = Math.max(0, score - 10);
  }

  const label = (WARMTH_BANDS.find((b) => score <= b.max) || WARMTH_BANDS[0]).label;
  return { score, label };
}

function latestActivityAt(activity) {
  if (!activity.length) return null;
  return activity.reduce((latest, act) =>
    new Date(act.at) > new Date(latest) ? act.at : latest
  );
}

// Attach derived fields so the UI and API consumers always get fresh warmth.
function decorate(company) {
  return { ...company, warmth: computeWarmth(company) };
}

// Make a URL-safe, readable id from a name; falls back to a timestamp.
function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `co-${Date.now()}`;
}

// Normalize incoming POST bodies (agent or manual) into a valid company.
function normalizeCompany(input, existing) {
  const body = input || {};
  const now = new Date().toISOString();

  // Validate field lengths
  const strFields = ['name', 'industry', 'sector', 'country', 'contactName', 'email', 'phone', 'notes', 'createdBy'];
  for (const field of strFields) {
    if (body[field] && String(body[field]).length > MAX_FIELD_LENGTH) {
      const err = new Error(`${field} exceeds maximum length of ${MAX_FIELD_LENGTH}`);
      err.code = 'BAD_INPUT';
      throw err;
    }
  }
  if (body.nextStep?.note && body.nextStep.note.length > MAX_FIELD_LENGTH) {
    const err = new Error('nextStep.note exceeds maximum length');
    err.code = 'BAD_INPUT';
    throw err;
  }
  if (body.intel) {
    const intelStrFields = ['signal', 'signalType', 'whyItMatters', 'commercialOpening', 'evidenceUrl', 'uncertainty'];
    for (const field of intelStrFields) {
      if (body.intel[field] && String(body.intel[field]).length > MAX_INTEL_FIELD_LENGTH) {
        const err = new Error(`intel.${field} exceeds maximum length of ${MAX_INTEL_FIELD_LENGTH}`);
        err.code = 'BAD_INPUT';
        throw err;
      }
    }
    if (body.intel.doNotClaim && Array.isArray(body.intel.doNotClaim)) {
      for (const item of body.intel.doNotClaim) {
        if (item && String(item).length > MAX_INTEL_FIELD_LENGTH) {
          const err = new Error('intel.doNotClaim item exceeds maximum length');
          err.code = 'BAD_INPUT';
          throw err;
        }
      }
    }
  }

  // Merge so edits keep their fields; agents can send partial payloads.
  const name = String(body.name ?? existing?.name ?? '').trim();
  if (!name) {
    const err = new Error('Company name is required');
    err.code = 'BAD_INPUT';
    throw err;
  }

  return {
    id: existing?.id || `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    // --- Identity & context ---
    industry: String(body.industry ?? existing?.industry ?? '').trim(),
    size: Number.isFinite(Number(body.size)) ? Number(body.size) : (existing?.size ?? null),
    country: String(body.country ?? existing?.country ?? '').trim(),
    sector: String(body.sector ?? existing?.sector ?? '').trim(),

    status: validStatus(body.status) || existing?.status || 'New',

    // --- Layer 1: outreach / contact (the daily driver) ---
    contactName: String(body.contactName ?? existing?.contactName ?? '').trim(),
    email: String(body.email ?? existing?.email ?? '').trim(),
    phone: String(body.phone ?? existing?.phone ?? '').trim(),
    // Free-text working notes — the user's own running commentary on the account.
    notes: String(body.notes ?? existing?.notes ?? '').trim(),
    contacted: Boolean(body.contacted ?? existing?.contacted ?? false),
    nextStep: {
      type: body.nextStep?.type === 'call' ? 'call' : (existing?.nextStep?.type || 'email'),
      note: String(body.nextStep?.note ?? existing?.nextStep?.note ?? '').trim(),
    },
    // Concrete follow-up date (YYYY-MM-DD) — drives the "due today" view.
    followUpDate: (body.followUpDate !== undefined && validDate(body.followUpDate))
      ? body.followUpDate
      : (existing?.followUpDate || ''),
    lastContactAt: existing?.lastContactAt || '',
    activity: Array.isArray(existing?.activity) ? existing.activity : [],

    // --- Layer 2: opportunity intelligence (scroll-down context) ---
    // Populated from signal reports. Optional; cards without it simply omit the section.
    intel: normalizeIntel(body.intel, existing?.intel),

    createdAt: existing?.createdAt || now,
    // createdBy marks who/what created the card. "agent:<name>" signals machine-made.
    createdBy: existing?.createdBy || String(body.createdBy ?? 'Sam').trim() || 'Sam',
    ...(existing?.archivedAt ? {
      archivedAt: existing.archivedAt,
      archivedBy: existing.archivedBy,
      archiveReason: existing.archiveReason,
      archiveOperationId: existing.archiveOperationId,
    } : {}),
  };
}

// Opportunity intelligence — the "why this company is worth calling" layer.
// Mirrors the structure of the D365 signal reports: a signal, its strength tier,
// why it matters, how to open, the evidence, and the do-not-claim guardrails.
const VALID_TIERS = ['Strong', 'Promising', 'Emerging'];
function normalizeIntel(input, existing) {
  const i = input || {};
  const e = existing || {};
  const tier = VALID_TIERS.includes(i.signalTier) ? i.signalTier
    : (VALID_TIERS.includes(e.signalTier) ? e.signalTier : '');
  // An intel block only exists if it has at least a signal line; otherwise null
  // so the UI knows not to render the section at all.
  const signal = String(i.signal ?? e.signal ?? '').trim();
  const out = {
    signal,
    signalType: String(i.signalType ?? e.signalType ?? '').trim(),
    signalTier: tier,
    whyItMatters: String(i.whyItMatters ?? e.whyItMatters ?? '').trim(),
    commercialOpening: String(i.commercialOpening ?? e.commercialOpening ?? '').trim(),
    evidenceUrl: String(i.evidenceUrl ?? e.evidenceUrl ?? '').trim(),
    doNotClaim: Array.isArray(i.doNotClaim) ? i.doNotClaim.map((s) => String(s).trim()).filter(Boolean)
      : (Array.isArray(e.doNotClaim) ? e.doNotClaim : []),
    uncertainty: String(i.uncertainty ?? e.uncertainty ?? '').trim(),
  };
  return signal || tier || out.whyItMatters || out.commercialOpening ? out : null;
}

const VALID_STATUSES = ['New', 'Contacted', 'Awaiting reply', 'Won', 'Lost'];
function validStatus(s) {
  return VALID_STATUSES.includes(s) ? s : '';
}

const PERSON_TYPES = ['target', 'mutual', 'both'];
const ROUTE_OWNERS = ['Paul', 'Jeremy', 'Nilhan', 'other', 'unassigned'];
const ROUTE_STAGES = [
  'Found route',
  'Mutual friend to contact',
  'Intro requested',
  'Intro agreed',
  'Target contacted',
  'Meeting / reply',
  'Won',
  'Dead / no route',
];
const CONFIDENCE_LEVELS = ['strong', 'promising', 'emerging'];
const OUTCOMES = ['pending', 'won', 'dead'];
const ACTIVITY_TYPES = [
  'note', 'call', 'email', 'whatsapp', 'linkedin', 'intro_requested',
  'intro_agreed', 'target_contacted', 'meeting', 'won', 'dead', 'edit',
  'reassignment', 'archive', 'restore', 'merge', 'undo',
];
const ACTIVE_ROUTE_STAGES = ROUTE_STAGES.filter((stage) => !['Won', 'Dead / no route'].includes(stage));

function inputError(message, code = 'BAD_INPUT') {
  const err = new Error(message);
  err.code = code;
  return err;
}

function cleanString(value) {
  return String(value ?? '').trim();
}

function normalizedName(value) {
  return cleanString(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizedLinkedIn(value) {
  return cleanString(value).toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

function peopleAreDuplicateCandidates(left, right) {
  if (left.id === right.id || left.archivedAt || right.archivedAt) return false;
  const leftLinkedIn = normalizedLinkedIn(left.linkedinUrl);
  const rightLinkedIn = normalizedLinkedIn(right.linkedinUrl);
  if (leftLinkedIn && rightLinkedIn && leftLinkedIn === rightLinkedIn) return true;
  if (!normalizedName(left.name) || normalizedName(left.name) !== normalizedName(right.name)) return false;
  const compatibleType = left.type === right.type || left.type === 'both' || right.type === 'both';
  if (!compatibleType) return false;
  const targetLike = ['target', 'both'].includes(left.type) && ['target', 'both'].includes(right.type);
  return !targetLike || left.companyId === right.companyId;
}

function enrichPeople(people, routes, activities) {
  return people.map((person) => {
    const linkedTargetCount = people.filter((candidate) => !candidate.archivedAt
      && (candidate.mutualPersonIds || []).includes(person.id)).length;
    const relationshipCount = ['target', 'both'].includes(person.type)
      ? (person.mutualPersonIds || []).filter((id) => people.some((candidate) => candidate.id === id && !candidate.archivedAt)).length
      : linkedTargetCount;
    const personRoutes = routes.filter((route) => route.targetPersonId === person.id || route.mutualPersonId === person.id);
    const activeRouteCount = personRoutes.filter((route) => !route.archivedAt && ACTIVE_ROUTE_STAGES.includes(route.stage)).length;
    const routeIds = new Set(personRoutes.map((route) => route.id));
    const lastActivityAt = activities.filter((activity) => routeIds.has(activity.routeId))
      .map((activity) => activity.timestamp).sort().at(-1) || '';
    return {
      ...person,
      relationshipCount,
      activeRouteCount,
      lastActivityAt,
      duplicateCandidateIds: people.filter((candidate) => peopleAreDuplicateCandidates(person, candidate)).map((candidate) => candidate.id),
    };
  });
}

function routeState(route) {
  return Object.fromEntries(['owner', 'stage', 'confidence', 'nextAction', 'dueDate', 'outcome', 'notes']
    .map((key) => [key, route[key]]));
}

function validDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function findCompany(companies, id) {
  return companies.find((company) => company.id === id);
}

function normalizePerson(input, existing, context) {
  const body = input || {};
  const now = new Date().toISOString();
  const name = cleanString(body.name ?? existing?.name);
  if (!name) throw inputError('Person name is required');

  const type = body.type ?? existing?.type ?? 'target';
  if (!PERSON_TYPES.includes(type)) throw inputError(`type must be one of: ${PERSON_TYPES.join(', ')}`);

  const companyId = cleanString(body.companyId ?? existing?.companyId);
  const company = companyId ? findCompany(context.companies, companyId) : null;
  if (companyId && !company) throw inputError('companyId must reference an existing company');
  if (company?.archivedAt) throw inputError('companyId must reference an active company', 'CONFLICT');

  const mutualPersonIds = body.mutualPersonIds === undefined
    ? (Array.isArray(existing?.mutualPersonIds) ? existing.mutualPersonIds : [])
    : [...new Set(Array.isArray(body.mutualPersonIds) ? body.mutualPersonIds.map(cleanString).filter(Boolean) : [])];
  if (body.mutualPersonIds !== undefined && !Array.isArray(body.mutualPersonIds)) {
    throw inputError('mutualPersonIds must be an array');
  }
  if (mutualPersonIds.includes(existing?.id)) throw inputError('A person cannot be their own mutual contact');
  for (const id of mutualPersonIds) {
    const mutual = context.people.find((person) => person.id === id);
    if (!mutual || mutual.archivedAt || !['mutual', 'both'].includes(mutual.type)) {
      throw inputError(`mutualPersonIds contains an invalid mutual contact: ${id}`);
    }
  }
  if (existing && context.routes) {
    const removedIds = (existing.mutualPersonIds || []).filter((id) => !mutualPersonIds.includes(id));
    const activeRoute = context.routes.find((route) => route.targetPersonId === existing.id
      && removedIds.includes(route.mutualPersonId)
      && ACTIVE_ROUTE_STAGES.includes(route.stage));
    if (activeRoute) throw inputError('End the active route before unlinking its mutual contact', 'CONFLICT');
  }

  return {
    id: existing?.id || `person-${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    title: cleanString(body.title ?? existing?.title),
    companyId,
    companyName: cleanString(body.companyName ?? existing?.companyName ?? company?.name),
    location: cleanString(body.location ?? existing?.location),
    linkedinUrl: cleanString(body.linkedinUrl ?? existing?.linkedinUrl),
    type,
    notes: cleanString(body.notes ?? existing?.notes),
    mutualPersonIds: ['target', 'both'].includes(type) ? mutualPersonIds : [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...(existing?.archivedAt ? {
      archivedAt: existing.archivedAt,
      archivedBy: existing.archivedBy,
      archiveReason: existing.archiveReason,
      archiveOperationId: existing.archiveOperationId,
      ...(existing.mergedIntoPersonId ? { mergedIntoPersonId: existing.mergedIntoPersonId } : {}),
    } : {}),
  };
}

function routeContext(input, existing, context) {
  const companyId = cleanString(input.companyId ?? existing?.companyId);
  const targetPersonId = cleanString(input.targetPersonId ?? existing?.targetPersonId);
  const mutualPersonId = cleanString(input.mutualPersonId ?? existing?.mutualPersonId);
  const company = findCompany(context.companies, companyId);
  const target = context.people.find((person) => person.id === targetPersonId);
  const mutual = context.people.find((person) => person.id === mutualPersonId);
  if (!company || company.archivedAt) throw inputError('companyId must reference an active company');
  if (!target || target.archivedAt || !['target', 'both'].includes(target.type)) throw inputError('targetPersonId must reference an active target person');
  if (target.companyId && target.companyId !== companyId) throw inputError('Target person belongs to a different company');
  if (!mutual || mutual.archivedAt || !['mutual', 'both'].includes(mutual.type)) throw inputError('mutualPersonId must reference an active mutual contact');
  if (!target.mutualPersonIds?.includes(mutualPersonId)) throw inputError('Mutual contact must be linked to the target first');
  return { companyId, targetPersonId, mutualPersonId, company, target, mutual };
}

function normalizeRoute(input, existing, context) {
  const body = input || {};
  const now = new Date().toISOString();
  const refs = routeContext(body, existing, context);
  const owner = body.owner ?? existing?.owner ?? 'unassigned';
  const stage = body.stage ?? existing?.stage ?? 'Found route';
  const confidence = body.confidence ?? existing?.confidence ?? 'emerging';
  const outcome = body.outcome ?? existing?.outcome ?? 'pending';
  const dueDate = cleanString(body.dueDate ?? existing?.dueDate);
  if (!ROUTE_OWNERS.includes(owner)) throw inputError(`owner must be one of: ${ROUTE_OWNERS.join(', ')}`);
  if (!ROUTE_STAGES.includes(stage)) throw inputError(`stage must be one of: ${ROUTE_STAGES.join(', ')}`);
  if (!CONFIDENCE_LEVELS.includes(confidence)) throw inputError(`confidence must be one of: ${CONFIDENCE_LEVELS.join(', ')}`);
  if (!OUTCOMES.includes(outcome)) throw inputError(`outcome must be one of: ${OUTCOMES.join(', ')}`);
  if (!validDate(dueDate)) throw inputError('dueDate must be empty or use YYYY-MM-DD');

  return {
    id: existing?.id || `route-${slugify(refs.company.name)}-${Math.random().toString(36).slice(2, 7)}`,
    companyId: refs.companyId,
    companyName: refs.company.name,
    targetPersonId: refs.targetPersonId,
    mutualPersonId: refs.mutualPersonId,
    owner,
    stage,
    confidence,
    nextAction: cleanString(body.nextAction ?? existing?.nextAction),
    dueDate,
    outcome,
    notes: cleanString(body.notes ?? existing?.notes),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...(existing?.archivedAt ? {
      archivedAt: existing.archivedAt,
      archivedBy: existing.archivedBy,
      archiveReason: existing.archiveReason,
      archiveOperationId: existing.archiveOperationId,
    } : {}),
  };
}

function assertNoDuplicateActiveRoute(candidate, routes, excludeId = '') {
  if (!ACTIVE_ROUTE_STAGES.includes(candidate.stage)) return;
  const duplicate = routes.find((route) => route.id !== excludeId
    && ACTIVE_ROUTE_STAGES.includes(route.stage)
    && route.companyId === candidate.companyId
    && route.targetPersonId === candidate.targetPersonId
    && route.mutualPersonId === candidate.mutualPersonId);
  if (duplicate) throw inputError('An active route already exists for this target and mutual contact', 'CONFLICT');
}

function normalizeActivity(input, context) {
  const body = input || {};
  const routeId = cleanString(body.routeId);
  const route = context.routes.find((item) => item.id === routeId);
  if (!route) throw inputError('routeId must reference an existing route');
  const companyId = cleanString(body.companyId || route.companyId);
  if (companyId !== route.companyId) throw inputError('companyId must match the route company');
  const type = body.type || 'note';
  if (!ACTIVITY_TYPES.includes(type)) throw inputError(`type must be one of: ${ACTIVITY_TYPES.join(', ')}`);
  const timestamp = cleanString(body.timestamp) || new Date().toISOString();
  if (Number.isNaN(new Date(timestamp).getTime())) throw inputError('timestamp must be a valid ISO date');
  const actor = cleanString(body.actor) || 'Unknown';
  const summary = cleanString(body.summary);
  if (!summary) throw inputError('Activity summary is required');
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    routeId,
    companyId,
    actor,
    type,
    summary,
    details: cleanString(body.details),
    reason: cleanString(body.reason),
    ...(body.previousState && typeof body.previousState === 'object' ? { previousState: body.previousState } : {}),
    ...(body.resultingState && typeof body.resultingState === 'object' ? { resultingState: body.resultingState } : {}),
    ...(body.reversibleUntil ? { reversibleUntil: body.reversibleUntil } : {}),
    ...(body.undoOfActivityId ? { undoOfActivityId: body.undoOfActivityId } : {}),
    timestamp: new Date(timestamp).toISOString(),
  };
}

const ACTIONS = {
  call_mutual: { type: 'call', summary: 'Logged a call to the mutual contact' },
  message_mutual: { type: 'email', summary: 'Logged an email or message to the mutual contact' },
  intro_requested: { type: 'intro_requested', stage: 'Intro requested', summary: 'Introduction requested' },
  intro_agreed: { type: 'intro_agreed', stage: 'Intro agreed', summary: 'Introduction agreed' },
  target_contacted: { type: 'target_contacted', stage: 'Target contacted', summary: 'Target contacted' },
  meeting_reply: { type: 'meeting', stage: 'Meeting / reply', summary: 'Meeting or reply recorded' },
  mark_won: { type: 'won', stage: 'Won', outcome: 'won', summary: 'Route marked won' },
  mark_dead: { type: 'dead', stage: 'Dead / no route', outcome: 'dead', summary: 'Route marked dead' },
};

// --- tiny HTTP helpers -----------------------------------------------------

const CSP_HEADER = "default-src 'self'; style-src 'self' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; form-action 'self'";

const CACHE_IMMUTABLE = `public, max-age=${STATIC_CACHE_MAX_AGE}, immutable`;
const CACHE_NO_CACHE = 'no-cache';

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Security-Policy': CSP_HEADER,
  };
  writeResponse(res, status, headers, body);
}

// Write a response with optional Brotli compression for bodies > 1KB when the
// client advertises Brotli support. Falls back to plain text on error.
function writeResponse(res, status, headers, body) {
  headers = { ...headers };
  if (body.length > 1024 && acceptsBrotli(res.req)) {
    try {
      const compressed = zlib.brotliCompressSync(Buffer.from(body, 'utf8'));
      headers['Content-Encoding'] = 'br';
      headers['Content-Length'] = compressed.length;
      res.writeHead(status, headers);
      res.end(compressed);
      return;
    } catch (err) {
      logEvent('warn', 'Brotli compression failed, sending uncompressed', { error: err.message });
    }
  }
  headers['Content-Length'] = Buffer.byteLength(body, 'utf8');
  res.writeHead(status, headers);
  res.end(body);
}

function acceptsBrotli(req) {
  const enc = req.headers['accept-encoding'] || '';
  return enc.includes('br');
}

// Like sendJSON, but supports conditional GET via ETags. Computes a fast hash of
// the payload and returns 304 if the client already has the latest version.
function respondWithJSON(res, status, payload, req) {
  const body = JSON.stringify(payload);
  const etag = `W/"${crypto.createHash('sha1').update(body).digest('base64')}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, {
      'Content-Security-Policy': CSP_HEADER,
      'ETag': etag,
    });
    res.end();
    return;
  }
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Security-Policy': CSP_HEADER,
    'ETag': etag,
    'Cache-Control': CACHE_NO_CACHE,
  };
  writeResponse(res, status, headers, body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy(new Error('Request body too large'));
        const e = new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
        e.code = 'BAD_INPUT';
        reject(e);
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(safeJsonParse(raw));
      } catch (err) {
        const e = new Error(err.message === 'Object nesting too deep' ? 'Request body nesting too deep' : 'Invalid JSON body');
        e.code = 'BAD_INPUT';
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Serve a static file from /public with a minimal content-type map.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  else if (urlPath === '/login') urlPath = '/login.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^([/\\])+/, ''));

  // Keep requests inside /public (no path traversal).
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJSON(res, 403, { error: 'Forbidden' });
    return true;
  }

  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);

    // Cache policy: fingerprinted assets (CSS, JS) get far-future cache;
    // HTML and others get no-cache so updates are picked up immediately.
    const isImmutable = ext === '.css' || ext === '.js' || ext === '.svg' || ext === '.ico';
    const cacheControl = isImmutable ? CACHE_IMMUTABLE : CACHE_NO_CACHE;

    // ETag from file mtime + size for conditional GETs
    const etag = `W/"${stat.mtimeMs}-${stat.size}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'Content-Security-Policy': CSP_HEADER });
      res.end();
      return true;
    }

    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Security-Policy': CSP_HEADER,
      'Cache-Control': cacheControl,
      'ETag': etag,
    };
    // Serve compressed when beneficial (CSS/JS > 1KB)
    const content = fs.readFileSync(filePath);
    if (content.length > 1024 && (ext === '.css' || ext === '.js' || ext === '.html') && acceptsBrotli(req)) {
      try {
        const compressed = zlib.brotliCompressSync(content);
        headers['Content-Encoding'] = 'br';
        headers['Content-Length'] = compressed.length;
        res.writeHead(200, headers);
        res.end(compressed);
        return true;
      } catch (err) {
        logEvent('warn', 'Brotli compression failed for static file', { file: urlPath, error: err.message });
      }
    }
    headers['Content-Length'] = content.length;
    res.writeHead(200, headers);
    res.end(content);
    return true;
  } catch (err) {
    logEvent('error', 'Static file serve error', { file: urlPath, error: err.message });
    return false;
  }
}

// --- request router --------------------------------------------------------

async function handleAPI(req, res) {
  const method = req.method;
  const url = req.url.split('?')[0];
  const apiBase = '/api/companies';

  // CORS preflight for any API path.
  if (method === 'OPTIONS') { sendJSON(res, 204, {}); return; }

  // --- AUTH ENDPOINTS (always public) ---
  if (method === 'POST' && url === '/api/auth/login') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (!checkLoginRate(ip)) {
      sendJSON(res, 429, { error: 'Too many login attempts. Try again in 60 seconds.' });
      return;
    }
    let body;
    try { body = await readBody(req); }
    catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) return sendJSON(res, 400, { error: 'Username and password required' });
    if (!safeEqual(username, CRM_USERNAME) || !verifyPassword(password)) {
      return sendJSON(res, 401, { error: 'Invalid credentials' });
    }
    const token = createSession();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (method === 'POST' && url === '/api/auth/logout') {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    if (token) deleteSession(token);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (method === 'GET' && url === '/api/auth/session') {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    const session = getSession(token);
    sendJSON(res, 200, { authenticated: !!session });
    return;
  }

  // --- AUTH GUARD (all remaining API endpoints require a valid session) ---
  if (!BYPASS_AUTH) {
    const cookies = parseCookies(req);
    const sessionToken = cookies[SESSION_COOKIE];
    if (!getSession(sessionToken)) {
      sendJSON(res, 401, { error: 'Authentication required' });
      return;
    }
  }

  // --- CSRF check for mutating requests (skip auth endpoints and GET) ---
  if (!BYPASS_AUTH && ['POST', 'PATCH', 'DELETE'].includes(method)
      && url !== '/api/auth/login' && url !== '/api/auth/logout') {
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    const local = (s) => s.startsWith('http://localhost') || s.startsWith('http://127.0.0.1');
    if (origin && !local(origin) && referer && !local(referer)) {
      sendJSON(res, 403, { error: 'CSRF check failed' });
      return;
    }
  }

  // --- Rate limit for mutation endpoints ---
  if (['POST', 'PATCH', 'DELETE'].includes(method)) {
    const ip = req.socket.remoteAddress || 'unknown';
    if (!checkApiRate(ip)) {
      sendJSON(res, 429, { error: 'Too many requests. Try again later.' });
      return;
    }
  }

  // GET /api/companies
  if (method === 'GET' && url === apiBase) {
    const includeArchived = new URL(req.url, 'http://localhost').searchParams.get('includeArchived') === 'true';
    const all = loadCompanies().filter((company) => includeArchived || !company.archivedAt).map(decorate);
    respondWithJSON(res, 200, all, req);
    return;
  }

  // GET /api/companies/export.csv — CSV download of the pipeline.
  if (method === 'GET' && url === `${apiBase}/export.csv`) {
    const all = loadCompanies().filter((c) => !c.archivedAt).map(decorate);
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const cols = ['Name', 'Status', 'Sector', 'Country', 'Industry', 'Employees', 'Contact', 'Email', 'Phone',
      'Signal tier', 'Signal', 'Warmth score', 'Warmth label', 'Last contact', 'Next step', 'Notes', 'Created at'];
    const rows = all.map((c) => [
      c.name, c.status, c.sector, c.country, c.industry, c.size, c.contactName, c.email, c.phone,
      c.intel?.signalTier || '', (c.intel?.signal || '').replace(/\n/g, ' '),
      c.warmth?.score, c.warmth?.label, c.lastContactAt, `${c.nextStep?.type || ''} — ${c.nextStep?.note || ''}`,
      (c.notes || '').replace(/\n/g, ' '), c.createdAt
    ].map(esc).join(','));
    const csv = [cols.join(','), ...rows].join('\r\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="northwind-crm-export.csv"',
    });
    res.end(csv);
    return;
  }

  // POST /api/companies   (manual or agent create)
  if (method === 'POST' && url === apiBase) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }

    try {
      const companies = loadCompanies();
      const company = normalizeCompany(body);
      companies.push(company);
      saveCompanies(companies);
      sendJSON(res, 201, decorate(company));
    } catch (err) {
      const status = err.code === 'BAD_INPUT' ? 400 : 500;
      sendJSON(res, status, { error: err.message });
    }
    return;
  }

  // POST /api/companies/:id/activity  -> log email/call/reply
  const activityMatch = url.match(new RegExp(`^${apiBase}/([^/]+)/activity$`));
  if (method === 'POST' && activityMatch) {
    const id = decodeURIComponent(activityMatch[1]);
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }

    const type = body.type;
    if (!['email', 'call', 'reply'].includes(type)) {
      return sendJSON(res, 400, { error: 'type must be one of: email, call, reply' });
    }

    const companies = loadCompanies();
    const company = companies.find((c) => c.id === id);
    if (!company) return sendJSON(res, 404, { error: 'Company not found' });
    if (company.archivedAt) return sendJSON(res, 409, { error: 'Restore the company before logging activity' });

    const at = body.at || new Date().toISOString();
    company.activity.push({ type, at });
    company.lastContactAt = at;
    // Reply moves us to "Awaiting reply"; a sent email/call marks "Contacted".
    if (type === 'reply' && company.status === 'New') company.status = 'Awaiting reply';
    else if (type !== 'reply' && company.status === 'New') company.status = 'Contacted';

    saveCompanies(companies);
    sendJSON(res, 200, decorate(company));
    return;
  }

  // PATCH /api/companies/:id  -> merge-update an existing company.
  //
  // This is the proper edit path: it merges the incoming fields onto the stored
  // record and PRESERVES everything not mentioned (activity history, intel block,
  // createdAt, createdBy). Status changes from board drag-drop land here too.
  // Agents may PATCH (write-only, like create); only DELETE is UI-restricted.
  const patchMatch = url.match(new RegExp(`^${apiBase}/([^/]+)$`));
  if (method === 'PATCH' && patchMatch) {
    const id = decodeURIComponent(patchMatch[1]);
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }

    try {
      const companies = loadCompanies();
      const existing = companies.find((c) => c.id === id);
      if (!existing) return sendJSON(res, 404, { error: 'Company not found' });
      if (existing.archivedAt) return sendJSON(res, 409, { error: 'Restore the company before editing it' });

      // Validate an explicitly-provided status rather than silently ignoring it.
      // (normalizeCompany would fall back to the existing value, masking a bad input.)
      if (Object.prototype.hasOwnProperty.call(body, 'status')
          && body.status !== undefined
          && !VALID_STATUSES.includes(body.status)) {
        return sendJSON(res, 400, { error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      const merged = normalizeCompany(body, existing);
      // normalizeCompany regenerates the object, so replace the stored record
      // at the same index to keep array order stable.
      const idx = companies.findIndex((c) => c.id === id);
      companies[idx] = merged;
      saveCompanies(companies);
      sendJSON(res, 200, decorate(merged));
    } catch (err) {
      const status = err.code === 'BAD_INPUT' ? 400 : 500;
      sendJSON(res, status, { error: err.message });
    }
    return;
  }

  const companyArchiveMatch = url.match(new RegExp(`^${apiBase}/([^/]+)/(archive|restore)$`));
  if (method === 'POST' && companyArchiveMatch) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const id = decodeURIComponent(companyArchiveMatch[1]);
      const action = companyArchiveMatch[2];
      const companies = loadCompanies();
      const people = loadPeople();
      const routes = loadRoutes();
      const activities = loadActivities();
      const companyIndex = companies.findIndex((company) => company.id === id);
      if (companyIndex < 0) return sendJSON(res, 404, { error: 'Company not found' });

      if (action === 'archive') {
        const { actor, reason } = archiveInput(body);
        if (companies[companyIndex].archivedAt) throw inputError('Company is already archived', 'CONFLICT');
        const operationId = `archive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        companies[companyIndex] = archiveRecord(companies[companyIndex], actor, reason, operationId);
        let peopleArchived = 0;
        let routesArchived = 0;
        for (let index = 0; index < people.length; index += 1) {
          if (people[index].companyId === id && !people[index].archivedAt) {
            people[index] = archiveRecord(people[index], actor, reason, operationId);
            peopleArchived += 1;
          }
        }
        for (let index = 0; index < routes.length; index += 1) {
          if (routes[index].companyId === id && !routes[index].archivedAt && ACTIVE_ROUTE_STAGES.includes(routes[index].stage)) {
            const previousRoute = routes[index];
            routes[index] = archiveRecord(routes[index], actor, reason, operationId);
            activities.push(normalizeActivity({
              routeId: routes[index].id, companyId: id, actor, type: 'archive',
              summary: `Route archived with ${companies[companyIndex].name}`, reason,
              previousState: routeState(previousRoute), resultingState: routeState(routes[index]),
            }, { routes }));
            routesArchived += 1;
          }
        }
        coordinatedWrite({ companies, people, routes, activities });
        return sendJSON(res, 200, { company: decorate(companies[companyIndex]), peopleArchived, routesArchived });
      }

      const actor = cleanString(body.actor);
      if (!actor) throw inputError('actor is required');
      const company = companies[companyIndex];
      if (!company.archivedAt) throw inputError('Company is not archived', 'CONFLICT');
      const operationId = company.archiveOperationId;
      const restoreReason = company.archiveReason;
      companies[companyIndex] = restoreRecord(company);
      let peopleRestored = 0;
      let routesRestored = 0;
      for (let index = 0; index < people.length; index += 1) {
        if (people[index].archiveOperationId === operationId) {
          people[index] = restoreRecord(people[index]);
          peopleRestored += 1;
        }
      }
      for (let index = 0; index < routes.length; index += 1) {
        if (routes[index].archiveOperationId === operationId) {
          const previousRoute = routes[index];
          routes[index] = restoreRecord(routes[index]);
          activities.push(normalizeActivity({
            routeId: routes[index].id, companyId: id, actor, type: 'restore',
            summary: `Route restored with ${companies[companyIndex].name}`, reason: restoreReason,
            previousState: routeState(previousRoute), resultingState: routeState(routes[index]),
          }, { routes }));
          routesRestored += 1;
        }
      }
      coordinatedWrite({ companies, people, routes, activities });
      return sendJSON(res, 200, { company: decorate(companies[companyIndex]), peopleRestored, routesRestored });
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  // DELETE /api/companies/:id
  //
  // WRITE-ONLY access for agents: deletion is reserved for the human UI.
  // The browser sends `X-Source: ui` on deletes; any request without it is
  // treated as an agent and refused with 403. Agents can create & log, never delete.
  const deleteMatch = url.match(new RegExp(`^${apiBase}/([^/]+)$`));
  if (method === 'DELETE' && deleteMatch) {
    if ((req.headers['x-source'] || '').toLowerCase() !== 'ui') {
      sendJSON(res, 403, {
        error: 'Delete is not available to agents. Only the human UI may delete.',
      });
      return;
    }
    const id = decodeURIComponent(deleteMatch[1]);
    const companies = loadCompanies();
    const company = companies.find((item) => item.id === id);
    if (!company) return sendJSON(res, 404, { error: 'Company not found' });
    if (!company.archivedAt) return sendJSON(res, 409, { error: 'Archive the company before permanent deletion' });
    const hasDependencies = loadPeople().some((person) => person.companyId === id)
      || loadRoutes().some((route) => route.companyId === id)
      || loadActivities().some((activity) => activity.companyId === id);
    if (hasDependencies) return sendJSON(res, 409, { error: 'Company has dependent people, routes, or activities' });
    const next = companies.filter((c) => c.id !== id);
    saveCompanies(next);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // Relationship intelligence: people, routes, and route activities.
  const peopleBase = '/api/people';
  const routesBase = '/api/routes';
  const activitiesBase = '/api/activities';

  if (method === 'GET' && url === peopleBase) {
    const parsed = new URL(req.url, 'http://localhost');
    const companyId = parsed.searchParams.get('companyId');
    const type = parsed.searchParams.get('type');
    const includeArchived = parsed.searchParams.get('includeArchived') === 'true';
    const allPeople = loadPeople();
    const routes = loadRoutes();
    const activities = loadActivities();
    const archivedCompanyIds = new Set(loadCompanies().filter((company) => company.archivedAt).map((company) => company.id));
    let people = enrichPeople(allPeople, routes, activities)
      .filter((person) => includeArchived || (!person.archivedAt && !archivedCompanyIds.has(person.companyId)));
    if (companyId) people = people.filter((person) => person.companyId === companyId);
    if (type) people = people.filter((person) => person.type === type || person.type === 'both');
    return respondWithJSON(res, 200, people, req);
  }

  if (method === 'POST' && url === `${peopleBase}/merge`) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const survivorId = cleanString(body.survivorId);
      const sourceId = cleanString(body.sourceId);
      const actor = cleanString(body.actor);
      const reason = cleanString(body.reason);
      if (!survivorId || !sourceId || survivorId === sourceId) throw inputError('Distinct survivorId and sourceId are required');
      if (!actor || !reason) throw inputError('actor and merge reason are required');
      const people = loadPeople();
      const routes = loadRoutes();
      const survivorIndex = people.findIndex((person) => person.id === survivorId);
      const sourceIndex = people.findIndex((person) => person.id === sourceId);
      if (survivorIndex < 0 || sourceIndex < 0) return sendJSON(res, 404, { error: 'Merge person not found' });
      const survivor = people[survivorIndex];
      const source = people[sourceIndex];
      if (survivor.archivedAt || source.archivedAt) throw inputError('Only active people can be merged', 'CONFLICT');
      if (survivor.companyId && source.companyId && survivor.companyId !== source.companyId
          && ['target', 'both'].includes(survivor.type) && ['target', 'both'].includes(source.type)) {
        throw inputError('Targets from different companies cannot be merged', 'CONFLICT');
      }
      const mergedType = survivor.type === source.type ? survivor.type : 'both';
      const merged = {
        ...survivor,
        name: survivor.name || source.name,
        title: survivor.title || source.title,
        companyId: survivor.companyId || source.companyId,
        companyName: survivor.companyName || source.companyName,
        location: survivor.location || source.location,
        linkedinUrl: survivor.linkedinUrl || source.linkedinUrl,
        notes: [survivor.notes, source.notes].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join('\n\n'),
        type: mergedType,
        mutualPersonIds: [...new Set([...(survivor.mutualPersonIds || []), ...(source.mutualPersonIds || [])])]
          .filter((id) => id !== survivorId && id !== sourceId),
        updatedAt: new Date().toISOString(),
      };
      people[survivorIndex] = merged;
      for (let index = 0; index < people.length; index += 1) {
        people[index] = {
          ...people[index],
          mutualPersonIds: [...new Set((people[index].mutualPersonIds || []).map((id) => id === sourceId ? survivorId : id))]
            .filter((id) => id !== people[index].id),
        };
      }
      const operationId = `merge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      people[sourceIndex] = {
        ...archiveRecord(source, actor, reason, operationId),
        mergedIntoPersonId: survivorId,
      };
      const rewrittenRoutes = routes.map((item) => ({
        ...item,
        targetPersonId: item.targetPersonId === sourceId ? survivorId : item.targetPersonId,
        mutualPersonId: item.mutualPersonId === sourceId ? survivorId : item.mutualPersonId,
      }));
      const activeKeys = new Set();
      for (const item of rewrittenRoutes.filter((candidate) => !candidate.archivedAt && ACTIVE_ROUTE_STAGES.includes(candidate.stage))) {
        const key = `${item.companyId}|${item.targetPersonId}|${item.mutualPersonId}`;
        if (activeKeys.has(key)) throw inputError('Merge would create duplicate active routes', 'CONFLICT');
        activeKeys.add(key);
      }
      coordinatedWrite({ people, routes: rewrittenRoutes });
      return sendJSON(res, 200, { survivor: people[survivorIndex], source: people[sourceIndex] });
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  if (method === 'POST' && url === peopleBase) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const people = loadPeople();
      const person = normalizePerson(body, null, { people, companies: loadCompanies(), routes: loadRoutes() });
      people.push(person);
      savePeople(people);
      return sendJSON(res, 201, person);
    } catch (err) {
      return sendJSON(res, err.code === 'BAD_INPUT' ? 400 : 500, { error: err.message });
    }
  }

  const personMatch = url.match(/^\/api\/people\/([^/]+)$/);
  if (method === 'PATCH' && personMatch) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const id = decodeURIComponent(personMatch[1]);
      const people = loadPeople();
      const index = people.findIndex((person) => person.id === id);
      if (index < 0) return sendJSON(res, 404, { error: 'Person not found' });
      if (people[index].archivedAt) return sendJSON(res, 409, { error: 'Restore the person before editing' });
      const person = normalizePerson(body, people[index], { people, companies: loadCompanies(), routes: loadRoutes() });
      people[index] = person;
      savePeople(people);
      return sendJSON(res, 200, person);
    } catch (err) {
      return sendJSON(res, err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500, { error: err.message });
    }
  }

  const personArchiveMatch = url.match(/^\/api\/people\/([^/]+)\/(archive|restore)$/);
  if (method === 'POST' && personArchiveMatch) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const id = decodeURIComponent(personArchiveMatch[1]);
      const action = personArchiveMatch[2];
      const people = loadPeople();
      const routes = loadRoutes();
      const activities = loadActivities();
      const index = people.findIndex((person) => person.id === id);
      if (index < 0) return sendJSON(res, 404, { error: 'Person not found' });
      if (action === 'archive') {
        const { actor, reason } = archiveInput(body);
        if (people[index].archivedAt) throw inputError('Person is already archived', 'CONFLICT');
        const operationId = `archive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        people[index] = archiveRecord(people[index], actor, reason, operationId);
        let routesArchived = 0;
        for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
          const related = routes[routeIndex].targetPersonId === id || routes[routeIndex].mutualPersonId === id;
          if (related && !routes[routeIndex].archivedAt && ACTIVE_ROUTE_STAGES.includes(routes[routeIndex].stage)) {
            const previousRoute = routes[routeIndex];
            routes[routeIndex] = archiveRecord(routes[routeIndex], actor, reason, operationId);
            activities.push(normalizeActivity({
              routeId: routes[routeIndex].id, companyId: routes[routeIndex].companyId, actor,
              type: 'archive', summary: `Route archived with ${people[index].name}`, reason,
              previousState: routeState(previousRoute), resultingState: routeState(routes[routeIndex]),
            }, { routes }));
            routesArchived += 1;
          }
        }
        coordinatedWrite({ people, routes, activities });
        return sendJSON(res, 200, { person: people[index], routesArchived });
      }
      const actor = cleanString(body.actor);
      if (!actor) throw inputError('actor is required');
      if (!people[index].archivedAt) throw inputError('Person is not archived', 'CONFLICT');
      const operationId = people[index].archiveOperationId;
      const restoreReason = people[index].archiveReason;
      people[index] = restoreRecord(people[index]);
      let routesRestored = 0;
      for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
        if (routes[routeIndex].archiveOperationId === operationId) {
          const previousRoute = routes[routeIndex];
          routes[routeIndex] = restoreRecord(routes[routeIndex]);
          activities.push(normalizeActivity({
            routeId: routes[routeIndex].id, companyId: routes[routeIndex].companyId, actor,
            type: 'restore', summary: `Route restored with ${people[index].name}`, reason: restoreReason,
            previousState: routeState(previousRoute), resultingState: routeState(routes[routeIndex]),
          }, { routes }));
          routesRestored += 1;
        }
      }
      coordinatedWrite({ people, routes, activities });
      return sendJSON(res, 200, { person: people[index], routesRestored });
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  if (method === 'DELETE' && personMatch) {
    if ((req.headers['x-source'] || '').toLowerCase() !== 'ui') return sendJSON(res, 403, { error: 'Delete is not available to agents' });
    const id = decodeURIComponent(personMatch[1]);
    const people = loadPeople();
    const person = people.find((item) => item.id === id);
    if (!person) return sendJSON(res, 404, { error: 'Person not found' });
    if (!person.archivedAt) return sendJSON(res, 409, { error: 'Archive the person before permanent deletion' });
    const hasDependencies = people.some((item) => (item.mutualPersonIds || []).includes(id))
      || loadRoutes().some((item) => item.targetPersonId === id || item.mutualPersonId === id);
    if (hasDependencies) return sendJSON(res, 409, { error: 'Person has dependent relationships or routes' });
    savePeople(people.filter((item) => item.id !== id));
    return sendJSON(res, 200, { ok: true });
  }

  if (method === 'GET' && url === routesBase) {
    const parsed = new URL(req.url, 'http://localhost');
    const filters = ['companyId', 'owner', 'stage'];
    const includeArchived = parsed.searchParams.get('includeArchived') === 'true';
    const archivedCompanyIds = new Set(loadCompanies().filter((company) => company.archivedAt).map((company) => company.id));
    let routes = loadRoutes().filter((route) => includeArchived || (!route.archivedAt && !archivedCompanyIds.has(route.companyId)));
    for (const key of filters) {
      const value = parsed.searchParams.get(key);
      if (value) routes = routes.filter((route) => route[key] === value);
    }
    return respondWithJSON(res, 200, routes, req);
  }

  if (method === 'POST' && url === `${routesBase}/bulk/actions`) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const routeIds = [...new Set(Array.isArray(body.routeIds) ? body.routeIds.map(cleanString).filter(Boolean) : [])];
      const actor = cleanString(body.actor);
      if (!routeIds.length) throw inputError('routeIds must contain at least one route');
      if (!actor) throw inputError('actor is required');
      const routes = loadRoutes();
      const activities = loadActivities();
      const people = loadPeople();
      const companies = loadCompanies();
      const indexes = routeIds.map((id) => routes.findIndex((route) => route.id === id));
      if (indexes.some((index) => index < 0)) return sendJSON(res, 404, { error: 'One or more routes were not found' });
      if (indexes.some((index) => routes[index].archivedAt || !ACTIVE_ROUTE_STAGES.includes(routes[index].stage))) {
        throw inputError('Bulk actions require active, non-archived routes', 'CONFLICT');
      }
      const requestedChanges = {};
      for (const key of ['owner', 'dueDate', 'nextAction']) {
        if (Object.prototype.hasOwnProperty.call(body, key)) requestedChanges[key] = body[key];
      }
      if (!Object.keys(requestedChanges).length) throw inputError('Provide owner, dueDate, or nextAction');
      const changedRoutes = [];
      const newActivities = [];
      for (const index of indexes) {
        const previous = routes[index];
        const updated = normalizeRoute(requestedChanges, previous, { routes, people, companies });
        const activity = normalizeActivity({
          routeId: updated.id,
          companyId: updated.companyId,
          actor,
          type: requestedChanges.owner !== undefined && Object.keys(requestedChanges).length === 1 ? 'reassignment' : 'edit',
          summary: cleanString(body.summary) || 'Route assignment and schedule updated',
          details: body.details,
          previousState: routeState(previous),
          resultingState: routeState(updated),
          reversibleUntil: new Date(Date.now() + 30000).toISOString(),
        }, { routes: routes.map((item, itemIndex) => itemIndex === index ? updated : item) });
        routes[index] = updated;
        changedRoutes.push(updated);
        newActivities.push(activity);
      }
      activities.push(...newActivities);
      coordinatedWrite({ routes, activities });
      return sendJSON(res, 200, { routes: changedRoutes, activities: newActivities });
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  if (method === 'POST' && url === routesBase) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const routes = loadRoutes();
      const context = { routes, people: loadPeople(), companies: loadCompanies() };
      const route = normalizeRoute(body, null, context);
      assertNoDuplicateActiveRoute(route, routes);
      routes.push(route);
      saveRoutes(routes);
      return sendJSON(res, 201, route);
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  const routeMatch = url.match(/^\/api\/routes\/([^/]+)$/);
  if (method === 'PATCH' && routeMatch) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const id = decodeURIComponent(routeMatch[1]);
      const routes = loadRoutes();
      const index = routes.findIndex((route) => route.id === id);
      if (index < 0) return sendJSON(res, 404, { error: 'Route not found' });
      if (routes[index].archivedAt) return sendJSON(res, 409, { error: 'Restore the route before editing' });
      const context = { routes, people: loadPeople(), companies: loadCompanies() };
      const previous = routes[index];
      const route = normalizeRoute(body, previous, context);
      assertNoDuplicateActiveRoute(route, routes, id);
      routes[index] = route;
      const activities = loadActivities();
      activities.push(normalizeActivity({
        routeId: route.id,
        companyId: route.companyId,
        actor: cleanString(body.actor) || 'API update',
        type: 'edit',
        summary: cleanString(body.summary) || 'Route details edited',
        details: body.details,
        previousState: routeState(previous),
        resultingState: routeState(route),
        reversibleUntil: new Date(Date.now() + 30000).toISOString(),
      }, { routes }));
      coordinatedWrite({ routes, activities });
      return sendJSON(res, 200, route);
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  const routeArchiveMatch = url.match(/^\/api\/routes\/([^/]+)\/(archive|restore)$/);
  if (method === 'POST' && routeArchiveMatch) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const id = decodeURIComponent(routeArchiveMatch[1]);
      const action = routeArchiveMatch[2];
      const routes = loadRoutes();
      const activities = loadActivities();
      const index = routes.findIndex((route) => route.id === id);
      if (index < 0) return sendJSON(res, 404, { error: 'Route not found' });
      const previous = routes[index];
      let actor;
      let reason;
      if (action === 'archive') {
        ({ actor, reason } = archiveInput(body));
        if (routes[index].archivedAt) throw inputError('Route is already archived', 'CONFLICT');
        const operationId = `archive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        routes[index] = archiveRecord(routes[index], actor, reason, operationId);
      } else {
        actor = cleanString(body.actor);
        if (!actor) throw inputError('actor is required');
        if (!routes[index].archivedAt) throw inputError('Route is not archived', 'CONFLICT');
        reason = routes[index].archiveReason;
        const people = loadPeople();
        const companies = loadCompanies();
        const company = companies.find((item) => item.id === routes[index].companyId);
        const target = people.find((item) => item.id === routes[index].targetPersonId);
        const mutual = people.find((item) => item.id === routes[index].mutualPersonId);
        if (!company || company.archivedAt || !target || target.archivedAt || !mutual || mutual.archivedAt) {
          throw inputError('Restore the route company and people first', 'CONFLICT');
        }
        routes[index] = restoreRecord(routes[index]);
        assertNoDuplicateActiveRoute(routes[index], routes, routes[index].id);
      }
      const activity = normalizeActivity({
        routeId: id,
        companyId: routes[index].companyId,
        actor,
        type: action,
        summary: action === 'archive' ? 'Route archived' : 'Route restored',
        reason,
        previousState: routeState(previous),
        resultingState: routeState(routes[index]),
      }, { routes });
      activities.push(activity);
      coordinatedWrite({ routes, activities });
      return sendJSON(res, 200, { route: routes[index], activity });
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  if (method === 'DELETE' && routeMatch) {
    if ((req.headers['x-source'] || '').toLowerCase() !== 'ui') return sendJSON(res, 403, { error: 'Delete is not available to agents' });
    const id = decodeURIComponent(routeMatch[1]);
    const routes = loadRoutes();
    const routeToDelete = routes.find((item) => item.id === id);
    if (!routeToDelete) return sendJSON(res, 404, { error: 'Route not found' });
    if (!routeToDelete.archivedAt) return sendJSON(res, 409, { error: 'Archive the route before permanent deletion' });
    if (loadActivities().some((activity) => activity.routeId === id)) {
      return sendJSON(res, 409, { error: 'Route has dependent activity history' });
    }
    saveRoutes(routes.filter((item) => item.id !== id));
    return sendJSON(res, 200, { ok: true });
  }

  const undoMatch = url.match(/^\/api\/routes\/([^/]+)\/actions\/([^/]+)\/undo$/);
  if (method === 'POST' && undoMatch) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const routeId = decodeURIComponent(undoMatch[1]);
      const activityId = decodeURIComponent(undoMatch[2]);
      const actor = cleanString(body.actor);
      if (!actor) throw inputError('actor is required');
      const routes = loadRoutes();
      const activities = loadActivities();
      const routeIndex = routes.findIndex((item) => item.id === routeId);
      if (routeIndex < 0) return sendJSON(res, 404, { error: 'Route not found' });
      if (routes[routeIndex].archivedAt) throw inputError('Restore the route before undoing activity', 'CONFLICT');
      const routeActivities = activities.filter((activity) => activity.routeId === routeId)
        .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
      const action = routeActivities.find((activity) => activity.id === activityId);
      if (!action) return sendJSON(res, 404, { error: 'Activity not found' });
      const latestReversible = routeActivities.find((activity) => activity.previousState && activity.reversibleUntil
        && !activities.some((candidate) => candidate.undoOfActivityId === activity.id));
      if (!latestReversible || latestReversible.id !== activityId) throw inputError('Only the latest reversible action can be undone', 'CONFLICT');
      if (Date.now() > new Date(action.reversibleUntil).getTime()) throw inputError('The 30-second undo window has expired', 'CONFLICT');
      const previous = routes[routeIndex];
      const restored = normalizeRoute(action.previousState, previous, {
        routes, people: loadPeople(), companies: loadCompanies(),
      });
      assertNoDuplicateActiveRoute(restored, routes, restored.id);
      routes[routeIndex] = restored;
      const undoActivity = normalizeActivity({
        routeId,
        companyId: restored.companyId,
        actor,
        type: 'undo',
        summary: `Undid: ${action.summary}`,
        previousState: routeState(previous),
        resultingState: routeState(restored),
        undoOfActivityId: action.id,
      }, { routes });
      activities.push(undoActivity);
      coordinatedWrite({ routes, activities });
      return sendJSON(res, 200, { route: restored, activity: undoActivity });
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  const actionMatch = url.match(/^\/api\/routes\/([^/]+)\/actions$/);
  if (method === 'POST' && actionMatch) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const id = decodeURIComponent(actionMatch[1]);
      const routes = loadRoutes();
      const index = routes.findIndex((route) => route.id === id);
      if (index < 0) return sendJSON(res, 404, { error: 'Route not found' });
      if (routes[index].archivedAt) throw inputError('Restore the route before logging actions', 'CONFLICT');
      const people = loadPeople();
      const companies = loadCompanies();
      const actor = cleanString(body.actor);
      if (!actor) throw inputError('actor is required');
      let changes = {};
      let activityType = 'note';
      let defaultSummary = 'Route updated';

      if (body.action === 'reassign') {
        changes.owner = body.owner;
        activityType = 'reassignment';
        defaultSummary = `Route reassigned to ${body.owner}`;
      } else if (body.action === 'edit') {
        changes = body.changes && typeof body.changes === 'object' ? body.changes : {};
        activityType = 'edit';
        defaultSummary = 'Route details edited';
      } else if (body.action === 'move_stage') {
        if (!ROUTE_STAGES.includes(body.stage)) throw inputError(`stage must be one of: ${ROUTE_STAGES.join(', ')}`);
        if (['Won', 'Dead / no route'].includes(body.stage)) throw inputError('Use mark_won or mark_dead for terminal stages');
        changes.stage = body.stage;
        changes.outcome = 'pending';
        activityType = 'edit';
        defaultSummary = `Route moved to ${body.stage}`;
      } else {
        const config = ACTIONS[body.action];
        if (!config) throw inputError(`action must be one of: ${[...Object.keys(ACTIONS), 'reassign', 'edit', 'move_stage'].join(', ')}`);
        if (['mark_won', 'mark_dead'].includes(body.action) && !cleanString(body.reason)) {
          throw inputError('A reason is required for Won and Dead outcomes');
        }
        changes = { stage: config.stage, outcome: config.outcome };
        if (['call_mutual', 'message_mutual'].includes(body.action)) {
          if (Object.prototype.hasOwnProperty.call(body, 'nextAction')) changes.nextAction = body.nextAction;
          if (Object.prototype.hasOwnProperty.call(body, 'dueDate')) changes.dueDate = body.dueDate;
        }
        Object.keys(changes).forEach((key) => changes[key] === undefined && delete changes[key]);
        activityType = config.type;
        defaultSummary = config.summary;
      }

      const previous = routes[index];
      const route = normalizeRoute(changes, previous, { routes, people, companies });
      assertNoDuplicateActiveRoute(route, routes, id);
      const activity = normalizeActivity({
        routeId: route.id,
        companyId: route.companyId,
        actor,
        type: activityType,
        summary: cleanString(body.summary) || defaultSummary,
        details: body.details,
        reason: body.reason,
        previousState: routeState(previous),
        resultingState: routeState(route),
        reversibleUntil: new Date(Date.now() + 30000).toISOString(),
      }, { routes: routes.map((item, routeIndex) => routeIndex === index ? route : item) });
      const activities = loadActivities();
      routes[index] = route;
      activities.push(activity);
      coordinatedWrite({ routes, activities });
      return sendJSON(res, 200, { route, activity });
    } catch (err) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'BAD_INPUT' ? 400 : 500;
      return sendJSON(res, status, { error: err.message });
    }
  }

  if (method === 'GET' && url === activitiesBase) {
    const parsed = new URL(req.url, 'http://localhost');
    let activities = loadActivities();
    for (const key of ['routeId', 'companyId']) {
      const value = parsed.searchParams.get(key);
      if (value) activities = activities.filter((activity) => activity[key] === value);
    }
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return respondWithJSON(res, 200, activities, req);
  }

  if (method === 'POST' && url === activitiesBase) {
    let body;
    try { body = await readBody(req); }
    catch (err) { return sendJSON(res, 400, { error: err.message }); }
    try {
      const routes = loadRoutes();
      const activity = normalizeActivity(body, { routes });
      const activities = loadActivities();
      activities.push(activity);
      saveActivities(activities);
      return sendJSON(res, 201, activity);
    } catch (err) {
      return sendJSON(res, err.code === 'BAD_INPUT' ? 400 : 500, { error: err.message });
    }
  }

  sendJSON(res, 404, { error: 'Not found' });
}

// --- server ----------------------------------------------------------------

recoverCoordinatedWrite();

const server = http.createServer(async (req, res) => {
  const reqId = crypto.randomBytes(4).toString('hex');
  const startTime = Date.now();
  // Patch res.end to log the completed request on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (req.url?.startsWith('/api/')) {
      logEvent('info', 'API request', { reqId, method: req.method, url: req.url, status: res.statusCode, duration });
    }
  });
  try {
    // Auth check for all non-API requests (must come before API routing)
    if (!req.url.startsWith('/api/') && !isPublicPath(req.url)) {
      const cookies = parseCookies(req);
      const token = cookies[SESSION_COOKIE];
      if (!getSession(token)) {
        // Redirect to login for page requests, serve login for direct login access
        const urlPath = req.url.split('?')[0];
        if (urlPath !== '/login' && urlPath !== '/login.html') {
          res.writeHead(302, { Location: '/login' });
          res.end();
          return;
        }
        // Allow login page to render
      }
    }

    if (req.url.startsWith('/api/')) {
      await handleAPI(req, res);
      return;
    }
    if (!serveStatic(req, res)) {
      sendJSON(res, 404, { error: 'Not found' });
    }
  } catch (err) {
    console.error('Unhandled error:', err);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
});

server.timeout = 30000; // 30s idle timeout

// Graceful shutdown — flush pending writes, then exit.
function shutdown(signal) {
  logEvent('info', 'Shutdown signal received', { signal });
  server.close(() => {
    logEvent('info', 'Server closed');
    process.exit(0);
  });
  // Force exit if graceful close takes too long
  setTimeout(() => {
    logEvent('warn', 'Forced shutdown after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  console.log('Northwind CRM running:');
  console.log(`  UI    ->  http://localhost:${PORT}`);
  console.log(`  Login ->  http://localhost:${PORT}/login`);
  console.log(`  API   ->  http://localhost:${PORT}/api/companies`);
  console.log(`  Agents (read then POST) ->  http://localhost:${PORT}/agents.md`);
  console.log(`  Shared account: ${CRM_USERNAME}`);
});
