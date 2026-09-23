/**
 * MODULE « GESTION » — LOT 3 : LA CAPTURE. Orchestrateur testable PAR INJECTION : il reçoit ses dépendances (boîte, base,
 * stockage, horloge) et n'importe donc ni imapflow, ni pg, ni le client S3. Les I/O réelles vivent dans `captureRepo.ts`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI LE DISTINGUE DE LA RELÈVE DES PERMIS — quatre différences, toutes voulues :
 *
 * ① ON CAPTURE TOUT. Le module Permis SÉLECTIONNE (domaines des mairies, numéros de dossier) puis FILTRE (pertinence) ;
 *    ici on prend tout le dossier, sans exception. Le tri vient APRÈS, par des règles éditables en base, et il n'écarte
 *    rien de la BASE — seulement de la FILE.
 * ② NOS PROPRES ENVOIS SONT CAPTURÉS. Le module Permis les écarte en amont (`estEmisParNous`) pour ne pas se répondre à
 *    lui-même. Ici c'est l'inverse : ce que la gestion a répondu FAIT PARTIE de la conversation — sans ces messages, une
 *    carte ne montrerait qu'une moitié d'échange. La sonde l'a confirmé : 69 % du flux est sortant.
 * ③ LE SENS EST DÉCIDÉ PAR LA CONFIGURATION (`gestion_config.adresse_gestion`), jamais par une adresse en dur.
 * ④ LA FENÊTRE NE PEUT PAS BOUCLER. Voir `fenetreDepuis` : elle avance soit avec le curseur (passes complètes), soit
 *    avec les messages déjà capturés (passes tronquées) — donc toujours.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { ConfigGestion } from './config';
import { cleDuFil, identifiantsMessage, pourComparaison } from './fil';
import { appliquerRegles, type Exclusion, type RegleExclusion } from './regles';
import { indiceAutomatisme, normaliserObjet } from './typologie';

/** Une pièce jointe telle que l'adaptateur IMAP la rend : contenu compris (jamais ouvert, jamais parsé). */
export interface PieceBrute {
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  contenu: Buffer;
}

/** Un message lu dans la boîte, projeté sur ce dont la capture a besoin. */
export interface MessageBrut {
  uid: number;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  deAdresse: string;
  deNom: string | null;
  destinataires: string | null;
  nbDestinataires: number;
  objet: string | null;
  corpsTexte: string | null;
  corpsHtml: string | null;
  recuLe: Date;
  entetes: Record<string, string>;
  pieces: PieceBrute[];
}

/** Ce qui sera écrit pour UN message. Construit par la capture, écrit par le dépôt — la frontière est nette. */
export interface MessageAEcrire {
  messageId: string;
  inReplyTo: string | null;
  referencesBrut: string | null;
  sens: 'recu' | 'envoye';
  deAdresse: string;
  deNom: string | null;
  destinataires: string | null;
  nbDestinataires: number;
  objet: string | null;
  objetGabarit: string;
  recuLe: Date;
  corpsTexte: string | null;
  corpsHtml: string | null;
  automatique: boolean;
  signauxAutomatisme: string | null;
  exclusion: Exclusion | null;
}

/** Le fil auquel un message se rattache, une fois résolu en base. */
export interface FilResolu { filId: number; cree: boolean; fusionnes: number }

export interface DepsCapture {
  maintenant(): Date;
  config(): Promise<ConfigGestion>;
  /** Règles ACTIVES, par identifiant croissant (ordre déterministe → même trace à chaque relève). */
  reglesActives(): Promise<RegleExclusion[]>;

  // ── Boîte (LECTURE STRICTE : ouverture en readOnly, aucun flag posé, rien de déplacé ni supprimé) ──
  ouvrirDossier(chemin: string): Promise<void>;
  chercherDepuis(depuis: Date): Promise<number[]>;
  telecharger(uid: number): Promise<MessageBrut>;
  fermer(): Promise<void>;

  // ── Base ──
  /** Message-ID déjà en base : le dédoublonnage est ainsi GRATUIT, et toute reprise de rattrapage est sans danger. */
  connus(): Promise<Set<string>>;
  /** Fin de la dernière passe COMPLÈTE réussie (curseur), et date du message le plus récent déjà capturé. */
  bornes(): Promise<{ curseurComplet: Date | null; dernierCapture: Date | null }>;
  resoudreFil(identifiants: string[], cleRacine: string, objet: string | null): Promise<FilResolu>;
  ecrire(m: MessageAEcrire, filId: number): Promise<number | null>; // null = déjà écrit entre-temps (course)
  deposerPieces(messageId: number, pieces: PieceBrute[], config: ConfigGestion): Promise<{ deposees: number; nonDeposees: number }>;
}

