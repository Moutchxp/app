// Pas de `import 'server-only'` : lu par la commande `transaction:statut-negociateur` et par `repo.ts` (même convention que `repo.ts`).
import { query, withTransaction } from '../db/client';
import { colonneExisteMemo } from '../location/sondeLocation';
import { normaliserLibelle } from '../location/suivi/negociateurIdentite';
import { statutLu, type Statut } from '../admin/statut';

/**
 * ══ 🔴 LOT BX (Arno, 30/10/2026) — LE STATUT D'UN NÉGOCIATEUR SANS COMPTE (migration 444) ═══════════════════════════════════════════════════
 * Les fichiers nomment des négociateurs par un libellé (« CATHERINE », « JULIEN »…) sans compte de connexion : leur statut était « à
 * renseigner ». Une FICHE par libellé (normalisé) porte leur statut — aucun compte n'est créé. Elle ne sert QUE si le libellé ne se rapproche
 * d'aucun compte (`lireStatutsNegociateurs` : le compte fait foi). Une fiche se retire (`retire_le`), jamais supprimée ; chaque geste au journal.
 */
export type StatutSansCompte = Exclude<Statut, 'observateur'>;
export const estStatutSansCompte = (x: unknown): x is StatutSansCompte => x === 'associe' || x === 'salarie' || x === 'independant';
export interface FicheStatut { id: number; libelle: string; libelleNormalise: string; statut: StatutSansCompte; note: string | null; poseLe: string; posePar: string;
  /** 🔴 LOT CG (migration 445) — le prénom et le nom (facultatifs) ; null : non renseignés (ou base sans la 445). */
  prenom: string | null; nom: string | null }

export function statutSansCompteDisponible(): Promise<boolean> { return colonneExisteMemo('transaction_negociateur_statut', 'libelle_normalise'); }
/** 🔴 LOT CG — la migration 445 (prénom, nom) est-elle appliquée ? */
export function nomSansCompteDisponible(): Promise<boolean> { return colonneExisteMemo('transaction_negociateur_statut', 'prenom'); }

/** Les fiches vivantes (une par libellé normalisé). Sans la migration 444 : aucune. LECTURE SEULE. */
export async function lireFichesStatut(): Promise<FicheStatut[]> {
  if (!(await statutSansCompteDisponible())) return [];
  const avecNom = await nomSansCompteDisponible();
  const { rows } = await query<{ id: string; libelle: string; n: string; statut: string; note: string | null; le: string; par: string; prenom: string | null; nom: string | null }>(
    `SELECT id::text, libelle, libelle_normalise AS n, statut, note, pose_le::text AS le, pose_par_libelle AS par,
            ${avecNom ? 'prenom, nom' : 'NULL::text AS prenom, NULL::text AS nom'}
       FROM transaction_negociateur_statut WHERE retire_le IS NULL ORDER BY libelle_normalise`);
  return rows.flatMap((r) => { const s = statutLu(r.statut); return estStatutSansCompte(s) ? [{ id: Number(r.id), libelle: r.libelle, libelleNormalise: r.n, statut: s, note: r.note, poseLe: r.le, posePar: r.par,
    prenom: r.prenom?.trim() || null, nom: r.nom?.trim() || null }] : []; });
}

/** Le statut de la fiche d'un libellé (normalisé), ou null. PUR. */
export const statutDeFiche = (fiches: readonly Pick<FicheStatut, 'libelleNormalise' | 'statut'>[], libelle: string): StatutSansCompte | null =>
  fiches.find((f) => f.libelleNormalise === normaliserLibelle(libelle))?.statut ?? null;

/**
 * Poser (ou changer) le statut d'un libellé : la fiche vivante précédente est retirée (datée, signée), la nouvelle posée, le geste journalisé
 * (`transaction_journal`, entité « negociateur_statut »). Rien n'est supprimé. Un statut identique déjà posé : rien n'est écrit.
 */
