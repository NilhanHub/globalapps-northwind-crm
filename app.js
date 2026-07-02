// Hostinger's managed Node launcher expects a conventional root entry file.
// The postinstall hook builds the TypeScript API before this module runs.
import('./apps/api/dist/index.js').catch((error) => {
  console.error('Northwind CRM startup failed:', error);
  process.exit(1);
});
