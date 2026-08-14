/**
 * R7 — RELÈVE AUTOMATIQUE des réponses CRPA. Orchestrateur testable PAR INJECTION, branché dans le CORPS d'executerVeille
 * (AUCUN nouveau job, AUCUNE nouvelle clé de verrou, AUCUN nouveau .plist — cf. AGENTS.md / chantier R7). Trois garde-fous
 * AVANT toute connexion, chacun se soldant par « ignore » SANS écrire de ligne releve_run (éviter de noyer le journal) :
 *   - relève DÉSACTIVÉE (config opt-in) ;
 *   - intervalle NON écoulé (dernière relève « ok » plus récente que releve_intervalle_minutes) ;
 *   - profil INACTIF (compte IMAP absent) — rien à quoi se connecter.
 * Sinon TENTATIVE RÉELLE, journalisée en DEUX TEMPS : ligne « en_cours » AVANT la connexion, mise à jour « ok »/« erreur »
 * après (pour qu'un plantage brutal laisse quand même une trace datée).
 *
 * ISOLATION (exigence R7) : une panne de relève ne DOIT JAMAIS faire échouer la veille Sitadel. `executerReleveAuto`
 * n'aggrave jamais — sur échec de `relever`, il journalise « erreur » et RETOURNE (il ne relance pas). L'appelant
 * (executerVeille) l'enveloppe EN PLUS d'un try/catch qui avale : double filet. Boîte en LECTURE STRICTE (voir imap.ts) ;
 * appelle `releverBoite` avec `appliquer=true` ; n'écrit JAMAIS demande.statut ('close' reste sans écrivain, cf. R5).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import type { ProfilBoite } from './demandeReponseRepo';
import { releverBoite, type ClientBoite, type RapportReleve } from './releveReponses';

export type ResultatReleveAuto = 'ok' | 'erreur' | 'ignore';

export interface IssueReleveAuto {
  resultat: ResultatReleveAuto;
  raison: string;
  runId: number | null; // id de la ligne releve_run (null pour les cas « ignore » qui n'en écrivent pas)
}

/** Mise à jour finale d'une ligne releve_run : « ok » (compteurs du rapport) ou « erreur » (motif). */
export interface MajReleveRun {
  resultat: 'ok' | 'erreur';
  termineLe: Date;
  rapport?: RapportReleve; // présent si « ok » → renseigne les compteurs
  erreur?: string;         // présent si « erreur »
}

/** I/O de la relève automatique, injectables pour les tests (sans IMAP ni base). */
export interface DepsReleveAuto {
  maintenant(): Date;
  lireConfig(): Promise<{ active: boolean; intervalleMinutes: number; profil: ProfilBoite }>;
  dernierOkLe(): Promise<Date | null>;                            // termine_le du dernier releve_run « ok » (null si aucun)
  creerClient(profil: ProfilBoite): Promise<ClientBoite | null>;  // null = profil inactif (compte IMAP absent)
  relever(client: ClientBoite, profil: ProfilBoite): Promise<RapportReleve>;
  insererRun(profil: ProfilBoite): Promise<number>;               // ligne « en_cours », renvoie l'id
  finaliserRun(id: number, maj: MajReleveRun): Promise<void>;
}

/**
 * Orchestre UNE relève automatique. Ne relance JAMAIS sur erreur de relève (journalise « erreur » puis retourne) : c'est
 * l'appelant qui décide quoi faire de l'issue. Les cas « ignore » n'écrivent aucune ligne releve_run.
 */
export async function executerReleveAuto(deps: DepsReleveAuto): Promise<IssueReleveAuto> {
  const config = await deps.lireConfig();
  if (!config.active) return { resultat: 'ignore', raison: 'relève automatique désactivée', runId: null };

  const dernierOk = await deps.dernierOkLe();
  if (dernierOk !== null) {
    const ecouleMin = (deps.maintenant().getTime() - dernierOk.getTime()) / 60_000;
    if (ecouleMin < config.intervalleMinutes) {
      return { resultat: 'ignore', raison: `dernière relève il y a ${Math.floor(ecouleMin)} min (< ${config.intervalleMinutes})`, runId: null };
    }
  }

  const client = await deps.creerClient(config.profil);
  if (client === null) {
    return { resultat: 'ignore', raison: `profil « ${config.profil} » inactif (compte IMAP absent)`, runId: null };
  }

  // TENTATIVE RÉELLE → journal en DEUX TEMPS. `insererRun` pose la ligne « en_cours » AVANT d'ouvrir la boîte.
  const runId = await deps.insererRun(config.profil);
  try {
    const rapport = await deps.relever(client, config.profil);
    await deps.finaliserRun(runId, { resultat: 'ok', termineLe: deps.maintenant(), rapport });
    return { resultat: 'ok', raison: `${rapport.retenus} retenu(s), ${rapport.rattaches} rattaché(s), ${rapport.ecrites} enregistré(s)`, runId };
  } catch (e) {
    // On ABSORBE : la ligne « en_cours » passe « erreur » avec le motif, et on retourne SANS relancer (isolation).
    const motif = e instanceof Error ? e.message : String(e);
    await deps.finaliserRun(runId, { resultat: 'erreur', termineLe: deps.maintenant(), erreur: motif });
    return { resultat: 'erreur', raison: motif, runId };
  }
}

