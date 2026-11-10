import { query, withTransaction } from '../db/client';
import { envoyerSerie, mailsAvisDisponibles, type DepsAvis } from './mailsPreavisSortieRepo';
import { adressesUniques } from './mailsPreavisSortie';
import type { LignePreavisAccueil } from './preavis';
import { preavisEnCours } from './preavisRepo';
import {
  MENTION_AUTOMATIQUE, enAlerte, finDuRendezVous, mailPrevisite, objetAlertePrevisite, objetInvitationCompteRendu, paragraphesAlertePrevisite,
  paragraphesInvitationCompteRendu, paragraphesRecapAlertes, objetRecapAlertes, statutPrevisite,
} from './previsite';
import {
  AUTEUR_AUTOMATIQUE, CHAMPS_SUIVI, assurerSuivi, aujourdhui, collaborateursInternes, contexte, faitsDuSuivi, lienLignePreavis, lireGroupe, previsiteDisponible,
  rdvDuSuivi, reponsesDesTaches, suiviOuvert, type Groupe, type LigneSuivi,
} from './previsiteBase';

/**
 * ══ 🔴🔴 LA PRÉ-VISITE — LES ENVOIS AUTOMATIQUES (Arno, 10/11/2026) ═══════════════════════════════════════════════════════════
 * 🔴 Arno (10/11/2026) — appelés par la MINUTERIE DU SERVEUR WEB (`minuteriePrevisite.ts`, toutes les 5 minutes), JAMAIS par le démon :
 * même transport et même verrou recette que les autres mails de la Location (en recette, rien ne part).
 */

/**
 * L'ALERTE DU 11e JOUR, UNE SEULE FOIS : pour chaque préavis en cours en alerte et jamais alerté, le suivi est créé, puis RÉSERVÉ
 * (`UPDATE … SET alerte_envoyee_le = now() WHERE alerte_envoyee_le IS NULL` — deux passes simultanées ne peuvent pas toutes deux le
 * prendre), puis le mail part, À : tous les collaborateurs ayant accès à Gestion et/ou Location (chaque adresse une fois). Un échec
 * d'envoi rend la réservation (la passe suivante réessaie) ; un envoi réussi ne se refait jamais.
 * 🔴 Arno (10/11/2026) — LE PREMIER PASSAGE (aucune alerte n'a encore jamais été envoyée) : tous les préavis déjà en retard passent en
 * alerte, mais UN SEUL mail récapitulatif les liste (locataires, adresse, réception, lien vers la ligne), rangé dans l'historique de chacun.
 * Ensuite, chaque nouvelle alerte envoie son propre mail.
 */
export async function passeAlertesPrevisite(
  lignes: readonly LignePreavisAccueil[], deps: DepsAvis & { maintenant?: Date } = {},
): Promise<{ alertes: number; echecs: number; recapitulatif: boolean }> {
  const bilan = { alertes: 0, echecs: 0, recapitulatif: false };
  if (lignes.length === 0 || !(await previsiteDisponible()) || !(await mailsAvisDisponibles())) return bilan;
  const jour = await aujourdhui();
  const { rows: deja } = await query<{ deja: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM gestion_location_previsite WHERE alerte_envoyee_le IS NOT NULL) AS deja');
  const premierPassage = deja[0]?.deja !== true;
  // ① RÉSERVER chaque préavis en alerte jamais alerté.
  const reserves: { id: number; g: Groupe }[] = [];
  for (const l of lignes) {
    const r = await withTransaction(async (q) => {
      const g = await lireGroupe(q, l.occupationIds);
      if (!g.ok) return null;
      const s0 = await suiviOuvert(q, g.g.cle);
      if (s0?.alerte_envoyee_le || !enAlerte(faitsDuSuivi(g.g.recuLe, s0), jour)) return null;
      const s = await assurerSuivi(q, g.g);
      const { rows } = await q<{ id: string }>(
        'UPDATE gestion_location_previsite SET alerte_envoyee_le = now() WHERE id = $1 AND alerte_envoyee_le IS NULL RETURNING id::text', [Number(s.id)]);
      return rows.length === 0 ? null : { id: Number(s.id), g: g.g };
    });
    if (r !== null) reserves.push(r);
  }
  if (reserves.length === 0) return bilan;
  const rendre = async (ids: readonly number[]): Promise<void> => {
    for (const id of ids) await query('UPDATE gestion_location_previsite SET alerte_envoyee_le = NULL WHERE id = $1', [id]).catch(() => {});
  };
  const internes = await collaborateursInternes().catch(() => [] as string[]);
  // ② LE PREMIER PASSAGE : un seul mail récapitulatif.
  if (premierPassage) {
    const ok = await (async () => {
      const contextes = [];
      for (const r of reserves) {
        const c = await contexte(r.g.ids, AUTEUR_AUTOMATIQUE, deps);
        if (c !== null) contextes.push({ c, r });
      }
      if (contextes.length === 0 || internes.length === 0) return false;
      const premier = contextes[0];
      const m = mailPrevisite({ sorte: 'previsite_alerte', de: premier.c.expediteur, a: internes, cc: [], objet: objetRecapAlertes(contextes.length),
        paragraphes: paragraphesRecapAlertes(contextes.map(({ c, r }) => ({ adresse: c.adresse, locataires: c.locataires, recuLe: r.g.recuLe, lien: lienLignePreavis(r.g.ids[0]) }))),
        qui: { mention: MENTION_AUTOMATIQUE }, signature: premier.c.signature });
      const e = await envoyerSerie([m], premier.c.brute, { lotId: premier.c.lotId, occupationIds: premier.r.g.ids, auteur: AUTEUR_AUTOMATIQUE,
        autres: contextes.slice(1).map(({ c, r }) => ({ lotId: c.lotId, occupationIds: r.g.ids })) }, deps);
      return e.some((x) => x.envoye);
    })().catch(() => false);
    if (ok) return { alertes: reserves.length, echecs: 0, recapitulatif: true };
    await rendre(reserves.map((r) => r.id));
    return { alertes: 0, echecs: reserves.length, recapitulatif: false };
  }
  // ③ ENSUITE : chaque alerte, son propre mail.
  for (const reserve of reserves) {
    const ok = await (async () => {
      const c = await contexte(reserve.g.ids, AUTEUR_AUTOMATIQUE, deps);
      if (c === null || internes.length === 0) return false;
      const m = mailPrevisite({ sorte: 'previsite_alerte', de: c.expediteur, a: internes, cc: [], objet: objetAlertePrevisite(c.adresse),
        paragraphes: paragraphesAlertePrevisite({ adresse: c.adresse, locataires: c.locataires, recuLe: reserve.g.recuLe, dateMax: reserve.g.dateMax, lien: lienLignePreavis(reserve.g.ids[0]) }),
        qui: { mention: MENTION_AUTOMATIQUE }, signature: c.signature });
      const e = await envoyerSerie([m], c.brute, { lotId: c.lotId, occupationIds: reserve.g.ids, auteur: AUTEUR_AUTOMATIQUE }, deps);
      return e.some((x) => x.envoye);
    })().catch(() => false);
    if (ok) bilan.alertes += 1;
    else { bilan.echecs += 1; await rendre([reserve.id]); }
  }
  return bilan;
}

