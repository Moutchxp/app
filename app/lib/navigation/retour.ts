/**
 * ══ 🔴🔴 LE « ← RETOUR » VERS LA PAGE D'ORIGINE, DANS TOUTE L'APPLICATION (Arno, 11/11/2026). MODULE PUR. ═════════════════════════════════
 *
 * Arno : « Quand on suit un lien interne qui mène d'une page à une autre, la page d'arrivée affiche en haut un bouton « ← Retour » qui ramène
 * EXACTEMENT à la page d'où l'on vient, dans le même état : même onglet, mêmes filtres et tris, même ligne dépliée, même position de
 * défilement. Sans origine connue (lien direct, nouvel onglet) : la page parente logique. »
 *
 * UN SEUL MÉCANISME (et non une copie par page) :
 *   ① au départ — tout clic sur un lien interne de l'application, dans le MÊME onglet — on note un DÉPART : l'adresse quittée, la position
 *      de défilement et l'état des blocs inscrits (ligne dépliée, filtres…), et l'adresse visée. Une PILE par onglet (sessionStorage) : un
 *      nouvel onglet n'a pas d'origine, il revient au parent logique ;
 *   ② à l'arrivée — le lien « ← Retour » commun cherche le départ qui mène ICI : connu, il ramène à son adresse et pose une RESTAURATION
 *      (état et défilement), que la page d'origine applique en se chargeant ; inconnu, il suit son adresse parente, comme avant.
 * Les liens qui s'ouvrent dans un NOUVEL onglet ne notent rien (l'onglet d'origine reste où il est, et relit ses données au retour).
 * ⚠️ AUCUN IMPORT (module pur, client ET serveur).
 */

export interface Depart {
  /** L'adresse quittée (chemin + requête, sans le fragment). */
  depuis: string;
  /** L'adresse visée (chemin + requête). */
  vers: string;
  defilement: number;
  /** L'état des blocs inscrits sur la page quittée, par clé (`useEtatRetour`). */
  etat: Record<string, unknown>;
  le: number;
}
export interface Restauration { url: string; defilement: number; etat: Record<string, unknown>; le: number }

export const CLE_PILE = 'svav.retour.pile';
export const CLE_RESTAURER = 'svav.retour.restaurer';
export const PILE_MAX = 30;
/** Une restauration plus vieille que cela n'est plus appliquée (la page d'origine ne l'attend plus). */
export const RESTAURATION_MAX_MS = 60_000;

/** « /admin/location/bien/7?x=1 » — le chemin et la requête d'une adresse de l'application ; `null` hors de l'application. PUR. */
export function adresseInterne(href: string, origine: string): string | null {
  let u: URL;
  try { u = new URL(href, origine); } catch { return null; }
  if (u.origin !== new URL(origine).origin) return null;
  if (!u.pathname.startsWith('/admin')) return null;
  return `${u.pathname}${u.search}`;
}

/** Faut-il noter un départ pour ce clic ? Lien interne, même onglet, clic simple, pas un lien de retour, pas déjà empêché. PUR. */
export function clicASuivre(c: {
  href: string | null; target: string | null; download: boolean; bouton: number; modificateur: boolean; empeche: boolean; lienRetour: boolean;
}): boolean {
  if (c.href === null || c.href === '' || c.href.startsWith('#') || /^(mailto|tel|javascript):/i.test(c.href)) return false;
  if (c.target !== null && c.target !== '' && c.target !== '_self') return false;
  return !c.download && c.bouton === 0 && !c.modificateur && !c.empeche && !c.lienRetour;
}

/** La pile, avec ce départ en plus (un départ identique au dernier le remplace ; bornée). PUR. */
export function empiler(pile: readonly Depart[], d: Depart): Depart[] {
  if (d.depuis === d.vers) return [...pile];
  const sans = pile.length > 0 && pile[pile.length - 1].depuis === d.depuis && pile[pile.length - 1].vers === d.vers ? pile.slice(0, -1) : [...pile];
  return [...sans, d].slice(-PILE_MAX);
}

/** Le départ qui a mené ICI (le plus récent), ou `null`. PUR. */
export function origineDe(pile: readonly Depart[], ici: string): { depart: Depart; index: number } | null {
  for (let i = pile.length - 1; i >= 0; i -= 1) {
    if (pile[i].vers === ici && pile[i].depuis !== ici) return { depart: pile[i], index: i };
  }
  return null;
}

/** La pile après un retour par ce départ : il est retiré, avec tout ce qui a été empilé après lui. PUR. */
export const apresRetour = (pile: readonly Depart[], index: number): Depart[] => pile.slice(0, index);

/** La pile relue (une valeur abîmée = pile vide). PUR. */
export function lirePile(brut: string | null): Depart[] {
  if (brut === null) return [];
  try {
    const v = JSON.parse(brut) as unknown;
    return Array.isArray(v) ? v.filter((d): d is Depart => typeof d === 'object' && d !== null && typeof (d as Depart).depuis === 'string' && typeof (d as Depart).vers === 'string') : [];
  } catch { return []; }
}

/** La restauration à appliquer ICI, ou `null` (autre page, trop ancienne, abîmée). PUR. */
export function restaurationPour(brut: string | null, ici: string, maintenant: number): Restauration | null {
  if (brut === null) return null;
  try {
    const r = JSON.parse(brut) as Restauration;
    if (typeof r?.url !== 'string' || r.url !== ici || maintenant - Number(r.le) > RESTAURATION_MAX_MS) return null;
    return { url: r.url, defilement: Number(r.defilement) || 0, etat: r.etat && typeof r.etat === 'object' ? r.etat : {}, le: Number(r.le) };
  } catch { return null; }
}
