/**
 * ORCHESTRATION de la relève des réponses CRPA (chantiers R3 / R3b / R3c / R3d). Testable par INJECTION : la fonction reçoit
 * un `ClientBoite` ; la vraie implémentation IMAP (imapflow/mailparser) vit dans app/lib/email/imap.ts.
 *
 * Sélection SERVEUR (R3c) : une recherche `from:<domaine>` par domaine destinataire (union des UID). Les rebonds (R3d) sont
 * cherchés côté serveur par `from:mailer-daemon` puis `from:postmaster` (le critère IMAP FROM est une SOUS-CHAÎNE
 * insensible à la casse — RFC 3501 §6.4.4 — donc MAILER-DAEMON@retarus.com est bien attrapé par 'mailer-daemon').
 *
 * Rattachement d'un rebond (R3d) : un DSN ne thread pas → on analyse sa charge utile (rapportRejet). Si le Message-ID
 * d'origine ou le destinataire en échec correspond à une demande envoyée, on rattache (CERTAIN) et on bascule
 * demande_acheminement 'envoye' → 'rebond'. Sinon le rebond est ÉTRANGER : il n'est PAS enregistré (garde-fou contre le
 * remplissage de la file « à rattacher » par les rebonds personnels de l'utilisateur).
 *
 * ⚠️ N'écrit JAMAIS demande.statut ('close' reste sans écrivain, chantier R5). Boîte en LECTURE STRICTE (voir imap.ts).
 */
import { query } from '../db/client';
import { enregistrerReponse, enregistrerLiensReponse, marquerDossiersSatisfaitsAuto, deposerEtLierPieces, classerNatureContenu, type ProfilBoite, type RattachementMethode, type NatureReponse, type ReponseEntrante } from './demandeReponseRepo';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { rattacherReponse, estRebondNonRemise, estAccuseAutomatique, type MessageEntrant, type DemandeCandidate } from './rattachementReponse';
import { analyserLiensReponse } from './extractionLiens';
import { analyserRapportRejet, normaliserMessageId, type PartieRapport, type ResultatRapportRejet } from './rapportRejet';
import { normaliserReference } from '../sitadel/demandesListe';

export interface PieceMeta { nomFichier: string; typeMime: string | null; tailleOctets: number | null; contenu: Buffer }

export interface MessageBoite {
  uid: number;
  message: MessageEntrant;
  recuLe: Date;
  deNom: string | null;
  pieces: PieceMeta[];
  partiesRapport?: PartieRapport[]; // sous-parties MIME d'un DSN (message/rfc822, delivery-status) pour rapportRejet
}

/** Critères de recherche SERVEUR. `from` = fragment cherché dans l'en-tête From (sous-chaîne, insensible à la casse). */
export interface CritereRecherche { depuis: Date; from?: string }

/** Contrat minimal d'accès à la boîte (implémenté par imap.ts, faussé dans les tests). Ouverture en LECTURE SEULE. */
export interface ClientBoite {
  ouvrir(): Promise<void>;
  chercher(criteres: CritereRecherche): Promise<number[]>;
  /** R3e — recherche serveur TEXT (en-têtes + corps) des références de dossier, par lots en OU ; renvoie l'union dédupliquée des UID. */
  chercherReferences(depuis: Date, references: string[]): Promise<number[]>;
  /** P1 — Message-ID (UID → valeur) SANS télécharger le corps : sert au plafond CHRONOLOGIQUE à écarter les déjà-vus AVANT de
   *  tronquer (progression dans le backlog sans boucle). Fetch léger (enveloppe). Un UID sans Message-ID → absent de la Map. */
  messageIds(uids: number[]): Promise<Map<number, string>>;
  telechargerMessage(uid: number): Promise<MessageBoite>;
  fermer(): Promise<void>;
}

export interface LigneReleve {
  messageId: string;
  demandeId: number | null;
  methode: RattachementMethode;
  rebond: boolean;
  nature: NatureReponse; // T3 : 'rebond' (non-remise), 'accuse' (accusé auto), 'indetermine' (message ordinaire = vrai retour)
  motif: string;
  deAdresse: string;
  objet: string | null;
  nbPieces: number;
}

