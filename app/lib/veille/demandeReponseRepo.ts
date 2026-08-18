/**
 * Accès aux RÉPONSES entrantes des mairies (boucle de retour CRPA, chantier R1). Écrit UNIQUEMENT dans demande_reponse /
 * demande_reponse_piece. ⚠️ N'écrit JAMAIS demande.statut (la clôture est un chantier ultérieur), ne lit aucune boîte, ne
 * dépose aucune pièce. Style calqué sur demandeRepo.ts (query / withTransaction, paramètres liés, aucun `any`).
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import { dossiersSatisfaits, type ReponsePourSatisfaction } from './satisfactionDossier';
import type { ResultatDepotEntrant } from '../stockage';
import { estAccuseAutomatique, referenceCiteeDans, type MessageEntrant } from './rattachementReponse'; // FUS-4 : foyer unique de la nature + comparaison de référence (rattachementReponse est PUR ; l'edge est à sens unique, rattachement→repo est type-only)
import { normaliserReference } from '../sitadel/demandesListe'; // FUS-4 ② : forme normalisée des références (alignée sur la cascade)

export type ProfilBoite = 'entreprise' | 'personne';
export type RattachementMethode = 'message_id' | 'reference_objet' | 'reference_corps' | 'numero_dossier' | 'reference_mairie' | 'manuel' | 'aucun';
/**
 * T3 — NATURE d'un message entrant (liste fermée, cf. migration 096). 'accuse' = accusé de réception automatique (« a écrit »,
 * jamais « a répondu ») ; 'rebond' = non-remise rattachée (preuve, NI « a écrit » NI « a répondu ») ; 'indetermine' (défaut du
 * schéma / état transitoire) = se comporte comme un vrai retour. T7-A — 'documents' / 'autre' = classification fine déduite du
 * CONTENU CAPTÉ (jamais du texte) : la relève ne pose plus jamais 'indetermine' pour un message ordinaire (voir classerNatureContenu).
 */
export type NatureReponse = 'accuse' | 'documents' | 'autre' | 'indetermine' | 'rebond';

/** T7-A — sous-ensemble de NatureReponse déterminé par le CONTENU CAPTÉ d'un message ordinaire (ni accusé ni rebond). */
export type NatureContenu = 'documents' | 'autre';

/**
 * T7-A — nature d'un message ORDINAIRE (ni accusé ni rebond) déduite du CONTENU CAPTÉ, JAMAIS du texte : `documents` = au moins
 * une pièce jointe (ligne demande_reponse_piece présente, STOCKÉE OU refusée au dépôt — la nature décrit ce que la mairie a
 * ENVOYÉ, pas ce qu'on a réussi à garder) OU au moins un lien FORT (L1). Sinon `autre`. 100 % déterministe : aucun mot-clé,
 * aucune IA, aucune heuristique de texte.
 */
export function classerNatureContenu(entree: { nbPieces: number; aLienFort: boolean }): NatureContenu {
  return entree.nbPieces > 0 || entree.aLienFort ? 'documents' : 'autre';
}

/** FUS-4 — normalisation d'un texte pour comparaison de motif : minuscules, sans accents, espaces compactés. PUR. */
function normaliserMotifObjet(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
}
/** FUS-4 — parse la liste de motifs de la config `nature_accuse_motifs` : séparateurs virgule OU retour à la ligne, nettoyée. PUR. */
export function parseMotifsAccuse(brut: string): string[] {
  return brut.split(/[\n,]/).map((m) => m.trim()).filter((m) => m !== '');
}
/** FUS-4 — l'objet contient-il l'un des motifs d'accusé (comparaison NORMALISÉE, sans accents ni casse) ? PUR. */
function objetMatcheMotifAccuse(objet: string | undefined, motifs: string[]): boolean {
  if (!objet || motifs.length === 0) return false;
  const o = normaliserMotifObjet(objet);
  return motifs.some((m) => { const n = normaliserMotifObjet(m); return n !== '' && o.includes(n); });
}

