import { query } from '../db/client';
import { annuaireDisponible, rattachementsDisponibles } from './schema';

/**
 * MODULE « GESTION » — LOT STATUT-PAR-MAIL : CE QU'IL FAUT SAVOIR POUR CLASSER UN MAIL DANS UN BIEN. LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER RÉPOND, et qui manquait à l'écran de classement : « à quels BIENS ce mail peut-il
 * raisonnablement se rattacher, et QUI sont les parties de chacun À LA DATE DU MAIL ? »
 *
 * Trois choses, dans cet ordre :
 *   ① LA RECOMMANDATION — le bien que l'automatisation a trouvé. Il est PRÉSÉLECTIONNÉ et marqué comme tel :
 *      on ne fait pas retaper à la main ce que le moteur a déjà vu juste dans la plupart des cas ;
 *   ② TOUS LES BIENS DU PROPRIÉTAIRE identifié. Demande d'Arno : un bailleur possède souvent plusieurs lots, et un
 *      mail peut parler de deux appartements à la fois (un relevé de charges, un ravalement). Ne proposer que le
 *      bien recommandé obligerait à rouvrir le sélecteur pour chaque lot supplémentaire ;
 *   ③ LES PARTIES À LA DATE DU MAIL, pas celles d'aujourd'hui. Un mail d'août 2025 parle du locataire d'août 2025.
 *      Afficher l'occupant actuel ferait classer le courrier d'un locataire sorti sous le nom de son successeur —
 *      une erreur qu'on ne verrait jamais, et qui se propagerait à chaque relecture du dossier.
 *
 * 🔒 LECTURE SEULE. Aucun `INSERT`, `UPDATE` ni `DELETE` : un test statique le vérifie sur ce fichier. Le geste
 * d'écriture reste celui qui existe — la route des rattachements, avec son journal.
 *
 * ⚠️ NE PAS CONFONDRE AVEC `classementRepo.ts`, qui porte un tout autre sujet : le rangement des PIÈCES JOINTES
 * dans les dossiers du Drive (lot CLASSEMENT-1). Ici, il s'agit du rattachement d'un MAIL à un BIEN. Deux fichiers,
 * deux questions — les mêler donnerait un module qui ne sait plus de quoi il parle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une partie d'un bien, à la date du mail. */
export interface PartieBien {
  role: 'proprietaire' | 'locataire';
  /** La clé WIPPIMMO : la seule identité qui survive à un ré-import de l'annuaire. C'est elle, la cible. */
  cle: string;
  nom: string;
  /** Renseignés pour un locataire : la période d'occupation qui couvre la date du mail. */
  depuis?: string | null;
  jusqua?: string | null;
}

/** Un bien proposé au classement, avec ses parties à la date du mail. */
export interface BienProposable {
  /** La clé WIPPIMMO du lot. C'est elle qui sert de cible de rattachement (lot RATTACHEMENT-1). */
  cle: string;
  libelle: string;
  adresse: string | null;
  commune: string | null;
  typeBien: string | null;
  /** Le propriétaire et le ou les locataires du bien À LA DATE DU MAIL. */
  parties: PartieBien[];
  /**
   * 🔴 VRAI quand l'automatisation a désigné ce bien pour ce mail. L'écran le présélectionne et écrit
   * « Recommandé (automatique) » à côté — jamais une coche silencieuse : on doit savoir d'où elle vient.
   */
  recommande: boolean;
  /** Vrai quand ce mail lui est DÉJÀ rattaché de façon confirmée. L'écran le coche et le dit. */
  dejaRattache: boolean;
}

export interface ContexteClassement {
  messageId: number;
  filId: number | null;
  /** La date du mail : c'est elle qui décide QUI étaient les parties. */
  dateMail: string | null;
  /** Combien de mails compte la conversation — pour la portée « toute la conversation ». */
  nbMailsDuFil: number;
  /** Le propriétaire identifié, quand il y en a un. C'est lui qui ouvre la liste de TOUS ses biens. */
  proprietaire: { cle: string; nom: string } | null;
  biens: BienProposable[];
  /** `false` = migration 257 ou annuaire absents : l'écran le dit au lieu de montrer une liste vide. */
  disponible: boolean;
}

