/* Northwind CRM — relationship-led warm introduction layer. */

const PEOPLE_API = '/api/people';
const ROUTES_API = '/api/routes';
const ACTIVITIES_API = '/api/activities';
const ROUTE_STAGES = [
  'Found route', 'Mutual friend to contact', 'Intro requested', 'Intro agreed',
  'Target contacted', 'Meeting / reply', 'Won', 'Dead / no route',
];
const ROUTE_OWNERS = ['unassigned', 'Paul', 'Jeremy', 'Nilhan', 'other'];
const ACTIVE_STAGES = ROUTE_STAGES.filter((stage) => !['Won', 'Dead / no route'].includes(stage));

let people = [];
let routes = [];
let routeActivities = [];
let routeSubview = sessionStorage.getItem('crm-route-subview') || 'board';
let companyTab = 'overview';
let routeSearch = '';
let routeOwnerFilter = 'all';
let routeStageFilter = 'all';
let routeCompanyFilter = 'all';
let routeDueFilter = 'all';
let routeModalId = null;
let selectedRouteIds = new Set();
let draggedRouteId = '';

const personById = (id) => people.find((person) => person.id === id);
const companyById = (id) => lastCompanies.find((company) => company.id === id);
const routeActivityFor = (id) => routeActivities.filter((activity) => activity.routeId === id)
  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
const targetName = (route) => personById(route.targetPersonId)?.name || 'Unknown target';
const mutualName = (route) => personById(route.mutualPersonId)?.name || 'Unknown mutual';
const routeOwnerLabel = (owner) => owner === 'unassigned' ? 'Unassigned' : owner;

