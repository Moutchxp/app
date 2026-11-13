/**
 * ══ 🔴 LOT AM (Arno, 29/10/2026) — LE FORMAT UNIQUE DES NOMBRES DE LA TUILE « TRANSACTION » (PUR) ════════════════════════════════════════
 * Intl fr-FR sépare les milliers par une espace FINE insécable (U+202F), quasi invisible dans la police de l'application : « 87960 € ».
 * Ici, et nulle part ailleurs, elle devient une espace insécable de largeur normale (U+00A0) : « 87 960 € ». L'unité (€, %) est collée
 * par la même espace insécable : un montant ne se coupe jamais en fin de ligne. Aucun calcul : l'affichage seul.
 * 🔴 LOT AN — pas de « ,00 » : un montant entier s'affiche sans décimales ; de vrais centimes, toujours avec deux chiffres.
 */

/** L'espace insécable de largeur normale (U+00A0). */
export const ESPACE = '\u00a0';
/** 🔴 La confidentialité des salaires — le mot écrit à la place d'un montant inconnu (voir `confidentialiteSalaires.ts`). */
export const MOT_CONFIDENTIEL = 'confidentiel';

/** Un nombre en français, milliers séparés par une espace insécable visible (jamais l'espace fine U+202F). PUR. */
export const nombreFr = (x: number, options?: Intl.NumberFormatOptions): string => x.toLocaleString('fr-FR', options).replace(/[\u202f\u2009\u00a0 ]/g, ESPACE);

/**
 * 🔴 LOT AN — un montant au centime, SANS « ,00 » : entier, sans décimales (« 7 500 ») ; avec de vrais centimes, toujours deux chiffres
 * (« 2 708,34 », « 1 000,50 »). L'arrondi au centime est celui de l'affichage (règle du lot AH). PUR.
 */
export function montantFr(x: number): string {
  // 🔴 Arno (13/11/2026) — un montant INCONNU (un salaire confidentiel, ou un total qui en dépend) : « confidentiel », jamais « 0 » ni « NaN »
  if (Number.isNaN(x)) return MOT_CONFIDENTIEL;
  // 🔴 LOT CG1 — un montant nul s'écrit « 0 », jamais « −0 » (−0,004 arrondi au centime : −0, que `toLocaleString` écrit « -0 »)
  const c = centimesAffiches(x);
  const entier = c % 100 === 0;
  return nombreFr(c / 100, entier ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 🔴 LOT CG1 — les centimes affichés d'un montant (l'arrondi de l'affichage) ; un nul est toujours +0, jamais −0. PUR. */
export const centimesAffiches = (x: number): number => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) || 0;

/** Un montant en euros : « 7 500 € », « 2 708,34 € ». PUR. */
export const eur = (x: number): string => (Number.isNaN(x) ? MOT_CONFIDENTIEL : `${montantFr(x)}${ESPACE}€`);

/** Un pourcentage (jusqu'à `decimales` décimales, 4 par défaut) : « 33,3333 % ». PUR. */
export const pctFr = (x: number, decimales = 4): string => `${nombreFr(x, { maximumFractionDigits: decimales })}${ESPACE}%`;

/**
 * Une saisie de montant mise en forme à la sortie du champ, selon la règle de l'affichage : milliers séparés (« 7500 » → « 7 500 ») ;
 * des décimales nulles disparaissent (« 7500,00 » → « 7 500 ») ; un seul chiffre de centimes en prend deux (« 1625,5 » → « 1 625,50 »).
 * La VALEUR ne change jamais (aucun arrondi : « 2708,333 » reste tel quel) ; ce qui n'est pas un nombre reste tel quel. PUR.
 */
export function grouperSaisie(texte: string): string {
  const t = texte.replace(/[\s\u202f\u00a0]/g, '');
  const m = /^(-?)(\d+)(?:[.,](\d*))?$/.exec(t);
  if (m === null) return texte;
  const dec = m[3] ?? '';
  const decimales = /^0*$/.test(dec) ? '' : dec.length === 1 ? `,${dec}0` : `,${dec}`;
  return `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE)}${decimales}`;
}

/** Un montant (nombre) écrit dans un champ de saisie, au centime, selon la même règle (« 7 500 », « 2 708,34 »). PUR. */
export const texteSaisie = (x: number): string => montantFr(x);
