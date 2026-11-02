/**
 * ══ 🔴 MON ESPACE, LOT 8 (Arno, 02/11/2026) — LE CUMUL D'UNE SÉRIE, UNE SEULE FOIS ═════════════════════════════════════════════════════════════════
 * Le cumul mois par mois (ou année par année) des graphiques « Cumul » : la somme courante, dans l'ordre. Il était RECOPIÉ dans cinq écrans du Suivi
 * CA (EcransTransaction, GrapheGlobal, GrapheNegociateurs, EcranLocationCA, EcranFusionLG) ; il vit ici, à l'identique (mêmes additions, même
 * ordre : les montants ne changent pas d'un centime), et « Mon espace » l'utilise aussi. PUR.
 */
export const cumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);
