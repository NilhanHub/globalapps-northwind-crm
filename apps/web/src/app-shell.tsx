import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Bell, Building2, FileUp, Gauge, LogOut, Network, Route, Search, Settings, UsersRound } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Dialog, IconButton } from '@northwind/ui';
import { useAuth } from './auth';
import { ReminderDialog } from './components/reminder-dialog';
import { WorkspaceSettingsDialog } from './components/workspace-settings-dialog';
import { useRemindersQuery, useWorkspaceSearch } from './queries';

const items = [
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/people', label: 'People', icon: UsersRound },
  { to: '/routes', label: 'Routes', icon: Route },
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/process', label: 'Process', icon: Network },
  { to: '/imports', label: 'Imports', icon: FileUp },
];

export function AppShell({ children }: PropsWithChildren) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const reminderButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const reminders = useRemindersQuery(Boolean(auth.session));
  const workspaceSearch = useWorkspaceSearch(query, searchOpen && Boolean(auth.session));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const commands = [...items, { to: '/archived', label: 'Archived records', icon: Network }].filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="app-frame">
      <aside className="app-rail">
        <NavLink to="/companies" className="brand" aria-label="Northwind home">
          <span className="brand-mark">N</span>
          <span className="brand-word">Northwind</span>
        </NavLink>
        <nav className="primary-nav" aria-label="Primary navigation">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
              <Icon aria-hidden size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="rail-pulse" /> Shared workspace
        </div>
      </aside>
      <div className="app-stage">
        <header className="command-bar">
          <div className="command-context">
            <span className="command-eyebrow">Relationship intelligence</span>
            <strong>Northwind desk</strong>
          </div>
          <button className="command-search" type="button" onClick={() => setSearchOpen(true)}>
            <Search size={17} aria-hidden />
            <span>Search the workspace</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="user-chip" aria-label="Signed in user">
            <span>N</span>
            <div>
              <strong>{auth.session?.actor || 'Northwind'}</strong>
              <small>Shared account</small>
            </div>
            <IconButton
              ref={reminderButtonRef}
              variant="ghost"
              aria-label={`${reminders.data?.items.length ?? 0} shared reminders`}
              onClick={() => setReminderOpen(true)}
            >
              <Bell size={15} />
              {(reminders.data?.items.length ?? 0) > 0 ? (
                <span className="reminder-badge">{reminders.data!.items.length}</span>
              ) : null}
            </IconButton>
            <IconButton
              ref={settingsButtonRef}
              variant="ghost"
              aria-label="Workspace settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={15} />
            </IconButton>
            <IconButton variant="ghost" aria-label="Log out" onClick={() => auth.logout()}>
              <LogOut size={15} />
            </IconButton>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {items.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <Icon aria-hidden size={19} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <Dialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Go to workspace"
        description="Search Northwind commands and destinations."
      >
        <label className="command-palette">
          <Search size={17} />
          <input
            autoFocus
            aria-label="Search commands"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Companies, people, routes…"
          />
        </label>
        <div className="command-results">
          {commands.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => {
                navigate(to);
                setSearchOpen(false);
                setQuery('');
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
              <kbd>↵</kbd>
            </button>
          ))}
          {workspaceSearch.data?.items.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => {
                navigate(item.href);
                setSearchOpen(false);
                setQuery('');
              }}
            >
              <Search size={17} />
              <span>
                {item.label}
                <small>{item.kind}</small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
          {query.trim().length >= 2 && workspaceSearch.isPending ? <p role="status">Searching CRM records…</p> : null}
        </div>
      </Dialog>
      <ReminderDialog
        open={reminderOpen}
        onOpenChange={(open) => {
          setReminderOpen(open);
          if (!open) requestAnimationFrame(() => reminderButtonRef.current?.focus());
        }}
      />
      <WorkspaceSettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) requestAnimationFrame(() => settingsButtonRef.current?.focus());
        }}
      />
    </div>
  );
}
