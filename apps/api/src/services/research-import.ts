import { createHash } from 'node:crypto';
import {
  activitySchema,
  companySchema,
  normalizeIdentity,
  normalizeLinkedIn,
  personSchema,
  routeSchema,
  type Activity,
  type Company,
  type Person,
  type Route,
} from '@northwind/domain';
import { z } from 'zod';

export const researchRowSchema = z.object({
  companyName: z.string().trim().min(1),
  targetName: z.string().trim().min(1),
  targetTitle: z.string().trim().default(''),
  targetLocation: z.string().trim().default(''),
  targetLinkedInUrl: z.string().trim().default(''),
  mutualName: z.string().trim().min(1),
  mutualTitle: z.string().trim().default(''),
  mutualLocation: z.string().trim().default(''),
  mutualLinkedInUrl: z.string().trim().default(''),
  notes: z.string().trim().default(''),
  contactedAt: z.string().trim().default(''),
  sourceFilename: z.string().trim().min(1),
  sourceHash: z.string().trim().min(8),
  sourceRow: z.number().int().positive().optional(),
});
export type ResearchRow = z.infer<typeof researchRowSchema>;

export const researchImportRequestSchema = z.object({
  files: z
    .array(z.object({ filename: z.string().min(1), content: z.string().max(1_500_000) }))
    .max(40)
    .default([]),
  rows: z
    .array(researchRowSchema.omit({ sourceHash: true }).extend({ sourceHash: z.string().optional() }))
    .max(500)
    .default([]),
});

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const idFor = (kind: string, identity: string) => `${kind}-import-${hash(identity).slice(0, 24)}`;

