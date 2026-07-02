/* Northwind CRM — client app
 * Talks to the local server's REST API. Renders horizontal list rows with a
 * peach->sage warmth meter, expandable detail, manual create, and the in-app
 * Agent quick-add (which POSTs the same endpoint a desktop agent would).
 */

const API = '/api/companies';

// ---- tiny helpers ---------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function timeAgo(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// "agent:Atlas" -> { kind: 'agent', name: 'Atlas' }; otherwise a human name.
function parseCreator(createdBy) {
  const raw = String(createdBy || 'Sam');
  const m = raw.match(/^agent:(.+)$/i);
  return m ? { kind: 'agent', name: m[1], display: m[1] } : { kind: 'human', name: raw, display: raw };
}

let toastTimer;
function toast(message, options = {}) {
  const toastEl = el('div', { class: 'toast' + (options.error ? ' is-error' : ''), role: options.error ? 'alert' : 'status', 'aria-live': 'assertive', 'aria-atomic': 'true' },
    el('span', {}, message)
  );
  if (typeof options.undo === 'function') {
    const undo = el('button', { class: 'toast-undo', type: 'button' }, 'Undo');
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      try { await options.undo(); } catch (error) { toast(error.message, { error: true }); }
    });
    toastEl.appendChild(undo);
  }
  let stack = $('#toast-stack');
  if (!stack) {
    stack = el('div', { id: 'toast-stack' });
    document.body.appendChild(stack);
  }
  stack.appendChild(toastEl);
  requestAnimationFrame(() => toastEl.classList.add('show'));
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.remove(), 300);
  }, 2600);
}

// ---- API ------------------------------------------------------------------

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  // Mark requests coming from the human UI. The server only allows DELETE
  // from the UI, so an external agent can never delete a company.
  opts.headers['X-Source'] = 'ui';
  // Deduplicate in-flight GETs to the same URL
  if (method === 'GET') {
    const key = path;
    if (_pendingGets.has(key)) return _pendingGets.get(key);
    const promise = doFetch(path, opts);
    _pendingGets.set(key, promise);
    promise.finally(() => _pendingGets.delete(key));
    return promise;
  }
  return doFetch(path, opts);
}

const _pendingGets = new Map();

const FETCH_TIMEOUT_MS = 15000;

async function doFetch(path, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...opts, signal: controller.signal });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ---- rendering ------------------------------------------------------------

let expandedId = null;
// Cache of the latest company list, so the detail overlay can render without a
// fresh fetch when a card is opened.
let lastCompanies = [];
// Active view: 'grid' (default, card grid) | 'list' (horizontal rows) | 'board' (kanban).
// Persisted so the user's choice survives reloads.
let view = localStorage.getItem('crm-view') || 'grid';
const VIEWS = ['grid', 'list', 'board'];

// ---- Search / filter / sort state ----
let searchTerm = '';
let filterStatus = 'all';
let filterTier = 'all';
let sortBy = 'warmth';
let filterDue = 'all';
let highlightedId = null;     // keyboard-navigated card highlight

