/**
 * ══ 🔴🔴 LES MINUTES D'UN RENDEZ-VOUS DU PRÉAVIS (Arno, 18/11/2026) — MODULE PUR ═══════════════════════════════════════════════════════════════
 * Arno : « MINUTES LIMITÉES À 00, 15, 30 ET 45 pour TOUS les rendez-vous qu'on fixe ou qu'on déplace : pré-visite, état des lieux de sortie […].
 * Le serveur refuse aussi toute autre minute. La liste des minutes autorisées est un réglage en configuration, avec 00/15/30/45 par défaut. Les
 * rendez-vous existants qui ont d'autres minutes (ex. 09h53) s'affichent tels quels, sans arrondi silencieux. »
 * Le réglage : `gestion_config.minutes_rdv` (migration 498) ; sans elle, ou illisible : le défaut ci-dessous. Lisible par l'écran comme par le serveur.
 */

/** Le défaut (et le repli sans la 498) : 00, 15, 30, 45. */
export const MINUTES_RDV_DEFAUT: readonly number[] = [0, 15, 30, 45];

/** Une liste de minutes lue (base, réponse du serveur) : entiers 0 à 59, sans doublon, triés ; vide ou illisible → le défaut. PUR. */
export function lireMinutesRdv(x: unknown): number[] {
  const l = Array.isArray(x) ? x.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 59) : [];
  const u = [...new Set(l)].sort((a, b) => a - b);
  return u.length > 0 ? u : [...MINUTES_RDV_DEFAUT];
}

/** « 09:53 » → 53 ; autre forme → null. PUR. */
export function minuteDe(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim().slice(0, 5));
  return m === null ? null : Number(m[2]);
}

/** « 05 », « 30 » : deux chiffres. PUR. */
export const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** Le refus du SERVEUR si l'heure de début ou de fin n'a pas une minute autorisée (« Les minutes autorisées : 00, 15, 30 ou 45. »), sinon null. PUR. */
export function refusMinutesRdv(heures: { debut: string; fin: string }, minutes: readonly number[]): string | null {
  for (const [nom, h] of [['début', heures.debut], ['fin', heures.fin]] as const) {
    if (h.trim() === '') continue; // un champ vide : la règle existante (champ obligatoire) le dit
    const m = minuteDe(h);
    if (m !== null && !minutes.includes(m)) return `L’heure de ${nom} doit tomber sur ${listeMinutesFr(minutes)} minutes.`;
  }
  return null;
}

