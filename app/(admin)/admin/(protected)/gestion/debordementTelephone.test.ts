import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 Arno (16/11/2026, lot B) — au téléphone (390 px), la page Syndics et la fiche du bien ne dépassent plus la largeur de l'écran : les boutons
 * d'en-tête trop longs passent à la ligne ou se replient ; aucun n'est retiré, masqué ni conditionné (mesuré au Chrome du Mac : largeur de page
 * = 390 px sur la page Syndics, la fiche du bien de la Gestion et celle de la Location).
 */
const lire = (f: string): string => readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\s+/g, ' ');
const ICI = 'app/(admin)/admin/(protected)/gestion';

describe('plus de défilement de côté à 390 px', () => {
  it('en-tête des pages : les actions passent sous le titre, un bouton long revient à la ligne', () => {
    const css = lire('app/globals.css');
    expect(css).toContain('@media (max-width:600px){ .svv-page-head-ligne{flex-wrap:wrap} .svv-page-actions{flex-shrink:1;min-width:0;max-width:100%;margin-bottom:.5rem}');
    expect(css).toContain('.svv-page-actions .svv-btn{max-width:100%;white-space:normal;overflow-wrap:anywhere;height:auto;text-align:center}');
  });
  it('boutons de la Gestion (« Relever maintenant », « Rafraîchir », « Annuaire », « À rattacher ») : à la ligne', () => {
    expect(lire(`${ICI}/GestionVue.tsx`)).toContain('@media (max-width:600px){.gst-actions{flex-shrink:1;min-width:0;max-width:100%}}');
  });
  it('fiche du bien : le bouton du dossier Drive revient à la ligne ; aucun bouton retiré', () => {
    const src = lire(`${ICI}/Annuaire.tsx`);
    expect(src).toContain('.ann-tete-actions .gst-btn{flex-shrink:1;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:center}');
    expect(src).not.toMatch(/\.ann-tete-actions[^{]*\{[^}]*display:none/);
  });
});