export interface RapportReleve {
  mode: 'simulation' | 'applique';
  profil: ProfilBoite;
  connecte: boolean;
  depuis: string | null;
  domainesInterroges: string[];
  uidsServeur: number;          // UID renvoyés par la recherche par domaine (union dédupliquée)
  referencesInterrogees: number; // R3e/R3f : nombre de références interrogées côté serveur en TEXT (n° de dossier + réf. mairie)
  uidsReferences: number;        // R3e : UID ramenés par la recherche par référence (distinct des autres sondes)
  plafondReferencesAtteint: boolean; // R3e : le plafond recherche_references_max a mordu (les plus urgents seulement)
  plafondAtteint: boolean;
  vus: number;
  dejaConnus: number;
  horsPerimetre: number;
  retenus: number;              // = lignes.length
  rattaches: number;
  nonRattaches: number;
  rebondsDetectes: number;      // estRebondNonRemise vrai (DSN de non-remise)
  rebondsRattaches: number;     // rebonds reliés à une demande (Message-ID d'origine ou destinataire)
  rebondsEtrangers: number;     // rebonds SANS rapport avec nos demandes → NON enregistrés
  rebondsAppliques: number;     // lignes d'acheminement passées à 'rebond' (0 en simulation)
  accuses: number;              // T3 : accusés de réception (nature 'accuse') RETENUS → « a écrit », jamais « a répondu »
  liensCaptes: number;          // L1 : liens candidats extraits et enregistrés (0 en simulation) — jamais suivis
  ecrites: number;
  piecesDeposees: number;       // R4 : pièces jointes réellement déposées sur l'object storage
  piecesNonDeposees: number;    // R4 : pièces NON déposées (type/taille/stockage indisponible) — trace conservée + motif
  parMethode: Record<string, number>;
  lignes: LigneReleve[];
}

export interface OptionsReleve {
  client: ClientBoite;
  profil: ProfilBoite;
  depuis?: Date;         // override (tests) ; sinon calculé = min(envoye_le des envoyées) − 1 j
  plafond?: number;      // défaut 200 — s'applique APRÈS la sélection serveur par domaine
  plafondRebonds?: number; // défaut 200 — GARDE-FOU sur les sondes mailer-daemon/postmaster (ne devrait plus mordre)
  appliquer?: boolean;   // défaut false (simulation : aucune écriture)
  sansFiltre?: boolean;  // désactive le filtre de pertinence (débogage) — JAMAIS le défaut
}

/** Fragment commun aux objets émis (entreprise et personne), normalisé (minuscules, sans accents). */
const FRAGMENT_OBJET = 'demande de communication de documents administratifs';
/** Sondes serveur pour les rebonds : parties locales usuelles des expéditeurs de DSN. */
const SONDES_REBOND = ['mailer-daemon', 'postmaster'] as const;

function normaliserObjet(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
}
function domaineDe(adresse: string): string {
  const at = adresse.lastIndexOf('@');
  return at === -1 ? '' : adresse.slice(at + 1).trim().toLowerCase();
}
function objetPertinent(objet: string | undefined): boolean {
  return objet ? normaliserObjet(objet).includes(FRAGMENT_OBJET) : false;
}
/** R3e — numéro de dossier Sitadel réduit à ses seuls chiffres (ex. « PC 093 001 25 00081 » → « 0930012500081 »). */
function numeroDossier(numDau: string): string { return numDau.replace(/\D/g, ''); }

/** Une demande envoyée du profil : identité + destinataire + Message-ID émis + n° de dossier + réf. mairie (pour rattacher réponses ET rebonds). */
interface DemandeEnvoyee { id: number; reference: string; destEmail: string; messageIdsEmis: string[]; numerosDossier: string[]; referencesExternes: string[] }

async function lireEnvoyees(profil: ProfilBoite): Promise<DemandeEnvoyee[]> {
  const { rows } = await query<{ id: number; reference: string; dest_email: string; message_ids: string[]; num_daus: string[]; refs_externes: string[] }>(
    `SELECT d.id::int AS id, d.reference, coalesce(d.dest_email, '') AS dest_email,
            coalesce(array_agg(a.message_id) FILTER (WHERE a.message_id IS NOT NULL), '{}') AS message_ids,
            coalesce((SELECT array_agg(s.num_dau) FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                       WHERE dd.demande_id = d.id AND dd.actif), '{}') AS num_daus,
            coalesce((SELECT array_agg(re.reference) FROM demande_reference_externe re WHERE re.demande_id = d.id), '{}') AS refs_externes
       FROM demande d
       LEFT JOIN demande_acheminement a ON a.demande_id = d.id AND a.canal = 'email'
      WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1
      GROUP BY d.id, d.reference, d.dest_email`,
    [profil],
  );
  return rows.map((r) => ({
    id: r.id, reference: r.reference, destEmail: r.dest_email, messageIdsEmis: r.message_ids,
    numerosDossier: r.num_daus.map(numeroDossier).filter((n) => n !== ''),
    referencesExternes: (r.refs_externes ?? []).map((x) => x.trim()).filter((x) => x !== ''),
  }));
}