/**
 * FUS-4 — NATURE d'un message entrant, SOURCE UNIQUE partagée par les DEUX relèves (`releverBoite` ET `releverApprofondie`).
 * Cascade à 3 niveaux, dans cet ORDRE (le contenu prime toujours sur l'objet) :
 *   1) accusé automatique (en-tête Auto-Submitted, T3)                        → 'accuse' ;
 *   2) contenu capté — pièce OU lien fort (T7-A)                              → 'documents' (JAMAIS requalifié en accusé) ;
 *   3) FUS-4 : sans pièce ni lien, si l'OBJET contient un motif configuré      → 'accuse' (ex. Paris « Accusé de réception ») ;
 *      sinon                                                                  → 'autre'.
 * `motifsAccuse` vient de la config (pilotage sans code) ; VIDE par défaut → cascade d'AVANT ce lot (aucune requalification).
 * Le texte du corps n'est JAMAIS lu (T7-A) : seuls en-tête, contenu capté, et objet (motif fermé) décident.
 */
export function classerNature(message: MessageEntrant, contenu: { nbPieces: number; aLienFort: boolean }, motifsAccuse: string[] = []): NatureReponse {
  if (estAccuseAutomatique(message)) return 'accuse';
  const parContenu = classerNatureContenu(contenu);
  if (parContenu !== 'autre') return parContenu; // 'documents' : un vrai envoi de docs n'est jamais requalifié
  return objetMatcheMotifAccuse(message.objet, motifsAccuse) ? 'accuse' : 'autre';
}

/**
 * T7-A — natures qu'un HUMAIN peut poser à la main (reclassement d'un message). `rebond` (fait technique de non-remise) et
 * `indetermine` (état transitoire, jamais un choix) sont EXCLUS. Reste dans la liste fermée du CHECK de la migration 096.
 */
export type NatureReclassable = 'accuse' | 'documents' | 'autre';
export const NATURES_RECLASSABLES: readonly NatureReclassable[] = ['accuse', 'documents', 'autre'];
export function estNatureReclassable(v: unknown): v is NatureReclassable {
  return typeof v === 'string' && (NATURES_RECLASSABLES as readonly string[]).includes(v);
}

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
  corpsHtml?: string | null;                 // L1 : corps HTML brut conservé (ré-extraction des liens + audit)
  rattachementMethode?: RattachementMethode; // défaut 'aucun'
  nature?: NatureReponse;                    // T3 : défaut 'indetermine' (message ordinaire = vrai retour)
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
      // T7-A — nature_classee_le (ANCRE T7-B) est posée à now() DÈS l'insert quand la nature est documents/autre : un tel insert
      //   est TOUJOURS un événement live (relève). Le backfill historique (099) passe par un UPDATE SQL direct → reste NULL.
      `INSERT INTO demande_reponse
         (demande_id, profil_boite, message_id, in_reply_to, references_brut, de_adresse, de_nom, objet, recu_le,
          corps_texte, rattachement_methode, rattache_le, note, nature, corps_html, nature_classee_le)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          CASE WHEN $14 IN ('documents', 'autre') THEN now() ELSE NULL END)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [
        r.demandeId ?? null, r.profilBoite, r.messageId, r.inReplyTo ?? null, r.referencesBrut ?? null,
        r.deAdresse, r.deNom ?? null, r.objet ?? null, r.recuLe, r.corpsTexte ?? null,
        r.rattachementMethode ?? 'aucun', r.rattacheLe ?? null, r.note ?? null, r.nature ?? 'indetermine', r.corpsHtml ?? null,
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

/** L1 — un lien candidat extrait d'une réponse (forme de sortie d'`extractionLiens.analyserLiensReponse`). */
export interface LienReponseEntrant {
  url: string;
  fort: boolean;
  expireLe: Date | null;
  expirationSource: 'absolue' | 'relative' | null;
  expirationIndice: string | null;
}

/**
 * L1 — enregistre les liens candidats d'une réponse déjà écrite. IDEMPOTENT (`ON CONFLICT (reponse_id, url) DO NOTHING`) : une
 * seconde relève du même message n'insère aucun doublon. N'écrit QUE demande_reponse_lien. Renvoie le nombre de liens insérés.
 * ⚠️ N'OUVRE JAMAIS de connexion réseau vers une URL captée (règle dure L1) : ce n'est que de l'écriture en base.
 */
export async function enregistrerLiensReponse(reponseId: number, liens: LienReponseEntrant[]): Promise<number> {
  let inseres = 0;
  for (const l of liens) {
    const res = await query(
      `INSERT INTO demande_reponse_lien (reponse_id, url, fort, expire_le, expiration_source, expiration_indice)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (reponse_id, url) DO NOTHING`,
      [reponseId, l.url, l.fort, l.expireLe, l.expirationSource, l.expirationIndice],
    );
    inseres += res.rowCount ?? 0;
  }
  return inseres;
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
 * T4 — rattachement manuel REFUSÉ vers une demande NON envoyée (brouillon/prête) : un tel message relève de la file « Dépôts à
 * confirmer » (confirmer le dépôt bascule la demande, avec la date saisie), jamais d'un rattachement à une demande qui n'est pas
 * partie (le modèle « réponse = réplique d'une demande envoyée » serait violé). Motif explicite, jamais un échec muet.
 */
export class RattachementNonEnvoyeeError extends Error {
  constructor(public statut: string) {
    super(`demande « ${statut} » : le rattachement manuel est réservé aux demandes envoyées — confirmez d'abord le dépôt (« cette demande a-t-elle été déposée ? »)`);
    this.name = 'RattachementNonEnvoyeeError';
  }
}