/** Issue d'une relève MANUELLE (chantier R1, bouton « Relever la boîte maintenant »). `inactif` = aucun compte IMAP configuré
 *  (rien à relever — ce n'est PAS une erreur, cf. convention CLI). `rapport` présent UNIQUEMENT si `resultat === 'ok'`. */
export interface IssueReleveManuelle {
  resultat: 'ok' | 'erreur' | 'inactif';
  raison: string;
  runId: number | null;
  rapport: RapportReleve | null;
}

/**
 * R1 — relève DÉCLENCHÉE À LA MAIN depuis l'interface. Même CŒUR que `executerReleveAuto` (mêmes deps, même journal releve_run
 * EN DEUX TEMPS, même ISOLATION : sur échec on journalise « erreur » et on RETOURNE sans relancer) MAIS SANS les gardes
 * opt-in/intervalle : un clic explicite du fondateur DOIT relever, que la relève automatique soit activée ou non et quelle que
 * soit l'ancienneté de la dernière passe. `config.active`/`intervalleMinutes` ne sont donc jamais lus ici — seul `profil` sert.
 * GARDE DE SÛRETÉ : n'appelle QUE `deps.relever` (= releverBoite : LECTURE IMAP stricte + enregistrement des réponses +
 * versement GED). AUCUN chemin d'envoi d'e-mail n'est atteignable. Ne relance JAMAIS (l'appelant décide de l'issue).
 */
export async function executerReleveManuelle(deps: DepsReleveAuto): Promise<IssueReleveManuelle> {
  const { profil } = await deps.lireConfig(); // SEUL profil est utilisé : ni active ni intervalle (déclenchement explicite)
  const client = await deps.creerClient(profil);
  if (client === null) {
    return { resultat: 'inactif', raison: `profil « ${profil} » inactif (compte IMAP absent)`, runId: null, rapport: null };
  }
  const runId = await deps.insererRun(profil); // ligne « en_cours » AVANT d'ouvrir la boîte (trace même en cas de plantage brutal)
  try {
    const rapport = await deps.relever(client, profil);
    await deps.finaliserRun(runId, { resultat: 'ok', termineLe: deps.maintenant(), rapport });
    return { resultat: 'ok', raison: `${rapport.retenus} retenu(s), ${rapport.rattaches} rattaché(s), ${rapport.ecrites} enregistré(s)`, runId, rapport };
  } catch (e) {
    const motif = e instanceof Error ? e.message : String(e);
    await deps.finaliserRun(runId, { resultat: 'erreur', termineLe: deps.maintenant(), erreur: motif });
    return { resultat: 'erreur', raison: motif, runId, rapport: null };
  }
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────
/** Infixe des variables d'environnement par profil (même convention que la CLI `demandes:relever` et `demandes:envoyer`). */
const INFIXE: Record<ProfilBoite, string> = { entreprise: '', personne: 'PERSONNE_' };

export function depsReellesReleveAuto(): DepsReleveAuto {
  return {
    maintenant: () => new Date(),
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      const profil: ProfilBoite = c.releveProfil === 'personne' ? 'personne' : 'entreprise'; // garde : liste fermée
      return { active: c.releveActive, intervalleMinutes: c.releveIntervalleMinutes, profil };
    },
    dernierOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    creerClient: async (profil) => {
      // Import DYNAMIQUE d'imap.ts (imapflow) et de l'index e-mail (nodemailer) : garde ces dépendances lourdes HORS du
      // graphe statique d'executerVeille et de ses tests node-purs. `lireCompteImap` renvoie null si le profil est inactif.
      const { lireCompteImap } = await import('../email');
      const compte = lireCompteImap(INFIXE[profil]);
      if (compte === null) return null;
      const { creerClientBoite } = await import('../email/imap');
      return creerClientBoite(compte);
    },
    relever: async (client, profil) => { // appliquer=true : écriture réelle (R7). N1-A : branche le versement auto en GED.
      const { brancheDepotManuel } = await import('../sitadel/depotManuel');
      return releverBoite({ client, profil, appliquer: true, depot: await brancheDepotManuel(profil) });
    },
    insererRun: async (profil) => {
      const { rows } = await query<{ id: number }>(
        `INSERT INTO releve_run (profil, declencheur, resultat) VALUES ($1, 'planifie', 'en_cours') RETURNING id`, [profil]);
      return rows[0].id;
    },
    finaliserRun: async (id, m) => {
      const r = m.rapport;
      await query(
        `UPDATE releve_run SET resultat = $2, termine_le = $3,
           vus = $4, deja_connus = $5, hors_perimetre = $6, retenus = $7, rattaches = $8,
           rebonds_detectes = $9, rebonds_rattaches = $10, rebonds_etrangers = $11, rebonds_appliques = $12,
           accuses = $13, enregistrees = $14, plafond_atteint = $15, pieces_deposees = $16, pieces_non_deposees = $17, erreur = $18
         WHERE id = $1`,
        [id, m.resultat, m.termineLe,
          r?.vus ?? null, r?.dejaConnus ?? null, r?.horsPerimetre ?? null, r?.retenus ?? null, r?.rattaches ?? null,
          r?.rebondsDetectes ?? null, r?.rebondsRattaches ?? null, r?.rebondsEtrangers ?? null, r?.rebondsAppliques ?? null,
          r?.accuses ?? null, r?.ecrites ?? null, r?.plafondAtteint ?? null, r?.piecesDeposees ?? null, r?.piecesNonDeposees ?? null, m.erreur ?? null]);
    },
  };
}