// Highlight matched text — returns an HTML string safe for innerHTML.
function highlightText(text, query) {
  if (!query || !text) return escHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${q})`, 'gi'));
  return parts.map((p) => p.toLowerCase() === query.toLowerCase() ? `<mark class="highlight-match">${escHtml(p)}</mark>` : escHtml(p)).join('');
}
function escHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// Apply the current search/filter/sort to a company list (pure — no mutation).
function applyFilters(companies) {
  let out = companies;
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    out = out.filter((c) =>
      [c.name, c.contactName, c.email, c.sector, c.country, c.industry, c.notes, c.intel?.signal, c.intel?.signalType]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }
  if (filterStatus !== 'all') out = out.filter((c) => c.status === filterStatus);
  if (filterTier !== 'all') out = out.filter((c) => c.intel?.signalTier === filterTier);

  // Follow-up date filter.
  if (filterDue !== 'all') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    out = out.filter((c) => {
      if (!c.followUpDate) return filterDue === 'none';
      const d = new Date(c.followUpDate + 'T00:00:00');
      const diff = Math.round((d - today) / 86400000);
      if (filterDue === 'today') return diff === 0;
      if (filterDue === 'overdue') return diff < 0;
      if (filterDue === 'week') return diff >= 0 && diff <= 7;
      return false; // 'none' handled above
    });
  }

  const sorted = [...out];
  if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'recency') sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (sortBy === 'due') {
    // Overdue first (most overdue → least), then undated last.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const score = (c) => c.followUpDate ? new Date(c.followUpDate + 'T00:00:00') - today : Infinity;
    sorted.sort((a, b) => score(a) - score(b));
  }
  else sorted.sort((a, b) => (b.warmth?.score || 0) - (a.warmth?.score || 0)); // warmth (default)
  return sorted;
}

function setView(next) {
  if (!VIEWS.includes(next) || next === view) return;
  view = next;
  localStorage.setItem('crm-view', view);
  document.body.dataset.view = view;
  // Sync the toggle buttons' active state.
  $$('.view-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  // Use the View Transitions API for a smooth morph when available; plain
  // re-render otherwise (progressive enhancement).
  const rerender = () => renderList(lastCompanies);
  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(rerender);
  } else {
    rerender();
  }
}

function renderStats(companies) {
  const awaiting = companies.filter((c) => c.status === 'Awaiting reply').length;
  const now = new Date();
  const won = companies.filter((c) =>
    c.status === 'Won' && c.lastContactAt &&
    new Date(c.lastContactAt).getMonth() === now.getMonth() &&
    new Date(c.lastContactAt).getFullYear() === now.getFullYear()
  ).length;
  animateCount('#statTotal', companies.length);
  animateCount('#statAwaiting', awaiting);
  animateCount('#statWon', won);
}

// Animate a numeric stat from its current value to the target (500ms ease-out).
// Skips animation if reduced motion is preferred or the value is unchanged.
function animateCount(selector, target) {
  const node = $(selector);
  if (!node) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const current = parseInt(node.textContent, 10) || 0;
  if (reduce || current === target) { node.textContent = target; return; }
  const start = performance.now();
  const dur = 500;
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);            // ease-out cubic
    node.textContent = Math.round(current + (target - current) * eased);
    if (t < 1) requestAnimationFrame(tick);
    else node.textContent = target;
  }
  requestAnimationFrame(tick);
}

function renderRow(company) {
  const warmth = company.warmth || { score: 0, label: 'Cold' };
  const creator = parseCreator(company.createdBy);
  const expanded = expandedId === company.id;
  const intel = company.intel || null;

  // Identity meta line: sector, country, size — whatever is known.
  const metaParts = [company.sector, company.country, company.industry, company.size ? `${company.size} ppl` : null].filter(Boolean);
  // Outreach glance-line: the single most important question — have we reached them?
  const outreach = outreachState(company);

  const row = el('article', { class: 'row' + (highlightedId === company.id ? ' is-highlighted' : ''), 'data-id': company.id });

  // --- summary (always visible) ---
  const nextStep = company.nextStep || { type: 'email', note: '' };
  const summary = el('div', { class: 'row-summary', onclick: () => openDetail(company.id) },
    el('div', { class: 'row-main' },
      el('div', { class: 'row-title-line' },
        el('h3', { class: 'row-name' }, company.name),
        intel?.signalTier ? el('span', { class: 'tier-chip', 'data-tier': intel.signalTier.toLowerCase() }, intel.signalTier) : null,
        metaParts.length ? el('span', { class: 'row-meta' }, metaParts.join(' · ')) : null,
        el('span', { class: 'status-chip', 'data-status': company.status }, company.status)
      ),
      el('div', { class: 'warmth' },
        el('div', { class: 'warmth-track' },
          el('div', { class: 'warmth-fill', style: `width:${Math.max(4, warmth.score)}%` })
        ),
        el('span', { class: 'warmth-label' },
          warmth.label, ' · ', el('span', { class: 'pct' }, `${warmth.score}%`)
        )
      ),
      // The outreach glance-line — answers "have I reached them?" at a look.
      el('span', { class: 'outreach-line', 'data-state': outreach.state },
        outreach.icon, ' ', outreach.text
      ),
      el('span', { class: 'created-by' },
        'created by ',
        el('span', { class: 'origin-tag', 'data-origin': creator.kind },
          creator.kind === 'agent' ? `${creator.display} · agent` : creator.display
        )
      )
    ),
    el('div', { class: 'row-aside' },
      el('span', { class: 'next-step' },
        nextStep.type === 'call' ? '📞 call' : '✉️ email',
        nextStep.note ? ` · ${nextStep.note}` : ''
      ),
      el('span', {}, intel ? `${intel.signalTier || '—'} signal` : 'no signal intel')
    )
  );
  row.appendChild(summary);

  if (expanded) row.appendChild(renderDetail(company));

  return row;
}

// Distill the outreach state into a glance answer: reached? who replied? is a reply owed?
function outreachState(company) {
  const acts = company.activity || [];
  const last = acts.length ? acts[acts.length - 1] : null;
  if (!last) {
    return { state: 'none', icon: '◌', text: 'not contacted yet' };
  }
  if (last.type === 'reply') {
    return { state: 'replied', icon: '↩', text: `reply received ${timeAgo(last.at) || ''}`.trim() };
  }
  // A sent email/call — is a reply owed? (status tells us.)
  const owed = company.status === 'Awaiting reply';
  return {
    state: owed ? 'owed' : 'reached',
    icon: owed ? '⏳' : '✓',
    text: `${last.type}ed ${timeAgo(last.at) || ''}${owed ? ' · reply owed' : ''}`.trim(),
  };
}

// Follow-up date helpers — turn a YYYY-MM-DD into a glanceable label + state.
function dueState(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}
function dueLabel(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff === -1) return 'Overdue by 1 day';
  if (diff < -1) return `Overdue by ${Math.abs(diff)} days`;
  if (diff <= 7) return `Due in ${diff} days (${d.toLocaleDateString('en-GB', { weekday: 'short' })})`;
  return `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function nextStepVerb(company) {
  // What did we last do? Infer from the latest activity, else the planned step.
  const acts = company.activity || [];
  if (acts.length) {
    const last = acts[acts.length - 1];
    return last.type === 'reply' ? 'replied' : `${last.type}ed`;
  }
  return company.nextStep?.type === 'call' ? 'call due' : 'emailed';
}

function renderDetail(company) {
  const intel = company.intel || null;
  const nextStep = company.nextStep || { type: 'email', note: '' };

  const detail = el('div', { class: 'row-detail' },
    // ---- Layer 1: Outreach & contact (the daily driver) ----
    el('p', { class: 'section-title' }, 'Outreach & contact'),
    el('div', { class: 'detail-grid' },
      editableField('Contact', company, 'contactName'),
      editableField('Email', company, 'email'),
      editableField('Phone', company, 'phone'),
      detailField('Sector', company.sector || '—'),
      detailField('Country', company.country || '—'),
      detailField('Industry', company.industry || '—'),
      detailField('Employees', company.size ? String(company.size) : '—'),
      detailField('Next step', `${nextStep.type} — ${nextStep.note || '—'}`),
      editableDateField('Follow-up', company)
    ),
    el('div', { class: 'detail-actions' },
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => logActivity(company.id, 'email') }, 'Log email'),
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => logActivity(company.id, 'call') }, 'Log call'),
      el('button', { class: 'btn btn-sage btn-sm', onclick: () => logActivity(company.id, 'reply') }, 'Log reply'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openEdit(company) }, 'Edit'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => removeCompany(company.id, company.name) }, 'Archive')
    ),
    el('p', { class: 'timeline-title' }, 'Activity timeline'),
    renderTimeline(company.activity),

    // ---- Notes: editable inline ----
    el('p', { class: 'section-title' }, 'Notes'),
    editableNotes(company),

    // ---- Layer 2: Opportunity intelligence (scroll-down context) ----
    intel ? renderIntel(intel) : el('p', { class: 'section-empty' }, 'No opportunity intelligence recorded for this account yet.')
  );
  return detail;
}

