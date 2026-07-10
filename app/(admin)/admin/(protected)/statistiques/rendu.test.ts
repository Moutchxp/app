import { describe, it, expect } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StatistiquesPage from './page';
import { TuileCommunes, TuileVerdicts, TuileTrafic, TuileProvenance, Message } from './tuiles';
import type { Statistiques } from './affichage';

/**
 * M2 — LOT 5. Tests de RENDU via react-dom/server → HTML statique (sans jsdom : l'environnement node n'a
 * aucun outil de rendu de composant ; on utilise `createElement`, le fichier restant en `.test.ts`). On
 * prouve : le masquage k s'affiche TEL QUEL (jamais reconstitué), chaque état a son rendu, aucun bleu.
 */
const base: Statistiques = {
  fenetre: { debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' },
  k: 11,
  trafic: [],
  verdicts: { sans_vis_a_vis: 0, vis_a_vis: 0, indetermine: 0, total: 0 },
  analyses: { lancees: 0, resultats: 0 },
  entonnoir: [],
  communes: { visibles: [], masque: null },
  provenance: { par_source_medium: { visibles: [], masque: null }, par_referer: { visibles: [], masque: null } },
};
const rendus: string[] = [];
function html(node: ReactNode): string {
  const h = renderToStaticMarkup(node);
  rendus.push(h);
  return h;
}
const avec = (patch: Partial<Statistiques>) => ({ ...base, ...patch });

describe('masquage k — affiché tel quel, jamais reconstitué', () => {
  it('communes insuffisant → « Données insuffisantes », AUCUNE commune listée', () => {
    const h = html(createElement(TuileCommunes, { data: avec({ communes: { visibles: [], masque: null, insuffisant: true } }) }));
    expect(h).toMatch(/Données insuffisantes/);
    expect(h).not.toMatch(/Commune \d/);
  });
  it('communes visibles + masque → agrégat FOURNI (2 zones, total 13), jamais une commune masquée isolée', () => {
    const h = html(createElement(TuileCommunes, { data: avec({ communes: { visibles: [{ commune_insee: '92004', n: 50 }], masque: { nbCellules: 2, total: 13 } } }) }));
    expect(h).toMatch(/92004/);
    expect(h).toMatch(/2 zones masquées \(total 13\)/);
  });
});

describe('verdicts — % ou « échantillon faible »', () => {
  it('total < 30 → « Échantillon faible », comptes bruts', () => {
    const h = html(createElement(TuileVerdicts, { data: avec({ verdicts: { sans_vis_a_vis: 5, vis_a_vis: 2, indetermine: 1, total: 8 } }) }));
    expect(h).toMatch(/Échantillon faible/);
    expect(h).toMatch(/Sans vis-à-vis/);
  });
  it('total ≥ 30 → pourcentages', () => {
    const h = html(createElement(TuileVerdicts, { data: avec({ verdicts: { sans_vis_a_vis: 60, vis_a_vis: 30, indetermine: 10, total: 100 } }) }));
    expect(h).toMatch(/60/);
    expect(h).toMatch(/%/);
    expect(h).not.toMatch(/Échantillon faible/);
  });
});

describe('états — vide / masqué provenance / message', () => {
  it('trafic vide → « Aucune visite »', () => {
    expect(html(createElement(TuileTrafic, { data: base }))).toMatch(/Aucune visite/);
  });
  it('provenance insuffisante → « Données insuffisantes »', () => {
    const h = html(createElement(TuileProvenance, { data: avec({ provenance: { par_source_medium: { visibles: [], masque: null, insuffisant: true }, par_referer: { visibles: [], masque: null, insuffisant: true } } }) }));
    expect(h).toMatch(/Données insuffisantes/);
  });
  it('Message rend titre + texte', () => {
    expect(html(createElement(Message, { titre: 'Aucune donnée sur cette période', texte: 'Normal.' }))).toMatch(/Aucune donnée sur cette période/);
  });
});

describe('page — rendu initial (chargement) + rappel cron + sélecteur', () => {
  it('rend titre, rappel « maintenance », sélecteur et état chargement', () => {
    const h = html(createElement(StatistiquesPage)); // useEffect non exécuté en SSR → état initial « chargement »
    expect(h).toMatch(/Statistiques/);
    expect(h).toMatch(/Chargement/);
    expect(h).toMatch(/maintenance/);
    expect(h).toMatch(/7 jours/);
    expect(h).toMatch(/Par jour/);
  });
});

describe('aucun bleu — dans le HTML réellement produit', () => {
  it('aucun rendu ne contient de bleu', () => {
    expect(rendus.length).toBeGreaterThan(5);
    for (const h of rendus) expect(/blue|bleu/i.test(h), 'HTML sans bleu').toBe(false);
  });
});
