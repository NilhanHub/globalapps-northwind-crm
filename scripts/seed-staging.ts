import 'dotenv/config';
import { createRouteActivity, prepareCompany, preparePerson, prepareRoute } from '@northwind/domain';
import type { Company, Person, Route } from '@northwind/domain';
import { createMaintenanceRepository } from './lib/maintenance-repository.js';

const STAGING_PROJECT_ID = 'globalapps-northwind-staging';
const APPROVED_OWNER = 'nilhan.dev@gmail.com';
const workspaceId = 'default';
const now = '2026-07-01T09:00:00.000Z';

if (process.env.CRM_REPOSITORY !== 'firestore') throw new Error('Staging seed requires CRM_REPOSITORY=firestore');
if (process.env.FIREBASE_PROJECT_ID !== STAGING_PROJECT_ID)
  throw new Error(`Staging seed can run only against ${STAGING_PROJECT_ID}`);
if (process.env.CRM_CLOUD_OWNER_EMAIL !== APPROVED_OWNER)
  throw new Error(`Staging seed requires the approved owner ${APPROVED_OWNER}`);

const { repository, repositoryType } = createMaintenanceRepository();
if (repositoryType !== 'firestore') throw new Error('Staging seed refused a non-Firestore repository');

const companies: Company[] = [
  prepareCompany(
    { name: 'Atlas Foods Demo', industry: 'Food manufacturing', country: 'United Kingdom', sector: 'Demo' },
    { id: 'staging-company-atlas', now, actor: 'staging-seed' },
  ),
  prepareCompany(
    { name: 'Harborline Services Demo', industry: 'Business services', country: 'Ireland', sector: 'Demo' },
    { id: 'staging-company-harborline', now, actor: 'staging-seed' },
  ),
  prepareCompany(
    { name: 'Juniper Health Demo', industry: 'Healthcare', country: 'United Kingdom', sector: 'Demo' },
    { id: 'staging-company-juniper', now, actor: 'staging-seed' },
  ),
];

const people: Person[] = [];
const addPerson = (input: Record<string, unknown>, id: string) => {
  const person = preparePerson(input, { id, now, companies, people });
  people.push(person);
  return person;
};

const morgan = addPerson(
  { name: 'Morgan Sample', type: 'mutual', title: 'Fictional mutual contact', notes: 'Deterministic staging data' },
  'staging-person-morgan',
);
const riley = addPerson(
  { name: 'Riley Fixture', type: 'mutual', title: 'Fictional mutual contact', notes: 'Deterministic staging data' },
  'staging-person-riley',
);
const avery = addPerson(
  {
    name: 'Avery Example',
    type: 'target',
    title: 'Technology Director',
    companyId: companies[0]!.id,
    mutualPersonIds: [morgan.id, riley.id],
    notes: 'Fictional target for staging checks',
  },
  'staging-person-avery',
);
const jordan = addPerson(
  {
    name: 'Jordan Example',
    type: 'target',
    title: 'Operations Director',
    companyId: companies[1]!.id,
    mutualPersonIds: [morgan.id],
    notes: 'Fictional target for staging checks',
  },
  'staging-person-jordan',
);
const casey = addPerson(
  {
    name: 'Casey Example',
    type: 'target',
    title: 'Digital Lead',
    companyId: companies[2]!.id,
    mutualPersonIds: [riley.id],
    notes: 'Fictional target for staging checks',
  },
  'staging-person-casey',
);

const routes: Route[] = [];
const addRoute = (input: Record<string, unknown>, id: string) => {
  const route = prepareRoute(input, { id, now, companies, people, routes });
  routes.push(route);
  return route;
};

const introRoute = addRoute(
  {
    companyId: companies[0]!.id,
    targetPersonId: avery.id,
    mutualPersonId: morgan.id,
    owner: 'Paul',
    stage: 'Intro requested',
    confidence: 'promising',
    nextAction: 'Follow up on the fictional introduction',
    notes: 'Deterministic staging path',
  },
  'staging-route-atlas-morgan',
);
addRoute(
  {
    companyId: companies[0]!.id,
    targetPersonId: avery.id,
    mutualPersonId: riley.id,
    owner: 'Jeremy',
    stage: 'Found route',
    notes: 'Deterministic staging path',
  },
  'staging-route-atlas-riley',
);
addRoute(
  {
    companyId: companies[1]!.id,
    targetPersonId: jordan.id,
    mutualPersonId: morgan.id,
    owner: 'unassigned',
    stage: 'Found route',
    notes: 'Deterministic staging path',
  },
  'staging-route-harborline-morgan',
);
addRoute(
  {
    companyId: companies[2]!.id,
    targetPersonId: casey.id,
    mutualPersonId: riley.id,
    owner: 'Nilhan',
    stage: 'Mutual friend to contact',
    notes: 'Deterministic staging path',
  },
  'staging-route-juniper-riley',
);

const activities = [
  createRouteActivity({
    id: 'staging-activity-intro-requested',
    route: introRoute,
    actor: 'staging-seed',
    type: 'intro_requested',
    summary: 'Fictional introduction requested',
    now,
    resultingState: { stage: introRoute.stage },
  }),
];

await repository.upsertTransaction({ companies, people, routes, activities });
console.log(
  JSON.stringify({
    projectId: STAGING_PROJECT_ID,
    workspaceId,
    deterministic: true,
    counts: {
      companies: companies.length,
      people: people.length,
      routes: routes.length,
      activities: activities.length,
    },
  }),
);
