import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload, type SessionAdmin } from '../../../../lib/admin/session';
import { trouverCompteParId } from '../../../../lib/admin/comptes';
import { peutVoirCouts } from '../../../../lib/mon-espace/compteRepo';

/**
 * TUILE « MON ESPACE » (Arno, 02/11/2026, lot 1 de docs/PLAN_MON_ESPACE.md) — qui entre dans sa page. `proxy.ts` refuse déjà
 * `/admin/mon-espace/*` sans le droit ; ce garde SERVEUR aligne la page : un non-autorisé voit un avis, jamais une donnée.
 * Administrateur : droit d'office (ses permissions sont implicites). Sans la migration 448 : refusé à tout collaborateur.
 */
export interface AccesMonEspace { autorise: boolean; prenom: string | null }

/** La décision, PURE : la session (permissions effectives) dit oui ou non ; le prénom ne sert qu'au « Bonjour ». */
export function decisionMonEspace(session: SessionAdmin | null, prenom: string | null): AccesMonEspace {
  const autorise = session?.perms.mon_espace === true;
  const p = prenom?.trim() ?? '';
  return { autorise, prenom: autorise && p !== '' ? p : null };
}

export async function accesMonEspace(): Promise<AccesMonEspace> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  // Le prénom n'est lu que pour un compte autorisé (voie de secours, sub = null : pas de compte, « Bonjour » seul).
  const compte = session?.perms.mon_espace === true && session.sub !== null ? await trouverCompteParId(session.sub) : null;
  return decisionMonEspace(session, compte?.prenom ?? null);
}

/**
 * 🔴 « Coûts et CA » — LE RÉCAPITULATIF (Arno, 13/11/2026) : les MÊMES comptes que l'onglet (le droit « Mon espace », puis la case « Les coûts » et
 * administrateur, relus en base — `peutVoirCouts`, la garde de la route). Pour tout autre compte, la page ne rend que le refus : ni le tableau, ni ses
 * données (la route, elle, répond 403).
 */
export async function accesRecapCouts(): Promise<boolean> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  if (session?.perms.mon_espace !== true || session.sub === null) return false;
  return peutVoirCouts(session.sub);
}
export const REFUS_RECAP_COUTS = 'Le récapitulatif des coûts et du CA est réservé aux comptes qui ont la case « Les coûts » (Administratif › Comptes).';

export const REFUS_MON_ESPACE = 'Cet espace est réservé aux comptes disposant du droit « Mon espace ».';

/** « Bonjour Cédric, votre espace » — sans prénom connu : « Bonjour, votre espace ». PUR. */
export function salutation(prenom: string | null): string {
  return prenom === null ? 'Bonjour, votre espace' : `Bonjour ${prenom}, votre espace`;
}
