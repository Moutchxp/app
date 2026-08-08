/**
 * Accès aux RÉPONSES entrantes des mairies (boucle de retour CRPA, chantier R1). Écrit UNIQUEMENT dans demande_reponse /
 * demande_reponse_piece. ⚠️ N'écrit JAMAIS demande.statut (la clôture est un chantier ultérieur), ne lit aucune boîte, ne
 * dépose aucune pièce. Style calqué sur demandeRepo.ts (query / withTransaction, paramètres liés, aucun `any`).
 */
import { query, withTransaction } from '../db/client';
import { dossiersSatisfaits, type ReponsePourSatisfaction } from './satisfactionDossier';

export type ProfilBoite = 'entreprise' | 'personne';
export type RattachementMethode = 'message_id' | 'reference_objet' | 'reference_corps' | 'manuel' | 'aucun';

/** Une pièce jointe d'un message entrant. Les champs de dépôt (cle_stockage/empreinte/stocke_le) restent NULL tant que la pièce n'est pas déposée (chantier ultérieur). */
export interface PieceEntrante {
  nomFichier: string;
  typeMime?: string | null;
  tailleOctets?: number | null;
  cleStockage?: string | null;
  empreinteSha256?: string | null;
  stockeLe?: Date | null;
  motifNonStocke?: string | null;
}

/** Un message entrant à enregistrer. `demandeId` absent/null → conservé dans la file « à rattacher ». */
export interface ReponseEntrante {
  demandeId?: number | null;
  profilBoite: ProfilBoite;
  messageId: string;               // AVEC chevrons, comme demande_acheminement.message_id
  inReplyTo?: string | null;
  referencesBrut?: string | null;
  deAdresse: string;
  deNom?: string | null;
  objet?: string | null;
  recuLe: Date;
  corpsTexte?: string | null;
  rattachementMethode?: RattachementMethode; // défaut 'aucun'
  rattacheLe?: Date | null;
  note?: string | null;
  pieces?: PieceEntrante[];
}

export interface FiltreReponses {
  demandeId?: number;      // messages d'UNE demande
  nonRattachees?: boolean; // file « à rattacher » (demande_id IS NULL)
}

export interface ReponseLigne {
  id: number;
  demandeId: number | null;
  profilBoite: string;
  messageId: string;
  deAdresse: string;
  deNom: string | null;
  objet: string | null;
  recuLe: string;
  rattachementMethode: string;
  rattacheLe: string | null;
  traiteLe: string | null;
  note: string | null;
  creeLe: string;
}

/**
 * Enregistre UN message entrant (+ ses pièces) dans UNE transaction, de façon IDEMPOTENTE : `ON CONFLICT (message_id) DO
 * NOTHING`. Renvoie l'id de la réponse créée, ou **null si le message était déjà en base** (une seconde relève ne lève donc
 * pas de violation d'unicité et n'insère aucune pièce en double).
 */
export async function enregistrerReponse(r: ReponseEntrante): Promise<number | null> {
  return withTransaction(async (q) => {
    const res = await q<{ id: number }>(
      `INSERT INTO demande_reponse
         (demande_id, profil_boite, message_id, in_reply_to, references_brut, de_adresse, de_nom, objet, recu_le,
          corps_texte, rattachement_methode, rattache_le, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [
        r.demandeId ?? null, r.profilBoite, r.messageId, r.inReplyTo ?? null, r.referencesBrut ?? null,
        r.deAdresse, r.deNom ?? null, r.objet ?? null, r.recuLe, r.corpsTexte ?? null,
        r.rattachementMethode ?? 'aucun', r.rattacheLe ?? null, r.note ?? null,
      ],
    );
    const ligne = res.rows[0];
    if (!ligne) return null; // message_id déjà présent → rien inséré (ni réponse, ni pièces)
    const id = ligne.id;
    for (const p of r.pieces ?? []) {
      await q(
        `INSERT INTO demande_reponse_piece
           (reponse_id, nom_fichier, type_mime, taille_octets, cle_stockage, empreinte_sha256, stocke_le, motif_non_stocke)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, p.nomFichier, p.typeMime ?? null, p.tailleOctets ?? null, p.cleStockage ?? null, p.empreinteSha256 ?? null, p.stockeLe ?? null, p.motifNonStocke ?? null],
      );
    }
    return id;
  });
}

/**
 * Liste les réponses, plus récentes d'abord. `demandeId` → messages de cette demande ; sinon `nonRattachees` → file « à
 * rattacher » (demande_id IS NULL) ; sinon toutes. Les filtres passent par des PARAMÈTRES LIÉS (jamais d'interpolation).
 */
