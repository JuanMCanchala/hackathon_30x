import { DEMO_START } from '@recibido/dataset';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { orgState } from '../db/schema';
import { ORG_ID } from './state';

/** Simulated time, stored in org_state.now. Business logic never reads Date.now(). */
export interface Clock {
  now(): Promise<string>;
  set(now: string): Promise<void>;
}

export function orgClock(db: Db): Clock {
  return {
    async now() {
      const [row] = await db.select().from(orgState).where(eq(orgState.orgId, ORG_ID));
      return row?.now ?? DEMO_START;
    },
    async set(now) {
      await db
        .insert(orgState)
        .values({ orgId: ORG_ID, now, phase: 'idle' })
        .onConflictDoUpdate({ target: orgState.orgId, set: { now } });
    },
  };
}
