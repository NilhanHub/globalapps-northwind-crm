import type {
  Activity,
  Company,
  OwnerProfile,
  Person,
  Route,
  RouteReminder,
  WorkspaceSettings,
} from '@northwind/domain';

export type BootstrapData = {
  companies: Company[];
  people: Person[];
  routes: Route[];
  activities: Activity[];
  owners: OwnerProfile[];
  settings: WorkspaceSettings;
  reminderSummary: Record<string, number>;
  workspaceRevision?: { revision: string; updatedAt: string };
};
export type ReminderResponse = { timezone: 'Europe/London'; items: RouteReminder[] };
export type WorkspaceSearchItem = { kind: 'company' | 'person'; id: string; label: string; href: string };
export type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
export type Session = { authenticated: true; actor: string; expiresAt: string; csrfToken: string };
export type LogoutReason = 'idle_timeout' | 'logged_out' | 'invalid_session' | null;
