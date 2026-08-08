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
import { enregistrerReponse, marquerDossiersSatisfaitsAuto, type ProfilBoite, type RattachementMethode, type ReponseEntrante } from './demandeReponseRepo';
import { rattacherReponse, estAccuseDeRebond, type MessageEntrant, type DemandeCandidate } from './rattachementReponse';
import { analyserRapportRejet, normaliserMessageId, type PartieRapport, type ResultatRapportRejet } from './rapportRejet';

export interface PieceMeta { nomFichier: string; typeMime: string | null; tailleOctets: number | null }

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

/** Une demande envoyée du profil : identité + destinataire + Message-ID émis (pour rattacher réponses ET rebonds). */
interface DemandeEnvoyee { id: number; reference: string; destEmail: string; messageIdsEmis: string[] }

async function lireEnvoyees(profil: ProfilBoite): Promise<DemandeEnvoyee[]> {
  const { rows } = await query<{ id: number; reference: string; dest_email: string; message_ids: string[] }>(
    `SELECT d.id::int AS id, d.reference, coalesce(d.dest_email, '') AS dest_email,
            coalesce(array_agg(a.message_id) FILTER (WHERE a.message_id IS NOT NULL), '{}') AS message_ids
       FROM demande d
       LEFT JOIN demande_acheminement a ON a.demande_id = d.id AND a.canal = 'email'
      WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1
      GROUP BY d.id, d.reference, d.dest_email`,
    [profil],
  );
  return rows.map((r) => ({ id: r.id, reference: r.reference, destEmail: r.dest_email, messageIdsEmis: r.message_ids }));
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
    pieces: mb.pieces.map((p) => ({ nomFichier: p.nomFichier, typeMime: p.typeMime, tailleOctets: p.tailleOctets, cleStockage: null, empreinteSha256: null, stockeLe: null, motifNonStocke: 'dépôt non implémenté' })),
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
  const candidates: DemandeCandidate[] = envoyees.map((e) => ({ id: e.id, reference: e.reference, profilBoite: opts.profil, statut: 'envoyee', messageIdsEmis: e.messageIdsEmis }));
  const depuis = opts.depuis ?? (await dateDepart(opts.profil));
  const domaines = await lireDomainesDestinataires(opts.profil);
  const domainesInterroges = [...domaines];

  const vide = (connecte: boolean): RapportReleve => ({
    mode, profil: opts.profil, connecte, depuis: depuis ? depuis.toISOString() : null, domainesInterroges,
    uidsServeur: 0, plafondAtteint: false, vus: 0, dejaConnus: 0, horsPerimetre: 0, retenus: 0, rattaches: 0, nonRattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, ecrites: 0, parMethode: {}, lignes: [],
  });

  if (depuis === null) return vide(false); // aucune demande envoyée → pas de connexion

  const connus = await messageIdsConnus(opts.profil);
  const lignes: LigneReleve[] = [];
  let vus = 0, dejaConnus = 0, horsPerimetre = 0, rebondsDetectes = 0, rebondsRattaches = 0, rebondsEtrangers = 0, rebondsAppliques = 0, ecrites = 0;
  let uidsServeur = 0, plafondAtteint = false;

  await opts.client.ouvrir();
  try {
    // (b) sélection SERVEUR par domaine destinataire (union dédupliquée).
    const uidsDomaines = new Set<number>();
    for (const domaine of domainesInterroges) for (const uid of await opts.client.chercher({ depuis, from: domaine })) uidsDomaines.add(uid);
    uidsServeur = uidsDomaines.size;
    let selDomaines = [...uidsDomaines].sort((a, b) => a - b);
    if (selDomaines.length > plafond) { plafondAtteint = true; selDomaines = selDomaines.slice(-plafond); }

    // (c) sondes REBONDS côté serveur (mailer-daemon puis postmaster), hors UID déjà couverts, garde-fou plafondRebonds.
    const uidsRebonds = new Set<number>();
    for (const sonde of SONDES_REBOND) for (const uid of await opts.client.chercher({ depuis, from: sonde })) uidsRebonds.add(uid);
    const genRebonds = [...uidsRebonds].filter((u) => !uidsDomaines.has(u)).sort((a, b) => a - b).slice(-plafondRebonds);
    const genSet = new Set(genRebonds);

    const aTelecharger = [...new Set([...selDomaines, ...genRebonds])].sort((a, b) => a - b);
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
          if (id !== null) ecrites += 1;
          rebondsAppliques += await marquerRebond(cible.demandeId, cible.motif);
        }
        continue;
      }

      // ── RÉPONSE NORMALE (uniquement depuis un domaine destinataire) ─────────
      const duDomaine = !genSet.has(uid);
      if (!opts.sansFiltre && !duDomaine) { horsPerimetre += 1; continue; } // sonde rebond mais pas un rebond → ignoré
      const r = rattacherReponse(mb.message, candidates);
      const pertinent = opts.sansFiltre === true || r.methode !== 'aucun' || domaines.has(domaineDe(mb.message.deAdresse)) || objetPertinent(mb.message.objet);
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
    mode, profil: opts.profil, connecte: true, depuis: depuis.toISOString(), domainesInterroges, uidsServeur, plafondAtteint,
    vus, dejaConnus, horsPerimetre, retenus: lignes.length, rattaches, nonRattaches: lignes.length - rattaches,
    rebondsDetectes, rebondsRattaches, rebondsEtrangers, rebondsAppliques, ecrites, parMethode, lignes,
  };
}
