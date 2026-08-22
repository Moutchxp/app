/**
 * R5c — actions MANUELLES sur les brouillons de relance : ÉDITER (objet/corps), ABANDONNER, RÉGÉNÉRER. Écrit UNIQUEMENT
 * demande_relance et demande_journal ; ne touche JAMAIS demande.statut. Réutilise le texte pur `genererRelance` (relance.ts)
 * et les chargeurs de contexte/lot de relanceAuto.ts — aucune duplication. AUCUN envoi (la relance reste un brouillon).
 * Écritures TRANSACTIONNELLES dès qu'elles touchent plusieurs tables. Le texte STOCKÉ est la vérité : rien ne le régénère
 * dans le dos de l'utilisateur (seul le geste explicite « régénérer » en refait un, et il abandonne d'abord l'ancien).
 */
import { query, withTransaction } from '../db/client';
import { echeanceDe } from './echeance';
import { genererRelance, DELAI_SAISINE_JOURS } from './relance';
import { chargerContexteRelance, chargerLotRelance, type ContexteRelance, type LotRelance } from './relanceAuto';
import type { ProfilDemandeur } from '../sitadel/demande';

/** Action de relance impossible (brouillon inexistant, demande non 'envoyee', date d'envoi inconnue…) — raison exposée. */
export class RelanceActionError extends Error {
  constructor(public readonly raison: string) { super(raison); this.name = 'RelanceActionError'; }
}

/** L'essentiel d'une relance pour les gardes-fous. */
export interface RelanceLigne { demandeId: number; profil: ProfilDemandeur; statut: string }

/** Lit demande_id + profil + statut d'une relance. `null` si absente. */
export async function lireRelance(relanceId: number): Promise<RelanceLigne | null> {
  const { rows } = await query<{ demande_id: number; profil_demandeur: string; statut: string }>(
    `SELECT demande_id::int AS demande_id, profil_demandeur, statut FROM demande_relance WHERE id = $1`, [relanceId]);
  const r = rows[0];
  if (!r) return null;
  const profil: ProfilDemandeur = r.profil_demandeur === 'personne' ? 'personne' : 'entreprise'; // garde : liste fermée
  return { demandeId: r.demande_id, profil, statut: r.statut };
}

/**
 * Édite l'objet + le corps d'un brouillon de relance. Le texte stocké EST la vérité (aucune régénération implicite).
 * Garde-fou : uniquement sur un 'brouillon'. Journalisé (auteur + motif lisible). Renvoie false si aucun brouillon n'a bougé.
 */
export async function majRelance(relanceId: number, objet: string, corps: string, auteur: string | null): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q<{ demande_id: number }>(
      `UPDATE demande_relance SET objet = $2, corps = $3 WHERE id = $1 AND statut = 'brouillon' RETURNING demande_id`,
      [relanceId, objet, corps]);
    const row = res.rows[0];
    if (!row) return false;
    await q(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [row.demande_id, `relance ${relanceId} : objet/corps édités à la main`, auteur]);
    return true;
  });
}

/**
 * Abandonne une relance (statut → 'abandonnee') SANS en produire de nouvelle. Dès lors l'auto ne régénère plus (relanceExiste
 * voit la ligne abandonnée — changement de règle R5c). Idempotent (WHERE statut <> 'abandonnee'). Journalisé. false si rien.
 */
export async function abandonnerRelance(relanceId: number, auteur: string | null): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q<{ demande_id: number }>(
      `UPDATE demande_relance SET statut = 'abandonnee' WHERE id = $1 AND statut <> 'abandonnee' RETURNING demande_id`,
      [relanceId]);
    const row = res.rows[0];
    if (!row) return false;
    await q(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [row.demande_id, `relance ${relanceId} abandonnée à la main`, auteur]);
    return true;
  });
}

/** Données ACTUELLES de la demande nécessaires à la régénération (statut = garde, référence + date d'envoi = faits passés). */
export interface DemandeRegen { statut: string; reference: string; envoyeLe: Date | null }

/** Lectures de la régénération, INJECTABLES (test node-pur sans re-mocker la config de veille). */
export interface DepsRegenerer {
  lireRelance(relanceId: number): Promise<RelanceLigne | null>;
  lireDemande(demandeId: number): Promise<DemandeRegen | null>;
  chargerContexte(profil: ProfilDemandeur): Promise<ContexteRelance>;
  chargerLot(demandeId: number): Promise<LotRelance | null>;
}