export interface RapportCapture {
  mode: 'simulation' | 'applique';
  dossier: string;
  depuis: string | null;
  uidsServeur: number;
  plafondAtteint: boolean;
  vus: number;
  dejaConnus: number;
  captures: number;
  recus: number;
  envoyes: number;
  exclus: number;
  filsCrees: number;
  filsFusionnes: number;
  piecesDeposees: number;
  piecesNonDeposees: number;
  echecsLecture: number;
  parRegle: Record<string, number>;
}

/**
 * MARGE de la fenêtre, en jours. Trois écarts à couvrir : `SINCE` filtre à la granularité JOUR côté serveur ; deux
 * horloges, deux fuseaux ; et les RETARDATAIRES (un message sorti du spam apparaît avec une date antérieure). Le
 * dédoublonnage par `message_id` rend cette marge GRATUITE : un message re-vu n'est jamais réinséré.
 */
export const MARGE_JOURS = 3;

/**
 * DÉBUT DE LA FENÊTRE — la pièce qui garantit qu'un rattrapage de 90 jours AVANCE passe après passe, sans jamais boucler.
 *
 *   · aucun repère (premier run) → `maintenant − rattrapage_jours` : le rattrapage complet ;
 *   · sinon → le PLUS RÉCENT des deux repères, moins la marge :
 *       — `curseurComplet` (fin de la dernière passe COMPLÈTE) avance quand tout a été vu, y compris si la boîte est
 *         restée muette pendant six mois — sans lui, la fenêtre resterait figée six mois en arrière et chaque passe
 *         re-téléchargerait tout ;
 *       — `dernierCapture` (message le plus récent déjà capturé) avance quand les passes sont TRONQUÉES par le plafond,
 *         cas où le curseur, lui, reste gelé exprès. C'est ce repère-là qui fait progresser le rattrapage.
 *   Ensemble, ils couvrent les deux régimes : l'un ou l'autre bouge toujours. PUR.
 */
export function fenetreDepuis(
  bornes: { curseurComplet: Date | null; dernierCapture: Date | null },
  config: ConfigGestion,
  maintenant: Date,
): Date {
  const reperes = [bornes.curseurComplet, bornes.dernierCapture].filter((d): d is Date => d instanceof Date);
  const rattrapage = new Date(maintenant.getTime() - config.rattrapageJours * 86_400_000);
  if (reperes.length === 0) return rattrapage;
  const plusRecent = new Date(Math.max(...reperes.map((d) => d.getTime())));
  const avecMarge = new Date(plusRecent.getTime() - MARGE_JOURS * 86_400_000);
  // Jamais AVANT le rattrapage configuré : réduire la profondeur en base ne doit pas rouvrir un backlog déjà soldé.
  return avecMarge.getTime() > rattrapage.getTime() ? avecMarge : rattrapage;
}

/**
 * Sens d'un message : émis par la boîte de gestion, ou reçu. La comparaison passe par la configuration. PUR.
 *
 * 🔭 LOT ULTÉRIEUR — L'AUTEUR D'ORIGINE D'UN TRANSFERT (cf. migration 229). Un collègue du service location transfère à
 * la gestion un mail de locataire reçu sur son adresse : l'expéditeur devient alors une adresse interne, et `deAdresse`
 * désigne le collègue, pas le demandeur. Le corps du message porte pourtant l'information (« ---------- Message
 * transféré ---------- », avec le De: réel). La lire permettrait d'afficher le VRAI demandeur, puis de relier les
 * messages suivants par son adresse — rattachement automatique s'il n'a qu'UNE carte ouverte, simple PROPOSITION sinon
 * (jamais au jugé). Tant que ce lot n'existe pas, ces messages entrent dans la file au nom du collègue : imparfait, mais
 * VISIBLE — et c'est pour ça que les deux règles de domaine interne sont éteintes.
 */
export function sensDuMessage(deAdresse: string, adresseGestion: string): 'recu' | 'envoye' {
  return deAdresse.trim().toLowerCase() === adresseGestion.trim().toLowerCase() ? 'envoye' : 'recu';
}

/**
 * Prépare ce qui sera écrit pour un message : sens, gabarit d'objet, indice d'automatisme, et la règle d'exclusion qui
 * le tient hors de la file — s'il y en a une. N'ÉCRIT RIEN. PUR : c'est la fonction qu'on rejoue pour comprendre, des
 * mois après, pourquoi un message n'était pas dans la file.
 */