/**
 * R3e/R3f + T4 — références à interroger côté serveur, sur `statut IN ('envoyee','brouillon','prete')`. Les ENVOYÉES cherchent
 * la RÉPONSE de la mairie ; les BROUILLON/PRÊTE (T4) cherchent la preuve qu'un dépôt téléservice a bien eu lieu **sans qu'on ait
 * cliqué « Marquer comme déposée »** (une close a déjà ses pièces → exclue). DEUX familles, AU MÊME TITRE :
 *   - n° de dossier Sitadel des dossiers NON satisfaits d'abord (par échéance croissante) ;
 *   - références MAIRIE (P1, demande_reference_externe) — l'identifiant que la mairie cite dans SA réponse.
 * ⚠️ Fix 1a : PLUS de gate `dd.actif` — une demande envoyée a sollicité la mairie sur TOUS ses dossiers, que l'attache-stock
 * soit encore active ou non. La non-ambiguïté n'est PAS requise ici (on cherche à TROUVER l'e-mail) ; c'est le rattachement qui
 * l'exige — et il ne rattache JAMAIS une brouillon/prête (candidates = envoyées uniquement). Dédupliqué, plafonné (réf. mairie
 * d'abord — peu nombreuses, fort signal — pour ne jamais les évincer), drapeau si le plafond mord (jamais silencieux). LECTURE SEULE.
 */
async function lireReferencesRecherche(profil: ProfilBoite, max: number): Promise<{ references: string[]; plafondAtteint: boolean }> {
  const { rows: rd } = await query<{ num_dau: string }>(
    `SELECT s.num_dau
       FROM demande d
       JOIN demande_dossier dd ON dd.demande_id = d.id
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
      WHERE d.statut IN ('envoyee', 'brouillon', 'prete') AND d.profil_demandeur = $1
      ORDER BY (dd.satisfait_le IS NULL) DESC,
               (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id) ASC NULLS LAST, -- B2 : ancre agnostique au canal
               s.num_dau`,
    [profil],
  );
  const { rows: rm } = await query<{ reference: string }>(
    `SELECT DISTINCT re.reference
       FROM demande d JOIN demande_reference_externe re ON re.demande_id = d.id
      WHERE d.statut IN ('envoyee', 'brouillon', 'prete') AND d.profil_demandeur = $1`,
    [profil],
  );
  const toutes: string[] = [];
  const vus = new Set<string>();
  // Réf. mairie d'abord (jamais évincées par un afflux de n° de dossier), puis n° de dossier (non satisfaits en tête).
  for (const r of rm) { const ref = r.reference.trim(); const k = `m:${ref.toUpperCase()}`; if (ref !== '' && !vus.has(k)) { vus.add(k); toutes.push(ref); } }
  for (const r of rd) { const n = numeroDossier(r.num_dau); const k = `d:${n}`; if (n.length >= 10 && !vus.has(k)) { vus.add(k); toutes.push(n); } }
  const plafondAtteint = toutes.length > max;
  return { references: toutes.slice(0, max), plafondAtteint };
}

async function dateDepart(profil: ProfilBoite): Promise<Date | null> {
  // T4 — la fenêtre de relève ne dépend plus des SEULES envoyées : SINCE = LEAST(plus ancien envoye_le des envoyées, plus
  //   ancien cree_le des BROUILLON/PRÊTE) − 1 jour. Motif : une demande en attente n'a pas pu être déposée AVANT sa création,
  //   donc cree_le est une borne basse SÛRE pour tout message citant son permis ; la marge d'1 jour absorbe le décalage de
  //   fuseau. Une boîte SANS aucune envoyée mais AVEC des demandes en attente est ainsi relevée. `LEAST` ignore les NULL →
  //   ni envoyée ni en attente ⇒ NULL ⇒ pas de connexion. (B2 : envoye_le agnostique au canal, téléservice inclus.)
  const { rows } = await query<{ depuis: Date | null }>(
    `SELECT (LEAST(
              (SELECT min(a.envoye_le) FROM demande d JOIN demande_acheminement a ON a.demande_id = d.id
                WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1 AND a.envoye_le IS NOT NULL),
              (SELECT min(d.cree_le) FROM demande d
                WHERE d.statut IN ('brouillon', 'prete') AND d.profil_demandeur = $1)
            ) - interval '1 day') AS depuis`,
    [profil],
  );
  return rows[0]?.depuis ?? null;
}