/** « 00, 15, 30 ou 45 ». PUR. */
export function listeMinutesFr(minutes: readonly number[]): string {
  const l = minutes.map(deuxChiffres);
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}`;
}

// ══ 🔴🔴 LA PLAGE HORAIRE DES RENDEZ-VOUS DU PRÉAVIS (Arno, 19/11/2026) ══════════════════════════════════════════════════════════════════════
// « HEURE DE DÉBUT : de 8h00 à 20h00 […] HEURE DE FIN : de 8h15 à 21h00 au plus tard […] Le serveur refuse lui aussi toute heure hors plage. »
// Les trois bornes sont des réglages (`gestion_config`, migration 499) ; sans eux, ou incohérents : le défaut ci-dessous.

/** Les bornes (« HH:MM ») : début au plus tôt, début au plus tard, fin au plus tard. La fin vient toujours APRÈS le début au plus tôt. */
export interface PlageRdv { debutMin: string; debutMax: string; finMax: string }
export const PLAGE_RDV_DEFAUT: PlageRdv = { debutMin: '08:00', debutMax: '20:00', finMax: '21:00' };

const enMinutes = (hhmm: string): number | null => {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm.trim());
  if (m === null) return null;
  const h = Number(m[1]); const n = Number(m[2]);
  return h > 23 || n > 59 ? null : h * 60 + n;
};

/** Une plage lue (base, réponse du serveur) : trois heures « HH:MM » dans l'ordre début au plus tôt < début au plus tard ≤ fin au plus tard ;
 *  sinon le défaut (jamais une plage à moitié lue). PUR. */
export function lirePlageRdv(x: unknown): PlageRdv {
  const o = (x ?? {}) as Partial<Record<keyof PlageRdv, unknown>>;
  const v = (k: keyof PlageRdv) => (typeof o[k] === 'string' ? (o[k] as string).slice(0, 5) : '');
  const p = { debutMin: v('debutMin'), debutMax: v('debutMax'), finMax: v('finMax') };
  const [a, b, c] = [enMinutes(p.debutMin), enMinutes(p.debutMax), enMinutes(p.finMax)];
  return a !== null && b !== null && c !== null && a < b && b <= c ? p : { ...PLAGE_RDV_DEFAUT };
}

/** « 8h00 », « 20h00 » : l'heure d'une borne dans une phrase. PUR. */
export const heureBorneFr = (hhmm: string): string => `${Number(hhmm.slice(0, 2))}h${hhmm.slice(3, 5)}`;
/** « 10h » : l'heure dans la liste des heures (sur une seule ligne). PUR. */
export const heureListeFr = (hh: string): string => `${Number(hh)}h`;

/** Le message de refus de la plage (« Un rendez-vous commence entre 8h00 et 20h00 et se termine au plus tard à 21h00. »). PUR. */
export const messagePlageRdv = (p: PlageRdv): string =>
  `Un rendez-vous commence entre ${heureBorneFr(p.debutMin)} et ${heureBorneFr(p.debutMax)} et se termine au plus tard à ${heureBorneFr(p.finMax)}.`;

/**
 * Les heures proposées et, pour chacune, ses minutes : au DÉBUT, de « début au plus tôt » à « début au plus tard » (20h : 00 seulement) ; à la
 * FIN, après « début au plus tôt » et jusqu'à « fin au plus tard » (21h : 00 seulement). `garder` : des heures « HH:MM » proposées EN PLUS
 * (l'heure d'origine d'une fenêtre de tâche, l'exception « Dans 2 minutes » des préavis de test). PUR.
 */
export function creneauxProposes(role: 'debut' | 'fin', plage: PlageRdv, minutes: readonly number[], garder: readonly string[] = []): Map<string, number[]> {
  const bas = enMinutes(plage.debutMin) ?? 0;
  const haut = enMinutes(role === 'debut' ? plage.debutMax : plage.finMax) ?? 23 * 60 + 59;
  const m = new Map<string, number[]>();
  for (let h = 0; h < 24; h++) {
    const l = minutes.filter((n) => { const t = h * 60 + n; return (role === 'debut' ? t >= bas : t > bas) && t <= haut; });
    if (l.length > 0) m.set(deuxChiffres(h), l);
  }
  for (const g of garder) {
    const t = enMinutes(g);
    if (t === null) continue;
    const hh = deuxChiffres(Math.floor(t / 60));
    m.set(hh, [...new Set([...(m.get(hh) ?? []), t % 60])].sort((a, b) => a - b));
  }
  return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Le refus du SERVEUR pour une heure hors plage (début ou fin), sinon null. Un champ vide : la règle existante. PUR. */
export function refusPlageRdv(heures: { debut: string; fin: string }, plage: PlageRdv): string | null {
  const d = heures.debut.trim() === '' ? null : enMinutes(heures.debut);
  const f = heures.fin.trim() === '' ? null : enMinutes(heures.fin);
  const [a, b, c] = [enMinutes(plage.debutMin) ?? 0, enMinutes(plage.debutMax) ?? 0, enMinutes(plage.finMax) ?? 0];
  if (d !== null && (d < a || d > b)) return messagePlageRdv(plage);
  if (f !== null && (f <= a || f > c)) return messagePlageRdv(plage);
  return null;
}

// ══ 🔴🔴 LA DURÉE D'UN RENDEZ-VOUS DU PRÉAVIS (Arno, 19/11/2026) ══════════════════════════════════════════════════════════════════════════════
// « Liste de choix : 15 min, 30 min, 45 min, 1 h. Valeur par défaut : 30 min. […] un réglage en configuration, à côté de minutes_rdv. » La fin
// se CALCULE : début + durée ; modifiée à la main, la durée affichée devient celle qui correspond, ou « Personnalisée ». Réglage : migration 501.

/** Les durées proposées (minutes) et celle choisie d'office. 🔴 Arno (19/11/2026, 503) — + la durée d'office de CHAQUE sorte, à la création. */
export interface DureesParDefaut { previsite: number; edl: number; rdvTache: number; tache: number }
export interface DureesRdv { durees: number[]; defaut: number; defauts?: DureesParDefaut }
export const DUREES_PAR_DEFAUT: DureesParDefaut = { previsite: 30, edl: 60, rdvTache: 30, tache: 15 };
export const DUREES_RDV_DEFAUT: DureesRdv = { durees: [15, 30, 45, 60], defaut: 30, defauts: DUREES_PAR_DEFAUT };

/** Des durées d'office lues (base, réponse du serveur) : chacune de 5 à 1440 minutes, sinon la valeur par défaut de cette sorte. PUR. */
export function lireDureesParDefaut(x: unknown): DureesParDefaut {
  const o = (x ?? {}) as Partial<Record<keyof DureesParDefaut, unknown>>;
  const v = (k: keyof DureesParDefaut): number => { const n = Number(o[k]); return Number.isInteger(n) && n >= 5 && n <= 1440 ? n : DUREES_PAR_DEFAUT[k]; };
  return { previsite: v('previsite'), edl: v('edl'), rdvTache: v('rdvTache'), tache: v('tache') };
}

/** Un réglage lu (base, réponse du serveur) : durées entières de 5 à 1440, sans doublon, triées, et un défaut parmi elles ; sinon le défaut. PUR. */
export function lireDureesRdv(x: unknown): DureesRdv {
  const o = (x ?? {}) as { durees?: unknown; defaut?: unknown; defauts?: unknown };
  const l = Array.isArray(o.durees) ? o.durees.map(Number).filter((n) => Number.isInteger(n) && n >= 5 && n <= 1440) : [];
  const durees = [...new Set(l)].sort((a, b) => a - b);
  const defaut = Number(o.defaut);
  const defauts = lireDureesParDefaut(o.defauts);
  return durees.length > 0 && durees.includes(defaut) ? { durees, defaut, defauts } : { durees: [...DUREES_RDV_DEFAUT.durees], defaut: DUREES_RDV_DEFAUT.defaut, defauts };
}

/** « 15 min », « 1 h », « 1 h 30 » : une durée dans la liste. PUR. */
export function motDureeRdv(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${deuxChiffres(m)}`;
}

