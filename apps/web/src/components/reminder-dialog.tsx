import { useState } from 'react';
import { Bell, CalendarClock, CheckCircle2, Clock3, ExternalLink } from 'lucide-react';
import { Alert, Button, Dialog, Input } from '@northwind/ui';
import { Link } from 'react-router-dom';
import { ApiError } from '@northwind/api-client';
import type { RouteReminder } from '@northwind/domain';
import { api } from '../api';
import { queryClient } from '../query-client';
import { queryKeys, useRemindersQuery } from '../queries';

const labels: Record<string, string> = {
  overdue: 'Overdue',
  due_today: 'Due today',
  awaiting_response: 'Awaiting response',
  stale: 'Stale routes',
  setup_incomplete: 'Setup incomplete',
};

export function ReminderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const reminders = useRemindersQuery(open);
  const [busyId, setBusyId] = useState('');
  const [followUpDates, setFollowUpDates] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const grouped = (reminders.data?.items ?? []).reduce<Record<string, RouteReminder[]>>(
    (result, item) => ({ ...result, [item.category]: [...(result[item.category] ?? []), item] }),
    {},
  );
  const runAction = async (routeId: string, body: Record<string, unknown>, failure: string) => {
    setBusyId(routeId);
    setError('');
    try {
      await api.request(`/api/routes/${routeId}/actions`, { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : failure);
    } finally {
      setBusyId('');
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Shared reminders"
      description="Due work and relationship paths that need attention in Europe/London time."
    >
      <p className="shared-reminder-note">
        <Bell size={15} /> Snoozing a reminder affects everyone using the shared CRM login.
      </p>
      {reminders.isPending ? <p role="status">Loading reminders…</p> : null}
      {reminders.isError ? (
        <Alert variant="danger" title="Reminders could not load">
          Refresh the workspace and try again.
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="danger" title="Reminder not changed">
          {error}
        </Alert>
      ) : null}
      {!reminders.isPending && !reminders.data?.items.length ? (
        <div className="reminder-empty">
          <Bell size={24} />
          <strong>No shared reminders</strong>
          <span>Every active route is currently covered.</span>
        </div>
      ) : null}
      <div className="reminder-groups">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category} className="reminder-group">
            <h3>
              {labels[category] ?? category} <span>{items?.length ?? 0}</span>
            </h3>
            {items?.map((item) => (
              <article key={`${item.routeId}-${item.category}`} className="reminder-item">
                <div>
                  <strong>{item.summary}</strong>
                  <small>
                    <Clock3 size={13} /> {item.occurredAt.slice(0, 10)}
                  </small>
                </div>
                <div className="reminder-actions">
                  <Button
                    variant="secondary"
                    disabled={busyId === item.routeId}
                    onClick={() =>
                      void runAction(
                        item.routeId,
                        { action: 'complete_next_action' },
                        'The next action could not be completed.',
                      )
                    }
                  >
                    <CheckCircle2 size={14} /> Complete action
                  </Button>
                  <div className="reminder-reschedule">
                    <Input
                      type="date"
                      aria-label={`New follow-up date for ${item.summary}`}
                      value={followUpDates[item.routeId] ?? ''}
                      onChange={(event) =>
                        setFollowUpDates((current) => ({ ...current, [item.routeId]: event.target.value }))
                      }
                    />
                    <Button
                      variant="secondary"
                      disabled={busyId === item.routeId || !followUpDates[item.routeId]}
                      onClick={() =>
                        void runAction(
                          item.routeId,
                          { action: 'reschedule_next_action', followUpDate: followUpDates[item.routeId] },
                          'The next action could not be rescheduled.',
                        )
                      }
                    >
                      <CalendarClock size={14} /> Reschedule
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busyId === item.routeId}
                    onClick={() =>
                      void runAction(
                        item.routeId,
                        {
                          action: 'snooze_reminder',
                          until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                          reason: 'Shared reminder snoozed for one day',
                        },
                        'Reminder could not be snoozed.',
                      )
                    }
                  >
                    Snooze 1 day
                  </Button>
                  <Link
                    className="reminder-open-link"
                    to={`/routes/${item.routeId}`}
                    onClick={() => onOpenChange(false)}
                  >
                    Open <ExternalLink size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}
