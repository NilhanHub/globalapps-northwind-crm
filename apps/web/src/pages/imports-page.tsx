import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, Mail, UploadCloud } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, RelationshipThread } from '@northwind/ui';
import { Link } from '../lib/router';
import { ApiError } from '@northwind/api-client';
import { PageHeader } from '../components/page-header';
import { api } from '../api';
import { queryClient } from '../query-client';
import { queryKeys } from '../queries';

type ResearchRow = {
  companyName: string;
  targetName: string;
  mutualName: string;
  targetTitle: string;
  notes: string;
  sourceFilename: string;
  sourceHash: string;
};
type Preview = {
  preview: {
    rows: number;
    creates: { companies: number; people: number; routes: number };
    updates: number;
    unchanged: number;
    aliases: Array<{ supplied: string; existing: string; id: string }>;
    conflicts: unknown[];
  };
  rows: ResearchRow[];
  omissions: Array<{ filename: string; reason: string }>;
};
type ImportResult = {
  id: string;
  status: string;
  summary: Record<string, number>;
  resultIds?: { companies: string[]; people: string[]; routes: string[]; activities: string[] };
};

export function ImportsPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [payloadFiles, setPayloadFiles] = useState<Array<{ filename: string; content: string }>>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | ''>('');
  const [error, setError] = useState('');

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!files.length || result) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [files.length, result]);

  const sourceSummary = useMemo(
    () =>
      `${files.length} file${files.length === 1 ? '' : 's'} · ${files.reduce((sum, file) => sum + file.size, 0).toLocaleString()} bytes`,
    [files],
  );

  async function loadPayload() {
    const loaded = await Promise.all(files.map(async (file) => ({ filename: file.name, content: await file.text() })));
    setPayloadFiles(loaded);
    return loaded;
  }

  async function previewImport() {
    setBusy('preview');
    setError('');
    setResult(null);
    try {
      const loaded = await loadPayload();
      setPreview(
        await api.request<Preview>('/api/imports/research/preview', { method: 'POST', body: { files: loaded } }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The research files could not be previewed.');
    } finally {
      setBusy('');
    }
  }

  async function commitImport() {
    setBusy('import');
    setError('');
    try {
      const loaded = payloadFiles.length ? payloadFiles : await loadPayload();
      const imported = await api.request<ImportResult>('/api/imports/research', {
        method: 'POST',
        body: { files: loaded },
      });
      setResult(imported);
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'The import stopped before completion. It can be resumed.',
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="workspace research-import">
      <PageHeader
        eyebrow="Research intake"
        title="Import relationship research"
        description="Preview every company, target and mutual path before Northwind writes anything. Re-imported research is safely ignored."
      />
      {error ? (
        <Alert variant="danger" className="mt-5">
          {error}
        </Alert>
      ) : null}
      <div className="import-layout">
        <Card className="import-source-card">
          <span className="panel-eyebrow">01 · Sources</span>
          <h2>Choose research files</h2>
          <label className="import-dropzone">
            <UploadCloud size={28} aria-hidden />
            <strong>Choose EML or CSV files</strong>
            <span>Up to 40 files. Northwind reads them locally before sending the preview.</span>
            <input
              type="file"
              accept=".eml,.csv,message/rfc822,text/csv"
              multiple
              onChange={(event) => {
                setFiles([...(event.target.files ?? [])]);
                setPreview(null);
                setResult(null);
                setPayloadFiles([]);
              }}
            />
          </label>
          {files.length ? (
            <div className="import-file-list" aria-label="Selected research files">
              <strong>{sourceSummary}</strong>
              {files.map((file) => (
                <span key={`${file.name}:${file.size}`}>
                  <Mail size={14} /> {file.name}
                </span>
              ))}
            </div>
          ) : null}
          <Button onClick={previewImport} disabled={!files.length || Boolean(busy)}>
            {busy === 'preview' ? 'Reading research…' : 'Preview import'}
          </Button>
        </Card>

        <Card className="import-thread-card">
          <span className="panel-eyebrow">Relationship map</span>
          <RelationshipThread
            target={preview?.rows[0]?.targetName || 'Target'}
            mutual={preview?.rows[0]?.mutualName || 'Mutual contact'}
            owner="unassigned"
            stage="Found route"
          />
          <p>Imported contact notes remain historical context. They never move a route beyond Found route.</p>
        </Card>
      </div>

      {preview ? (
        <section className="import-preview" aria-labelledby="import-preview-title">
          <header>
            <div>
              <span className="panel-eyebrow">02 · Dry run</span>
              <h2 id="import-preview-title">Review the proposed changes</h2>
            </div>
            <div className="import-counts">
              <Badge tone="copper">{preview.preview.creates.companies} companies</Badge>
              <Badge tone="burgundy">{preview.preview.creates.people} people</Badge>
              <Badge tone="sage">{preview.preview.creates.routes} routes</Badge>
              <Badge tone="neutral">{preview.preview.unchanged} unchanged</Badge>
            </div>
          </header>
          {preview.omissions.length ? (
            <Alert variant="warning" title="Some files need attention">
              {preview.omissions.map((item) => (
                <span className="import-issue" key={item.filename}>
                  <AlertTriangle size={14} /> {item.filename}: {item.reason}
                </span>
              ))}
            </Alert>
          ) : null}
          <div className="import-row-list">
            {preview.rows.map((row, index) => (
              <article key={`${row.sourceHash}:${index}`}>
                <span className="import-row-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <small>{row.companyName}</small>
                  <strong>{row.targetName}</strong>
                  <span>{row.targetTitle || 'Role not supplied'}</span>
                </div>
                <Link2 size={17} aria-hidden />
                <div>
                  <small>Mutual path</small>
                  <strong>{row.mutualName}</strong>
                  <span>{row.sourceFilename}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="import-commit-bar">
            <div>
              <strong>No changes have been saved yet.</strong>
              <span>Commit only after omissions and aliases are understood.</span>
            </div>
            <Button
              onClick={commitImport}
              disabled={Boolean(busy) || !preview.rows.length || Boolean(preview.preview.conflicts.length)}
            >
              {busy === 'import' ? 'Importing safely…' : `Import ${preview.rows.length} relationship paths`}
            </Button>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="import-result" aria-labelledby="import-result-title" role="status">
          <CheckCircle2 size={28} aria-hidden />
          <div>
            <span className="panel-eyebrow">03 · Complete</span>
            <h2 id="import-result-title">Research import completed</h2>
            <p>Job {result.id} is recorded and resumable audit history has been preserved.</p>
          </div>
          <div className="import-result-links">
            {result.resultIds?.companies.map((id) => (
              <Link key={id} to={`/companies/${id}`}>
                Open company
              </Link>
            ))}
            {result.resultIds?.routes.slice(0, 12).map((id) => (
              <Link key={id} to={`/routes/${id}`}>
                Open route
              </Link>
            ))}
            {!result.resultIds?.companies.length && !result.resultIds?.routes.length ? (
              <span>No CRM records changed; this research was already current.</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {!files.length && !preview ? (
        <EmptyState
          icon={<Mail />}
          title="No research selected"
          description="Choose the EML files from your research emails, with an optional CSV companion export."
        />
      ) : null}
    </section>
  );
}
