import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { AppError } from '../lib/common';
import type { Deps } from '../services/deps';
import { DEMO_ORG_ID } from '../services/demo';

export interface CurrentUser {
  id: string;
  orgId: string;
  name: string;
  title: string;
  canApprove: boolean;
  canSign: boolean;
}

/**
 * Demo identity: the web app's user switcher sends `x-mandato-user`. Accepted only in DEMO_MODE;
 * a real deployment puts an identity provider in front of the API (SECURITY.md).
 */
export async function currentUser(deps: Deps, c: Context): Promise<CurrentUser> {
  if (!deps.config.DEMO_MODE) {
    throw new AppError(
      401,
      'unauthorized',
      'Autenticación requerida (configura un proveedor de identidad).',
    );
  }
  const requested = c.req.header('x-mandato-user') ?? 'usr_laura';
  const [user] = await deps.db
    .select()
    .from(users)
    .where(and(eq(users.id, requested), eq(users.orgId, DEMO_ORG_ID)));
  if (!user) throw new AppError(401, 'unauthorized', 'Usuario desconocido.');
  return {
    id: user.id,
    orgId: user.orgId,
    name: user.name,
    title: user.title,
    canApprove: user.canApprove,
    canSign: user.canSign,
  };
}
