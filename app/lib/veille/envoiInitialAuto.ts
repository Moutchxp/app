/**
 * 224 — ENVOI AUTOMATIQUE de la 1re DEMANDE d'information (rail e-mail). Branché dans le CORPS d'executerVeille, sous le MÊME verrou,
 * à côté de l'envoi auto des relances (`envoiAuto.ts`) mais STRICTEMENT INDÉPENDANT de lui.
 *
 * 🔴 INTERRUPTEUR UNIQUE, DISTINCT : `email_envoi_initial_auto_active` (défaut false). Il ne lit NI n'écrit `relance_auto_active`,
 *    `saisine_cada_auto_active` ni `cascade_partiel_auto_active` — activer/désactiver l'envoi de la 1re demande n'a AUCUN effet sur
 *    les relances/saisines, et réciproquement (cf. `depsReellesEnvoiInitialAuto.lireConfig`, qui ne lit QUE ce flag + la fenêtre).
 *
 * 🔴 AUCUN CONTOURNEMENT DES CAPS : ce module N'ÉCRIT AUCUNE logique d'envoi. Il APPELLE `envoyerDemandes` (chemin d'envoi RÉEL des
 *    demandes 'prete' e-mail), qui applique DÉJÀ `capBatch(cap/run, cap/jour, émis du jour)` et les gardes existantes. Ce module
 *    ajoute UNIQUEMENT la garde de FENÊTRE HORAIRE (jour/heure ouvrés) AVANT d'appeler : hors fenêtre → rien ne part, on le signale.
 *    Le plafond mensuel par commune est déjà appliqué à la CRÉATION (les demandes 'prete' le respectent). Aucune voie parallèle.
 *
 * ISOLÉ : un échec ne fait jamais échouer la veille (le CORPS d'executerVeille l'enveloppe d'un try/catch ; on renvoie aussi un
 * `resultat: 'echec'` explicite plutôt que de propager). Interrupteur à false (défaut) → `resultat: 'ignore'`, rien n'est envoyé.
 */
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { envoyerDemandes, type RapportEnvoi } from '../sitadel/envoiDemande';
import { fenetreEnvoiOuverte } from './envoiOuvre';

export interface DepsEnvoiInitialAuto {
  /** Lit UNIQUEMENT l'interrupteur d'envoi initial + la fenêtre horaire. JAMAIS les interrupteurs de relance/saisine (séparation). */
  lireConfig(): Promise<{ envoiInitialActive: boolean; envoiHeureDebut: number; envoiHeureFin: number }>;
  /** Envoi RÉEL des 1res demandes 'prete' e-mail (appliquer:true). Applique `capBatch` et tous les caps DANS `envoyerDemandes`. */
  envoyerDemandes(): Promise<RapportEnvoi>;
  maintenant(): Date;
}

export interface IssueEnvoiInitialAuto {
  resultat: 'ignore' | 'reporte' | 'termine' | 'echec';
  envoyees: number;   // 1res demandes réellement parties
  budget: number;     // taille de salve autorisée par les caps (capBatch) — 0 si rien envoyé
  raison: string;
}

const nomErr = (e: unknown): string => (e instanceof Error ? e.name : 'Error');

/**
 * Exécute l'envoi auto de la 1re demande, gardé par l'interrupteur PUIS par la fenêtre horaire, PUIS borné par les caps (dans
 * `envoyerDemandes`). PUR par injection (aucun I/O direct — tout passe par `deps`). Aucun interrupteur actif → 'ignore' (rien envoyé).
 */
export async function executerEnvoiInitialAuto(deps: DepsEnvoiInitialAuto): Promise<IssueEnvoiInitialAuto> {
  const cfg = await deps.lireConfig();
  // GARDE 1 — interrupteur (défaut false → rien ne part de lui-même). SÉPARATION : cette décision ne dépend QUE de son propre flag.
  if (!cfg.envoiInitialActive) {
    return { resultat: 'ignore', envoyees: 0, budget: 0, raison: 'envoi initial automatique désactivé (email_envoi_initial_auto_active=false)' };
  }
  // GARDE 2 — fenêtre horaire (jour/heure ouvrés). Bornes incohérentes OU fenêtre fermée → rien ne part (jamais un plantage).
  const fen = fenetreEnvoiOuverte(deps.maintenant(), cfg.envoiHeureDebut, cfg.envoiHeureFin);
  if (!fen.coherente) return { resultat: 'reporte', envoyees: 0, budget: 0, raison: 'fenêtre horaire incohérente (début ≥ fin ou hors 0-23) — rien envoyé' };
  if (!fen.ouverte) return { resultat: 'reporte', envoyees: 0, budget: 0, raison: 'hors fenêtre horaire d’envoi — reporté au prochain créneau ouvré' };
  // GARDE 3 — les caps : appliqués DANS envoyerDemandes (capBatch cap/run + cap/jour). Aucun contournement ici.
  try {
    const r = await deps.envoyerDemandes();
    const envoyees = r.resultats.filter((x) => x.issue === 'envoye').length;
    return { resultat: 'termine', envoyees, budget: r.budget, raison: `1res demandes envoyées=${envoyees} (budget ${r.budget}, cap/run ${r.capParRun}, cap/jour ${r.capParJour})` };
  } catch (e) {
    return { resultat: 'echec', envoyees: 0, budget: 0, raison: `envoi initial automatique en échec (${nomErr(e)}) — isolé, la veille continue` };
  }
}

/** Dépendances RÉELLES. `lireConfig` ne lit QUE le flag + la fenêtre (séparation prouvée par test). `envoyerDemandes` = envoi réel capé. */
export function depsReellesEnvoiInitialAuto(): DepsEnvoiInitialAuto {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { envoiInitialActive: c.emailEnvoiInitialAutoActive === true, envoiHeureDebut: c.envoiHeureDebut, envoiHeureFin: c.envoiHeureFin };
    },
    envoyerDemandes: () => envoyerDemandes({ appliquer: true, auteur: 'auto' }),
    maintenant: () => new Date(),
  };
}
