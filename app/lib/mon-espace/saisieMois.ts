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
export interface Validation { societe: Societe; famille: FamilleCout; poste: PosteSaisissable; annee: number; mois: number }
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

export const estValide = (v: readonly Validation[], societe: Societe, p: Pick<PosteDuMois, 'famille' | 'poste'>, m: MoisAn): boolean =>
  v.some((x) => x.societe === societe && x.famille === p.famille && x.poste === p.poste && x.annee === m.annee && x.mois === m.mois);

export interface Completude { postes: { poste: PosteDuMois; complet: boolean }[]; familles: Record<FamilleCout, boolean | null>; complet: boolean }
/** Complet par poste, par bloc (null : aucun poste saisi dans ce bloc pour cette structure) et en tout. PUR. */
export function completude(postes: readonly PosteDuMois[], v: readonly Validation[], societe: Societe, m: MoisAn): Completude {
  const xs = postes.map((poste) => ({ poste, complet: estValide(v, societe, poste, m) }));
  const fam = (f: FamilleCout): boolean | null => { const ys = xs.filter((x) => x.poste.famille === f); return ys.length === 0 ? null : ys.every((x) => x.complet); };
  return { postes: xs, familles: { vente: fam('vente'), location: fam('location'), gestion: fam('gestion') }, complet: xs.every((x) => x.complet) };
}

/** C17 — le mois précédent est-il à compléter dans l'une des structures vues ? null : pas de rappel (rien à dire). PUR. */
export function rappelMois(societes: readonly Societe[], v: readonly Validation[], jour: string, o: { adhocImporte: boolean; monga: boolean }): { mois: MoisAn; mot: string } | null {
  const m = moisProposes(jour)[0];
  const aCompleter = societes.some((s) => !completude(postesSaisis(s, o), v, s, m).complet);
  return aCompleter ? { mois: m, mot: motRappel(m) } : null;
}
