import { useState } from 'react';
import { Archive, ArrowLeft, Edit3, ExternalLink, Mail, MessageSquare, Phone } from 'lucide-react';
import { Badge, Button, Dialog, RelationshipThread } from '@northwind/ui';
import type { Activity, Company, Person, Route } from '@northwind/domain';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

function CompanyDialog({
  company,
  onClose,
  onRefresh,
}: {
  company: Company;
  onClose(): void;
  onRefresh: (() => Promise<unknown>) | undefined;
}) {
  const [name, setName] = useState(company.name);
  const [sector, setSector] = useState(company.sector || company.industry);
  const [country, setCountry] = useState(company.country);
  const [status, setStatus] = useState(company.status);
  const [contactName, setContactName] = useState(company.contactName);
  const [email, setEmail] = useState(company.email);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function run(label: string, task: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await task();
      await onRefresh?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The company could not be updated.');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={`Edit ${company.name}`}
      description="Keep account details current or archive the account and its active relationship work safely."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || Boolean(busy)}
            onClick={() =>
              run('save', () =>
                api.request(`/api/companies/${company.id}`, {
                  method: 'PATCH',
                  headers: { 'If-Match': String(company.version) },
                  body: { name, sector, country, status, contactName, email },
                }),
              )
            }
          >
            {busy === 'save' ? 'Saving…' : 'Save company'}
          </Button>
        </>
      }
    >
      <div className="entity-form">
        {error ? (
          <div className="form-alert field--wide" role="alert">
            {error}
          </div>
        ) : null}
        <label className="field field--wide">
          Company name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as Company['status'])}>
            {['New', 'Contacted', 'Awaiting reply', 'Won', 'Lost'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Country
          <input value={country} onChange={(event) => setCountry(event.target.value)} />
        </label>
        <label className="field field--wide">
          Sector
          <input value={sector} onChange={(event) => setSector(event.target.value)} />
        </label>
        <label className="field">
          Primary contact
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
        </label>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <section className="record-safety field--wide">
          <h3>Archive account</h3>
          <p>Active people and routes are archived together and can be restored from the recovery desk.</p>
          <div className="merge-row">
            <input
              aria-label="Archive reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required archive reason"
            />
            <Button
              variant="ghost"
              disabled={!reason || Boolean(busy)}
              onClick={() =>
                run('archive', () =>
                  api.request(`/api/companies/${company.id}/archive`, { method: 'POST', body: { reason } }),
                )
              }
            >
              <Archive size={15} /> Archive company
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}

export function CompanyDetailPage({
  companies,
  people,
  routes,
  activities,
  onRefresh,
}: {
  companies: Company[];
  people: Person[];
  routes: Route[];
  activities: Activity[];
  onRefresh?: () => Promise<unknown>;
}) {
  const { id } = useParams();
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const company = companies.find((item) => item.id === id);
  if (!company)
    return (
      <div className="empty-state">
        <h2>Company not found</h2>
        <Link to="/companies">Return to companies</Link>
      </div>
    );
  const companyPeople = people.filter((person) => person.companyId === company.id && !person.archivedAt);
  const companyRoutes = routes.filter((route) => route.companyId === company.id && !route.archivedAt);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  async function recordNote() {
    if (!note.trim()) return;
    setNoteBusy(true);
    setNoteError('');
    try {
      await api.request('/api/activities', {
        method: 'POST',
        body: { companyId: company!.id, type: 'note', summary: note.trim() },
      });
      setNote('');
      await onRefresh?.();
    } catch (caught) {
      setNoteError(caught instanceof ApiError ? caught.message : 'The note could not be recorded.');
    } finally {
      setNoteBusy(false);
    }
  }
  return (
    <section className="company-detail">
      <Link to="/companies" className="back-link">
        <ArrowLeft size={16} /> Companies
      </Link>
      <header className="company-hero">
        <div className="company-monogram company-monogram--hero">{company.name.slice(0, 1)}</div>
        <div>
          <span className="page-eyebrow">Account intelligence</span>
          <h1>{company.name}</h1>
          <p>
            {company.sector || company.industry || 'Sector not set'}
            {company.country ? ` · ${company.country}` : ''}
          </p>
        </div>
        <Badge tone={company.status === 'Won' ? 'sage' : 'burgundy'}>{company.status}</Badge>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Edit3 size={15} /> Edit account
        </Button>
      </header>
      <div className="detail-grid">
        <section className="detail-panel detail-panel--wide">
          <header>
            <span className="panel-eyebrow">Relationship paths</span>
            <h2>{companyRoutes.length} active routes</h2>
          </header>
          <div className="detail-routes">
            {companyRoutes.length ? (
              companyRoutes.map((route) => {
                const target = peopleById.get(route.targetPersonId);
                const mutual = peopleById.get(route.mutualPersonId);
                return (
                  <Link to={`/routes/${route.id}`} key={route.id}>
                    <RelationshipThread
                      target={target?.name || 'Target'}
                      mutual={mutual?.name || 'Mutual'}
                      owner={route.owner}
                      stage={route.stage}
                    />
                    <footer>
                      <strong>{route.nextAction || 'Next action not set'}</strong>
                      <span>{route.dueDate || 'No due date'}</span>
                    </footer>
                  </Link>
                );
              })
            ) : (
              <div className="column-empty">No active routes for this company.</div>
            )}
          </div>
        </section>
        <aside className="detail-panel">
          <span className="panel-eyebrow">Primary contact</span>
          <h2>{company.contactName || 'Not set'}</h2>
          {company.email ? (
            <a href={`mailto:${company.email}`}>
              <Mail size={16} />
              {company.email}
            </a>
          ) : null}
          {company.phone ? (
            <a href={`tel:${company.phone}`}>
              <Phone size={16} />
              {company.phone}
            </a>
          ) : null}
        </aside>
        <section className="detail-panel">
          <span className="panel-eyebrow">People</span>
          <div className="compact-people">
            {companyPeople.map((person) => (
              <article key={person.id}>
                <span className="person-avatar">{person.name.slice(0, 1)}</span>
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.title}</small>
                </div>
                <ExternalLink size={14} />
              </article>
            ))}
          </div>
        </section>
        <section className="detail-panel detail-panel--wide">
          <span className="panel-eyebrow">Recent activity</span>
          <div className="note-composer">
            {noteError ? <span role="alert">{noteError}</span> : null}
            <label>
              <MessageSquare size={16} />
              <span className="sr-only">Add company note</span>
              <input
                aria-label="Add company note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Record a useful account note…"
              />
            </label>
            <Button variant="secondary" disabled={!note.trim() || noteBusy} onClick={recordNote}>
              {noteBusy ? 'Recording…' : 'Record note'}
            </Button>
          </div>
          <div className="timeline">
            {activities
              .filter((activity) => activity.companyId === company.id)
              .slice()
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .slice(0, 8)
              .map((activity) => (
                <article key={activity.id}>
                  <span />
                  <div>
                    <strong>{activity.summary}</strong>
                    <p>
                      {activity.actor} · {new Date(activity.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </div>
      {editOpen ? <CompanyDialog company={company} onClose={() => setEditOpen(false)} onRefresh={onRefresh} /> : null}
    </section>
  );
}