function formatDate(date) {
  if (!date) return 'No due date';
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function latestRouteActivity(route) {
  return routeActivityFor(route.id)[0]?.timestamp || route.createdAt;
}

function option(value, label, selectedValue) {
  return el('option', { value, selected: value === selectedValue ? 'selected' : null }, label);
}

async function refreshRelationships({ render = true } = {}) {
  try {
    [people, routes, routeActivities] = await Promise.all([
      api('GET', PEOPLE_API), api('GET', ROUTES_API), api('GET', ACTIVITIES_API),
    ]);
    if (render && !$('#routesView').hidden) renderRoutesShell();
    if (selectedId && !$('#detailOverlay').hidden) renderDetailOverlay();
  } catch (err) {
    toast(err.message);
  }
}

function setSection(section) {
  const isRoutes = section === 'routes';
  const isPeople = section === 'people';
  $('#companiesView').hidden = isRoutes || isPeople;
  $('#routesView').hidden = !isRoutes;
  $('#peopleView').hidden = !isPeople;
  $('.view-toggle').hidden = isRoutes || isPeople;
  $('#newBtn').hidden = isRoutes || isPeople;
  $('#archivedCompaniesBtn').hidden = isRoutes || isPeople;
  $$('[data-section]').forEach((item) => item.classList.toggle('is-active', item.dataset.section === section));
  sessionStorage.setItem('crm-section', section);
  if (isRoutes) {
    refreshRelationships({ render: false }).then(renderRoutesShell);
  } else if (isPeople && typeof refreshPeopleWorkspace === 'function') {
    refreshPeopleWorkspace();
  }
}

function routeMetrics() {
  const today = dateKey();
  const active = routes.filter((route) => !route.archivedAt && ACTIVE_STAGES.includes(route.stage));
  return {
    active: active.length,
    requested: new Set(routeActivities.filter((activity) => activity.type === 'intro_requested').map((activity) => activity.routeId)).size,
    awaiting: active.filter((route) => ['Intro requested', 'Target contacted'].includes(route.stage)).length,
    overdue: active.filter((route) => route.dueDate && route.dueDate < today).length,
  };
}

function renderRoutesShell() {
  const host = $('#routesView');
  const metrics = routeMetrics();
  host.replaceChildren(
    el('section', { class: 'routes-hero' },
      el('div', {},
        el('p', { class: 'eyebrow' }, routeSubview === 'owners' ? 'Owner accountability' : routeSubview === 'process' ? 'Relationship playbook' : 'Routes overview'),
        el('h2', {}, routeSubview === 'owners' ? 'Owner dashboard' : routeSubview === 'process' ? 'Warm Intro Process' : 'Turn relationships into conversations'),
        el('p', { class: 'routes-intro' }, routeSubview === 'process'
          ? 'An eight-step operating rhythm for warm, accountable introductions.'
          : 'Every target, mutual contact, owner and next move in one calm workspace.')
      ),
      routeSubview !== 'process' ? el('div', { class: 'metric-ribbon' },
        metricBlock(lastCompanies.length, 'companies'),
        metricBlock(metrics.active, 'active routes'),
        metricBlock(metrics.requested, 'intros requested'),
        metricBlock(metrics.awaiting, 'awaiting reply'),
        metricBlock(metrics.overdue, 'overdue')
      ) : null
    ),
    el('div', { class: 'route-subnav', role: 'tablist', 'aria-label': 'Routes views' },
      subviewButton('board', 'Routes board'),
      subviewButton('owners', 'Owner dashboard'),
      subviewButton('process', 'Process')
    ),
    routeSubview === 'board' ? renderRoutesBoardView()
      : routeSubview === 'owners' ? renderOwnerDashboard()
        : renderProcessView()
  );
  wireRoutesControls();
}

function metricBlock(value, label) {
  return el('div', { class: 'metric-block' }, el('strong', {}, String(value)), el('span', {}, label));
}

function subviewButton(value, label) {
  return el('button', {
    class: `route-subnav-btn${routeSubview === value ? ' is-active' : ''}`,
    role: 'tab',
    'aria-selected': routeSubview === value ? 'true' : 'false',
    'data-route-view': value,
  }, label);
}

function filteredRoutes() {
  const today = dateKey();
  return routes.filter((route) => !route.archivedAt && (() => {
    const haystack = `${route.companyName} ${targetName(route)} ${mutualName(route)} ${route.nextAction} ${route.notes}`.toLowerCase();
    const dueMatches = routeDueFilter === 'all'
      || (routeDueFilter === 'overdue' && route.dueDate && route.dueDate < today && ACTIVE_STAGES.includes(route.stage))
      || (routeDueFilter === 'today' && route.dueDate === today)
      || (routeDueFilter === 'week' && route.dueDate >= today && route.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    return (!routeSearch || haystack.includes(routeSearch.toLowerCase()))
      && (routeOwnerFilter === 'all' || route.owner === routeOwnerFilter)
      && (routeStageFilter === 'all' || route.stage === routeStageFilter)
      && (routeCompanyFilter === 'all' || route.companyId === routeCompanyFilter)
      && dueMatches;
  })());
}

function renderRoutesBoardView() {
  const active = routes.filter((route) => !route.archivedAt && ACTIVE_STAGES.includes(route.stage));
  const setupRoutes = active.filter((route) => route.owner === 'unassigned' || !route.dueDate || !route.nextAction);
  return el('section', { class: 'routes-workspace' },
    setupRoutes.length ? el('section', { class: 'route-setup-banner', 'aria-label': 'Routes needing setup' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Work queue'), el('h3', {}, `${setupRoutes.length} routes need an owner or next move`),
        el('p', {}, 'Select the unfinished routes, then assign and schedule them together.')),
      el('button', { class: 'btn btn-secondary', id: 'selectSetupRoutes', type: 'button' }, 'Select unfinished routes')
    ) : null,
    selectedRouteIds.size ? renderBulkActionBar() : null,
    el('div', { class: 'route-toolbar' },
      el('label', { class: 'route-search' },
        el('span', { class: 'sr-only' }, 'Search routes'),
        el('span', { 'aria-hidden': 'true' }, '⌕'),
        el('input', { id: 'routeSearch', type: 'search', value: routeSearch, placeholder: 'Search routes, companies, people…' })
      ),
      el('details', { class: 'route-filter-drawer', open: window.matchMedia('(max-width: 768px)').matches ? null : 'open' },
        el('summary', {}, crmIcon('filter'), 'Filters'),
        el('div', { class: 'route-filter-fields' },
          el('select', { id: 'routeOwnerFilter', 'aria-label': 'Filter by owner' },
            option('all', 'All owners', routeOwnerFilter), ...ROUTE_OWNERS.map((owner) => option(owner, routeOwnerLabel(owner), routeOwnerFilter))
          ),
          el('select', { id: 'routeStageFilter', 'aria-label': 'Filter by stage' },
            option('all', 'All stages', routeStageFilter), ...ROUTE_STAGES.map((stage) => option(stage, stage, routeStageFilter))
          ),
          el('select', { id: 'routeCompanyFilter', 'aria-label': 'Filter by company' },
            option('all', 'All companies', routeCompanyFilter), ...lastCompanies.map((company) => option(company.id, company.name, routeCompanyFilter))
          ),
          el('select', { id: 'routeDueFilter', 'aria-label': 'Filter by due date' },
            option('all', 'Due: any time', routeDueFilter), option('today', 'Due today', routeDueFilter), option('week', 'Due this week', routeDueFilter), option('overdue', 'Overdue', routeDueFilter)
          )
        )
      ),
      el('button', { class: 'btn btn-ghost', id: 'archivedRoutesBtn', type: 'button' }, 'Archived'),
      el('button', { class: 'btn btn-primary', id: 'newRouteBtn' }, '+ New route')
    ),
    renderRouteBoard()
  );
}

function renderBulkActionBar() {
  return el('form', { class: 'route-bulk-bar', id: 'routeBulkForm' },
    el('strong', {}, `${selectedRouteIds.size} selected`),
    el('select', { name: 'owner', 'aria-label': 'Assign selected routes' }, option('', 'Keep owner', ''), ...ROUTE_OWNERS.map((owner) => option(owner, routeOwnerLabel(owner), ''))),
    el('input', { name: 'dueDate', type: 'date', 'aria-label': 'Due date for selected routes' }),
    el('input', { name: 'nextAction', placeholder: 'Next action (optional)', 'aria-label': 'Next action for selected routes' }),
    el('button', { class: 'btn btn-primary', type: 'submit' }, 'Update selected'),
    el('button', { class: 'btn btn-ghost', id: 'clearRouteSelection', type: 'button' }, 'Clear')
  );
}

function renderRouteBoard() {
  const filtered = filteredRoutes();
  return el('div', { class: 'route-board', 'aria-label': 'Warm introduction routes' },
    ...ROUTE_STAGES.map((stage) => {
      const items = filtered.filter((route) => route.stage === stage);
      return el('section', { class: 'route-column', 'data-stage': stage },
        el('header', {}, el('h3', {}, stage), el('span', {}, String(items.length))),
        el('div', { class: 'route-column-body' },
          ...(items.length ? items.map(renderRouteCard) : [el('button', { class: 'route-empty', onclick: openRouteForm },
            el('span', { 'aria-hidden': 'true' }, '↗'), el('strong', {}, 'No routes here'), el('small', {}, 'Add a route or move one into this stage.')
          )])
        )
      );
    })
  );
}

function renderRouteCard(route) {
  const target = personById(route.targetPersonId) || {};
  const dueState = route.dueDate && route.dueDate < dateKey() && ACTIVE_STAGES.includes(route.stage) ? 'overdue' : '';
  const selected = selectedRouteIds.has(route.id);
  return el('article', { class: `route-card${selected ? ' is-selected' : ''}`, 'data-route-id': route.id, draggable: 'true', tabindex: '0' },
    el('div', { class: 'route-card-controls' },
      el('label', { class: 'route-select', title: 'Select route' },
        el('input', { type: 'checkbox', checked: selected ? 'checked' : null, 'aria-label': `Select ${target.name || route.companyName}` }),
        el('span', { 'aria-hidden': 'true' })
      ),
      el('select', { class: 'route-stage-menu', 'aria-label': `Move ${target.name || route.companyName} to stage` },
        ...ROUTE_STAGES.map((stage) => option(stage, stage, route.stage)))
    ),
    el('button', { class: 'route-card-open', type: 'button', onclick: () => openRouteDetail(route.id) },
      el('div', { class: 'route-card-top' },
        el('span', { class: 'company-glyph' }, (route.companyName || 'N').slice(0, 1)),
        el('div', {}, el('strong', {}, route.companyName), el('span', {}, target.name || 'Unknown target')),
        el('span', { class: 'confidence-chip', 'data-confidence': route.confidence }, route.confidence)
      ),
      el('p', { class: 'target-title' }, target.title || 'Title not set'),
      el('div', { class: 'relationship-thread' },
        el('span', { class: 'thread-node' }), el('span', { class: 'thread-line' }), el('span', {}, 'via '), el('strong', {}, mutualName(route))
      ),
      el('div', { class: 'route-card-foot' },
        el('span', { class: 'owner-pill', 'data-owner': route.owner }, routeOwnerLabel(route.owner)),
        el('span', { class: dueState }, route.dueDate ? formatDate(route.dueDate) : 'No due date')
      ),
      el('p', { class: 'route-next' }, route.nextAction || 'Next action not set')
    )
  );
}

function wireRoutesControls() {
  $$('[data-route-view]').forEach((button) => button.addEventListener('click', () => {
    routeSubview = button.dataset.routeView;
    sessionStorage.setItem('crm-route-subview', routeSubview);
    renderRoutesShell();
  }));
  const search = $('#routeSearch');
  if (search) search.addEventListener('input', (event) => {
    routeSearch = event.target.value;
    clearTimeout(search._routeTimer);
    search._routeTimer = setTimeout(() => {
      renderRoutesShell();
      const next = $('#routeSearch');
      if (next) { next.focus(); next.setSelectionRange(routeSearch.length, routeSearch.length); }
    }, 120);
  });
  for (const [id, setter] of [
    ['routeOwnerFilter', (value) => { routeOwnerFilter = value; }],
    ['routeStageFilter', (value) => { routeStageFilter = value; }],
    ['routeCompanyFilter', (value) => { routeCompanyFilter = value; }],
    ['routeDueFilter', (value) => { routeDueFilter = value; }],
  ]) {
    const control = $(`#${id}`);
    if (control) control.addEventListener('change', (event) => { setter(event.target.value); renderRoutesShell(); });
  }
  const create = $('#newRouteBtn');
  if (create) create.addEventListener('click', () => openRouteForm());
  $('#archivedRoutesBtn')?.addEventListener('click', openArchivedRoutes);
  const setup = $('#selectSetupRoutes');
  if (setup) setup.addEventListener('click', () => {
    selectedRouteIds = new Set(routes.filter((route) => !route.archivedAt && ACTIVE_STAGES.includes(route.stage)
      && (route.owner === 'unassigned' || !route.dueDate || !route.nextAction)).map((route) => route.id));
    renderRoutesShell();
  });
  const clear = $('#clearRouteSelection');
  if (clear) clear.addEventListener('click', () => { selectedRouteIds.clear(); renderRoutesShell(); });
  const bulk = $('#routeBulkForm');
  if (bulk) bulk.addEventListener('submit', submitBulkRoutes);

  $$('.route-card').forEach((card) => {
    const id = card.dataset.routeId;
    const checkbox = card.querySelector('.route-select input');
    checkbox?.addEventListener('change', () => {
      if (checkbox.checked) selectedRouteIds.add(id); else selectedRouteIds.delete(id);
      renderRoutesShell();
    });
    card.querySelector('.route-stage-menu')?.addEventListener('change', (event) => performMoveStage(id, event.target.value));
    card.addEventListener('dragstart', (event) => {
      if (event.target.closest('select, input, button')) { event.preventDefault(); return; }
      draggedRouteId = id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => { draggedRouteId = ''; card.classList.remove('is-dragging'); });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const route = routes.find((item) => item.id === id);
      const index = ROUTE_STAGES.indexOf(route.stage) + (event.key === 'ArrowRight' ? 1 : -1);
      if (index >= 0 && index < ROUTE_STAGES.length && !['Won', 'Dead / no route'].includes(ROUTE_STAGES[index])) {
        performMoveStage(id, ROUTE_STAGES[index]);
      }
    });
  });
  $$('.route-column').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      if (!draggedRouteId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      column.classList.add('is-drop-target');
    });
    column.addEventListener('dragleave', () => column.classList.remove('is-drop-target'));
    column.addEventListener('drop', (event) => {
      event.preventDefault();
      column.classList.remove('is-drop-target');
      const id = event.dataTransfer.getData('text/plain') || draggedRouteId;
      if (id) performMoveStage(id, column.dataset.stage);
    });
  });
}

