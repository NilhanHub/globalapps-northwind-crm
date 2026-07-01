/* Global People and relationship-network workspace. */

let directoryPeople = [];
let directoryRoutes = [];
let peopleSubview = sessionStorage.getItem('crm-people-subview') || 'all';
let peopleSearch = '';
let peopleCompanyFilter = 'all';
let peopleOwnerFilter = 'all';
let peopleRouteFilter = 'all';

async function refreshPeopleWorkspace() {
  const host = $('#peopleView');
  host.replaceChildren(el('div', { class: 'people-loading', role: 'status' }, 'Loading the relationship network…'));
  try {
    [directoryPeople, directoryRoutes] = await Promise.all([
      api('GET', `${PEOPLE_API}?includeArchived=true`),
      api('GET', `${ROUTES_API}?includeArchived=true`),
    ]);
    renderPeopleWorkspace();
  } catch (error) {
    host.replaceChildren(el('section', { class: 'intentional-empty', role: 'alert' },
      crmIcon('users'), el('strong', {}, 'The people network could not be loaded'), el('p', {}, error.message),
      el('button', { class: 'btn btn-primary', onclick: refreshPeopleWorkspace }, 'Try again')));
  }
}

function renderPeopleWorkspace() {
  const host = $('#peopleView');
  const active = directoryPeople.filter((person) => !person.archivedAt);
  const mutuals = active.filter((person) => ['mutual', 'both'].includes(person.type));
  const targets = active.filter((person) => ['target', 'both'].includes(person.type));
  const duplicates = active.filter((person) => person.duplicateCandidateIds?.length);
  host.replaceChildren(
    el('section', { class: 'people-hero' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Relationship network'), el('h2', {}, 'People who can open the right door'),
        el('p', {}, 'Targets, mutual contacts and every warm path between them—managed in one place.')),
      el('div', { class: 'metric-ribbon' }, metricBlock(targets.length, 'targets'), metricBlock(mutuals.length, 'mutual contacts'), metricBlock(duplicates.length, 'possible duplicates'))
    ),
    el('div', { class: 'people-subnav', role: 'tablist', 'aria-label': 'People views' },
      peopleSubviewButton('all', 'All'), peopleSubviewButton('targets', 'Targets'), peopleSubviewButton('mutuals', 'Mutual contacts'),
      peopleSubviewButton('duplicates', 'Possible duplicates'), peopleSubviewButton('archived', 'Archived')
    ),
    el('section', { class: 'people-toolbar', 'aria-label': 'Filter people' },
      el('label', { class: 'route-search' }, el('span', { class: 'sr-only' }, 'Search people'), crmIcon('search'),
        el('input', { id: 'peopleSearch', type: 'search', value: peopleSearch, placeholder: 'Search people, roles, companies…' })),
      el('select', { id: 'peopleCompanyFilter', 'aria-label': 'Filter people by company' }, option('all', 'All companies', peopleCompanyFilter), ...lastCompanies.map((company) => option(company.id, company.name, peopleCompanyFilter))),
      el('select', { id: 'peopleOwnerFilter', 'aria-label': 'Filter people by route owner' }, option('all', 'All route owners', peopleOwnerFilter), ...ROUTE_OWNERS.map((owner) => option(owner, routeOwnerLabel(owner), peopleOwnerFilter))),
      el('select', { id: 'peopleRouteFilter', 'aria-label': 'Filter people by route state' }, option('all', 'Any route state', peopleRouteFilter), option('active', 'Has active route', peopleRouteFilter), option('none', 'No active route', peopleRouteFilter)),
      el('button', { class: 'btn btn-primary', id: 'addPersonBtn' }, '+ Add person')
    ),
    renderPeopleDirectory()
  );
  wirePeopleWorkspace();
}

function peopleSubviewButton(value, label) {
  return el('button', { class: `route-subnav-btn${peopleSubview === value ? ' is-active' : ''}`, role: 'tab', 'aria-selected': peopleSubview === value ? 'true' : 'false', 'data-people-view': value }, label);
}

