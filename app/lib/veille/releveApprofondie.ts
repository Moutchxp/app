/**
 * R6 — RELÈVE APPROFONDIE ciblée sur UNE demande. Objectif exprimé : « être certain de ne pas avoir loupé le mail
 * attendu ». Elle cherche dans TOUS LES DOSSIERS de la boîte (INBOX ET les autres, indésirables compris), chacun ouvert en
 * LECTURE STRICTE, sur une fenêtre remontant à l'envoi (envoye_le − 1 j), SANS le filtre de pertinence courant mais
 * RESTREINTE aux messages plausiblement liés à CETTE demande : domaine du destinataire, référence/threading, ou (pour un
 * rebond) destinataire en échec. Elle journalise une ligne releve_run (declencheur 'approfondi' + demande_id) et enregistre
 * les réponses trouvées.
 *
 * Ce module NE génère AUCUNE relance, N'ENVOIE AUCUNE alerte, n'écrit JAMAIS demande.statut. AUCUN nouveau job ni verrou :
 * l'orchestrateur est appelé depuis le CORPS d'executerVeille (déjà sous CLE_VERROU). GARDE : au plus une approfondie par
 * demande et par jour. ISOLATION : un échec est journalisé 'erreur' et jamais relancé (l'appelant l'enveloppe en plus).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { enregistrerReponse, deposerEtLierPieces, type ProfilBoite } from './demandeReponseRepo';
import { rattacherReponse, estAccuseDeRebond, type DemandeCandidate } from './rattachementReponse';
import { analyserRapportRejet, normaliserMessageId } from './rapportRejet';
import { construireLigne, type CritereRecherche, type LigneReleve, type MessageBoite, type PieceMeta } from './releveReponses';
import { etatEcheance, type ReglagesEcheance } from './echeance';

/**
 * Accès MULTI-BOÎTES à la boîte de réponse, implémenté par imap.ts (`creerClientApprofondi`), faussé dans les tests. Chaque
 * boîte est ouverte en LECTURE STRICTE (comme INBOX) : on ne pose/retire aucun flag, on ne déplace/supprime rien.
 */
export interface ClientApprofondi {
  ouvrir(): Promise<void>;                     // connexion (SANS ouvrir de boîte)
  listerBoites(): Promise<string[]>;           // chemins de TOUTES les boîtes sélectionnables
  ouvrirBoite(chemin: string): Promise<void>;  // EXAMINE / readOnly — jamais d'écriture
  chercher(criteres: CritereRecherche): Promise<number[]>;
  telechargerMessage(uid: number): Promise<MessageBoite>;
  fermer(): Promise<void>;
}

/** La demande visée par une relève approfondie (identité + fenêtre + Message-ID émis pour rattacher réponses et rebonds). */
export interface CibleApprofondie {
  demandeId: number;
  reference: string;
  destEmail: string;
  profil: ProfilBoite;
  envoyeLe: Date;
  messageIdsEmis: string[];
}

export interface RapportApprofondi {
  mode: 'simulation' | 'applique';
  demandeId: number;
  boitesExplorees: string[];
  vus: number;
  retenus: number;              // = lignes.length
  rattaches: number;            // lignes avec demande_id renseigné (threading/référence/rebond lié)
  rebondsRattaches: number;
  ecrites: number;
  piecesDeposees: number;       // R4 : pièces déposées sur l'object storage
  piecesNonDeposees: number;    // R4 : pièces non déposées (trace + motif conservés)
  lignes: LigneReleve[];
}

export interface OptionsReleveApprofondie {
  client: ClientApprofondi;
  cible: CibleApprofondie;
  appliquer?: boolean;       // défaut false (simulation : aucune écriture)
  plafondParBoite?: number;  // défaut 200 (garde-fou par dossier)
}

const SONDES_REBOND = ['mailer-daemon', 'postmaster'] as const;
const MS_JOUR = 86_400_000;

function domaineDe(adresse: string): string {
  const at = adresse.lastIndexOf('@');
  return at === -1 ? '' : adresse.slice(at + 1).trim().toLowerCase();
}

/**
 * Relève APPROFONDIE d'UNE demande sur TOUTES les boîtes. `appliquer=false` (défaut) = simulation. Un message est retenu
 * s'il est plausiblement lié à la cible : rebond dont le Message-ID d'origine / le destinataire en échec correspond, ou
 * réponse normale dont le threading/la référence correspond, ou message émis depuis le domaine du destinataire.
 */