async function openArchivedRoutes() {
  const modal = createDialog('Archived routes');
  modal.body.replaceChildren(el('p', { class: 'people-loading', role: 'status' }, 'Loading archived routes…'));
  try {
    const [allRoutes, allPeople] = await Promise.all([api('GET', `${ROUTES_API}?includeArchived=true`), api('GET', `${PEOPLE_API}?includeArchived=true`)]);
    const archived = allRoutes.filter((route) => route.archivedAt);
    const archivedPersonName = (id) => allPeople.find((person) => person.id === id)?.name || 'Unknown person';
    modal.body.replaceChildren(archived.length ? el('div', { class: 'archive-list' }, ...archived.map((route) => el('article', {},
      el('div', {}, el('strong', {}, `${archivedPersonName(route.targetPersonId)} via ${archivedPersonName(route.mutualPersonId)}`), el('p', {}, route.companyName), el('small', {}, route.archiveReason || 'No archive reason')),
      el('button', { class: 'btn btn-secondary', onclick: async () => {
        try { await api('POST', `${ROUTES_API}/${route.id}/restore`, { actor: 'Manual update' }); modal.close(); toast('Route restored.'); await refreshRelationships(); }
        catch (error) { toast(error.message, { error: true }); }
      } }, crmIcon('restore'), 'Restore')
    ))) : el('section', { class: 'intentional-empty compact' }, crmIcon('archive'), el('strong', {}, 'No archived routes'), el('p', {}, 'Archived introduction paths will appear here.')));
  } catch (error) { modal.body.replaceChildren(el('p', { class: 'form-error', role: 'alert' }, error.message)); }
}

async function submitBulkRoutes(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const body = { routeIds: [...selectedRouteIds], actor: 'Manual update' };
  for (const key of ['owner', 'dueDate', 'nextAction']) if (values[key]) body[key] = values[key];
  if (!body.owner && !body.dueDate && !body.nextAction) return toast('Choose an owner, due date, or next action.', { error: true });
  try {
    await api('POST', `${ROUTES_API}/bulk/actions`, body);
    selectedRouteIds.clear();
    toast('Selected routes updated.');
    await refreshRelationships();
  } catch (error) { toast(error.message, { error: true }); }
}