function filteredDirectoryPeople() {
  return directoryPeople.filter((person) => {
    const personRoutes = directoryRoutes.filter((route) => route.targetPersonId === person.id || route.mutualPersonId === person.id);
    const activeRoutes = personRoutes.filter((route) => !route.archivedAt && ACTIVE_STAGES.includes(route.stage));
    const viewMatches = peopleSubview === 'archived' ? Boolean(person.archivedAt)
      : !person.archivedAt && (peopleSubview === 'all'
        || (peopleSubview === 'targets' && ['target', 'both'].includes(person.type))
        || (peopleSubview === 'mutuals' && ['mutual', 'both'].includes(person.type))
        || (peopleSubview === 'duplicates' && person.duplicateCandidateIds?.length));
    const q = peopleSearch.toLowerCase();
    const searchMatches = !q || [person.name, person.title, person.companyName, person.location, person.notes].some((value) => String(value || '').toLowerCase().includes(q));
    const ownerMatches = peopleOwnerFilter === 'all' || activeRoutes.some((route) => route.owner === peopleOwnerFilter);
    const routeMatches = peopleRouteFilter === 'all' || (peopleRouteFilter === 'active' ? activeRoutes.length > 0 : activeRoutes.length === 0);
    return viewMatches && searchMatches && (peopleCompanyFilter === 'all' || person.companyId === peopleCompanyFilter) && ownerMatches && routeMatches;
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function renderPeopleDirectory() {
  const items = filteredDirectoryPeople();
  if (!items.length) return el('section', { class: 'intentional-empty people-empty' }, crmIcon('users'), el('strong', {}, peopleSubview === 'archived' ? 'No archived people' : 'No people match these filters'), el('p', {}, peopleSubview === 'archived' ? 'Archived records will appear here and can be restored.' : 'Adjust the filters or add a person to the network.'));
  return el('section', { class: 'people-directory', 'aria-label': 'People directory' },
    el('div', { class: 'people-table-wrap' },
      el('table', { class: 'people-table' },
        el('thead', {}, el('tr', {}, ...['Person', 'Type', 'Company', 'Relationships', 'Active routes', 'Last activity', 'Actions'].map((heading) => el('th', {}, heading)))),
        el('tbody', {}, ...items.map(renderPersonRow))
      )
    ),
    el('div', { class: 'people-cards' }, ...items.map(renderPersonCard))
  );
}

function personActionButtons(person) {
  if (person.archivedAt) return [el('button', { class: 'btn btn-ghost btn-sm', onclick: () => restorePerson(person) }, crmIcon('restore'), 'Restore')];
  const actions = [
    el('button', { class: 'icon-text-btn', onclick: () => openPersonEditor(person) }, crmIcon('edit'), 'Edit'),
  ];
  if (['target', 'both'].includes(person.type)) {
    actions.push(el('button', { class: 'icon-text-btn', onclick: () => openPersonLinks(person) }, crmIcon('users'), 'Links'));
    actions.push(el('button', { class: 'icon-text-btn', onclick: () => openRouteForm(null, { companyId: person.companyId, targetPersonId: person.id }) }, crmIcon('arrow'), 'Route'));
  }
  if (person.duplicateCandidateIds?.length) actions.push(el('button', { class: 'icon-text-btn', onclick: () => openMergePerson(person) }, crmIcon('users'), 'Merge'));
  actions.push(el('button', { class: 'icon-text-btn danger-text', onclick: () => openArchivePerson(person) }, crmIcon('archive'), 'Archive'));
  return actions;
}

function renderPersonRow(person) {
  return el('tr', { class: person.archivedAt ? 'is-archived' : '' },
    el('td', {}, el('div', { class: 'person-identity' }, el('span', { class: 'person-avatar' }, person.name.slice(0, 1)), el('div', {}, el('strong', {}, person.name), el('small', {}, person.title || 'Role not set')))),
    el('td', {}, el('span', { class: 'type-chip' }, person.type)),
    el('td', {}, person.companyName || 'Network contact'),
    el('td', {}, String(person.relationshipCount || 0)),
    el('td', {}, String(person.activeRouteCount || 0)),
    el('td', {}, person.lastActivityAt ? timeAgo(person.lastActivityAt) : 'No activity'),
    el('td', {}, el('div', { class: 'person-actions' }, ...personActionButtons(person)))
  );
}

function renderPersonCard(person) {
  return el('article', { class: `people-card${person.archivedAt ? ' is-archived' : ''}` },
    el('header', {}, el('span', { class: 'person-avatar' }, person.name.slice(0, 1)), el('div', {}, el('h3', {}, person.name), el('p', {}, person.title || 'Role not set')), el('span', { class: 'type-chip' }, person.type)),
    el('p', { class: 'people-card-company' }, person.companyName || 'Network contact'),
    el('dl', {}, el('div', {}, el('dt', {}, 'Relationships'), el('dd', {}, String(person.relationshipCount || 0))), el('div', {}, el('dt', {}, 'Active routes'), el('dd', {}, String(person.activeRouteCount || 0))), el('div', {}, el('dt', {}, 'Last activity'), el('dd', {}, person.lastActivityAt ? timeAgo(person.lastActivityAt) : 'None'))),
    el('footer', {}, ...personActionButtons(person))
  );
}

function wirePeopleWorkspace() {
  $$('[data-people-view]').forEach((button) => button.addEventListener('click', () => { peopleSubview = button.dataset.peopleView; sessionStorage.setItem('crm-people-subview', peopleSubview); renderPeopleWorkspace(); }));
  $('#addPersonBtn')?.addEventListener('click', () => openPersonEditor());
  $('#peopleSearch')?.addEventListener('input', (event) => { peopleSearch = event.target.value; renderPeopleWorkspace(); $('#peopleSearch')?.focus(); });
  for (const [id, setter] of [['peopleCompanyFilter', (value) => { peopleCompanyFilter = value; }], ['peopleOwnerFilter', (value) => { peopleOwnerFilter = value; }], ['peopleRouteFilter', (value) => { peopleRouteFilter = value; }]]) {
    $(`#${id}`)?.addEventListener('change', (event) => { setter(event.target.value); renderPeopleWorkspace(); });
  }
}

function openPersonEditor(existing = null) {
  const modal = createDialog(existing ? 'Edit person' : 'Add person');
  const form = el('form', { class: 'relationship-form' },
    el('div', { class: 'field-row' }, formField('Name', el('input', { name: 'name', required: 'required', value: existing?.name || '' })), formField('Type', el('select', { name: 'type' }, ...['target', 'mutual', 'both'].map((type) => option(type, type[0].toUpperCase() + type.slice(1), existing?.type || 'target'))))),
    el('div', { class: 'field-row' }, formField('Title or relationship', el('input', { name: 'title', value: existing?.title || '' })), formField('Company', el('select', { name: 'companyId' }, option('', 'No company', existing?.companyId || ''), ...lastCompanies.map((company) => option(company.id, company.name, existing?.companyId || ''))))),
    el('div', { class: 'field-row' }, formField('Location', el('input', { name: 'location', value: existing?.location || '' })), formField('LinkedIn URL', el('input', { name: 'linkedinUrl', type: 'url', value: existing?.linkedinUrl || '' }))),
    formField('Notes', el('textarea', { name: 'notes', rows: '4' }, existing?.notes || '')),
    el('p', { class: 'form-error', hidden: 'hidden', tabindex: '-1' }),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, existing ? 'Save changes' : 'Add person'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const company = lastCompanies.find((item) => item.id === values.companyId);
    values.companyName = company?.name || '';
    if (['target', 'both'].includes(values.type) && !values.companyId) return showFormError(form, 'Targets must belong to a company.');
    try {
      if (existing) await api('PATCH', `${PEOPLE_API}/${existing.id}`, values);
      else await api('POST', PEOPLE_API, { ...values, mutualPersonIds: [] });
      modal.close(); toast(existing ? 'Person updated.' : 'Person added.'); await refreshRelationships({ render: false }); await refreshPeopleWorkspace();
    } catch (error) { showFormError(form, error.message); }
  });
  modal.body.appendChild(form);
}

function openPersonLinks(target) {
  const modal = createDialog(`Mutual contacts for ${target.name}`);
  const linked = (target.mutualPersonIds || []).map((id) => directoryPeople.find((person) => person.id === id)).filter(Boolean);
  const available = directoryPeople.filter((person) => !person.archivedAt && ['mutual', 'both'].includes(person.type) && !target.mutualPersonIds?.includes(person.id));
  const form = el('form', { class: 'relationship-form compact-form' },
    linked.length ? el('div', { class: 'linked-people-list' }, ...linked.map((person) => el('div', {}, el('span', {}, person.name), el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => { await api('PATCH', `${PEOPLE_API}/${target.id}`, { mutualPersonIds: target.mutualPersonIds.filter((id) => id !== person.id) }); modal.close(); toast('Mutual contact unlinked.'); await refreshRelationships({ render: false }); await refreshPeopleWorkspace(); } }, 'Unlink')))) : el('p', { class: 'empty-inline' }, 'No mutual contacts linked yet.'),
    formField('Attach an existing mutual contact', el('select', { name: 'mutualId', required: 'required' }, option('', 'Choose a mutual contact', ''), ...available.map((person) => option(person.id, person.name, '')))),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Close'), el('button', { class: 'btn btn-primary' }, 'Attach mutual'))
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const mutualId = new FormData(form).get('mutualId');
    try { await api('PATCH', `${PEOPLE_API}/${target.id}`, { mutualPersonIds: [...(target.mutualPersonIds || []), mutualId] }); modal.close(); toast('Mutual contact attached.'); await refreshRelationships({ render: false }); await refreshPeopleWorkspace(); }
    catch (error) { showFormError(form, error.message); }
  });
  modal.body.appendChild(form);
}

