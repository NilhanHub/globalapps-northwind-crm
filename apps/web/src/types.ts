import type { Activity, Company, Person, Route } from '@northwind/domain';

export type BootstrapData = {
  companies: Company[];
  people: Person[];
  routes: Route[];
  activities: Activity[];
  workspaceRevision?: { revision: string; updatedAt: string };
};
export type Session = { authenticated: true; actor: string; expiresAt: string; csrfToken: string };
export type LogoutReason = 'idle_timeout' | 'logged_out' | 'invalid_session' | null;
