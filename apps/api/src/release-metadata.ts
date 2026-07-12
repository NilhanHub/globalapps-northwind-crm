export type GeneratedReleaseMetadata = {
  version?: string;
  commitSha?: string;
  buildTime?: string;
  treeState?: 'clean' | 'dirty';
};

const clean = (value: unknown) => String(value ?? '').trim();
const validCommit = (value: string) => /^[a-f0-9]{40}$/i.test(value);
const validTimestamp = (value: string) => Boolean(value) && !Number.isNaN(Date.parse(value));

export function resolveReleaseMetadata(environment: NodeJS.ProcessEnv, generated?: GeneratedReleaseMetadata) {
  const generatedCommit = clean(generated?.commitSha);
  const generatedBuildTime = clean(generated?.buildTime);
  const generatedIsDeployable =
    generated?.treeState === 'clean' && validCommit(generatedCommit) && validTimestamp(generatedBuildTime);
  if (environment.NODE_ENV === 'production' && !generatedIsDeployable)
    throw new Error('Production requires clean generated release metadata');
  return {
    version: clean(environment.CRM_APP_VERSION) || clean(generated?.version) || '2.0.0',
    commitSha: generatedIsDeployable ? generatedCommit : clean(environment.CRM_COMMIT_SHA) || 'unknown',
    buildTime: generatedIsDeployable ? generatedBuildTime : clean(environment.CRM_BUILD_TIME) || 'unknown',
  };
}
