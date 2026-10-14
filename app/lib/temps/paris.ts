/**
 * ══ 🔴🔴 L'HEURE DE PARIS, SOURCE UNIQUE — LOT PRÉPARATION-PORTABILITÉ (14/10/2026) ══════════════════════════════════
 *
 * POURQUOI CE MODULE. Le code supposait que la MACHINE est réglée sur Paris : `getHours()`, `getDay()`, `new Date(a, m, j)`,
 * `Intl` sans `timeZone` lisent le fuseau du PROCESSUS. Sur le Mac, c'est Europe/Paris ; sur un serveur Linux, c'est
 * souvent UTC. Mesuré (docs/RECON_PORTABILITE_SERVEUR.md §6) : sous TZ=UTC, la fenêtre d'envoi réglée 9 h–11 h s'ouvrait
 * à 11 h heure de Paris, et deux fichiers de test viraient au rouge.
 *
 * LA RÈGLE : tout calcul d'heure « humaine » (fenêtre d'envoi, jour ouvré, « aujourd'hui », plafond du jour ou du mois,
 * alerte quotidienne, numéro annuel, affichage d'une heure) passe par CE module, qui calcule explicitement en
 * Europe/Paris, quel que soit le fuseau de la machine. Le passage heure d'été / heure d'hiver est géré par `Intl`
 * (base de fuseaux de l'ICU), jamais par un décalage codé en dur.
 *
 * 🔒 PUR : aucune I/O, aucune horloge propre (l'instant est TOUJOURS passé en paramètre), aucun import. Utilisable côté
 * serveur ET côté client (garde de graphe : app/lib/garde/clientBoundary.guard.test.ts).
 */

/** 🔴 LE FUSEAU, ÉCRIT UNE FOIS. */
export const FUSEAU_PARIS = 'Europe/Paris';

/** Le même fuseau, prêt à coller dans une requête SQL (`AT TIME ZONE …`). */
export const FUSEAU_PARIS_SQL = `'${FUSEAU_PARIS}'`;

/** Ce que voit une horloge murale à Paris à un instant donné. `mois` va de 1 à 12 ; `jourSemaine` de 0 (dimanche) à 6. */
export interface PartiesParis {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
  seconde: number;
  jourSemaine: number;
}

// Un seul formateur, construit une fois : `Intl.DateTimeFormat` coûte cher à instancier, et ce module est appelé pour
//   CHAQUE date lue en base (cf. app/lib/db/typesDate.ts). `hourCycle: 'h23'` impose 00–23 (jamais « 24 » à minuit).
const FORMATEUR = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU_PARIS,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  weekday: 'short',
});
const JOURS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** L'horloge murale de Paris à l'instant `d`. PUR. */
export function partiesParis(d: Date): PartiesParis {
  const p: Record<string, string> = {};
  for (const x of FORMATEUR.formatToParts(d)) p[x.type] = x.value;
  return {
    annee: Number(p.year), mois: Number(p.month), jour: Number(p.day),
    heure: Number(p.hour), minute: Number(p.minute), seconde: Number(p.second),
    jourSemaine: JOURS[p.weekday],
  };
}

/** L'heure (0–23) à Paris. PUR. */
export function heureParis(d: Date): number {
  return partiesParis(d).heure;
}

/** Le jour de la semaine à Paris, 0 = dimanche … 6 = samedi (même convention que `Date#getDay`). PUR. */
export function jourSemaineParis(d: Date): number {
  return partiesParis(d).jourSemaine;
}

/** L'année civile à Paris (numérotations annuelles « AAAA »). PUR. */
export function anneeParis(d: Date): number {
  return partiesParis(d).annee;
}

const deux = (n: number): string => String(n).padStart(2, '0');

/** Le jour civil à Paris, « AAAA-MM-JJ ». PUR. */
export function jourParis(d: Date): string {
  const p = partiesParis(d);
  return `${p.annee}-${deux(p.mois)}-${deux(p.jour)}`;
}

/** Valeur « horloge murale » d'un instant, exprimée comme si elle était UTC — sert à comparer deux horloges. */
function murale(d: Date): number {
  const p = partiesParis(d);
  return Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
}

/** Décalage de Paris sur UTC à l'instant `d`, en millisecondes (+1 h en hiver, +2 h en été). PUR. */
export function decalageParisMs(d: Date): number {
  return murale(new Date(Math.floor(d.getTime() / 1000) * 1000)) - Math.floor(d.getTime() / 1000) * 1000;
}

const UN_JOUR_MS = 86_400_000;

/**
 * L'INSTANT où l'horloge murale de Paris affiche `annee-mois-jour heure:minute:seconde.ms`. `mois` va de 1 à 12. PUR.
 *
 * Les débordements sont normalisés comme `Date.UTC` (jour 32 → 1er du mois suivant, mois 13 → janvier suivant,
 * jour 0 → dernier jour du mois précédent) : c'est le remplaçant direct de `new Date(a, m, j, h)` en heure locale.
 *
 * Changement d'heure — comportement IDENTIQUE à celui de `new Date(a, m, j, h)` sur une machine réglée sur Paris :
 *   · heure INEXISTANTE (dernier dimanche de mars, 02:00–02:59) → avancée d'une heure (02:30 → 03:30 heure d'été) ;
 *   · heure AMBIGUË (dernier dimanche d'octobre, 02:00–02:59 vécue deux fois) → la PREMIÈRE (encore en heure d'été).
 */