async function performMoveStage(routeId, stage) {
  const route = routes.find((item) => item.id === routeId);
  if (!route || route.stage === stage) return;
  if (['Won', 'Dead / no route'].includes(stage)) {
    renderRoutesShell();
    openRouteDetail(routeId);
    return toast('Use Mark won or Mark dead so the outcome has a reason.');
  }
  try {
    const result = await api('POST', `${ROUTES_API}/${encodeURIComponent(routeId)}/actions`, {
      action: 'move_stage', stage, actor: route.owner === 'unassigned' ? 'Manual update' : route.owner,
    });
    await refreshRelationships();
    toast(`Moved to ${stage}.`, {
      undo: async () => {
        await api('POST', `${ROUTES_API}/${encodeURIComponent(routeId)}/actions/${encodeURIComponent(result.activity.id)}/undo`, {
          actor: route.owner === 'unassigned' ? 'Manual update' : route.owner,
        });
        await refreshRelationships();
        toast('Stage move undone.');
      },
    });
  } catch (error) { toast(error.message, { error: true }); }
}

function createDialog(title, className = '') {
  const previouslyFocused = document.activeElement;
  const overlay = el('div', { class: `relationship-overlay ${className}`, role: 'presentation' });
  const dialog = el('section', { class: 'relationship-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    el('header', { class: 'relationship-dialog-head' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Northwind relationship intelligence'), el('h2', {}, title)),
      el('button', { class: 'record-close', 'aria-label': 'Close dialog' }, crmIcon('close'))
    ),
    el('div', { class: 'relationship-dialog-body' })
  );
  overlay.appendChild(dialog);
  const close = () => {
    document.removeEventListener('keydown', keyHandler, true);
    overlay.remove();
    document.body.classList.remove('relationship-open');
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  };
  const keyHandler = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button, input, select, textarea, a[href]')].filter((node) => !node.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  dialog.querySelector('.record-close').addEventListener('click', close);
  document.addEventListener('keydown', keyHandler, true);
  document.body.appendChild(overlay);
  document.body.classList.add('relationship-open');
  requestAnimationFrame(() => dialog.focus());
  return { overlay, dialog, body: dialog.querySelector('.relationship-dialog-body'), close };
}

function formField(label, control) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
}

function openRouteForm(existing = null, preset = {}) {
  const modal = createDialog(existing ? 'Edit route' : 'Create a warm-introduction route', 'route-form-overlay');
  const form = el('form', { class: 'relationship-form' });
  const companySelect = el('select', { name: 'companyId', required: 'required' },
    option('', 'Choose a company', existing?.companyId || preset.companyId || ''),
    ...lastCompanies.map((company) => option(company.id, company.name, existing?.companyId || preset.companyId || ''))
  );
  const targetSelect = el('select', { name: 'targetPersonId', required: 'required' });
  const mutualSelect = el('select', { name: 'mutualPersonId', required: 'required' });
  const selectedTarget = existing?.targetPersonId || preset.targetPersonId || '';
  const selectedMutual = existing?.mutualPersonId || preset.mutualPersonId || '';

  function syncPeopleSelects() {
    const targets = people.filter((person) => ['target', 'both'].includes(person.type) && person.companyId === companySelect.value);
    targetSelect.replaceChildren(option('', targets.length ? 'Choose a target' : 'Add a target from the company People tab', selectedTarget),
      ...targets.map((person) => option(person.id, person.name, selectedTarget)));
    const target = personById(targetSelect.value || selectedTarget);
    const mutuals = (target?.mutualPersonIds || []).map(personById).filter(Boolean);
    mutualSelect.replaceChildren(option('', mutuals.length ? 'Choose a mutual contact' : 'Attach a mutual from the People tab', selectedMutual),
      ...mutuals.map((person) => option(person.id, person.name, selectedMutual)));
  }
  companySelect.addEventListener('change', syncPeopleSelects);
  targetSelect.addEventListener('change', () => {
    const target = personById(targetSelect.value);
    mutualSelect.replaceChildren(option('', 'Choose a mutual contact', ''),
      ...(target?.mutualPersonIds || []).map(personById).filter(Boolean).map((person) => option(person.id, person.name, '')));
  });
  syncPeopleSelects();

  form.append(
    el('div', { class: 'field-row' }, formField('Company', companySelect), formField('Target person', targetSelect)),
    el('div', { class: 'field-row' }, formField('Mutual contact', mutualSelect),
      formField('Owner', el('select', { name: 'owner' }, ...ROUTE_OWNERS.map((owner) => option(owner, routeOwnerLabel(owner), existing?.owner || 'unassigned'))))),
    el('div', { class: 'field-row' },
      formField('Stage', el('select', { name: 'stage' }, ...ROUTE_STAGES.map((stage) => option(stage, stage, existing?.stage || 'Found route')))),
      formField('Confidence', el('select', { name: 'confidence' }, ...['emerging', 'promising', 'strong'].map((value) => option(value, value[0].toUpperCase() + value.slice(1), existing?.confidence || 'emerging'))))
    ),
    el('div', { class: 'field-row' },
      formField('Next action', el('input', { name: 'nextAction', value: existing?.nextAction || '', placeholder: 'What happens next?' })),
      formField('Due date', el('input', { name: 'dueDate', type: 'date', value: existing?.dueDate || '' }))
    ),
    formField('Notes', el('textarea', { name: 'notes', rows: '4', placeholder: 'Context about this introduction path' }, existing?.notes || '')),
    el('p', { class: 'form-error', hidden: 'hidden' }),
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, existing ? 'Save route' : 'Create route')
    )
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const error = form.querySelector('.form-error');
    try {
      if (existing) {
        await api('POST', `${ROUTES_API}/${encodeURIComponent(existing.id)}/actions`, {
          action: 'edit', actor: existing.owner === 'unassigned' ? 'Manual update' : existing.owner, changes: values,
        });
        toast('Route updated.');
      } else {
        await api('POST', ROUTES_API, values);
        toast('Route created.');
      }
      modal.close();
      await refreshRelationships();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
  modal.body.appendChild(form);
}

