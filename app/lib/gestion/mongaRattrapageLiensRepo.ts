/**
 * ══ 🔴🔴 LOT MONGA-LIEN-PAR-LE-GESTE — LE RATTRAPAGE DES LIENS QU'UN GESTE HUMAIN AURAIT DÛ POSER ══════════════════
 *
 * Avant ce lot, rattacher à la main un mail Monga à un événement ne reliait pas sa référence (cas mesuré en prod le
 * 26/10/2026 : GES-2026-000011 et MNG-25126). Ce rattrapage pose, pour le passé, le lien que le geste pose désormais.
 *
 * CIBLE (règle d'Arno) : les événements portant une affectation HUMAINE ACTIVE vers un échange ou un mail qui contient
 * un mail Monga dont la référence n'a AUCUN lien actif.
 *   · le lien est signé par l'AUTEUR DE L'AFFECTATION D'ORIGINE (la plus ancienne), motif « rattrapage du … » ;
 *   · une référence candidate pour PLUSIEURS événements → rien, elle est listée à part (c'est un choix humain) ;
 *   · les étapes ne sont JAMAIS touchées (une étape « retire » reste retirée) : seule la frise les lira, par le lien.
 *
 * 🔴 À BLANC PAR DÉFAUT (`appliquer: false`) : seules des lectures. `appliquer: true` pose chaque lien dans SA
 * transaction (lire verrouillé → décider → écrire, par `mongaLienGeste`), puis classe les mails de la référence par la
 * porte du clic « Relier » — donc avec la signature que « Délier » sait défaire.
 *
 * ⚠️ PAS DE `import 'server-only'` : ce module est lu par un script CLI (`app/scripts/relier-monga-rattrapage.ts`).
 */
import { query, withTransaction } from '../db/client';
import { AUTEUR_MONGA, classerLesMailsDeLaReference } from './mongaClassement';
import {
  FORMAT_REFERENCE_MONGA, auteurHumain, motifLienRattrapage, poserLiensMonga, preparerLiensMonga,
} from './mongaLienGeste';
import { mongaDisponible } from './schema';

/** Une ligne lue : une affectation humaine active qui emporte un mail Monga d'une référence sans lien. */
export interface LigneCandidate {
  reference: string;
  evenementId: number;
  evenementReference: string;
  objet: string;
  auteurId: number | null;
  auteurLibelle: string;
  affecteLe: string;
}

/** Un lien à poser. */
export interface LienARattraper {
  reference: string;
  evenementId: number;
  evenementReference: string;
  objet: string;
  auteurId: number | null;
  auteurLibelle: string;
  affecteLe: string;
  /** Les étapes VIVES de la référence : ce que la frise affichera dès le lien posé. */
  etapes: number;
}

/** Une référence que plusieurs événements réclament : on ne choisit pas à la place d'un humain. */
export interface ReferenceAmbigue {
  reference: string;
  evenements: { evenementId: number; evenementReference: string; auteurLibelle: string }[];
}

/**
 * GROUPER PAR RÉFÉRENCE ET TRANCHER. PUR.
 *
 * 🔴 L'AUTEUR RETENU EST CELUI DE L'AFFECTATION LA PLUS ANCIENNE (le premier geste humain sur cette référence), et
 * seulement si son libellé est humain (`auteurHumain`) — la base refuserait sinon le lien.
 */
export function planRattrapage(
  lignes: readonly LigneCandidate[], etapesParReference: ReadonlyMap<string, number>,
): { liens: LienARattraper[]; ambigues: ReferenceAmbigue[] } {
  const parReference = new Map<string, LigneCandidate[]>();
  for (const l of lignes) {
    if (!auteurHumain(l.auteurLibelle)) continue;
    parReference.set(l.reference, [...(parReference.get(l.reference) ?? []), l]);
  }
  const liens: LienARattraper[] = [];
  const ambigues: ReferenceAmbigue[] = [];
  for (const reference of [...parReference.keys()].sort()) {
    const toutes = [...(parReference.get(reference) ?? [])]
      .sort((a, b) => (a.affecteLe === b.affecteLe ? a.evenementId - b.evenementId : (a.affecteLe < b.affecteLe ? -1 : 1)));
    const evenements = [...new Set(toutes.map((l) => l.evenementId))];
    if (evenements.length > 1) {
      ambigues.push({
        reference,
        evenements: evenements.map((id) => {
          const premiere = toutes.find((l) => l.evenementId === id) as LigneCandidate;
          return { evenementId: id, evenementReference: premiere.evenementReference, auteurLibelle: premiere.auteurLibelle };
        }),
      });
      continue;
    }
    const p = toutes[0];
    liens.push({
      reference, evenementId: p.evenementId, evenementReference: p.evenementReference, objet: p.objet,
      auteurId: p.auteurId, auteurLibelle: p.auteurLibelle.trim(), affecteLe: p.affecteLe,
      etapes: etapesParReference.get(reference) ?? 0,
    });
  }
  return { liens, ambigues };
}

