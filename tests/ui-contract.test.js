const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('application shell exposes a global People workspace and focused UI modules', () => {
  const html = read('public/index.html');
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
  assert.equal(fs.existsSync(path.join(root, 'public/favicon.svg')), true);
  assert.match(html, /data-section="people"/);
  assert.match(html, /id="peopleView"/);
  assert.match(html, /src="ui\.js"/);
  assert.match(html, /src="people\.js"/);
});

test('notifications distinguish polite status from urgent errors', () => {
  const app = read('public/app.js');
  assert.match(app, /aria-live/);
  assert.match(app, /role.*status/);
  assert.match(app, /role.*alert/);
});

test('route workspace includes setup queue, selection, and auditable movement', () => {
  const relationships = read('public/relationships.js');
  assert.match(relationships, /route-setup-banner/);
  assert.match(relationships, /route-select/);
  assert.match(relationships, /\/bulk\/actions/);
  assert.match(relationships, /move_stage/);
  assert.match(relationships, /draggable/);
});

test('People workspace supports archived records, duplicates, merge, and route creation', () => {
  const people = read('public/people.js');
  assert.match(people, /includeArchived=true/);
  assert.match(people, /Possible duplicates/);
  assert.match(people, /\/merge/);
  assert.match(people, /\/archive/);
  assert.match(people, /openRouteForm/);
});

test('mobile route controls provide a compact filter drawer', () => {
  const css = read('public/styles.css');
  assert.match(css, /route-filter-drawer/);
  assert.match(css, /people-card/);
  assert.match(css, /@media \(max-width: 768px\)/);
});