function openRouteDetail(id) {
  const route = routes.find((item) => item.id === id);
  if (!route) return;
  routeModalId = id;
  const target = personById(route.targetPersonId) || {};
  const mutual = personById(route.mutualPersonId) || {};
  const modal = createDialog(`${route.companyName} → ${target.name}`, 'route-detail-overlay');
  modal.dialog.classList.add('route-command-panel');
  const actions = [
    ['call_mutual', 'phone', 'Log call'], ['message_mutual', 'message', 'Log message'],
    ['intro_requested', 'arrow', 'Intro requested'], ['intro_agreed', 'check', 'Intro agreed'],
    ['target_contacted', 'users', 'Target contacted'], ['meeting_reply', 'meeting', 'Meeting / reply'],
    ['mark_won', 'win', 'Mark won'], ['mark_dead', 'archive', 'Mark dead'],
  ];
  modal.body.append(
    el('div', { class: 'route-command-hero' },
      el('div', { class: 'company-glyph large' }, route.companyName.slice(0, 1)),
      el('div', {}, el('span', { class: 'detail-label' }, 'Target'), el('h3', {}, target.name), el('p', {}, target.title || 'Title not set')),
      el('div', {}, el('span', { class: 'detail-label' }, 'Via'), el('h3', { class: 'via-name' }, mutual.name), el('p', {}, mutual.location || 'Mutual contact')),
      el('div', {}, el('span', { class: 'detail-label' }, 'Owner'), el('span', { class: 'owner-pill', 'data-owner': route.owner }, routeOwnerLabel(route.owner)))
    ),
    el('div', { class: 'route-summary-grid' },
      summaryCell('Stage', route.stage), summaryCell('Confidence', route.confidence),
      summaryCell('Due date', formatDate(route.dueDate)), summaryCell('Next action', route.nextAction || 'Not set'),
      summaryCell('Outcome', route.outcome), summaryCell('Notes', route.notes || 'No notes yet')
    ),
    el('section', { class: 'route-action-section' },
      el('div', { class: 'section-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, 'Action bar'), el('h3', {}, 'Move the relationship forward')),
        el('div', {},
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { modal.close(); openReassignRoute(route); } }, 'Reassign'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { modal.close(); openRouteForm(route); } }, 'Edit route'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openArchiveRoute(route, modal) }, 'Archive')
        )),
      el('div', { class: 'route-actions-grid' }, ...actions.map(([value, icon, label]) => el('button', {
        class: `route-action${value === 'mark_dead' ? ' danger' : ''}`,
        onclick: () => ['call_mutual', 'message_mutual', 'mark_won', 'mark_dead'].includes(value)
          ? openRouteActionForm(route, value, modal)
          : performRouteAction(route, value, modal),
      }, crmIcon(icon), label)))
    ),
    el('section', { class: 'activity-panel' },
      el('div', { class: 'section-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, 'Activity'), el('h3', {}, 'Relationship timeline')),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openActivityNote(route, modal) }, '+ Add note')),
      renderRouteTimeline(route)
    )
  );
}

function summaryCell(label, value) {
  return el('div', {}, el('span', { class: 'detail-label' }, label), el('strong', {}, value));
}

function renderRouteTimeline(route) {
  const items = routeActivityFor(route.id);
  if (!items.length) return el('div', { class: 'intentional-empty compact' }, el('span', {}, '◌'), el('strong', {}, 'No activity yet'), el('p', {}, 'The first real interaction will appear here.'));
  return el('ol', { class: 'route-timeline' }, ...items.map((activity) => el('li', {},
    el('span', { class: 'activity-dot', 'data-type': activity.type }),
    el('div', {}, el('strong', {}, activity.summary),
      activity.details || activity.reason ? el('p', { class: 'activity-detail' }, activity.details || activity.reason) : null,
      el('p', {}, `${activity.actor} · ${new Date(activity.timestamp).toLocaleString()}`))
  )));
}

async function performRouteAction(route, action, modal, payload = {}) {
  if (route.owner === 'unassigned' && !['mark_dead'].includes(action)) {
    toast('Assign Paul, Jeremy, or another owner before logging this action.');
    return;
  }
  try {
    const result = await api('POST', `${ROUTES_API}/${encodeURIComponent(route.id)}/actions`, {
      action, actor: route.owner === 'unassigned' ? 'Manual update' : route.owner,
      ...payload,
    });
    modal.close();
    await refreshRelationships();
    toast('Route and timeline updated.', {
      undo: async () => {
        await api('POST', `${ROUTES_API}/${route.id}/actions/${result.activity.id}/undo`, {
          actor: route.owner === 'unassigned' ? 'Manual update' : route.owner,
        });
        await refreshRelationships();
        toast('Route update undone.');
      },
    });
  } catch (err) { toast(err.message, { error: true }); }
}

function openRouteActionForm(route, action, parentModal) {
  parentModal.close();
  const terminal = ['mark_won', 'mark_dead'].includes(action);
  const communication = ['call_mutual', 'message_mutual'].includes(action);
  const labels = { mark_won: 'Mark route won', mark_dead: 'Mark route dead', call_mutual: 'Log mutual call', message_mutual: 'Log mutual message' };
  const modal = createDialog(labels[action]);
  const form = el('form', { class: 'relationship-form compact-form' },
    terminal ? el('p', { class: 'confirmation-copy' }, action === 'mark_won'
      ? 'This closes the active route as a win. You will have 30 seconds to undo it.'
      : 'This closes the active route with no path forward. Record why so the history stays useful.') : null,
    terminal ? formField('Reason', el('textarea', { name: 'reason', required: 'required', rows: '3', placeholder: 'Why is this the right outcome?' })) : null,
    formField(communication ? 'Outcome or notes' : 'Details', el('textarea', { name: 'details', rows: '3', placeholder: 'What happened?' })),
    communication ? el('div', { class: 'field-row' },
      formField('Next action', el('input', { name: 'nextAction', value: route.nextAction || '', placeholder: 'What happens next?' })),
      formField('Follow-up date', el('input', { name: 'dueDate', type: 'date', value: route.dueDate || '' }))
    ) : null,
    el('p', { class: 'form-error', hidden: 'hidden', tabindex: '-1' }),
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'),
      el('button', { type: 'submit', class: `btn ${action === 'mark_dead' ? 'btn-danger' : 'btn-primary'}` }, labels[action])
    )
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    await performRouteAction(route, action, modal, Object.fromEntries(new FormData(form)));
  });
  modal.body.appendChild(form);
}

function openArchiveRoute(route, parentModal) {
  parentModal.close();
  const modal = createDialog('Archive route');
  const form = el('form', { class: 'relationship-form compact-form' },
    el('p', { class: 'confirmation-copy' }, 'Archive hides this route from active work without deleting its activity history.'),
    formField('Reason', el('textarea', { name: 'reason', required: 'required', rows: '3' })),
    el('p', { class: 'form-error', hidden: 'hidden', tabindex: '-1' }),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, 'Archive route'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('POST', `${ROUTES_API}/${route.id}/archive`, { actor: 'Manual update', reason: new FormData(form).get('reason') });
      modal.close(); toast('Route archived.'); await refreshRelationships();
    } catch (error) { showFormError(form, error.message); }
  });
  modal.body.appendChild(form);
}

