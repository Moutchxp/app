// ══ 🔴 TRANSACTION / MON ESPACE (Arno, 05/11/2026) — LE COMPTE DU NÉGOCIATEUR, POSÉ SUR LA LIGNE QUAND IL EST SÛR (migration 458) ══════════
// Une ligne de commission ou une rétrocession désignait son négociateur par un TEXTE seulement ; « Mon espace » le rapprochait d'un compte à
// chaque lecture, et un second compte au même nom rendait tout ambigu (l'espace de Pierre Thevenin, vide). Désormais la ligne porte AUSSI le
// compte, quand il est SÛR, selon LA règle d'Arno du 26/10/2026 (`rattacherLibelle`) : un rattachement posé à la main, ou un libellé égal au
// « prénom nom », « nom prénom » ou à l'adresse d'UN SEUL compte. Un prénom seul (« PIERRE »), un homonyme, un libellé inconnu : AUCUN compte
// posé — on ne devine pas. Le texte d'origine n'est jamais touché ; une case déjà remplie n'est jamais écrasée.
// Pas de `import 'server-only'` (même convention que les dépôts de la Transaction, lus par les épreuves et le script).
import { query, type RequeteTx } from '../db/client';
import { rattacherLibelle, type AliasNegociateur, type CompteNegociateur } from '../location/suivi/negociateurIdentite';
import { lireAliasNegociateurs, lireComptesNegociateurs } from '../location/suivi/negociateurIdentiteRepo';
import { colonneExisteMemo } from '../location/sondeLocation';

/** La migration 458 est-elle appliquée ? Sans elle : rien n'est posé, la lecture se fait par le texte, comme avant. */
export const negociateurCompteDisponible = (): Promise<boolean> => colonneExisteMemo('transaction_vente_ligne', 'compte_id');

/** Le compte SÛR d'un libellé (rattachement d'Arno, nom exact ou adresse d'un seul compte) ; `null` sinon. PUR. */
export function compteSurDuLibelle(libelle: string, comptes: readonly CompteNegociateur[], alias: readonly AliasNegociateur[]): number | null {
  const r = rattacherLibelle(libelle, comptes, alias);
  return r.sorte === 'compte' || r.sorte === 'alias' || r.sorte === 'auto' ? r.compteId : null;
}

/** La correspondance libellé → compte sûr de ces libellés (les autres absents). PUR. */
export function correspondancesSures(libelles: readonly unknown[], comptes: readonly CompteNegociateur[], alias: readonly AliasNegociateur[]): { libelle: string; compteId: number }[] {
  const out: { libelle: string; compteId: number }[] = [];
  for (const l of [...new Set(libelles)]) {
    if (typeof l !== 'string' || l.trim() === '') continue;
    const id = compteSurDuLibelle(l, comptes, alias);
    if (id !== null) out.push({ libelle: l, compteId: id });
  }
  return out;
}

/**
 * APRÈS UNE SAISIE (dans sa transaction) : pose le compte SÛR sur les lignes de ces ventes et sur ces rétrocessions dont la case est vide.
 * Sans la migration 458 : rien. Ne remplit jamais une case déjà remplie, ne touche jamais au texte. Rend le nombre de lignes rattachées.
 */
export async function relierComptesSurs(q: RequeteTx, o: { venteIds?: readonly number[]; retroIds?: readonly number[] }): Promise<number> {
  const ventes = [...new Set(o.venteIds ?? [])];
  const retros = [...new Set(o.retroIds ?? [])];
  if ((ventes.length === 0 && retros.length === 0) || !(await negociateurCompteDisponible())) return 0;
  // Une lecture des comptes impossible ne fait JAMAIS échouer la saisie : la ligne garde son texte, comme avant.
  const lus = await Promise.all([lireComptesNegociateurs(), lireAliasNegociateurs().catch(() => [])]).catch(() => null);
  if (lus === null || !Array.isArray(lus[0])) return 0;
  const [comptes, alias] = lus;
  let n = 0;
  if (ventes.length > 0) {
    const { rows } = await q<{ negociateur: string }>(
      'SELECT DISTINCT negociateur FROM transaction_vente_ligne WHERE vente_id = ANY($1::bigint[]) AND compte_id IS NULL', [ventes]);
    const m = correspondancesSures(rows.map((r) => r.negociateur), comptes, alias);
    if (m.length > 0) {
      const r = await q(
        `UPDATE transaction_vente_ligne l SET compte_id = c.compte_id
           FROM jsonb_to_recordset($2::jsonb) AS c(libelle text, compte_id bigint)
          WHERE l.vente_id = ANY($1::bigint[]) AND l.compte_id IS NULL AND l.negociateur = c.libelle`,
        [ventes, JSON.stringify(m.map((x) => ({ libelle: x.libelle, compte_id: x.compteId })))]);
      n += r.rowCount ?? 0;
    }
  }
  if (retros.length > 0) {
    const { rows } = await q<{ negociateur: string }>(
      'SELECT DISTINCT negociateur FROM transaction_retrocession WHERE id = ANY($1::bigint[]) AND compte_id IS NULL', [retros]);
    const m = correspondancesSures(rows.map((r) => r.negociateur), comptes, alias);
    if (m.length > 0) {
      const r = await q(
        `UPDATE transaction_retrocession t SET compte_id = c.compte_id
           FROM jsonb_to_recordset($2::jsonb) AS c(libelle text, compte_id bigint)
          WHERE t.id = ANY($1::bigint[]) AND t.compte_id IS NULL AND t.negociateur = c.libelle`,
        [retros, JSON.stringify(m.map((x) => ({ libelle: x.libelle, compte_id: x.compteId })))]);
      n += r.rowCount ?? 0;
    }
  }
  return n;
}

/** Le plan du script de rattachement des lignes EXISTANTES : par libellé, le nombre de lignes et le compte sûr (ou la raison). LECTURE SEULE. */
export async function planRattachementExistant(): Promise<{ table: 'ligne' | 'retrocession'; libelle: string; lignes: number; compteId: number | null; raison: string }[]> {
  if (!(await negociateurCompteDisponible())) return [];
  const [comptes, alias] = await Promise.all([lireComptesNegociateurs(), lireAliasNegociateurs().catch(() => [])]);
  const lus = await Promise.all([
    query<{ libelle: string; n: string }>(`SELECT negociateur AS libelle, count(*)::text AS n FROM transaction_vente_ligne WHERE retire_le IS NULL AND compte_id IS NULL GROUP BY 1 ORDER BY 1`),
    query<{ libelle: string; n: string }>(`SELECT negociateur AS libelle, count(*)::text AS n FROM transaction_retrocession WHERE retire_le IS NULL AND compte_id IS NULL GROUP BY 1 ORDER BY 1`),
  ]);
  return (['ligne', 'retrocession'] as const).flatMap((table, i) => lus[i].rows.map((r) => {
    const x = rattacherLibelle(r.libelle, comptes, alias);
    const compteId = x.sorte === 'compte' || x.sorte === 'alias' || x.sorte === 'auto' ? x.compteId : null;
    const raison = compteId !== null ? (x.sorte === 'alias' ? 'rattachement posé par Arno' : 'nom exact ou adresse d’un seul compte')
      : x.sorte === 'ambigu' ? `ambigu : comptes ${x.candidats.join(', ')}` : 'aucun compte sûr (prénom seul, nom inconnu ou sans compte)';
    return { table, libelle: r.libelle, lignes: Number(r.n), compteId, raison };
  }));
}
