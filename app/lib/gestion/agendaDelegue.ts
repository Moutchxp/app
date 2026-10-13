/**
 * ══ 🔴🔴 LOT TACHES-AGENDA (lot 2) — UN JETON « AGENDA » AU NOM DE LA PERSONNE CONFIÉE ═════════════════════════════
 *
 * Même compte de service et même délégation que le Drive (`compteService.ts`), mais un JETON SÉPARÉ, à la seule
 * portée `calendar.events` : chaque jeton reste étroit, et le Drive n'est pas touché (`driveDelegue.ts` est
 * inchangé, son cache aussi). Arno a déclaré les deux portées dans la console d'administration le 13/10/2026.
 *
 * `calendar.events` = créer, modifier, supprimer des ÉVÉNEMENTS. Ni créer d'agenda, ni changer un partage, ni lire
 * les réglages. Et ce que l'application fait de ce jeton est encore borné par `fetchAgendaGarde` (agendaGoogle.ts).
 *
 * ⚠️ `adresse` DOIT venir de la BASE (le compte de la personne confiée), jamais du navigateur — c'est l'appelant
 * (`agendaSynchroRepo.ts`) qui en répond, et il vérifie aussi le domaine du Workspace.
 * 🔒 Jetons en mémoire du processus seulement ; un refus n'est jamais mémorisé.
 */
import { construireAssertion, corpsEchange, ENDPOINT_TOKEN, lireCleService } from './compteService';

export const SCOPE_AGENDA = 'https://www.googleapis.com/auth/calendar.events';

const cache = new Map<string, { jeton: string; expireA: number }>();
const MARGE_MS = 60_000;

export function oublierJetonsAgenda(): void { cache.clear(); }

/** Pourquoi Google a refusé le jeton agenda, en français. PUR. */
export function motifRefusAgenda(erreur: string | undefined, description: string | undefined): string {
  const e = (erreur ?? '').toLowerCase();
  const d = (description ?? '').toLowerCase();
  if (e === 'unauthorized_client') return 'Agenda pas autorisé par l’administrateur : la délégation ne couvre pas l’agenda.';
  if (e === 'invalid_client') return 'La clé du compte de service n’est pas reconnue par Google.';
  if (e === 'invalid_grant') {
    if (d.includes('disabled') || d.includes('suspended')) return 'Ce compte Google est suspendu : pas d’agenda Google.';
    return 'Cette adresse n’est pas reconnue dans notre Workspace Google : pas d’agenda Google.';
  }
  return `L’agenda n’a pas pu être ouvert (${erreur ?? 'raison inconnue'}).`;
}

export async function jetonAgendaPour(
  adresse: string, deps: { fetch: typeof fetch; maintenant?: () => Date } = { fetch },
): Promise<{ ok: true; jeton: string } | { ok: false; motif: string }> {
  const sujet = (adresse ?? '').trim().toLowerCase();
  if (sujet === '' || !sujet.includes('@')) return { ok: false, motif: 'Aucune adresse Google pour cette personne.' };
  const maintenant = (deps.maintenant ?? (() => new Date()))();
  const m = cache.get(sujet);
  if (m && m.expireA - MARGE_MS > maintenant.getTime()) return { ok: true, jeton: m.jeton };
  const cle = lireCleService();
  if (cle === null) return { ok: false, motif: 'Le compte de service Google n’est pas configuré sur ce poste.' };
  try {
    const res = await deps.fetch(ENDPOINT_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpsEchange(construireAssertion({ cle, subject: sujet, scope: SCOPE_AGENDA, maintenant })),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || j.error || !j.access_token) return { ok: false, motif: motifRefusAgenda(j.error, j.error_description) };
    const duree = (typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 3600) * 1000;
    cache.set(sujet, { jeton: j.access_token, expireA: maintenant.getTime() + duree });
    return { ok: true, jeton: j.access_token };
  } catch {
    return { ok: false, motif: 'Google n’a pas répondu pour le jeton de l’agenda — nouvel essai automatique.' };
  }
}