// An inline-editable detail field. Click the value to edit it in place;
// blur or Enter PATCHes the change and re-renders.
function editableField(label, company, key) {
  const raw = company[key] || '';
  const display = raw || '—';
  const wrap = el('div', { class: 'detail-field' },
    el('span', { class: 'k' }, label),
    el('span', { class: 'v editable', tabindex: '0', role: 'button', title: 'Click to edit' },
      display,
      el('span', { class: 'edit-pencil', 'aria-hidden': 'true' }, crmIcon('edit'))
    )
  );
  const v = wrap.querySelector('.v');
  const begin = () => startInlineEdit(v, company, key, 'input');
  v.addEventListener('click', begin);
  v.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); begin(); } });
  return wrap;
}

// Inline-editable follow-up date — a date input that PATCHes on change.
function editableDateField(label, company) {
  const current = company.followUpDate || '';
  const display = current ? dueLabel(current) : 'No date set';
  const state = current ? dueState(current) : 'none';
  const wrap = el('div', { class: 'detail-field' },
    el('span', { class: 'k' }, label),
    el('span', { class: 'v followup-display editable' + (state === 'overdue' ? ' is-overdue' : state === 'today' ? ' is-today' : ''),
        tabindex: '0', role: 'button', title: 'Click to set a follow-up date', 'data-due': state },
      display,
      el('span', { class: 'edit-pencil', 'aria-hidden': 'true' }, crmIcon('edit'))
    )
  );
  const v = wrap.querySelector('.v');
  v.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = current;
    input.className = 'inline-edit';
    v.replaceWith(input);
    input.focus();
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const val = input.value;
      if (val === current) { renderDetailOverlay(); return; }
      try {
        await api('PATCH', `${API}/${encodeURIComponent(company.id)}`, { followUpDate: val });
        toast('Follow-up date updated.');
      } catch (err) { toast(err.message); }
      lastCompanies = await api('GET', API);
      renderList(lastCompanies);
      renderDetailOverlay();
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { renderDetailOverlay(); }
    });
  });
  v.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); v.click(); } });
  return wrap;
}

// Inline-editable notes block (multi-line textarea).
function editableNotes(company) {
  const wrap = el('div', { class: 'notes-wrap' },
    company.notes
      ? el('div', { class: 'notes-body editable', tabindex: '0', role: 'button', title: 'Click to edit' },
          company.notes,
          el('span', { class: 'edit-pencil', 'aria-hidden': 'true' }, crmIcon('edit'))
        )
      : el('p', { class: 'section-empty editable', tabindex: '0', role: 'button', title: 'Click to add notes' },
          'Click to add your own notes for this account.')
  );
  const target = wrap.querySelector('.editable');
  const begin = () => startInlineEdit(target, company, 'notes', 'textarea');
  target.addEventListener('click', begin);
  target.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); begin(); } });
  return wrap;
}

// Swap a display element for an input/textarea, PATCH on commit.
function startInlineEdit(displayEl, company, key, kind) {
  const current = company[key] || '';
  const input = document.createElement(kind === 'textarea' ? 'textarea' : 'input');
  if (kind === 'input') input.type = key === 'email' ? 'email' : 'text';
  input.value = current;
  input.className = 'inline-edit';
  if (kind === 'textarea') { input.rows = 4; input.style.resize = 'vertical'; }
  displayEl.replaceWith(input);
  input.focus();
  input.select?.();

  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const val = input.value.trim();
    if (val === current) { renderDetailOverlay(); return; }   // no change
    try {
      await api('PATCH', `${API}/${encodeURIComponent(company.id)}`, { [key]: val });
      toast('Updated.');
    } catch (err) { toast(err.message); }
    // refresh the cache + re-render the open record
    lastCompanies = await api('GET', API);
    renderList(lastCompanies);
    renderDetailOverlay();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (kind !== 'textarea' || e.ctrlKey)) { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { committed = true; renderDetailOverlay(); }
  });
}

// The scroll-down intelligence layer — mirrors the structure of the signal reports.
function renderIntel(intel) {
  const children = [
    el('p', { class: 'section-title' },
      'Opportunity intelligence',
      intel.signalTier ? el('span', { class: 'tier-chip', 'data-tier': intel.signalTier.toLowerCase() }, intel.signalTier) : null
    ),
  ];

  if (intel.signal) children.push(intelBlock('Signal', intel.signal, intel.signalType));
  if (intel.whyItMatters) children.push(intelBlock('Why it matters', intel.whyItMatters));
  if (intel.commercialOpening) children.push(intelBlock('Commercial opening', intel.commercialOpening));

  if (intel.evidenceUrl) {
    const safeUrl = safeUrlScheme(intel.evidenceUrl);
    children.push(
      el('div', { class: 'intel-block' },
        el('span', { class: 'intel-k' }, 'Evidence'),
        el('a', { class: 'intel-link', href: safeUrl || '#', target: '_blank', rel: 'noopener noreferrer' },
          truncateUrl(intel.evidenceUrl)
        )
      )
    );
  }

  // Do-not-claim guardrails — visually flagged so they're read before a call.
  if (intel.doNotClaim?.length) {
    children.push(
      el('div', { class: 'intel-caveat' },
        el('span', { class: 'intel-k' }, 'Do not claim'),
        el('ul', { class: 'caveat-list' },
          ...intel.doNotClaim.map((claim) => el('li', {}, claim))
        )
      )
    );
  }
  if (intel.uncertainty) {
    children.push(intelBlock('Remaining uncertainty', intel.uncertainty));
  }

  return el('div', { class: 'intel-section' }, ...children);
}

function intelBlock(label, value, sub) {
  return el('div', { class: 'intel-block' },
    el('span', { class: 'intel-k' }, label),
    el('p', { class: 'intel-v' }, value),
    sub ? el('span', { class: 'intel-sub' }, sub) : null
  );
}

function safeUrlScheme(url) {
  if (!url) return '#';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {}
  return '#';
}
function truncateUrl(url) {
  // Drop scheme for readability; cap length.
  const stripped = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return stripped.length > 60 ? stripped.slice(0, 57) + '…' : stripped;
}

function detailField(label, value, isHTML = false) {
  return el('div', { class: 'detail-field' },
    el('span', { class: 'k' }, label),
    el('span', { class: 'v', ...(isHTML ? { html: value } : {}) }, isHTML ? null : value)
  );
}

