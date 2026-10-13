/**
 * ══ 🔴🔴 LOT TACHES-1 — LES TÂCHES RATTACHÉES À UN BIEN : LA RÈGLE UNIQUE ═══════════════════════════════════════════
 *
 * DÉCISIONS D'ARNO (13/10/2026) :
 *   · une tâche est rattachée à UN bien, datée ; AVEC heure = rendez-vous, SANS heure = repère sur la journée ;
 *   · confiée par défaut au collaborateur connecté, ou à un collègue ayant l'accès Gestion ;
 *   · rappels par défaut : rendez-vous = la veille + 1 h avant ; repère = le jour même à 9 h. Modifiables ;
 *   · jamais de suppression : faite, décalée, annulée restent tracées (« décalée par X le … (ancienne → nouvelle) »).
 *
 * 🔴 LE CODE COULEUR EST ÉCRIT ICI, ET NULLE PART AILLEURS. Tous les écrans (fiche du bien, récapitulatif général,
 * et tout futur endroit) appellent `couleurTache` : deux calculs finiraient par ne plus dire la même chose. Il se
 * calcule sur le JOUR de la tâche comparé à AUJOURD'HUI À PARIS, pour les tâches ni faites ni annulées :
 *   · date passée               → ROUGE  (« En retard »)
 *   · aujourd'hui               → BLANC  (« Aujourd'hui »)
 *   · demain et après-demain    → ORANGE (« Dans 2 jours »)
 *   · dans 3 jours et plus      → VERT   (« Plus tard »)
 * ⚠️ C'EST LE JOUR QUI COMPTE, PAS L'HEURE : un rendez-vous de 9 h vu à 15 h le même jour reste « du jour » —
 * c'est la règle d'Arno (« EN RETARD (date passée) »), et c'est ce qui se lit sans calcul.
 *
 * PUR : aucune base, aucun réseau, aucun écran. Chargeable dans le navigateur.
 */
import { FUSEAU_AFFICHAGE } from './ecran';
import { lireClesContacts } from './contactsTache';

export type EtatTache = 'a_faire' | 'faite' | 'annulee';
export type CouleurTache = 'retard' | 'jour' | 'proche' | 'plus_tard';

/** L'ordre d'affichage d'Arno : rouge, blanc, orange, vert. */
export const ORDRE_COULEURS: readonly CouleurTache[] = ['retard', 'jour', 'proche', 'plus_tard'];

/** Le mot de chaque couleur : la couleur ne parle jamais seule (daltonisme, impression en noir). */
export const MOT_COULEUR: Record<CouleurTache, string> = {
  retard: 'En retard', jour: 'Aujourd’hui', proche: 'Dans 2 jours', plus_tard: 'Plus tard',
};
/** Le mot des compteurs, en tête du récapitulatif. */
export const MOT_COMPTEUR: Record<CouleurTache, string> = {
  retard: 'en retard', jour: 'du jour', proche: '2 jours', plus_tard: 'plus tard',
};

/** Les rappels, sous une forme neutre qui ne dépend pas de Google (le lot 2 les traduira). */
export type Rappel =
  /** Rendez-vous : N minutes avant l'heure (1440 = la veille à la même heure). */
  | { sorte: 'avant'; minutes: number }
  /** Repère : le jour même, à l'heure dite. */
  | { sorte: 'jour'; heure: string }
  /** Repère : la veille, à l'heure dite. */
  | { sorte: 'veille'; heure: string };

