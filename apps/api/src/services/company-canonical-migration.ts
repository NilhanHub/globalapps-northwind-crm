import { companySchema, normalizeIdentity, normalizeRecordScope, type Company } from '@northwind/domain';

export type CompanyCanonicalRepairReason = 'null_last_contact' | 'stale_normalized_name';

export type CompanyCanonicalRepair = {
  expectedVersion: number;
  reasons: CompanyCanonicalRepairReason[];
  record: Company;
};

export function planCompanyCanonicalRepairs(
  records: Array<Record<string, unknown>>,
  updatedAt = new Date().toISOString(),
): CompanyCanonicalRepair[] {
  return records.flatMap((raw) => {
    const reasons: CompanyCanonicalRepairReason[] = [];
    if (raw.lastContactAt === null) reasons.push('null_last_contact');
    const normalizedName = normalizeIdentity(String(raw.name ?? ''));
    if (String(raw.normalizedName ?? '') !== normalizedName) reasons.push('stale_normalized_name');
    if (!reasons.length) return [];

    const scoped = normalizeRecordScope(raw);
    const expectedVersion = Number(scoped.version);
    const record = companySchema.parse({
      ...scoped,
      lastContactAt: raw.lastContactAt ?? '',
      normalizedName,
      updatedAt,
      version: expectedVersion + 1,
    });
    return [{ expectedVersion, reasons, record }];
  });
}
