/**
 * ══ 🔴 Arno (25/10/2026) — LA PÉRIODE DU SUIVI ANNUEL : « DÉBUT » / « FIN » ══════════════════════════════════════════════════════════
 * Les filtres « Année » et « Mois » du Suivi annuel sont remplacés par une AMPLITUDE choisie, appliquée à toute la page :
 *   · Début : « Origine » (défaut : la première donnée, 1er janvier de la première année d'activité) ou une année (1er janvier) ;
 *   · Fin : « Aujourd'hui » (défaut : la date du jour) ou une année (31 décembre ; l'année en cours = jusqu'à aujourd'hui) ;
 *   · une ANCIENNE adresse `?annee=AAAA&mois=M` devient « AAAA → AAAA », la fin arrêtée au dernier jour du mois M (`fin=AAAA-MM`) ;
 *   · Début > Fin est refusé (les listes ne le proposent pas ; une adresse incohérente le dit et revient au défaut).
 * La PÉRIODE PRÉCÉDENTE (décision d'Arno, 2a) : les mêmes dates, autant d'années plus tôt que la période en couvre (2026 → aujourd'hui
 * face au 01/01 → 25/10/2025 ; 2024 → 2025 face à 2022 → 2023) ; aucune si elle commence avant la première donnée. PUR.
 */
export type ChoixDebut = 'origine' | number;
/** « aujourdhui », une année, ou « AAAA-MM » (une ancienne adresse : la fin du mois). */
export type ChoixFin = 'aujourdhui' | number | string;
export interface ChoixPeriode { debut: ChoixDebut; fin: ChoixFin }
export interface PeriodeSuivi extends ChoixPeriode {
  /** AAAA-MM-JJ inclus. */
  debutDate: string; finDate: string;
  anneeDebut: number; anneeFin: number;
  libelle: string;
}