/**
 * L'INVITATION AU COMPTE RENDU, une fois par rendez-vous (un déplacement la remet à faire) : la fin du rendez-vous est passée, ni compte
 * rendu ni refus depuis. À : les collègues destinataires qui n'ont pas refusé (tous, si tous ont refusé), avec le lien qui ouvre la ligne.
 */
export async function passeInvitationsCompteRendu(deps: DepsAvis & { maintenant?: Date } = {}): Promise<{ invitations: number; echecs: number }> {
  const bilan = { invitations: 0, echecs: 0 };
  if (!(await previsiteDisponible()) || !(await mailsAvisDisponibles())) return bilan;
  const maintenant = deps.maintenant ?? new Date();
  const { rows } = await query<LigneSuivi>(
    `SELECT ${CHAMPS_SUIVI} FROM gestion_location_previsite s JOIN gestion_tache t ON t.id = s.tache_id
      WHERE s.clos_le IS NULL AND s.cr_invitation_le IS NULL AND s.effectuee_le IS NULL AND t.etat = 'a_faire'
        AND t.jour <= (now() AT TIME ZONE 'Europe/Paris')::date`);
  for (const s of rows) {
    const rdv = rdvDuSuivi(s);
    if (rdv === null || finDuRendezVous(rdv.jour, rdv.heure, rdv.dureeMinutes).getTime() > maintenant.getTime()) continue;
    if (statutPrevisite(faitsDuSuivi(s.recu_le, s), rdv.jour) === 'refusee') continue;
    const { rows: pris } = await query<{ id: string }>(
      'UPDATE gestion_location_previsite SET cr_invitation_le = now() WHERE id = $1 AND cr_invitation_le IS NULL RETURNING id::text', [Number(s.id)]);
    if (pris.length === 0) continue;
    const ok = await (async () => {
      const ids = s.occupation_ids.map(Number);
      const c = await contexte(ids, AUTEUR_AUTOMATIQUE, deps);
      const reponses = (await reponsesDesTaches([Number(s.tache_id)])).get(Number(s.tache_id)) ?? [];
      const gardes = reponses.filter((r) => r.statut !== 'refusee');
      const a = adressesUniques((gardes.length > 0 ? gardes : reponses).map((r) => r.email));
      if (c === null || a.length === 0) return false;
      const m = mailPrevisite({ sorte: 'previsite_invitation_cr', de: c.expediteur, a, cc: [], objet: objetInvitationCompteRendu(c.adresse, rdv),
        paragraphes: paragraphesInvitationCompteRendu({ adresse: c.adresse, locataires: c.locataires, rdv, lien: lienLignePreavis(ids[0]) }),
        qui: { mention: MENTION_AUTOMATIQUE }, signature: c.signature });
      const e = await envoyerSerie([m], c.brute, { lotId: c.lotId, occupationIds: ids, auteur: AUTEUR_AUTOMATIQUE }, deps);
      return e.some((x) => x.envoye);
    })().catch(() => false);
    if (ok) bilan.invitations += 1;
    else {
      bilan.echecs += 1;
      await query('UPDATE gestion_location_previsite SET cr_invitation_le = NULL WHERE id = $1', [Number(s.id)]).catch(() => {});
    }
  }
  return bilan;
}

/**
 * UNE PASSE DE LA MINUTERIE DU SERVEUR WEB : l'alerte du 11e jour, puis l'invitation au compte rendu. Sans la 464 : rien (`null`).
 * Ne lève jamais : une erreur est rendue, le tour de relève continue.
 */
export async function passePrevisite(deps: DepsAvis & { maintenant?: Date } = {}): Promise<{ alertes: number; invitations: number; echecs: number; recapitulatif: boolean } | null> {
  if (!(await previsiteDisponible())) return null;
  const { lignes } = await preavisEnCours();
  const a = await passeAlertesPrevisite(lignes, deps);
  const c = await passeInvitationsCompteRendu(deps);
  return { alertes: a.alertes, invitations: c.invitations, echecs: a.echecs + c.echecs, recapitulatif: a.recapitulatif };
}

