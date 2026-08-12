import type { QueryResult, QueryResultRow } from 'pg';
import type { ReponseEntrante, BilanDepot, PieceAvecContenu } from '../veille/demandeReponseRepo';

/**
 * DÉMO — cœur PUR/testable d'une simulation « réponse de mairie avec pièces ». Le CLI (app/scripts/demo-reponse.ts) injecte les
 * dépendances RÉELLES (base + repos de PRODUCTION + stockage) ; ici tout est déterministe et mockable (aucun import runtime lourd
 * → n'alourdit pas le graphe F2 du script). GARANTIES :
 *  - la demande créée est FICTIVE et NETTEMENT identifiable : référence sentinelle (année 9999, impossible en vrai) + libellés
 *    « DÉMO » ; rien ne peut la confondre avec une procédure CRPA réelle (119, 154, …) ;
 *  - le DÉPÔT des pièces passe par le CHEMIN DE PRODUCTION (`deposerEtLierPieces`) — JAMAIS d'écriture directe au stockage ;
 *  - la SUPPRESSION est scellée sur l'id de CETTE demande (trouvée par sa référence sentinelle), scope `demande_id`, idempotente.
 *
 * ⚠️ La colonne `demande.reference` impose `^SVAV-DEM-\d{4}-\d{6}$` (CHECK en base) : impossible d'y écrire « DÉMO ». La marque
 * fictive passe donc par l'ANNÉE 9999 (référence) et par les libellés libres (objet/corps/note/dest_nom), tous porteurs de « DÉMO ».
 */

// ── Sentinelles (rendent la nature fictive évidente ET scellent le périmètre de suppression) ───────────────────────────
export const REFERENCE_DEMO = 'SVAV-DEM-9999-000001';                 // année 9999 = marqueur (le CHECK interdit « DÉMO » dans la référence)
export const MESSAGE_ID_DEMO = '<demo-reponse-9999@sansvisavis.local>'; // UNIQUE (demande_reponse.message_id) → jamais un vrai message
export const OBJET_DEMANDE_DEMO = 'DÉMO — NE PAS TRAITER — demande de communication (simulation)';
export const OBJET_REPONSE_DEMO = 'DÉMO — RE: votre demande de communication (simulation)';
export const CORPS_DEMANDE_DEMO =
  'DÉMO — Demande FICTIVE créée par « npm run demo:reponse:creer » pour valider l’écran. À effacer par « npm run demo:reponse:supprimer ». Ne correspond à AUCUNE procédure réelle.';
export const DEST_NOM_DEMO = 'DÉMO — mairie fictive (ne pas contacter)';
export const DEST_EMAIL_DEMO = 'demo@mairie-fictive.invalid';         // TLD .invalid réservé → ne route jamais
export const NOTE_DEMO = 'DÉMO — demande de démonstration, effaçable intégralement (lignes + objets de stockage) par demo:reponse:supprimer.';
export const AUTEUR_DEMO = 'demo:reponse';
/** Noms de pièces comme les nommerait une mairie (PC2/PC3), avec « DÉMO » explicite. */
export const NOMS_PIECES_DEMO = ['PC2 - plan de masse (DÉMO).pdf', 'PC3 - plan de coupe (DÉMO).pdf'];
export const TAILLE_MAX_DEMO_OCTETS = 25 * 1024 * 1024;              // borne large ; les PDF générés font quelques Ko

// ── Gardes d'exécution (le CLI refuse de tourner si l'un échoue) ───────────────────────────────────────────────────────
/** « Ressemble à de la production » = NODE_ENV commençant par « prod » (production, prod…). Test retenu : refus par défaut dès que ça y ressemble. */
export function estProduction(nodeEnv: string | undefined): boolean {
  return /^prod/i.test((nodeEnv ?? '').trim());
}
/**
 * Base LOCALE = hôte de BOUCLAGE uniquement (localhost / 127.0.0.1 / ::1), ou socket UNIX (pas d'hôte). Test retenu : on parse
 * `DATABASE_URL` et on n'AUTORISE QUE ces hôtes — un refus par défaut (URL illisible, hôte distant, absente) est plus sûr qu'une
 * autorisation par défaut. Toute base distante (RDS, Supabase, …) est ainsi refusée.
 */
export function estBaseLocale(url: string | undefined): boolean {
  if (!url || url.trim() === '') return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const h = u.hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || h === '';
}

// ── Sélection d'un dossier SÛR ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * Un dossier est SÛR s'il n'a AUCUN rattachement ACTIF : c'est l'exact COMPLÉMENT de l'index partiel unique
 * `demande_dossier_unique_actif ON demande_dossier (dossier_id) WHERE actif` (053_demande.sql:73) — un dossier rattaché à une
 * demande active est retiré du stock demandable, donc jamais choisi ici → on ne peut PAS voler le dossier d'une procédure vivante,
 * ni violer l'unicité en le rattachant. `JOIN commune` : garantit un `code_insee` valide pour la FK `demande.code_insee`.
 */