/**
 * FUS — FOYER UNIQUE de l'invariant téléservice : `envoye_le` d'un dépôt 'formulaire' ne peut JAMAIS être postérieur au PREMIER
 * accusé rattaché à la demande. Rejoue le prédicat de la migration 127 À CHAUD, à chaque fois qu'un accusé se rattache/reclasse
 * APRÈS le clic « marquer déposée » (l'ordre réel étant dépôt → accusé → relève → rattachement, le clamp posé à l'écriture de
 * `marquerDeposee` ne mordait presque jamais — cas 000157/233). DOIT tourner DANS la transaction de l'appelant (nature et date
 * bougent ensemble ou pas du tout).
 *
 * GARANTIES structurelles, portées par le SEUL prédicat (comme la migration 127) :
 *   • MONOTONIE : ne fait que RECULER (`a.envoye_le > sub.borne`) — un accusé reclassé « autre » ou détaché fait disparaître la
 *     borne mais ne REMONTE jamais la date ;
 *   • IDEMPOTENCE : après correction `envoye_le = borne` ⇒ « > » faux ⇒ 2ᵉ passage = 0 ligne, aucun journal ;
 *   • aucun accusé ⇒ borne NULL ⇒ 0 ligne (le clic reste la seule ancre) ;
 *   • canal 'formulaire' UNIQUEMENT → le canal e-mail (émission SMTP réelle, `envoiDemande`) n'est JAMAIS touché.
 * Chaque re-clamp EFFECTIF est journalisé (ancienne → nouvelle valeur, cause) dans demande_journal (statut_avant/apres NULL, comme
 * une écriture d'événement, cf. dossiers satisfaits/relance auto). Le `RETURNING` remonte l'ANCIENNE valeur (via la sous-requête
 * FROM) → on ne journalise QUE ce qui a effectivement bougé. Renvoie true si ≥ 1 ligne a reculé.
 */