/** Une tâche telle que les écrans la lisent. */
export interface Tache {
  id: number;
  lotId: number;
  /** Le numéro WIPPIMMO du bien — sert à relire la fiche, jamais affiché dans l'agenda (décision d'Arno). */
  lotCle: string;
  /** « 12 rue des Lilas, Paris » — ce qui se montre sur la ligne. */
  adresseBien: string;
  evenement: { id: number; reference: string; objet: string } | null;
  objet: string;
  note: string | null;
  /** AAAA-MM-JJ, jour civil à Paris. */
  jour: string;
  /** HH:MM, ou `null` pour un repère sur la journée. */
  heure: string | null;
  rappels: Rappel[];
  etat: EtatTache;
  confieeA: number | null;
  confieeALibelle: string;
  creeLe: string;
  creeParLibelle: string;
  majLe: string;
  faiteLe: string | null;
  faiteParLibelle: string | null;
  annuleeLe: string | null;
  annuleeParLibelle: string | null;
  /** 🔴 LOT TACHES-1-BIS — combien de contacts sont copiés dans la tâche (l'indicateur « 👤 2 contacts »). */
  nbContacts: number;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE JOUR, À PARIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le jour civil à Paris, AAAA-MM-JJ. `en-CA` rend déjà ce format. PUR. */
export function jourParisDe(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_AFFICHAGE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const RE_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Un jour AAAA-MM-JJ qui existe vraiment (pas de 31 février). PUR. */
export function estJourValide(j: string): boolean {
  const m = RE_JOUR.exec(j);
  if (m === null) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function estHeureValide(h: string): boolean {
  return RE_HEURE.test(h);
}

/**
 * L'écart en JOURS CIVILS entre deux jours AAAA-MM-JJ. Calculé à midi UTC sur les seules dates : aucun fuseau,
 * aucun changement d'heure ne peut le faire glisser d'une unité. PUR.
 */
export function ecartJours(de: string, a: string): number {
  const t = (j: string) => { const [y, m, d] = j.split('-').map(Number); return Date.UTC(y, m - 1, d, 12); };
  return Math.round((t(a) - t(de)) / 86_400_000);
}

/** Ajoute N jours à un jour AAAA-MM-JJ. PUR. */
export function ajouterJours(j: string, n: number): string {
  const [y, m, d] = j.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n, 12));
  return x.toISOString().slice(0, 10);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA COULEUR, L'ORDRE, LES COMPTEURS — la règle unique
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LA COULEUR D'UNE TÂCHE. `null` pour une tâche faite ou annulée : elle n'est plus « à faire », elle se grise.
 * Voir l'encadré du module. PUR.
 */
export function couleurTache(t: { jour: string; etat: EtatTache }, maintenant: Date): CouleurTache | null {
  if (t.etat !== 'a_faire') return null;
  const ecart = ecartJours(jourParisDe(maintenant), t.jour);
  if (ecart < 0) return 'retard';
  if (ecart === 0) return 'jour';
  if (ecart <= 2) return 'proche';
  return 'plus_tard';
}

/**
 * L'ORDRE D'AFFICHAGE : rouge, blanc, orange, vert ; puis par date et heure (le repère de la journée avant les
 * rendez-vous du même jour) ; puis par numéro, pour qu'un même écran ne change jamais d'ordre tout seul. PUR.
 */
export function comparerTaches(a: Tache, b: Tache, maintenant: Date): number {
  const rang = (t: Tache) => {
    const c = couleurTache(t, maintenant);
    return c === null ? ORDRE_COULEURS.length : ORDRE_COULEURS.indexOf(c);
  };
  return (rang(a) - rang(b))
    || a.jour.localeCompare(b.jour)
    || (a.heure ?? '').localeCompare(b.heure ?? '')
    || a.id - b.id;
}

/** Les tâches À FAIRE dans l'ordre d'Arno, et les TERMINÉES (faites ou annulées) à part, la plus récente d'abord. PUR. */
export function repartirTaches(taches: readonly Tache[], maintenant: Date): { ouvertes: Tache[]; terminees: Tache[] } {
  const ouvertes = taches.filter((t) => t.etat === 'a_faire').sort((a, b) => comparerTaches(a, b, maintenant));
  const fin = (t: Tache) => t.faiteLe ?? t.annuleeLe ?? t.majLe;
  const terminees = taches.filter((t) => t.etat !== 'a_faire').sort((a, b) => fin(b).localeCompare(fin(a)) || b.id - a.id);
  return { ouvertes, terminees };
}

/** Les quatre compteurs du récapitulatif. PUR. */
export function compterTaches(taches: readonly Tache[], maintenant: Date): Record<CouleurTache, number> {
  const n: Record<CouleurTache, number> = { retard: 0, jour: 0, proche: 0, plus_tard: 0 };
  for (const t of taches) {
    const c = couleurTache(t, maintenant);
    if (c !== null) n[c] += 1;
  }
  return n;
}

export type FiltreTaches = 'toutes' | 'miennes';

/** « Les miennes » = celles qui me sont CONFIÉES. Sans compte (voie de secours), aucune n'est à moi. PUR. */
export function filtrerTaches(taches: readonly Tache[], filtre: FiltreTaches, moi: number | null): Tache[] {
  if (filtre === 'toutes') return [...taches];
  if (moi === null) return [];
  return taches.filter((t) => t.confieeA !== null && Number(t.confieeA) === Number(moi));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ DÉCALER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type RaccourciDecalage = '+1j' | '+2j' | '+1s';
export const RACCOURCIS_DECALAGE: readonly { cle: RaccourciDecalage; mot: string; jours: number }[] = [
  { cle: '+1j', mot: '+1 jour', jours: 1 },
  { cle: '+2j', mot: '+2 jours', jours: 2 },
  { cle: '+1s', mot: '+1 semaine', jours: 7 },
];

/**
 * LE NOUVEAU JOUR d'un raccourci. L'heure ne bouge pas.
 *
 * ⚠️ UNE TÂCHE EN RETARD SE DÉCALE À PARTIR D'AUJOURD'HUI : « +1 jour » sur une tâche d'il y a une semaine la
 * mettrait à il y a six jours — toujours en retard, toujours rouge, et le geste n'aurait servi à rien. On part
 * donc du plus tardif des deux : le jour de la tâche, ou aujourd'hui. PUR.
 */
export function jourDecale(jour: string, raccourci: RaccourciDecalage, maintenant: Date): string {
  const r = RACCOURCIS_DECALAGE.find((x) => x.cle === raccourci);
  if (!r) throw new Error(`Raccourci inconnu : ${raccourci}`);
  const aujourdhui = jourParisDe(maintenant);
  const depart = jour < aujourdhui ? aujourdhui : jour;
  return ajouterJours(depart, r.jours);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES RAPPELS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les rappels par défaut d'Arno : rendez-vous = la veille + 1 h avant ; repère = le jour même à 9 h. PUR. */
export function rappelsParDefaut(avecHeure: boolean): Rappel[] {
  return avecHeure
    ? [{ sorte: 'avant', minutes: 1440 }, { sorte: 'avant', minutes: 60 }]
    : [{ sorte: 'jour', heure: '09:00' }];
}

/** Les choix proposés à l'écran, selon la nature de la tâche. */
export function rappelsProposes(avecHeure: boolean): Rappel[] {
  return avecHeure
    ? [{ sorte: 'avant', minutes: 1440 }, { sorte: 'avant', minutes: 120 }, { sorte: 'avant', minutes: 60 },
      { sorte: 'avant', minutes: 30 }, { sorte: 'avant', minutes: 15 }]
    : [{ sorte: 'veille', heure: '17:00' }, { sorte: 'jour', heure: '09:00' }, { sorte: 'jour', heure: '08:00' }];
}

export function cleRappel(r: Rappel): string {
  return r.sorte === 'avant' ? `avant:${r.minutes}` : `${r.sorte}:${r.heure}`;
}

/** « La veille », « 1 h avant », « Le jour même à 9 h ». PUR. */
export function motRappel(r: Rappel): string {
  if (r.sorte === 'avant') {
    if (r.minutes === 1440) return 'La veille (même heure)';
    if (r.minutes % 60 === 0) return `${r.minutes / 60} h avant`;
    return `${r.minutes} min avant`;
  }
  const h = heureLisible(r.heure);
  return r.sorte === 'jour' ? `Le jour même à ${h}` : `La veille à ${h}`;
}

function heureLisible(h: string): string {
  const [hh, mm] = h.split(':');
  return mm === '00' ? `${Number(hh)} h` : `${Number(hh)} h ${mm}`;
}

/**
 * LES RAPPELS NETTOYÉS : forme vérifiée, sans doublon, et compatibles avec la nature de la tâche — un « 1 h avant »
 * n'a pas de sens sur un repère sans heure. Sert à la route (ce qui vient du navigateur) et au changement de nature
 * de la tâche. PUR.
 */
export function rappelsValides(brut: unknown, avecHeure: boolean): Rappel[] {
  if (!Array.isArray(brut)) return [];
  const vus = new Set<string>();
  const out: Rappel[] = [];
  for (const x of brut as { sorte?: unknown; minutes?: unknown; heure?: unknown }[]) {
    let r: Rappel | null = null;
    if (x?.sorte === 'avant' && avecHeure) {
      const m = Number(x.minutes);
      if (Number.isInteger(m) && m > 0 && m <= 40_320) r = { sorte: 'avant', minutes: m };
    } else if ((x?.sorte === 'jour' || x?.sorte === 'veille') && !avecHeure && typeof x.heure === 'string' && estHeureValide(x.heure)) {
      r = { sorte: x.sorte, heure: x.heure };
    }
    if (r !== null && !vus.has(cleRappel(r))) { vus.add(cleRappel(r)); out.push(r); }
  }
  return out.slice(0, 5);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA SAISIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const OBJET_MAX = 300;
export const NOTE_MAX = 5000;

export interface SaisieTache {
  objet: string;
  jour: string;
  heure: string | null;
  note: string | null;
  confieeA: number | null;
  evenementId: number | null;
  rappels: Rappel[];
  /** 🔴 LOT TACHES-1-BIS — les clés des contacts cochés ; `undefined` ⇒ ne pas toucher aux contacts. */
  contacts?: string[];
}

/**
 * LA SAISIE LUE D'UN CORPS DE REQUÊTE. Ne fait pas confiance aux types venus du navigateur : tout est relu, et les
 * rappels sont nettoyés selon la nature de la tâche. La vérification du fond reste à `erreurSaisie`. PUR.
 */
export function lireSaisie(corps: Record<string, unknown>): SaisieTache {
  const heureBrute = typeof corps.heure === 'string' ? corps.heure.trim() : '';
  const heure = heureBrute === '' ? null : heureBrute;
  const ent = (x: unknown): number | null => {
    const n = Number(x);
    return x === null || x === undefined || x === '' || !Number.isInteger(n) || n <= 0 ? null : n;
  };
  return {
    objet: typeof corps.objet === 'string' ? corps.objet : '',
    jour: typeof corps.jour === 'string' ? corps.jour.trim() : '',
    heure,
    note: typeof corps.note === 'string' ? corps.note : null,
    confieeA: ent(corps.confieeA),
    evenementId: ent(corps.evenementId),
    rappels: rappelsValides(corps.rappels, heure !== null),
    contacts: lireClesContacts(corps.contacts),
  };
}

/** Ce qui ne va pas dans une saisie, en français ; `null` si tout est bon. PUR. */
export function erreurSaisie(s: Pick<SaisieTache, 'objet' | 'jour' | 'heure' | 'note' | 'confieeA'>): string | null {
  const objet = (s.objet ?? '').trim();
  if (objet === '') return 'Indiquez l’objet de la tâche.';
  if (objet.length > OBJET_MAX) return `L’objet dépasse ${OBJET_MAX} caractères.`;
  if (!estJourValide(s.jour ?? '')) return 'Indiquez une date valide.';
  if (s.heure !== null && !estHeureValide(s.heure)) return 'L’heure doit s’écrire HH:MM.';
  if ((s.note ?? '').length > NOTE_MAX) return `La note dépasse ${NOTE_MAX} caractères.`;
  if (s.confieeA === null || !Number.isInteger(Number(s.confieeA)) || Number(s.confieeA) <= 0) {
    return 'Choisissez la personne à qui la tâche est confiée.';
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ CE QUI S'AFFICHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** « mar. 14/10/2026 », « mar. 14/10/2026 à 10:00 ». PUR. */
export function dateLisibleTache(jour: string, heure: string | null): string {
  const m = RE_JOUR.exec(jour);
  if (m === null) return jour;
  const jds = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay();
  const base = `${JOURS_COURTS[jds]} ${m[3]}/${m[2]}/${m[1]}`;
  return heure === null ? base : `${base} à ${heure}`;
}

/** Un instant, lu à Paris : « 13/10/2026 à 19:20 ». PUR. */
export function horodatageLisible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_AFFICHAGE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')} à ${v('hour')}:${v('minute')}`;
}

export type ActionTache = 'creation' | 'modification' | 'faite' | 'decalage' | 'annulation' | 'reouverture';

/** Une ligne de la trace, telle que la base la rend. */
export interface TraceTache {
  action: ActionTache;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  survenuLe: string;
  auteurLibelle: string;
}

const MOTS_CHAMPS: Record<string, string> = {
  objet: 'objet', jour: 'date', heure: 'heure', note: 'note', confieeA: 'personne', evenementId: 'événement',
  rappels: 'rappels',
};

/**
 * LA PHRASE D'UNE TRACE, comme Arno l'a écrite : « Faite par X le … », « Décalée par X le … (ancienne date →
 * nouvelle date) », « Annulée par X le … ». PUR.
 */
export function phraseTrace(t: TraceTache): string {
  const qui = `par ${t.auteurLibelle} le ${horodatageLisible(t.survenuLe)}`;
  const date = (x: Record<string, unknown> | null) => dateLisibleTache(String(x?.jour ?? ''), (x?.heure as string | null) ?? null);
  switch (t.action) {
    case 'creation': return `Créée ${qui}`;
    case 'faite': return `Faite ${qui}`;
    case 'annulation': return `Annulée ${qui}`;
    case 'reouverture': return `Rouverte ${qui}`;
    case 'decalage': return `Décalée ${qui} (${date(t.avant)} → ${date(t.apres)})`;
    case 'modification': {
      /* 🔴 LOT TACHES-1-BIS — un contact ajouté, retiré ou remis à jour a sa propre ligne, et sa propre phrase. */
      const a = t.apres ?? {};
      if (typeof a.contactAjoute === 'string') return `Contact ajouté ${qui} (${a.contactAjoute})`;
      if (typeof a.contactRetire === 'string') return `Contact retiré ${qui} (${a.contactRetire})`;
      if (typeof a.contactMisAJour === 'string') return `Coordonnées mises à jour ${qui} (${a.contactMisAJour})`;
      const champs = Object.keys(t.apres ?? {}).map((k) => MOTS_CHAMPS[k] ?? k);
      return `Modifiée ${qui}${champs.length > 0 ? ` (${champs.join(', ')})` : ''}`;
    }
  }
}