/** Implémentations réelles des lectures de régénération. */
export function depsReellesRegenerer(): DepsRegenerer {
  return {
    lireRelance,
    lireDemande: async (demandeId) => {
      const { rows } = await query<{ statut: string; reference: string; envoye_le: Date | null }>(
        `SELECT d.statut, d.reference, min(a.envoye_le) AS envoye_le
           -- B2 : ancre d'échéance agnostique au canal (un dépôt téléservice écrit canal='formulaire', pas 'email')
           FROM demande d LEFT JOIN demande_acheminement a ON a.demande_id = d.id
          WHERE d.id = $1 GROUP BY d.statut, d.reference`,
        [demandeId]);
      const r = rows[0];
      return r ? { statut: r.statut, reference: r.reference, envoyeLe: r.envoye_le } : null;
    },
    chargerContexte: (profil) => chargerContexteRelance(profil),
    chargerLot: (demandeId) => chargerLotRelance(demandeId),
  };
}

/**
 * Régénère une relance : abandonne le brouillon COURANT et en produit IMMÉDIATEMENT un nouveau depuis les données ACTUELLES
 * (via genererRelance → ne liste QUE les dossiers encore dus). Abandon PUIS insertion dans la MÊME transaction : l'unique
 * partiel `demande_relance_vivante_uniq` (076) interdit deux relances vivantes. Gardes-fous : relance en 'brouillon', demande
 * 'envoyee' (on ne régénère pas pour une close/abandonnée — la clôture empêche toute relance), date d'envoi connue. Renvoie
 * l'id de la NOUVELLE relance. Lève RelanceActionError, ou IdentiteIncompleteError / AucunDossierNonSatisfaitError (relance.ts).
 */
export async function regenererRelance(relanceId: number, auteur: string | null, deps: DepsRegenerer = depsReellesRegenerer()): Promise<number> {
  const rel = await deps.lireRelance(relanceId);
  if (!rel) throw new RelanceActionError('relance introuvable');
  if (rel.statut !== 'brouillon') throw new RelanceActionError(`relance « ${rel.statut} » : seule une relance en brouillon peut être régénérée`);

  const dem = await deps.lireDemande(rel.demandeId);
  if (!dem) throw new RelanceActionError('demande introuvable');
  if (dem.statut !== 'envoyee') throw new RelanceActionError(`demande « ${dem.statut} » : régénération impossible (la clôture empêche toute relance)`);
  if (dem.envoyeLe === null) throw new RelanceActionError('date d’envoi inconnue : régénération impossible');

  const ctx = await deps.chargerContexte(rel.profil);
  const lot = await deps.chargerLot(rel.demandeId);
  if (lot === null) throw new RelanceActionError('demande introuvable');

  // genererRelance lève IdentiteIncompleteError / AucunDossierNonSatisfaitError (relance.ts) — laissées remonter à la route.
  // Variante 'saisine' (équivalent sémantique de l'ancienne 'formelle'). Le choix réel de variante et l'historique sont le lot 3.
  const echeanceLe = echeanceDe(dem.envoyeLe);
  const { objet, corps } = genererRelance({
    reference: dem.reference, profil: rel.profil, lot: lot.lot, dossiersSatisfaitsIds: lot.satisfaitsIds,
    config: ctx.config, pieces: ctx.pieces, envoyeeLe: dem.envoyeLe, echeanceLe,
    saisineLe: new Date(echeanceLe.getTime() + DELAI_SAISINE_JOURS * 86_400_000), adresseReponse: ctx.adresseReponse,
  }, 'saisine');

  return withTransaction(async (q) => {
    // Abandon D'ABORD : sinon l'INSERT 'brouillon' violerait demande_relance_vivante_uniq (une seule relance vivante par demande).
    await q(`UPDATE demande_relance SET statut = 'abandonnee' WHERE id = $1 AND statut = 'brouillon'`, [relanceId]);
    const ins = await q<{ id: number }>(
      // Cascade lot 2 — variante='saisine' à la création (CHECK élargi, migration 136) : l'écart transitoire du lot 1 est
      //   refermé. Le choix réel de variante selon la position dans le délai (rappel/avis/saisine) est le lot 3.
      `INSERT INTO demande_relance (demande_id, type, variante, objet, corps, profil_demandeur, statut)
       VALUES ($1, 'relance', 'saisine', $2, $3, $4, 'brouillon') RETURNING id`,
      [rel.demandeId, objet, corps, rel.profil]);
    const nouvelId = ins.rows[0].id;
    await q(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [rel.demandeId, `relance ${relanceId} régénérée à la main → nouvelle relance ${nouvelId}`, auteur]);
    return nouvelId;
  });
}