/**
 * P1 — MARGE de la fenêtre de relève, en JOURS. Trois écarts à couvrir, tous documentés ici (pas juste la valeur) :
 *   1. SINCE filtre l'INTERNALDATE CÔTÉ SERVEUR à la granularité JOUR (l'heure est ignorée) ;
 *   2. deux horloges, deux fuseaux (notre process vs le serveur IMAP) → jusqu'à ~1 jour d'écart ;
 *   3. RETARDATAIRES : un message peut apparaître dans la boîte avec une date ANTÉRIEURE au curseur (sorti du spam, livraison
 *      différée par le serveur émetteur) ; sans marge, il ne serait JAMAIS vu.
 * 3 jours couvrent (1)+(2) (≤ 2 j) avec de la garde pour (3). Le dédoublonnage par message_id rend cette marge GRATUITE
 * (un message re-vu tombe en « déjà connu », jamais réinséré).
 */
const MARGE_CURSEUR_JOURS = 3;

/**
 * P1 — CURSEUR de relève = fin (`termine_le`) du DERNIER scan COURANT réussi et COMPLET.
 *   - `declencheur = 'planifie'` EXCLUT les relèves 'approfondi' (scan LARGE d'UNE demande, pas de l'inbox général : elles ne
 *     doivent jamais faire avancer le curseur courant) ;
 *   - `plafond_atteint IS NOT TRUE` EXCLUT une passe TRONQUÉE par le plafond (elle a délibérément jeté des messages non vus) :
 *     le curseur ne « certifie vu » que ce qui l'a réellement été → jamais de perte silencieuse.
 * `null` = aucun scan courant complet réussi (premier run, ou journal purgé). LECTURE SEULE ; aucune 2e vérité stockée.
 */
async function curseurReleve(): Promise<Date | null> {
  const { rows } = await query<{ t: Date | null }>(
    `SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok' AND declencheur = 'planifie' AND plafond_atteint IS NOT TRUE`);
  return rows[0]?.t ?? null;
}

/**
 * P1 — début de la fenêtre de relève. `curseur − 3 j` si un scan courant complet a réussi ; SINON repli SÛR sur `dateDepart`
 * (backfill complet depuis la plus vieille demande). Le repli n'est JAMAIS une perte : au pire une relève large. EXPORTÉ pour
 * que l'écran affiche « on relève depuis le … » depuis la MÊME source (jamais une valeur cachée qui dérive).
 */
export async function fenetreDepuis(profil: ProfilBoite): Promise<Date | null> {
  const curseur = await curseurReleve();
  if (curseur !== null) return new Date(curseur.getTime() - MARGE_CURSEUR_JOURS * 86_400_000);
  return dateDepart(profil);
}

async function messageIdsConnus(profil: ProfilBoite): Promise<Set<string>> {
  const { rows } = await query<{ message_id: string }>(`SELECT message_id FROM demande_reponse WHERE profil_boite = $1`, [profil]);
  return new Set(rows.map((r) => r.message_id));
}

async function lireDomainesDestinataires(profil: ProfilBoite): Promise<Set<string>> {
  const { rows } = await query<{ domaine: string }>(
    `SELECT DISTINCT lower(split_part(dest_email, '@', 2)) AS domaine
       FROM demande
      WHERE statut = 'envoyee' AND profil_demandeur = $1 AND dest_email LIKE '%@%'`,
    [profil],
  );
  return new Set(rows.map((r) => r.domaine).filter((d) => d !== ''));
}

async function marquerRebond(demandeId: number, motif: string): Promise<number> {
  const res = await query(
    `UPDATE demande_acheminement
        SET statut = 'rebond', rebond_le = now(), rebond_motif = $2, maj_a = now()
      WHERE demande_id = $1 AND statut = 'envoye' AND canal = 'email'`,
    [demandeId, motif],
  );
  return res.rowCount ?? 0;
}

