import { useState } from 'react';
import { Archive, ArrowLeft, Edit3, ExternalLink, Mail, MessageSquare, Phone } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Badge,
  Button,
  Dialog,
  RelationshipThread,
  Card,
  Select,
  Alert,
  Input,
  Label,
  Field,
  FieldError,
} from '@northwind/ui';
import type { Activity, Company, Person, Route } from '@northwind/domain';
import { Link, useParams } from '../lib/router';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

const companySchema = z.object({
  name: z.string().min(1, { message: 'Company name is required' }),
  sector: z.string(),
  country: z.string(),
  status: z.string(),
  contactName: z.string(),
  email: z.string().email({ message: 'Invalid email address' }).or(z.literal('')),
});

type CompanySchema = z.infer<typeof companySchema>;

type CompanyIntel = {
  specificEvidence: string;
  commercialOpening: string;
  whyItMatters: string;
  intelligenceReading: string;
  opportunityStatus: string;
  signalTier: string;
  signalType: string;
  remainingUncertainty: string[];
  doNotClaim: string[];
  sourceName: string;
  evidenceUrl: string;
  fetchedAt: string;
  verifiedLive: boolean;
  report?: {
    round?: number;
    title?: string;
    pdfFilename?: string;
  };
};

function textField(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'string' ? record[key].trim() : '';
}

function textList(record: Record<string, unknown>, key: string) {
  if (!Array.isArray(record[key])) return [];
  return [
    ...new Set(record[key].filter((item): item is string => typeof item === 'string').map((item) => item.trim())),
  ].filter(Boolean);
}

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function readCompanyIntel(company: Company): CompanyIntel | null {
  const raw = company.intel;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const specificEvidence =
    textField(record, 'specificEvidence') || textField(record, 'signal') || textField(record, 'evidenceExcerpt');
  const commercialOpening = textField(record, 'commercialOpening');
  if (!specificEvidence && !commercialOpening) return null;

  const rawReport = record.report;
  const report =
    rawReport && typeof rawReport === 'object' && !Array.isArray(rawReport)
      ? (rawReport as Record<string, unknown>)
      : null;

  return {
    specificEvidence,
    commercialOpening,
    whyItMatters: textField(record, 'whyItMatters'),
    intelligenceReading: textField(record, 'intelligenceReading'),
    opportunityStatus: textField(record, 'opportunityStatus'),
    signalTier: textField(record, 'signalTier'),
    signalType: textField(record, 'signalType'),
    remainingUncertainty: textList(record, 'remainingUncertainty'),
    doNotClaim: textList(record, 'doNotClaim'),
    sourceName: textField(record, 'sourceName'),
    evidenceUrl: safeHttpUrl(textField(record, 'evidenceUrl')),
    fetchedAt: textField(record, 'fetchedAt'),
    verifiedLive: record.verifiedLive === true,
    ...(report
      ? {
          report: {
            ...(typeof report.round === 'number' ? { round: report.round } : {}),
            ...(typeof report.title === 'string' && report.title.trim() ? { title: report.title.trim() } : {}),
            ...(typeof report.pdfFilename === 'string' && report.pdfFilename.trim()
              ? { pdfFilename: report.pdfFilename.trim() }
              : {}),
          },
        }
      : {}),
  };
}

function humanize(value: string, fallback: string) {
  const normalized = value.replaceAll('_', ' ').replaceAll('-', ' ').trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : fallback;
}

function opportunityTone(status: string): 'neutral' | 'burgundy' | 'copper' | 'sage' {
  if (status === 'actionable_hypothesis') return 'sage';
  if (status === 'identity_unresolved' || status === 'watchlist') return 'copper';
  if (status === 'partner_capacity' || status === 'partner_channel') return 'burgundy';
  return 'neutral';
}

function reportLabel(intel: CompanyIntel) {
  const parts = [intel.report?.round ? `Round ${intel.report.round}` : '', intel.report?.title || ''].filter(Boolean);
  return parts.join(' · ');
}

