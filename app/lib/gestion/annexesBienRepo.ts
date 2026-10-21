import { query } from '../db/client';
import { colonneExisteMemo } from '../location/sondeLocation';
import { estLotAnnexe, typeDuLot, type AnnexeAffichee, type CandidatRattachement } from './annexesBien';

/**
 * ══ 🔴 LES ANNEXES D'UN BIEN, LUES POUR LA FICHE DU BIEN ET L'HISTORIQUE (Arno, 21/10/2026). LECTURE SEULE. ═════════════════════
 *
 * La liaison est `gestion_lot_annexe` (migration 372) : EN AJOUT SEUL, une ligne par annexe et pour toujours (`annexe_id` unique).
 * Le DÉTACHEMENT est la marque `annexe_detachee_le` (379) — le lien reste ; détachée, l'annexe est un bien à part entière.
 *   · ses annexes RATTACHÉES (non détachées) : les cases sous le bien ;
 *   · s'il est lui-même une annexe : son bien principal, et s'il est détaché ;
 *   · « Rattacher à un bien » : une annexe DÉTACHÉE ne peut revenir QU'À son bien d'origine (le lien ne se change pas) ; un lot
 *     de type annexe jamais lié : les biens principaux du MÊME titulaire, encore en gestion, qui ne sont pas eux-mêmes des annexes.
 */
export interface AnnexesDuLot {
  lotId: number;
  /** Le type du lot lui-même (« Logement », « Cave »…) : le compteur et la question de détachement le disent. */
  typeLot: string;
  annexes: AnnexeAffichee[];
  principal: { id: number; adresse: string | null; commune: string | null; categorie: string | null } | null;
  detachee: boolean;
  /** Le lot peut-il être rattaché (annexe détachée, ou lot de type annexe sans bien principal) ? Et à quels biens. */
  candidats: CandidatRattachement[] | null;
}

const COLONNES_ANNEXE = (a: string, avecCategorie: boolean, avecLot: boolean): string =>
  `${a}.id::text, ${avecCategorie ? `${a}.categorie, ${a}.etage` : 'NULL::text AS categorie, NULL::text AS etage'}, ${a}.nature, ${a}.type_bien,
   ${avecLot ? `${a}.porte, ${a}.num_lot_copro` : 'NULL::text AS porte, NULL::text AS num_lot_copro'}, ${a}.adresse, ${a}.commune`;

type LigneAnnexe = { id: string; categorie: string | null; etage: string | null; nature: string | null; type_bien: string | null; porte: string | null;
  num_lot_copro: string | null; adresse: string | null; commune: string | null };
const versAnnexe = (r: LigneAnnexe): AnnexeAffichee => ({ id: Number(r.id), categorie: r.categorie, etage: r.etage, nature: r.nature, typeBien: r.type_bien,
  porte: r.porte, numLotCopro: r.num_lot_copro, adresse: r.adresse, commune: r.commune });

export async function annexesDuLot(lotId: number): Promise<AnnexesDuLot | null> {
  if (!(await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'))) return null;
  const avecCategorie = await colonneExisteMemo('gestion_annuaire_lot', 'categorie');
  const avecLot = await colonneExisteMemo('gestion_annuaire_lot', 'num_lot_copro');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const { rows: lot } = await query<LigneAnnexe & { proprietaire_id: string | null; gestion_fin: string | null; detachee: boolean }>(
    `SELECT ${COLONNES_ANNEXE('lo', avecCategorie, avecLot)}, lo.proprietaire_id::text, lo.gestion_fin::text,
            ${avecDetache ? 'lo.annexe_detachee_le IS NOT NULL' : 'false'} AS detachee
       FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [lotId]);
  const l = lot[0];
  if (l === undefined) return null;
  const { rows: annexes } = await query<LigneAnnexe>(
    `SELECT ${COLONNES_ANNEXE('af', avecCategorie, avecLot)} FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot af ON af.id = ax.annexe_id
      WHERE ax.parent_id = $1${avecDetache ? ' AND af.annexe_detachee_le IS NULL' : ''} ORDER BY ax.id`, [lotId]);
  const { rows: parents } = await query<{ id: string; adresse: string | null; commune: string | null; categorie: string | null }>(
    `SELECT p.id::text, p.adresse, p.commune, ${avecCategorie ? 'p.categorie' : 'NULL::text AS categorie'} FROM gestion_lot_annexe ax
       JOIN gestion_annuaire_lot p ON p.id = ax.parent_id WHERE ax.annexe_id = $1`, [lotId]);
  const p = parents[0];
  const principal = p === undefined ? null : { id: Number(p.id), adresse: p.adresse, commune: p.commune, categorie: p.categorie };
  let candidats: CandidatRattachement[] | null = null;
  if (principal !== null && l.detachee) {
    candidats = [{ id: principal.id, adresse: principal.adresse, commune: principal.commune, categorie: principal.categorie, origine: true }];
  } else if (principal === null && estLotAnnexe(versAnnexe(l)) && l.proprietaire_id !== null) {
    const { rows: c } = await query<{ id: string; adresse: string | null; commune: string | null; categorie: string | null; nature: string | null; type_bien: string | null }>(
      `SELECT lo.id::text, lo.adresse, lo.commune, ${avecCategorie ? 'lo.categorie' : 'NULL::text AS categorie'}, lo.nature, lo.type_bien
         FROM gestion_annuaire_lot lo
        WHERE lo.proprietaire_id = $1 AND lo.id <> $2 AND lo.gestion_fin IS NULL
          AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id)
        ORDER BY lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.id`, [Number(l.proprietaire_id), lotId]);
    candidats = c.filter((x) => !estLotAnnexe({ categorie: x.categorie, nature: x.nature, typeBien: x.type_bien }))
      .map((x) => ({ id: Number(x.id), adresse: x.adresse, commune: x.commune, categorie: x.categorie, origine: false }));
  }
  return { lotId, typeLot: typeDuLot(versAnnexe(l), 'Bien'), annexes: annexes.map(versAnnexe), principal, detachee: l.detachee, candidats };
}

/** Une ligne de l'Historique : un détachement, un rattachement ou une réintégration d'annexe, sur CE bien. */
export interface EvenementAnnexe { id: number; quand: string; action: string; texte: string; par: string }

/** Les détachements / rattachements d'annexes journalisés pour CE bien (le bien principal ou l'annexe), du plus récent. */
export async function evenementsAnnexes(lotId: number): Promise<EvenementAnnexe[]> {
  const { rows } = await query<{ id: string; quand: string; action: string; valeur_apres: string | null; commentaire: string | null; auteur_libelle: string | null }>(
    `SELECT j.id::text, j.survenu_le::text AS quand, j.action, j.valeur_apres, j.commentaire, j.auteur_libelle FROM gestion_journal j
      WHERE j.entite = 'annuaire_lot' AND j.entite_id = $1
        AND j.action IN ('location_annexe_detachee', 'location_annexe_rattachee', 'location_annexe_reintegree')
      ORDER BY j.survenu_le DESC, j.id DESC LIMIT 200`, [lotId]);
  return rows.map((r) => ({ id: Number(r.id), quand: r.quand, action: r.action, texte: [r.valeur_apres, r.commentaire].filter((x) => x).join(' — '), par: r.auteur_libelle ?? '—' }));
}
