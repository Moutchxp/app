import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { formaterDate, Chip, DetailContenu } from './page';

describe('formaterDate (M3-4 Lot E)', () => {
  it('null → « jamais »', () => {
    expect(formaterDate(null)).toBe('jamais');
  });
  it('ISO invalide → « jamais »', () => {
    expect(formaterDate('pas-une-date')).toBe('jamais');
  });
  it('ISO valide → format fr lisible, jamais l’ISO brut', () => {
    const s = formaterDate('2026-07-09T22:31:35.591Z');
    expect(s).toMatch(/^\d{1,2} \S+ 2026, \d{2}:\d{2}$/); // « 9 juillet 2026, 22:31 » (heure locale)
    expect(s).not.toContain('T');
    expect(s).not.toContain('Z');
  });
});

describe('Chip — pastille accessible (ARIA, état par forme)', () => {
  it('cochée → aria-pressed="true" + indicateur ✓', () => {
    const html = renderToStaticMarkup(createElement(Chip, { libelle: 'Curation', coche: true }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('✓');
    expect(html).toContain('Curation');
  });
  it('décochée → aria-pressed="false" + pas de ✓', () => {
    const html = renderToStaticMarkup(createElement(Chip, { libelle: 'Curation', coche: false }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('✓');
  });
  it('désactivée (cas administrateur) → attribut disabled', () => {
    const html = renderToStaticMarkup(createElement(Chip, { libelle: 'Pilotage', coche: true, disabled: true }));
    expect(html).toContain('disabled');
  });
});

const compteCollab = {
  id: 5, identifiant: 'lea@unique.test', prenom: 'Léa', nom: 'M', role: 'collaborateur' as const, actif: true,
  perms: { pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: true, banc_test: false },
  derniere_connexion_a: '2026-07-09T22:31:35.591Z', doit_changer_mot_de_passe: false,
};
const noop = () => {};

describe('DetailContenu — identité affichée UNE seule fois, date formatée', () => {
  it('l’identifiant n’apparaît qu’une fois dans le rendu du détail', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: compteCollab, perms: compteCollab.perms, collaborateur: true, msg: null, enCours: false,
      onToggle: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    expect((html.match(/lea@unique\.test/g) ?? []).length).toBe(1);
    expect(html).not.toContain('2026-07-09T22:31'); // date formatée, pas l’ISO
    expect(html).toContain('Fermer');
  });

  it('cas administrateur → 6 pastilles forcées cochées et désactivées', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: { ...compteCollab, role: 'administrateur' as const }, perms: compteCollab.perms, collaborateur: false,
      msg: null, enCours: false, onToggle: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(6);
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});

describe('Aucune couleur bleue dans la page (charte : pas de bleu)', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/comptes/page.tsx', 'utf8');
  it('aucune valeur/classe bleue en dur', () => {
    expect(src).not.toMatch(/blue/i);
    expect(src).not.toMatch(/#0000ff|#00f\b|rgb\(\s*0\s*,\s*0\s*,\s*255/i);
  });
  it('le focus est explicitement stylé (anneau rouge) — le bleu par défaut du navigateur est neutralisé', () => {
    expect(src).toContain('focus-visible');
    expect(src).toContain('outline:2px solid var(--color-svv-red)');
  });
});