export const SQL_DOSSIER_SUR = `
  SELECT s.id::int AS dossier_id, s.num_dau, s.code_insee, c.nom AS commune_nom
    FROM sitadel_dossier s
    JOIN commune c ON c.code_insee = s.code_insee
   WHERE NOT EXISTS (SELECT 1 FROM demande_dossier dd WHERE dd.dossier_id = s.id AND dd.actif)
   ORDER BY s.id
   LIMIT 1`;

// ── PDF minimal VALIDE, généré à la volée (aucune dépendance) : une page, un titre. xref à offsets calculés. ─────────────
export function pdfDemo(titre: string): Buffer {
  const t = titre.replace(/([\\()])/g, '\\$1'); // échappe \\ ( ) pour la chaîne PDF
  const flux = `BT /F1 14 Tf 24 96 Td (${t}) Tj 0 -28 Td /F1 10 Tf (Document PDF de DEMONSTRATION - sans valeur.) Tj ET`;
  const objets = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 360 140]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${Buffer.byteLength(flux, 'latin1')}>>stream\n${flux}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objets.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer<</Size ${objets.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// ── Dépendances injectées (le CLI passe les fonctions RÉELLES ; les tests, des mocks) ──────────────────────────────────
export type FnRequete = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<R>>;
export interface DepsCreation {
  query: FnRequete;
  withTransaction: <T>(fn: (q: FnRequete) => Promise<T>) => Promise<T>;
  enregistrerReponse: (r: ReponseEntrante) => Promise<number | null>;
  deposerEtLierPieces: (reponseId: number, demandeId: number | null, pieces: PieceAvecContenu[], tailleMaxOctets: number) => Promise<BilanDepot>;
  stockageConfigure: () => boolean;
  maintenant: Date;
}
export interface DepsSuppression {
  query: FnRequete;
  withTransaction: <T>(fn: (q: FnRequete) => Promise<T>) => Promise<T>;
  supprimer: (cle: string) => Promise<void>;
}
export interface ResultatCreation {
  demandeId: number; reference: string; dossierId: number; numDau: string; communeNom: string | null; reponseId: number; bilan: BilanDepot;
}
export interface ResultatSuppression { supprime: boolean; demandeId: number | null; objetsStockage: number; }

/** DÉMO déjà présente ? (référence sentinelle). Lecture seule. */
async function idDemoExistant(query: FnRequete): Promise<number | null> {
  const r = await query<{ id: number }>('SELECT id FROM demande WHERE reference = $1', [REFERENCE_DEMO]);
  return r.rows[0]?.id ?? null;
}

/**
 * Crée la démo. Ordre : (1) squelette demande + dossier + journal + acheminement en UNE transaction (aucune fonction de
 * production ne crée une demande sur un dossier CHOISI avec une référence « DÉMO » → insert direct, isolé, sentinelle) ; (2)
 * réponse rattachée + métadonnées de pièces via la fonction de PRODUCTION `enregistrerReponse` (sa propre transaction) ; (3) DÉPÔT
 * des deux PDF par la fonction de PRODUCTION `deposerEtLierPieces` (→ MinIO/S3). En cas d'échec après (1), `supprimerDemo` nettoie.
 */
export async function creerDemo(deps: DepsCreation): Promise<ResultatCreation> {
  if (!deps.stockageConfigure()) {
    throw new Error('Stockage objet (MinIO/S3) non configuré : la démo dépose de VRAIES pièces. Renseigne S3_* dans .env, puis relance.');
  }
  const dejaLa = await idDemoExistant(deps.query);
  if (dejaLa !== null) throw new Error(`Démo déjà présente (demande #${dejaLa}, ${REFERENCE_DEMO}). Lance d’abord « npm run demo:reponse:supprimer ».`);

  const sel = await deps.query<{ dossier_id: number; num_dau: string; code_insee: string; commune_nom: string | null }>(SQL_DOSSIER_SUR);
  const dossier = sel.rows[0];
  if (!dossier) throw new Error('Aucun dossier sûr disponible (tous rattachés à une demande active).');

  const envoyeLe = deps.maintenant;
  const recuLe = new Date(envoyeLe.getTime() + 7 * 24 * 3_600_000); // la réponse « arrive » 7 j après l'émission (réception ⩾ envoi)

  const demandeId = await deps.withTransaction(async (q) => {
    const dem = await q<{ id: number }>(
      `INSERT INTO demande (reference, code_insee, statut, objet, corps, dest_canal, dest_email, dest_nom, note)
       VALUES ($1, $2, 'envoyee', $3, $4, 'email', $5, $6, $7) RETURNING id`,
      [REFERENCE_DEMO, dossier.code_insee, OBJET_DEMANDE_DEMO, CORPS_DEMANDE_DEMO, DEST_EMAIL_DEMO, DEST_NOM_DEMO, NOTE_DEMO],
    );
    const id = dem.rows[0].id;
    await q('INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)', [id, dossier.dossier_id]);
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, 'envoyee', $2, $3)`,
      [id, 'DÉMO — création + émission simulée', AUTEUR_DEMO]);
    // Acheminement daté (ancre d'échéance). canal='email' (CHECK 070 : email|recommande), statut='envoye'.
    await q(`INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le) VALUES ($1, 'email', 'envoye', $2)`, [id, envoyeLe]);
    return id;
  });

  // Réponse RATTACHÉE + 2 pièces (métadonnées) — chemin de PRODUCTION, jamais un insert maison.
  const reponseId = await deps.enregistrerReponse({
    demandeId, profilBoite: 'entreprise', messageId: MESSAGE_ID_DEMO, deAdresse: DEST_EMAIL_DEMO, deNom: DEST_NOM_DEMO,
    objet: OBJET_REPONSE_DEMO, recuLe, corpsTexte: `DÉMO — réponse fictive concernant le dossier ${dossier.num_dau}. Pièces jointes ci-dessous.`,
    rattachementMethode: 'manuel', rattacheLe: recuLe, note: NOTE_DEMO,
    pieces: NOMS_PIECES_DEMO.map((nom) => ({ nomFichier: nom, typeMime: 'application/pdf' })),
  });
  if (reponseId === null) throw new Error(`Réponse démo déjà en base (message_id ${MESSAGE_ID_DEMO}) — lance « npm run demo:reponse:supprimer ».`);

  // DÉPÔT réel des deux PDF (chemin de PRODUCTION → MinIO/S3). Ordre des contenus = ordre des métadonnées (deposerEtLierPieces apparie par id croissant).
  const bilan = await deps.deposerEtLierPieces(
    reponseId, demandeId,
    NOMS_PIECES_DEMO.map((nom) => ({ nomFichier: nom, typeMime: 'application/pdf', contenu: pdfDemo(nom) })),
    TAILLE_MAX_DEMO_OCTETS,
  );

  return { demandeId, reference: REFERENCE_DEMO, dossierId: dossier.dossier_id, numDau: dossier.num_dau, communeNom: dossier.commune_nom, reponseId, bilan };
}

/**
 * Efface TOUT ce que la démo a produit — et RIEN d'autre. IDEMPOTENT : si la référence sentinelle est absente, ne fait rien.
 * (1) supprime les OBJETS de stockage des pièces de CETTE demande (par leur `cle_stockage`, lues avant l'effacement) ; (2) efface
 * les lignes, scellées sur `demande_id`, dans l'ordre des FK (enfants d'abord ; `demande_reponse` CASCADE ses pièces). Le DELETE
 * final est DOUBLE-GARDÉ par la référence sentinelle → impossible d'atteindre une autre demande.
 */
export async function supprimerDemo(deps: DepsSuppression): Promise<ResultatSuppression> {
  const demandeId = await idDemoExistant(deps.query);
  if (demandeId === null) return { supprime: false, demandeId: null, objetsStockage: 0 }; // rien à faire (idempotent)

  const cles = await deps.query<{ cle_stockage: string }>(
    `SELECT p.cle_stockage FROM demande_reponse_piece p
       JOIN demande_reponse r ON r.id = p.reponse_id
      WHERE r.demande_id = $1 AND p.cle_stockage IS NOT NULL`, [demandeId],
  );
  let objets = 0;
  for (const { cle_stockage } of cles.rows) { await deps.supprimer(cle_stockage); objets += 1; }

  await deps.withTransaction(async (q) => {
    await q('DELETE FROM demande_reponse WHERE demande_id = $1', [demandeId]);      // CASCADE → demande_reponse_piece
    await q('DELETE FROM demande_acheminement WHERE demande_id = $1', [demandeId]);
    await q('DELETE FROM demande_relance WHERE demande_id = $1', [demandeId]);      // au cas où une relance aurait été générée pendant la démo
    await q('DELETE FROM demande_dossier WHERE demande_id = $1', [demandeId]);
    await q('DELETE FROM demande_journal WHERE demande_id = $1', [demandeId]);
    await q('DELETE FROM demande WHERE id = $1 AND reference = $2', [demandeId, REFERENCE_DEMO]); // CASCADE → proposition_cada, demande_reference_externe ; double-garde référence
  });
  return { supprime: true, demandeId, objetsStockage: objets };
}
