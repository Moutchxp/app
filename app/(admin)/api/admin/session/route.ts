import 'server-only';
import { cookies } from 'next/headers';
import { motDePasseValide } from '../../../../lib/admin/password';
import { NOM_COOKIE, optionsCookie, signerJeton } from '../../../../lib/admin/session';

/** Ouverture de session : POST { password } (EX-16, EX-17, EX-18, EX-20). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'Identifiants invalides' }, { status: 401 });
  }

  const password = typeof (body as Record<string, unknown>)?.password === 'string'
    ? (body as { password: string }).password
    : '';

  if (!motDePasseValide(password)) {
    // Message générique quel que soit le motif (EX-20).
    return Response.json({ erreur: 'Identifiants invalides' }, { status: 401 });
  }

  const jeton = await signerJeton();
  (await cookies()).set(NOM_COOKIE, jeton, optionsCookie(process.env.NODE_ENV === 'production'));
  return Response.json({ ok: true });
}

/** Déconnexion : DELETE → cookie effacé (EX-21). */
export async function DELETE() {
  (await cookies()).delete({ name: NOM_COOKIE, path: '/' });
  return Response.json({ ok: true });
}
