import { describe, expect, it } from 'vitest';
import { resolveReleaseMetadata } from './release-metadata.js';

describe('release metadata', () => {
  it('prefers the generated build identity over stale hosting variables', () => {
    expect(
      resolveReleaseMetadata(
        {
          CRM_APP_VERSION: '2.0.0',
          CRM_COMMIT_SHA: '1111111111111111111111111111111111111111',
          CRM_BUILD_TIME: '2026-01-01T00:00:00.000Z',
        },
        {
          version: '2.0.0',
          commitSha: '2222222222222222222222222222222222222222',
          buildTime: '2026-07-12T10:00:00.000Z',
          treeState: 'clean',
        },
      ),
    ).toEqual({
      version: '2.0.0',
      commitSha: '2222222222222222222222222222222222222222',
      buildTime: '2026-07-12T10:00:00.000Z',
    });
  });

  it('retains explicit environment metadata when no generated build identity exists', () => {
    expect(
      resolveReleaseMetadata({
        CRM_APP_VERSION: '2.1.0',
        CRM_COMMIT_SHA: '3333333333333333333333333333333333333333',
        CRM_BUILD_TIME: '2026-07-12T11:00:00.000Z',
      }),
    ).toEqual({
      version: '2.1.0',
      commitSha: '3333333333333333333333333333333333333333',
      buildTime: '2026-07-12T11:00:00.000Z',
    });
  });

  it('does not advertise an uncommitted build as a deployable release', () => {
    expect(
      resolveReleaseMetadata(
        {
          CRM_COMMIT_SHA: '4444444444444444444444444444444444444444',
          CRM_BUILD_TIME: '2026-07-12T12:00:00.000Z',
        },
        {
          commitSha: '5555555555555555555555555555555555555555',
          buildTime: '2026-07-12T12:01:00.000Z',
          treeState: 'dirty',
        },
      ),
    ).toMatchObject({
      commitSha: '4444444444444444444444444444444444444444',
      buildTime: '2026-07-12T12:00:00.000Z',
    });
  });

  it('fails closed in production when clean generated metadata is unavailable', () => {
    expect(() =>
      resolveReleaseMetadata(
        {
          NODE_ENV: 'production',
          CRM_COMMIT_SHA: '6666666666666666666666666666666666666666',
          CRM_BUILD_TIME: '2026-07-12T12:10:00.000Z',
        },
        {
          commitSha: '7777777777777777777777777777777777777777',
          buildTime: '2026-07-12T12:11:00.000Z',
          treeState: 'dirty',
        },
      ),
    ).toThrow('clean generated release metadata');
  });
});
