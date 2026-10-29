/**
 * ══ 🔴 LOT AM (Arno, 29/10/2026) — LE FORMAT UNIQUE DES NOMBRES DE LA TUILE « TRANSACTION » (PUR) ════════════════════════════════════════
 * Intl fr-FR sépare les milliers par une espace FINE insécable (U+202F), quasi invisible dans la police de l'application : « 87960,00 € ».
 * Ici, et nulle part ailleurs, elle devient une espace insécable de largeur normale (U+00A0) : « 87 960,00 € ». L'unité (€, %) est collée
 * par la même espace insécable : un montant ne se coupe jamais en fin de ligne. Aucun calcul : l'affichage seul.
 */

/** L'espace insécable de largeur normale (U+00A0). */
export const ESPACE = ' ';

/** Un nombre en français, milliers séparés par une espace insécable visible. PUR. */
export const nombreFr = (x: number, options?: Intl.NumberFormatOptions): string => x.toLocaleString('fr-FR', options).replace(/[    ]/g, ESPACE);

/** Un montant en euros, au centime : « 7 500,00 € ». PUR. */
export const eur = (x: number): string => `${nombreFr(x, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ESPACE}€`;

/** Un pourcentage (jusqu'à `decimales` décimales, 4 par défaut) : « 33,3333 % ». PUR. */
export const pctFr = (x: number, decimales = 4): string => `${nombreFr(x, { maximumFractionDigits: decimales })}${ESPACE}%`;

/**
 * Une saisie de montant regroupée par milliers à la sortie du champ (« 7500,5 » → « 7 500,5 ») : les chiffres tapés, eux, ne changent
 * pas (ni arrondi, ni décimale ajoutée) ; ce qui n'est pas un nombre reste tel quel. La lecture (`nombre`) ignore les espaces. PUR.
 */
export function grouperSaisie(texte: string): string {
  const t = texte.replace(/[\s  ]/g, '');
  const m = /^(-?)(\d+)([.,]\d*)?$/.exec(t);
  if (m === null) return texte;
  return `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE)}${(m[3] ?? '').replace('.', ',')}`;
}
