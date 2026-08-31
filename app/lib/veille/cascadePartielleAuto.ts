/**
 * AUTO-PARTIEL — EXÉCUTEUR automatique de la cascade PARTIELLE (CASC-3 : relances 1..N, annonce CADA). Jusqu'ici 100 % manuel
 * (`cascadePartielleRepo`, envoi via clic) ; arbitrage Arno : tout doit partir SEUL aux dates dérivées de partiel_le + config, comme
 * l'ordinaire (`relanceAuto`/`envoiAuto`) et la relance sur réponse (PART-E, `relanceReponsePartielleAuto`). Ce module est calqué sur
 * PART-E : deps injectées (pur, testable), gated par un interrupteur, fenêtre ouvrée, cap par run, erreurs isolées.
 *
 * 🔴 GARDE-FOU ABSOLU « jamais deux fois la même relance » : l'envoi passe par le MÊME `executerRelancePartielle` que le manuel, qui
 *   RÉSERVE le créneau (demande, étape) AVANT d'envoyer (PK `cascade_partiel_creneau`). Auto et manuel réservent le MÊME créneau : le
 *   premier gagne, le second reçoit « déjà servi » → 'ignore' (aucun doublon). En plus, le journal fait avancer la cascade → au run
 *   suivant l'étape n'est plus DUE. Butoir CADA inchangé (ancré à partiel_le, cf. cascadePartielle.ts).
 *
 * 🔴 SAISINE hors périmètre : seules les étapes 'relance' et 'annonce' partent ici. La saisine ('saisine_proposable') relève de son
 *   propre flux (`preparerSaisinePartielleAuto`), déjà dans la boucle — jamais envoyée comme une relance.
 */
import { fenetreEnvoiOuverte } from './envoiOuvre';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { chargerCascadePartielle, lireDemandesPartiellesActives, executerRelancePartielle, depsReellesRelancePartielle } from './cascadePartielleRepo';

/** Une étape partielle DUE prête à partir (texte dérivé de la config à jour). */
export interface CandidatCascadePartielle { demandeId: number; etape: 'relance' | 'annonce'; rang: number | null; objet: string; corps: string }

export interface DepsCascadePartielleAuto {
  maintenant(): Date;
  lireConfig(): Promise<{ actif: boolean; envoiHeureDebut: number; envoiHeureFin: number; capParRun: number }>;
  candidats(): Promise<CandidatCascadePartielle[]>;
  /** Envoie UN candidat via le chemin partagé (réservation de créneau incluse). 'ignore' = créneau déjà servi / rien à envoyer (aucun doublon) ; lève sur erreur RÉELLE (SMTP). */
  envoyer(c: CandidatCascadePartielle): Promise<'envoye' | 'ignore'>;
}

export interface BilanCascadePartielle { candidats: number; envoyes: number; ignores: number; erreurs: number; reporte: boolean; raison: string }

/**
 * Une passe. Gated par l'interrupteur (OFF → rien, l'envoi manuel reste possible) ; fenêtre ouvrée ; cap par run ; un échec est ISOLÉ
 * (compté, on continue). AUCUN doublon possible (réservation de créneau dans `envoyer`). PUR par injection.
 */
export async function executerCascadePartielleAuto(deps: DepsCascadePartielleAuto): Promise<BilanCascadePartielle> {
  const cfg = await deps.lireConfig();
  if (!cfg.actif) return { candidats: 0, envoyes: 0, ignores: 0, erreurs: 0, reporte: false, raison: 'envoi auto de la cascade partielle désactivé (arrêt d’urgence)' };
  const fen = fenetreEnvoiOuverte(deps.maintenant(), cfg.envoiHeureDebut, cfg.envoiHeureFin);
  if (!fen.ouverte) return { candidats: 0, envoyes: 0, ignores: 0, erreurs: 0, reporte: true, raison: fen.coherente ? 'hors fenêtre d’envoi (jour/heure ouvrés) — reporté' : 'fenêtre d’envoi mal réglée — reporté' };

  const candidats = await deps.candidats();
  let envoyes = 0, ignores = 0, erreurs = 0;
  for (const c of candidats) {
    if (envoyes >= cfg.capParRun) break; // cap PAR RUN (anti-emballement), JAMAIS un plafond quotidien (échange de suivi)
    try {
      const issue = await deps.envoyer(c);
      if (issue === 'envoye') envoyes += 1; else ignores += 1;
    } catch { erreurs += 1; } // isolation : un envoi en échec (SMTP) n'arrête pas les suivants ; le créneau est relâché → retentable
  }
  return { candidats: candidats.length, envoyes, ignores, erreurs, reporte: false, raison: `envoyées=${envoyes}, ignorées=${ignores}, erreurs=${erreurs}` };
}

// ── Accès données (production) ─────────────────────────────────────────────────
export function depsReellesCascadePartielleAuto(): DepsCascadePartielleAuto {
  return {
    maintenant: () => new Date(),
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { actif: c.cascadePartielAutoActive === true, envoiHeureDebut: c.envoiHeureDebut, envoiHeureFin: c.envoiHeureFin, capParRun: c.envoisAutoMaxParRun };
    },
    candidats: async () => {
      const out: CandidatCascadePartielle[] = [];
      for (const demandeId of await lireDemandesPartiellesActives()) {
        const c = await chargerCascadePartielle(demandeId); // étape DUE dérivée de partiel_le + config (dates au runtime, pilotage sans code)
        if (c === null || (c.etape !== 'relance' && c.etape !== 'annonce') || c.brouillon === null) continue; // 'aucune'/'saisine_proposable' → pas ici
        out.push({ demandeId, etape: c.etape, rang: c.rang, objet: c.brouillon.objet, corps: c.brouillon.corps });
      }
      return out;
    },
    envoyer: async (c) => {
      const r = await executerRelancePartielle(depsReellesRelancePartielle(), { demandeId: c.demandeId, etape: c.etape, rang: c.rang, objet: c.objet, corps: c.corps, auteur: 'auto' });
      return r.ok ? 'envoye' : 'ignore'; // refus bénin (créneau déjà servi / pas de cible) → ignore ; une erreur RÉELLE (SMTP) a déjà levé dans envoyer()
    },
  };
}