function renderTimeline(activity) {
  const acts = [...(activity || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!acts.length) return el('p', { class: 'timeline-empty' }, 'No activity yet. Log an email or call to warm this company up.');
  return el('div', { class: 'timeline' },
    ...acts.map((a) =>
      el('div', { class: 'timeline-item', 'data-type': a.type },
        el('span', { class: 'timeline-dot' }),
        el('span', {}, a.type === 'reply' ? 'Received a reply' : `${a.type[0].toUpperCase() + a.type.slice(1)}ed`),
        el('span', { style: 'margin-left:auto;color:var(--ink-soft)' }, timeAgo(a.at) || new Date(a.at).toLocaleString())
      )
    )
  );
}

// Master render router — delegates to the active view.
function renderList(companies) {
  renderStats(companies);             // headline uses totals, never filtered counts
  const filtered = applyFilters(companies);
  const host = $('#companyList');

  // Clear only previously-rendered views (grid/list/board), leaving the
  // static #emptyState notice intact since it lives inside this host.
  $$('.card-grid, .row, .board, .company-table, .no-results, .skeleton-grid, .active-filters').forEach((n) => n.remove());

  if (!companies.length) {
    $('#emptyState').hidden = false;
    return;
  }
  $('#emptyState').hidden = true;

  // Show active filters as removable chips
  const chips = [];
  if (filterStatus !== 'all') chips.push(el('span', { class: 'filter-chip' }, 'Status: ', filterStatus, el('button', { 'aria-label': 'Remove status filter', onclick: () => { $('#filterStatus').value = 'all'; filterStatus = 'all'; renderList(lastCompanies); } }, '×')));
  if (filterTier !== 'all') chips.push(el('span', { class: 'filter-chip' }, 'Signal: ', filterTier, el('button', { 'aria-label': 'Remove signal filter', onclick: () => { $('#filterTier').value = 'all'; filterTier = 'all'; renderList(lastCompanies); } }, '×')));
  if (filterDue !== 'all') chips.push(el('span', { class: 'filter-chip' }, 'Follow-up: ', filterDue, el('button', { 'aria-label': 'Remove follow-up filter', onclick: () => { $('#filterDue').value = 'all'; filterDue = 'all'; renderList(lastCompanies); } }, '×')));
  if (searchTerm) chips.push(el('span', { class: 'filter-chip' }, 'Search: “', searchTerm, '”', el('button', { 'aria-label': 'Clear search', onclick: () => { $('#search').value = ''; searchTerm = ''; $('#search').focus(); renderList(lastCompanies); } }, '×')));
  if (chips.length) host.appendChild(el('div', { class: 'active-filters' }, ...chips));

  // Distinguish "no companies at all" from "no matches for this filter".
  if (!filtered.length) {
    host.appendChild(renderNoResults());
    return;
  }

  if (view === 'board') renderBoard(filtered, host);
  else if (view === 'list') renderListView(filtered, host);
  else renderGrid(filtered, host);

  // Animate warmth bars after render
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      $$('.warmth-fill').forEach((bar) => bar.classList.add('animate'));
    });
  });
}

// Shown when filters exclude every company (different from the empty database state).
function renderNoResults() {
  return el('div', { class: 'no-results' },
    el('span', { style: 'font-size:28px;opacity:0.4' }, '🔍'),
    el('p', { class: 'no-results-title' }, 'No companies match your filters'),
    el('p', { class: 'no-results-sub' }, 'No results for the current search or filter combination.'),
    el('div', { class: 'active-filters' },
      filterStatus !== 'all' ? el('span', { class: 'filter-chip' }, 'Status: ', filterStatus, el('button', { 'aria-label': 'Remove status filter', onclick: () => { $('#filterStatus').value = 'all'; filterStatus = 'all'; renderList(lastCompanies); } }, '×')) : null,
      filterTier !== 'all' ? el('span', { class: 'filter-chip' }, 'Signal: ', filterTier, el('button', { 'aria-label': 'Remove signal filter', onclick: () => { $('#filterTier').value = 'all'; filterTier = 'all'; renderList(lastCompanies); } }, '×')) : null,
      filterDue !== 'all' ? el('span', { class: 'filter-chip' }, 'Follow-up: ', filterDue, el('button', { 'aria-label': 'Remove follow-up filter', onclick: () => { $('#filterDue').value = 'all'; filterDue = 'all'; renderList(lastCompanies); } }, '×')) : null,
      searchTerm ? el('span', { class: 'filter-chip' }, 'Search: ', searchTerm, el('button', { 'aria-label': 'Clear search', onclick: () => { $('#search').value = ''; searchTerm = ''; $('#search').focus(); renderList(lastCompanies); } }, '×')) : null,
    ),
    el('button', { class: 'btn btn-ghost btn-sm', onclick: clearFilters, style: 'margin-top:12px' }, 'Clear all filters')
  );
}

function clearFilters() {
  $('#search').value = '';
  $('#filterStatus').value = 'all';
  $('#filterTier').value = 'all';
  $('#filterDue').value = 'all';
  $('#sortBy').value = 'warmth';
  searchTerm = ''; filterStatus = 'all'; filterTier = 'all'; filterDue = 'all'; sortBy = 'warmth';
  renderList(lastCompanies);
}

// Sort hottest first so attention lands where momentum is highest.
function byWarmth(companies) {
  return [...companies].sort((a, b) => (b.warmth?.score || 0) - (a.warmth?.score || 0));
}

// ---- Grid view (default): compact rectangle cards, responsive columns ----
function renderGrid(companies, host) {
  const grid = el('div', { class: 'card-grid' });
  for (const company of byWarmth(companies)) grid.appendChild(renderCard(company));
  host.appendChild(grid);
}