export const PERIODE_DEFAUT: ChoixPeriode = { debut: 'origine', fin: 'aujourdhui' };
const deux = (n: number): string => String(n).padStart(2, '0');
const dateFr = (iso: string): string => iso.split('-').reverse().join('/');
const COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** Le dernier jour d'un mois (AAAA-MM-JJ). */
const finDeMois = (a: number, m: number): string => `${a}-${deux(m)}-${deux(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;

/** L'année de début d'un choix (« Origine » : la première année d'activité). */
export const anneeDebutDe = (c: ChoixDebut, origine: number): number => (c === 'origine' ? origine : c);
/** L'année de fin d'un choix (« Aujourd'hui » : l'année en cours). */
export function anneeFinDe(c: ChoixFin, jour: string): number {
  if (c === 'aujourdhui') return Number(jour.slice(0, 4));
  return typeof c === 'number' ? c : Number(c.slice(0, 4));
}

/** La période d'un choix : ses dates, ses années, son libellé lisible. */
export function periodeDe(c: ChoixPeriode, origine: number, jour: string): PeriodeSuivi {
  const anneeDebut = anneeDebutDe(c.debut, origine);
  const enCours = Number(jour.slice(0, 4));
  let finDate: string;
  if (c.fin === 'aujourdhui') finDate = jour;
  else if (typeof c.fin === 'number') finDate = c.fin >= enCours ? jour : `${c.fin}-12-31`;
  else { const [a, m] = c.fin.split('-').map(Number); finDate = finDeMois(a, m) > jour ? jour : finDeMois(a, m); }
  const anneeFin = Number(finDate.slice(0, 4));
  const debutDate = `${anneeDebut}-01-01`;
  const gauche = c.debut === 'origine' ? 'Origine' : String(anneeDebut);
  const jusquAujourdhui = finDate === jour;
  const droite = jusquAujourdhui ? 'aujourd’hui' : typeof c.fin === 'string' && c.fin !== 'aujourdhui' ? `fin ${COURT[Number(c.fin.slice(5, 7)) - 1]} ${anneeFin}` : String(anneeFin);
  const precision = c.debut === 'origine' || jusquAujourdhui ? ` (${anneeDebut} → ${dateFr(finDate)})` : '';
  return { ...c, debutDate, finDate, anneeDebut, anneeFin, libelle: `${gauche} → ${droite}${precision}` };
}

/** Début > Fin ? */
export const incoherente = (c: ChoixPeriode, origine: number, jour: string): boolean => anneeDebutDe(c.debut, origine) > anneeFinDe(c.fin, jour);

/** Le choix lu d'une adresse ; une ancienne adresse `?annee&mois` convertie ; une adresse incohérente : le défaut et un message. */
export function choixDeLAdresse(recherche: string, origine: number, jour: string): { choix: ChoixPeriode; message: string | null } {
  const q = new URLSearchParams(recherche);
  const d = q.get('debut'); const f = q.get('fin');
  let choix: ChoixPeriode;
  if (d === null && f === null && q.get('annee') !== null) {
    const a = Number(q.get('annee')); const m = Number(q.get('mois'));
    if (!Number.isInteger(a) || a < 2000 || a > 2100) return { choix: PERIODE_DEFAUT, message: null };
    choix = { debut: a, fin: Number.isInteger(m) && m >= 1 && m <= 12 ? `${a}-${deux(m)}` : a };
  } else {
    const debut: ChoixDebut = d === null || d === 'origine' ? 'origine' : /^\d{4}$/.test(d) ? Number(d) : 'origine';
    const fin: ChoixFin = f === null || f === 'aujourdhui' ? 'aujourdhui' : /^\d{4}$/.test(f) ? Number(f) : /^\d{4}-(0[1-9]|1[0-2])$/.test(f) ? f : 'aujourdhui';
    choix = { debut, fin };
  }
  if (incoherente(choix, origine, jour)) {
    return { choix: PERIODE_DEFAUT, message: `La période de l’adresse est incohérente (début ${anneeDebutDe(choix.debut, origine)} après la fin ${anneeFinDe(choix.fin, jour)}) : la période par défaut est affichée (Origine → aujourd’hui).` };
  }
  return { choix, message: null };
}

/** Les paramètres d'adresse d'un choix (le défaut n'écrit rien). */
export function parametresDe(c: ChoixPeriode): { debut: string | null; fin: string | null } {
  return { debut: c.debut === 'origine' ? null : String(c.debut), fin: c.fin === 'aujourdhui' ? null : String(c.fin) };
}

/** Les années proposées : de la première année d'activité à l'année en cours ; Début ≤ Fin. */
export function anneesProposees(origine: number, jour: string): number[] {
  const fin = Number(jour.slice(0, 4));
  return Array.from({ length: Math.max(0, fin - origine + 1) }, (_, i) => origine + i);
}

/** Les mois « AAAA-MM » de la période, du premier au dernier. */
export function moisDeLaPeriode(p: Pick<PeriodeSuivi, 'debutDate' | 'finDate'>): string[] {
  const sortie: string[] = [];
  let [a, m] = p.debutDate.split('-').map(Number);
  const fin = p.finDate.slice(0, 7);
  while (`${a}-${deux(m)}` <= fin) { sortie.push(`${a}-${deux(m)}`); m += 1; if (m > 12) { m = 1; a += 1; } }
  return sortie;
}

/** Les années de la période. */
export const anneesDeLaPeriode = (p: Pick<PeriodeSuivi, 'anneeDebut' | 'anneeFin'>): number[] =>
  Array.from({ length: p.anneeFin - p.anneeDebut + 1 }, (_, i) => p.anneeDebut + i);

/** Une date « AAAA-MM-JJ » dans la période (bornes incluses). */
export const dansPeriode = (date: string, p: Pick<PeriodeSuivi, 'debutDate' | 'finDate'>): boolean => date.slice(0, 10) >= p.debutDate && date.slice(0, 10) <= p.finDate;

/** La même date `k` années plus tôt (un 29 février devient le 28). */
export function reculer(date: string, k: number): string {
  const [a, m, j] = date.split('-').map(Number);
  const dernier = new Date(Date.UTC(a - k, m, 0)).getUTCDate();
  return `${a - k}-${deux(m)}-${deux(Math.min(j, dernier))}`;
}

/** 2a — la période précédente : les mêmes dates, autant d'années plus tôt que la période en couvre ; null avant la première donnée. */
export function periodePrecedente(p: PeriodeSuivi, origine: number): { debutDate: string; finDate: string; libelle: string } | null {
  const k = p.anneeFin - p.anneeDebut + 1;
  const debutDate = reculer(p.debutDate, k);
  if (Number(debutDate.slice(0, 4)) < origine) return null;
  const finDate = reculer(p.finDate, k);
  const entiere = finDate.slice(5) === '12-31';
  const libelle = k === 1 && entiere ? debutDate.slice(0, 4)
    : entiere ? `${debutDate.slice(0, 4)} → ${finDate.slice(0, 4)}` : `${dateFr(debutDate)} → ${dateFr(finDate)}`;
  return { debutDate, finDate, libelle };
}

/** La portion d'une année couverte par la période : du 1er janvier (ou du début) au 31 décembre (ou à la fin). */
export function portionDeLAnnee(annee: number, p: Pick<PeriodeSuivi, 'debutDate' | 'finDate'>): { debutDate: string; finDate: string } {
  const debut = `${annee}-01-01` < p.debutDate ? p.debutDate : `${annee}-01-01`;
  const fin = `${annee}-12-31` > p.finDate ? p.finDate : `${annee}-12-31`;
  return { debutDate: debut, finDate: fin };
}

/** L'année et le mois de la FIN d'un choix (la dernière année de la période et son dernier mois). */
export function finAnneeMois(c: ChoixPeriode, jour: string): { annee: number; mois: number } {
  const enCours = Number(jour.slice(0, 4));
  const annee = Math.min(anneeFinDe(c.fin, jour), enCours);
  if (typeof c.fin === 'string' && c.fin !== 'aujourdhui') return { annee, mois: annee === enCours ? Math.min(Number(c.fin.slice(5, 7)), Number(jour.slice(5, 7))) : Number(c.fin.slice(5, 7)) };
  return { annee, mois: annee === enCours ? Number(jour.slice(5, 7)) : 12 };
}
