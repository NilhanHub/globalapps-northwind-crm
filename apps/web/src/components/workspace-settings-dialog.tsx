import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, UserX } from 'lucide-react';
import { Alert, Button, Dialog, IconButton, Input, Select } from '@northwind/ui';
import { ApiError } from '@northwind/api-client';
import type { OwnerProfile } from '@northwind/domain';
import { api } from '../api';
import { queryClient } from '../query-client';
import { queryKeys, useOwnersQuery } from '../queries';

function OwnerRow({ owner, owners }: { owner: OwnerProfile; owners: OwnerProfile[] }) {
  const [name, setName] = useState(owner.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replacementOwnerId, setReplacementOwnerId] = useState('owner-unassigned');
  const update = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await api.request(`/api/owners/${owner.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': String(owner.version) },
        body: patch,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Owner could not be updated.');
    } finally {
      setBusy(false);
    }
  };
  const active = owners.filter((candidate) => candidate.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const position = active.findIndex((candidate) => candidate.id === owner.id);
  return (
    <div className="owner-setting-row">
      <div>
        <Input
          aria-label={`Owner name for ${owner.displayName}`}
          value={name}
          disabled={busy || owner.id === 'owner-unassigned'}
          onChange={(event) => setName(event.target.value)}
        />
        <small>
          {owner.system ? 'Protected workspace option' : owner.active ? 'Available for assignment' : 'Inactive'}
        </small>
        {error ? (
          <span className="field-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <div className="owner-setting-actions">
        <IconButton
          aria-label={`Move ${owner.displayName} up`}
          disabled={busy || position <= 0}
          onClick={() => update({ sortOrder: Math.max(0, owner.sortOrder - 1) })}
        >
          <ArrowUp size={15} />
        </IconButton>
        <IconButton
          aria-label={`Move ${owner.displayName} down`}
          disabled={busy || position < 0 || position === active.length - 1}
          onClick={() => update({ sortOrder: owner.sortOrder + 1 })}
        >
          <ArrowDown size={15} />
        </IconButton>
        <Button
          variant="secondary"
          disabled={busy || !name.trim() || name.trim() === owner.displayName || owner.id === 'owner-unassigned'}
          onClick={() => update({ displayName: name.trim() })}
        >
          Save
        </Button>
        {!owner.system && owner.active ? (
          <Select
            aria-label={`Replacement owner for ${owner.displayName}`}
            value={replacementOwnerId}
            disabled={busy}
            onChange={(event) => setReplacementOwnerId(event.target.value)}
          >
            {active
              .filter((candidate) => candidate.id !== owner.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  Reassign to {candidate.displayName}
                </option>
              ))}
          </Select>
        ) : null}
        <IconButton
          variant="ghost"
          aria-label={`Deactivate ${owner.displayName}`}
          disabled={busy || owner.system || !owner.active}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api.request(`/api/owners/${owner.id}/deactivate`, {
                method: 'POST',
                body: { version: owner.version, replacementOwnerId },
              });
              await queryClient.invalidateQueries({ queryKey: queryKeys.all });
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : 'Owner could not be deactivated.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <UserX size={15} />
        </IconButton>
      </div>
    </div>
  );
}

export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const owners = useOwnersQuery(open);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const records = owners.data ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workspace settings"
      description="Manage route-owner labels for the shared CRM workspace."
    >
      <div className="settings-intro">
        <strong>Europe/London timezone</strong>
        <p>Due dates and shared reminders use UK time. Owner profiles are workflow labels, not login accounts.</p>
      </div>
      {owners.isError ? (
        <Alert variant="danger" title="Owners could not load">
          Try closing and reopening settings.
        </Alert>
      ) : null}
      <div className="owner-settings-list" role="list" aria-label="Route owners">
        {records.map((owner) => (
          <OwnerRow key={`${owner.id}:${owner.version}`} owner={owner} owners={records} />
        ))}
      </div>
      <div className="owner-create-row">
        <Input
          aria-label="New owner name"
          placeholder="Add an owner label"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api.request('/api/owners', { method: 'POST', body: { displayName: name.trim() } });
              setName('');
              await queryClient.invalidateQueries({ queryKey: queryKeys.all });
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : 'Owner could not be added.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={15} /> Add owner
        </Button>
      </div>
      {error ? (
        <Alert variant="danger" title="Owner not saved">
          {error}
        </Alert>
      ) : null}
    </Dialog>
  );
}
