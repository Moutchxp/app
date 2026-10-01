import { query, withTransaction } from '../db/client';
import { documentsAutoDisponible } from './schema';
import {
  attribuer, objetCourt, REGLE_DOCUMENT_AUTO, sousTypeLisible,
  type AnnuaireAdresses, type Attribution, type DocumentDeFiche, type FicheDestinataire,
  type MotifNonAttribue,
} from './documentsAuto';

export type { DocumentDeFiche };

/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — LIRE L'ANNUAIRE, RANGER LES DOCUMENTS, LES RELIRE PAR FICHE ════════════
 *
 * Le module PUR (`documentsAuto`) décide à qui un document est destiné ; celui-ci lui donne l'annuaire, écrit ce
 * qu'il a décidé, et sait relire les documents d'une fiche.
 *
 * 🔴 SANS LA MIGRATION 291, RIEN NE SE PASSE. Chaque fonction sonde d'abord : la lecture rend une liste vide, le
 * rangement ne range rien. L'écran se tait, et le module se comporte exactement comme avant ce lot.
 */

/** 🔴 NOS ADRESSES : elles ne désignent personne. Écrites une fois, employées partout. */
export const NOS_ADRESSES: readonly string[] = ['@criterimmo.fr', '@sansvisavis.com', 'gestion.criterimmo@gmail.com'];

/** La règle d'exclusion qui marque un « Document CRITERIMMO ». C'est elle qui définit « document automatique ». */
export const REGLE_EXCLUSION_DOCUMENT = 5;

/**
 * L'ANNUAIRE DES ADRESSES → LES FICHES QUI LES PORTENT. Une seule lecture par passe.
 *
 * ⚠️ `nbBiens` EST LU ICI, et c'est lui qui distingue « document d'un bien » de « compte rendu multi-biens ». Le
 * compter à l'écran obligerait à relire l'annuaire à chaque affichage.
 */
export async function chargerAnnuaireFiches(): Promise<AnnuaireAdresses> {
  const { rows } = await query<{
    email: string; sorte: string; cle: string; libelle: string; nb: number;
  }>(
    `SELECT lower(btrim(c.valeur)) AS email, 'proprietaire' AS sorte, p.wippimmo_id AS cle,
            p.nom_complet AS libelle,
            (SELECT count(*)::int FROM gestion_annuaire_lot l WHERE l.proprietaire_id = p.id) AS nb
       FROM gestion_annuaire_contact c JOIN gestion_annuaire_proprietaire p ON p.id = c.sujet_id
      WHERE c.sorte = 'email' AND c.sujet = 'proprietaire' AND c.archive_le IS NULL
        AND p.supprime_le IS NULL AND coalesce(btrim(c.valeur), '') <> ''
      UNION ALL
     SELECT lower(btrim(c.valeur)), 'locataire', lo.cle_personne, lo.nom,
            (SELECT count(DISTINCT o.lot_id)::int FROM gestion_annuaire_occupation o WHERE o.locataire_id = lo.id)
       FROM gestion_annuaire_contact c JOIN gestion_annuaire_locataire lo ON lo.id = c.sujet_id
      WHERE c.sorte = 'email' AND c.sujet = 'locataire' AND c.archive_le IS NULL
        AND lo.supprime_le IS NULL AND coalesce(btrim(c.valeur), '') <> ''`);

  const m = new Map<string, FicheDestinataire[]>();
  for (const r of rows) {
    if ((r.cle ?? '').trim() === '') continue;
    const f: FicheDestinataire = {
      sorte: r.sorte === 'proprietaire' ? 'proprietaire' : 'locataire',
      cle: r.cle, libelle: r.libelle ?? r.cle, nbBiens: r.nb,
    };
    const deja = m.get(r.email) ?? [];
    // Une même fiche peut porter deux adresses identiques (doublon d'import) : on ne la compte qu'une fois.
    if (!deja.some((x) => x.sorte === f.sorte && x.cle === f.cle)) m.set(r.email, [...deja, f]);
  }
  return m;
}