export function preparerMessage(m: MessageBrut, config: ConfigGestion, regles: readonly RegleExclusion[]): MessageAEcrire {
  const sens = sensDuMessage(m.deAdresse, config.adresseGestion);
  const indice = indiceAutomatisme(m.deAdresse, m.entetes);
  const exclusion = appliquerRegles(regles, { sens, deAdresse: m.deAdresse, objet: m.objet, entetes: m.entetes });
  return {
    messageId: m.messageId, inReplyTo: m.inReplyTo,
    referencesBrut: m.references.length > 0 ? m.references.join(' ') : null,
    sens, deAdresse: m.deAdresse, deNom: m.deNom, destinataires: m.destinataires, nbDestinataires: m.nbDestinataires,
    objet: m.objet, objetGabarit: normaliserObjet(m.objet), recuLe: m.recuLe,
    corpsTexte: m.corpsTexte, corpsHtml: m.corpsHtml,
    automatique: indice.automatique,
    signauxAutomatisme: indice.motifs.length > 0 ? indice.motifs.join(',') : null,
    exclusion,
  };
}

/**
 * UNE PASSE DE CAPTURE. `appliquer = false` (défaut) = SIMULATION : la boîte est lue, tout est calculé et compté, mais
 * RIEN n'est écrit — ni en base, ni sur le stockage. C'est le mode qui permet de regarder ce qu'une relève ferait avant
 * de la laisser faire.
 *
 * La boîte est TOUJOURS refermée (`finally`). Un message illisible est ISOLÉ (compté, jamais fatal) : un MIME cassé ne
 * doit pas faire perdre les 399 autres.
 */
export async function capturer(deps: DepsCapture, appliquer = false): Promise<RapportCapture> {
  const config = await deps.config();
  const regles = await deps.reglesActives();
  const bornes = await deps.bornes();
  const depuis = fenetreDepuis(bornes, config, deps.maintenant());
  const connus = await deps.connus();

  const r: RapportCapture = {
    mode: appliquer ? 'applique' : 'simulation', dossier: config.dossierImap, depuis: depuis.toISOString(),
    uidsServeur: 0, plafondAtteint: false, vus: 0, dejaConnus: 0, captures: 0, recus: 0, envoyes: 0, exclus: 0,
    filsCrees: 0, filsFusionnes: 0, piecesDeposees: 0, piecesNonDeposees: 0, echecsLecture: 0, parRegle: {},
  };

  await deps.ouvrirDossier(config.dossierImap);
  try {
    const uids = [...await deps.chercherDepuis(depuis)].sort((a, b) => a - b);
    r.uidsServeur = uids.length;
    // PLAFOND : on garde les plus ANCIENS, jamais les plus récents. Jeter les vieux les perdrait pour toujours (la
    //   fenêtre ne redescend jamais) ; jeter les récents ne coûte qu'une passe de plus — ils reviendront.
    const aLire = uids.length > config.plafondParPasse ? uids.slice(0, config.plafondParPasse) : uids;
    r.plafondAtteint = aLire.length < uids.length;

    for (const uid of aLire) {
      r.vus += 1;
      let m: MessageBrut;
      try {
        m = await deps.telecharger(uid);
      } catch {
        r.echecsLecture += 1; // ISOLATION : un message illisible ne fait pas perdre les autres
        continue;
      }
      const mid = m.messageId.trim();
      if (mid === '' || connus.has(mid)) { r.dejaConnus += 1; continue; }
      connus.add(mid); // un même Message-ID deux fois dans la même passe ne s'écrit qu'une fois

      const prepare = preparerMessage(m, config, regles);
      if (prepare.sens === 'envoye') r.envoyes += 1; else r.recus += 1;
      if (prepare.exclusion !== null) {
        r.exclus += 1;
        r.parRegle[prepare.exclusion.motif] = (r.parRegle[prepare.exclusion.motif] ?? 0) + 1;
      }
      if (!appliquer) { r.captures += 1; continue; } // SIMULATION : on a tout calculé, on n'écrit rien

      const identifiants = identifiantsMessage(m).map(pourComparaison);
      const fil = await deps.resoudreFil(identifiants, cleDuFil(m, uid, m.recuLe), m.objet);
      if (fil.cree) r.filsCrees += 1;
      r.filsFusionnes += fil.fusionnes;

      const id = await deps.ecrire(prepare, fil.filId);
      if (id === null) { r.dejaConnus += 1; continue; } // écrit entre-temps par une autre passe : jamais un doublon
      r.captures += 1;

      if (m.pieces.length > 0) {
        const bilan = await deps.deposerPieces(id, m.pieces, config);
        r.piecesDeposees += bilan.deposees;
        r.piecesNonDeposees += bilan.nonDeposees;
      }
    }
  } finally {
    await deps.fermer();
  }
  return r;
}