function parseCsv(content: string, filename: string): ResearchRow[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;
      if (character === '"' && quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = !quoted;
      else if (character === ',' && !quoted) {
        cells.push(value.trim());
        value = '';
      } else value += character;
    }
    cells.push(value.trim());
    return cells;
  };
  const headers = parseLine(lines[0]!).map((header) => normalizeIdentity(header).replaceAll(' ', ''));
  const sourceHash = hash(content);
  return lines.slice(1).flatMap((line, index) => {
    const cells = parseLine(line);
    const record = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
    const candidate = {
      companyName: record.companyname || record.company || '',
      targetName: record.targetname || record.target || '',
      targetTitle: record.targettitle || record.targetrole || '',
      targetLocation: record.targetlocation || '',
      targetLinkedInUrl: record.targetlinkedinurl || record.targetlinkedin || '',
      mutualName: record.mutualname || record.mutualcontact || record.mutual || '',
      mutualTitle: record.mutualtitle || record.mutualrole || '',
      mutualLocation: record.mutuallocation || '',
      mutualLinkedInUrl: record.mutuallinkedinurl || record.mutuallinkedin || '',
      notes: record.notes || record.contactnotes || '',
      contactedAt: record.contactedat || record.occurredat || '',
      sourceFilename: filename,
      sourceHash,
      sourceRow: index + 2,
    };
    const parsed = researchRowSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

function emlText(content: string) {
  return content
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ');
}

function plainEmlBody(content: string) {
  const marker = content.search(/Content-Type:\s*text\/plain/i);
  if (marker < 0) return emlText(content);
  const headerEnd =
    content.indexOf('\n\n', marker) >= 0 ? content.indexOf('\n\n', marker) : content.indexOf('\r\n\r\n', marker);
  if (headerEnd < 0) return emlText(content);
  const separatorLength = content.startsWith('\r\n\r\n', headerEnd) ? 4 : 2;
  const headers = content.slice(marker, headerEnd);
  const bodyStart = headerEnd + separatorLength;
  const boundaryToken = content.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  const boundary = boundaryToken ? content.indexOf(`--${boundaryToken}`, bodyStart) : -1;
  const encoded = content.slice(bodyStart, boundary < 0 ? content.length : boundary);
  if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) {
    try {
      return Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8');
    } catch {
      return encoded;
    }
  }
  return emlText(encoded);
}

function companyFromFilename(filename: string) {
  return filename
    .replace(/\.eml$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/^Connections\s+(?:at|to)\s+/i, '')
    .trim();
}

export function parseNarrativeResearch(content: string, filename: string, sourceHash: string): ResearchRow[] {
  const text = plainEmlBody(content).replace(/\r/g, '');
  const companyName = companyFromFilename(filename);
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: ResearchRow[] = [];
  const excludedNameWords = new Set([
    'Mutual',
    'Contacts',
    'Current',
    'Director',
    'Manager',
    'Head',
    'Chief',
    'Officer',
    'Company',
    'Group',
    'London',
    'Ireland',
    'United',
    'Kingdom',
  ]);
  const targetEntries: Array<{ index: number; name: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\p{N}+[.)\s]*$/u.test(line) && lines[index + 1]) {
      targetEntries.push({ index: index + 1, name: lines[index + 1]!.trim() });
      continue;
    }
    if (/^[^\p{L}]*\p{N}+[^\p{L}]+\p{Lu}/u.test(line) && !/\b(?:19|20)\d{2}\b/.test(line))
      targetEntries.push({ index, name: line.replace(/^[^\p{L}]+/u, '').trim() });
  }
  const uniqueTargets = targetEntries.filter(
    (entry, index, all) => all.findIndex((candidate) => candidate.index === entry.index) === index,
  );
  for (let targetPosition = 0; targetPosition < uniqueTargets.length; targetPosition += 1) {
    const target = uniqueTargets[targetPosition]!;
    const nextTargetIndex = uniqueTargets[targetPosition + 1]?.index ?? lines.length;
    const mutualIndex = lines.findIndex(
      (line, index) => index > target.index && index < nextTargetIndex && /^Mutual contacts?\b/i.test(line),
    );
    if (mutualIndex < 0) continue;
    const mutualText = lines
      .slice(mutualIndex + 1, nextTargetIndex)
      .filter((line) => !/^---+$/.test(line))
      .join(' ');
    const candidates = [...mutualText.matchAll(/\b[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,3}\b/gu)]
      .map((match) => match[0].trim())
      .filter((name) => {
        const words = name.split(/\s+/);
        return (
          normalizeIdentity(name) !== normalizeIdentity(target.name) &&
          normalizeIdentity(name) !== normalizeIdentity(companyName) &&
          !words.some((word) => excludedNameWords.has(word))
        );
      })
      .filter(
        (name, index, all) => all.findIndex((item) => normalizeIdentity(item) === normalizeIdentity(name)) === index,
      );
    for (const mutualName of candidates) {
      const parsed = researchRowSchema.safeParse({
        companyName,
        targetName: target.name,
        targetTitle: lines[target.index + 1] ?? '',
        targetLocation: lines[target.index + 2] ?? '',
        targetLinkedInUrl: '',
        mutualName,
        mutualTitle: '',
        mutualLocation: '',
        mutualLinkedInUrl: '',
        notes: mutualText,
        contactedAt: '',
        sourceFilename: filename,
        sourceHash,
        sourceRow: targetPosition + 1,
      });
      if (parsed.success) rows.push(parsed.data);
    }
  }
  return rows;
}