/**
 * LES PARTIES D'UN LOT À UNE DATE. LECTURE SEULE.
 *
 * ⚠️ « À LA DATE », ET NON « AUJOURD'HUI ». L'occupation retenue est celle dont la période COUVRE la date du mail :
 * entrée antérieure (ou inconnue) et sortie postérieure (ou toujours en cours). Sans cela, le courrier d'un
 * locataire sorti se classerait sous le nom de son successeur.
 *
 * ⚠️ PLUSIEURS LOCATAIRES SONT POSSIBLES — une colocation, un couple. On les rend TOUS : n'en garder qu'un
 * choisirait arbitrairement lequel des deux existe.
 */
const SQL_PARTIES = `
  SELECT l.wippimmo_id AS cle, l.nom, o.entree::text AS depuis, o.sortie::text AS jusqua
    FROM gestion_annuaire_occupation o
    JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
   WHERE o.lot_id = $1
     AND (o.entree IS NULL OR o.entree <= $2::date)
     AND (o.sortie IS NULL OR o.sortie >= $2::date)
   ORDER BY o.entree DESC NULLS LAST, o.id DESC`;

interface LotDB {
  id: string; cle: string; adresse: string | null; commune: string | null; type_bien: string | null;
  proprietaire_cle: string | null; proprietaire_nom: string | null;
}

/** Le libellé d'un bien, écrit UNE fois : deux formulations finiraient par se contredire d'un écran à l'autre. */
export function libelleBien(l: { adresse: string | null; commune: string | null; cle: string }): string {
  const lieu = [l.adresse, l.commune].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(', ');
  return lieu === '' ? `Lot ${l.cle}` : `${lieu} — lot ${l.cle}`;
}

/**
 * ══ CE QU'IL FAUT POUR CLASSER CE MAIL. LECTURE SEULE. ═══════════════════════════════════════════════════════════
 *
 * ⚠️ SANS ANNUAIRE OU SANS RATTACHEMENTS, on rend `disponible: false` plutôt qu'une liste vide. Une liste vide se
 * lirait « aucun bien ne correspond », ce qui serait faux : on n'a simplement pas pu chercher.
 */
