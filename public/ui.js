/* Shared, zero-dependency UI helpers for Northwind CRM. */

const CRM_ICON_PATHS = {
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  phone: '<path d="M7 4H4v4c0 6.6 5.4 12 12 12h4v-3l-4-2-2 2c-3.4-1.2-5.8-3.6-7-7l2-2-2-4Z"/>',
  message: '<path d="M4 5h16v11H8l-4 4V5Z"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 7"/>',
  meeting: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  win: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  archive: '<path d="M4 7h16v13H4V7Zm-1-3h18v3H3V4Zm6 7h6"/>',
  restore: '<path d="M5 8V4m0 0h4M5 4l4 4a7 7 0 1 1-2 7"/>',
  edit: '<path d="m5 17-1 4 4-1L19 9l-3-3L5 17Zm9-9 3 3"/>',
  users: '<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6m0-5c3 0 5 1.7 5.5 5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
};

function crmIcon(name, label = '') {
  const svg = el('svg', {
    class: 'crm-icon', viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': label ? null : 'true', role: label ? 'img' : null, 'aria-label': label || null,
  });
  svg.innerHTML = CRM_ICON_PATHS[name] || CRM_ICON_PATHS.arrow;
  return svg;
}

function showFormError(form, message) {
  const error = form.querySelector('.form-error');
  if (error) {
    error.textContent = message;
    error.hidden = false;
    error.setAttribute('role', 'alert');
  }
  const invalid = form.querySelector(':invalid');
  (invalid || error)?.focus?.();
}
