import { query } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { occupationEnPlace } from './lotsVacants';
import { nomLocataireAffiche } from './nomsPreavis';
import type { BienDeCopro, DetailBienCopro, PersonneDuBien } from './adressesCoproSyndic';

/**
 * ══ 🔴🔴 Arno (28/11/2026, 13h36) — LES BIENS EN GESTION D'UNE COPROPRIÉTÉ, DÉPLIÉS SOUS LE TOTAL ══════════════════════════════════════════════════════
 * « ce total est un lien qui déploie la liste des biens en gestion concernés […] à gauche propriétaire(s) au format « NOM Prénom / NOM Prénom » […] au
 * milieu locataire(s) en place, même format ; bien sans locataire : « Vacant » ; à droite un bouton « Historique ». » Pour chaque bien (son lot de tête et
 * ses annexes rattachées) : les propriétaires du lot de tête (le propriétaire de la fiche, puis les copropriétaires en cours, cartes non supprimées) ; les
 * locataires EN PLACE aujourd'hui sur l'un de ses lots (la règle de `occupationEnPlace`) ; le n° de lot de copropriété, le bâtiment et l'étage du lot de
 * tête, s'ils existent. LECTURE SEULE.
 */
export async function detaillerBiensCopro(biens: readonly BienDeCopro[], aujourdhui: string): Promise<Record<number, DetailBienCopro>> {
  const teteIds = [...new Set(biens.map((b) => b.teteId))];
  const lotIds = [...new Set(biens.flatMap((b) => b.lotIds))];
  if (teteIds.length === 0) return {};
  const col = async (c: string): Promise<string> => ((await colonneExisteMemo('gestion_annuaire_lot', c)) ? `nullif(btrim(lo.${c}), '')` : 'NULL::text');
  const indivision = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'proprietaire_id');
  const { rows: lots } = await query<{ id: string; lot: string | null; batiment: string | null; etage: string | null }>(
    `SELECT lo.id::text, ${await col('num_lot_copro')} AS lot, ${await col('batiment')} AS batiment, ${await col('etage')} AS etage
       FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[])`, [teteIds]);
  const { rows: proprios } = await query<{ lot_id: string; id: string; nom: string | null; prenom: string | null; complet: string | null }>(
    `SELECT x.lot_id::text, p.id::text, nullif(btrim(p.nom), '') AS nom, nullif(btrim(p.prenom), '') AS prenom, nullif(btrim(p.nom_complet), '') AS complet
       FROM (SELECT lo.id AS lot_id, lo.proprietaire_id AS pid, 0 AS rang FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[]) AND lo.proprietaire_id IS NOT NULL
             ${indivision ? 'UNION SELECT lp.lot_id, lp.proprietaire_id, 1 + coalesce(lp.rang, 0) FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = ANY($1::bigint[]) AND lp.jusqu_a IS NULL' : ''}) x
       JOIN gestion_annuaire_proprietaire p ON p.id = x.pid AND p.supprime_le IS NULL
      ORDER BY x.lot_id, x.rang, p.id`, [teteIds]);
  const { rows: occ } = await query<{ lot_id: string; id: string; nom: string; prenom: string | null; entree: string | null; sortie: string | null }>(
    `SELECT o.lot_id::text, l.id::text, l.nom, nullif(btrim(l.prenom), '') AS prenom, o.entree::text, o.sortie::text
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.lot_id = ANY($1::bigint[]) AND o.absent_le IS NULL
      ORDER BY o.lot_id, l.nom_normalise, o.id`, [lotIds]);
  const sansDoublon = (l: PersonneDuBien[]): PersonneDuBien[] => l.filter((x, i) => l.findIndex((y) => y.id === x.id) === i);
  const sortie: Record<number, DetailBienCopro> = {};
  for (const b of biens) {
    const l = lots.find((x) => Number(x.id) === b.teteId);
    const proprietaires = sansDoublon(proprios.filter((x) => Number(x.lot_id) === b.teteId).map((x) => ({ id: Number(x.id),
      // « NOM Prénom » quand la fiche a nom ET prénom séparés ; sinon tel qu'il est enregistré (société, nom non séparé)
      nom: x.prenom !== null && x.nom !== null ? nomLocataireAffiche({ nom: x.nom, prenom: x.prenom }) : (x.complet ?? x.nom ?? '—') })));
    const locataires = sansDoublon(occ.filter((x) => b.lotIds.includes(Number(x.lot_id)) && occupationEnPlace(x, aujourdhui))
      .map((x) => ({ id: Number(x.id), nom: nomLocataireAffiche({ nom: x.nom, prenom: x.prenom }) })));
    sortie[b.teteId] = { lotId: b.teteId, lot: l?.lot ?? null, batiment: l?.batiment ?? null, etage: l?.etage ?? null, proprietaires, locataires };
  }
  return sortie;
}