function openReassignRoute(route) {
  const modal = createDialog('Reassign route');
  const form = el('form', { class: 'relationship-form compact-form' },
    formField('New owner', el('select', { name: 'owner' }, ...ROUTE_OWNERS.map((owner) => option(owner, routeOwnerLabel(owner), route.owner)))),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, 'Reassign'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const owner = new FormData(form).get('owner');
    try {
      await api('POST', `${ROUTES_API}/${route.id}/actions`, { action: 'reassign', owner, actor: route.owner === 'unassigned' ? 'Manual update' : route.owner });
      modal.close(); toast(`Assigned to ${routeOwnerLabel(owner)}.`); await refreshRelationships();
    } catch (err) { toast(err.message); }
  });
  modal.body.appendChild(form);
}

function openActivityNote(route, parentModal) {
  parentModal.close();
  const modal = createDialog('Add route note');
  const form = el('form', { class: 'relationship-form compact-form' },
    formField('Note', el('textarea', { name: 'summary', rows: '5', required: 'required', placeholder: 'Record useful context or a decision' })),
    formField('Actor', el('input', { name: 'actor', required: 'required', value: route.owner === 'unassigned' ? '' : route.owner, placeholder: 'Paul, Jeremy, Nilhan…' })),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, 'Add note'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form));
    try {
      await api('POST', ACTIVITIES_API, { ...values, routeId: route.id, companyId: route.companyId, type: 'note' });
      modal.close(); toast('Note added.'); await refreshRelationships(); openRouteDetail(route.id);
    } catch (err) { toast(err.message); }
  });
  modal.body.appendChild(form);
}

function ownerRoutes(owner) {
  return routes.filter((route) => !route.archivedAt && route.owner === owner && ACTIVE_STAGES.includes(route.stage));
}

function dashboardMetric(value, label, filters) {
  return el('button', { class: 'metric-block dashboard-metric', onclick: () => {
    routeOwnerFilter = filters.owner || 'all';
    routeDueFilter = filters.due || 'all';
    routeStageFilter = filters.stage || 'all';
    routeSubview = 'board';
    sessionStorage.setItem('crm-route-subview', routeSubview);
    renderRoutesShell();
  } }, el('strong', {}, String(value)), el('span', {}, label));
}

function renderOwnerDashboard() {
  const today = dateKey();
  const owners = ['Paul', 'Jeremy'];
  const active = routes.filter((route) => !route.archivedAt && ACTIVE_STAGES.includes(route.stage));
  const priority = active.filter((route) => route.dueDate && route.dueDate <= new Date(Date.now() + 86400000).toISOString().slice(0, 10))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const stuck = active.filter((route) => daysSince(latestRouteActivity(route)) >= 7).sort((a, b) => daysSince(latestRouteActivity(b)) - daysSince(latestRouteActivity(a)));
  return el('section', { class: 'owner-dashboard' },
    el('div', { class: 'owner-cards' }, ...owners.map((owner) => {
      const assigned = ownerRoutes(owner);
      const withNext = assigned.filter((route) => route.nextAction).length;
      const percent = assigned.length ? Math.round(withNext / assigned.length * 100) : 0;
      return el('article', { class: 'owner-card' },
        el('header', {}, el('span', { class: 'owner-avatar' }, owner.slice(0, 1)), el('div', {}, el('h3', {}, owner), el('p', {}, 'Route owner'))),
        el('div', { class: 'owner-stats' },
          dashboardMetric(assigned.length, 'assigned routes', { owner }),
          dashboardMetric(assigned.filter((route) => route.dueDate === today).length, 'due today', { owner, due: 'today' }),
          dashboardMetric(assigned.filter((route) => route.dueDate && route.dueDate < today).length, 'overdue', { owner, due: 'overdue' }),
          dashboardMetric(assigned.filter((route) => route.stage === 'Intro requested').length, 'intros requested', { owner, stage: 'Intro requested' })
        ),
        el('div', { class: 'progress-label' }, el('span', {}, 'Routes with a next action'), el('strong', {}, `${withNext} / ${assigned.length}`)),
        el('div', { class: 'owner-progress' }, el('span', { style: `width:${percent}%` })),
        el('p', { class: 'progress-caption' }, assigned.length ? `${percent}% ready for the next move` : 'Assign a route to begin')
      );
    })),
    renderRouteTable('Today’s priority routes', priority, 'No routes are due today or tomorrow.'),
    renderRouteTable('Stuck routes', stuck, 'No active routes have been idle for 7+ days.', true)
  );
}

