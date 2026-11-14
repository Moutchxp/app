import 'server-only';
import { debutDuRendezVous, type RdvPrevisite } from './previsite';
import { horsPerimetre } from './perimetreTest';
import { passeInvitationsCompteRendu } from './previsiteAuto';

/**
 * 🔴 Arno (14/11/2026, 473) — PRÉAVIS DE TEST, pré-visite « dans 2 minutes » : l'invitation de début de pré-visite part À L'HEURE DE DÉBUT,
 * sans attendre la minuterie (toutes les 5 minutes). La passe est la passe ordinaire (même réservation : jamais deux fois), lancée HORS du
 * périmètre du geste : chaque ligne y reprend SON périmètre (le test : au seul créateur ; un vrai préavis : comme d'habitude). Un rendez-vous
 * à plus d'une heure : rien (la minuterie s'en charge).
 */
export const DELAI_MAX_INVITATION_TEST_MS = 60 * 60_000;

export function planifierInvitationTest(rdv: RdvPrevisite, maintenant: number = Date.now()): boolean {
  const attente = debutDuRendezVous(rdv.jour, rdv.heure).getTime() - maintenant + 5_000;
  if (!Number.isFinite(attente) || attente > DELAI_MAX_INVITATION_TEST_MS) return false;
  horsPerimetre(() => {
    const t = setTimeout(() => { void passeInvitationsCompteRendu().catch(() => {}); }, Math.max(0, attente));
    (t as { unref?: () => void }).unref?.();
  });
  return true;
}