/** Un document automatique, tel qu'on le lit pour le ranger. */
export interface DocumentARanger {
  messageId: number;
  objet: string | null;
  destinataires: string[];
}

/** Les documents automatiques ENVOYÉS, et leurs destinataires. LECTURE SEULE. */
export async function documentsARanger(limite?: number): Promise<DocumentARanger[]> {
  const { rows } = await query<{ id: number; objet: string | null; dest: string[] | null }>(
    `SELECT m.id::int, m.objet,
            ARRAY(SELECT lower(btrim(x->>'adresse'))
                    FROM jsonb_array_elements(coalesce(m.dest_a, '[]'::jsonb)) x) AS dest
       FROM gestion_message m
      WHERE m.exclu_par_regle_id = $1 AND m.sens = 'envoye'
      ORDER BY m.id ${limite === undefined ? '' : `LIMIT ${Number(limite)}`}`, [REGLE_EXCLUSION_DOCUMENT]);
  return rows.map((r) => ({ messageId: r.id, objet: r.objet, destinataires: r.dest ?? [] }));
}

export interface ChiffresRangement {
  examines: number;
  locataire: number;
  proprietaireMono: number;
  proprietaireMulti: number;
  nonAttribues: Record<MotifNonAttribue, number>;
  ecrits: number;
}

const MOTIFS_VIDES = (): Record<MotifNonAttribue, number> => ({
  nos_adresses: 0, adresse_inconnue: 0, adresse_partagee: 0, fiches_differentes: 0,
});

/**
 * ══ 🔴🔴 RANGER LES DOCUMENTS DANS LEUR FICHE ══════════════════════════════════════════════════════════════════
 *
 * `appliquer = false` ⇒ SIMULATION : elle compte, elle n'écrit rien. C'est le mode par défaut, et le seul qui
 * tourne tant qu'Arno n'a pas donné son accord pour la migration.
 *
 * 🔴 SEULE UNE FICHE CERTAINE EST RANGÉE. Ambigus et inconnus restent où ils sont — dans « Courrier automatique ».
 * Un document rangé « à peu près » chez quelqu'un donne une certitude fausse, et personne n'y reviendra.
 *
 * ⚠️ LE LIEN EST POSÉ EN « confirme » AVEC LA RÈGLE `document_auto`, et c'est ce mot qui lui ouvre la base
 * (migration 291). `origine = 'automatique'` : une personne pourra toujours le retirer, et le moteur le reposera
 * si la fiche le justifie encore — même contrat que les rattachements ordinaires.
 */
export async function rangerLesDocuments(o: {
  appliquer: boolean;
  limite?: number;
  auteurLibelle?: string;
}): Promise<ChiffresRangement> {
  const c: ChiffresRangement = {
    examines: 0, locataire: 0, proprietaireMono: 0, proprietaireMulti: 0,
    nonAttribues: MOTIFS_VIDES(), ecrits: 0,
  };
  if (o.appliquer && !(await documentsAutoDisponible())) return c;

  const annuaire = await chargerAnnuaireFiches();
  const docs = await documentsARanger(o.limite);
  for (const d of docs) {
    c.examines += 1;
    const a: Attribution = attribuer({
      destinataires: d.destinataires, annuaire, nosAdresses: NOS_ADRESSES,
    });
    if (a.sorte === 'non_attribue') { c.nonAttribues[a.motif] += 1; continue; }
    if (a.fiche.sorte === 'locataire') c.locataire += 1;
    else if (a.multiBiens) c.proprietaireMulti += 1;
    else c.proprietaireMono += 1;
    if (!o.appliquer) continue;
    c.ecrits += await poserLien(d, a.fiche, o.auteurLibelle ?? 'classement des documents automatiques');
  }
  return c;
}