function renderRouteTable(title, items, emptyText, stuck = false) {
  return el('section', { class: 'route-table-panel' },
    el('div', { class: 'section-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, stuck ? 'No activity for 7+ days' : 'Focus queue'), el('h3', {}, title)), el('span', { class: 'count-badge' }, String(items.length))),
    items.length ? el('div', { class: 'route-table-scroll' }, el('table', { class: 'route-table' },
      el('thead', {}, el('tr', {}, ...['Owner', 'Company', 'Target', 'Via', 'Stage', 'Next action', stuck ? 'Days stuck' : 'Due', 'Action'].map((value) => el('th', {}, value)))),
      el('tbody', {}, ...items.map((route) => el('tr', { onclick: () => openRouteDetail(route.id), onkeydown: (event) => { if (event.key === 'Enter') openRouteDetail(route.id); }, tabindex: '0' },
        el('td', {}, routeOwnerLabel(route.owner)), el('td', {}, route.companyName), el('td', {}, targetName(route)), el('td', {}, mutualName(route)),
        el('td', {}, el('span', { class: 'stage-chip' }, route.stage)), el('td', {}, route.nextAction || 'Not set'),
        el('td', {}, stuck ? String(daysSince(latestRouteActivity(route))) : formatDate(route.dueDate)),
        el('td', {}, el('button', { class: 'btn btn-ghost btn-sm', onclick: (event) => { event.stopPropagation(); openRouteForm(route); } }, 'Edit next move'))
      )))
    )) : el('div', { class: 'intentional-empty compact' }, crmIcon('check'), el('strong', {}, emptyText))
  );
}

function renderProcessView() {
  const steps = [
    ['Find target people', 'Identify high-value people inside the company.'],
    ['Attach mutual contacts', 'Connect every target to real people in your network.'],
    ['Create route', 'Turn a relationship into a trackable path.'],
    ['Assign owner', 'Give Paul, Jeremy, or another owner clear accountability.'],
    ['Contact mutual friend', 'Reach out with context and a specific ask.'],
    ['Request intro', 'Ask for a warm introduction to the target.'],
    ['Contact target', 'Follow through and begin the conversation.'],
    ['Meeting / won / dead', 'Record the outcome and keep the pipeline honest.'],
  ];
  return el('section', { class: 'process-view' },
    el('div', { class: 'process-steps' }, ...steps.map(([title, copy], index) => el('article', { class: 'process-step' },
      el('span', { class: 'process-number' }, String(index + 1)),
      el('div', { class: 'process-icon', 'aria-hidden': 'true' }, crmIcon(['search', 'users', 'arrow', 'users', 'message', 'arrow', 'meeting', 'win'][index])),
      el('h3', {}, title), el('p', {}, copy)
    ))),
    el('div', { class: 'process-tools' },
      processTool('arrow', 'Routes board', 'See every introduction path and move it through the real stage.'),
      processTool('users', 'Relationship map', 'Understand exactly who connects each target to your team.'),
      processTool('users', 'Owner dashboard', 'Keep Paul and Jeremy focused on due, overdue, and stuck routes.'),
      el('article', { class: 'process-tool tracked' }, el('span', {}, 'What gets tracked'), el('ul', {}, ...['Target person', 'Mutual contact', 'Owner', 'Stage', 'Next action', 'Due date', 'Activity timeline', 'Outcome'].map((item) => el('li', {}, crmIcon('check'), ' ', item))))
    )
  );
}

function processTool(icon, title, copy) {
  return el('article', { class: 'process-tool' }, el('span', { class: 'process-tool-icon' }, crmIcon(icon)), el('h3', {}, title), el('p', {}, copy));
}

// Company relationship tabs -------------------------------------------------

function renderCompanyTabs(company) {
  const shell = el('div', { class: 'company-tabs-shell' });
  const tabs = el('div', { class: 'company-tabs', role: 'tablist', 'aria-label': 'Company details' });
  for (const [value, label] of [['overview', 'Overview'], ['people', 'People'], ['routes', 'Routes'], ['activity', 'Activity']]) {
    tabs.appendChild(el('button', { class: companyTab === value ? 'is-active' : '', role: 'tab', 'aria-selected': companyTab === value ? 'true' : 'false', onclick: () => { companyTab = value; renderDetailOverlay(); } }, label));
  }
  shell.append(tabs, companyTab === 'overview' ? renderDetail(company)
    : companyTab === 'people' ? renderCompanyPeople(company)
      : companyTab === 'routes' ? renderCompanyRoutes(company)
        : renderCompanyActivity(company));
  return shell;
}

function renderCompanyPeople(company) {
  const targets = people.filter((person) => ['target', 'both'].includes(person.type) && person.companyId === company.id);
  const mutualIds = [...new Set(targets.flatMap((target) => target.mutualPersonIds || []))];
  const mutuals = mutualIds.map(personById).filter(Boolean);
  const assigned = routes.filter((route) => !route.archivedAt && route.companyId === company.id && route.owner !== 'unassigned');
  return el('section', { class: 'company-relationships' },
    el('div', { class: 'relationship-summary' }, metricBlock(targets.length, 'target people'), metricBlock(mutuals.length, 'mutual contacts'), metricBlock(assigned.length, 'assigned routes'),
      el('button', { class: 'btn btn-primary', onclick: () => openPersonForm(company) }, '+ Add target')),
    el('div', { class: 'relationship-columns' },
      el('section', { class: 'relationship-panel' }, panelHeading('Target people', targets.length),
        targets.length ? el('div', { class: 'person-list' }, ...targets.map((target) => renderTargetRow(company, target)))
          : emptyPanel('No target people yet', 'Add the first person you want to reach inside this company.')),
      el('section', { class: 'relationship-panel' }, panelHeading('Mutual contacts', mutuals.length),
        mutuals.length ? el('div', { class: 'person-list' }, ...mutuals.map((mutual) => el('div', { class: 'person-row' },
          el('span', { class: 'person-avatar' }, mutual.name.slice(0, 1)), el('div', {}, el('strong', {}, mutual.name), el('small', {}, mutual.title || mutual.location || 'Mutual contact'))
        ))) : emptyPanel('No mutual contacts attached', 'Attach a real connection to one of the targets.')),
      el('section', { class: 'relationship-panel suggested-panel' }, panelHeading('Suggested routes', targets.reduce((sum, target) => sum + (target.mutualPersonIds || []).length, 0)),
        targets.length ? el('div', { class: 'suggestion-list' }, ...targets.flatMap((target) => (target.mutualPersonIds || []).map((id) => renderSuggestion(company, target, personById(id)))))
          : emptyPanel('No suggested routes yet', 'Targets and mutuals become route suggestions here.')),
      el('section', { class: 'relationship-panel assigned-panel' }, panelHeading('Assigned routes', assigned.length),
        assigned.length ? el('div', { class: 'assigned-list' }, ...assigned.map((route) => el('button', { onclick: () => openRouteDetail(route.id) },
          el('strong', {}, targetName(route)), el('span', {}, `via ${mutualName(route)}`), el('span', { class: 'owner-pill', 'data-owner': route.owner }, route.owner), el('small', {}, `${route.stage} · ${route.nextAction || 'No next action'}`)
        ))) : emptyPanel('No assigned routes', 'Choose a suggested path and assign Paul or Jeremy.'))
    )
  );
}

function panelHeading(title, count) {
  return el('header', { class: 'panel-heading' }, el('h3', {}, title), el('span', {}, String(count)));
}

function emptyPanel(title, copy) {
  return el('div', { class: 'intentional-empty compact' }, el('span', {}, '↗'), el('strong', {}, title), el('p', {}, copy));
}

function renderTargetRow(company, target) {
  return el('article', { class: 'target-row' },
    el('div', { class: 'person-row' }, el('span', { class: 'person-avatar' }, target.name.slice(0, 1)), el('div', {}, el('strong', {}, target.name), el('small', {}, target.title || 'Title not set'), el('small', {}, target.location || 'Location not set'))),
    el('div', { class: 'target-actions' },
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openPersonForm(company, target) }, 'Edit'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openMutualForm(target) }, '+ Mutual')
    ),
    (target.mutualPersonIds || []).length ? el('div', { class: 'target-mutuals' }, ...(target.mutualPersonIds || []).map((id) => {
      const mutual = personById(id); if (!mutual) return null;
      return el('span', {}, mutual.name, el('button', { 'aria-label': `Unlink ${mutual.name}`, onclick: () => unlinkMutual(target, id) }, '×'));
    })) : null
  );
}