// A compact rectangle card. Reuses the same glance logic as the row view so the
// "have I reached them?" question stays front-and-centre, just denser.
function renderCard(company) {
  const warmth = company.warmth || { score: 0, label: 'Cold' };
  const intel = company.intel || null;
  const creator = parseCreator(company.createdBy);
  const outreach = outreachState(company);
  const metaParts = [company.sector, company.country].filter(Boolean).join(' · ');
  const expanded = expandedId === company.id;

  const card = el('article', { class: 'card' + (highlightedId === company.id ? ' is-highlighted' : ''), 'data-id': company.id },
    el('div', { class: 'card-summary', onclick: () => openDetail(company.id) },
      el('div', { class: 'card-head' },
        el('h3', { class: 'card-name' }, company.name),
        el('div', { class: 'card-badges' },
          intel?.signalTier ? el('span', { class: 'tier-chip', 'data-tier': intel.signalTier.toLowerCase() }, intel.signalTier) : null,
          el('span', { class: 'status-chip', 'data-status': company.status }, company.status)
        )
      ),
      metaParts ? el('p', { class: 'card-meta' }, metaParts) : null,
      el('div', { class: 'warmth' },
        el('div', { class: 'warmth-track' },
          el('div', { class: 'warmth-fill', style: `width:${Math.max(4, warmth.score)}%` })
        ),
        el('span', { class: 'warmth-label' },
          warmth.label, ' · ', el('span', { class: 'pct' }, `${warmth.score}%`)
        )
      ),
      el('span', { class: 'outreach-line', 'data-state': outreach.state },
        outreach.icon, ' ', outreach.text
      ),
      // Follow-up date — the actionable nudge. Highlighted when overdue/due today.
      company.followUpDate ? el('span', { class: 'followup-line', 'data-due': dueState(company.followUpDate) },
        '🎯 ', dueLabel(company.followUpDate)
      ) : null,
      // Contextual quick-actions — fade in on hover; stay visible on touch.
      el('div', { class: 'card-actions', onclick: (e) => e.stopPropagation() },
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => logActivity(company.id, 'email') }, crmIcon('message'), 'Email'),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openEdit(company) }, crmIcon('edit'), 'Edit')
      )
    ),
    expanded ? renderDetail(company) : null
  );
  return card;
}

// ---- List view: the original horizontal rows ----
function renderListView(companies, host) {
  const table = el('div', { class: 'company-table' },
    el('div', { class: 'company-table-head', 'aria-hidden': 'true' },
      el('span', {}, 'Company'),
      el('span', {}, 'Signal'),
      el('span', {}, 'Sector / industry'),
      el('span', {}, 'Source'),
      el('span', {}, 'Warmth'),
      el('span', {}, 'Last outreach'),
      el('span', {}, 'Next step'),
      el('span', {}, 'Status')
    )
  );
  for (const company of byWarmth(companies)) table.appendChild(renderPremiumTableRow(company));
  host.appendChild(table);
}

function renderPremiumTableRow(company) {
  const warmth = company.warmth || { score: 0, label: 'Cold' };
  const intel = company.intel || {};
  const creator = parseCreator(company.createdBy);
  const outreach = outreachState(company);
  const nextStep = company.nextStep || {};
  const button = el('button', { class: 'company-table-row', 'data-id': company.id, onclick: () => openDetail(company.id) },
    el('span', { class: 'table-company' },
      el('strong', {}, company.name),
      el('small', {}, company.country || 'Location not set')
    ),
    el('span', {}, intel.signalTier ? el('span', { class: 'tier-chip', 'data-tier': intel.signalTier.toLowerCase() }, intel.signalTier) : '—'),
    el('span', { class: 'table-wrap' }, company.sector || company.industry || '—'),
    el('span', { class: 'source-compact' }, creator.kind === 'agent' ? `${creator.display} · agent` : creator.display),
    el('span', { class: 'table-warmth' },
      el('span', { class: 'warmth-track' }, el('span', { class: 'warmth-fill', style: `width:${Math.max(4, warmth.score)}%` })),
      el('small', {}, `${warmth.label} · ${warmth.score}%`)
    ),
    el('span', { class: 'table-wrap' }, outreach.text),
    el('span', { class: 'table-wrap' }, nextStep.note || (nextStep.type === 'call' ? 'Call' : 'Email')),
    el('span', {},
      el('span', { class: 'status-chip', 'data-status': company.status }, company.status),
      company.followUpDate ? el('span', { class: 'followup-inline', 'data-due': dueState(company.followUpDate) }, '🎯', dueLabel(company.followUpDate)) : null
    )
  );
  return button;
}

// ---- Board view: kanban columns by status, with drag-and-drop between stages ----
const BOARD_COLUMNS = ['New', 'Contacted', 'Awaiting reply', 'Won', 'Lost'];

function renderBoard(companies, host) {
  const board = el('div', { class: 'board' });
  for (const status of BOARD_COLUMNS) {
    const items = companies.filter((c) => c.status === status);
    // The column is the drop target. data-stage carries the target status.
    const col = el('section', { class: 'board-col', 'data-stage': status },
      el('div', { class: 'board-col-head' },
        el('span', { class: 'board-col-name' }, status),
        el('span', { class: 'board-col-count' }, String(items.length))
      ),
      el('div', { class: 'board-col-body' },
        ...items.map((c, i) => renderBoardCard(c, i))
      )
    );
    wireDropTarget(col);
    board.appendChild(col);
  }
  host.appendChild(board);
}

// HTML5 drag-and-drop. Card sets the dragged id on dragstart; columns catch it.
function wireDropTarget(col) {
  col.addEventListener('dragover', (e) => {
    e.preventDefault();                     // required to allow a drop
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drop-target');
  });
  col.addEventListener('dragleave', (e) => {
    // Only clear when leaving the column entirely, not when crossing child borders.
    if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target');
  });
  col.addEventListener('drop', (e) => {
    e.preventDefault();
    col.classList.remove('drop-target');
    const id = e.dataTransfer.getData('text/plain');
    const stage = col.dataset.stage;
    if (id && stage) moveToStage(id, stage);
  });
}

// Move a card to a new stage via PATCH. No-op if already there.
async function moveToStage(id, stage) {
  if (!BOARD_COLUMNS.includes(stage)) return;
  // Optimistic UI: move the card visually before the request resolves.
  const card = document.querySelector(`.board-card[data-id="${CSS.escape(id)}"]`);
  if (card) card.classList.add('dragging-away');
  try {
    await api('PATCH', `${API}/${encodeURIComponent(id)}`, { status: stage });
    toast(`Moved to ${stage}.`);
    refresh();
  } catch (err) {
    toast(err.message);
    refresh();   // revert on failure
  }
}

