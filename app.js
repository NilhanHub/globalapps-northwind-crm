// Hostinger's managed Node launcher expects a conventional root entry file.
// The postinstall hook builds the TypeScript API before this module runs.
import process from 'node:process';

import('./apps/api/dist/index.js').catch((error) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Northwind CRM startup failed: ${detail}\n`);
  process.exit(1);
});
