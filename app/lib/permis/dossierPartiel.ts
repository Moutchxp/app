/**
 * CASC-1 — logique PURE du marqueur « dossier partiel » (la mairie a répondu PARTIELLEMENT ; Arno a réclamé les pièces manquantes).
 * Aucune I/O. La DONNÉE (date, familles, origine) est portée par la demande ; ici, seules les DÉCISIONS pures.
 */
export type OriginePartiel = 'outil' | 'declaree'; // réclamation ENVOYÉE par l'outil (PART-3a/3c) ou DÉCLARÉE hors outil (PART-3e)

/** Instantané du marqueur ACTIF, pour l'affichage (raison + date, jamais un silence). */
export interface EtatPartiel { le: string; familles: string[]; origine: OriginePartiel }

/**
 * PART-B — DATE au format JJ/MM/AAAA en heure locale (Europe/Paris), convention d'affichage du projet (comme `statutCascade`).
 * Accepte un ISO string (timestamptz sérialisé) ou un Date. Europe/Paris (et non UTC) : un marqueur posé à 00:30 à Paris
 * (22:30 UTC la veille) doit afficher le JOUR parisien, pas la date UTC de la veille.
 */
function jourFrParis(d: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(d));
}

/**
 * Faut-il LEVER automatiquement le marqueur ? OUI seulement si le diagnostic de complétude est « complet » pour TOUS les permis
 * (dossiers actifs) de la demande. Un dossier jamais analysé (`null`) ou incomplet l'empêche. Une demande sans dossier → NON (rien à
 * conclure). C'est le SEUL critère de levée automatique ; la levée manuelle (Arno) est un geste distinct.
 */
export function doitLeverAuto(completudesParDossier: readonly (boolean | null)[]): boolean {
  return completudesParDossier.length > 0 && completudesParDossier.every((complet) => complet === true);
}

/**
 * CASC-2 — DATE BUTOIR prolongée avant saisine CADA sur un dossier partiel. PURE, aucune I/O.
 *
 * ⚠️ DÉPART = la PREMIÈRE réclamation (`partiel_le`), JAMAIS la dernière : sinon chaque relance repousserait l'échéance à l'infini et
 * la saisine ne partirait jamais. Délai = `delaiMois` MOIS CALENDAIRES (débordement de fin de mois borné, MÊME règle que `echeanceDe`)
 * puis `delaiJours` JOURS. Défaut métier = 1 mois + 4 jours. Calcul en UTC (déterministe, indépendant du fuseau).
 */
export function dateButoirPartiel(premiereReclamation: Date, delaiMois: number, delaiJours: number): Date {
  const y = premiereReclamation.getUTCFullYear();
  const moisCible = premiereReclamation.getUTCMonth() + delaiMois;   // Date.UTC normalise le débordement d'année
  const jour = premiereReclamation.getUTCDate();
  const dernierJourCible = new Date(Date.UTC(y, moisCible + 1, 0)).getUTCDate(); // jour 0 du mois suivant = dernier jour du mois cible
  const jourCible = Math.min(jour, dernierJourCible);               // 31 janv. + 1 mois → 28/29 févr. (borne)
  const apresMois = Date.UTC(y, moisCible, jourCible,
    premiereReclamation.getUTCHours(), premiereReclamation.getUTCMinutes(), premiereReclamation.getUTCSeconds(), premiereReclamation.getUTCMilliseconds());
  return new Date(apresMois + delaiJours * 24 * 3600 * 1000);
}

/** CASC-2 — mention « délai prolongé au JJ/MM/AAAA » (EN PLUS de la suspension, jamais à sa place). Information portée par le texte. */
export function libelleDelaiProlonge(butoir: Date): string {
  return `Délai avant saisine CADA prolongé au ${jourFrParis(butoir)} (dossier partiel).`; // PART-B : JJ/MM/AAAA Europe/Paris (formateur unique)
}

/** Phrase de suspension affichée à l'écran (raison + date + origine) — jamais un silence inexpliqué. */
export function libelleSuspension(etat: EtatPartiel): string {
  const origine = etat.origine === 'outil' ? 'réclamation envoyée' : 'relance déclarée';
  const familles = etat.familles.length > 0 ? ` (pièces : ${etat.familles.join(', ')})` : '';
  // PART-B — date en JJ/MM/AAAA Europe/Paris (comme le reste de l'interface), plus l'ISO d'avant.
  return `Relance ordinaire suspendue depuis le ${jourFrParis(etat.le)} — ${origine}${familles}. La réclamation ciblée reste possible ; le cycle ordinaire reprendra quand le dossier sera complet.`;
}
