import type { Societe } from '../transaction/modele';
import type { FamilleCout } from '../transaction/coutsSaisis';
import { NOMS_MOIS } from '../transaction/modele';

/**
 * ══ 🔴 « LES COÛTS », LOT 3 (Arno, 03/11/2026, C16 / C17) — « SAISIR LES COÛTS DU MOIS » : LES RÈGLES (PUR) ═════════════════════════════════════
 *   · C16 : le mois proposé = le mois PRÉCÉDENT le mois en cours ; le sélecteur = les 6 derniers mois révolus (du plus récent au plus ancien) ;
 *   · les postes SAISIS d'une structure (C7 : location et gestion à CRITERIMMO) ; ADHOC repris d'un import ne se saisit pas ici (complet d'office) ;
 *   · un poste est COMPLET quand sa valeur du mois (0 compris) a été explicitement validée ; un bloc, quand tous ses postes le sont ;
 *   · C17 : le rappel — le mois précédent a-t-il un poste à compléter (dans les structures vues) ?
 */
export type PosteSaisissable = 'salaires' | 'autres' | 'adhoc' | 'monga';
export interface PosteDuMois { famille: FamilleCout; poste: PosteSaisissable; libelle: string }
/** 🔴 « Coûts et CA » (471) — les deux postes du CA de gestion (CRITERIMMO). */
export type PosteCa = 'honoraires' | 'gli';
export interface PosteCaDuMois { poste: PosteCa; libelle: string }
export interface Validation { societe: Societe; famille: FamilleCout; poste: PosteSaisissable | PosteCa; annee: number; mois: number }
export interface MoisAn { annee: number; mois: number }

/** C16 — les 6 derniers mois révolus, du plus récent (le mois précédent, le mois proposé) au plus ancien. PUR. */
export function moisProposes(jour: string): MoisAn[] {
  let annee = Number(jour.slice(0, 4)); let mois = Number(jour.slice(5, 7));
  return Array.from({ length: 6 }, () => {
    mois -= 1; if (mois === 0) { mois = 12; annee -= 1; }
    return { annee, mois };
  });
}
export const libelleMois = (m: MoisAn): string => `${NOMS_MOIS[m.mois - 1]} ${m.annee}`;
/** « octobre » (pour « Coûts d'octobre à saisir »). PUR. */
export const motMois = (m: MoisAn): string => NOMS_MOIS[m.mois - 1].toLowerCase();
/** « Coûts d'octobre à saisir » / « Coûts de mai à saisir ». PUR. */
export const motRappel = (m: MoisAn): string => { const x = motMois(m); return `Coûts ${/^[aeiouyéèh]/i.test(x) ? 'd’' : 'de '}${x} à saisir`; };

/**
 * Les postes saisis d'une structure pour un mois : la vente (salaires, « Autres ») ; CRITERIMMO en plus la location (salaires, « Autres ») et la
 * gestion (salaires, ADHOC sauf repris d'un import, MONGA si la migration 446 est posée, « Autres »). PUR.
 */
export function postesSaisis(societe: Societe, o: { adhocImporte: boolean; monga: boolean }): PosteDuMois[] {
  const p: PosteDuMois[] = [{ famille: 'vente', poste: 'salaires', libelle: 'Salaires chargés' }, { famille: 'vente', poste: 'autres', libelle: 'Autres' }];
  if (societe !== 'criterimmo') return p;
  p.push({ famille: 'location', poste: 'salaires', libelle: 'Salaires chargés' }, { famille: 'location', poste: 'autres', libelle: 'Autres' },
    { famille: 'gestion', poste: 'salaires', libelle: 'Salaires chargés' });
  if (!o.adhocImporte) p.push({ famille: 'gestion', poste: 'adhoc', libelle: 'ADHOC' });
  if (o.monga) p.push({ famille: 'gestion', poste: 'monga', libelle: 'MONGA' });
  p.push({ famille: 'gestion', poste: 'autres', libelle: 'Autres' });
  return p;
}

export const estValide = (v: readonly Validation[], societe: Societe, p: { famille: FamilleCout; poste: PosteSaisissable | PosteCa }, m: MoisAn): boolean =>
  v.some((x) => x.societe === societe && x.famille === p.famille && x.poste === p.poste && x.annee === m.annee && x.mois === m.mois);

export interface Completude { postes: { poste: PosteDuMois; complet: boolean }[]; familles: Record<FamilleCout, boolean | null>; complet: boolean }
/** Complet par poste, par bloc (null : aucun poste saisi dans ce bloc pour cette structure) et en tout. PUR. */
export function completude(postes: readonly PosteDuMois[], v: readonly Validation[], societe: Societe, m: MoisAn): Completude {
  const xs = postes.map((poste) => ({ poste, complet: estValide(v, societe, poste, m) }));
  const fam = (f: FamilleCout): boolean | null => { const ys = xs.filter((x) => x.poste.famille === f); return ys.length === 0 ? null : ys.every((x) => x.complet); };
  return { postes: xs, familles: { vente: fam('vente'), location: fam('location'), gestion: fam('gestion') }, complet: xs.every((x) => x.complet) };
}