/** LECTURE : les affectations humaines actives qui emportent un mail Monga d'une référence sans lien vivant. */
async function lireCandidates(): Promise<LigneCandidate[]> {
  const { rows } = await query<{
    reference: string; evenement_id: number; evenement_reference: string; objet: string;
    affecte_par: number | null; affecte_par_libelle: string; affecte_le: string;
  }>(
    `WITH aff AS (
        SELECT a.evenement_id, a.affecte_par, a.affecte_par_libelle, a.affecte_le, m.id AS message_id
          FROM gestion_affectation a
          JOIN gestion_message m
            ON (a.message_id IS NOT NULL AND m.id = a.message_id)
            OR (a.message_id IS NULL AND m.fil_id = a.fil_id
                AND NOT EXISTS (SELECT 1 FROM gestion_affectation a2
                                 WHERE a2.message_id = m.id AND a2.actif))
         WHERE a.actif
           AND btrim(coalesce(a.affecte_par_libelle, '')) <> ''
           AND lower(btrim(a.affecte_par_libelle)) NOT IN ('automatique', lower($2))
     )
     SELECT DISTINCT mm.reference, aff.evenement_id::int AS evenement_id, e.reference AS evenement_reference, e.objet,
            aff.affecte_par::int AS affecte_par, aff.affecte_par_libelle,
            to_char(aff.affecte_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') AS affecte_le
       FROM aff
       JOIN gestion_monga_mail mm ON mm.message_id = aff.message_id
       JOIN gestion_evenement e ON e.id = aff.evenement_id
      WHERE mm.reference ~ $1
        AND NOT EXISTS (SELECT 1 FROM gestion_monga_lien l WHERE l.reference = mm.reference AND l.retire_le IS NULL)
      ORDER BY 1, 7, 2`, [FORMAT_REFERENCE_MONGA, AUTEUR_MONGA.libelle]);
  return rows.map((r) => ({
    reference: r.reference, evenementId: Number(r.evenement_id), evenementReference: r.evenement_reference,
    objet: r.objet, auteurId: r.affecte_par === null ? null : Number(r.affecte_par),
    auteurLibelle: r.affecte_par_libelle, affecteLe: r.affecte_le,
  }));
}

/** LECTURE : les étapes VIVES de chaque référence (une étape « retire » ne s'affichera pas, et n'est pas comptée). */
async function etapesVives(references: readonly string[]): Promise<Map<string, number>> {
  if (references.length === 0) return new Map();
  const { rows } = await query<{ reference: string; n: number }>(
    `SELECT reference, count(*)::int AS n FROM gestion_monga_etape
      WHERE statut = 'vif' AND reference = ANY($1::text[]) GROUP BY reference`, [[...references]]);
  return new Map(rows.map((r) => [r.reference, Number(r.n)]));
}

export interface PasseRattrapageLiens {
  appliquer: boolean;
  /** `false` = la migration 311 n'est pas là : rien n'est lu ni écrit. */
  disponible: boolean;
  liens: LienARattraper[];
  ambigues: ReferenceAmbigue[];
  /** Avec `appliquer` : ce qui s'est vraiment passé, référence par référence. */
  poses: { reference: string; issue: 'cree' | 'deja' | 'ailleurs'; mailsClasses: number }[];
}

/**
 * LA PASSE. `jour` = le jour écrit dans le motif (« rattrapage du 26/10/2026 »), donné par l'appelant pour que le
 * motif soit celui qu'Arno a demandé, quel que soit le jour où la commande est lancée.
 */
export async function passerRattrapageLiensMonga(o: { appliquer: boolean; jour: string }): Promise<PasseRattrapageLiens> {
  if (!await mongaDisponible()) {
    return { appliquer: o.appliquer, disponible: false, liens: [], ambigues: [], poses: [] };
  }
  const lignes = await lireCandidates();
  const etapes = await etapesVives([...new Set(lignes.map((l) => l.reference))]);
  const { liens, ambigues } = planRattrapage(lignes, etapes);
  const poses: PasseRattrapageLiens['poses'] = [];
  if (o.appliquer) {
    for (const l of liens) {
      const auteur = { id: l.auteurId, libelle: l.auteurLibelle };
      const issue = await withTransaction(async (q) => {
        const plan = await preparerLiensMonga(q, [l.reference], l.evenementId, auteur);
        return poserLiensMonga(q, plan, {
          evenementId: l.evenementId, evenementReference: l.evenementReference, auteur,
          motif: motifLienRattrapage(o.jour),
        });
      });
      const fait = issue[0]?.issue ?? 'deja';
      const mailsClasses = fait === 'cree'
        ? (await classerLesMailsDeLaReference({ reference: l.reference })).classes : 0;
      poses.push({ reference: l.reference, issue: fait, mailsClasses });
    }
  }
  return { appliquer: o.appliquer, disponible: true, liens, ambigues, poses };
}