function renderSuggestion(company, target, mutual) {
  if (!mutual) return null;
  const existing = routes.find((route) => route.companyId === company.id && route.targetPersonId === target.id && route.mutualPersonId === mutual.id && ACTIVE_STAGES.includes(route.stage));
  return el('article', { class: 'suggestion-row' },
    el('div', {}, el('strong', {}, target.name), el('small', {}, target.title || 'Target person')),
    el('span', { class: 'suggestion-arrow' }, '→'),
    el('div', {}, el('span', {}, 'via'), el('strong', { class: 'via-name' }, mutual.name)),
    el('button', { class: 'btn btn-ghost btn-sm', onclick: () => existing && existing.owner !== 'unassigned' ? openRouteDetail(existing.id) : existing ? openRouteForm(existing) : openRouteForm(null, { companyId: company.id, targetPersonId: target.id, mutualPersonId: mutual.id }) },
      existing?.owner === 'unassigned' ? 'Assign route' : existing ? 'View route' : 'Create route')
  );
}

function openPersonForm(company, existing = null) {
  const modal = createDialog(existing ? 'Edit target person' : `Add target to ${company.name}`);
  const form = el('form', { class: 'relationship-form' },
    el('div', { class: 'field-row' }, formField('Name', el('input', { name: 'name', required: 'required', value: existing?.name || '' })), formField('Title', el('input', { name: 'title', value: existing?.title || '' }))),
    el('div', { class: 'field-row' }, formField('Location', el('input', { name: 'location', value: existing?.location || '' })), formField('LinkedIn URL', el('input', { name: 'linkedinUrl', type: 'url', value: existing?.linkedinUrl || '' }))),
    formField('Notes', el('textarea', { name: 'notes', rows: '4' }, existing?.notes || '')),
    el('p', { class: 'form-error', hidden: 'hidden' }),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, existing ? 'Save target' : 'Add target'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const error = form.querySelector('.form-error');
    try {
      if (existing) await api('PATCH', `${PEOPLE_API}/${existing.id}`, values);
      else await api('POST', PEOPLE_API, { ...values, companyId: company.id, companyName: company.name, type: 'target', mutualPersonIds: [] });
      modal.close(); toast(existing ? 'Target updated.' : 'Target added.'); await refreshRelationships();
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  });
  modal.body.appendChild(form);
}

function openMutualForm(target) {
  const modal = createDialog(`Attach mutual contact to ${target.name}`);
  const available = people.filter((person) => ['mutual', 'both'].includes(person.type) && !(target.mutualPersonIds || []).includes(person.id));
  const form = el('form', { class: 'relationship-form' },
    formField('Choose an existing mutual contact', el('select', { name: 'existingId' }, option('', 'Create a new mutual contact', ''), ...available.map((person) => option(person.id, person.name, '')))),
    el('div', { class: 'form-divider' }, el('span', {}, 'Or create a new contact')),
    el('div', { class: 'field-row' }, formField('Name', el('input', { name: 'name', placeholder: 'Full name' })), formField('Title', el('input', { name: 'title', placeholder: 'Role or relationship' }))),
    formField('Location', el('input', { name: 'location', placeholder: 'Location' })),
    el('p', { class: 'form-error', hidden: 'hidden' }),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, 'Attach mutual'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const error = form.querySelector('.form-error');
    try {
      let id = values.existingId;
      if (!id) {
        if (!values.name.trim()) throw new Error('Choose an existing mutual contact or enter a new name.');
        const created = await api('POST', PEOPLE_API, { name: values.name, title: values.title, location: values.location, type: 'mutual' });
        id = created.id;
      }
      await api('PATCH', `${PEOPLE_API}/${target.id}`, { mutualPersonIds: [...(target.mutualPersonIds || []), id] });
      modal.close(); toast('Mutual contact attached.'); await refreshRelationships();
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  });
  modal.body.appendChild(form);
}

async function unlinkMutual(target, mutualId) {
  try {
    await api('PATCH', `${PEOPLE_API}/${target.id}`, { mutualPersonIds: (target.mutualPersonIds || []).filter((id) => id !== mutualId) });
    toast('Mutual contact unlinked.'); await refreshRelationships();
  } catch (err) { toast(err.message); }
}

function renderCompanyRoutes(company) {
  const items = routes.filter((route) => !route.archivedAt && route.companyId === company.id);
  return el('section', { class: 'company-route-tab' },
    el('div', { class: 'section-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, 'Warm introduction paths'), el('h3', {}, `${items.length} routes for ${company.name}`)),
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => openRouteForm(null, { companyId: company.id }) }, '+ New route')),
    items.length ? el('div', { class: 'company-route-list' }, ...items.map(renderRouteCard)) : emptyPanel('No routes for this company', 'Add targets and mutual contacts first, then create a route.')
  );
}

function renderCompanyActivity(company) {
  const companyRouteActivities = routeActivities.filter((activity) => activity.companyId === company.id);
  const legacy = (company.activity || []).map((activity, index) => ({ id: `legacy-${index}`, type: activity.type, summary: `Company ${activity.type} logged`, actor: company.createdBy || 'CRM', timestamp: activity.at }));
  const items = [...companyRouteActivities, ...legacy].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return el('section', { class: 'company-activity-tab' },
    el('div', { class: 'section-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, 'Company and route history'), el('h3', {}, 'Activity'))),
    items.length ? el('ol', { class: 'route-timeline' }, ...items.map((activity) => el('li', {}, el('span', { class: 'activity-dot', 'data-type': activity.type }), el('div', {}, el('strong', {}, activity.summary), el('p', {}, `${activity.actor} · ${new Date(activity.timestamp).toLocaleString()}`)))))
      : emptyPanel('No activity yet', 'Company and route interactions will appear here.')
  );
}

// Primary navigation and initial relationship data.
$$('[data-section]').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.section)));
refreshRelationships({ render: false });
