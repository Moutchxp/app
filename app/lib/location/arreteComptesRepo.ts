import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { arreteFr, verifierArrete, type ArreteComptes, type ArreteComptesLu } from './arreteComptes';

/**
 * ══ 🔴 LA DATE D'ARRÊTÉ DES COMPTES DE LA COPROPRIÉTÉ (Arno, 23/11/2026, migration 512). IMPUR (base). ═════════════════════════════════════════
 * Lue et écrite sur `gestion_copropriete` (jour, mois, qui, quand), SONDÉE : sans la 512, rien ne s'écrit (`sans_schema`) et tout se lit
 * « non renseignée ». Chaque saisie a sa ligne au journal (entité « copropriete », avant / après, auteur figé en texte). Ordre : LIRE (FOR UPDATE)
 * → REFUSER → ÉCRIRE (`withTransaction` commite au retour normal : un refus est rendu avant la première écriture).
 */

export const arreteDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_copropriete', 'arrete_comptes_mois');

type Ligne = { jour: number | null; mois: number | null; le: string | null; par: string | null };
const versLu = (r: Ligne | undefined): ArreteComptesLu => (r === undefined || r.jour === null || r.mois === null
  ? { arrete: null, par: r?.par ?? null, le: r?.le ?? null }
  : { arrete: { jour: Number(r.jour), mois: Number(r.mois) }, par: r.par, le: r.le === null ? null : new Date(r.le).toISOString() });

/** La date d'arrêté d'une copropriété ; `null` : copropriété inconnue. Sans la 512 : non renseignée. */
export async function lireArrete(coproprieteId: number): Promise<ArreteComptesLu | null> {
  const avec = await arreteDisponible();
  const { rows } = await query<Ligne>(avec
    ? `SELECT arrete_comptes_jour AS jour, arrete_comptes_mois AS mois, arrete_comptes_le::text AS le, arrete_comptes_par_libelle AS par
         FROM gestion_copropriete WHERE id = $1`
    : 'SELECT NULL::smallint AS jour, NULL::smallint AS mois, NULL::text AS le, NULL::text AS par FROM gestion_copropriete WHERE id = $1', [coproprieteId]);
  return rows[0] === undefined ? null : versLu(rows[0]);
}

/** Les dates d'arrêté de plusieurs copropriétés (le suivi des 20 %). Sans la 512 : aucune. */
export async function arretesDe(ids: readonly number[]): Promise<Map<number, ArreteComptes>> {
  const m = new Map<number, ArreteComptes>();
  if (ids.length === 0 || !(await arreteDisponible())) return m;
  const { rows } = await query<{ id: string; jour: number; mois: number }>(
    `SELECT id::text, arrete_comptes_jour AS jour, arrete_comptes_mois AS mois FROM gestion_copropriete
      WHERE id = ANY($1::bigint[]) AND arrete_comptes_jour IS NOT NULL AND arrete_comptes_mois IS NOT NULL`, [[...ids]]);
  for (const r of rows) m.set(Number(r.id), { jour: Number(r.jour), mois: Number(r.mois) });
  return m;
}

/** ENREGISTRE (ou efface, champs vides) la date d'arrêté d'une copropriété, journalisée. */
export async function enregistrerArrete(d: { coproprieteId: unknown; jour: unknown; mois: unknown }, auteur: Auteur):
  Promise<{ etat: 'ok'; data: ArreteComptesLu } | { etat: 'refus'; motif: string } | { etat: 'inconnu' } | { etat: 'sans_schema' }> {
  if (!(await arreteDisponible())) return { etat: 'sans_schema' };
  const id = Number(d.coproprieteId);
  if (!Number.isSafeInteger(id) || id <= 0) return { etat: 'inconnu' };
  const v = verifierArrete(d.jour, d.mois);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  return withTransaction(async (q) => {
    const { rows } = await q<Ligne & { libelle: string }>(
      `SELECT libelle, arrete_comptes_jour AS jour, arrete_comptes_mois AS mois, arrete_comptes_le::text AS le, arrete_comptes_par_libelle AS par
         FROM gestion_copropriete WHERE id = $1 FOR UPDATE`, [id]);
    const r = rows[0];
    if (r === undefined) return { etat: 'inconnu' as const };
    const avant = versLu(r).arrete;
    if (arreteFr(avant) === arreteFr(v.arrete)) return { etat: 'refus' as const, motif: 'Aucun changement : cette date d’arrêté des comptes est déjà enregistrée.' };
    const { rows: apres } = await q<Ligne>(
      `UPDATE gestion_copropriete SET arrete_comptes_jour = $2, arrete_comptes_mois = $3, arrete_comptes_le = now(), arrete_comptes_par_libelle = $4
        WHERE id = $1 RETURNING arrete_comptes_jour AS jour, arrete_comptes_mois AS mois, arrete_comptes_le::text AS le, arrete_comptes_par_libelle AS par`,
      [id, v.arrete?.jour ?? null, v.arrete?.mois ?? null, auteur.libelle]);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('copropriete', $1, 'copropriete_arrete_comptes', $2, $3, $4, $5, $6)`,
      [id, avant === null ? null : arreteFr(avant), v.arrete === null ? null : arreteFr(v.arrete),
        `date d’arrêté des comptes de « ${r.libelle} » : ${arreteFr(avant)} → ${arreteFr(v.arrete)}`, auteur.id, auteur.libelle]);
    return { etat: 'ok' as const, data: versLu(apres[0]) };
  });
}

/**
 * 🔴 (Arno, 23/11/2026) la date d'arrêté saisie dans une fiche Copropriété NOUVELLE : écrite DANS LA TRANSACTION qui crée la copropriété (tout ou
 * rien), journalisée comme une saisie ordinaire. Rien à écrire : rien n'est écrit. Sans la 512 : rien (la fiche ne la propose pas).
 */
export async function ecrireArreteDans(q: RequeteTx, coproprieteId: number | string, arrete: ArreteComptes | null, auteur: Auteur): Promise<void> {
  if (arrete === null || !(await arreteDisponible())) return;
  const { rows } = await q<Ligne & { libelle: string }>(
    `SELECT libelle, arrete_comptes_jour AS jour, arrete_comptes_mois AS mois, arrete_comptes_le::text AS le, arrete_comptes_par_libelle AS par
       FROM gestion_copropriete WHERE id = $1 FOR UPDATE`, [coproprieteId]);
  const r = rows[0];
  if (r === undefined) return;
  const avant = versLu(r).arrete;
  if (arreteFr(avant) === arreteFr(arrete)) return;
  await q(`UPDATE gestion_copropriete SET arrete_comptes_jour = $2, arrete_comptes_mois = $3, arrete_comptes_le = now(), arrete_comptes_par_libelle = $4 WHERE id = $1`,
    [coproprieteId, arrete.jour, arrete.mois, auteur.libelle]);
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('copropriete', $1, 'copropriete_arrete_comptes', $2, $3, $4, $5, $6)`,
    [coproprieteId, avant === null ? null : arreteFr(avant), arreteFr(arrete), `date d’arrêté des comptes de « ${r.libelle} » : ${arreteFr(avant)} → ${arreteFr(arrete)} (à la création de la fiche)`, auteur.id, auteur.libelle]);
}