export async function releverApprofondie(opts: OptionsReleveApprofondie): Promise<RapportApprofondi> {
  const appliquer = opts.appliquer === true;
  const plafond = opts.plafondParBoite ?? 200;
  const mode: 'simulation' | 'applique' = appliquer ? 'applique' : 'simulation';
  const { cible } = opts;
  const domaineCible = domaineDe(cible.destEmail);
  const depuis = new Date(cible.envoyeLe.getTime() - MS_JOUR); // fenêtre = envoi − 1 jour (et non la fenêtre courante)
  const candidate: DemandeCandidate = { id: cible.demandeId, reference: cible.reference, profilBoite: cible.profil, statut: 'envoyee', messageIdsEmis: cible.messageIdsEmis, numerosDossier: [] };

  const boitesExplorees: string[] = [];
  const lignes: LigneReleve[] = [];
  const vusIds = new Set<string>(); // dédup par Message-ID à travers les dossiers
  let vus = 0, rebondsRattaches = 0, ecrites = 0, piecesDeposees = 0, piecesNonDeposees = 0;
  // R4 — borne de taille des pièces (config) ; lue seulement en mode APPLIQUÉ (aucun dépôt en simulation).
  const tailleMaxOctets = appliquer ? (await chargerConfigVeille()).pieceTailleMaxMo * 1024 * 1024 : 0;
  const deposerPieces = async (reponseId: number, demandeId: number | null, pieces: PieceMeta[]): Promise<void> => {
    const bilan = await deposerEtLierPieces(reponseId, demandeId,
      pieces.map((p) => ({ nomFichier: p.nomFichier, typeMime: p.typeMime, contenu: p.contenu })), tailleMaxOctets);
    piecesDeposees += bilan.deposees; piecesNonDeposees += bilan.nonDeposees;
  };

  await opts.client.ouvrir();
  try {
    const boites = await opts.client.listerBoites();
    for (const boite of boites) {
      await opts.client.ouvrirBoite(boite); // LECTURE STRICTE — vaut aussi pour les indésirables
      boitesExplorees.push(boite);

      // Sélection SERVEUR par domaine du destinataire + sondes de rebond (mailer-daemon / postmaster), sur la fenêtre.
      const uids = new Set<number>();
      if (domaineCible !== '') for (const uid of await opts.client.chercher({ depuis, from: domaineCible })) uids.add(uid);
      for (const sonde of SONDES_REBOND) for (const uid of await opts.client.chercher({ depuis, from: sonde })) uids.add(uid);
      const selection = [...uids].sort((a, b) => a - b).slice(-plafond);

      for (const uid of selection) {
        const mb = await opts.client.telechargerMessage(uid);
        const mid = mb.message.messageId.trim();
        if (mid === '' || vusIds.has(mid)) continue;
        vusIds.add(mid);
        vus += 1;

        // ── REBOND (DSN) : retenu seulement s'il concerne CETTE demande ──
        if (estAccuseDeRebond(mb.message)) {
          const dsn = analyserRapportRejet({ corpsTexte: mb.message.corpsTexte, parties: mb.partiesRapport });
          const parId = dsn.messageIdOrigine !== undefined && cible.messageIdsEmis.some((m) => normaliserMessageId(m) === dsn.messageIdOrigine);
          const parDest = dsn.destinataireEchec !== undefined && cible.destEmail !== '' && cible.destEmail.toLowerCase() === dsn.destinataireEchec;
          if (!parId && !parDest) continue; // rebond ÉTRANGER → jamais retenu
          const motif = dsn.diagnostic ?? dsn.statut ?? 'rebond';
          rebondsRattaches += 1;
          lignes.push({ messageId: mid, demandeId: cible.demandeId, methode: 'message_id', rebond: true, motif, deAdresse: mb.message.deAdresse, objet: mb.message.objet ?? null, nbPieces: mb.pieces.length });
          if (appliquer) { const id = await enregistrerReponse(construireLigne(cible.profil, mb, mid, cible.demandeId, 'message_id', motif)); if (id !== null) { ecrites += 1; await deposerPieces(id, cible.demandeId, mb.pieces); } }
          continue;
        }

        // ── RÉPONSE NORMALE : retenue si threading/référence correspond, OU si elle vient du domaine du destinataire ──
        const r = rattacherReponse(mb.message, [candidate]);
        const domaineOk = domaineCible !== '' && domaineDe(mb.message.deAdresse) === domaineCible;
        if (r.methode === 'aucun' && !domaineOk) continue; // ni référence ni domaine → pas lié à cette demande
        // demandeId = celui du rattachement CERTAIN (threading/référence) ; NULL si seulement le domaine correspond
        // (le message part alors dans la file « à rattacher » pour décision humaine — on ne force pas un lien incertain).
        lignes.push({ messageId: mid, demandeId: r.demandeId, methode: r.methode, rebond: false, motif: r.motif, deAdresse: mb.message.deAdresse, objet: mb.message.objet ?? null, nbPieces: mb.pieces.length });
        if (appliquer) { const id = await enregistrerReponse(construireLigne(cible.profil, mb, mid, r.demandeId, r.methode, r.motif)); if (id !== null) { ecrites += 1; await deposerPieces(id, r.demandeId, mb.pieces); } }
      }
    }
  } finally {
    await opts.client.fermer();
  }

  const rattaches = lignes.filter((l) => l.demandeId !== null).length;
  return { mode, demandeId: cible.demandeId, boitesExplorees, vus, retenus: lignes.length, rattaches, rebondsRattaches, ecrites, piecesDeposees, piecesNonDeposees, lignes };
}