export async function listerReponses(filtre: FiltreReponses = {}): Promise<ReponseLigne[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filtre.demandeId !== undefined) {
    params.push(filtre.demandeId);
    where.push(`demande_id = $${params.length}`);
  } else if (filtre.nonRattachees === true) {
    where.push('demande_id IS NULL');
  }
  const { rows } = await query<{
    id: number; demande_id: number | null; profil_boite: string; message_id: string; de_adresse: string;
    de_nom: string | null; objet: string | null; recu_le: string; rattachement_methode: string;
    rattache_le: string | null; traite_le: string | null; note: string | null; cree_le: string;
  }>(
    `SELECT id::int AS id, demande_id::int AS demande_id, profil_boite, message_id, de_adresse, de_nom, objet,
            recu_le::text AS recu_le, rattachement_methode, rattache_le::text AS rattache_le,
            traite_le::text AS traite_le, note, cree_le::text AS cree_le
       FROM demande_reponse
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY recu_le DESC`,
    params,
  );
  return rows.map((r) => ({
    id: r.id, demandeId: r.demande_id, profilBoite: r.profil_boite, messageId: r.message_id,
    deAdresse: r.de_adresse, deNom: r.de_nom, objet: r.objet, recuLe: r.recu_le,
    rattachementMethode: r.rattachement_methode, rattacheLe: r.rattache_le, traiteLe: r.traite_le,
    note: r.note, creeLe: r.cree_le,
  }));
}

/**
 * Rattache À LA MAIN une réponse à une demande : pose demande_id, rattachement_methode='manuel', rattache_le=now(), et
 * consigne l'auteur dans `note` (append). Ne touche PAS demande.statut. Renvoie true si une ligne a été mise à jour.
 */
export async function rattacherAMain(reponseId: number, demandeId: number, auteur: string): Promise<boolean> {
  const res = await query(
    `UPDATE demande_reponse
        SET demande_id = $2, rattachement_methode = 'manuel', rattache_le = now(), maj_le = now(),
            note = btrim(coalesce(note || chr(10), '') || $3)
      WHERE id = $1`,
    [reponseId, demandeId, `rattaché à la main par ${auteur}`],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Marque une réponse comme traitée (traite_le=now()). Idempotent : ne fait rien si déjà traitée. Renvoie true si la transition a eu lieu. */
export async function marquerTraitee(reponseId: number): Promise<boolean> {
  const res = await query(
    `UPDATE demande_reponse SET traite_le = now(), maj_le = now() WHERE id = $1 AND traite_le IS NULL`,
    [reponseId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * R6c — SATISFACTION AUTOMATIQUE : marque les dossiers ENCORE à obtenir de la demande dont le numéro Sitadel COMPLET est
 * reconnu littéralement dans la réponse (`dossiersSatisfaits`, haute précision). Idempotent (WHERE satisfait_le IS NULL) ;
 * JAMAIS de démarquage. Renvoie le nombre de dossiers marqués. N'écrit PAS demande.statut.
 */
export async function marquerDossiersSatisfaitsAuto(demandeId: number, reponseId: number, reponse: ReponsePourSatisfaction): Promise<number> {
  const { rows } = await query<{ dossier_id: number; num_dau: string }>(
    `SELECT dd.dossier_id, s.num_dau
       FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
      WHERE dd.demande_id = $1 AND dd.actif AND dd.satisfait_le IS NULL`,
    [demandeId],
  );
  const ids = dossiersSatisfaits(reponse, rows.map((r) => ({ dossierId: r.dossier_id, numDau: r.num_dau })));
  if (ids.length === 0) return 0;
  const res = await query(
    `UPDATE demande_dossier SET satisfait_le = now(), satisfait_par = 'automatique', reponse_id = $2
      WHERE demande_id = $1 AND dossier_id = ANY($3::bigint[]) AND actif AND satisfait_le IS NULL`,
    [demandeId, reponseId, ids],
  );
  return res.rowCount ?? 0;
}

/**
 * R6c — SATISFACTION MANUELLE d'UN dossier (l'écran viendra plus tard ; la fonction doit exister). Pose satisfait_par='manuel'
 * et journalise l'auteur (append-only, sans toucher demande.statut). Idempotent (ne fait rien si déjà satisfait). `reponseId`
 * peut être null (ex. pièce reçue hors e-mail). Renvoie true si le dossier a été marqué.
 */
export async function marquerDossierSatisfait(demandeId: number, dossierId: number, reponseId: number | null, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q(
      `UPDATE demande_dossier SET satisfait_le = now(), satisfait_par = 'manuel', reponse_id = $3
        WHERE demande_id = $1 AND dossier_id = $2 AND actif AND satisfait_le IS NULL`,
      [demandeId, dossierId, reponseId],
    );
    if ((res.rowCount ?? 0) === 0) return false;
    await q(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur)
       VALUES ($1, NULL, NULL, $2, $3)`,
      [demandeId, `dossier ${dossierId} marqué satisfait à la main`, auteur],
    );
    return true;
  });
}
