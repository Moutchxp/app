import 'server-only';

/**
 * M2 — LOT 4 (couche de LECTURE). Tranche temporelle LIBRE sur le grand livre (`analytics_compteur_jour`).
 *
 * ⚠️ Le grand livre est au grain JOUR : `jour_paris` est une DATE, le jour civil PARISIEN déjà gravé à
 * l'écriture (Lots 2/3). Le fuseau Europe/Paris est donc DÉJÀ intégré dans la donnée. Le fenêtrage est de
 * l'arithmétique de CALENDRIER pure (dates), sur laquelle un changement d'heure (DST) N'A AUCUN effet : une
 * date n'a pas d'heure. Les bornes EARS-T1/T2 (instants `timestamptz`, intervalle calendaire) visaient le
 * chemin d'événements bruts (voie B, non retenue) ; ici, on filtre `jour_paris` (colonne nue → indexable).
 * Grain minimal exposé = JOUR (décision Q1=A) : ni sous-jour ni seconde (ils n'existent pas au repos).
 */

export type Grain = 'jour' | 'semaine' | 'mois';
export const GRAINS: readonly Grain[] = ['jour', 'semaine', 'mois'];

export interface Fenetre {
  debut: string; // 'YYYY-MM-DD' (inclus)
  fin: string; //   'YYYY-MM-DD' (inclus)
  grain: Grain;
}

/** Amplitude maximale d'une fenêtre (garde-fou anti-requête absurde ; une plage de 2 ans reste indexable). */
export const AMPLITUDE_MAX_JOURS = 731;

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Vrai si `s` est une date calendaire RÉELLE au format 'YYYY-MM-DD' (rejette 2026-02-30, 2026-13-01…). */
function estDateReelle(s: string): boolean {
  if (!RE_DATE.test(s)) return false;
  const [a, m, j] = s.split('-').map(Number);
  if (m < 1 || m > 12 || j < 1 || j > 31) return false;
  // Reconstruit en UTC (aucune heure locale → pas de dérive DST) et compare : rejette les jours inexistants.
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/** Nombre de jours entre deux dates 'YYYY-MM-DD' (UTC, donc insensible au DST). */
function joursEntre(debut: string, fin: string): number {
  const [a1, m1, j1] = debut.split('-').map(Number);
  const [a2, m2, j2] = fin.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000);
}

export type ResultatFenetre = { ok: true; fenetre: Fenetre } | { ok: false; erreur: string };

/**
 * Valide et normalise une fenêtre. Refuse : dates mal formées/inexistantes, `debut > fin`, grain inconnu,
 * amplitude > AMPLITUDE_MAX_JOURS. Aucune notion d'heure → aucun risque DST.
 */
export function validerFenetre(debut: unknown, fin: unknown, grain: unknown): ResultatFenetre {
  if (typeof debut !== 'string' || !estDateReelle(debut)) return { ok: false, erreur: 'debut invalide (YYYY-MM-DD attendu)' };
  if (typeof fin !== 'string' || !estDateReelle(fin)) return { ok: false, erreur: 'fin invalide (YYYY-MM-DD attendu)' };
  if (typeof grain !== 'string' || !(GRAINS as readonly string[]).includes(grain)) {
    return { ok: false, erreur: `grain invalide (attendu : ${GRAINS.join(', ')})` };
  }
  const amplitude = joursEntre(debut, fin);
  if (amplitude < 0) return { ok: false, erreur: 'debut postérieur à fin' };
  if (amplitude > AMPLITUDE_MAX_JOURS) return { ok: false, erreur: `amplitude > ${AMPLITUDE_MAX_JOURS} jours` };
  return { ok: true, fenetre: { debut, fin, grain: grain as Grain } };
}

/**
 * Expression SQL du BUCKET (clé de regroupement) pour un grain, renvoyée en TEXTE 'YYYY-MM-DD' (pas d'objet
 * Date pg → aucune dérive de fuseau à la désérialisation). `semaine` = lundi ISO (`date_trunc('week')`,
 * ISO 8601, vérifié) ; `mois` = 1er du mois. Le grain vient d'une union fermée → aucune injection possible.
 */
export function expressionBucket(grain: Grain): string {
  switch (grain) {
    case 'jour':
      return `to_char(jour_paris, 'YYYY-MM-DD')`;
    case 'semaine':
      return `to_char(date_trunc('week', jour_paris), 'YYYY-MM-DD')`; // lundi ISO
    case 'mois':
      return `to_char(date_trunc('month', jour_paris), 'YYYY-MM-DD')`;
  }
}

/** Fragment WHERE (colonne NUE `jour_paris`, indexable) + params [debut, fin] pour la fenêtre (bornes incluses). */
export function filtreFenetre(fenetre: Fenetre): { clause: string; params: string[] } {
  return { clause: `jour_paris >= $1::date AND jour_paris <= $2::date`, params: [fenetre.debut, fenetre.fin] };
}