/** Cible d'un rebond : par Message-ID d'origine, sinon par destinataire en échec. `null` = rebond étranger. */
function cibleRebond(dsn: ResultatRapportRejet, envoyees: DemandeEnvoyee[]): { demandeId: number; motif: string } | null {
  const motif = dsn.diagnostic ?? dsn.statut ?? 'rebond';
  if (dsn.messageIdOrigine !== undefined) {
    const c = envoyees.find((e) => e.messageIdsEmis.some((m) => normaliserMessageId(m) === dsn.messageIdOrigine));
    if (c) return { demandeId: c.id, motif };
  }
  if (dsn.destinataireEchec !== undefined) {
    const c = envoyees.find((e) => e.destEmail !== '' && e.destEmail.toLowerCase() === dsn.destinataireEchec);
    if (c) return { demandeId: c.id, motif };
  }
  return null;
}

/** Construit le ReponseEntrante à enregistrer depuis un message de boîte (réutilisé par la relève approfondie R6). */
export function construireLigne(profil: ProfilBoite, mb: MessageBoite, mid: string, demandeId: number | null, methode: RattachementMethode, note: string, nature: NatureReponse = 'indetermine'): ReponseEntrante {
  return {
    demandeId, profilBoite: profil, messageId: mid,
    inReplyTo: mb.message.inReplyTo ?? null,
    referencesBrut: mb.message.references && mb.message.references.length > 0 ? mb.message.references.join(' ') : null,
    deAdresse: mb.message.deAdresse, deNom: mb.deNom, objet: mb.message.objet ?? null,
    recuLe: mb.recuLe, corpsTexte: mb.message.corpsTexte ?? null, corpsHtml: mb.message.corpsHtml ?? null,
    rattachementMethode: methode, nature, rattacheLe: demandeId !== null ? mb.recuLe : null, note,
    // R4 : métadonnées de la pièce ; le dépôt (cle_stockage/empreinte/stocke_le ou motif) est fait APRÈS, par deposerEtLierPieces.
    pieces: mb.pieces.map((p) => ({ nomFichier: p.nomFichier, typeMime: p.typeMime, tailleOctets: p.tailleOctets, cleStockage: null, empreinteSha256: null, stockeLe: null, motifNonStocke: null })),
  };
}

/**
 * Relève la boîte du profil. Voir l'en-tête du fichier. `appliquer=false` (défaut) = simulation : rien n'est écrit.
 */
