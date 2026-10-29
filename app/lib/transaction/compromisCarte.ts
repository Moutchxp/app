import { ht, type Vente } from './modele';
import { ESPACE, nombreFr } from './format';
import { libelleDesPersonnes } from './personnes';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT E (Arno, 27/10/2026) — LA CARTE COMPACTE D'UN COMPROMIS (PUR) ═════════════════════════════════
 * Un petit bloc lisible d'un coup d'œil, dans cet ordre : ligne 1 les VENDEURS, ligne 2 les ACQUÉREURS, puis sur une ligne l'adresse du
 * bien · le prix de vente · la commission HT (et TTC) · la date butoir (date prévue de l'acte ; « dépassée » si elle est passée).
 * Ce qui manque s'écrit « … à renseigner », jamais un tiret seul. Un compromis importé sans noms montre son libellé d'origine en ligne 1 et
 * « acquéreurs à renseigner » en ligne 2. Tri : la date butoir la plus proche d'abord, les compromis sans date à la fin.
 */

export const A_RENSEIGNER = 'à renseigner';
/** LOT J (Arno) — le taux de commission sans prix de vente : il n'est pas « à renseigner », il se CALCULE dès que le prix est saisi. */
export const TAUX_SANS_PRIX = 'calculé dès la saisie du prix de vente';

/** LOT J — le taux de commission : commission TTC ÷ prix de vente, en % ; null sans prix (ou prix nul) ou sans commission lisible. PUR. */
export function tauxDuPrix(commissionTtc: number, prix: number | null | undefined): number | null {
  return prix == null || !Number.isFinite(prix) || prix <= 0 || !Number.isFinite(commissionTtc) ? null : (commissionTtc / prix) * 100;
}
/** LOT J — « 5,00 % du prix de vente », ou « calculé dès la saisie du prix de vente ». PUR. */
export const libelleTaux = (pct: number | null): string =>
  (pct === null ? TAUX_SANS_PRIX : `${nombreFr(pct, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ESPACE}% du prix de vente`);

export interface CarteCompromis {
  /**
   * LOT F — le titre de la carte : le libellé ; « sans libellé » (le libellé n'est que celui tiré des noms, ou il est vide), « VENDEURS /
   * ACQUÉREURS » (tirets entre les personnes d'un même côté ; un côté vide : « … à renseigner »).
   */
  titre: string;
  /** LOT F — la commission TTC rapportée au prix de vente, en % ; null sans prix connu (rien ne s'affiche). */
  pctPrix: number | null;
  vendeurs: string;
  acquereurs: string;
  adresse: string;
  prix: number | null;
  commissionHt: number;
  commissionTtc: number;
  /** La date butoir « AAAA-MM-JJ » (date prévue de l'acte) ; null : à renseigner. */
  butoir: string | null;
  depassee: boolean;
  /** Vrai : la ligne se lit « … à renseigner ». */
  manque: { vendeurs: boolean; acquereurs: boolean; adresse: boolean };
}

export function carteCompromis(v: Pick<Vente, 'libelle' | 'honorairesTtc' | 'prixVente' | 'dossier'>, aujourdhui: string): CarteCompromis {
  const personnes = v.dossier?.personnes ?? [];
  const noms = (role: 'vendeur' | 'acquereur'): string => personnes.filter((p) => p.role === role).map((p) => p.nom.trim()).filter((x) => x !== '').join(', ');
  const sansNoms = personnes.length === 0;
  const vendeurs = sansNoms ? v.libelle : noms('vendeur');
  const acquereurs = noms('acquereur');
  const adresse = (v.dossier?.adresseBien ?? '').trim();
  const butoir = v.dossier?.dateActePrevue ?? null;
  const tire = (sep: string): string => [personnes.filter((p) => p.role === 'vendeur'), personnes.filter((p) => p.role === 'acquereur')]
    .map((xs) => xs.map((p) => p.nom.trim()).filter((x) => x !== '').join(sep)).filter((x) => x !== '').join(' / ');
  const libelle = v.libelle.trim();
  const sansLibelle = personnes.length > 0 && (libelle === '' || libelle === libelleDesPersonnes(personnes) || libelle === tire(', '));
  const prix = v.prixVente ?? null;
  return {
    titre: sansLibelle ? `${vendeurs === '' ? `vendeurs ${A_RENSEIGNER}` : noms('vendeur').replace(/, /g, '-')} / ${acquereurs === '' ? `acquéreurs ${A_RENSEIGNER}` : acquereurs.replace(/, /g, '-')}`
      : libelle === '' ? `libellé ${A_RENSEIGNER}` : libelle,
    pctPrix: tauxDuPrix(v.honorairesTtc, prix),
    vendeurs: vendeurs === '' ? `vendeurs ${A_RENSEIGNER}` : vendeurs,
    acquereurs: acquereurs === '' ? `acquéreurs ${A_RENSEIGNER}` : acquereurs,
    adresse: adresse === '' ? `adresse ${A_RENSEIGNER}` : adresse,
    prix,
    commissionHt: ht(v.honorairesTtc),
    commissionTtc: v.honorairesTtc,
    butoir,
    depassee: butoir !== null && butoir < aujourdhui,
    manque: { vendeurs: vendeurs === '', acquereurs: acquereurs === '', adresse: adresse === '' },
  };
}

/** Le tri des compromis : date butoir la plus proche d'abord ; sans date à la fin (puis dans l'ordre de saisie). PUR. */
export function trierCompromis<V extends Pick<Vente, 'id' | 'dossier'>>(liste: readonly V[]): V[] {
  return [...liste].sort((a, b) => {
    const da = a.dossier?.dateActePrevue ?? null;
    const db = b.dossier?.dateActePrevue ?? null;
    if (da !== db) { if (da === null) return 1; if (db === null) return -1; return da.localeCompare(db); }
    return a.id - b.id;
  });
}