/**
 * ══ 🔴 « COÛTS ET CA » (Arno, 13/11/2026, 471) — LA PARTIE « CA GESTION » ═════════════════════════════════════════════════════════════════════════
 * CRITERIMMO seulement (MACJ ne fait pas de gestion ; FUSION ne se saisit pas). Deux lignes : les honoraires de gestion (sauf repris d'un import :
 * ils se corrigent dans Suivi CA › Gestion, comme ADHOC — complets d'office) et les honoraires GLI. Une ligne est COMPLÈTE quand elle est cochée ✓
 * (0 € coché volontairement compris) ; la partie, quand toutes ses lignes le sont. PUR.
 */
export const LIBELLE_POSTE_CA: Record<PosteCa, string> = { honoraires: 'Honoraires de gestion', gli: 'Honoraires GLI (garantie de loyers impayés)' };
export function postesCaGestion(societe: Societe, o: { honorairesImportes: boolean }): PosteCaDuMois[] {
  if (societe !== 'criterimmo') return [];
  return [...(o.honorairesImportes ? [] : [{ poste: 'honoraires' as const, libelle: LIBELLE_POSTE_CA.honoraires }]), { poste: 'gli', libelle: LIBELLE_POSTE_CA.gli }];
}
/** La partie « CA gestion » est-elle complète ? null : pas de partie (MACJ). PUR. */
export function completudeCa(postes: readonly PosteCaDuMois[], v: readonly Validation[], societe: Societe, m: MoisAn): { postes: { poste: PosteCaDuMois; complet: boolean }[]; complet: boolean | null } {
  if (societe !== 'criterimmo') return { postes: [], complet: null };
  const xs = postes.map((poste) => ({ poste, complet: estValide(v, societe, { famille: 'gestion', poste: poste.poste }, m) }));
  return { postes: xs, complet: xs.every((x) => x.complet) };
}
/** « CA gestion d'octobre à saisir ». PUR. */
export const motRappelCa = (m: MoisAn): string => { const x = motMois(m); return `CA gestion ${/^[aeiouyéèh]/i.test(x) ? 'd’' : 'de '}${x} à saisir`; };
/** Une alerte de l'accueil : la partie à compléter, sa structure (celle où elle se saisit), le mois, le libellé. */
export interface AlerteSaisie { partie: 'couts' | 'ca'; societe: Societe; mois: MoisAn; mot: string }
/**
 * 🔴 L'INDICATEUR UNIFIÉ DE L'ACCUEIL (remplace le rappel C17, sans rien en perdre) : le mois contrôlé est le même (le mois précédent) ; les coûts sont
 * à saisir dans l'une des structures vues (la première à compléter : celle qu'ouvre le clic) ; le CA gestion, à CRITERIMMO (si la 471 est posée).
 * [] : rien à dire. PUR.
 */
export function alertesSaisie(societes: readonly Societe[], v: readonly Validation[], jour: string,
  o: { adhocImporte: boolean; monga: boolean; ca: boolean; honorairesImportes: boolean }): AlerteSaisie[] {
  const m = moisProposes(jour)[0];
  const a: AlerteSaisie[] = [];
  const s = societes.find((x) => !completude(postesSaisis(x, o), v, x, m).complet);
  if (s !== undefined) a.push({ partie: 'couts', societe: s, mois: m, mot: motRappel(m) });
  if (o.ca && societes.includes('criterimmo') && completudeCa(postesCaGestion('criterimmo', o), v, 'criterimmo', m).complet === false)
    a.push({ partie: 'ca', societe: 'criterimmo', mois: m, mot: motRappelCa(m) });
  return a;
}

/** Les alertes telles que la route les rend, vérifiées (une réponse inattendue : aucune alerte, jamais une erreur d'écran). PUR. */
export function lireAlertesSaisie(x: unknown): AlerteSaisie[] {
  if (!Array.isArray(x)) return [];
  return x.filter((a): a is AlerteSaisie => typeof a === 'object' && a !== null && ((a as AlerteSaisie).partie === 'couts' || (a as AlerteSaisie).partie === 'ca')
    && ((a as AlerteSaisie).societe === 'criterimmo' || (a as AlerteSaisie).societe === 'macj') && typeof (a as AlerteSaisie).mot === 'string'
    && typeof (a as AlerteSaisie).mois?.annee === 'number' && typeof (a as AlerteSaisie).mois?.mois === 'number');
}

/** C17 — le mois précédent est-il à compléter dans l'une des structures vues ? null : pas de rappel (rien à dire). PUR. */
export function rappelMois(societes: readonly Societe[], v: readonly Validation[], jour: string, o: { adhocImporte: boolean; monga: boolean }): { mois: MoisAn; mot: string } | null {
  const m = moisProposes(jour)[0];
  const aCompleter = societes.some((s) => !completude(postesSaisis(s, o), v, s, m).complet);
  return aCompleter ? { mois: m, mot: motRappel(m) } : null;
}
