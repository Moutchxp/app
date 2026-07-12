import { describe, it, expect } from 'vitest';
import {
  construireUrl,
  jourParis,
  decalerJours,
  fenetreDefaut,
  preset,
  libelleMasque,
  partsVerdicts,
  entonnoirCumule,
  estVide,
  formatNombre,
  maxSerie,
  coordsSerie,
  polySerie,
  bulleRayon,
  joindreGeo,
  filtrerCommunesClient,
  ratioPct,
  couleurDominant,
  PLANCHER_N,
  type SeriePoint,
  type RefCommunes,
  type Statistiques,
  type VentilationSure,
} from './affichage';

describe('fenêtre & URL — le client ne fait que consommer l’API du Lot 4', () => {
  it('construireUrl encode debut/fin/grain', () => {
    expect(construireUrl({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' })).toBe(
      '/api/admin/statistiques?debut=2026-01-01&fin=2026-01-31&grain=jour',
    );
  });
  it('jourParis rend une date Europe/Paris (bascule du jour à minuit Paris)', () => {
    expect(jourParis(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01'); // 00:30 Paris
  });
  it('decalerJours est insensible au changement d’heure (UTC)', () => {
    expect(decalerJours('2026-03-28', 1)).toBe('2026-03-29'); // passage heure d'été FR : aucun décalage
    expect(decalerJours('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('fenetreDefaut = 30 derniers jours, preset 7j/90j corrects', () => {
    const f = fenetreDefaut(new Date('2026-07-10T12:00:00Z'));
    expect(f).toEqual({ debut: '2026-06-11', fin: '2026-07-10', grain: 'jour' });
    expect(preset('7j', 'jour', new Date('2026-07-10T12:00:00Z')).debut).toBe('2026-07-04');
    expect(preset('90j', 'semaine', new Date('2026-07-10T12:00:00Z')).grain).toBe('semaine');
  });
});

describe('masquage k — affiché tel quel, JAMAIS reconstitué', () => {
  it('insuffisant → « données insuffisantes », aucun chiffre', () => {
    const v: VentilationSure<{ n: number }> = { visibles: [], masque: null, insuffisant: true };
    const l = libelleMasque(v);
    expect(l).toMatch(/insuffisantes/i);
    expect(l).not.toMatch(/\d/); // AUCUN nombre : rien à reconstituer
  });
  it('masque agrégé (≥2 zones, ≥k) → affiche l’agrégat FOURNI par l’API, pas une soustraction', () => {
    const v: VentilationSure<{ n: number }> = { visibles: [{ n: 50 }], masque: { nbCellules: 2, total: 13 }, insuffisant: false };
    expect(libelleMasque(v)).toBe('2 zones masquées (total 13)'); // 13 = masque.total (donné), jamais total−visibles
  });
  it('rien de masqué → pas de libellé', () => {
    expect(libelleMasque({ visibles: [{ n: 20 }], masque: null })).toBeNull();
  });
  it('défense en profondeur : un groupe masqué à UNE seule zone → « données insuffisantes », jamais sa valeur', () => {
    // Ne peut pas arriver sous le contrat Lot 4 (≥2 zones sinon insuffisant), mais si ça arrivait, on ne
    // restitue PAS la valeur unique (ce serait la dé-anonymiser).
    const l = libelleMasque({ visibles: [], masque: { nbCellules: 1, total: 12 } });
    expect(l).toMatch(/insuffisantes/i);
    expect(l).not.toMatch(/12/);
  });
});

describe('verdicts — % ou « échantillon faible » (SPEC §4), sans recalcul des comptes', () => {
  it('sous le plancher (total < 30) → pas de %, on montre les comptes', () => {
    const r = partsVerdicts({ sans_vis_a_vis: 5, vis_a_vis: 2, indetermine: 1, total: 8 });
    expect(r.echantillonFaible).toBe(true);
    expect(r.parts.every((p) => p.pct === null)).toBe(true);
    expect(r.parts[0].n).toBe(5); // le compte reste celui de l'API
  });
  it('au-dessus du plancher → % arrondi', () => {
    const r = partsVerdicts({ sans_vis_a_vis: 60, vis_a_vis: 30, indetermine: 10, total: 100 });
    expect(r.echantillonFaible).toBe(false);
    expect(r.parts[0].pct).toBe(60);
    expect(r.parts[1].pct).toBe(30);
  });
  it('PLANCHER_N vaut 30 (seuil d’affichage, distinct de k)', () => {
    expect(PLANCHER_N).toBe(30);
  });
});

describe('entonnoir cumulé — dérivation d’affichage des agrégats fournis', () => {
  it('« a atteint au moins » = somme suffixe des « étape la plus loin »', () => {
    const pts = [
      { etape: 'intro', atteinte_max: 10 },
      { etape: 'photo', atteinte_max: 6 },
      { etape: 'resultat', atteinte_max: 4 },
    ];
    const f = entonnoirCumule(pts);
    expect(f[0].atteinte_min).toBe(20); // intro : 10+6+4
    expect(f[1].atteinte_min).toBe(10); // photo : 6+4
    expect(f[2].atteinte_min).toBe(4); //  resultat : 4
    expect(f[0].libelle).toBe('Arrivée');
  });
  it('l’étape « analyse » (jamais instrumentée séparément) est RETIRÉE de l’entonnoir affiché', () => {
    const pts = [
      { etape: 'infos_logement', atteinte_max: 10 },
      { etape: 'analyse', atteinte_max: 0 }, // toujours 0
      { etape: 'resultat', atteinte_max: 20 },
    ];
    const f = entonnoirCumule(pts);
    expect(f.map((p) => p.etape)).toEqual(['infos_logement', 'resultat']); // analyse absente
    expect(f[0].atteinte_min).toBe(30); // cumul inchangé (analyse=0 comptée dans le suffixe)
  });
});

describe('estVide — période sans données exploitable', () => {
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
  it('tout à zéro → vide', () => {
    expect(estVide(base)).toBe(true);
  });
  it('des analyses → non vide', () => {
    expect(estVide({ ...base, analyses: { lancees: 3, resultats: 2, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 } })).toBe(false);
  });
  it('un masquage (insuffisant) → NON vide (il y a des données, juste masquées)', () => {
    expect(estVide({ ...base, communes: { visibles: [], masque: null, insuffisant: true } })).toBe(false);
  });
});

describe('formatNombre — FR', () => {
  it('sépare les milliers', () => {
    expect(formatNombre(12345).replace(/\s/g, ' ')).toMatch(/12.345/);
  });
  it('valeur absente/non finie (skew de version) → « 0 », JAMAIS d’exception', () => {
    // Reproduit le crash : un `data.analyses` périmé (sans les compteurs Chantier A) passe `undefined` à un KPI.
    expect(() => formatNombre(undefined as unknown as number)).not.toThrow();
    expect(formatNombre(undefined as unknown as number)).toBe('0');
    expect(formatNombre(null as unknown as number)).toBe('0');
    expect(formatNombre(Number.NaN)).toBe('0');
    expect(formatNombre(0)).toBe('0'); // un vrai 0 reste 0
  });
});

describe('ratioPct — ratio d’affichage % avec garde division par zéro (Chantier A)', () => {
  it('calcule un % à 1 décimale', () => {
    expect(ratioPct(3, 12)).toBe(25); //     3/12 = 25.0 %
    expect(ratioPct(1, 3)).toBe(33.3); //    arrondi 1 décimale
    expect(ratioPct(7, 200)).toBe(3.5); //   estimations/visites typique
  });
  it('dénominateur 0 ou négatif → null (jamais NaN/Infinity ; l’appelant affiche « — »)', () => {
    expect(ratioPct(5, 0)).toBeNull(); //    des estimations, aucune visite compactée
    expect(ratioPct(0, 0)).toBeNull();
    expect(ratioPct(3, -1)).toBeNull();
  });
  it('numérateur non fini → null (robustesse)', () => {
    expect(ratioPct(Number.NaN, 10)).toBeNull();
    expect(ratioPct(Number.POSITIVE_INFINITY, 10)).toBeNull();
  });
  it('numérateur 0 avec dénominateur positif → 0 %, pas null', () => {
    expect(ratioPct(0, 42)).toBe(0);
  });
});

describe('Chantier B — filtrerCommunesClient : filtre d’AFFICHAGE sur données déjà k-safe (aucun serveur)', () => {
  const cells = [
    { commune_insee: '92004', n: 40, dominant: 'SANS_VIS_A_VIS' as const },
    { commune_insee: '93001', n: 30, dominant: 'VIS_A_VIS' as const },
    { commune_insee: '75056', n: 20, dominant: null },
  ];
  it('sans filtre → tout passe (identique)', () => {
    expect(filtrerCommunesClient(cells, {}).map((c) => c.commune_insee)).toEqual(['92004', '93001', '75056']);
  });
  it('verdict → garde les communes dont le DOMINANT matche (jamais les neutres)', () => {
    expect(filtrerCommunesClient(cells, { verdict: 'SANS_VIS_A_VIS' }).map((c) => c.commune_insee)).toEqual(['92004']);
    expect(filtrerCommunesClient(cells, { verdict: 'VIS_A_VIS' }).map((c) => c.commune_insee)).toEqual(['93001']);
  });
  it('departement → préfixe INSEE (communes ENTIÈRES)', () => {
    expect(filtrerCommunesClient(cells, { departement: '9' }).map((c) => c.commune_insee)).toEqual(['92004', '93001']);
    expect(filtrerCommunesClient(cells, { departement: '75' }).map((c) => c.commune_insee)).toEqual(['75056']);
  });
  it('verdict + departement combinés', () => {
    expect(filtrerCommunesClient(cells, { verdict: 'VIS_A_VIS', departement: '93' }).map((c) => c.commune_insee)).toEqual(['93001']);
  });
});

describe('Chantier B — couleurDominant : k-safe → couleur, sinon NEUTRE, AUCUN bleu', () => {
  it('mappe chaque verdict + null/undefined → gris clair neutre', () => {
    expect(couleurDominant('SANS_VIS_A_VIS')).toBe('var(--color-svv-red)');
    expect(couleurDominant('VIS_A_VIS')).toBe('var(--color-svv-ink)');
    expect(couleurDominant('INDETERMINE')).toBe('var(--color-svv-muted)');
    expect(couleurDominant(null)).toBe('#c9c9c9'); //      indéterminable sous k → neutre
    expect(couleurDominant(undefined)).toBe('#c9c9c9');
  });
  it('aucune couleur n’est bleue', () => {
    for (const d of ['SANS_VIS_A_VIS', 'VIS_A_VIS', 'INDETERMINE', null] as const) {
      expect(/blue|bleu|#0{0,4}f{1,4}\b|#0000ff/i.test(couleurDominant(d))).toBe(false);
    }
  });
});

describe('Chantier B — joindreGeo transporte le dominant (jamais recalculé côté client)', () => {
  const ref = { '92004': { nom: 'Asnières', centroid: [2.28, 48.91] as [number, number] } };
  it('reprend le dominant fourni par le serveur', () => {
    const g = joindreGeo([{ commune_insee: '92004', n: 12, dominant: 'SANS_VIS_A_VIS' }], ref);
    expect(g[0].dominant).toBe('SANS_VIS_A_VIS');
  });
  it('dominant absent → null (bulle neutre)', () => {
    const g = joindreGeo([{ commune_insee: '92004', n: 12 }], ref);
    expect(g[0].dominant).toBeNull();
  });
});

describe('Lot 6 — série temporelle (helpers PURS, testables sans rendu)', () => {
  const serie: SeriePoint[] = [
    { bucket: '2026-01-01', visites: 4, analysesLancees: 2, resultats: 1, sans: 1, vis: 0, ind: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 },
    { bucket: '2026-01-02', visites: 8, analysesLancees: 3, resultats: 2, sans: 1, vis: 1, ind: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 },
  ];
  it('maxSerie = max des métriques demandées, plancher 1 (anti division par 0)', () => {
    expect(maxSerie(serie, ['visites'])).toBe(8);
    expect(maxSerie(serie, ['sans', 'vis', 'ind'])).toBe(1);
    expect(maxSerie([], ['visites'])).toBe(1);
  });
  it('coordsSerie : x réparti, y INVERSÉ et borné au cadre ; série vide → []', () => {
    const c = coordsSerie(serie, 'visites', 8, 100, 50);
    expect(c[0]).toEqual({ x: 0, y: 25 }); // visites 4/8 → mi-hauteur (y inversé)
    expect(c[1]).toEqual({ x: 100, y: 0 }); // visites 8/8 = max → haut du cadre
    expect(coordsSerie([], 'visites', 8, 100, 50)).toEqual([]);
  });
  it('coordsSerie à 1 SEUL point → centré horizontalement (x = largeur/2), pas collé au bord', () => {
    const un: SeriePoint[] = [{ bucket: '2026-01-01', visites: 3, analysesLancees: 0, resultats: 0, sans: 0, vis: 0, ind: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 }];
    expect(coordsSerie(un, 'visites', 3, 100, 50)).toEqual([{ x: 50, y: 0 }]); // 1 point → milieu ; 3/3 = max → haut
  });
  it('polySerie dérive la même géométrie sous forme de chaîne "x,y …"', () => {
    expect(polySerie(serie, 'visites', 8, 100, 50)).toBe('0.0,25.0 100.0,0.0');
  });
  it('construireUrl encode `commune` si fournie, l’omet sinon (le client ne fait que consommer l’API)', () => {
    expect(construireUrl({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' })).not.toMatch(/commune/);
    expect(construireUrl({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' }, '92004')).toMatch(/[?&]commune=92004/);
  });
});

describe('Lot 6 — carte communale (helpers PURS)', () => {
  it('bulleRayon : échelle RACINE (aire ∝ n) bornée [min, plafond]', () => {
    expect(bulleRayon(0, 10)).toBe(6); // n=0 → rayon minimal
    expect(bulleRayon(10, 10)).toBe(26); // n=max → plafond
    expect(bulleRayon(2.5, 10)).toBeCloseTo(16, 5); // √(0.25)=0.5 → 6 + 20·0.5
  });
  it('joindreGeo ne trace QUE les communes VISIBLES ayant un centroïde connu (jamais « au hasard »)', () => {
    const ref: RefCommunes = { '92004': { nom: 'Asnières-sur-Seine', centroid: [2.28, 48.91] } };
    const out = joindreGeo([{ commune_insee: '92004', n: 5 }, { commune_insee: '99999', n: 3 }], ref);
    expect(out).toEqual([{ commune_insee: '92004', n: 5, nom: 'Asnières-sur-Seine', lon: 2.28, lat: 48.91, dominant: null }]);
  });
});
