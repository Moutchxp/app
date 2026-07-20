import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE_CLIENT } from '../../../../lib/internaute/authSession';

// Runtime Node explicite. Route PUBLIQUE (hors matcher admin).
export const runtime = 'nodejs';

/** POST /api/internaute/auth/logout — ferme la session : efface le cookie `svv_client_session`. */
export async function POST(): Promise<Response> {
  (await cookies()).delete({ name: NOM_COOKIE_CLIENT, path: '/' });
  return Response.json({ ok: true });
}