export async function reclamperEnvoyeLe(q: RequeteTx, demandeId: number, auteur: string): Promise<boolean> {
  const res = await q<{ ancien: string; nouveau: string }>(
    `UPDATE demande_acheminement a
        SET envoye_le = sub.borne, maj_a = now()
       FROM (
         SELECT a2.id, a2.envoye_le AS ancien,
                (SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = a2.demande_id AND r.nature = 'accuse') AS borne
           FROM demande_acheminement a2
          WHERE a2.demande_id = $1 AND a2.canal = 'formulaire' AND a2.statut = 'envoye'
       ) sub
      WHERE a.id = sub.id AND sub.borne IS NOT NULL AND a.envoye_le > sub.borne
      RETURNING sub.ancien::text AS ancien, a.envoye_le::text AS nouveau`,
    [demandeId],
  );
  for (const ligne of res.rows) {
    await q(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [demandeId, `envoye_le re-plafonné au 1er accusé (téléservice) : ${ligne.ancien} → ${ligne.nouveau}`, auteur],
    );
  }
  return res.rows.length > 0;
}

/**
 * Rattache À LA MAIN une réponse à une demande : pose demande_id, rattachement_methode='manuel', rattache_le=now(), et
 * consigne l'auteur dans `note` (append). Ne touche PAS demande.statut. T4 : GARDE de statut (repo) — refus si brouillon/prête.
 * Renvoie true si une ligne a été mise à jour.
 */
export async function rattacherAMain(reponseId: number, demandeId: number, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const st = await q<{ statut: string }>(`SELECT statut FROM demande WHERE id = $1`, [demandeId]);
    const statut = st.rows[0]?.statut;
    if (statut === 'brouillon' || statut === 'prete') throw new RattachementNonEnvoyeeError(statut); // T4 — garde repo
    const res = await q(
      `UPDATE demande_reponse
          SET demande_id = $2, rattachement_methode = 'manuel', rattache_le = now(), maj_le = now(),
              note = btrim(coalesce(note || chr(10), '') || $3)
        WHERE id = $1`,
      [reponseId, demandeId, `rattaché à la main par ${auteur}`],
    );
    const ok = (res.rowCount ?? 0) > 0;
    // FUS — le message rattaché peut être un accusé (ou la demande en porter un) : re-plafonne envoye_le au 1er accusé. No-op si
    //   aucun accusé, ou si la date est déjà conforme (idempotent/monotone, cf. reclamperEnvoyeLe). MÊME transaction.
    if (ok) await reclamperEnvoyeLe(q, demandeId, auteur);
    return ok;
  });
}

/**
 * FUS-4 ② — RE-TENTE le rattachement des messages NON rattachés qui citent `reference`, dès qu'elle est saisie sur `demandeId`
 * (l'accusé arrive parfois AVANT que sa référence soit connue — cas 233). Réutilisable par tout second appelant (ex. la greffe
 * de référence de marquerDeposee), sans dépendance à la route. Renvoie le nombre de messages effectivement rattachés.
 *
 * GARDES (dans cet ordre) :
 *   1. plancher de longueur (≥ 6 après normalisation, via referenceCiteeDans) → sinon 0, aucune écriture ;
 *   2. AMBIGUÏTÉ (dette P1 : UNIQUE(demande_id, reference), pas global) : la référence NORMALISÉE doit désigner EXACTEMENT une
 *      demande de statut IN ('envoyee','close'), ET que ce soit `demandeId` → sinon 0 (on ne devine pas). Exclut aussi le cas
 *      d'une cible brouillon/prête (elle n'est pas dans l'ensemble → ≠ 1) ;
 *   3. ne touche QUE les messages `demande_id IS NULL` (WHERE explicite) → ne VOLE jamais un message déjà rattaché ailleurs.
 * Match sur `objet + '\n' + corps_texte` — ALIGNÉ MOT POUR MOT sur la cascade (pas de corps_html ; cf. referenceCiteeDans).
 * N'écrit QUE `demande_reponse` (jamais statut / envoye_le / demande_acheminement). Méthode 'reference_differee' (migration 126).
 */
