import { resolve } from 'node:path';
import { validateExportDirectory } from './lib/data-export.js';

const directory = process.argv[2] || process.env.CRM_EXPORT_DIR;
if (!directory) throw new Error('Provide an export directory: npm run data:verify-export -- <path>');
const result = validateExportDirectory(resolve(directory));
console.log(JSON.stringify({ ok: true, directory: resolve(directory), counts: result.integrity.counts }, null, 2));
