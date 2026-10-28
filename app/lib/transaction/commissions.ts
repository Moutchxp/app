import { caHt, commissionNetteHt, exterieurHt, ht, SOCIETES, TVA, type LigneVente, type MontantSaisi, type Societe, type Unite, type Vente } from './modele';

export type { MontantSaisi, Unite };

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT I (Arno, 28/10/2026) — LES COMMISSIONS VERSÉES ET LES 4 TUILES DE L'ONGLET « COMPROMIS » (PUR) ═══
 *
 * UNITÉ AU CHOIX, PAR COMMISSION. La commission versée au négociateur d'entrée, à celui de sortie, et la rétrocession de l'apporteur se
 * saisissent chacune en « HT » ou en « TTC » : le choix est porté par le MONTANT, jamais par la personne (un même négociateur facture en
 * HT sur une vente, en TTC sur une autre). Conversion au taux de la tuile, la seule source (`TVA` de modele.ts : TTC = HT × 1,2), SANS
 * arrondi. Ce qui est enregistré garde l'unité saisie ; les montants d'avant (imports, saisies) sont en TTC et le restent.
 *
 * PAS DE DOUBLON. La commission versée à un négociateur est la « paye du négociateur » des lignes de vente (rôle 'negociateur', 433 —
 * `LIBELLE_ROLE`, `payeTtcDe` de modele.ts ; colonne « paye » des imports MACJ). La 437 lui ajoute le côté (entrée / sortie) et le
 * montant HT quand il est saisi en HT.
 *
 * LES 4 TUILES (compromis EN COURS seulement : acte non signé, non annulés), pour une société ou pour les deux (CA global) :
 *   1) Compromis en cours : le nombre.
 *   2) Chiffre d'affaires : la PART de la société dans la commission (après répartition entre sociétés), AVANT les commissions versées.
 *      Pour une vente répartie, la répartition se fait sur la commission nette de l'apporteur ; la part de la société dans la commission
 *      entière est donc sa part nette + sa quote-part de la rétrocession (même proportion). L'historique : toute la commission à sa société.
 *   3) Commissions versées : les négociateurs (chaque commission à la société du négociateur sur cette vente ; à défaut, au prorata des
 *      parts) + les apporteurs (au prorata des parts).
 *   4) Solde net : CA HT − commissions versées HT (négatif : tel quel). Pour une vente répartie : part nette − commissions négociateurs.
 * Le CA global est la SOMME des deux sociétés (les parts extérieures, hors CA, n'y entrent pas) : rien n'est compté deux fois.
 */

export const UNITES: readonly Unite[] = ['ht', 'ttc'];
export const LIBELLE_UNITE: Record<Unite, string> = { ht: 'HT', ttc: 'TTC' };

/** Le montant en HT. PUR. */
export const enHt = (m: MontantSaisi): number => (m.unite === 'ht' ? m.montant : ht(m.montant));
/** Le montant en TTC. PUR. */
export const enTtc = (m: MontantSaisi): number => (m.unite === 'ttc' ? m.montant : m.montant * TVA);
/** L'équivalent dans l'autre unité (« 1 000 HT » → « 1 200 TTC »). PUR. */
export const autreUnite = (m: MontantSaisi): MontantSaisi => (m.unite === 'ht' ? { montant: enTtc(m), unite: 'ttc' } : { montant: enHt(m), unite: 'ht' });
export const estUnite = (x: unknown): x is Unite => x === 'ht' || x === 'ttc';

/** Le montant saisi d'une ligne de vente (son unité d'origine) ; null : sans montant. PUR. */
export function montantDeLigne(l: Pick<LigneVente, 'montantTtc' | 'montantHt'>): MontantSaisi | null {
  if (l.montantHt != null) return { montant: l.montantHt, unite: 'ht' };
  return l.montantTtc === null ? null : { montant: l.montantTtc, unite: 'ttc' };
}

/** La commission versée au négociateur d'un côté (saisie depuis le dossier) ; null : rien de saisi. PUR. */
export function commissionDuCote(v: Pick<Vente, 'lignes'>, cote: 'entree' | 'sortie'): { negociateur: string; montant: MontantSaisi } | null {
  const l = v.lignes.find((x) => x.role === 'negociateur' && x.cote === cote);
  const m = l === undefined ? null : montantDeLigne(l);
  return l === undefined || m === null ? null : { negociateur: l.negociateur, montant: m };
}

/** La rétrocession de l'apporteur saisie au dossier (son unité d'origine) ; null : aucune. PUR. */
export const retroApporteurDe = (v: Pick<Vente, 'retroApporteur'>): MontantSaisi | null => v.retroApporteur ?? null;

// ── La quote-part d'une société dans une vente ───────────────────────────────────────────────────────────────────────────

/**
 * La FRACTION de la commission d'une vente qui revient à une société (null : à nos deux sociétés réunies) — de 0 à 1.
 * Historique : 1 pour sa société. Répartie : sa part nette ÷ la commission nette (à commission nette nulle : la somme de ses %). PUR.
 */
export function fractionSociete(v: Pick<Vente, 'societe' | 'honorairesTtc' | 'repartition'>, societe: Societe | null): number {
  if (v.repartition == null) return societe === null || v.societe === societe ? 1 : 0;
  if (societe === null) return SOCIETES.reduce((t, s) => t + fractionSociete(v, s), 0);
  const net = commissionNetteHt(v.honorairesTtc, v.repartition.retroApporteurTtc);
  if (net !== 0) return caHt(v, societe) / net;
  return v.repartition.parties.reduce((t, p) => t + (p.societe === societe ? (p.pourcentage ?? 0) / 100 : 0), 0);
}

/** La société qui verse la commission d'une ligne « négociateur » : celle du négociateur sur cette vente ; null : inconnue. PUR. */
export function societeDeLigne(v: Pick<Vente, 'societe' | 'repartition'>, l: Pick<LigneVente, 'negociateur' | 'cote'>): Societe | null {
  if (v.repartition == null) return v.societe;
  const sortes = l.cote === 'entree' ? ['entree', 'entree_sortie'] : l.cote === 'sortie' ? ['sortie', 'entree_sortie'] : ['entree', 'sortie', 'entree_sortie'];
  const p = v.repartition.parties.find((x) => x.negociateur === l.negociateur && x.societe !== null && sortes.includes(x.sorte))
    ?? v.repartition.parties.find((x) => x.negociateur === l.negociateur && x.societe !== null);
  return p?.societe ?? null;
}

// ── Les 4 tuiles ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TuilesCompromis {
  nb: number;
  caHt: number;
  caTtc: number;
  /** La part de chaque société (HT), pour la mention « Part CRITERIMMO / MACJ ». */
  partHt: Record<Societe, number>;
  /** La commission entière des compromis comptés (HT), et les parts des parties extérieures (hors CA, HT, comme la répartition les montre). */
  commissionTotaleHt: number;
  exterieurHt: number;
  negociateursHt: number;
  apporteursHt: number;
  commissionsHt: number;
  commissionsTtc: number;
  soldeHt: number;
  soldeTtc: number;
}