export async function releverBoite(opts: OptionsReleve): Promise<RapportReleve> {
  const appliquer = opts.appliquer === true;
  const plafond = opts.plafond ?? 200;
  const plafondRebonds = opts.plafondRebonds ?? 200;
  const mode: 'simulation' | 'applique' = appliquer ? 'applique' : 'simulation';

  const envoyees = await lireEnvoyees(opts.profil);
  const candidates: DemandeCandidate[] = envoyees.map((e) => ({ id: e.id, reference: e.reference, profilBoite: opts.profil, statut: 'envoyee', messageIdsEmis: e.messageIdsEmis, numerosDossier: e.numerosDossier, referencesExternes: e.referencesExternes }));
  const depuis = opts.depuis ?? (await fenetreDepuis(opts.profil)); // P1 : fenêtre = curseur − 3 j (repli backfill si aucun curseur)
  const domaines = await lireDomainesDestinataires(opts.profil);
  const domainesInterroges = [...domaines];

  const vide = (connecte: boolean): RapportReleve => ({
    mode, profil: opts.profil, connecte, depuis: depuis ? depuis.toISOString() : null, domainesInterroges,
    uidsServeur: 0, referencesInterrogees: 0, uidsReferences: 0, plafondReferencesAtteint: false, plafondAtteint: false,
    vus: 0, dejaConnus: 0, horsPerimetre: 0, retenus: 0, rattaches: 0, nonRattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, accuses: 0, liensCaptes: 0, ecrites: 0, piecesDeposees: 0, piecesNonDeposees: 0, parMethode: {}, lignes: [],
  });

  if (depuis === null) return vide(false); // T4 : ni demande envoyée ni demande en attente (brouillon/prête) → pas de connexion

  const connus = await messageIdsConnus(opts.profil);
  // Config lue UNE fois : borne de taille des pièces (R4) + plafond de références de recherche (R3e).
  const cfg = await chargerConfigVeille();
  const tailleMaxOctets = cfg.pieceTailleMaxMo * 1024 * 1024; // utilisé seulement en mode APPLIQUÉ (dépôt)
  const { references, plafondAtteint: plafondReferencesAtteint } = await lireReferencesRecherche(opts.profil, cfg.rechercheReferencesMax);
  const lignes: LigneReleve[] = [];
  let vus = 0, dejaConnus = 0, horsPerimetre = 0, rebondsDetectes = 0, rebondsRattaches = 0, rebondsEtrangers = 0, rebondsAppliques = 0, ecrites = 0, piecesDeposees = 0, piecesNonDeposees = 0, liensCaptes = 0;
  let uidsServeur = 0, uidsReferences = 0, plafondAtteint = false;

  // R4 — dépose les pièces d'une réponse déjà enregistrée (contenu tiers, jamais ouvert) et met à jour les compteurs.
  const deposerPieces = async (reponseId: number, demandeId: number | null, pieces: PieceMeta[]): Promise<void> => {
    const bilan = await deposerEtLierPieces(reponseId, demandeId,
      pieces.map((p) => ({ nomFichier: p.nomFichier, typeMime: p.typeMime, contenu: p.contenu })), tailleMaxOctets);
    piecesDeposees += bilan.deposees; piecesNonDeposees += bilan.nonDeposees;
  };
  // R3e — un n° de dossier d'une demande candidate apparaît LITTÉRALEMENT (objet/corps/nom de pièce) ? Critère de pertinence.
  const contientNumeroDossier = (mb: MessageBoite): boolean => {
    const foin = `${mb.message.objet ?? ''}\n${mb.message.corpsTexte ?? ''}\n${mb.pieces.map((p) => p.nomFichier).join('\n')}`.replace(/[\s.\-/_]/gu, '');
    return candidates.some((c) => c.numerosDossier.some((n) => n.length >= 10 && foin.includes(n)));
  };
  // R3f — une RÉFÉRENCE MAIRIE connue (P1) apparaît LITTÉRALEMENT (objet/corps) ? Critère de pertinence, QUEL QUE SOIT le
  //   domaine expéditeur (le trou que R3e avait comblé pour les n° de dossier, ici pour la référence mairie).
  const contientReferenceMairie = (mb: MessageBoite): boolean => {
    const foin = normaliserReference(`${mb.message.objet ?? ''}\n${mb.message.corpsTexte ?? ''}`);
    return candidates.some((c) => (c.referencesExternes ?? []).some((r) => { const rn = normaliserReference(r); return rn.length >= 6 && foin.includes(rn); }));
  };
  // T4 — pertinence des demandes EN ATTENTE : `references` (lireReferencesRecherche) inclut désormais les permis des brouillon/
  //   prête (num_dau + réf. mairie). Un message qui n'est pertinent QUE parce qu'il cite l'un d'eux n'est plus écarté par R3b —
  //   mais il n'est RATTACHÉ à rien (rattacherReponse ne voit que les envoyées). Sur-ensemble des deux prédicats ci-dessus pour
  //   les envoyées (aucune régression), + la part en attente. num_dau = suite de chiffres ; réf. mairie = normaliserReference.
  const contientReferenceCherchee = (mb: MessageBoite): boolean => {
    const foinNum = `${mb.message.objet ?? ''}\n${mb.message.corpsTexte ?? ''}\n${mb.pieces.map((p) => p.nomFichier).join('\n')}`.replace(/[\s.\-/_]/gu, '');
    const foinRef = normaliserReference(`${mb.message.objet ?? ''}\n${mb.message.corpsTexte ?? ''}`);
    return references.some((ref) => {
      if (/^\d{10,}$/.test(ref)) return foinNum.includes(ref);                       // n° de dossier (chiffres)
      const rn = normaliserReference(ref); return rn.length >= 6 && foinRef.includes(rn); // référence mairie
    });
  };

  await opts.client.ouvrir();
  try {
    // (b) sélection SERVEUR par domaine destinataire (union dédupliquée).
    const uidsDomaines = new Set<number>();
    for (const domaine of domainesInterroges) for (const uid of await opts.client.chercher({ depuis, from: domaine })) uidsDomaines.add(uid);
    uidsServeur = uidsDomaines.size;

    // (b2) R3e — sélection SERVEUR par RÉFÉRENCE de dossier (recherche TEXT, TOUS expéditeurs — pas seulement les domaines).
    const uidsRefs = new Set(references.length > 0 ? await opts.client.chercherReferences(depuis, references) : []);
    uidsReferences = uidsRefs.size;

    // Sélection PRINCIPALE = domaines ∪ références, triée par UID CROISSANT (≈ ordre d'arrivée : plus ANCIEN d'abord).
    let selPrincipal = [...new Set<number>([...uidsDomaines, ...uidsRefs])].sort((a, b) => a - b);
    // P1 — PLAFOND CHRONOLOGIQUE ET PROGRESSIF. Au-delà du plafond (retard : backfill ou reprise après panne), on ne garde plus
    //   les plus RÉCENTS (qui feraient perdre à jamais les plus vieux jetés) mais les plus ANCIENS NON ENCORE VUS : on écarte au
    //   niveau SÉLECTION les Message-ID déjà connus (fetch léger, AVANT toute troncature), puis on prend les `plafond` plus vieux
    //   du reliquat. Ainsi chaque passe AVANCE dans le backlog (jamais deux fois les mêmes) et — le curseur restant figé tant que
    //   plafondAtteint est vrai (cf. curseurReleve) — rien n'est « certifié vu » sans l'avoir été. `plafondAtteint` = il reste
    //   plus de NON-VUS que le plafond (donc on est en retard). Sous le plafond → aucun fetch supplémentaire (comportement inchangé).
    if (selPrincipal.length > plafond) {
      const mids = await opts.client.messageIds(selPrincipal);
      const nonVus = selPrincipal.filter((uid) => { const m = mids.get(uid)?.trim(); return m === undefined || m === '' || !connus.has(m); });
      if (nonVus.length > plafond) { plafondAtteint = true; selPrincipal = nonVus.slice(0, plafond); }
      else selPrincipal = nonVus;
    }

    // (c) sondes REBONDS côté serveur (mailer-daemon puis postmaster), hors UID déjà couverts, garde-fou plafondRebonds.
    const dejaCouverts = new Set<number>([...uidsDomaines, ...uidsRefs]);
    const uidsRebonds = new Set<number>();
    for (const sonde of SONDES_REBOND) for (const uid of await opts.client.chercher({ depuis, from: sonde })) uidsRebonds.add(uid);
    const genRebonds = [...uidsRebonds].filter((u) => !dejaCouverts.has(u)).sort((a, b) => a - b).slice(-plafondRebonds);
    const genSet = new Set(genRebonds);

    const aTelecharger = [...new Set([...selPrincipal, ...genRebonds])].sort((a, b) => a - b);
    for (const uid of aTelecharger) {
      vus += 1;
      const mb = await opts.client.telechargerMessage(uid);
      const mid = mb.message.messageId.trim();
      if (mid === '' || connus.has(mid)) { dejaConnus += 1; continue; }
      connus.add(mid);

      // ── REBOND DE NON-REMISE (DSN) ────────────────────────────────────────
      // T3 — signaux FIABLES uniquement (mailer-daemon/postmaster, multipart/report). L'Auto-Submitted seul n'est PLUS un
      //   rebond → c'est un accusé, traité plus bas. Un rebond ÉTRANGER n'est jamais enregistré (compté rebondsEtrangers) ; un
      //   rebond RATTACHÉ est enregistré comme PREUVE avec nature='rebond' (conservé mais NI « a écrit » NI « a répondu » : un
      //   échec de livraison n'est pas un retour de mairie). Sa bascule d'acheminement 'envoye' → 'rebond' reste l'autorité.
      if (estRebondNonRemise(mb.message)) {
        rebondsDetectes += 1;
        const dsn = analyserRapportRejet({ corpsTexte: mb.message.corpsTexte, parties: mb.partiesRapport });
        const cible = cibleRebond(dsn, envoyees);
        if (cible === null) { rebondsEtrangers += 1; continue; } // SANS rapport → jamais enregistré
        rebondsRattaches += 1;
        lignes.push({ messageId: mid, demandeId: cible.demandeId, methode: 'message_id', rebond: true, nature: 'rebond', motif: cible.motif, deAdresse: mb.message.deAdresse, objet: mb.message.objet ?? null, nbPieces: mb.pieces.length });
        if (appliquer) {
          const id = await enregistrerReponse(construireLigne(opts.profil, mb, mid, cible.demandeId, 'message_id', cible.motif, 'rebond'));
          if (id !== null) { ecrites += 1; await deposerPieces(id, cible.demandeId, mb.pieces); }
          rebondsAppliques += await marquerRebond(cible.demandeId, cible.motif);
        }
        continue;
      }

      // ── MESSAGE : accusé automatique OU réponse ordinaire (depuis un domaine destinataire) ──
      const duDomaine = !genSet.has(uid);
      if (!opts.sansFiltre && !duDomaine) { horsPerimetre += 1; continue; } // sonde rebond mais pas un rebond → ignoré
      const r = rattacherReponse(mb.message, candidates);
      // R3e — nouveau critère : un n° de dossier d'une demande candidate apparaît littéralement (objet/corps/nom de pièce).
      const pertinent = opts.sansFiltre === true || r.methode !== 'aucun' || domaines.has(domaineDe(mb.message.deAdresse)) || objetPertinent(mb.message.objet) || contientNumeroDossier(mb) || contientReferenceMairie(mb) || contientReferenceCherchee(mb);
      if (!pertinent) { horsPerimetre += 1; continue; }
      // L1 — liens candidats du corps (texte + HTML), analyse PURE (aucun appel réseau, on ne SUIT JAMAIS un lien). Calculés en
      //   AMONT : ils servent à la fois à la NATURE du message (lien fort → documents) et à l'enregistrement des liens ci-dessous.
      const { liens } = analyserLiensReponse({ corpsTexte: mb.message.corpsTexte ?? null, corpsHtml: mb.message.corpsHtml ?? null, recuLe: mb.recuLe });
      // T3/T7-A — NATURE : un accusé automatique (Auto-Submitted, PAS un DSN) est ENREGISTRÉ et rattaché comme un message (« a
      //   écrit »), mais nature='accuse' le tient HORS de « Réponses » (« a répondu ») et INTERDIT la satisfaction auto d'un
      //   dossier (un accusé ne livre aucun document). Sinon, T7-A déduit documents/autre du CONTENU CAPTÉ (pièces OU lien fort),
      //   jamais du texte. Le contenu est connu AVANT l'insertion (pièces = mb.pieces ; liens = analyse pure) → nature définitive
      //   posée dès l'insert, sans second passage.
      const nature: NatureReponse = estAccuseAutomatique(mb.message)
        ? 'accuse'
        : classerNatureContenu({ nbPieces: mb.pieces.length, aLienFort: liens.some((l) => l.fort) });
      lignes.push({ messageId: mid, demandeId: r.demandeId, methode: r.methode, rebond: false, nature, motif: r.motif, deAdresse: mb.message.deAdresse, objet: mb.message.objet ?? null, nbPieces: mb.pieces.length });
      if (appliquer) {
        const id = await enregistrerReponse(construireLigne(opts.profil, mb, mid, r.demandeId, r.methode, r.motif, nature));
        if (id !== null) {
          ecrites += 1;
          // R6c — SATISFACTION AUTO : réponse rattachée à une demande → marque les dossiers dont le n° Sitadel complet
          //   apparaît littéralement (pièces jointes ou corps). Haute précision, jamais de démarquage (voir repo). JAMAIS pour
          //   un accusé (T3) : il n'apporte aucun document.
          if (r.demandeId !== null && nature !== 'accuse') {
            await marquerDossiersSatisfaitsAuto(r.demandeId, id, { piecesNoms: mb.pieces.map((p) => p.nomFichier), corpsTexte: mb.message.corpsTexte ?? null });
          }
          // L1 — enregistrer les liens captés. PUR : on ne SUIT JAMAIS un lien. L'expiration n'est captée que si écrite
          //   explicitement. Ne fait NI archivage NI satisfait_le.
          if (liens.length > 0) liensCaptes += await enregistrerLiensReponse(id, liens);
          // R4 — dépôt des pièces (rattachée ou non : la clé gère « non-rattachees »).
          await deposerPieces(id, r.demandeId, mb.pieces);
        }
      }
    }
  } finally {
    await opts.client.fermer();
  }

  const parMethode: Record<string, number> = {};
  for (const l of lignes) parMethode[l.methode] = (parMethode[l.methode] ?? 0) + 1;
  const rattaches = lignes.filter((l) => l.demandeId !== null).length;
  const accuses = lignes.filter((l) => l.nature === 'accuse').length; // T3 : accusés RETENUS (« a écrit », jamais « a répondu »)

  return {
    mode, profil: opts.profil, connecte: true, depuis: depuis.toISOString(), domainesInterroges, uidsServeur,
    referencesInterrogees: references.length, uidsReferences, plafondReferencesAtteint, plafondAtteint,
    vus, dejaConnus, horsPerimetre, retenus: lignes.length, rattaches, nonRattaches: lignes.length - rattaches,
    rebondsDetectes, rebondsRattaches, rebondsEtrangers, rebondsAppliques, accuses, liensCaptes, ecrites, piecesDeposees, piecesNonDeposees, parMethode, lignes,
  };
}
