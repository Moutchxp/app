/**
 * Accès aux RÉPONSES entrantes des mairies (boucle de retour CRPA, chantier R1). Écrit UNIQUEMENT dans demande_reponse /
 * demande_reponse_piece. ⚠️ N'écrit JAMAIS demande.statut (la clôture est un chantier ultérieur), ne lit aucune boîte, ne
 * dépose aucune pièce. Style calqué sur demandeRepo.ts (query / withTransaction, paramètres liés, aucun `any`).
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import { dossiersSatisfaits, type ReponsePourSatisfaction } from './satisfactionDossier';
import type { ResultatDepotEntrant } from '../stockage';

export type ProfilBoite = 'entreprise' | 'personne';
export type RattachementMethode = 'message_id' | 'reference_objet' | 'reference_corps' | 'numero_dossier' | 'reference_mairie' | 'manuel' | 'aucun';

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

/** R4 — une pièce entrante avec son CONTENU (jamais persisté en base : déposé sur l'object storage). */
export interface PieceAvecContenu { nomFichier: string; typeMime: string | null; contenu: Buffer | Uint8Array }
export interface BilanDepot { deposees: number; nonDeposees: number }

/** Signature du dépôt d'UNE pièce (injectable pour les tests ; le réel délègue à stockage.deposerPieceEntrante). */
type FnDeposer = (contenu: Buffer | Uint8Array, typeMime: string | null, opts: { demandeId: number | null; reponseId: number; tailleMaxOctets: number }) => Promise<ResultatDepotEntrant>;

/** Dépôt RÉEL : import dynamique de `stockage` — garde @aws-sdk HORS du graphe statique (et des tests node-purs). */
const deposerReel: FnDeposer = async (contenu, typeMime, opts) => {
  const { deposerPieceEntrante } = await import('../stockage');
  return deposerPieceEntrante(contenu, typeMime, opts);
};

/**
 * R4 — dépose sur l'object storage les pièces d'une réponse déjà enregistrée, puis persiste par pièce, soit
 * cle_stockage/taille_octets/empreinte_sha256/stocke_le (déposée), soit motif_non_stocke (non déposée). Le contenu vient
 * d'un TIERS NON FIABLE : stocké tel quel, jamais ouvert/parsé. Garanties :
 *  - IDEMPOTENCE : une pièce dont cle_stockage est déjà renseignée n'est JAMAIS redéposée ;
 *  - ISOLATION : l'échec d'UNE pièce n'empêche ni les autres pièces ni la réponse (motif renseigné, on continue).
 * L'ordre des lignes (par id) reflète l'ordre d'insertion, donc l'ordre de `pieces`.
 */
export async function deposerEtLierPieces(
  reponseId: number, demandeId: number | null, pieces: PieceAvecContenu[], tailleMaxOctets: number,
  deposer: FnDeposer = deposerReel,
): Promise<BilanDepot> {
  const { rows } = await query<{ id: number; cle_stockage: string | null }>(
    `SELECT id, cle_stockage FROM demande_reponse_piece WHERE reponse_id = $1 ORDER BY id`, [reponseId]);
  let deposees = 0, nonDeposees = 0;
  const n = Math.min(rows.length, pieces.length);
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    const p = pieces[i];
    if (row.cle_stockage !== null) { deposees += 1; continue; } // IDEMPOTENCE : déjà déposée → jamais redéposée
    try {
      const res = await deposer(p.contenu, p.typeMime, { demandeId, reponseId, tailleMaxOctets });
      if (res.depose) {
        await query(
          `UPDATE demande_reponse_piece SET cle_stockage = $2, taille_octets = $3, empreinte_sha256 = $4, stocke_le = now(), motif_non_stocke = NULL WHERE id = $1`,
          [row.id, res.cle, res.taille, res.empreinte]);
        deposees += 1;
      } else {
        await query(`UPDATE demande_reponse_piece SET motif_non_stocke = $2 WHERE id = $1`, [row.id, res.motif]);
        nonDeposees += 1;
      }
    } catch (e) {
      // ISOLATION : l'échec d'UNE pièce (S3 indisponible…) ne fait pas échouer les autres ni la réponse.
      const motif = e instanceof Error ? e.message : String(e);
      try { await query(`UPDATE demande_reponse_piece SET motif_non_stocke = $2 WHERE id = $1`, [row.id, `échec de dépôt : ${motif}`]); } catch { /* best-effort */ }
      nonDeposees += 1;
    }
  }
  return { deposees, nonDeposees };
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
    await synchroniserTraiteeDemande(q, demandeId); // T1 — tous statués → réponse traitée
    return true;
  });
}