export async function retenterRattachementParReference(demandeId: number, reference: string, auteur: string): Promise<number> {
  const refN = normaliserReference(reference);
  if (refN.length < 6) return 0; // plancher : un code court ne rattache jamais (aligné cascade)
  return withTransaction(async (q) => {
    // Garde d'ambiguïté : quelles demandes ENVOYÉES/CLOSES portent cette référence (comparée en NORMALISÉ) ?
    const refs = await q<{ demande_id: number; reference: string }>(
      `SELECT re.demande_id::int AS demande_id, re.reference
         FROM demande_reference_externe re JOIN demande d ON d.id = re.demande_id
        WHERE d.statut IN ('envoyee', 'close')`);
    const cibles = new Set(refs.rows.filter((r) => normaliserReference(r.reference) === refN).map((r) => r.demande_id));
    if (cibles.size !== 1 || !cibles.has(demandeId)) return 0; // ≠ 1 demande, ou pas la cible → on ne tranche pas

    // Candidats : messages NON rattachés dont l'objet + corps_texte cite la référence.
    const cand = await q<{ id: number; objet: string | null; corps_texte: string | null }>(
      `SELECT id::int AS id, objet, corps_texte FROM demande_reponse WHERE demande_id IS NULL`);
    let rattaches = 0;
    for (const m of cand.rows) {
      if (!referenceCiteeDans(refN, `${m.objet ?? ''}\n${m.corps_texte ?? ''}`)) continue;
      const res = await q(
        `UPDATE demande_reponse
            SET demande_id = $2, rattachement_methode = 'reference_differee', rattache_le = now(), maj_le = now(),
                note = btrim(coalesce(note || chr(10), '') || $3)
          WHERE id = $1 AND demande_id IS NULL`, // idempotent : ne vole jamais un message déjà rattaché
        [m.id, demandeId, `rattaché par référence (différé) par ${auteur}`]);
      rattaches += res.rowCount ?? 0;
    }
    // FUS — l'accusé arrive parfois AVANT sa référence (cas 233) : dès qu'il est rattaché ici, re-plafonner envoye_le au 1er
    //   accusé. No-op si aucun message rattaché (ou aucun accusé). MÊME transaction que le rattachement.
    if (rattaches > 0) await reclamperEnvoyeLe(q, demandeId, auteur);
    return rattaches;
  });
}

/**
 * T7-A — RECLASSE À LA MAIN la nature d'un message (gabarit `action + reponseId`, comme rattacherAMain). Cibles autorisées :
 * accuse | documents | autre — jamais rebond ni indetermine (garde de type `NatureReclassable` + validation côté route). Pose
 * l'ANCRE nature_classee_le (now() pour documents/autre — un reclassement manuel EST un événement ; NULL sinon) et consigne
 * l'auteur dans `note` (append). Ne touche PAS demande.statut, ne pose aucun satisfait_le, ne bascule rien vers Archives.
 * Renvoie true si une ligne a été mise à jour. La liste fermée du CHECK (migration 096) reste respectée.
 */
export async function reclasserNatureReponse(reponseId: number, nature: NatureReclassable, auteur: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const res = await q<{ demande_id: number | null }>(
      `UPDATE demande_reponse
          SET nature = $2,
              nature_classee_le = CASE WHEN $2 IN ('documents', 'autre') THEN now() ELSE NULL END,
              maj_le = now(),
              note = btrim(coalesce(note || chr(10), '') || $3)
        WHERE id = $1
        RETURNING demande_id`,
      [reponseId, nature, `nature reclassée « ${nature} » par ${auteur}`],
    );
    const ok = (res.rowCount ?? 0) > 0;
    // FUS — reclasser EN 'accuse' un message DÉJÀ rattaché crée une borne → re-plafonne envoye_le. Un reclassement HORS accusé
    //   ne touche jamais la date : la borne disparaît, mais la MONOTONIE du foyer interdit toute remontée (donc on ne l'appelle
    //   même pas). Message non rattaché (demande_id NULL) → rien à plafonner. MÊME transaction que le reclassement.
    if (ok && nature === 'accuse') {
      const demandeId = res.rows[0]?.demande_id ?? null;
      if (demandeId !== null) await reclamperEnvoyeLe(q, demandeId, auteur);
    }
    return ok;
  });
}