type VenteTuile = Pick<Vente, 'statut' | 'societe' | 'honorairesTtc' | 'repartition' | 'lignes'> & Partial<Pick<Vente, 'retroApporteur' | 'annulation'>>;

/** Le CA, les commissions et le solde d'une vente pour une société (null : nos deux sociétés). PUR. */
function uneVente(v: VenteTuile, societe: Societe | null): { caHt: number; negociateursHt: number; apporteursHt: number } {
  const f = fractionSociete(v, societe);
  const retro = retroApporteurDe(v);
  // L'apporteur d'une vente répartie est DÉJÀ déduit de la commission nette : sa quote-part se lit sur la rétrocession comptée par la répartition.
  const retroHt = v.repartition != null ? ht(v.repartition.retroApporteurTtc) : retro === null ? 0 : enHt(retro);
  let negociateursHt = 0;
  for (const l of v.lignes) {
    if (l.role !== 'negociateur') continue;
    const m = montantDeLigne(l);
    if (m === null) continue;
    const s = societeDeLigne(v, l);
    const part = societe === null ? (s === null ? f : 1) : s === null ? f : s === societe ? 1 : 0;
    negociateursHt += enHt(m) * part;
  }
  return { caHt: ht(v.honorairesTtc) * f, negociateursHt, apporteursHt: retroHt * f };
}

/**
 * 🔴 LES 4 TUILES DE L'ONGLET « COMPROMIS », sur les compromis EN COURS (statut « compromis » : ni acte signé, ni annulés — un compromis
 * annulé est écarté même s'il est passé par erreur). `societe` null : CA global (CRITERIMMO + MACJ). PUR.
 */
export function tuilesCompromis(ventes: readonly VenteTuile[], societe: Societe | null): TuilesCompromis {
  const enCours = ventes.filter((v) => v.statut === 'compromis');
  const partHt = Object.fromEntries(SOCIETES.map((s) => [s, enCours.reduce((t, v) => t + uneVente(v, s).caHt, 0)])) as Record<Societe, number>;
  const sommes = enCours.map((v) => uneVente(v, societe));
  const caHtTotal = sommes.reduce((t, x) => t + x.caHt, 0);
  const negociateursHt = sommes.reduce((t, x) => t + x.negociateursHt, 0);
  const apporteursHt = sommes.reduce((t, x) => t + x.apporteursHt, 0);
  const commissionsHt = negociateursHt + apporteursHt;
  const soldeHt = caHtTotal - commissionsHt;
  return {
    nb: enCours.length, caHt: caHtTotal, caTtc: caHtTotal * TVA, partHt,
    commissionTotaleHt: enCours.reduce((t, v) => t + ht(v.honorairesTtc), 0),
    // Les parts extérieures telles que la répartition les montre (sur la commission nette de l'apporteur) — les mêmes nombres qu'avant.
    exterieurHt: enCours.reduce((t, v) => t + exterieurHt(v), 0),
    negociateursHt, apporteursHt, commissionsHt, commissionsTtc: commissionsHt * TVA, soldeHt, soldeTtc: soldeHt * TVA,
  };
}