function parseEml(content: string, filename: string): ResearchRow[] {
  const text = plainEmlBody(content);
  if (/^Mutual contacts?\s*$/im.test(text) && /^\s*---+\s*$/m.test(text))
    return parseNarrativeResearch(content, filename, hash(content));
  const starts = [...text.matchAll(/(?:^|\n)\s*Company(?: name)?\s*[:-]\s*/gi)].map((match) => match.index ?? 0);
  const blocks = starts.length
    ? starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length))
    : [text];
  const sourceHash = hash(content);
  const field = (block: string, label: RegExp) => block.match(label)?.[1]?.trim() ?? '';
  const labelled = blocks.flatMap((block, index) => {
    const candidate = {
      companyName: field(block, /Company(?: name)?\s*[:-]\s*([^\n]+)/i),
      targetName: field(block, /Target(?: person| name)?\s*[:-]\s*([^\n]+)/i),
      targetTitle: field(block, /Target (?:title|role)\s*[:-]\s*([^\n]+)/i),
      targetLocation: field(block, /Target location\s*[:-]\s*([^\n]+)/i),
      targetLinkedInUrl: field(block, /Target LinkedIn(?: URL)?\s*[:-]\s*([^\s\n]+)/i),
      mutualName: field(block, /Mutual(?: contact| name)?\s*[:-]\s*([^\n]+)/i),
      mutualTitle: field(block, /Mutual (?:title|role)\s*[:-]\s*([^\n]+)/i),
      mutualLocation: field(block, /Mutual location\s*[:-]\s*([^\n]+)/i),
      mutualLinkedInUrl: field(block, /Mutual LinkedIn(?: URL)?\s*[:-]\s*([^\s\n]+)/i),
      notes: field(block, /(?:Contact )?Notes?\s*[:-]\s*([^\n]+)/i),
      contactedAt: field(block, /(?:Contacted|Occurred)(?: at)?\s*[:-]\s*([^\n]+)/i),
      sourceFilename: filename,
      sourceHash,
      sourceRow: index + 1,
    };
    const parsed = researchRowSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
  return labelled.length ? labelled : parseNarrativeResearch(content, filename, sourceHash);
}

export function parseResearchRequest(input: unknown) {
  const request = researchImportRequestSchema.parse(input);
  const rows = request.rows.map((row) =>
    researchRowSchema.parse({ ...row, sourceHash: row.sourceHash || hash(JSON.stringify(row)) }),
  );
  const omissions: Array<{ filename: string; reason: string }> = [];
  for (const file of request.files) {
    const parsed = file.filename.toLowerCase().endsWith('.csv')
      ? parseCsv(file.content, file.filename)
      : parseEml(file.content, file.filename);
    if (!parsed.length)
      omissions.push({ filename: file.filename, reason: 'No complete company, target and mutual row was detected' });
    rows.push(...parsed);
  }
  const unique = new Map<string, ResearchRow>();
  for (const row of rows) {
    const identity = `${normalizeIdentity(row.companyName)}|${normalizeIdentity(row.targetName)}|${normalizeLinkedIn(row.mutualLinkedInUrl) || normalizeIdentity(row.mutualName)}|${row.sourceHash}`;
    unique.set(identity, row);
  }
  return { rows: [...unique.values()], omissions };
}

export function previewResearchImport(
  rows: ResearchRow[],
  current: { companies: Company[]; people: Person[]; routes: Route[] },
) {
  const aliases: Array<{ supplied: string; existing: string; id: string }> = [];
  let companies = 0;
  let people = 0;
  let routes = 0;
  let unchanged = 0;
  const seenCompanies = new Set(
    current.companies.filter((item) => !item.archivedAt).map((item) => normalizeIdentity(item.name)),
  );
  const seenPeople = new Set(
    current.people
      .filter((item) => !item.archivedAt)
      .map((item) => `${normalizeIdentity(item.name)}|${item.companyId}`),
  );
  const seenRoutes = new Set(
    current.routes.filter((item) => !item.archivedAt).map((item) => `${item.targetPersonId}|${item.mutualPersonId}`),
  );
  for (const row of rows) {
    const companyKey = normalizeIdentity(row.companyName);
    const company = current.companies.find((item) => !item.archivedAt && normalizeIdentity(item.name) === companyKey);
    if (!seenCompanies.has(companyKey)) {
      companies += 1;
      seenCompanies.add(companyKey);
    } else if (
      company &&
      company.name !== row.companyName &&
      !aliases.some((alias) => alias.supplied === row.companyName)
    ) {
      aliases.push({ supplied: row.companyName, existing: company.name, id: company.id });
    }
    const companyId = company?.id ?? idFor('company', companyKey);
    const targetKey = `${normalizeIdentity(row.targetName)}|${companyId}`;
    const mutualKey = `${normalizeLinkedIn(row.mutualLinkedInUrl) || normalizeIdentity(row.mutualName)}|`;
    if (!seenPeople.has(targetKey)) {
      people += 1;
      seenPeople.add(targetKey);
    }
    if (!seenPeople.has(mutualKey)) {
      people += 1;
      seenPeople.add(mutualKey);
    }
    const target = current.people.find((item) => `${normalizeIdentity(item.name)}|${item.companyId}` === targetKey);
    const mutual = current.people.find((item) =>
      normalizeLinkedIn(row.mutualLinkedInUrl)
        ? normalizeLinkedIn(item.linkedinUrl) === normalizeLinkedIn(row.mutualLinkedInUrl)
        : normalizeIdentity(item.name) === normalizeIdentity(row.mutualName) && !item.companyId,
    );
    const routeKey = `${target?.id ?? idFor('target', targetKey)}|${mutual?.id ?? idFor('mutual', mutualKey)}`;
    if (!seenRoutes.has(routeKey)) {
      routes += 1;
      seenRoutes.add(routeKey);
    } else unchanged += 1;
  }
  return { rows: rows.length, creates: { companies, people, routes }, updates: 0, unchanged, aliases, conflicts: [] };
}

export function buildResearchImportChanges(input: {
  rows: ResearchRow[];
  companies: Company[];
  people: Person[];
  routes: Route[];
  activities: Activity[];
  workspaceId: string;
  actor: string;
  importJobId: string;
  now: string;
}) {
  const companies = [...input.companies];
  const people = [...input.people];
  const routes = [...input.routes];
  const activities = [...input.activities];
  const original = {
    people: new Map(people.map((item) => [item.id, JSON.stringify(item)])),
    routes: new Map(routes.map((item) => [item.id, JSON.stringify(item)])),
  };
  const originalPersonVersions = new Map(people.map((item) => [item.id, item.version]));
  const createdIds = {
    companies: new Set<string>(),
    people: new Set<string>(),
    routes: new Set<string>(),
    activities: new Set<string>(),
  };
  for (const row of input.rows) {
    const companyKey = normalizeIdentity(row.companyName);
    let company = companies.find((item) => !item.archivedAt && normalizeIdentity(item.name) === companyKey);
    if (!company) {
      company = companySchema.parse({
        id: idFor('company', companyKey),
        name: row.companyName,
        normalizedName: companyKey,
        createdAt: input.now,
        createdBy: input.actor,
        workspaceId: input.workspaceId,
        version: 1,
      });
      companies.push(company);
      createdIds.companies.add(company.id);
    }
    const sourceReference = {
      type: (row.sourceFilename.toLowerCase().endsWith('.csv') ? 'csv' : 'email') as 'csv' | 'email',
      filename: row.sourceFilename,
      sourceHash: row.sourceHash,
      importedAt: input.now,
      importJobId: input.importJobId,
      ...(row.sourceRow ? { row: row.sourceRow } : {}),
    };
    const targetKey = `${normalizeIdentity(row.targetName)}|${company.id}`;
    let target = people.find(
      (item) => !item.archivedAt && `${normalizeIdentity(item.name)}|${item.companyId}` === targetKey,
    );
    if (!target) {
      target = personSchema.parse({
        id: idFor('target', targetKey),
        name: row.targetName,
        normalizedName: normalizeIdentity(row.targetName),
        title: row.targetTitle,
        location: row.targetLocation,
        linkedinUrl: row.targetLinkedInUrl,
        normalizedLinkedInKey: normalizeLinkedIn(row.targetLinkedInUrl) || undefined,
        companyId: company.id,
        companyName: company.name,
        type: 'target',
        notes: '',
        mutualPersonIds: [],
        sourceReferences: [sourceReference],
        createdAt: input.now,
        updatedAt: input.now,
        workspaceId: input.workspaceId,
        version: 1,
      });
      people.push(target);
      createdIds.people.add(target.id);
    }
    const mutualIdentity = normalizeLinkedIn(row.mutualLinkedInUrl) || normalizeIdentity(row.mutualName);
    let mutual = people.find((item) =>
      normalizeLinkedIn(row.mutualLinkedInUrl)
        ? normalizeLinkedIn(item.linkedinUrl) === mutualIdentity
        : normalizeIdentity(item.name) === mutualIdentity && !item.companyId,
    );
    if (!mutual) {
      mutual = personSchema.parse({
        id: idFor('mutual', `${mutualIdentity}|`),
        name: row.mutualName,
        normalizedName: normalizeIdentity(row.mutualName),
        title: row.mutualTitle,
        location: row.mutualLocation,
        linkedinUrl: row.mutualLinkedInUrl,
        normalizedLinkedInKey: normalizeLinkedIn(row.mutualLinkedInUrl) || undefined,
        companyId: '',
        companyName: '',
        type: 'mutual',
        notes: '',
        mutualPersonIds: [],
        sourceReferences: [sourceReference],
        createdAt: input.now,
        updatedAt: input.now,
        workspaceId: input.workspaceId,
        version: 1,
      });
      people.push(mutual);
      createdIds.people.add(mutual.id);
    }
    if (!target.mutualPersonIds.includes(mutual.id)) {
      const index = people.findIndex((item) => item.id === target!.id);
      target = personSchema.parse({
        ...target,
        mutualPersonIds: [...target.mutualPersonIds, mutual.id],
        updatedAt: input.now,
        version: createdIds.people.has(target.id) ? 1 : (originalPersonVersions.get(target.id) ?? target.version) + 1,
      });
      people[index] = target;
    }
    let route = routes.find(
      (item) => !item.archivedAt && item.targetPersonId === target!.id && item.mutualPersonId === mutual!.id,
    );
    if (!route) {
      const routeIdentity = `${target.id}|${mutual.id}`;
      route = routeSchema.parse({
        id: idFor('route', routeIdentity),
        companyId: company.id,
        companyName: company.name,
        targetPersonId: target.id,
        mutualPersonId: mutual.id,
        owner: 'unassigned',
        stage: 'Found route',
        confidence: 'emerging',
        nextAction: '',
        dueDate: '',
        outcome: 'pending',
        notes: '',
        researchNotes: row.notes,
        sourceIdentityKey: routeIdentity,
        sourceReferences: [sourceReference],
        createdAt: input.now,
        updatedAt: input.now,
        workspaceId: input.workspaceId,
        version: 1,
      });
      routes.push(route);
      createdIds.routes.add(route.id);
    }
    if (row.contactedAt) {
      const activityId = idFor('activity', `${route.id}|${row.sourceHash}|${row.contactedAt}`);
      if (!activities.some((item) => item.id === activityId)) {
        activities.push(
          activitySchema.parse({
            id: activityId,
            routeId: route.id,
            companyId: company.id,
            actor: input.actor,
            type: 'historical_contact',
            summary: 'Imported historical contact note',
            details: row.notes,
            occurredAt: row.contactedAt,
            timestamp: input.now,
            workspaceId: input.workspaceId,
            version: 1,
          }),
        );
        createdIds.activities.add(activityId);
      }
    }
  }
  const changedPeople = people.filter(
    (item) => createdIds.people.has(item.id) || original.people.get(item.id) !== JSON.stringify(item),
  );
  const changedRoutes = routes.filter(
    (item) => createdIds.routes.has(item.id) || original.routes.get(item.id) !== JSON.stringify(item),
  );
  return {
    changes: {
      companies: companies.filter((item) => createdIds.companies.has(item.id)),
      people: changedPeople,
      routes: changedRoutes,
      activities: activities.filter((item) => createdIds.activities.has(item.id)),
    },
    summary: {
      companiesCreated: createdIds.companies.size,
      peopleCreated: createdIds.people.size,
      peopleUpdated: changedPeople.filter((item) => !createdIds.people.has(item.id)).length,
      routesCreated: createdIds.routes.size,
      activitiesCreated: createdIds.activities.size,
    },
    resultIds: {
      companies: [...createdIds.companies],
      people: [...createdIds.people],
      routes: [...createdIds.routes],
      activities: [...createdIds.activities],
    },
  };
}