/**
 * T7-B (cas ③) — marque un message « RÉPONDU » à la main (bouton MANUEL). Pose repondu_le=now() + repondu_par, et consigne
 * l'auteur dans `note` (append). Idempotent (ne fait rien si déjà répondu). Ne touche PAS demande.statut, ne pose aucun
 * satisfait_le, ne bascule rien vers Archives. Renvoie true si la transition a eu lieu. La détection auto = T7-C.
 */
export async function marquerRepondu(reponseId: number, auteur: string): Promise<boolean> {
  const res = await query(
    `UPDATE demande_reponse
        SET repondu_le = now(), repondu_par = $2, maj_le = now(),
            note = btrim(coalesce(note || chr(10), '') || $3)
      WHERE id = $1 AND repondu_le IS NULL`,
    [reponseId, auteur, `marqué « répondu » par ${auteur}`],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * T7-B (cas ③) — ANNULE le marquage « répondu » (réversibilité : un marquage erroné rendrait la ligne « traitée » à tort et
 * ferait disparaître le signal). Remet repondu_le/repondu_par à NULL et journalise l'auteur. Idempotent (ne fait rien si non
 * répondu). Ne touche PAS demande.statut, ni satisfait_le, ni Archives. Renvoie true si la transition a eu lieu.
 */
export async function annulerRepondu(reponseId: number, auteur: string): Promise<boolean> {
  const res = await query(
    `UPDATE demande_reponse
        SET repondu_le = NULL, repondu_par = NULL, maj_le = now(),
            note = btrim(coalesce(note || chr(10), '') || $2)
      WHERE id = $1 AND repondu_le IS NOT NULL`,
    [reponseId, `« répondu » annulé par ${auteur}`],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * T7-C — PRÉ-COCHE « répondu » automatiquement (le SYSTÈME a détecté une réponse partie vers la mairie dans le dossier envoyés).
 * Pose repondu_le=now() ET l'ancre repondu_auto_le=now() ; laisse repondu_par À NULL (le fait « auto » se lit sur repondu_auto_le,
 * repondu_par reste réservé à l'humain). GARDE anti-résurrection : n'agit QUE si repondu_le IS NULL ET repondu_auto_le IS NULL —
 * une ligne déjà répondue, ou déjà auto-cochée puis annulée par l'humain, n'est JAMAIS re-cochée. Ne remplace pas le bouton
 * manuel ; ne touche NI demande.statut NI satisfait_le NI Archives. Renvoie true si la transition a eu lieu.
 */
export async function marquerReponduAuto(reponseId: number): Promise<boolean> {
  const res = await query(
    `UPDATE demande_reponse
        SET repondu_le = now(), repondu_auto_le = now(), maj_le = now()
      WHERE id = $1 AND repondu_le IS NULL AND repondu_auto_le IS NULL`,
    [reponseId],
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

/** T4 — jour de réception d'un message (`recu_le::date`), pour BORNER côté serveur la date de dépôt saisie (le dépôt précède le message). `null` si le message est absent. */
export async function lireRecuLeReponse(reponseId: number): Promise<string | null> {
  const { rows } = await query<{ recu_le: string }>(`SELECT recu_le::date::text AS recu_le FROM demande_reponse WHERE id = $1`, [reponseId]);
  return rows[0]?.recu_le ?? null;
}

/** R5b — clé de stockage d'une pièce entrante (pour produire un lien signé côté serveur). `null` si absente ou non déposée. */
export async function lireClePiece(pieceId: number): Promise<{ cle: string; nomFichier: string } | null> {
  // N6-E — renvoie aussi `nom_fichier` (nom de téléchargement forcé). `null` si absente ou pas encore déposée (cle NULL).
  const { rows } = await query<{ cle_stockage: string | null; nom_fichier: string }>(`SELECT cle_stockage, nom_fichier FROM demande_reponse_piece WHERE id = $1`, [pieceId]);
  const r = rows[0];
  return r && r.cle_stockage !== null ? { cle: r.cle_stockage, nomFichier: r.nom_fichier } : null;
}
