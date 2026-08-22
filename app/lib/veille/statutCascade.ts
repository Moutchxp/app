/**
 * Lot 4/6 — STATUT DÉRIVÉ de la cascade, à la LECTURE (jamais stocké, jamais écrit dans demande.statut). Deux fonctions PURES,
 * client-safe (aucune I/O) :
 *  - `statutCascade` : le libellé de la colonne STATUT — reflète le DERNIER ENVOI RÉEL (demande_acheminement), pas un brouillon
 *    préparé (« prêt, non envoyé » si préparé sans être parti). Heures en Europe/Paris.
 *  - `prochaineEtape` : l'étape suivante + sa date prévue (fenêtre du lot 3) ; à défaut, DIT explicitement pourquoi il n'y en a
 *    aucune (règle « aucun compte à zéro muet »).
 *
 * ⚠️ Ces libellés vont dans la colonne STATUT. La colonne « Retour mairie » (vocabulaire T8) est réservée à ce que fait la
 * MAIRIE — une relance est NOTRE action, elle n'y entre jamais.
 */
import { etapeCible, saisineLeDe, type ReglagesCascade } from './cascadeRelance';
import { echeanceDe } from './echeance';

const MS_JOUR = 86_400_000;
const TZ = 'Europe/Paris';

/** « 14 avril 2026 à 12:00 » (Europe/Paris). */
function dateHeure(iso: string): string {
  const d = new Date(iso);
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d);
  return `${jour} à ${heure}`;
}
/** « 14 avril 2026 » (Europe/Paris) — pour les dates sans heure (saisine CADA, prochaine étape). */
function dateSeule(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
}

/** Données de LECTURE d'une demande pour dériver son statut de cascade (toutes issues de la source unique `chargerDemandesSuivi`). */
export interface EntreeStatutCascade {
  statut: string;                 // 'envoyee' | 'close'
  envoyeLe: string | null;        // ISO — envoi initial (ancre d'échéance)
  statutAcheminement: string;     // 'envoye' | 'rebond' | 'echec' | 'en_attente'
  dossiersDus: number;            // dossiers actifs NON satisfaits
  dernierEnvoiRelance: { variante: string; envoyeLe: string } | null; // dernière relance RÉELLEMENT envoyée (acheminement)
  relancePreparee: { variante: string } | null;                        // brouillon vivant NON envoyé (préparé)
  saisineCadaEnvoyeeLe: string | null;                                 // saisine CADA (type='saisine_cada') envoyée
}

const LIBELLE_RELANCE: Record<string, string> = { rappel: 'Rappel', avis: 'Avis d’échéance', saisine: 'Saisine', formelle: 'Saisine' };

/**
 * Libellé de la colonne STATUT, par ORDRE de priorité (du plus avancé au moins avancé) :
 *   Saisine CADA envoyée → Saisine CADA à lancer → dernier envoi RÉEL de relance (rappel/avis/saisine annoncée) → brouillon
 *   PRÉPARÉ non envoyé → à défaut, le statut actuel (« Envoyée le … » / « Clôturée »). Le DERNIER ENVOI RÉEL fait foi : un
 *   brouillon préparé sans être parti n'affiche JAMAIS « envoyé ».
 */
export function statutCascade(e: EntreeStatutCascade, maintenant: Date, reglages: ReglagesCascade): string {
  if (e.saisineCadaEnvoyeeLe) return `Saisine CADA envoyée le ${dateSeule(e.saisineCadaEnvoyeeLe)}`;
  // Saisine CADA À LANCER : échéance + délai atteinte, saisine pas encore partie, et il reste des dossiers dus.
  if (e.dossiersDus > 0 && e.envoyeLe !== null && e.statutAcheminement === 'envoye') {
    const saisineLe = saisineLeDe(new Date(e.envoyeLe), reglages.saisineDelaiJours);
    if (maintenant.getTime() >= saisineLe.getTime()) return 'Saisine CADA à lancer';
  }
  if (e.dernierEnvoiRelance) {
    const d = dateHeure(e.dernierEnvoiRelance.envoyeLe);
    switch (e.dernierEnvoiRelance.variante) {
      case 'rappel': return `Rappel envoyé le ${d}`;
      case 'avis': return `Avis d’échéance envoyé le ${d}`;
      default: return `Saisine annoncée le ${d}`; // saisine | formelle (héritée)
    }
  }
  if (e.relancePreparee) {
    return `${LIBELLE_RELANCE[e.relancePreparee.variante] ?? 'Relance'} prêt, non envoyé`;
  }
  if (e.statut === 'close') return 'Clôturée';
  return e.envoyeLe !== null ? `Envoyée le ${dateHeure(e.envoyeLe)}` : 'Envoyée';
}

/**
 * PROCHAINE ÉTAPE de la cascade + sa date prévue (« Avis d'échéance prévu le 1 septembre 2026 »). Calculée par les jalons de la
 * fenêtre (lot 3). Si AUCUNE étape n'est prévue, le DIT explicitement (clôturée / non délivrée / tous dossiers obtenus / saisine
 * déjà partie / plus d'étape ultérieure) — jamais vide.
 */
export function prochaineEtape(e: EntreeStatutCascade, maintenant: Date, reglages: ReglagesCascade): string {
  if (e.statut === 'close') return 'Demande clôturée — aucune étape prévue.';
  if (e.statutAcheminement !== 'envoye' || e.envoyeLe === null) return 'Demande non délivrée — aucune étape prévue.';
  if (e.dossiersDus <= 0) return 'Tous les dossiers obtenus — cascade terminée.';
  if (e.saisineCadaEnvoyeeLe) return 'Saisine CADA envoyée — plus d’étape de relance.';
  const ech = echeanceDe(new Date(e.envoyeLe)).getTime();
  const jalons: { etape: string; t: number }[] = [
    { etape: 'Rappel', t: ech - reglages.rappelJoursAvant * MS_JOUR },
    { etape: 'Avis d’échéance', t: ech - reglages.avisJoursAvant * MS_JOUR },
    { etape: 'Saisine', t: ech },
    { etape: 'Saisine CADA', t: ech + reglages.saisineDelaiJours * MS_JOUR },
  ].sort((a, b) => a.t - b.t); // réglages incohérents → tri par date, jamais un ordre faux
  const prochain = jalons.find((j) => j.t > maintenant.getTime());
  if (!prochain) return 'Saisine CADA à lancer — aucune étape ultérieure.';
  return `${prochain.etape} prévu le ${dateSeule(new Date(prochain.t).toISOString())}`;
}

/** Étape cible du jour (réexport pratique pour le rendu : la Vue n'importe qu'un module). */
export { etapeCible };
