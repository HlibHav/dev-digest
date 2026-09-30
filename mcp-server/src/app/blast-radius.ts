import type { BlastRadiusOut } from './present.js';

/** `devdigest_get_blast_radius`: the L04 homework stub. Takes no `ServerDeps`/`ApiClient` at
 * all, so "zero API calls" (AC17) is structural, not a discipline to maintain. */
export function getBlastRadius(input: { repo: string; pr: number; files?: string[] }): BlastRadiusOut {
  return {
    status: 'not_implemented',
    repo: input.repo,
    pr: input.pr,
    message:
      'Blast radius is not implemented yet (L04 homework). Use devdigest_get_findings for review results on this PR.',
  };
}
