import { aCaGestion, caGestionDuMoisC, celluleGlobal, previsionnel, TVA, type CelluleGlobal, type EntreesGlobal } from './modele';
import type { TotalCompromisEnCours } from './compromisEnCours';
import type { Societe } from './modele';

/**
 * ══ 🔴 LOT CG1 (Arno) — LE CA GLOBAL EN « HT | TTC » : CHAQUE MONTANT, CELUI DE SA PAGE D'ORIGINE (PUR) ══════════════════════════════════════════
 * Aucune règle de calcul ne change : en HT, `celluleGlobal` telle quelle. En TTC, chaque part reprend la règle de sa page d'origine :
 *  · vente CRITERIMMO / MACJ (et ventes à attribuer, inter-cabinet, parts extérieures) : le HT × `TVA`, la conversion des pages Transaction vente ;
 *  · location : la somme des CA TTC de chaque ligne au centime (`caTtcC`, page « Suivi CA › Location »), lue par la route (`locationTtcC`) ;
 *  · gestion : les honoraires TTC de chaque mois au centime (`honorairesTtcC`, page Gestion).
 * Puis les mêmes sommes qu'en HT : CRITERIMMO = vente + location + gestion ; MACJ = vente ; réalisé = CRITERIMMO + MACJ + à attribuer − inter-cabinet.
 * Les champs « …Ht » d'une cellule portent alors des montants TTC (la même forme, pour le même écran).
 */
export type UniteGlobal = 'ht' | 'ttc';
export interface EntreesGlobalUnite extends EntreesGlobal {
  /** Le CA TTC de la location par mois (« AAAA-MM » → CENTIMES), la règle de la page Location ; absent : HT × TVA (une route d'avant). */
  locationTtcC?: Readonly<Record<string, number>> | null;
}

const cle = (annee: number, mois: number): string => `${annee}-${String(mois).padStart(2, '0')}`;

/**
 * Une cellule du CA global dans l'unité : un mois (1 → 12) ou l'année (mois null). 🔴 Chaque part est arrondie au centime (le montant AFFICHÉ, celui
 * de sa page), puis les totaux en sont la somme : « CRITERIMMO = vente + location + gestion » et « global = la somme des lignes » tombent au centime
 * à l'écran (avant, en HT, la somme des ventes non arrondies pouvait différer d'un centime de la somme des lignes affichées : 2022 en recette). PUR.
 */
export function celluleGlobalEn(e: EntreesGlobalUnite, annee: number, mois: number | null, u: UniteGlobal): CelluleGlobal {
  return auCentime(u === 'ht' ? celluleGlobal(e, annee, mois) : celluleGlobalTtc(e, annee, mois));
}
/**
 * 🔴 LOT CG3 — une cellule de plusieurs années (« Période », « Tout ») : la SOMME des cellules de chaque année, déjà au centime (`celluleGlobalEn`) ;
 * null (location, gestion) seulement si aucune année n'a la part. La période = la somme des années, au centime, HT et TTC. PUR.
 */
