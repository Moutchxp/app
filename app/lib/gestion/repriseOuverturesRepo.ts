import { query, withTransaction, type RequeteTx } from '../db/client';

/**
 * ══ 🔴🔴 REPRISE — LES OUVERTURES DATÉES APRÈS LA CRÉATION, OU DANS LE FUTUR (Arno, 23/10/2026, option A) ═════════════════════
 *
 * « Un événement a pour date d'ouverture la date (et l'heure) de sa CRÉATION. […] Une date à venir se note avec la carte “RDV
 * intervention”. » Les événements existants dont l'ouverture a été saisie ou corrigée vers une date postérieure (souvent la date
 * d'intervention prévue : GES-2026-000010 au 02/11/2026) sont repris ainsi :
 *
 *   · l'ouverture (`gestion_evenement.ouvert_le`) revient à l'INSTANT DE CRÉATION — lu sur la ligne de journal que la création
 *     écrit (« carte … ouverte … »), la seule trace de cet instant (la table des événements n'a pas de colonne de création) ;
 *   · si l'ancienne date tombait un JOUR POSTÉRIEUR à la création, une carte « RDV intervention » est posée à cette date (sauf si
 *     la frise en porte déjà une ce jour-là) : la date prévue n'est pas perdue, elle est notée là où elle doit l'être ;
 *   · une carte « Ouverture » datée dans le FUTUR est ramenée de même à la création, avec sa carte RDV ;
 *   · l'ancienne valeur est gardée au journal append-only (`valeur_avant`).
 *
 * 🔴 À BLANC PAR DÉFAUT ; `reel` = une transaction, tout ou rien. 🔴 REJOUABLE : un événement repris a son ouverture à la création,
 * il ne ressort plus. Aucune carte n'est supprimée, aucune n'est déplacée dans l'ordre de la frise.
 */
export const AUTEUR_REPRISE_OUVERTURES = 'reprise reparer-ouvertures';

export interface OuvertureAReprendre {
  evenementId: number;
  reference: string | null;
  objet: string | null;
  bien: string | null;
  /** 'evenement' = `ouvert_le` ; 'carte' = une carte « Ouverture » de la frise (son identifiant dans `carteId`). */
  sorte: 'evenement' | 'carte';
  carteId: number | null;
  /** Instant de création (heure de Paris, lisible), et le même en horodatage complet, rejoué tel quel. */
  creeLe: string;
  creeLeBrut: string;
  ouvertLe: string;
  ouvertLeBrut: string;
  futur: boolean;
  /** Une carte RDV intervention existe-t-elle déjà sur la frise ? Et ce jour-là ? */
  rdvExistants: number;
  rdvCeJour: boolean;
  /** Une carte RDV sera-t-elle posée (ancienne date un jour postérieur à la création, et aucune RDV ce jour-là) ? */
  rdvAPoser: boolean;
}

const LIENS = `(x.evenement_id = e.id OR x.reference IN (SELECT reference FROM gestion_monga_lien
                                                     WHERE evenement_id = e.id AND retire_le IS NULL))`;
/** L'instant de création d'un événement : sa ligne de journal « carte … ouverte … » ; à défaut, rien (il n'est pas repris). */
const SQL_CREATION = `(SELECT min(j.horodatage) FROM gestion_journal j
                        WHERE j.entite = 'evenement' AND j.entite_id = e.id AND j.action = 'ouverture'
                          AND j.commentaire LIKE 'carte % ouverte%')`;
const PARIS = (x: string) => `to_char(${x} AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS')`;
const JOUR = (x: string) => `(${x} AT TIME ZONE 'Europe/Paris')::date`;

