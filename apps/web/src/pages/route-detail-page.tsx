import { useMemo, useState } from 'react';
import { ArrowLeft, Archive, CheckCircle2, MessageSquare, Phone, RotateCcw, Send, Trophy, XCircle } from 'lucide-react';
import { Badge, Button, RelationshipThread } from '@northwind/ui';
import type { BootstrapData } from '../types';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

const actionButtons = [
  ['call_mutual', 'Log call', Phone],
  ['message_mutual', 'Log message', MessageSquare],
  ['intro_requested', 'Intro requested', Send],
  ['intro_agreed', 'Intro agreed', CheckCircle2],
  ['target_contacted', 'Target contacted', Send],
  ['meeting_reply', 'Meeting / reply', CheckCircle2],
] as const;

export function RouteDetailPage({ data, onRefresh }: { data: BootstrapData; onRefresh(): Promise<unknown> }) {
  const { id } = useParams();
  const route = data.routes.find((item) => item.id === id);
  const [details, setDetails] = useState('');
  const [nextAction, setNextAction] = useState(route?.nextAction ?? '');
  const [followUpDate, setFollowUpDate] = useState(route?.dueDate ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<{ activityId: string } | null>(null);
  const timeline = useMemo(
    () =>
      data.activities
        .filter((activity) => activity.routeId === id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [data.activities, id],
  );
  if (!route)
    return (
      <div className="empty-state">
        <h2>Route not found</h2>
        <Link to="/routes">Return to routes</Link>
      </div>
    );
  const target = data.people.find((person) => person.id === route.targetPersonId);
  const mutual = data.people.find((person) => person.id === route.mutualPersonId);
  async function perform(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError('');
    try {
      const result = await api.request<{ activity: { id: string } }>(`/api/routes/${route!.id}/actions`, {
        method: 'POST',
        body: { action, details, nextAction, followUpDate, reason, ...extra },
      });
      setUndo({ activityId: result.activity.id });
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The route could not be updated.');
    } finally {
      setBusy('');
    }
  }
  async function undoLast() {
    if (!undo) return;
    setBusy('undo');
    try {
      await api.request(`/api/routes/${route!.id}/actions/${undo.activityId}/undo`, { method: 'POST', body: {} });
      setUndo(null);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Undo is no longer available.');
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="route-detail">
      <Link className="back-link" to="/routes">
        <ArrowLeft size={16} /> Routes
      </Link>
      <header className="route-detail__hero">
        <div>
          <span className="page-eyebrow">Relationship command</span>
          <h1>
            {route.companyName} <span>→</span> {target?.name}
          </h1>
          <p>{target?.title || 'Role not set'}</p>
        </div>
        <Badge tone={route.outcome === 'won' ? 'sage' : route.outcome === 'dead' ? 'neutral' : 'burgundy'}>
          {route.stage}
        </Badge>
        <RelationshipThread
          target={target?.name || 'Target'}
          mutual={mutual?.name || 'Mutual'}
          owner={route.owner}
          stage={route.stage}
        />
      </header>
      <div className="route-detail__grid">
        <section className="route-command">
          <header>
            <span className="panel-eyebrow">Action bar</span>
            <h2>Move the relationship forward</h2>
          </header>
          {error ? (
            <div role="alert" className="form-alert">
              {error}
            </div>
          ) : null}
          {undo ? (
            <div className="undo-banner" role="status">
              <span>Action recorded.</span>
              <Button variant="secondary" disabled={busy === 'undo'} onClick={undoLast}>
                <RotateCcw size={15} /> Undo
              </Button>
            </div>
          ) : null}
          <div className="action-grid">
            {actionButtons.map(([action, label, Icon]) => (
              <Button variant="secondary" key={action} disabled={Boolean(busy)} onClick={() => perform(action)}>
                <Icon size={16} />
                {label}
              </Button>
            ))}
          </div>
          <div className="action-context">
            <label className="field field--wide">
              Outcome or notes
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={4}
                placeholder="What happened?"
              />
            </label>
            <label className="field">
              Next action
              <input value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
            </label>
            <label className="field">
              Follow-up date
              <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
            </label>
            <label className="field">
              Stage
              <select value={route.stage} onChange={(event) => perform('move_stage', { stage: event.target.value })}>
                {[
                  'Found route',
                  'Mutual friend to contact',
                  'Intro requested',
                  'Intro agreed',
                  'Target contacted',
                  'Meeting / reply',
                ].map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Won/dead reason
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required for terminal outcomes"
              />
            </label>
          </div>
          <div className="terminal-actions">
            <Button variant="secondary" onClick={() => perform('mark_won')} disabled={!reason || Boolean(busy)}>
              <Trophy size={16} /> Mark won
            </Button>
            <Button variant="ghost" onClick={() => perform('mark_dead')} disabled={!reason || Boolean(busy)}>
              <XCircle size={16} /> Mark dead
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!reason) {
                  setError('Enter a reason before archiving.');
                  return;
                }
                await api.request(`/api/routes/${route.id}/archive`, { method: 'POST', body: { reason } });
                await onRefresh();
              }}
            >
              <Archive size={16} /> Archive
            </Button>
          </div>
        </section>
        <aside className="route-summary">
          <span className="panel-eyebrow">Route state</span>
          {[
            ['Owner', route.owner],
            ['Confidence', route.confidence],
            ['Due date', route.dueDate || 'No date'],
            ['Next action', route.nextAction || 'Not set'],
            ['Outcome', route.outcome],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </aside>
        <section className="route-timeline">
          <header>
            <span className="panel-eyebrow">Audit trail</span>
            <h2>Relationship timeline</h2>
          </header>
          {timeline.length ? (
            timeline.map((activity) => (
              <article key={activity.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{activity.summary}</strong>
                  <p>{activity.details || activity.reason}</p>
                  <small>
                    {activity.actor} · {new Date(activity.timestamp).toLocaleString()}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <div className="column-empty">No activity recorded yet.</div>
          )}
        </section>
      </div>
    </section>
  );
}