// A minimal board card — dense, status-contextual, click expands to detail.
function renderBoardCard(company, index = 0) {
  const warmth = company.warmth || { score: 0, label: 'Cold' };
  const intel = company.intel || null;
  const outreach = outreachState(company);
  const expanded = expandedId === company.id;

  const card = el('article', { class: 'card board-card', 'data-id': company.id, draggable: 'true', style: `animation-delay:${index * 0.04}s` },
    el('div', { class: 'card-summary', onclick: () => openDetail(company.id) },
      el('div', { class: 'card-head' },
        el('h3', { class: 'card-name' }, company.name),
        intel?.signalTier ? el('span', { class: 'tier-chip', 'data-tier': intel.signalTier.toLowerCase() }, intel.signalTier) : null
      ),
      el('div', { class: 'warmth' },
        el('div', { class: 'warmth-track' },
          el('div', { class: 'warmth-fill', style: `width:${Math.max(4, warmth.score)}%` })
        ),
        el('span', { class: 'warmth-label' },
          warmth.label, ' · ', el('span', { class: 'pct' }, `${warmth.score}%`)
        )
      ),
      el('span', { class: 'outreach-line', 'data-state': outreach.state },
        outreach.icon, ' ', outreach.text
      ),
      el('div', { class: 'card-actions', onclick: (e) => e.stopPropagation() },
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => logActivity(company.id, 'email') }, crmIcon('message'), 'Email'),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openEdit(company) }, crmIcon('edit'), 'Edit')
      )
    ),
    expanded ? renderDetail(company) : null
  );

  // Drag source: carry the company id so the drop target knows what to move.
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', company.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
    // A small delay lets the .dragging style apply before the snapshot is taken.
    requestAnimationFrame(() => card.classList.add('dragging-ghost'));
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging', 'dragging-ghost', 'dragging-away');
  });
  return card;
}

function toggleExpand(id) {
  expandedId = expandedId === id ? null : id;
  refresh();
}

// The full-screen record overlay. Opening a card shows the company as a premium
// centered "page" rather than an inline expansion that crams into one grid cell.
let selectedId = null;

function openDetail(id) {
  selectedId = id;
  expandedId = null;              // collapse any inline expansion
  renderDetailOverlay();
  $('#detailOverlay').hidden = false;
  document.body.classList.add('detail-open');   // lock background scroll
}

function closeDetail() {
  selectedId = null;
  $('#detailOverlay').hidden = true;
  document.body.classList.remove('detail-open');
}

function renderDetailOverlay() {
  const host = $('#record');
  host.replaceChildren();
  const companies = lastCompanies;
  const company = companies.find((c) => c.id === selectedId);
  if (!company) { closeDetail(); return; }
  host.appendChild(renderRecord(company));
}

// The premium record "page": big serif headline, key signals up top, then the
// two-layer detail at a generous width. Reuses the existing detail builders.
function renderRecord(company) {
  const warmth = company.warmth || { score: 0, label: 'Cold' };
  const intel = company.intel || null;
  const outreach = outreachState(company);
  const nextStep = company.nextStep || { type: 'email', note: '' };
  const creator = parseCreator(company.createdBy);
  const metaParts = [company.sector, company.country, company.industry, company.size ? `${company.size} employees` : null].filter(Boolean);

  return el('article', { class: 'record-body' },
    // Header band — the hero of the record.
    el('header', { class: 'record-header' },
      el('div', { class: 'record-header-row' },
        el('div', { class: 'record-title-block' },
          el('div', { class: 'record-eyebrow' },
            intel?.signalTier ? el('span', { class: 'tier-chip', 'data-tier': intel.signalTier.toLowerCase() }, intel.signalTier) : null,
            el('span', { class: 'status-chip', 'data-status': company.status }, company.status)
          ),
          el('h2', { class: 'record-name' }, company.name),
          metaParts.length ? el('p', { class: 'record-meta' }, metaParts.join(' · ')) : null
        ),
        el('button', { class: 'record-close', 'aria-label': 'Close', onclick: closeDetail }, '✕')
      ),
      // Quick-scan row: warmth + the outreach glance answer, side by side.
      el('div', { class: 'record-quickbar' },
        el('div', { class: 'warmth' },
          el('span', { class: 'quickbar-label' }, 'Warmth'),
          el('div', { class: 'warmth-track' },
            el('div', { class: 'warmth-fill', style: `width:${Math.max(4, warmth.score)}%` })
          ),
          el('span', { class: 'warmth-label' },
            warmth.label, ' · ', el('span', { class: 'pct' }, `${warmth.score}%`)
          )
        ),
        el('div', { class: 'quickbar-outreach' },
          el('span', { class: 'quickbar-label' }, 'Outreach'),
          el('span', { class: 'outreach-line', 'data-state': outreach.state },
            outreach.icon, ' ', outreach.text
          )
        ),
        el('div', { class: 'quickbar-next' },
          el('span', { class: 'quickbar-label' }, 'Next'),
          el('span', {}, `${nextStep.type === 'call' ? '📞 call' : '✉️ email'}${nextStep.note ? ' · ' + nextStep.note : ''}`)
        )
      ),
      el('div', { class: 'record-actions' },
        el('button', { class: 'btn btn-primary btn-sm', onclick: () => logActivity(company.id, 'email') }, 'Log email'),
        el('button', { class: 'btn btn-primary btn-sm', onclick: () => logActivity(company.id, 'call') }, 'Log call'),
        el('button', { class: 'btn btn-sage btn-sm', onclick: () => logActivity(company.id, 'reply') }, 'Log reply'),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openEdit(company) }, 'Edit'),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => removeCompany(company.id, company.name) }, 'Archive')
      ),
      el('p', { class: 'record-origin' },
        'Added ', timeAgo(company.createdAt) || '—',
        ' by ',
        el('span', { class: 'origin-tag', 'data-origin': creator.kind },
          creator.kind === 'agent' ? `${creator.display} · agent` : creator.display
        )
      )
    ),
    // Relationship-aware tabs are supplied by relationships.js.
    el('div', { class: 'record-detail' },
      typeof renderCompanyTabs === 'function' ? renderCompanyTabs(company) : renderDetail(company)
    )
  );
}

// ---- actions --------------------------------------------------------------