function CompanyDialog({
  company,
  onClose,
  onRefresh,
}: {
  company: Company;
  onClose(): void;
  onRefresh: (() => Promise<unknown>) | undefined;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanySchema>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: company.name,
      sector: company.sector || company.industry || '',
      country: company.country || '',
      status: company.status || 'New',
      contactName: company.contactName || '',
      email: company.email || '',
    },
  });

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

  const handleSave = (values: CompanySchema) => {
    run('save', () =>
      api.request(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': String(company.version) },
        body: {
          name: values.name,
          sector: values.sector,
          country: values.country,
          status: values.status,
          contactName: values.contactName,
          email: values.email,
        },
      }),
    );
  };

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
          <Button disabled={Boolean(busy)} onClick={handleSubmit(handleSave)}>
            {busy === 'save' ? 'Saving…' : 'Save company'}
          </Button>
        </>
      }
    >
      <div className="entity-form flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        <Field>
          <Label htmlFor="name">Company name</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="status">Status</Label>
            <Select id="status" {...register('status')}>
              {['New', 'Contacted', 'Awaiting reply', 'Won', 'Lost'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label htmlFor="country">Country</Label>
            <Input id="country" {...register('country')} />
          </Field>
        </div>

        <Field>
          <Label htmlFor="sector">Sector</Label>
          <Input id="sector" {...register('sector')} />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="contactName">Primary contact</Label>
            <Input id="contactName" {...register('contactName')} />
          </Field>

          <Field>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </Field>
        </div>

        <section className="record-safety border border-line rounded p-4 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-danger m-0">Archive account</h3>
          <p className="text-xs text-ink-soft/60">
            Active people and routes are archived together and can be restored from the recovery desk.
          </p>
          <div className="flex items-center gap-3">
            <Input
              aria-label="Archive reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required archive reason"
              className="flex-1"
            />
            <Button
              variant="ghost"
              disabled={!reason || Boolean(busy)}
              onClick={() =>
                run('archive', () =>
                  api.request(`/api/companies/${company.id}/archive`, { method: 'POST', body: { reason } }),
                )
              }
              className="text-danger hover:bg-danger/5 flex items-center gap-1.5"
            >
              <Archive size={15} /> Archive
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
  const intel = readCompanyIntel(company);

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
        <ArrowLeft size={16} className="mr-1.5" /> Companies
      </Link>

      <header className="company-hero mb-6">
        <div className="company-monogram company-monogram--hero">{company.name.slice(0, 1)}</div>
        <div className="company-hero__identity">
          <span className="page-eyebrow">Account intelligence</span>
          <h1>{company.name}</h1>
          <p>
            {company.sector || company.industry || 'Sector not set'}
            {company.country ? ` · ${company.country}` : ''}
          </p>
        </div>
        <div className="company-hero__status">
          <Badge tone={company.status === 'Won' ? 'sage' : 'burgundy'}>{company.status}</Badge>
        </div>
        <Button className="company-hero__action" variant="secondary" onClick={() => setEditOpen(true)}>
          <Edit3 size={15} className="mr-1.5" /> Edit account
        </Button>
      </header>

      <div className="detail-grid">
        {intel ? (
          <Card
            className="detail-panel detail-panel--wide intelligence-panel"
            aria-labelledby="opportunity-intelligence-title"
          >
            <header className="intelligence-panel__header">
              <div>
                <span className="panel-eyebrow">Evidence-backed account brief</span>
                <h2 id="opportunity-intelligence-title">Opportunity intelligence</h2>
                <p>What the public evidence says, where 1BT can help, and what still needs confirmation.</p>
              </div>
              <div className="intelligence-panel__status">
                <Badge tone={opportunityTone(intel.opportunityStatus)}>
                  {humanize(intel.opportunityStatus, 'Opportunity')}
                </Badge>
                {intel.signalTier ? <span>{intel.signalTier} signal</span> : null}
              </div>
            </header>

            {intel.specificEvidence ? (
              <section className="intelligence-panel__evidence" aria-labelledby="observed-signal-title">
                <h3 id="observed-signal-title">Observed signal</h3>
                <p>{intel.specificEvidence}</p>
              </section>
            ) : null}

            <div className="intelligence-panel__grid">
              {intel.commercialOpening ? (
                <section>
                  <h3>Practical opening</h3>
                  <p>{intel.commercialOpening}</p>
                </section>
              ) : null}
              {intel.whyItMatters ? (
                <section>
                  <h3>Why it matters</h3>
                  <p>{intel.whyItMatters}</p>
                </section>
              ) : null}
              {intel.intelligenceReading ? (
                <section>
                  <h3>How to position it</h3>
                  <p>{intel.intelligenceReading}</p>
                </section>
              ) : null}
              {intel.signalType ? (
                <section>
                  <h3>Signal type</h3>
                  <p>{humanize(intel.signalType, 'Public D365 signal')}</p>
                </section>
              ) : null}
            </div>

            {intel.remainingUncertainty.length || intel.doNotClaim.length ? (
              <aside className="intelligence-panel__guardrails" aria-label="Qualification guardrails">
                {intel.remainingUncertainty.length ? (
                  <div>
                    <h3>Confirm before outreach</h3>
                    <ul>
                      {intel.remainingUncertainty.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {intel.doNotClaim.length ? (
                  <div>
                    <h3>Do not overstate</h3>
                    <ul>
                      {intel.doNotClaim.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </aside>
            ) : null}

            <footer className="intelligence-panel__provenance">
              <div>
                {intel.verifiedLive ? <strong>Verified public evidence</strong> : <strong>Public evidence</strong>}
                {reportLabel(intel) ? <span>{reportLabel(intel)}</span> : null}
              </div>
              {intel.evidenceUrl ? (
                <a
                  href={intel.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${intel.sourceName || 'public source'} evidence`}
                >
                  {intel.sourceName || 'Open public source'} <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : null}
            </footer>
          </Card>
        ) : null}

        <Card className="detail-panel detail-panel--wide">
          <header className="mb-4">
            <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
              Relationship paths
            </span>
            <h2 className="m-0 text-lg font-display font-semibold text-ink mt-1">
              {companyRoutes.length} active routes
            </h2>
          </header>
          <div className="detail-routes">
            {companyRoutes.length ? (
              companyRoutes.map((route) => {
                const target = peopleById.get(route.targetPersonId);
                const mutual = peopleById.get(route.mutualPersonId);
                return (
                  <Link
                    to={`/routes/${route.id}`}
                    key={route.id}
                    className="block p-3 rounded hover:bg-porcelain transition-all"
                  >
                    <RelationshipThread
                      target={target?.name || 'Target'}
                      mutual={mutual?.name || 'Mutual'}
                      owner={route.owner}
                      stage={route.stage}
                    />
                    <footer className="flex justify-between items-center text-xs text-ink-soft/60 mt-2">
                      <strong>{route.nextAction || 'Next action not set'}</strong>
                      <span>{route.dueDate || 'No due date'}</span>
                    </footer>
                  </Link>
                );
              })
            ) : (
              <div className="column-empty text-center text-ink-soft/40 py-6">No active routes for this company.</div>
            )}
          </div>
        </Card>

        <Card className="detail-panel">
          <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
            Primary contact
          </span>
          <h2 className="text-lg font-display font-semibold text-ink mt-1">{company.contactName || 'Not set'}</h2>
          <div className="flex flex-col gap-2 mt-4 text-sm text-ink-soft">
            {company.email && (
              <a href={`mailto:${company.email}`} className="flex items-center gap-2 hover:text-burgundy">
                <Mail size={16} />
                {company.email}
              </a>
            )}
            {company.phone && (
              <a href={`tel:${company.phone}`} className="flex items-center gap-2 hover:text-burgundy">
                <Phone size={16} />
                {company.phone}
              </a>
            )}
          </div>
        </Card>

        <Card className="detail-panel">
          <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper font-semibold">
            People
          </span>
          <div className="compact-people mt-3 flex flex-col gap-2">
            {companyPeople.map((person) => (
              <article key={person.id} className="flex items-center justify-between p-2 rounded hover:bg-porcelain">
                <div className="flex items-center gap-2">
                  <span className="person-avatar">{person.name.slice(0, 1)}</span>
                  <div className="flex flex-col">
                    <strong className="text-sm font-semibold">{person.name}</strong>
                    <small className="text-xs text-ink-soft/60">{person.title}</small>
                  </div>
                </div>
                <ExternalLink size={14} className="text-ink-soft/40" />
              </article>
            ))}
          </div>
        </Card>

        <Card className="detail-panel detail-panel--wide">
          <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
            Recent activity
          </span>

          <div className="note-composer flex items-center gap-3 mt-3 mb-6">
            <div className="relative flex-1">
              <MessageSquare size={16} className="absolute left-3 top-3 text-ink-soft/40 pointer-events-none" />
              <Input
                aria-label="Add company note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Record a useful account note…"
                className="pl-9"
              />
            </div>
            <Button variant="secondary" disabled={!note.trim() || noteBusy} onClick={recordNote} className="h-10">
              {noteBusy ? 'Recording…' : 'Record note'}
            </Button>
          </div>

          {noteError && (
            <Alert variant="danger" className="mb-4">
              {noteError}
            </Alert>
          )}

          <div className="timeline flex flex-col gap-4">
            {activities
              .filter((activity) => activity.companyId === company.id)
              .slice()
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .slice(0, 8)
              .map((activity) => (
                <article
                  key={activity.id}
                  className="relative pl-6 pb-4 border-l border-line/60 last:border-0 last:pb-0"
                >
                  <span className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-copper border-2 border-paper" />
                  <div>
                    <strong className="text-sm font-semibold">{activity.summary}</strong>
                    <p className="text-xs text-ink-soft/50 mt-1">
                      {activity.actor} · {new Date(activity.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </article>
              ))}
          </div>
        </Card>
      </div>
      {editOpen ? <CompanyDialog company={company} onClose={() => setEditOpen(false)} onRefresh={onRefresh} /> : null}
    </section>
  );
}
