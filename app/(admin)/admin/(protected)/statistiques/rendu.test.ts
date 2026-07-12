import { describe, it, expect } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StatistiquesPage from './page';
import { TuileCommunes, TuileVerdicts, TuileTrafic, TuileProvenance, TuileAnalyses, Message, SerieTemporelle } from './tuiles';
import type { Statistiques, FiltreCommune } from './affichage';

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
  analyses: { lancees: 0, resultats: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 },
  entonnoir: [],
  communes: { visibles: [], masque: null },
  provenance: { par_source_medium: { visibles: [], masque: null }, par_referer: { visibles: [], masque: null } },
  serie: [],
  filtreCommune: null,
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
    const h = html(
      createElement(TuileCommunes, {
        data: avec({ communes: { visibles: [], masque: null, insuffisant: true } }),
        refGeo: null,
        selection: null,
        onSelect: () => {},
        reducedMotion: false,
        filtres: {},
        onFiltres: () => {},
      }),
    );
    expect(h).toMatch(/Données insuffisantes/);
    expect(h).not.toMatch(/Commune \d/);
  });
  it('communes visibles + masque → COMPTE de communes masquées, jamais une commune isolée ni localisée', () => {
    const h = html(
      createElement(TuileCommunes, {
        data: avec({ communes: { visibles: [{ commune_insee: '92004', n: 50 }], masque: { nbCellules: 2, total: 13 } } }),
        refGeo: null, // sans référentiel → pas de carte Leaflet (node), liste seule : le label retombe sur « Commune 92004 »
        selection: null,
        onSelect: () => {},
        reducedMotion: false,
        filtres: {},
        onFiltres: () => {},
      }),
    );
    expect(h).toMatch(/92004/);
    expect(h).toMatch(/2 commune\(s\) masquée\(s\)/); // Chantier B : COMPTE seul (jamais nommées ni localisées)
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

describe('Lot 6 — série temporelle (SVG maison, 0 dépendance)', () => {
  const serie = [
    { bucket: '2026-01-01', visites: 4, analysesLancees: 2, resultats: 1, sans: 1, vis: 0, ind: 0, certificats: 1, plusvalue: 1, estimationImmo: 0, totalEstimations: 1 },
    { bucket: '2026-01-02', visites: 8, analysesLancees: 3, resultats: 2, sans: 1, vis: 1, ind: 0, certificats: 0, plusvalue: 1, estimationImmo: 1, totalEstimations: 2 },
  ];
  it('titre, chips de bascule et courbe SVG réellement produits', () => {
    const h = html(createElement(SerieTemporelle, { serie }));
    expect(h).toMatch(/Activité dans le temps/);
    expect(h).toMatch(/<svg/);
    expect(h).toMatch(/<polyline/); // courbe maison, aucune lib de charts
    expect(h).toMatch(/Visites/);
  });
  it('série vide → message clair, jamais d’erreur', () => {
    expect(html(createElement(SerieTemporelle, { serie: [] }))).toMatch(/Aucune activité compactée/);
  });
});

describe('Lot 6 — verdicts scopés commune (k-safe, jamais reconstitués)', () => {
  it('insuffisant → « données insuffisantes », aucun détail de verdict, total commune (≥k) montrable', () => {
    const filtre: FiltreCommune = { commune: '92004', verdicts: { visibles: [], masque: null, insuffisant: true } };
    const h = html(createElement(TuileVerdicts, { data: base, filtre, nomCommune: 'Asnières-sur-Seine', resultatsCommune: 14 }));
    expect(h).toMatch(/Asnières-sur-Seine/);
    expect(h).toMatch(/insuffisantes/i);
  });
  it('cellules visibles affichées telles quelles (comptes bruts k-safe), jamais un %', () => {
    const filtre: FiltreCommune = {
      commune: '92004',
      verdicts: { visibles: [{ verdict: 'SANS_VIS_A_VIS', n: 20 }, { verdict: 'VIS_A_VIS', n: 15 }], masque: null },
    };
    const h = html(createElement(TuileVerdicts, { data: base, filtre, nomCommune: 'Asnières', resultatsCommune: 35 }));
    expect(h).toMatch(/Sans vis-à-vis/);
    expect(h).toMatch(/20/);
    expect(h).not.toMatch(/%/); // scope k-safe = comptes bruts, jamais un pourcentage recalculé
  });
});

describe('Lot 6 — XOR : filtre commune actif grise les métriques non ventilables (jamais filtrées en silence)', () => {
  it('Provenance grisée porte la note « non filtrable par commune (anti-fingerprint) »', () => {
    const h = html(
      createElement(TuileProvenance, {
        data: base,
        voile: 'Provenance : non filtrable par commune (anti-fingerprint). Chiffres globaux.',
      }),
    );
    expect(h).toMatch(/non filtrable par commune/);
    expect(h).toMatch(/anti-fingerprint/);
  });
});

describe('Lot 6 — carte client-only (dynamic ssr:false), jamais montée au SSR', () => {
  it('TuileCommunes + référentiel → nom résolu, liste rendue, AUCUN leaflet-container dans le HTML SSR', () => {
    const ref = { '92004': { nom: 'Asnières-sur-Seine', centroid: [2.28, 48.91] as [number, number] } };
    const h = html(
      createElement(TuileCommunes, {
        data: avec({ communes: { visibles: [{ commune_insee: '92004', n: 40 }], masque: null } }),
        refGeo: ref,
        selection: null,
        onSelect: () => {},
        reducedMotion: false,
        filtres: {},
        onFiltres: () => {},
      }),
    );
    expect(h).toMatch(/Asnières-sur-Seine/); // nom résolu depuis le référentiel géo (pas « Commune 92004 »)
    expect(h).not.toMatch(/leaflet-container/); // Leaflet non évalué au SSR (dynamic ssr:false) → aucun crash window
  });
});

describe('Chantier A — TuileAnalyses : KPI conversions robustes (jamais de crash de page)', () => {
  it('fenêtre sans certificat/plus-value/estimation → KPI rendus à 0, aucune exception', () => {
    const h = html(createElement(TuileAnalyses, { data: base })); // analyses tout à 0, trafic vide
    expect(h).toMatch(/certificats demandés/);
    expect(h).toMatch(/estimations \(total\)/);
    expect(h).toMatch(/—/); // ratios « — » (0 visite → division par zéro gardée), jamais NaN/Infinity
  });
  it('RÉGRESSION skew : un data.analyses PÉRIMÉ (sans les champs Chantier A) NE crashe PAS', () => {
    // Repro exacte du bug : réponse d'AVANT le Chantier A gardée en state (bundle client plus récent) → analyses
    // n'a que lancees/resultats, les 4 nouveaux compteurs sont undefined. AVANT le fix, formatNombre(undefined)
    // levait « Cannot read properties of undefined (reading 'toLocaleString') » et plantait toute la page.
    const skew = { ...base, analyses: { lancees: 2, resultats: 1 } as unknown as Statistiques['analyses'] };
    expect(() => html(createElement(TuileAnalyses, { data: skew }))).not.toThrow();
  });
});

describe('Chantier B — TuileCommunes : barre de filtres (client) + légende + note masquage (SSR)', () => {
  const ref = { '92004': { nom: 'Asnières-sur-Seine', centroid: [2.28, 48.91] as [number, number] } };
  it('rend chips « Verdict dominant » + sélecteurs Département/Commune + légende des couleurs (pas de filtre score)', () => {
    const h = html(
      createElement(TuileCommunes, {
        data: avec({ communes: { visibles: [{ commune_insee: '92004', n: 40, dominant: 'SANS_VIS_A_VIS' }], masque: null } }),
        refGeo: ref,
        selection: null,
        onSelect: () => {},
        reducedMotion: false,
        filtres: {},
        onFiltres: () => {},
      }),
    );
    expect(h).toMatch(/Verdict dominant/);
    expect(h).toMatch(/Sans vis-à-vis/);
    expect(h).toMatch(/Département/);
    expect(h).toMatch(/domine/); //   légende des couleurs de bulle (verdict dominant)
    expect(h).not.toMatch(/Score/); // le filtre score a été RETIRÉ (anti-différenciation)
  });
  it('masque serveur présent → note ROUGE « N communes masquées sur la période », compte SANS identité ni localisation', () => {
    const h = html(
      createElement(TuileCommunes, {
        data: avec({ communes: { visibles: [{ commune_insee: '92004', n: 40, dominant: 'SANS_VIS_A_VIS' }], masque: { nbCellules: 3, total: 20 } } }),
        refGeo: ref,
        selection: null,
        onSelect: () => {},
        reducedMotion: false,
        filtres: {},
        onFiltres: () => {},
      }),
    );
    expect(h).toMatch(/3 commune\(s\) masquée\(s\) sur la période/); // COMPTE seul, période (masquage serveur, pas le filtre client)
  });
});

describe('aucun bleu — dans le HTML réellement produit', () => {
  it('aucun rendu ne contient de bleu', () => {
    expect(rendus.length).toBeGreaterThan(5);
    for (const h of rendus) expect(/blue|bleu/i.test(h), 'HTML sans bleu').toBe(false);
  });
});
