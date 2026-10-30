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
export interface FicheStatut { id: number; libelle: string; libelleNormalise: string; statut: StatutSansCompte; note: string | null; poseLe: string; posePar: string }

export function statutSansCompteDisponible(): Promise<boolean> { return colonneExisteMemo('transaction_negociateur_statut', 'libelle_normalise'); }

/** Les fiches vivantes (une par libellé normalisé). Sans la migration 444 : aucune. LECTURE SEULE. */
export async function lireFichesStatut(): Promise<FicheStatut[]> {
  if (!(await statutSansCompteDisponible())) return [];
  const { rows } = await query<{ id: string; libelle: string; n: string; statut: string; note: string | null; le: string; par: string }>(
    `SELECT id::text, libelle, libelle_normalise AS n, statut, note, pose_le::text AS le, pose_par_libelle AS par
       FROM transaction_negociateur_statut WHERE retire_le IS NULL ORDER BY libelle_normalise`);
  return rows.flatMap((r) => { const s = statutLu(r.statut); return estStatutSansCompte(s) ? [{ id: Number(r.id), libelle: r.libelle, libelleNormalise: r.n, statut: s, note: r.note, poseLe: r.le, posePar: r.par }] : []; });
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