function openArchivePerson(person) {
  const modal = createDialog('Archive person');
  const form = el('form', { class: 'relationship-form compact-form' }, el('p', { class: 'confirmation-copy' }, 'Active routes involving this person will be archived with them. Completed history remains intact.'), formField('Reason', el('textarea', { name: 'reason', required: 'required', rows: '3' })), el('p', { class: 'form-error', hidden: 'hidden', tabindex: '-1' }), el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, 'Archive person')));
  form.addEventListener('submit', async (event) => { event.preventDefault(); try { await api('POST', `${PEOPLE_API}/${person.id}/archive`, { actor: 'Manual update', reason: new FormData(form).get('reason') }); modal.close(); toast('Person archived.'); await refreshRelationships({ render: false }); await refreshPeopleWorkspace(); } catch (error) { showFormError(form, error.message); } });
  modal.body.appendChild(form);
}

async function restorePerson(person) {
  try { await api('POST', `${PEOPLE_API}/${person.id}/restore`, { actor: 'Manual update' }); toast('Person restored.'); await refreshRelationships({ render: false }); await refreshPeopleWorkspace(); }
  catch (error) { toast(error.message, { error: true }); }
}

function openMergePerson(person) {
  const candidates = (person.duplicateCandidateIds || []).map((id) => directoryPeople.find((candidate) => candidate.id === id)).filter((candidate) => candidate && !candidate.archivedAt);
  const modal = createDialog('Merge duplicate people');
  const form = el('form', { class: 'relationship-form compact-form' }, el('p', { class: 'confirmation-copy' }, `${person.name} will remain as the survivor. Links and routes from the duplicate will be rewritten safely.`), formField('Duplicate to merge', el('select', { name: 'sourceId', required: 'required' }, option('', 'Choose a duplicate', ''), ...candidates.map((candidate) => option(candidate.id, `${candidate.name} · ${candidate.title || candidate.type}`, '')))), formField('Reason', el('textarea', { name: 'reason', required: 'required', rows: '3', value: 'Confirmed duplicate record' })), el('p', { class: 'form-error', hidden: 'hidden', tabindex: '-1' }), el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: modal.close }, 'Cancel'), el('button', { class: 'btn btn-primary' }, 'Merge records')));
  form.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); try { await api('POST', `${PEOPLE_API}/merge`, { survivorId: person.id, sourceId: values.sourceId, actor: 'Manual update', reason: values.reason }); modal.close(); toast('People merged; links and routes were updated.'); await refreshRelationships({ render: false }); await refreshPeopleWorkspace(); } catch (error) { showFormError(form, error.message); } });
  modal.body.appendChild(form);
}

const initialSection = sessionStorage.getItem('crm-section');
if (['people', 'routes'].includes(initialSection)) setSection(initialSection);
