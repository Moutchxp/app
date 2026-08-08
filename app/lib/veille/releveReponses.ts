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
import { enregistrerReponse, marquerDossiersSatisfaitsAuto, deposerEtLierPieces, type ProfilBoite, type RattachementMethode, type ReponseEntrante } from './demandeReponseRepo';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { rattacherReponse, estAccuseDeRebond, type MessageEntrant, type DemandeCandidate } from './rattachementReponse';
import { analyserRapportRejet, normaliserMessageId, type PartieRapport, type ResultatRapportRejet } from './rapportRejet';

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
  telechargerMessage(uid: number): Promise<MessageBoite>;
  fermer(): Promise<void>;
}

export interface LigneReleve {
  messageId: string;
  demandeId: number | null;
  methode: RattachementMethode;
  rebond: boolean;
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
  referencesInterrogees: number; // R3e : nombre de numéros de dossier interrogés côté serveur (TEXT)
  uidsReferences: number;        // R3e : UID ramenés par la recherche par référence (distinct des autres sondes)
  plafondReferencesAtteint: boolean; // R3e : le plafond recherche_references_max a mordu (les plus urgents seulement)
  plafondAtteint: boolean;
  vus: number;
  dejaConnus: number;
  horsPerimetre: number;
  retenus: number;              // = lignes.length
  rattaches: number;
  nonRattaches: number;
  rebondsDetectes: number;      // estAccuseDeRebond vrai
  rebondsRattaches: number;     // rebonds reliés à une demande (Message-ID d'origine ou destinataire)
  rebondsEtrangers: number;     // rebonds SANS rapport avec nos demandes → NON enregistrés
  rebondsAppliques: number;     // lignes d'acheminement passées à 'rebond' (0 en simulation)
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

/** Une demande envoyée du profil : identité + destinataire + Message-ID émis + n° de dossier (pour rattacher réponses ET rebonds). */
interface DemandeEnvoyee { id: number; reference: string; destEmail: string; messageIdsEmis: string[]; numerosDossier: string[] }

async function lireEnvoyees(profil: ProfilBoite): Promise<DemandeEnvoyee[]> {
  const { rows } = await query<{ id: number; reference: string; dest_email: string; message_ids: string[]; num_daus: string[] }>(
    `SELECT d.id::int AS id, d.reference, coalesce(d.dest_email, '') AS dest_email,
            coalesce(array_agg(a.message_id) FILTER (WHERE a.message_id IS NOT NULL), '{}') AS message_ids,
            coalesce((SELECT array_agg(s.num_dau) FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                       WHERE dd.demande_id = d.id AND dd.actif), '{}') AS num_daus
       FROM demande d
       LEFT JOIN demande_acheminement a ON a.demande_id = d.id AND a.canal = 'email'
      WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1
      GROUP BY d.id, d.reference, d.dest_email`,
    [profil],
  );
  return rows.map((r) => ({
    id: r.id, reference: r.reference, destEmail: r.dest_email, messageIdsEmis: r.message_ids,
    numerosDossier: r.num_daus.map(numeroDossier).filter((n) => n !== ''),
  }));
}

/**
 * R3e — références de dossier à interroger côté serveur : dossiers des demandes NON closes du profil, NON satisfaits en
 * priorité, ordonnés par échéance croissante (proxy : envoyé_le croissant), plafonnés. Renvoie les n° (chiffres) dédupliqués
 * et un drapeau si le plafond a mordu (jamais silencieux). LECTURE SEULE.
 */
async function lireReferencesRecherche(profil: ProfilBoite, max: number): Promise<{ references: string[]; plafondAtteint: boolean }> {
  const { rows } = await query<{ num_dau: string }>(
    `SELECT s.num_dau
       FROM demande d
       JOIN demande_dossier dd ON dd.demande_id = d.id AND dd.actif
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
      WHERE d.statut NOT IN ('close','abandonnee') AND d.profil_demandeur = $1
      ORDER BY (dd.satisfait_le IS NULL) DESC,
               (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id AND a.canal = 'email') ASC NULLS LAST,
               s.num_dau
      LIMIT $2`,
    [profil, max + 1], // +1 pour détecter le dépassement du plafond
  );
  const toutes: string[] = [];
  const vus = new Set<string>();
  for (const r of rows) { const n = numeroDossier(r.num_dau); if (n.length >= 10 && !vus.has(n)) { vus.add(n); toutes.push(n); } }
  const plafondAtteint = toutes.length > max;
  return { references: toutes.slice(0, max), plafondAtteint };
}

async function dateDepart(profil: ProfilBoite): Promise<Date | null> {
  const { rows } = await query<{ depuis: Date | null }>(
    `SELECT (min(a.envoye_le) - interval '1 day') AS depuis
       FROM demande d JOIN demande_acheminement a ON a.demande_id = d.id
      WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1 AND a.canal = 'email' AND a.envoye_le IS NOT NULL`,
    [profil],
  );
  return rows[0]?.depuis ?? null;
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
export function construireLigne(profil: ProfilBoite, mb: MessageBoite, mid: string, demandeId: number | null, methode: RattachementMethode, note: string): ReponseEntrante {
  return {
    demandeId, profilBoite: profil, messageId: mid,
    inReplyTo: mb.message.inReplyTo ?? null,
    referencesBrut: mb.message.references && mb.message.references.length > 0 ? mb.message.references.join(' ') : null,
    deAdresse: mb.message.deAdresse, deNom: mb.deNom, objet: mb.message.objet ?? null,
    recuLe: mb.recuLe, corpsTexte: mb.message.corpsTexte ?? null,
    rattachementMethode: methode, rattacheLe: demandeId !== null ? mb.recuLe : null, note,
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
  const candidates: DemandeCandidate[] = envoyees.map((e) => ({ id: e.id, reference: e.reference, profilBoite: opts.profil, statut: 'envoyee', messageIdsEmis: e.messageIdsEmis, numerosDossier: e.numerosDossier }));
  const depuis = opts.depuis ?? (await dateDepart(opts.profil));
  const domaines = await lireDomainesDestinataires(opts.profil);
  const domainesInterroges = [...domaines];

  const vide = (connecte: boolean): RapportReleve => ({
    mode, profil: opts.profil, connecte, depuis: depuis ? depuis.toISOString() : null, domainesInterroges,
    uidsServeur: 0, referencesInterrogees: 0, uidsReferences: 0, plafondReferencesAtteint: false, plafondAtteint: false,
    vus: 0, dejaConnus: 0, horsPerimetre: 0, retenus: 0, rattaches: 0, nonRattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, ecrites: 0, piecesDeposees: 0, piecesNonDeposees: 0, parMethode: {}, lignes: [],
  });

  if (depuis === null) return vide(false); // aucune demande envoyée → pas de connexion

  const connus = await messageIdsConnus(opts.profil);
  // Config lue UNE fois : borne de taille des pièces (R4) + plafond de références de recherche (R3e).
  const cfg = await chargerConfigVeille();
  const tailleMaxOctets = cfg.pieceTailleMaxMo * 1024 * 1024; // utilisé seulement en mode APPLIQUÉ (dépôt)
  const { references, plafondAtteint: plafondReferencesAtteint } = await lireReferencesRecherche(opts.profil, cfg.rechercheReferencesMax);
  const lignes: LigneReleve[] = [];
  let vus = 0, dejaConnus = 0, horsPerimetre = 0, rebondsDetectes = 0, rebondsRattaches = 0, rebondsEtrangers = 0, rebondsAppliques = 0, ecrites = 0, piecesDeposees = 0, piecesNonDeposees = 0;
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

  await opts.client.ouvrir();
  try {
    // (b) sélection SERVEUR par domaine destinataire (union dédupliquée).
    const uidsDomaines = new Set<number>();
    for (const domaine of domainesInterroges) for (const uid of await opts.client.chercher({ depuis, from: domaine })) uidsDomaines.add(uid);
    uidsServeur = uidsDomaines.size;

    // (b2) R3e — sélection SERVEUR par RÉFÉRENCE de dossier (recherche TEXT, TOUS expéditeurs — pas seulement les domaines).
    const uidsRefs = new Set(references.length > 0 ? await opts.client.chercherReferences(depuis, references) : []);
    uidsReferences = uidsRefs.size;

    // Sélection PRINCIPALE = domaines ∪ références ; le plafond GÉNÉRAL ne s'applique qu'APRÈS cette sélection serveur.
    let selPrincipal = [...new Set<number>([...uidsDomaines, ...uidsRefs])].sort((a, b) => a - b);
    if (selPrincipal.length > plafond) { plafondAtteint = true; selPrincipal = selPrincipal.slice(-plafond); }

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

      // ── REBOND ────────────────────────────────────────────────────────────
      if (estAccuseDeRebond(mb.message)) {
        rebondsDetectes += 1;
        const dsn = analyserRapportRejet({ corpsTexte: mb.message.corpsTexte, parties: mb.partiesRapport });
        const cible = cibleRebond(dsn, envoyees);
        if (cible === null) { rebondsEtrangers += 1; continue; } // SANS rapport → jamais enregistré
        rebondsRattaches += 1;
        lignes.push({ messageId: mid, demandeId: cible.demandeId, methode: 'message_id', rebond: true, motif: cible.motif, deAdresse: mb.message.deAdresse, objet: mb.message.objet ?? null, nbPieces: mb.pieces.length });
        if (appliquer) {
          const id = await enregistrerReponse(construireLigne(opts.profil, mb, mid, cible.demandeId, 'message_id', cible.motif));
          if (id !== null) { ecrites += 1; await deposerPieces(id, cible.demandeId, mb.pieces); }
          rebondsAppliques += await marquerRebond(cible.demandeId, cible.motif);
        }
        continue;
      }

      // ── RÉPONSE NORMALE (uniquement depuis un domaine destinataire) ─────────
      const duDomaine = !genSet.has(uid);
      if (!opts.sansFiltre && !duDomaine) { horsPerimetre += 1; continue; } // sonde rebond mais pas un rebond → ignoré
      const r = rattacherReponse(mb.message, candidates);
      // R3e — nouveau critère : un n° de dossier d'une demande candidate apparaît littéralement (objet/corps/nom de pièce).
      const pertinent = opts.sansFiltre === true || r.methode !== 'aucun' || domaines.has(domaineDe(mb.message.deAdresse)) || objetPertinent(mb.message.objet) || contientNumeroDossier(mb);
      if (!pertinent) { horsPerimetre += 1; continue; }
      lignes.push({ messageId: mid, demandeId: r.demandeId, methode: r.methode, rebond: false, motif: r.motif, deAdresse: mb.message.deAdresse, objet: mb.message.objet ?? null, nbPieces: mb.pieces.length });
      if (appliquer) {
        const id = await enregistrerReponse(construireLigne(opts.profil, mb, mid, r.demandeId, r.methode, r.motif));
        if (id !== null) {
          ecrites += 1;
          // R6c — SATISFACTION AUTO : réponse rattachée à une demande → marque les dossiers dont le n° Sitadel complet
          //   apparaît littéralement (pièces jointes ou corps). Haute précision, jamais de démarquage (voir repo).
          if (r.demandeId !== null) {
            await marquerDossiersSatisfaitsAuto(r.demandeId, id, { piecesNoms: mb.pieces.map((p) => p.nomFichier), corpsTexte: mb.message.corpsTexte ?? null });
          }
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

  return {
    mode, profil: opts.profil, connecte: true, depuis: depuis.toISOString(), domainesInterroges, uidsServeur,
    referencesInterrogees: references.length, uidsReferences, plafondReferencesAtteint, plafondAtteint,
    vus, dejaConnus, horsPerimetre, retenus: lignes.length, rattaches, nonRattaches: lignes.length - rattaches,
    rebondsDetectes, rebondsRattaches, rebondsEtrangers, rebondsAppliques, ecrites, piecesDeposees, piecesNonDeposees, parMethode, lignes,
  };
}