/** « 10:00 » + 30 → « 10:30 » ; au-delà de minuit, ou début illisible : null. PUR. */
export function finDepuisDebut(debut: string, duree: number): string | null {
  const d = enMinutes(debut);
  if (d === null || !Number.isFinite(duree) || duree <= 0) return null;
  const t = d + duree;
  return t > 23 * 60 + 59 ? null : `${deuxChiffres(Math.floor(t / 60))}:${deuxChiffres(t % 60)}`;
}

/** La durée entre le début et la fin, en minutes (> 0), sinon null. PUR. */
export function dureeEntre(debut: string, fin: string): number | null {
  const d = enMinutes(debut); const f = enMinutes(fin);
  return d === null || f === null || f <= d ? null : f - d;
}

/**
 * Les durées proposées pour ce début : celles dont la fin respecte la plage (au plus tard « fin au plus tard », 21h00) et tombe sur une minute
 * autorisée (00, 15, 30, 45). Sans début choisi : toutes. PUR.
 */
export function dureesCompatibles(debut: string, durees: readonly number[], plage: PlageRdv, minutes: readonly number[]): number[] {
  if (enMinutes(debut) === null) return [...durees];
  const haut = enMinutes(plage.finMax) ?? 23 * 60 + 59;
  return durees.filter((d) => {
    const f = finDepuisDebut(debut, d);
    const t = f === null ? null : enMinutes(f);
    return t !== null && t <= haut && minutes.includes(t % 60);
  });
}

/** « Autre (19 min) » : la durée réelle qui ne correspond à aucun choix (Arno, 19/11/2026 : remplace « Personnalisée »). PUR. */
export const libelleDureeAutre = (minutes: number): string => `Autre (${minutes} min)`;

/** La durée à afficher : celle de la liste qui correspond au créneau, « personnalisee » sinon ; sans créneau complet : la durée choisie. PUR. */
export function dureeAffichee(debut: string, fin: string, choisie: number, durees: readonly number[]): number | 'personnalisee' {
  const e = dureeEntre(debut, fin);
  if (e === null) return durees.includes(choisie) ? choisie : 'personnalisee';
  return durees.includes(e) ? e : 'personnalisee';
}