/**
 * Pose le lien d'un document vers sa fiche. Idempotent : repasser ne crée pas de doublon.
 *
 * 🔴🔴 LE `NOT EXISTS` NE REGARDE QUE LES LIENS **VIVANTS**, ET CE DÉTAIL A COÛTÉ 7 330 DOCUMENTS.
 *
 * MESURÉ À LA PREMIÈRE APPLICATION (01/10/2026) : 23 510 fiches certaines, mais 16 180 liens écrits
 * seulement. Cause : 8 943 de ces documents portaient déjà un lien « fiche » **retiré** le 28/09 par la
 * conversion de masse vers les biens (`statut_par_libelle = 'conversion règle bien 28/09'`, aucun geste
 * humain). Le garde, qui ne filtrait pas le statut, prenait ce lien MORT pour une présence et sautait le
 * document — qui n'apparaissait alors dans aucune fiche, puisque la lecture ne retient que les vivants.
 *
 * ⚠️ UN LIEN RETIRÉ EST UN HISTORIQUE, PAS UNE PRÉSENCE. C'est d'ailleurs exactement ce que dit la table :
 * son unique contrainte d'unicité (`gestion_rattachement_vivant_idx`) est PARTIELLE sur
 * `statut IN ('propose','confirme')`. Le garde s'aligne donc sur elle, ni plus large ni plus étroit.
 */
async function poserLien(d: DocumentARanger, f: FicheDestinataire, auteur: string): Promise<number> {
  return withTransaction(async (q) => {
    const { rowCount } = await q(
      `INSERT INTO gestion_rattachement
         (message_id, piece_id, cible_sorte, cible_cle, cible_libelle, origine, regle, confiance,
          motif, statut, cree_par_libelle)
       SELECT $1, NULL, $2, $3, $4, 'automatique', $5, 'haute', $6, 'confirme', $7
        WHERE NOT EXISTS (
          SELECT 1 FROM gestion_rattachement r
           WHERE r.message_id = $1 AND r.cible_sorte = $2 AND coalesce(r.cible_cle,'') = $3
             AND coalesce(r.piece_id, 0) = 0
             AND r.statut IN ('propose', 'confirme'))`,
      [d.messageId, f.sorte, f.cle, f.libelle, REGLE_DOCUMENT_AUTO,
        `document automatique adressé à ${f.libelle}`, auteur]);
    return rowCount ?? 0;
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA LECTURE : LES DOCUMENTS D'UNE FICHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES DOCUMENTS AUTOMATIQUES D'UNE FICHE, du plus récent au plus ancien. LECTURE SEULE.
 *
 * ⚠️ RETOURNE UNE LISTE VIDE SANS LA MIGRATION, et ne nomme alors AUCUNE colonne nouvelle : la sonde répond
 * « non » et la fonction sort avant la requête. Nommer ce qui n'existe pas ferait échouer la fiche entière —
 * règle du module depuis l'incident du lot 4a.
 */
export async function documentsDeLaFiche(
  sorte: 'proprietaire' | 'locataire', cle: string, limite = 300,
): Promise<DocumentDeFiche[]> {
  if (!(await documentsAutoDisponible())) return [];
  const { rows } = await query<{
    message_id: number; fil_id: number; le: string; objet: string | null;
  }>(
    `SELECT r.message_id::int, m.fil_id::int, m.recu_le::date::text AS le, m.objet
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = $1 AND r.cible_cle = $2 AND r.regle = $3
        AND r.statut IN ('propose', 'confirme') AND r.piece_id IS NULL
      ORDER BY m.recu_le DESC, m.id DESC LIMIT $4`,
    [sorte, cle, REGLE_DOCUMENT_AUTO, limite]);
  return rows.map((r) => ({
    messageId: r.message_id, filId: r.fil_id, le: r.le,
    sousType: sousTypeLisible(r.objet), objet: objetCourt(r.objet),
  }));
}
