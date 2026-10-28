import { query, withTransaction } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import type { Auteur } from '../../gestion/gestes';
import type { Issue } from '../locationRepo';
import { normaliserLibelle, type AliasNegociateur, type CompteNegociateur } from './negociateurIdentite';

/**
 * ══ 🔴🔴 Arno (26/10/2026, migration 432) — LES COMPTES COLLABORATEURS ET LES RATTACHEMENTS DE LIBELLÉS (« Négociateurs à rapprocher ») ═══
 * Lecture des comptes (nom, prénom, adresse) et des rattachements vivants ; « Rattacher » / « Détacher » un libellé à la main : une ligne
 * datée et signée, jamais effacée (détacher = `retire_le`), et une ligne au journal (`gestion_journal`, sur la 1re ligne de suivi du
 * libellé). Sans la migration 432 : aucun rattachement manuel (les correspondances sans ambiguïté valent quand même), gestes refusés.
 */
export function aliasNegociateurDisponible(): Promise<boolean> { return colonneExisteMemo('gestion_location_negociateur_alias', 'compte_id'); }

export async function lireComptesNegociateurs(): Promise<CompteNegociateur[]> {
  const { rows } = await query<{ id: string; identifiant: string; prenom: string | null; nom: string | null }>(
    // 🔴 LOT P — un OBSERVATEUR n'est jamais négociateur (statut lu via to_jsonb : sans la migration 439, personne n'est exclu).
    "SELECT id::text, identifiant, prenom, nom FROM admin_utilisateur u WHERE coalesce(to_jsonb(u) ->> 'statut', '') <> 'observateur' ORDER BY id");
  return rows.map((r) => ({ id: Number(r.id), identifiant: r.identifiant, prenom: r.prenom, nom: r.nom }));
}

export async function lireAliasNegociateurs(): Promise<AliasNegociateur[]> {
  if (!(await aliasNegociateurDisponible())) return [];
  const { rows } = await query<{ n: string; libelle: string; compte_id: string }>(
    'SELECT libelle_normalise AS n, libelle, compte_id::text FROM gestion_location_negociateur_alias WHERE retire_le IS NULL ORDER BY id');
  return rows.map((r) => ({ libelleNormalise: r.n, libelle: r.libelle, compteId: Number(r.compte_id) }));
}

async function journaliser(q: (sql: string, p?: unknown[]) => Promise<unknown>, libelle: string, commentaire: string, auteur: Auteur): Promise<void> {
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
           SELECT 'location_activite', a.id, 'location_negociateur_rattachement', NULL, $2, $3, $4, $5
             FROM gestion_location_activite a WHERE lower(btrim(a.negociateur_libelle)) = lower(btrim($1)) ORDER BY a.id LIMIT 1`,
    [libelle, libelle, commentaire, auteur.id, auteur.libelle]);
}

/** « Rattacher » : le libellé texte devient ce compte (un rattachement vivant à la fois par libellé ; le précédent est retiré). */
export async function rattacherNegociateur(libelle: unknown, compteId: unknown, auteur: Auteur): Promise<Issue<{ phrase: string }>> {
  if (!(await aliasNegociateurDisponible())) return { etat: 'sans_schema' };
  const texte = typeof libelle === 'string' ? libelle.trim().slice(0, 200) : '';
  const id = Number(compteId);
  if (texte === '' || !Number.isSafeInteger(id) || id <= 0) return { etat: 'refus', motif: 'Choisissez le libellé et le compte.' };
  const c = (await query<{ nom: string }>(`SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS nom FROM admin_utilisateur WHERE id = $1`, [id])).rows[0];
  if (c === undefined) return { etat: 'refus', motif: 'Ce compte n’existe pas.' };
  const phrase = `négociateur « ${texte} » rattaché au compte ${c.nom}`;
  await withTransaction(async (q) => {
    await q('UPDATE gestion_location_negociateur_alias SET retire_le = now(), retire_par_libelle = $2 WHERE libelle_normalise = $1 AND retire_le IS NULL', [normaliserLibelle(texte), auteur.libelle]);
    await q('INSERT INTO gestion_location_negociateur_alias (libelle_normalise, libelle, compte_id, pose_par_libelle) VALUES ($1, $2, $3, $4)', [normaliserLibelle(texte), texte, id, auteur.libelle]);
    await journaliser(q, texte, phrase, auteur);
  });
  return { etat: 'ok', data: { phrase } };
}

/** « Détacher » : le rattachement manuel est retiré (daté, signé) ; le libellé reprend sa règle (correspondance sûre, ou « à rapprocher »). */
export async function detacherNegociateur(libelle: unknown, auteur: Auteur): Promise<Issue<{ phrase: string }>> {
  if (!(await aliasNegociateurDisponible())) return { etat: 'sans_schema' };
  const texte = typeof libelle === 'string' ? libelle.trim().slice(0, 200) : '';
  if (texte === '') return { etat: 'refus', motif: 'Libellé manquant.' };
  const phrase = `négociateur « ${texte} » détaché de son compte`;
  const n = await withTransaction(async (q) => {
    const { rows } = await q<{ id: string }>('UPDATE gestion_location_negociateur_alias SET retire_le = now(), retire_par_libelle = $2 WHERE libelle_normalise = $1 AND retire_le IS NULL RETURNING id::text', [normaliserLibelle(texte), auteur.libelle]);
    if (rows.length > 0) await journaliser(q, texte, phrase, auteur);
    return rows.length;
  });
  return n === 0 ? { etat: 'refus', motif: 'Aucun rattachement manuel pour ce libellé.' } : { etat: 'ok', data: { phrase } };
}
