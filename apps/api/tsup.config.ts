import { defineConfig } from 'tsup';

const buildValue = (name: string, fallback: string) => JSON.stringify(process.env[name]?.trim() || fallback);

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  clean: true,
  noExternal: ['@northwind/domain', '@northwind/api-client'],
  define: {
    __NORTHWIND_BUILD_VERSION__: buildValue('NORTHWIND_BUILD_VERSION', 'development'),
    __NORTHWIND_BUILD_COMMIT_SHA__: buildValue('NORTHWIND_BUILD_COMMIT_SHA', 'unknown'),
    __NORTHWIND_BUILD_TIME__: buildValue('NORTHWIND_BUILD_TIME', 'unknown'),
    __NORTHWIND_BUILD_TREE_STATE__: buildValue('NORTHWIND_BUILD_TREE_STATE', 'dirty'),
  },
});
