/**
 * RELANCE — ENVOI EN JOUR ET HEURE OUVRÉS (PUR, aucune I/O, aucune horloge : on passe l'instant). Les relances automatiques ne
 * partent qu'en heures ouvrées, du lundi au vendredi. Si le jour d'envoi tombe un week-end, on décale — et le SENS dépend de la
 * variante :
 *  - 'rappel'/'avis' (annoncent une échéance À VENIR) → AVANCER au vendredi (les envoyer plus tôt reste exact) ;
 *  - 'saisine' (constate le refus tacite CE JOUR) → RECULER au lundi (l'avancer rendrait la lettre fausse).
 *
 * ⚠️ Jours fériés HORS PÉRIMÈTRE — choix explicite et assumé d'Arno : ils ne sont PAS traités (un férié ouvré part quand même).
 * Heure de PARIS, quel que soit le fuseau de la machine (lot PRÉPARATION-PORTABILITÉ, 14/10/2026) : jour de la semaine et heure
 * sont lus par app/lib/temps/paris.ts. Avant, `getDay()`/`getHours()` lisaient le fuseau du PROCESSUS — sous TZ=UTC, la fenêtre
 * 9 h–11 h s'ouvrait à 11 h heure de Paris (mesuré : envoiInitialAuto.test.ts rouge sous TZ=UTC).
 */
import { echeanceDe } from './echeance';
import type { ReglagesCascade } from './cascadeRelance';
import type { VarianteRelance } from './relance';
import { auJourParis, heureParis, jourSemaineParis } from '../temps/paris';

/** Filtre horaire passé aux fonctions d'envoi par l'envoi AUTOMATIQUE (absent = envoi MANUEL, jamais bridé). */
export interface FiltreHoraire {
  coherente: boolean;   // false = bornes incohérentes (début ≥ fin) → rien ne part, on le signale
  ouverte: boolean;     // true = jour ouvré ET dans la fenêtre horaire → on envoie
  heureDebut: number;
  heureFin: number;
  maintenant: Date;
}

/**
 * DÉCISION d'envoi à partir du filtre (PUR). `filtre` ABSENT = envoi MANUEL → on envoie TOUJOURS (jamais bridé). Présent (auto) :
 * config incohérente → on n'envoie rien (motif) ; fenêtre fermée (jour/heure) → on n'envoie rien (motif) ; fenêtre ouverte → on envoie.
 */
export function etatFiltreHoraire(filtre: FiltreHoraire | undefined): { envoie: boolean; incoherente: boolean } {
  if (filtre === undefined) return { envoie: true, incoherente: false };   // manuel
  if (!filtre.coherente) return { envoie: false, incoherente: true };       // début ≥ fin → rien, sans planter
  return { envoie: filtre.ouverte, incoherente: false };                    // jour/heure ouvrés ?
}

/** Lundi (1) … vendredi (5). Samedi (6) et dimanche (0) sont non ouvrés. */
export function estJourOuvre(d: Date): boolean {
  const j = jourSemaineParis(d);
  return j >= 1 && j <= 5;
}

/** Reconstruit une date au jour calendaire de Paris (jour + deltaJours) à `heure`:00 heure de Paris — débordement de mois et changement d'heure gérés. */
function auJour(ref: Date, deltaJours: number, heure: number): Date {
  return auJourParis(ref, deltaJours, heure);
}

/**
 * MOMENT D'ENVOI d'une relance de variante donnée, calculé à partir d'un jour de référence, à `heureDebut`. Jour ouvré → ce
 * jour même. Week-end → décalage selon la variante (rappel/avis → vendredi d'avant ; saisine → lundi d'après). PUR, testé au jour.
 */
export function momentEnvoiRelance(variante: VarianteRelance, jour: Date, heureDebut: number): Date {
  const j = jourSemaineParis(jour); // 0=dimanche, 6=samedi
  if (j >= 1 && j <= 5) return auJour(jour, 0, heureDebut); // jour ouvré : ce jour même
  const recule = variante === 'saisine'; // saisine → lundi (recule) ; rappel/avis → vendredi (avance)
  if (j === 6) return auJour(jour, recule ? 2 : -1, heureDebut); // samedi → lundi (+2) ou vendredi (−1)
  return auJour(jour, recule ? 1 : -2, heureDebut);              // dimanche → lundi (+1) ou vendredi (−2)
}

/**
 * FENÊTRE d'envoi ouverte à l'instant `maintenant` ? `coherente=false` si les bornes sont incohérentes (début ≥ fin, ou hors
 * 0-23) → dans ce cas on N'ENVOIE RIEN (et on ne plante pas). `ouverte` = jour ouvré ET `heureDebut ≤ heure < heureFin`.
 */
export function fenetreEnvoiOuverte(maintenant: Date, heureDebut: number, heureFin: number): { coherente: boolean; ouverte: boolean } {
  const coherente = Number.isInteger(heureDebut) && Number.isInteger(heureFin)
    && heureDebut >= 0 && heureFin <= 23 && heureDebut < heureFin;
  if (!coherente) return { coherente: false, ouverte: false };
  const h = heureParis(maintenant);
  return { coherente: true, ouverte: estJourOuvre(maintenant) && h >= heureDebut && h < heureFin };
}

/** Jour CALENDAIRE où l'étape devient due (rappel = échéance − rappelJours ; avis = échéance − avisJours ; saisine = échéance). */
export function jourEcheanceEtape(variante: VarianteRelance, envoyeLe: Date, reglages: ReglagesCascade): Date {
  const ech = echeanceDe(envoyeLe);
  if (variante === 'rappel') return auJour(ech, -reglages.rappelJoursAvant, 0);
  if (variante === 'avis') return auJour(ech, -reglages.avisJoursAvant, 0);
  return ech; // saisine = échéance
}

/** Prochain créneau d'envoi ouvré ≥ maintenant, à `heureDebut` : aujourd'hui si jour ouvré avant la fenêtre, sinon le prochain jour ouvré. */
export function prochainCreneauEnvoi(maintenant: Date, heureDebut: number): Date {
  if (estJourOuvre(maintenant) && heureParis(maintenant) < heureDebut) return auJour(maintenant, 0, heureDebut);
  let d = auJour(maintenant, 1, heureDebut);
  while (!estJourOuvre(d)) d = auJour(d, 1, heureDebut);
  return d;
}

/**
 * Moment d'envoi PRÉVU d'une relance (pour le compte rendu) : le moment idéal calculé depuis le jour d'échéance de son étape,
 * décalé selon la variante ; mais s'il est déjà passé (idéal antérieur au tic, cas d'un jour d'échéance tombé en week-end où
 * l'avance au vendredi n'est plus atteignable), on renvoie le prochain créneau ouvré — jamais une date passée.
 */
export function momentPrevuRelance(variante: VarianteRelance, envoyeLe: Date, reglages: ReglagesCascade, heureDebut: number, maintenant: Date): Date {
  const ideal = momentEnvoiRelance(variante, jourEcheanceEtape(variante, envoyeLe, reglages), heureDebut);
  return ideal.getTime() > maintenant.getTime() ? ideal : prochainCreneauEnvoi(maintenant, heureDebut);
}