// Render shimmering placeholder cards into the grid while data loads.
// Only shown on initial/empty loads — not after mutations (avoids flicker).
function renderSkeletons() {
  const host = $('#companyList');
  $$('.card-grid, .row, .board, .company-table, .no-results, .skeleton-grid').forEach((n) => n.remove());
  const grid = el('div', { class: 'card-grid skeleton-grid' });
  for (let i = 0; i < 8; i++) {
    grid.appendChild(el('article', { class: 'card skeleton-card' },
      el('div', { class: 'skeleton-card-body' },
        el('div', { class: 'skeleton-line skeleton-line-lg' }),
        el('div', { class: 'skeleton-line skeleton-line-sm' }),
        el('div', { class: 'skeleton-bar' }),
        el('div', { class: 'skeleton-line skeleton-line-xs' })
      )
    ));
  }
  host.appendChild(grid);
}

async function refresh() {
  // Show skeletons only when the list area is empty (initial load / after delete).
  const host = $('#companyList');
  const showSkeletons = !host.querySelector('.card-grid, .row, .board, .company-table, .skeleton-grid');
  if (showSkeletons) renderSkeletons();
  try {
    const companies = await api('GET', API);
    if (!Array.isArray(companies)) throw new Error('Invalid response from server');
    lastCompanies = companies;          // cache for the detail overlay
    renderList(companies);
    if (selectedId) renderDetailOverlay();   // keep the open record in sync
  } catch (err) {
    toast(err.message, { error: true });
    // Show a retry action in place of the list
    if (host.querySelector('.skeleton-grid')) {
      host.replaceChildren(
        el('section', { class: 'intentional-empty', role: 'alert' },
          crmIcon('users'),
          el('strong', {}, 'Could not load companies'),
          el('p', {}, err.message),
          el('button', { class: 'btn btn-primary', onclick: refresh }, 'Try again')
        )
      );
    }
  }
}

async function logActivity(id, type) {
  try {
    await api('POST', `${API}/${encodeURIComponent(id)}/activity`, { type });
    toast(`Logged ${type} — warmth updated.`);
    refresh();
  } catch (err) {
    toast(err.message);
  }
}

async function removeCompany(id, name) {
  const modal = createDialog(`Archive ${name}`);
  const form = el('form', { class: 'relationship-form compact-form' },
    el('p', { class: 'confirmation-copy' }, 'Targets and active routes for this company will be archived together. Completed history remains intact and the entire account can be restored.'),
    formField('Reason', el('textarea', { name: 'reason', rows: '3', required: 'required', placeholder: 'Why is this account leaving active work?' })),
    el('p', { class: 'form-error', hidden: 'hidden', tabindex: '-1' }),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, 'Archive company'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('POST', `${API}/${encodeURIComponent(id)}/archive`, { actor: 'Manual update', reason: new FormData(form).get('reason') });
      modal.close();
      toast(`${name} archived.`);
      if (expandedId === id) expandedId = null;
      if (selectedId === id) closeDetail();
      await refresh();
      if (typeof refreshRelationships === 'function') await refreshRelationships({ render: false });
    } catch (err) { showFormError(form, err.message); }
  });
  modal.body.appendChild(form);
}

async function openArchivedCompanies() {
  const modal = createDialog('Archived companies');
  modal.body.replaceChildren(el('p', { class: 'people-loading', role: 'status' }, 'Loading archived companies…'));
  try {
    const companies = (await api('GET', `${API}?includeArchived=true`)).filter((company) => company.archivedAt);
    modal.body.replaceChildren(companies.length ? el('div', { class: 'archive-list' }, ...companies.map((company) => el('article', {},
      el('div', {}, el('strong', {}, company.name), el('p', {}, company.archiveReason || 'No archive reason'), el('small', {}, `Archived ${timeAgo(company.archivedAt)}`)),
      el('button', { class: 'btn btn-secondary', onclick: async () => {
        try { await api('POST', `${API}/${company.id}/restore`, { actor: 'Manual update' }); modal.close(); toast(`${company.name} restored.`); await refresh(); if (typeof refreshRelationships === 'function') await refreshRelationships({ render: false }); }
        catch (error) { toast(error.message, { error: true }); }
      } }, crmIcon('restore'), 'Restore')
    ))) : el('section', { class: 'intentional-empty compact' }, crmIcon('archive'), el('strong', {}, 'No archived companies'), el('p', {}, 'Archived accounts will appear here.')));
  } catch (error) { modal.body.replaceChildren(el('p', { class: 'form-error', role: 'alert' }, error.message)); }
}

// ---- modal: create / edit -------------------------------------------------

let editingId = null;

let _lastModalFocus = null;
let _formDirty = false;

function markFormDirty() { _formDirty = true; }

function resetFormDirty() { _formDirty = false; }

function openCreate() {
  _lastModalFocus = document.activeElement;
  editingId = null;
  $('#modalTitle').textContent = 'New company';
  $('#companyForm').reset();
  $('#formError').hidden = true;
  $('#modalOverlay').hidden = false;
  resetFormDirty();
  setTimeout(() => { $('#companyForm').querySelector('input, select, textarea')?.focus(); }, 50);
}

function openEdit(company) {
  _lastModalFocus = document.activeElement;
  editingId = company.id;
  $('#modalTitle').textContent = 'Edit company';
  const form = $('#companyForm');
  form.name.value = company.name || '';
  form.industry.value = company.industry || '';
  form.size.value = company.size || '';
  form.sector.value = company.sector || '';
  form.country.value = company.country || '';
  form.status.value = company.status || 'New';
  form.contactName.value = company.contactName || '';
  form.email.value = company.email || '';
  form.phone.value = company.phone || '';
  form.nextStepType.value = company.nextStep?.type || 'email';
  form.nextStepNote.value = company.nextStep?.note || '';
  form.notes.value = company.notes || '';
  form.createdBy.value = company.createdBy || '';
  const intel = company.intel || {};
  form.intelSignal.value = intel.signal || '';
  form.intelSignalType.value = intel.signalType || '';
  form.intelSignalTier.value = intel.signalTier || '';
  form.intelWhy.value = intel.whyItMatters || '';
  form.intelOpening.value = intel.commercialOpening || '';
  form.intelEvidence.value = intel.evidenceUrl || '';
  form.intelDoNotClaim.value = (intel.doNotClaim || []).join('\n');
  form.intelUncertainty.value = intel.uncertainty || '';
  $('#formError').hidden = true;
  $('#modalOverlay').hidden = false;
  resetFormDirty();
  setTimeout(() => { $('#companyForm').querySelector('input, select, textarea')?.focus(); }, 50);
}

