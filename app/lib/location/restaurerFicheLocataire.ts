/**
 * ══ 🔴🔴 LOT DOUBLON-RENVOI-ADHOC, POINT D (Arno, 10/11/2026) — RESTAURER LA FICHE D'UN LOCATAIRE SUPPRIMÉE AVEC SA LOCATION ══════════════
 *
 * Le cas : le 10/11/2026 à 15:09, la suppression du doublon PIEULHET (ligne de suivi 854) depuis « Suivi du mois » a aussi supprimé la fiche
 * de la locataire réelle, Stéphanie PIEULHET (n° 531), en place depuis le 10/10/2026 sur le bail 542, toujours en cours.
 *
 * CE QUI CHANGE, ET SEULEMENT CELA : la fiche du locataire redevient active — `supprime_*` vidés, et `archive_*` vidés SEULEMENT si
 * l'archivage est né de la même suppression (même instant : `marquerPersonneSupprimeeTx` archive par `coalesce`) ; un archivage antérieur
 * reste. Une ligne au journal de l'annuaire (« annuaire_restaure »). Rien d'autre : ni la ligne de suivi annulée, ni le bail, ni
 * l'occupation, ni les conditions, ni aucun mail.
 *
 * GARDES : la fiche doit être supprimée, et le locataire avoir un bail EN COURS (occupation non sortie sur un bail non clos) ; sinon refus,
 * rien n'est écrit.
 */
import type { Auteur } from '../gestion/rattachementRepo';

type Requete = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;

export interface BilanRestauration { etat: 'restauree' | 'a_restaurer' | 'refus'; motif: string | null; lignes: string[] }

export async function restaurerFicheLocataire(o: { locataireId: number; appliquer: boolean; q: Requete; auteur: Auteur }): Promise<BilanRestauration> {
  const lignes: string[] = [];
  const { rows } = await o.q(
    `SELECT l.id::int AS id, coalesce(nullif(btrim(concat_ws(' ', l.prenom, l.nom)), ''), l.nom) AS nom,
            l.supprime_le::text AS supprime_le, l.supprime_par_libelle, l.archive_le::text AS archive_le, l.archive_par_libelle,
            (l.archive_le IS NOT NULL AND l.archive_le = l.supprime_le) AS archive_de_la_suppression
       FROM gestion_annuaire_locataire l WHERE l.id = $1${o.appliquer ? ' FOR UPDATE' : ''}`, [o.locataireId]);
  const f = rows[0] as { id: number; nom: string; supprime_le: string | null; supprime_par_libelle: string | null; archive_le: string | null;
    archive_par_libelle: string | null; archive_de_la_suppression: boolean } | undefined;
  if (f === undefined) return { etat: 'refus', motif: `Locataire n° ${o.locataireId} introuvable : rien n’est écrit.`, lignes };
  lignes.push(`Fiche n° ${f.id} — ${f.nom} : supprimée le ${f.supprime_le ?? '—'} par ${f.supprime_par_libelle ?? '—'} ; archivée le ${f.archive_le ?? '—'}.`);
  if (f.supprime_le === null) return { etat: 'refus', motif: 'Cette fiche n’est pas supprimée : rien à restaurer, rien n’est écrit.', lignes };

  const baux = (await o.q(
    `SELECT o.id::int AS occupation, o.bail_id::int AS bail, o.entree::text AS entree, lo.adresse, lo.commune
       FROM gestion_annuaire_occupation o JOIN gestion_bail g ON g.id = o.bail_id JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE o.locataire_id = $1 AND o.sortie IS NULL AND o.absent_le IS NULL AND g.sortie IS NULL ORDER BY o.id`, [o.locataireId])).rows as
    { occupation: number; bail: number; entree: string; adresse: string | null; commune: string | null }[];
  if (baux.length === 0) return { etat: 'refus', motif: 'Aucun bail en cours pour ce locataire : la restauration n’est pas de ce script, rien n’est écrit.', lignes };
  for (const b of baux) lignes.push(`Bail en cours n° ${b.bail} (occupation ${b.occupation}) — ${[b.adresse, b.commune].filter(Boolean).join(', ')} — entrée le ${b.entree}.`);
  lignes.push(`→ ${o.appliquer ? 'RESTAURÉE' : 'serait restaurée'} : suppression levée${f.archive_de_la_suppression ? ', et l’archivage né de la même suppression levé' : ''}`
    + `${f.archive_le !== null && !f.archive_de_la_suppression ? ' ; un archivage antérieur RESTE' : ''}. Rien d’autre ne change.`);
  if (!o.appliquer) return { etat: 'a_restaurer', motif: null, lignes };

  await o.q(
    `UPDATE gestion_annuaire_locataire
        SET supprime_le = NULL, supprime_par = NULL, supprime_par_libelle = NULL,
            archive_le = CASE WHEN archive_le = supprime_le THEN NULL ELSE archive_le END,
            archive_par_libelle = CASE WHEN archive_le = supprime_le THEN NULL ELSE archive_par_libelle END
      WHERE id = $1 AND supprime_le IS NOT NULL`, [o.locataireId]);
  await o.q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('annuaire', $1, 'annuaire_restaure', 'supprimée', NULL, $2, $3, $4)`,
    [o.locataireId, `fiche restaurée (bail ${baux.map((b) => b.bail).join(', ')} en cours) : elle avait été supprimée avec la ligne de suivi d’une `
      + 'location (Suivi du mois) ; rien d’autre ne change (décision d’Arno du 10/11/2026)', o.auteur.id, o.auteur.libelle]);
  return { etat: 'restauree', motif: null, lignes };
}