export function instantParis(annee: number, mois: number, jour: number, heure = 0, minute = 0, seconde = 0, ms = 0): Date {
  const voulue = Date.UTC(annee, mois - 1, jour, heure, minute, seconde); // horloge murale visée, lue « comme UTC »
  // Les deux décalages possibles autour de cet instant : celui d'avant et celui d'après un éventuel changement d'heure.
  const avant = decalageParisMs(new Date(voulue - UN_JOUR_MS));
  const apres = decalageParisMs(new Date(voulue + UN_JOUR_MS));
  const candidats = [...new Set([avant, apres])].map((o) => voulue - o).sort((a, b) => a - b);
  const juste = candidats.find((t) => murale(new Date(t)) === voulue); // la plus ancienne qui affiche la bonne heure
  return new Date((juste ?? voulue - avant) + ms); // aucune : heure sautée au printemps → décalage d'AVANT (= +1 h)
}

/** Minuit (début du jour civil) à Paris pour le jour qui contient l'instant `d`. PUR. */
export function minuitParis(d: Date): Date {
  const p = partiesParis(d);
  return instantParis(p.annee, p.mois, p.jour);
}

/**
 * Le jour civil de Paris décalé de `n` jours, à `heure:minute` heure de Paris. Remplace `new Date(a, m, j + n, h, mi)`.
 * Un changement d'heure entre les deux jours ne décale PAS l'heure murale : « demain 9 h » reste 9 h. PUR.
 */
export function auJourParis(d: Date, n: number, heure = 0, minute = 0): Date {
  const p = partiesParis(d);
  return instantParis(p.annee, p.mois, p.jour + n, heure, minute);
}

/** Le 1er du mois de Paris décalé de `n` mois (0 = mois courant), à minuit heure de Paris. PUR. */
export function premierDuMoisParis(d: Date, n = 0): Date {
  const p = partiesParis(d);
  return instantParis(p.annee, p.mois + n, 1);
}

/**
 * Le jour civil de Paris de l'instant `d`, décalé de N années / mois / jours, au format « AAAA-MM-JJ ». Le débordement suit
 * la règle de `Date#setFullYear` / `setMonth` / `setDate` (29 février − 1 an → 1er mars ; 31 mars − 1 mois → 3 mars). PUR.
 */
export function jourParisDecale(d: Date, decalage: { annees?: number; mois?: number; jours?: number }): string {
  const p = partiesParis(d);
  const x = new Date(Date.UTC(p.annee + (decalage.annees ?? 0), p.mois - 1 + (decalage.mois ?? 0), p.jour + (decalage.jours ?? 0), 12));
  return x.toISOString().slice(0, 10);
}

/** Millisecondes jusqu'à la PROCHAINE occurrence de `heure`:00 heure de Paris (demain si elle est déjà passée). PUR. */
export function msJusquaProchaineHeureParis(maintenant: Date, heure: number): number {
  let cible = auJourParis(maintenant, 0, heure);
  if (cible.getTime() <= maintenant.getTime()) cible = auJourParis(maintenant, 1, heure);
  return cible.getTime() - maintenant.getTime();
}

/* ══ CÔTÉ SQL ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * `CURRENT_DATE`, `now()::date`, `date_trunc('day', now())`, `<timestamptz>::date` et `to_char(<timestamptz>, …)` suivent
 * le paramètre TimeZone de la SESSION PostgreSQL (Europe/Paris sur le Mac, souvent UTC sur un serveur). Ces fragments
 * rendent le fuseau EXPLICITE : même résultat quel que soit le réglage du serveur PG. */

/** Le jour civil de Paris aujourd'hui (type `date`). Remplace `CURRENT_DATE`. */
export const SQL_AUJOURDHUI_PARIS = `(now() AT TIME ZONE ${FUSEAU_PARIS_SQL})::date`;

/** Minuit de Paris aujourd'hui (type `timestamptz`). Remplace `date_trunc('day', now())`. */
export const SQL_MINUIT_PARIS = `(date_trunc('day', now() AT TIME ZONE ${FUSEAU_PARIS_SQL}) AT TIME ZONE ${FUSEAU_PARIS_SQL})`;

/** Le jour civil de Paris d'une expression `timestamptz` (type `date`). Remplace `<expr>::date`. */
export function sqlJourParis(expr: string): string {
  return `((${expr}) AT TIME ZONE ${FUSEAU_PARIS_SQL})::date`;
}

/** L'horloge murale de Paris d'une expression `timestamptz` (type `timestamp`), pour `to_char` / `date_trunc`. */
export function sqlMuraleParis(expr: string): string {
  return `((${expr}) AT TIME ZONE ${FUSEAU_PARIS_SQL})`;
}

/** Minuit de Paris d'une expression `date` (type `timestamptz`). Pour comparer un `timestamptz` à un jour civil. */
export function sqlMinuitParisDe(exprDate: string): string {
  return `((${exprDate})::timestamp AT TIME ZONE ${FUSEAU_PARIS_SQL})`;
}

/**
 * Formats d'affichage en heure de Paris — une seule fabrique pour qu'aucun écran ne recrée un `Intl` sans `timeZone`.
 * `options` reçoit les mêmes clés que `Intl.DateTimeFormat` ; le fuseau est imposé et ne peut pas être écrasé.
 */
export function formatParis(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: FUSEAU_PARIS });
}