export function celluleGlobalAnnees(e: EntreesGlobalUnite, annees: readonly number[], u: UniteGlobal): CelluleGlobal {
  const cs = annees.map((a) => celluleGlobalEn(e, a, null, u));
  const s = (k: Exclude<keyof CelluleGlobal, 'locationHt' | 'gestionHt'>): number => cs.reduce((t, c) => t + centC(c[k]), 0) / 100;
  const n = (k: 'locationHt' | 'gestionHt'): number | null => (cs.every((c) => c[k] === null) ? null : cs.reduce((t, c) => t + centC(c[k] ?? 0), 0) / 100);
  return { venteCriterimmoHt: s('venteCriterimmoHt'), venteMacjHt: s('venteMacjHt'), aAttribuerHt: s('aAttribuerHt'), exterieurHt: s('exterieurHt'), interCabinetHt: s('interCabinetHt'),
    locationHt: n('locationHt'), gestionHt: n('gestionHt'), criterimmoHt: s('criterimmoHt'), macjHt: s('macjHt'), totalHt: s('totalHt') };
}
const cent = (x: number): number => (Math.round((x + Math.sign(x) * Number.EPSILON) * 100) || 0) / 100;
const centC = (x: number): number => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) || 0;
function auCentime(c: CelluleGlobal): CelluleGlobal {
  const [vc, vm, aa, ic, loc, ges] = [c.venteCriterimmoHt, c.venteMacjHt, c.aAttribuerHt, c.interCabinetHt, c.locationHt ?? 0, c.gestionHt ?? 0].map(centC);
  const criterimmo = vc + loc + ges;
  return { venteCriterimmoHt: vc / 100, venteMacjHt: vm / 100, aAttribuerHt: aa / 100, exterieurHt: cent(c.exterieurHt), interCabinetHt: ic / 100,
    locationHt: c.locationHt === null ? null : loc / 100, gestionHt: c.gestionHt === null ? null : ges / 100,
    criterimmoHt: criterimmo / 100, macjHt: vm / 100, totalHt: (criterimmo + vm + aa - ic) / 100 };
}
function celluleGlobalTtc(e: EntreesGlobalUnite, annee: number, mois: number | null): CelluleGlobal {
  const c = celluleGlobal(e, annee, mois);
  const moisVises = mois === null ? Array.from({ length: 12 }, (_, i) => i + 1) : [mois];
  const location = c.locationHt === null ? null
    : e.locationTtcC == null ? c.locationHt * TVA : moisVises.reduce((t, m) => t + (e.locationTtcC?.[cle(annee, m)] ?? 0), 0) / 100;
  // 🔴 471 — le CA de gestion TTC : honoraires + GLI, chacun à son taux du mois (`caGestionDuMoisC`, la même fonction que le HT)
  const gLignes = e.gestion.filter((g) => g.annee === annee && moisVises.includes(g.mois) && aCaGestion(g));
  const gestion = c.gestionHt === null ? null : gLignes.reduce((t, g) => t + caGestionDuMoisC(g).totalTtcC, 0) / 100;
  const venteCriterimmoHt = c.venteCriterimmoHt * TVA; const venteMacjHt = c.venteMacjHt * TVA;
  const aAttribuerHt = c.aAttribuerHt * TVA; const interCabinetHt = c.interCabinetHt * TVA;
  const criterimmoHt = venteCriterimmoHt + (location ?? 0) + (gestion ?? 0);
  return { venteCriterimmoHt, venteMacjHt, aAttribuerHt, exterieurHt: c.exterieurHt * TVA, locationHt: location, gestionHt: gestion, interCabinetHt,
    totalHt: criterimmoHt + venteMacjHt + aAttribuerHt - interCabinetHt, criterimmoHt, macjHt: venteMacjHt };
}

export type CompromisEnCoursGlobal = Record<'tous' | Societe, TotalCompromisEnCours>;
export interface Previsionnel { criterimmoHt: number; macjHt: number; interCabinetHt: number; totalHt: number }
/**
 * Le prévisionnel dans l'unité : les compromis EN COURS (la règle unique, lot CY) — leur HT ou leur TTC, ceux de l'onglet « Compromis » ;
 * l'inter-cabinet entre nos sociétés = ce qui est compté deux fois. Sans ces totaux (une base d'avant) : le prévisionnel de l'année (HT, × TVA en TTC). PUR.
 */
export function previsionnelEn(e: Pick<EntreesGlobal, 'ventes'>, annee: number, cec: CompromisEnCoursGlobal | undefined, u: UniteGlobal): Previsionnel {
  if (cec === undefined) {
    const p = previsionnel(e, annee); const f = u === 'ht' ? 1 : TVA;
    return { criterimmoHt: p.criterimmoHt * f, macjHt: p.macjHt * f, interCabinetHt: p.interCabinetHt * f, totalHt: p.totalHt * f };
  }
  const k = u === 'ht' ? 'htC' : 'ttcC';
  const criterimmoHt = cec.criterimmo[k] / 100; const macjHt = cec.macj[k] / 100; const totalHt = cec.tous[k] / 100;
  return { criterimmoHt, macjHt, interCabinetHt: Math.round((criterimmoHt + macjHt - totalHt) * 100) / 100, totalHt };
}
