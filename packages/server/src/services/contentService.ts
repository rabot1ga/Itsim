import {
  loadContentBundle,
  ContentValidationError,
  type ContentBundle,
  type ContentIssue,
} from '@itsim/content';

/**
 * Server-side content access.
 *
 * Reading + validating content is the job of `@itsim/content` (the same code
 * CI runs via `npm run validate -w packages/content`). This module only owns
 * the process-level cache and the "how do we react to issues" policy:
 * warnings are logged, errors abort startup.
 */

export type { ContentBundle, ContentIssue };

let content: ContentBundle | null = null;

/**
 * Load and validate all content files at server startup.
 * Throws `ContentValidationError` if the content is broken.
 */
export function loadContent(): ContentBundle {
  const { bundle, issues, stats } = loadContentBundle();

  for (const issue of issues) {
    const line = `${issue.where}: ${issue.message}`;
    if (issue.level === 'error') console.error(`  ✗ ${line}`);
    else console.warn(`  ⚠ ${line}`);
  }

  if (issues.some((i) => i.level === 'error')) {
    throw new ContentValidationError(issues);
  }

  console.log(
    `✓ content validated: ${Object.entries(stats)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}`
  );

  content = bundle;
  return bundle;
}

export function getContent(): ContentBundle {
  if (!content) {
    throw new Error('Content not loaded — call loadContent() first');
  }
  return content;
}

/** Test helper: inject a bundle without touching the filesystem. */
export function setContent(bundle: ContentBundle): void {
  content = bundle;
}