// ── Orchestration : sélection des demandes dépassées/proches + garde 1/jour + journal ─────────────────────────────────
export type ResultatApprofondie = 'ok' | 'erreur' | 'ignore';

/** Mise à jour finale d'une ligne releve_run 'approfondi'. */
export interface MajApprofondie {
  resultat: 'ok' | 'erreur';
  termineLe: Date;
  rapport?: RapportApprofondi;
  erreur?: string;
}

/** Une demande envoyée suivie pour l'échéance (identité + acheminement + compteurs de satisfaction au dossier — R6c). */
export interface DemandeSuivie {
  demandeId: number;
  reference: string;
  destEmail: string;
  envoyeLe: Date | null;
  statutAcheminement: string;
  dossiersActifs: number;      // R6c : nb de dossiers actifs
  dossiersSatisfaits: number;  // R6c : nb de dossiers dont les pièces sont obtenues
  messageIdsEmis: string[];
}

/** I/O de l'approfondie automatique, injectables pour les tests (sans IMAP ni base). */
export interface DepsApprofondie {
  maintenant(): Date;
  lireReglages(): Promise<ReglagesEcheance & { profil: ProfilBoite }>;
  derniereReleveOkLe(): Promise<Date | null>;
  lireDemandesSuivies(profil: ProfilBoite): Promise<DemandeSuivie[]>;
  profilActif(profil: ProfilBoite): Promise<boolean>;
  approfondieFaiteAujourdHui(demandeId: number): Promise<boolean>;
  releverCible(cible: CibleApprofondie): Promise<RapportApprofondi>;
  insererRun(profil: ProfilBoite, demandeId: number): Promise<number>;
  finaliserRun(id: number, maj: MajApprofondie): Promise<void>;
}

export interface BilanApprofondie { examinees: number; lancees: number; ignorees: number; erreurs: number }

/**
 * Lance une relève approfondie pour chaque demande dont l'état d'échéance est 'depassee' ou 'proche' (donc relève courante
 * fraîche : jamais de silence non vérifié), au plus une fois par jour et par demande. Journal en DEUX TEMPS ('en_cours' →
 * 'ok'/'erreur'). Un échec sur une demande n'interrompt pas les suivantes.
 */
