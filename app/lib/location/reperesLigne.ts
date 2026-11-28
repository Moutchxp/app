/**
 * ══ 🔴🔴 Arno (28/11/2026, 01h52) — LES REPÈRES D'UNE LIGNE « SANS RENDEZ-VOUS FIXÉ », DANS L'ORDRE OÙ ILS SONT APPARUS ═══════════════════════════════
 * « les cartouches s'affichent côte à côte alors qu'ils devraient s'afficher l'un en dessous de l'autre, dans le sens chronologique où ils arrivent (du
 * plus ancien en haut au plus récent en bas) ; dans notre cas : En préavis en haut, dessous Aucune pré-visite fixée, puis Préavis échu. »
 * La date d'apparition de chacun : « En préavis » = la réception du préavis ; « Refus / absence pré-visite » = le mail de refus ; « Pré-visite
 * effectuée » = le compte rendu (sinon le jour du rendez-vous) ; « Aucune pré-visite fixée » = le 11e jour (`jourAlerte`, la règle de l'alerte) ;
 * « Préavis échu » = le lendemain de la fin du préavis (la règle de `statutPreavis`). Un repère sans date connue va en bas. À date égale : l'ordre
 * reçu. PUR, sans `pg`.
 */
import { ajouterJours, jourAlerte } from './previsite';
import type { StatutLigne } from './statutLignePreavis';

/** « AAAA-MM-JJ » d'un jour ou d'un instant ISO ; rien : null. */
const jourDe = (d: string | null | undefined): string | null => (d ? d.slice(0, 10) : null);

/** Ce qu'il faut d'une ligne pour dater ses repères. */
export interface FaitsReperes {
  recuLe: string;
  dateMax: string;
  previsite?: { statut: string; rdv?: { jour: string } | null; refusLe?: string | null; effectueeLe?: string | null } | null;
}

/** Le jour où le cartouche de ce statut est apparu (null : inconnu). PUR. */
export function dateDuStatut(s: StatutLigne, l: FaitsReperes): string | null {
  const p = l.previsite ?? null;
  if (s === 'en_preavis') return jourDe(l.recuLe);
  if (s === 'refus_previsite') return jourDe(p?.refusLe);
  if (s === 'previsite_effectuee') return jourDe(p?.effectueeLe) ?? jourDe(p?.rdv?.jour);
  return null;
}
/** « Aucune pré-visite fixée » : le 11e jour qui suit la réception. PUR. */
export const dateAlerteSansPrevisite = (l: Pick<FaitsReperes, 'recuLe'>): string => jourAlerte(jourDe(l.recuLe) ?? l.recuLe);
/** « Préavis échu » : le lendemain de la fin du préavis. PUR. */
export const dateEchu = (l: Pick<FaitsReperes, 'dateMax'>): string => ajouterJours(jourDe(l.dateMax) ?? l.dateMax, 1);

/** Du plus ancien (en haut) au plus récent (en bas) ; sans date : en bas ; à date égale : l'ordre reçu. PUR. */
export function ordonnerReperes<T extends { date: string | null }>(reperes: readonly T[]): T[] {
  return reperes.map((r, i) => ({ r, i })).sort((a, b) => {
    const x = a.r.date; const y = b.r.date;
    if (x !== y) { if (x === null) return 1; if (y === null) return -1; return x.localeCompare(y); }
    return a.i - b.i;
  }).map((x) => x.r);
}
