/**
 * Every decision of the organization runs one at a time, so each one sees the payments of the
 * previous one (monthly caps, duplicates, what a case already paid).
 */
// ponytail: single-process lock; use pg_advisory_xact_lock when running more than one API instance
let tail: Promise<unknown> = Promise.resolve();

export function withOrgLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(() => fn());
  tail = run.catch(() => undefined);
  return run;
}