export async function listerOuverturesAReprendre(q: RequeteTx = query): Promise<OuvertureAReprendre[]> {
  const { rows } = await q<{
    evenement_id: string; reference: string | null; objet: string | null; bien: string | null; sorte: 'evenement' | 'carte';
    carte_id: string | null; cree: string; cree_brut: string; ouvert: string; ouvert_brut: string; futur: boolean;
    rdv: number; rdv_ce_jour: boolean; rdv_a_poser: boolean;
  }>(
    `WITH ev AS (
       SELECT e.*, ${SQL_CREATION} AS cree_le FROM gestion_evenement e),
     cand AS (
       SELECT ev.id, 'evenement'::text AS sorte, NULL::bigint AS carte_id, ev.ouvert_le AS quand FROM ev
        WHERE ev.cree_le IS NOT NULL AND ev.ouvert_le > ev.cree_le
       UNION ALL
       SELECT ev.id, 'carte', x.id, x.survenu_le FROM ev
         JOIN gestion_evenement e ON e.id = ev.id
         JOIN gestion_monga_etape x ON x.statut = 'vif' AND x.type = 'ouverture' AND x.certitude <> 'ecartee' AND ${LIENS}
        WHERE ev.cree_le IS NOT NULL AND x.survenu_le > now())
     SELECT e.id::text AS evenement_id, e.reference, e.objet,
            coalesce((SELECT concat_ws(' - ', 'lot ' || p.cle, nullif(btrim(concat_ws(' ', lo.adresse, lo.commune)), ''))
                        FROM gestion_evenement_partie p
                        LEFT JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = p.cle
                       WHERE p.evenement_id = e.id AND p.sorte = 'lot' AND p.retire_le IS NULL ORDER BY p.cle LIMIT 1),
                     nullif(btrim(e.adresse_libre), '')) AS bien,
            c.sorte, c.carte_id::text AS carte_id,
            ${PARIS('ev.cree_le')} AS cree, ev.cree_le::text AS cree_brut,
            ${PARIS('c.quand')} AS ouvert, c.quand::text AS ouvert_brut, (c.quand > now()) AS futur,
            (SELECT count(*)::int FROM gestion_monga_etape x WHERE x.statut = 'vif' AND x.type = 'rdv_intervention' AND ${LIENS}) AS rdv,
            EXISTS (SELECT 1 FROM gestion_monga_etape x WHERE x.statut = 'vif' AND x.type = 'rdv_intervention' AND ${LIENS}
                       AND ${JOUR('x.survenu_le')} = ${JOUR('c.quand')}) AS rdv_ce_jour,
            (${JOUR('c.quand')} > ${JOUR('ev.cree_le')}
              AND NOT EXISTS (SELECT 1 FROM gestion_monga_etape x WHERE x.statut = 'vif' AND x.type = 'rdv_intervention' AND ${LIENS}
                                AND ${JOUR('x.survenu_le')} = ${JOUR('c.quand')})) AS rdv_a_poser
       FROM cand c JOIN ev ON ev.id = c.id JOIN gestion_evenement e ON e.id = c.id
      ORDER BY e.id, c.sorte DESC, c.carte_id`);
  return rows.map((r) => ({
    evenementId: Number(r.evenement_id), reference: r.reference, objet: r.objet, bien: r.bien, sorte: r.sorte,
    carteId: r.carte_id === null ? null : Number(r.carte_id), creeLe: r.cree, creeLeBrut: r.cree_brut,
    ouvertLe: r.ouvert, ouvertLeBrut: r.ouvert_brut, futur: r.futur === true,
    rdvExistants: Number(r.rdv ?? 0), rdvCeJour: r.rdv_ce_jour === true, rdvAPoser: r.rdv_a_poser === true,
  }));
}

export interface PasseRepriseOuvertures { reel: boolean; trouvees: OuvertureAReprendre[]; reprises: number; rdvPoses: number }

export const TEXTE_RDV_REPRIS = 'Date reprise de l’ancienne date d’ouverture (décision du 23/10/2026 : l’ouverture est la création).';

export async function passerRepriseOuvertures(o: { reel: boolean }): Promise<PasseRepriseOuvertures> {
  if (!o.reel) return { reel: false, trouvees: await listerOuverturesAReprendre(), reprises: 0, rdvPoses: 0 };
  return withTransaction(async (q) => {
    const trouvees = await listerOuverturesAReprendre(q);
    let reprises = 0;
    let rdvPoses = 0;
    for (const c of trouvees) {
      await q(`SELECT id FROM gestion_evenement WHERE id = $1 FOR UPDATE`, [c.evenementId]);
      if (c.sorte === 'evenement') {
        await q(`UPDATE gestion_evenement SET ouvert_le = $2::timestamptz, maj_le = now() WHERE id = $1`, [c.evenementId, c.creeLeBrut]);
      } else {
        await q(`UPDATE gestion_monga_etape SET survenu_le = $2::timestamptz, maj_le = now(), maj_par_libelle = $3 WHERE id = $1`,
          [c.carteId, c.creeLeBrut, AUTEUR_REPRISE_OUVERTURES]);
      }
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
         VALUES ('evenement', $1, 'ouverture', $2, $3, $4, $5)`,
        [c.evenementId, c.ouvertLeBrut, c.creeLeBrut,
          `reprise : ouverture ramenée à la création (option A d’Arno, 23/10/2026)${c.sorte === 'carte' ? ` — carte n° ${c.carteId}` : ''}`
          + ` ; ancienne date en valeur_avant${c.rdvAPoser ? ' ; carte RDV intervention posée à cette date' : ''}`,
          AUTEUR_REPRISE_OUVERTURES]);
      if (c.rdvAPoser) {
        await q(
          `INSERT INTO gestion_monga_etape
             (evenement_id, type, survenu_le, heure_connue, jour_connu, texte, source, certitude, cree_par_libelle, rang_pose)
           VALUES ($1, 'rdv_intervention', $2::timestamptz, false, true, $3, 'manuelle', 'fiable', $4,
                   (SELECT coalesce(max(x.rang_pose), 0) + 1 FROM gestion_monga_etape x WHERE x.evenement_id = $1))`,
          [c.evenementId, c.ouvertLeBrut, TEXTE_RDV_REPRIS, AUTEUR_REPRISE_OUVERTURES]);
        rdvPoses += 1;
      }
      reprises += 1;
    }
    const reste = await listerOuverturesAReprendre(q);
    if (reste.length > 0) throw new Error(`${reste.length} ouverture(s) encore à reprendre après la passe : tout est annulé.`);
    return { reel: true, trouvees, reprises, rdvPoses };
  });
}