export async function contexteClassement(messageId: number): Promise<ContexteClassement> {
  const vide: ContexteClassement = {
    messageId, filId: null, dateMail: null, nbMailsDuFil: 0, proprietaire: null, biens: [], disponible: false,
  };
  if (!(await annuaireDisponible()) || !(await rattachementsDisponibles())) return vide;

  const { rows: msg } = await query<{ fil_id: string | null; recu_le: string; nb: number }>(
    `SELECT m.fil_id::text AS fil_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS recu_le,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = m.fil_id)::int AS nb
       FROM gestion_message m WHERE m.id = $1`, [messageId]);
  const m = msg[0];
  if (m === undefined) return vide;
  const dateMail = m.recu_le;

  /**
   * ① CE QUE L'AUTOMATISATION A TROUVÉ POUR CE MAIL — propositions ET confirmations. Une proposition suffit à
   * RECOMMANDER ; seule une confirmation vaut « déjà rattaché ».
   */
  const { rows: liens } = await query<{ cible_sorte: string; cible_cle: string | null; statut: string }>(
    `SELECT cible_sorte, cible_cle, statut FROM gestion_rattachement
      WHERE message_id = $1 AND statut IN ('propose', 'confirme')`, [messageId]);
  const clesRecommandees = new Set(liens.filter((l) => l.cible_sorte === 'lot').map((l) => l.cible_cle ?? ''));
  const clesConfirmees = new Set(
    liens.filter((l) => l.cible_sorte === 'lot' && l.statut === 'confirme').map((l) => l.cible_cle ?? ''));
  const proprioDesLiens = liens.find((l) => l.cible_sorte === 'proprietaire')?.cible_cle ?? null;

  /**
   * ② LE PROPRIÉTAIRE, puis TOUS SES BIENS. Deux chemins pour le trouver, dans cet ordre : un rattachement
   * propriétaire déjà posé sur ce mail, sinon le propriétaire du lot recommandé. Le premier est plus sûr — c'est
   * une désignation explicite.
   */
  const { rows: lots } = await query<LotDB>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle, lo.adresse, lo.commune, lo.type_bien,
            pr.wippimmo_id AS proprietaire_cle, pr.nom_complet AS proprietaire_nom
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE lo.proprietaire_id IN (
              SELECT p2.id FROM gestion_annuaire_proprietaire p2
               WHERE p2.wippimmo_id = $1
                  OR p2.id = (SELECT l2.proprietaire_id FROM gestion_annuaire_lot l2
                               WHERE l2.wippimmo_id = ANY($2::text[]) LIMIT 1))
         OR lo.wippimmo_id = ANY($2::text[])
      ORDER BY lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.wippimmo_id`,
    [proprioDesLiens, [...clesRecommandees]]);

  const biens: BienProposable[] = [];
  for (const l of lots) {
    const { rows: loc } = await query<{ cle: string; nom: string; depuis: string | null; jusqua: string | null }>(
      SQL_PARTIES, [l.id, dateMail]);
    const parties: PartieBien[] = [];
    if (l.proprietaire_cle !== null) {
      parties.push({ role: 'proprietaire', cle: l.proprietaire_cle, nom: l.proprietaire_nom ?? '(sans nom)' });
    }
    for (const x of loc) {
      parties.push({ role: 'locataire', cle: x.cle, nom: x.nom, depuis: x.depuis, jusqua: x.jusqua });
    }
    biens.push({
      cle: l.cle,
      libelle: libelleBien({ adresse: l.adresse, commune: l.commune, cle: l.cle }),
      adresse: l.adresse, commune: l.commune, typeBien: l.type_bien,
      parties,
      recommande: clesRecommandees.has(l.cle),
      dejaRattache: clesConfirmees.has(l.cle),
    });
  }

  const proprio = lots.find((l) => l.proprietaire_cle !== null);
  return {
    messageId,
    filId: m.fil_id === null ? null : Number(m.fil_id),
    dateMail,
    nbMailsDuFil: m.nb,
    proprietaire: proprio === undefined || proprio.proprietaire_cle === null
      ? null
      : { cle: proprio.proprietaire_cle, nom: proprio.proprietaire_nom ?? '(sans nom)' },
    // ⚠️ LE RECOMMANDÉ EN TÊTE : c'est celui qu'on coche neuf fois sur dix, il ne doit pas être à chercher.
    biens: biens.sort((a, b) => Number(b.recommande) - Number(a.recommande) || a.libelle.localeCompare(b.libelle, 'fr')),
    disponible: true,
  };
}

/**
 * LES MAILS D'UNE CONVERSATION QUI N'ONT AUCUN RATTACHEMENT MANUEL. LECTURE SEULE.
 *
 * 🔴 C'EST LA PORTÉE « TOUTE LA CONVERSATION », et elle ne PIÉTINE JAMAIS un geste humain : un mail que quelqu'un
 * a classé à la main garde son classement. Appliquer le nouveau partout écraserait, sans le dire, une décision
 * prise en connaissance de cause — exactement ce qu'un classement en masse ne doit pas faire.
 */
export async function mailsSansClassementManuel(filId: number): Promise<number[]> {
  if (!(await rattachementsDisponibles())) return [];
  const { rows } = await query<{ id: string }>(
    `SELECT m.id::text FROM gestion_message m
      WHERE m.fil_id = $1::bigint
        AND NOT EXISTS (
          SELECT 1 FROM gestion_rattachement r
           WHERE r.message_id = m.id AND r.statut = 'confirme'
             AND (r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL)
             AND r.cible_sorte IN ('lot', 'proprietaire', 'locataire'))
      ORDER BY m.recu_le, m.id`, [filId]);
  return rows.map((r) => Number(r.id));
}
