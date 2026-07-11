import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  Bell,
  CheckCircle2,
  MessageSquare,
  Phone,
  RotateCcw,
  Send,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  RelationshipThread,
  Card,
  Select,
  Alert,
  Input,
  Textarea,
  Label,
  Field,
  Dialog,
} from '@northwind/ui';
import type { BootstrapData } from '../types';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const route = data.routes.find((item) => item.id === id);
  const [details, setDetails] = useState('');
  const [contactPersonId, setContactPersonId] = useState(route?.mutualPersonId ?? '');
  const [channel, setChannel] = useState<'call' | 'email' | 'linkedin' | 'message' | 'meeting' | 'other'>('call');
  const [interactionOutcome, setInteractionOutcome] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [nextAction, setNextAction] = useState(route?.nextAction ?? '');
  const [followUpDate, setFollowUpDate] = useState(route?.dueDate ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [manualUndo, setManualUndo] = useState<{ activityId: string; expiresAt: number } | null>(null);
  const [undoClock, setUndoClock] = useState(() => Date.now());
  const [pendingConfirmation, setPendingConfirmation] = useState<'mark_won' | 'mark_dead' | 'archive' | 'reset' | null>(
    searchParams.get('outcome') === 'won' ? 'mark_won' : searchParams.get('outcome') === 'dead' ? 'mark_dead' : null,
  );

  const timeline = useMemo(
    () =>
      data.activities
        .filter((activity) => activity.routeId === id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [data.activities, id],
  );

  const timelineUndo = useMemo(() => {
    const latestMutation = timeline.find((activity) => activity.type !== 'note');
    const occurred = latestMutation ? Date.parse(latestMutation.timestamp) : 0;
    if (
      latestMutation &&
      latestMutation.type !== 'undo' &&
      typeof latestMutation.previousState === 'object' &&
      occurred > 0 &&
      undoClock - occurred < 5 * 60_000
    ) {
      return { activityId: latestMutation.id, expiresAt: occurred + 5 * 60_000 };
    }
    return null;
  }, [timeline, undoClock]);
  const undo = manualUndo ?? timelineUndo;

  useEffect(() => {
    if (!undo) return;
    const timeout = window.setTimeout(
      () => {
        setManualUndo(null);
        setUndoClock(Date.now());
      },
      Math.max(0, undo.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [undo]);

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
      const result = await api.request<{ activity: { id: string; timestamp: string } }>(
        `/api/routes/${route!.id}/actions`,
        {
          method: 'POST',
          body: { action, details, nextAction, followUpDate, reason, ...extra },
        },
      );
      setManualUndo({ activityId: result.activity.id, expiresAt: Date.parse(result.activity.timestamp) + 5 * 60_000 });
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The route could not be updated.');
    } finally {
      setBusy('');
    }
  }

  async function performInteraction(action: 'call_mutual' | 'message_mutual') {
    if (!interactionOutcome.trim()) {
      setError('Add the interaction outcome before recording it.');
      return;
    }
    await perform(action, {
      interaction: {
        contactPersonId,
        channel,
        outcome: interactionOutcome.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        notes: details,
        nextAction,
        followUpDate,
      },
    });
  }

  async function undoLast() {
    if (!undo) return;
    setBusy('undo');
    try {
      await api.request(`/api/routes/${route!.id}/actions/${undo.activityId}/undo`, { method: 'POST', body: {} });
      setManualUndo(null);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Undo is no longer available.');
    } finally {
      setBusy('');
    }
  }

  async function archiveRoute() {
    setBusy('archive');
    setError('');
    try {
      await api.request(`/api/routes/${route!.id}/archive`, { method: 'POST', body: { reason } });
      await onRefresh();
      navigate('/routes');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The route could not be archived.');
    } finally {
      setBusy('');
    }
  }

  async function confirmPendingAction() {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (action === 'archive') await archiveRoute();
    else if (action) await perform(action);
  }

  return (
    <section className="route-detail">
      <Link className="back-link" to="/routes">
        <ArrowLeft size={16} className="mr-1.5" /> Routes
      </Link>

      <header className="route-detail__hero mb-6">
        <div>
          <span className="page-eyebrow">Relationship command</span>
          <h1>
            {route.companyName} <span className="text-copper mx-1">→</span> {target?.name}
          </h1>
          <p className="text-sm text-ink-soft/75 mt-1">{target?.title || 'Role not set'}</p>
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
        <Card className="route-command">
          <header className="mb-5">
            <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
              Action bar
            </span>
            <h2 className="m-0 text-xl font-display font-semibold text-ink mt-1">Move the relationship forward</h2>
          </header>

          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}

          {undo && (
            <div
              className="undo-banner mb-4 p-3 bg-sage/10 border border-sage/20 rounded flex items-center justify-between"
              role="status"
            >
              <span className="text-sm font-semibold">Action recorded.</span>
              <Button variant="secondary" className="h-8 py-0" disabled={busy === 'undo'} onClick={undoLast}>
                <RotateCcw size={14} className="mr-1.5" /> Undo
              </Button>
            </div>
          )}

          <div className="action-grid mb-5">
            {actionButtons.map(([action, label, Icon]) => (
              <Button
                variant="secondary"
                key={action}
                disabled={Boolean(busy)}
                onClick={() =>
                  action === 'call_mutual' || action === 'message_mutual' ? performInteraction(action) : perform(action)
                }
              >
                <Icon size={16} className="mr-2 text-copper" />
                {label}
              </Button>
            ))}
          </div>

          <div className="action-context grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <Field>
              <Label htmlFor="interaction-contact">Contact</Label>
              <Select
                id="interaction-contact"
                value={contactPersonId}
                onChange={(event) => setContactPersonId(event.target.value)}
              >
                <option value={route.mutualPersonId}>{mutual?.name || 'Mutual contact'}</option>
                <option value={route.targetPersonId}>{target?.name || 'Target contact'}</option>
              </Select>
            </Field>
            <Field>
              <Label htmlFor="interaction-channel">Channel</Label>
              <Select
                id="interaction-channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value as typeof channel)}
              >
                {['call', 'email', 'linkedin', 'message', 'meeting', 'other'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label htmlFor="occurredAt">Occurred</Label>
              <Input
                id="occurredAt"
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </Field>
            <Field>
              <Label htmlFor="interactionOutcome">Interaction outcome</Label>
              <Input
                id="interactionOutcome"
                value={interactionOutcome}
                onChange={(event) => setInteractionOutcome(event.target.value)}
                placeholder="Connected, left voicemail, replied…"
              />
            </Field>
            <Field className="md:col-span-2">
              <Label htmlFor="details">Outcome or notes</Label>
              <Textarea
                id="details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={4}
                placeholder="What happened?"
              />
            </Field>

            <Field>
              <Label htmlFor="nextAction">Next action</Label>
              <Input id="nextAction" value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
            </Field>

            <Field>
              <Label htmlFor="followUpDate">Follow-up date</Label>
              <Input
                id="followUpDate"
                type="date"
                value={followUpDate}
                onChange={(event) => setFollowUpDate(event.target.value)}
              />
            </Field>

            <Field>
              <Label htmlFor="stage">Stage</Label>
              <Select
                id="stage"
                value={route.stage}
                onChange={(event) => perform('move_stage', { stage: event.target.value })}
              >
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
              </Select>
            </Field>

            <Field>
              <Label htmlFor="reason">Won/dead reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required for terminal outcomes"
              />
            </Field>
          </div>

          <div className="terminal-actions border-t border-line/60 pt-4 flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setPendingConfirmation('mark_won')}
              disabled={!reason || Boolean(busy)}
            >
              <Trophy size={16} className="mr-2 text-burgundy" /> Mark won
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPendingConfirmation('mark_dead')}
              disabled={!reason || Boolean(busy)}
              className="text-danger hover:bg-danger/5"
            >
              <XCircle size={16} className="mr-2" /> Mark dead
            </Button>
            <Button
              variant="ghost"
              className="text-ink-soft"
              onClick={() => {
                if (!reason) {
                  setError('Enter a reason before archiving.');
                  return;
                }
                setPendingConfirmation('archive');
              }}
              disabled={Boolean(busy)}
            >
              <Archive size={16} className="mr-2" /> Archive
            </Button>
            <Button variant="ghost" onClick={() => setPendingConfirmation('reset')} disabled={Boolean(busy)}>
              <RotateCcw size={16} className="mr-2" /> Reset workflow
            </Button>
          </div>
        </Card>

        <Card className="route-summary self-start">
          <header className="mb-4">
            <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
              Route state
            </span>
          </header>
          <div className="flex flex-col gap-3">
            {[
              ['Owner', route.owner],
              ['Confidence', route.confidence],
              ['Due date', route.dueDate || 'No date'],
              ['Next action', route.nextAction || 'Not set'],
              ['Outcome', route.outcome],
              [
                'Reminder',
                route.reminderSnoozedUntil
                  ? `Snoozed until ${new Date(route.reminderSnoozedUntil).toLocaleString()}`
                  : 'Active',
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between items-center py-1.5 border-b border-line/40 last:border-0"
              >
                <span className="text-xs font-semibold text-ink-soft/70">{label}</span>
                <strong className="text-sm font-semibold text-ink">{value}</strong>
              </div>
            ))}
            {route.reminderSnoozedUntil ? (
              <Button variant="secondary" disabled={Boolean(busy)} onClick={() => perform('clear_reminder_snooze')}>
                <Bell size={15} className="mr-2" /> Clear shared snooze
              </Button>
            ) : null}
          </div>
        </Card>

        <Card className="route-timeline md:col-span-2">
          <header className="mb-5">
            <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
              Audit trail
            </span>
            <h2 className="m-0 text-xl font-display font-semibold text-ink mt-1">Relationship timeline</h2>
          </header>
          {timeline.length ? (
            <div className="timeline flex flex-col gap-4">
              {timeline.map((activity) => (
                <article
                  key={activity.id}
                  className="relative pl-6 pb-4 border-l border-line/60 last:border-0 last:pb-0"
                >
                  <span className="timeline-dot absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-copper border-2 border-paper" />
                  <div>
                    <strong className="text-sm font-semibold text-ink">{activity.summary}</strong>
                    <p className="text-xs text-ink-soft/75 mt-1">{activity.details || activity.reason}</p>
                    <small className="block text-[10px] text-ink-soft/50 mt-1">
                      {activity.actor} · {new Date(activity.timestamp).toLocaleString()}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="column-empty text-center text-ink-soft/40 py-8">No activity recorded yet.</div>
          )}
        </Card>
      </div>

      <Dialog
        open={Boolean(pendingConfirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingConfirmation(null);
        }}
        title={
          pendingConfirmation === 'mark_won'
            ? 'Confirm won outcome'
            : pendingConfirmation === 'mark_dead'
              ? 'Confirm dead outcome'
              : pendingConfirmation === 'reset'
                ? 'Reset workflow state'
                : 'Confirm route archive'
        }
        description="This change is recorded in the audit trail. Check the reason before continuing."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingConfirmation(null)} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button
              variant={pendingConfirmation === 'mark_dead' ? 'danger' : 'primary'}
              onClick={confirmPendingAction}
              disabled={
                Boolean(busy) || (['mark_won', 'mark_dead'].includes(String(pendingConfirmation)) && !reason.trim())
              }
            >
              {pendingConfirmation === 'mark_won'
                ? 'Confirm won'
                : pendingConfirmation === 'mark_dead'
                  ? 'Confirm dead'
                  : pendingConfirmation === 'reset'
                    ? 'Reset route'
                    : 'Confirm archive'}
            </Button>
          </>
        }
      >
        <div className="record-safety">
          <h3>Recorded reason</h3>
          {pendingConfirmation === 'reset' ? (
            <p>Owner, confidence and scheduling return to the initial state. Research and history remain.</p>
          ) : (
            <>
              <Label htmlFor="confirmation-reason">Reason</Label>
              <Input
                id="confirmation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required for won or dead outcomes"
              />
            </>
          )}
        </div>
      </Dialog>
    </section>
  );
}