function closeModal() {
  if (_formDirty && !confirm('Discard unsaved changes?')) return;
  $('#modalOverlay').hidden = true;
  if (_lastModalFocus) { _lastModalFocus.focus(); _lastModalFocus = null; }
}

async function submitForm(e) {
  e.preventDefault();
  const form = e.target;
  const errBox = $('#formError');
  errBox.hidden = true;

  // Build the intel block only if any signal field was filled.
  const intel = {
    signal: form.intelSignal.value.trim(),
    signalType: form.intelSignalType.value.trim(),
    signalTier: form.intelSignalTier.value,
    whyItMatters: form.intelWhy.value.trim(),
    commercialOpening: form.intelOpening.value.trim(),
    evidenceUrl: form.intelEvidence.value.trim(),
    doNotClaim: form.intelDoNotClaim.value.split('\n').map((s) => s.trim()).filter(Boolean),
    uncertainty: form.intelUncertainty.value.trim(),
  };

  const payload = {
    name: form.name.value.trim(),
    industry: form.industry.value.trim(),
    size: form.size.value ? Number(form.size.value) : null,
    sector: form.sector.value.trim(),
    country: form.country.value.trim(),
    status: form.status.value,
    contactName: form.contactName.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    nextStep: { type: form.nextStepType.value, note: form.nextStepNote.value.trim() },
    notes: form.notes.value.trim(),
    createdBy: form.createdBy.value.trim(),
    intel,
  };

  try {
    if (editingId) {
      // PATCH merges the fields onto the existing record — activity history,
      // intel, createdAt and createdBy are all preserved unless explicitly changed.
      await api('PATCH', `${API}/${encodeURIComponent(editingId)}`, payload);
      toast('Company updated.');
      editingId = null;
      resetFormDirty();
    } else {
      await api('POST', API, payload);
      toast('Company added.');
      resetFormDirty();
    }
    closeModal();
    refresh();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
}

// ---- wire up --------------------------------------------------------------

// View toggle — sync active state from the persisted view, bind clicks.
document.body.dataset.view = view;
$$('.view-btn').forEach((btn) => {
  if (btn.dataset.view === view) btn.classList.add('is-active');
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

$('#newBtn').addEventListener('click', openCreate);
$('#archivedCompaniesBtn').addEventListener('click', openArchivedCompanies);
$('#modalClose').addEventListener('click', closeModal);
$('#formCancel').addEventListener('click', closeModal);
$('#companyForm').addEventListener('submit', submitForm);
$('#companyForm').addEventListener('input', markFormDirty);
$('#companyForm').addEventListener('change', markFormDirty);
$('#modalOverlay').addEventListener('click', (e) => {
  if (e.target === $('#modalOverlay')) closeModal();
});
$('#modalOverlay').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || $('#modalOverlay').hidden) return;
  const focusable = $('#modalOverlay').querySelectorAll('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ---- Search / filter / sort wiring ----
// Debounce typing so we don't re-render on every keystroke.
let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTerm = e.target.value.trim();
    renderList(lastCompanies);
  }, 120);
});
['filterStatus', 'filterTier', 'sortBy', 'filterDue'].forEach((id) => {
  $('#' + id).addEventListener('change', (e) => {
    if (id === 'filterStatus') filterStatus = e.target.value;
    else if (id === 'filterTier') filterTier = e.target.value;
    else if (id === 'filterDue') filterDue = e.target.value;
    else sortBy = e.target.value;
    renderList(lastCompanies);
  });
});

// CSV export — downloads the full (non-archived) pipeline as a spreadsheet.
$('#exportBtn')?.addEventListener('click', () => {
  window.location.href = `${API}/export.csv`;
});

// Detail overlay: click the dimmed backdrop to close.
$('#detailBackdrop').addEventListener('click', closeDetail);

// Shortcuts help overlay.
$('#shortcutsOverlay').addEventListener('click', (e) => {
  if (e.target === $('#shortcutsOverlay')) $('#shortcutsOverlay').hidden = true;
});
$('#shortcutsClose').addEventListener('click', () => $('#shortcutsOverlay').hidden = true);
$('#shortcutsLink').addEventListener('click', () => $('#shortcutsOverlay').hidden = false);

// Navigate the highlighted card with j/k; returns true if handled.
function moveHighlight(dir) {
  const ordered = applyFilters(lastCompanies).map((c) => c.id);
  if (!ordered.length) return false;
  if (!highlightedId || !ordered.includes(highlightedId)) {
    highlightedId = dir > 0 ? ordered[0] : ordered[ordered.length - 1];
  } else {
    const idx = ordered.indexOf(highlightedId);
    highlightedId = ordered[(idx + dir + ordered.length) % ordered.length];
  }
  renderList(lastCompanies);
  // scroll into view
  const node = document.querySelector(`.card[data-id="${highlightedId}"], .row[data-id="${highlightedId}"]`);
  if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return true;
}

// Global keyboard shortcuts. Ignored while typing in an input (except '/' and '?').
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#shortcutsOverlay').hidden) { $('#shortcutsOverlay').hidden = true; return; }
    if (!$('#modalOverlay').hidden) closeModal();
    else if (selectedId) closeDetail();
    return;
  }
  const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || '');
  if (typing) {
    // Only '/' (focus search) and Esc (handled above) act while typing.
    if (e.key === '/' && document.activeElement?.id !== 'search') {
      e.preventDefault(); $('#search').focus();
    }
    return;
  }
  // Ignore if a modifier is held (let browser shortcuts through).
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key) {
    case '/': e.preventDefault(); $('#search').focus(); break;
    case '?': $('#shortcutsOverlay').hidden = false; break;
    case 'n': openCreate(); break;
    case 'g': setView('grid'); break;
    case 'l': setView('list'); break;
    case 'b': setView('board'); break;
    case 'j': e.preventDefault(); moveHighlight(1); break;
    case 'k': e.preventDefault(); moveHighlight(-1); break;
    case 'Enter':
      if (highlightedId) openDetail(highlightedId);
      break;
  }
});

refresh();

window.addEventListener('beforeunload', (e) => {
  if (!_formDirty && $('#modalOverlay').hidden) return;
  e.preventDefault();
  e.returnValue = '';
});
