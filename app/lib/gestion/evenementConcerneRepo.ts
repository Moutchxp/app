import { query, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { concernesDepuisJson, type Concerne } from './locatairesEvenement';
import { evenementConcerneDisponible } from './schema';

/**
 * ══ 🔴🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — LES PERSONNES CONCERNÉES PAR UN ÉVÉNEMENT (migration 343) ═══
 *
 * Écrites UNIQUEMENT quand un humain a modifié le choix par défaut (les locataires en place) : un événement sans ligne
 * garde l'affichage d'avant, et les événements existants ne sont pas touchés. Un choix vide est dit par une ligne
 * « aucun ». Remplacer un choix date et signe les anciennes lignes (`retire_le`) : rien n'est supprimé.
 * Une partie libre est enregistrée ICI, sur l'événement : aucune fiche d'annuaire n'est créée.
 * ⚠️ PAS DE `import 'server-only'` (convention du module).
 */

/** Écrit le choix (dans la transaction de l'appelant). `brut` = ce que l'écran a envoyé ; illisible : rien. */
export async function ecrireConcernes(q: RequeteTx, evenementId: number, brut: unknown, auteur: Auteur): Promise<boolean> {
  const concernes = concernesDepuisJson(brut);
  if (concernes === null || !(await evenementConcerneDisponible())) return false;
  await q(
    `UPDATE gestion_evenement_concerne SET retire_le = now(), retire_par = $2, retire_par_libelle = $3
      WHERE evenement_id = $1 AND retire_le IS NULL`, [evenementId, auteur.id, auteur.libelle]);
  const lignes = concernes.length === 0 ? [null] : concernes;
  for (const c of lignes) {
    await q(
      `INSERT INTO gestion_evenement_concerne
         (evenement_id, sorte, locataire_id, sujet, sujet_id, nom, email, telephone, entree, sortie, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12)`,
      c === null
        ? [evenementId, 'aucun', null, null, null, '', null, null, null, null, auteur.id, auteur.libelle]
        : [evenementId, c.sorte, c.locataireId, c.sujet, c.sujetId, c.nom, c.email, c.telephone, c.entree, c.sortie, auteur.id, auteur.libelle]);
  }
  return true;
}

/**
 * Les personnes concernées de ces événements, pour ceux dont le choix a été MODIFIÉ (les autres sont absents de la
 * carte rendue : l'écran garde alors l'affichage d'avant). Un choix vide rend une liste vide. LECTURE SEULE.
 */
export async function lireConcernes(evenementIds: readonly number[]): Promise<Map<number, Concerne[]>> {
  const out = new Map<number, Concerne[]>();
  if (evenementIds.length === 0 || !(await evenementConcerneDisponible())) return out;
  const { rows } = await query<{
    evenement_id: string; sorte: string; locataire_id: string | null; sujet: string | null; sujet_id: string | null;
    nom: string; email: string | null; telephone: string | null; entree: string | null; sortie: string | null;
  }>(
    `SELECT c.evenement_id::text, c.sorte, c.locataire_id::text, c.sujet, c.sujet_id::text, c.nom, c.email, c.telephone,
            to_char(c.entree, 'YYYY-MM-DD') AS entree, to_char(c.sortie, 'YYYY-MM-DD') AS sortie
       FROM gestion_evenement_concerne c
      WHERE c.evenement_id = ANY($1::bigint[]) AND c.retire_le IS NULL
      ORDER BY c.evenement_id, c.id`, [[...evenementIds]]);
  for (const r of rows) {
    const id = Number(r.evenement_id);
    const l = out.get(id) ?? [];
    if (r.sorte !== 'aucun') {
      l.push({
        sorte: r.sorte as Concerne['sorte'], locataireId: r.locataire_id === null ? null : Number(r.locataire_id),
        sujet: r.sujet === 'proprietaire' || r.sujet === 'locataire' ? r.sujet : null, sujetId: r.sujet_id === null ? null : Number(r.sujet_id),
        nom: r.nom, email: r.email, telephone: r.telephone, entree: r.entree, sortie: r.sortie,
      });
    }
    out.set(id, l);
  }
  return out;
}

/** Remplace le choix d'un événement EXISTANT (modification de la carte). Écrit UNIQUEMENT sur ce geste. */
export async function remplacerConcernes(evenementId: number, brut: unknown, auteur: Auteur): Promise<boolean> {
  const { withTransaction } = await import('../db/client');
  return withTransaction((q) => ecrireConcernes(q, evenementId, brut, auteur));
}
