import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { LIBELLE_MANDAT } from './mandatBien';
import { formeMandat } from './mandatParBien';
import { COLONNES_MANDAT_BIEN, mandatParBienDisponible } from './mandatParBienRepo';
import type { BienLu, PlanReprise, ProprietaireLu } from './repriseMandatsParBien';

/**
 * ══ 🔴🔴 LA REPRISE DES N° DE MANDAT SUR LES BIENS — LECTURE ET ÉCRITURE (Arno, 18/11/2026, « Mandat par bien », lot 3). IMPUR (base). ═════════════
 * Le plan est `planRepriseMandats` (pur). L'écriture ne remplit QUE des n° vides (`… IS NULL`), une ligne au journal de chaque bien ; aucun DELETE, la
 * fiche des propriétaires n'est jamais touchée. Refus sans la 492. Décision d'Arno : « Le script de reprise reste à blanc par défaut ».
 */
export async function lirePourReprise(): Promise<{ proprietaires: ProprietaireLu[]; biens: BienLu[] }> {
  const col = async (c: string): Promise<string> => ((await colonneExisteMemo('gestion_annuaire_proprietaire', c)) ? `p.${c}` : 'NULL');
  const { rows: p } = await query<{ id: string; nom: string | null; mg: string | null; dg: string | null; mt: string | null; dt: string | null }>(
    `SELECT p.id::text, coalesce(p.nom_complet, p.nom) AS nom, ${await col('numero_mandat_gestion')}::text AS mg, ${await col('mandat_gestion_signe_le')}::text AS dg,
            ${await col('numero_mandat_transaction')}::text AS mt, ${await col('mandat_transaction_signe_le')}::text AS dt
       FROM gestion_annuaire_proprietaire p ORDER BY p.id`);
  const proprietaires = p.filter((x) => (x.mg ?? '').trim() !== '' || (x.mt ?? '').trim() !== '')
    .map((x) => ({ id: Number(x.id), nom: x.nom ?? `Propriétaire ${x.id}`, gestion: { numero: x.mg, signeLe: x.dg }, transaction: { numero: x.mt, signeLe: x.dt } }));
  const avec492 = await mandatParBienDisponible();
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'lot_id');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const m = (c: string): string => (avec492 ? `l.${c}` : 'NULL');
  const { rows: b } = await query<{ id: string; adresse: string | null; cp: string | null; commune: string | null; statut: string | null; annexe: boolean; proprios: string[];
    mg: string | null; dg: string | null; mt: string | null; dt: string | null }>(
    `SELECT l.id::text, l.adresse, l.code_postal AS cp, l.commune, l.statut_bien AS statut,
            EXISTS (SELECT 1 FROM gestion_lot_annexe ax WHERE ax.annexe_id = l.id${avecDetache ? ' AND l.annexe_detachee_le IS NULL' : ''}) AS annexe,
            ARRAY(SELECT x::text FROM (SELECT l.proprietaire_id AS x WHERE l.proprietaire_id IS NOT NULL
              ${avecCo ? 'UNION SELECT lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = l.id AND lp.jusqu_a IS NULL' : ''}) s) AS proprios,
            ${m('mandat_gestion_numero')}::text AS mg, ${m('mandat_gestion_signe_le')}::text AS dg, ${m('mandat_transaction_numero')}::text AS mt, ${m('mandat_transaction_signe_le')}::text AS dt
       FROM gestion_annuaire_lot l WHERE l.absent_le IS NULL ORDER BY l.id`);
  const biens = b.map((x) => ({
    lotId: Number(x.id), statut: x.statut, annexeRattachee: x.annexe, proprietaires: (x.proprios ?? []).map(Number),
    adresse: [x.adresse, [x.cp, x.commune].filter((y) => (y ?? '').trim() !== '').join(' ')].filter((y) => (y ?? '').trim() !== '').join(', ') || `bien n° ${x.id}`,
    gestion: { numero: x.mg, signeLe: x.dg }, transaction: { numero: x.mt, signeLe: x.dt },
  }));
  return { proprietaires, biens };
}

/** ÉCRIT le plan (--reel) : seulement les n° encore vides ; une ligne au journal de chaque bien. Rend le nombre de biens écrits. */
export async function appliquerRepriseMandats(plan: PlanReprise, auteur: Auteur): Promise<{ ok: true; ecrits: number } | { ok: false; motif: string }> {
  if (!(await mandatParBienDisponible())) return { ok: false, motif: 'La migration 492 n’est pas posée sur cette base : rien n’est repris.' };
  let ecrits = 0;
  await withTransaction(async (q) => {
    for (const a of plan.affectations) {
      const c = COLONNES_MANDAT_BIEN[a.sorte];
      const { rowCount } = await q(`UPDATE gestion_annuaire_lot SET ${c.numero} = $2, ${c.normalise} = $3, ${c.date} = coalesce(${c.date}, $4::date)
                                     WHERE id = $1 AND ${c.numero} IS NULL`, [a.lotId, a.numero, formeMandat(a.numero), a.signeLe]);
      if ((rowCount ?? 0) === 0) continue;
      ecrits += 1;
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
               VALUES ('annuaire_lot', $1, $2, NULL, $3, $4, $5, $6)`,
        [a.lotId, a.sorte === 'gestion' ? 'location_numero_mandat' : 'location_numero_mandat_transaction', [a.numero, a.signeLe].filter((x) => x).join(' · '),
          `${LIBELLE_MANDAT[a.sorte]} repris de la fiche du propriétaire (${a.depuis.join(', ')}) — reprise « mandat par bien »`, auteur.id, auteur.libelle]);
    }
  });
  return { ok: true, ecrits };
}
