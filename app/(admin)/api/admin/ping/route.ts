import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton } from '../../../../lib/admin/session';

/** Sonde authentifiée — défense en profondeur (revérifie la session, EX-13/EX-15). */
export async function GET() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) {
    return Response.json({ erreur: 'non authentifié' }, { status: 401 });
  }
  return Response.json({ authentifie: true });
}