export async function executerApprofondieAuto(deps: DepsApprofondie): Promise<BilanApprofondie> {
  const reglages = await deps.lireReglages();
  if (!(await deps.profilActif(reglages.profil))) return { examinees: 0, lancees: 0, ignorees: 0, erreurs: 0 }; // pas de compte → rien

  const derniereOk = await deps.derniereReleveOkLe();
  const demandes = await deps.lireDemandesSuivies(reglages.profil);
  const maintenant = deps.maintenant();

  let examinees = 0, lancees = 0, ignorees = 0, erreurs = 0;
  for (const d of demandes) {
    const etat = etatEcheance(
      { envoyeLe: d.envoyeLe, statutAcheminement: d.statutAcheminement, dossiersActifs: d.dossiersActifs, dossiersSatisfaits: d.dossiersSatisfaits, derniereReleveOkLe: derniereOk },
      maintenant, reglages,
    );
    if ((etat.etat !== 'depassee' && etat.etat !== 'proche') || d.envoyeLe === null) continue;
    examinees += 1;

    // GARDE : au plus une approfondie par demande et par jour (posée via releve_run).
    if (await deps.approfondieFaiteAujourdHui(d.demandeId)) { ignorees += 1; continue; }

    const cible: CibleApprofondie = { demandeId: d.demandeId, reference: d.reference, destEmail: d.destEmail, profil: reglages.profil, envoyeLe: d.envoyeLe, messageIdsEmis: d.messageIdsEmis };
    const runId = await deps.insererRun(reglages.profil, d.demandeId); // 'en_cours' AVANT connexion
    try {
      const rapport = await deps.releverCible(cible);
      await deps.finaliserRun(runId, { resultat: 'ok', termineLe: deps.maintenant(), rapport });
      lancees += 1;
    } catch (e) {
      const motif = e instanceof Error ? e.message : String(e);
      await deps.finaliserRun(runId, { resultat: 'erreur', termineLe: deps.maintenant(), erreur: motif });
      erreurs += 1;
    }
  }
  return { examinees, lancees, ignorees, erreurs };
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────
const INFIXE: Record<ProfilBoite, string> = { entreprise: '', personne: 'PERSONNE_' };

export function depsReellesApprofondie(): DepsApprofondie {
  return {
    maintenant: () => new Date(),
    lireReglages: async () => {
      const c = await chargerConfigVeille();
      const profil: ProfilBoite = c.releveProfil === 'personne' ? 'personne' : 'entreprise'; // garde : liste fermée
      return { echeanceAlerteJours: c.echeanceAlerteJours, releveFraicheurHeures: c.releveFraicheurHeures, profil };
    },
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    lireDemandesSuivies: async (profil) => {
      // Une ligne par demande ENVOYÉE : envoye_le (le plus ancien envoi), statut d'acheminement représentatif (un envoi
      // réussi prime sur un rebond/échec — retry), Message-ID émis, et présence d'une réponse rattachée.
      const { rows } = await query<{
        id: number; reference: string; dest_email: string; envoye_le: Date | null;
        statut_acheminement: string; message_ids: string[]; dossiers_actifs: number; dossiers_satisfaits: number;
      }>(
        `SELECT d.id::int AS id, d.reference, coalesce(d.dest_email, '') AS dest_email,
                min(a.envoye_le) AS envoye_le,
                CASE WHEN bool_or(a.statut = 'envoye') THEN 'envoye'
                     WHEN bool_or(a.statut = 'rebond') THEN 'rebond'
                     WHEN bool_or(a.statut = 'echec')  THEN 'echec'
                     ELSE 'en_attente' END AS statut_acheminement,
                coalesce(array_agg(a.message_id) FILTER (WHERE a.message_id IS NOT NULL), '{}') AS message_ids,
                (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
                (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NOT NULL) AS dossiers_satisfaits
           FROM demande d
           -- B2 — ancre d'envoi agnostique au canal (téléservice = 'formulaire') ; les message_id restent e-mail (agg filtré).
           LEFT JOIN demande_acheminement a ON a.demande_id = d.id
          WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1
          GROUP BY d.id, d.reference, d.dest_email`,
        [profil],
      );
      return rows.map((r) => ({
        demandeId: r.id, reference: r.reference, destEmail: r.dest_email, envoyeLe: r.envoye_le,
        statutAcheminement: r.statut_acheminement, dossiersActifs: r.dossiers_actifs, dossiersSatisfaits: r.dossiers_satisfaits, messageIdsEmis: r.message_ids,
      }));
    },
    profilActif: async (profil) => {
      const { lireCompteImap } = await import('../email'); // import dynamique : garde nodemailer/imapflow hors du graphe statique
      return lireCompteImap(INFIXE[profil]) !== null;
    },
    approfondieFaiteAujourdHui: async (demandeId) => {
      const { rows } = await query<{ fait: boolean }>(
        `SELECT EXISTS (
            SELECT 1 FROM releve_run
             WHERE declencheur = 'approfondi' AND demande_id = $1 AND demarre_le >= date_trunc('day', now())
          ) AS fait`,
        [demandeId]);
      return rows[0]?.fait === true;
    },
    releverCible: async (cible) => {
      const { lireCompteImap } = await import('../email');
      const compte = lireCompteImap(INFIXE[cible.profil]);
      if (compte === null) throw new Error(`profil « ${cible.profil} » inactif (compte IMAP absent)`);
      const { creerClientApprofondi } = await import('../email/imap');
      return releverApprofondie({ client: creerClientApprofondi(compte), cible, appliquer: true });
    },
    insererRun: async (profil, demandeId) => {
      const { rows } = await query<{ id: number }>(
        `INSERT INTO releve_run (profil, declencheur, demande_id, resultat) VALUES ($1, 'approfondi', $2, 'en_cours') RETURNING id`,
        [profil, demandeId]);
      return rows[0].id;
    },
    finaliserRun: async (id, m) => {
      const r = m.rapport;
      await query(
        `UPDATE releve_run SET resultat = $2, termine_le = $3,
           vus = $4, retenus = $5, rattaches = $6, rebonds_rattaches = $7, enregistrees = $8,
           pieces_deposees = $9, pieces_non_deposees = $10, erreur = $11
         WHERE id = $1`,
        [id, m.resultat, m.termineLe, r?.vus ?? null, r?.retenus ?? null, r?.rattaches ?? null, r?.rebondsRattaches ?? null, r?.ecrites ?? null, r?.piecesDeposees ?? null, r?.piecesNonDeposees ?? null, m.erreur ?? null]);
    },
  };
}
