'use client';

import type { ClipboardEvent, InputHTMLAttributes } from 'react';
import { filtrerSaisieNombre, gardesAvant, MOTIF_COLLAGE_REFUSE, nombreColle } from '../../../../lib/location/saisieNombre';

/**
 * ══ 🔴 Arno (25/10/2026) — LE CHAMP NUMÉRIQUE PARTAGÉ DE LOCATION (montants, taux, surfaces, nombres, indices) ════════════════════════
 * UN seul composant, utilisé partout : à la frappe, seuls les chiffres, UN séparateur (virgule ou point, montré en virgule) et les
 * espaces de milliers passent — le reste est ignoré, sans message ; les décimales sont bornées (`decimales` : 2 par défaut, 3 pour un
 * indice, 0 pour un nombre entier). Le collage est filtré de même ; sans aucun chiffre, il est refusé par une bulle courte du
 * navigateur (« Collage refusé : aucun nombre à coller. »), qui ne décale rien. `onChange` reçoit l'événement d'origine, dont la
 * valeur est DÉJÀ filtrée : les écrans hôtes ne changent pas (ils lisent `e.target.value`). Le serveur contrôle toujours la valeur.
 */
export function ChampNombre({ decimales = 2, onChange, onPaste, onInput, ...props }: InputHTMLAttributes<HTMLInputElement> & { decimales?: number }) {
  const filtrer = (el: HTMLInputElement): void => {
    const brut = el.value;
    const garde = filtrerSaisieNombre(brut, decimales);
    if (garde === brut) return;
    const curseur = el.selectionStart ?? brut.length;
    el.value = garde;
    const pos = gardesAvant(brut, curseur, decimales);
    try { el.setSelectionRange(pos, pos); } catch { /* un champ hors document : sans curseur */ }
  };
  return (
    <input inputMode={decimales === 0 ? 'numeric' : 'decimal'} autoComplete="off" {...props} data-champ-nombre={decimales}
      onInput={(e) => { e.currentTarget.setCustomValidity(''); onInput?.(e); }}
      onChange={(e) => { filtrer(e.target); onChange?.(e); }}
      onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        const el = e.currentTarget;
        const texte = e.clipboardData.getData('text');
        e.preventDefault();
        const n = nombreColle(texte, decimales);
        if (n === null) {
          el.setCustomValidity(MOTIF_COLLAGE_REFUSE);
          el.dataset.collageRefuse = MOTIF_COLLAGE_REFUSE;
          el.reportValidity();
          return;
        }
        delete el.dataset.collageRefuse;
        const debut = el.selectionStart ?? el.value.length;
        const fin = el.selectionEnd ?? el.value.length;
        const avant = el.value.slice(0, debut);
        const nouveau = avant + n + el.value.slice(fin);
        // Insère par le chemin de la frappe (le setter natif + un événement « input ») : React voit un changement ordinaire.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, nouveau);
        try { el.setSelectionRange(avant.length + n.length, avant.length + n.length); } catch { /* sans curseur */ }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }} />
  );
}