/**
 * R5b — ANNULE la satisfaction d'UN dossier (revient en arrière sur un marquage erroné : un dossier faussement « obtenu »
 * rendrait la demande « répondue » à tort et stopperait le suivi de son échéance). Remet les TROIS colonnes à NULL et
 * journalise l'auteur (append-only, sans toucher demande.statut). Idempotent : ne fait rien si le dossier n'était pas satisfait.
 */
export async function demarquerDossier(demandeId: number, dossierId: number, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q(
      `UPDATE demande_dossier SET satisfait_le = NULL, satisfait_par = NULL, reponse_id = NULL
        WHERE demande_id = $1 AND dossier_id = $2 AND actif AND satisfait_le IS NOT NULL`,
      [demandeId, dossierId],
    );
    if ((res.rowCount ?? 0) === 0) return false;
    await q(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur)
       VALUES ($1, NULL, NULL, $2, $3)`,
      [demandeId, `dossier ${dossierId} : satisfaction annulée à la main`, auteur],
    );
    await synchroniserTraiteeDemande(q, demandeId); // T1 — dé-statuer rouvre la réponse (réversibilité)
    return true;
  });
}

// ── T1 : statuer un dossier ligne par ligne (triage, refus exprès, retrait) + « tous statués → réponse traitée » ─────────

/**
 * T1 — « tous les dossiers statués → réponse(s) traitée(s) », ET SA RÉVERSIBILITÉ. Un dossier ACTIF est STATUÉ s'il est reçu
 * (satisfait_le) OU trié (triage). Tous les actifs statués → ferme AUTOMATIQUEMENT les réponses rattachées non traitées
 * (`traite_auto=true`) ; sinon → ROUVRE UNIQUEMENT ce que la synchro avait fermé (`WHERE traite_auto`), pour ne JAMAIS piétiner
 * une fermeture MANUELLE (action `traiter`, `traite_auto=false`). Opère DANS la transaction de l'appelant. `bool_and` sur 0
 * dossier actif → NULL → coalesce(false) (une demande vidée n'est pas « traitée » toute seule).
 */
async function synchroniserTraiteeDemande(q: RequeteTx, demandeId: number): Promise<void> {
  const { rows } = await q<{ tous: boolean }>(
    `SELECT coalesce(bool_and(satisfait_le IS NOT NULL OR triage IS NOT NULL), false) AS tous
       FROM demande_dossier WHERE demande_id = $1 AND actif`,
    [demandeId],
  );
  if (rows[0]?.tous === true) {
    await q(`UPDATE demande_reponse SET traite_le = now(), traite_auto = true, maj_le = now() WHERE demande_id = $1 AND traite_le IS NULL`, [demandeId]);
  } else {
    // Réouverture CIBLÉE : uniquement les fermetures AUTOMATIQUES (jamais une fermeture manuelle via l'action `traiter`).
    await q(`UPDATE demande_reponse SET traite_le = NULL, traite_auto = false, maj_le = now() WHERE demande_id = $1 AND traite_le IS NOT NULL AND traite_auto`, [demandeId]);
  }
}

/** T1 — journalise un geste de statut de dossier (append-only, sans toucher demande.statut). */
async function journaliserGesteDossier(q: RequeteTx, demandeId: number, dossierId: number, motif: string, auteur: string): Promise<void> {
  await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
    [demandeId, `dossier ${dossierId} : ${motif}`, auteur]);
}

/**
 * T1 — « NON FOURNI » : la mairie a été saisie mais n'a pas livré ce dossier → simple TRIAGE, il RESTE DÛ (échéance, relance,
 * CADA tacite inchangés). Garde : dossier ACTIF, NON reçu, NON déjà trié. Journalisé. Réversible via `annulerTriageDossier`.
 */
export async function marquerDossierNonFourni(demandeId: number, dossierId: number, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q(
      `UPDATE demande_dossier SET triage = 'non_fourni', triage_le = now(), refus_le = NULL
        WHERE demande_id = $1 AND dossier_id = $2 AND actif AND satisfait_le IS NULL AND triage IS NULL`,
      [demandeId, dossierId]);
    if ((res.rowCount ?? 0) === 0) return false;
    await journaliserGesteDossier(q, demandeId, dossierId, 'marqué NON FOURNI (reste dû)', auteur);
    await synchroniserTraiteeDemande(q, demandeId);
    return true;
  });
}

/**
 * T1 — « REFUS MAIRIE » (refus exprès) : ouvre la CADA immédiatement. `refusLe` = date de NOTIFICATION du refus (ancre
 * juridique R.343-1), validée NON future par l'appelant. Garde : dossier ACTIF, NON reçu, NON déjà trié. Journalisé.
 * Réversible via `annulerTriageDossier`.
 */
export async function marquerDossierRefusMairie(demandeId: number, dossierId: number, refusLe: string, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q(
      `UPDATE demande_dossier SET triage = 'refus_mairie', triage_le = now(), refus_le = $3::date
        WHERE demande_id = $1 AND dossier_id = $2 AND actif AND satisfait_le IS NULL AND triage IS NULL`,
      [demandeId, dossierId, refusLe]);
    if ((res.rowCount ?? 0) === 0) return false;
    await journaliserGesteDossier(q, demandeId, dossierId, `REFUS EXPRÈS de la mairie (notifié le ${refusLe}) — CADA ouverte`, auteur);
    await synchroniserTraiteeDemande(q, demandeId);
    return true;
  });
}

/** T1 — annule un triage ('non_fourni' ou 'refus_mairie') : remet les 3 colonnes à NULL. Garde : dossier ACTIF et TRIÉ.
 *  Journalisé. Dé-statuer rouvre la réponse (via synchroniser). */
export async function annulerTriageDossier(demandeId: number, dossierId: number, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q(
      `UPDATE demande_dossier SET triage = NULL, triage_le = NULL, refus_le = NULL
        WHERE demande_id = $1 AND dossier_id = $2 AND actif AND triage IS NOT NULL`,
      [demandeId, dossierId]);
    if ((res.rowCount ?? 0) === 0) return false;
    await journaliserGesteDossier(q, demandeId, dossierId, 'triage annulé', auteur);
    await synchroniserTraiteeDemande(q, demandeId);
    return true;
  });
}

/**
 * T1 — « RETIRER de la demande » : le dossier n'a jamais été réellement pris en charge → DÉTACHÉ (actif=false), redevient
 * demandable (réapparaît dans « À demander »). ⚠️ CORRECTION de la demande, journalisée. Garde ABSOLUE : jamais un dossier
 * SATISFAIT (retirer le dernier dû ne doit pas emporter l'obtenu). Le triage est effacé (le dossier quitte la demande).
 * Réversible via `reattacherDossierDemande` (conflict-safe).
 */
export async function retirerDossierDemande(demandeId: number, dossierId: number, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q(
      `UPDATE demande_dossier SET actif = false, triage = NULL, triage_le = NULL, refus_le = NULL
        WHERE demande_id = $1 AND dossier_id = $2 AND actif AND satisfait_le IS NULL`,
      [demandeId, dossierId]);
    if ((res.rowCount ?? 0) === 0) return false;
    await journaliserGesteDossier(q, demandeId, dossierId, 'RETIRÉ de la demande (détaché, redevient demandable)', auteur);
    await synchroniserTraiteeDemande(q, demandeId);
    return true;
  });
}

/** Compte rendu d'un ré-attachement de dossier retiré (réversibilité de « retirer »). */
export type ResultatReattachement = 'reattache' | 'introuvable' | 'conflit';

/**
 * T1 — ANNULE un retrait : ré-attache le dossier (actif=true), CONFLICT-SAFE (motif B1) : refusé si le dossier est déjà actif
 * sur une AUTRE demande (index unique partiel `demande_dossier_unique_actif`) → renvoie 'conflit', JAMAIS un UPDATE nu qui
 * planterait en 23505. 'introuvable' si aucun lien inactif à ré-attacher. Journalisé. Le dossier revient « dû ».
 */
export async function reattacherDossierDemande(demandeId: number, dossierId: number, auteur: string): Promise<ResultatReattachement> {
  return withTransaction(async (q) => {
    const conflit = await q<{ demande_id: number }>(
      `SELECT demande_id FROM demande_dossier WHERE dossier_id = $1 AND actif AND demande_id <> $2 LIMIT 1`,
      [dossierId, demandeId]);
    if ((conflit.rowCount ?? 0) > 0) return 'conflit';
    const res = await q(
      `UPDATE demande_dossier SET actif = true
        WHERE demande_id = $1 AND dossier_id = $2 AND NOT actif`,
      [demandeId, dossierId]);
    if ((res.rowCount ?? 0) === 0) return 'introuvable';
    await journaliserGesteDossier(q, demandeId, dossierId, 'ré-attaché à la demande (retrait annulé)', auteur);
    await synchroniserTraiteeDemande(q, demandeId);
    return 'reattache';
  });
}

/** R5b — statut d'une demande (pour le garde-fou « pas de marquage si close »). `null` si la demande est absente. */
export async function statutDemande(demandeId: number): Promise<string | null> {
  const { rows } = await query<{ statut: string }>(`SELECT statut FROM demande WHERE id = $1`, [demandeId]);
  return rows[0]?.statut ?? null;
}

/** R5b — clé de stockage d'une pièce entrante (pour produire un lien signé côté serveur). `null` si absente ou non déposée. */
export async function lireClePiece(pieceId: number): Promise<string | null> {
  const { rows } = await query<{ cle_stockage: string | null }>(`SELECT cle_stockage FROM demande_reponse_piece WHERE id = $1`, [pieceId]);
  return rows[0]?.cle_stockage ?? null;
}