export async function poserStatutSansCompte(o: { libelle: string; statut: StatutSansCompte; note: string | null; auteur: string }): Promise<{ ok: true; id: number | null } | { ok: false; motif: string }> {
  if (!(await statutSansCompteDisponible())) return { ok: false, motif: 'migration 444 absente : rien n’est écrit.' };
  const libelle = o.libelle.trim();
  const n = normaliserLibelle(libelle);
  if (n === '' || !estStatutSansCompte(o.statut)) return { ok: false, motif: 'libellé ou statut invalide : rien n’est écrit.' };
  return withTransaction(async (q) => {
    const { rows: avant } = await q<{ id: string; statut: string }>('SELECT id::text, statut FROM transaction_negociateur_statut WHERE libelle_normalise = $1 AND retire_le IS NULL FOR UPDATE', [n]);
    if (avant[0]?.statut === o.statut) return { ok: true as const, id: null };
    const journal = (id: number, action: string, av: unknown, ap: unknown) => q(
      `INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, auteur_id, auteur_libelle) VALUES ('negociateur_statut', $1, $2, $3::jsonb, $4::jsonb, $5, NULL, $6)`,
      [id, action, av === null ? null : JSON.stringify(av), ap === null ? null : JSON.stringify(ap), `statut du négociateur « ${libelle} » (sans compte)${o.note ? ` — ${o.note}` : ''}`, o.auteur]);
    for (const a of avant) {
      await q('UPDATE transaction_negociateur_statut SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', [a.id, o.auteur]);
      await journal(Number(a.id), 'retirer', { libelle, statut: a.statut }, null);
    }
    const { rows } = await q<{ id: string }>(
      'INSERT INTO transaction_negociateur_statut (libelle, libelle_normalise, statut, note, pose_par_libelle) VALUES ($1, $2, $3, $4, $5) RETURNING id::text',
      [libelle, n, o.statut, o.note, o.auteur]);
    const id = Number(rows[0].id);
    await journal(id, 'poser', null, { libelle, statut: o.statut });
    return { ok: true as const, id };
  });
}

/**
 * 🔴 LOT CG — le PRÉNOM et le NOM de la fiche vivante d'un libellé (migration 445) : mis à jour, le geste journalisé (avant / après) ; rien n'est
 * supprimé. Sans fiche pour ce libellé (son statut d'abord), ou sans la 445 : refusé, rien n'est écrit.
 */
export async function poserNomSansCompte(o: { libelle: string; prenom: string | null; nom: string | null; auteur: string }): Promise<{ ok: true; id: number } | { ok: false; motif: string }> {
  if (!(await nomSansCompteDisponible())) return { ok: false, motif: 'migration 445 absente : rien n’est écrit.' };
  const n = normaliserLibelle(o.libelle);
  const prenom = o.prenom?.trim() || null; const nom = o.nom?.trim() || null;
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; prenom: string | null; nom: string | null }>(
      'SELECT id::text, prenom, nom FROM transaction_negociateur_statut WHERE libelle_normalise = $1 AND retire_le IS NULL FOR UPDATE', [n]);
    if (rows.length === 0) return { ok: false as const, motif: `aucune fiche pour « ${o.libelle} » (poser d’abord son statut) : rien n’est écrit.` };
    const id = Number(rows[0].id);
    await q('UPDATE transaction_negociateur_statut SET prenom = $2, nom = $3 WHERE id = $1', [id, prenom, nom]);
    await q(`INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, auteur_id, auteur_libelle) VALUES ('negociateur_statut', $1, 'nommer', $2::jsonb, $3::jsonb, $4, NULL, $5)`,
      [id, JSON.stringify({ prenom: rows[0].prenom, nom: rows[0].nom }), JSON.stringify({ prenom, nom }), `nom du négociateur « ${o.libelle} » (sans compte)`, o.auteur]);
    return { ok: true as const, id };
  });
}
