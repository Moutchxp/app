import { describe, it, expect } from 'vitest';
import {
  repereDepuisIndex, indexDepuisRepere, couleurRepere, PALETTE_REPERE,
  geomDepuisGeoJSON, construireSchema, cadreDe, unionCadre, optionsPourCorps, polygonesNonAffectes, corpsDuPolygone,
  recopierCote, cotesEnNombres, niveauSurlignement, etatSurlignement,
  type CorpsAffectation, type PolygoneAffectable, type PolygoneEntreeSchema,
} from './affectationSchema';

/** FUS-3d — schéma SVG (projection déterministe) + exclusivité/cardinalités de l'affectation, purs et testés. */

describe('repereDepuisIndex', () => {
  it('A, B, … Z puis AA', () => {
    expect([0, 1, 25, 26, 27].map(repereDepuisIndex)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });
});

describe('L2 — palette des repères (couleurRepere / indexDepuisRepere)', () => {
  it('indexDepuisRepere est l’inverse exact de repereDepuisIndex ; entrée invalide → -1', () => {
    for (let i = 0; i < 40; i++) expect(indexDepuisRepere(repereDepuisIndex(i))).toBe(i);
    expect(indexDepuisRepere('')).toBe(-1);
    expect(indexDepuisRepere('a1')).toBe(-1);
  });

  it('DÉTERMINISME : même repère → même couleur (jamais tirée au hasard ni dépendante d’une requête)', () => {
    expect(couleurRepere(indexDepuisRepere('A'))).toBe(couleurRepere(indexDepuisRepere('A')));
    expect(couleurRepere(0)).toBe(PALETTE_REPERE[0]);   // A stable d'une session à l'autre
    expect(couleurRepere(2)).toBe(PALETTE_REPERE[2]);   // C stable
  });

  it('AUCUNE couleur n’est blanche, ni un rouge franc (rouge RÉSERVÉ au lot L5)', () => {
    for (const c of PALETTE_REPERE) {
      const hex = c.toLowerCase();
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      expect(r > 240 && g > 240 && b > 240).toBe(false); // pas de blanc / quasi-blanc
      expect(r > 200 && g < 80 && b < 80).toBe(false);   // pas de rouge franc (réservé L5)
    }
  });

  it('cas RÉEL 16 polygones (07512024V0037) → 16 couleurs distinctes, voisins jamais identiques', () => {
    const couleurs = Array.from({ length: 16 }, (_, i) => couleurRepere(i));
    expect(new Set(couleurs).size).toBe(16);                 // toutes distinctes
    for (let i = 1; i < couleurs.length; i++) expect(couleurs[i]).not.toBe(couleurs[i - 1]); // voisins ≠
  });

  it('au-delà de la palette : répétition PROPRE (modulo), jamais une couleur hors palette ; index invalide → teinte non blanche', () => {
    const n = PALETTE_REPERE.length;
    expect(couleurRepere(n)).toBe(PALETTE_REPERE[0]);
    expect(couleurRepere(n + 1)).toBe(PALETTE_REPERE[1]);
    expect(couleurRepere(-1)).toBe(PALETTE_REPERE[n - 1]); // repère non reconnu → dernière teinte (jamais blanc)
    expect(PALETTE_REPERE).toContain(couleurRepere(999));
  });
});

describe('geomDepuisGeoJSON', () => {
  it('Polygon → anneau extérieur ; MultiPolygon → un anneau par polygone ; autre → vide', () => {
    expect(geomDepuisGeoJSON({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }).anneaux).toHaveLength(1);
    expect(geomDepuisGeoJSON({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] }).anneaux).toHaveLength(2);
    expect(geomDepuisGeoJSON({ type: 'LineString', coordinates: [] }).anneaux).toEqual([]);
    expect(geomDepuisGeoJSON(null).anneaux).toEqual([]);
  });
});

const carre = (x0: number, y0: number, c: number): PolygoneEntreeSchema['geom'] => ({ anneaux: [[[x0, y0], [x0 + c, y0], [x0 + c, y0 + c], [x0, y0 + c], [x0, y0]]] });

describe('construireSchema', () => {
  it('empreinte absente → motif explicite, rien dessiné (jamais au hasard)', () => {
    const s = construireSchema(null, []);
    expect(s.empreintePath).toBeNull();
    expect(s.motif).toMatch(/parcelle du permis incomplète ou absente/);
  });

  it('2 polygones dans l’empreinte → 2 chemins projetés, étiquetés, dans la boîte', () => {
    const emp = carre(1000, 2000, 100);
    const s = construireSchema(emp, [
      { repere: 'A', cleabs: 'BAT_A', geom: carre(1010, 2010, 30), horsEmpreinte: false },
      { repere: 'B', cleabs: 'BAT_B', geom: carre(1060, 2060, 30), horsEmpreinte: false },
    ]);
    expect(s.motif).toBeNull();
    expect(s.empreintePath).toContain('M');
    expect(s.polygones.map((p) => p.repere)).toEqual(['A', 'B']);
    for (const p of s.polygones) {
      expect(p.path).toContain('Z');
      expect(p.cx).toBeGreaterThanOrEqual(0); expect(p.cx).toBeLessThanOrEqual(s.largeur);
      expect(p.cy).toBeGreaterThanOrEqual(0); expect(p.cy).toBeLessThanOrEqual(s.hauteur);
    }
  });

  it('polygone hors empreinte → dessiné mais signalé', () => {
    const s = construireSchema(carre(0, 0, 100), [{ repere: 'A', cleabs: 'X', geom: carre(200, 200, 20), horsEmpreinte: true }]);
    expect(s.polygones[0].horsEmpreinte).toBe(true);
  });
});

describe('L5 — cadrage COMMUN (cadreDe / unionCadre / construireSchema avec cadre)', () => {
  const empEntree = (geom: PolygoneEntreeSchema['geom'], hors = false): PolygoneEntreeSchema => ({ repere: 'A', cleabs: 'X', geom, horsEmpreinte: hors });

  it('cadreDe = bbox des points ; unionCadre = enveloppe des deux ; null-safe', () => {
    const emp = carre(0, 0, 100);
    const c1 = cadreDe(emp, []);
    expect(c1).toEqual({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    const c2 = cadreDe(emp, [empEntree(carre(150, 150, 20), true)]);
    expect(c2).toEqual({ minX: 0, maxX: 170, minY: 0, maxY: 170 });
    expect(unionCadre(c1, c2)).toEqual({ minX: 0, maxX: 170, minY: 0, maxY: 170 });
    expect(unionCadre(null, c1)).toEqual(c1);
    expect(unionCadre(c1, null)).toEqual(c1);
    expect(cadreDe(null, [])).toBeNull();
  });

  it('MÊME cadre → MÊME échelle/cadrage : l’empreinte COMMUNE se projette à l’identique dans les deux schémas', () => {
    const emp = carre(0, 0, 100);                       // empreinte partagée (frozen)
    const polyDeborde = [empEntree(carre(120, 120, 40), true)]; // un polygone neuf qui DÉBORDE → bbox plus grande sans cadre commun
    const cadre = unionCadre(cadreDe(emp, []), cadreDe(emp, polyDeborde));
    const sOrigine = construireSchema(emp, [], 320, 240, 12, cadre);
    const sNouvelle = construireSchema(emp, polyDeborde, 320, 240, 12, cadre);
    expect(sOrigine.empreintePath).toBe(sNouvelle.empreintePath); // comparaison HONNÊTE : mêmes formes, même échelle
    // sans cadre commun, l'empreinte se projetterait différemment (l'œil comparerait des formes qui ne se correspondent pas)
    const sLibre = construireSchema(emp, [], 320, 240, 12);
    expect(sLibre.empreintePath).not.toBe(sNouvelle.empreintePath);
  });
});

const corps = (over: Partial<CorpsAffectation>): CorpsAffectation => ({ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: [], ...over });
const polys: PolygoneAffectable[] = [
  { repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false },
  { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false },
];

describe('exclusivité / cardinalités', () => {
  it('un polygone affecté à un AUTRE corps disparaît des choix ; le sien reste proposé (réversibilité)', () => {
    const c = [corps({ id: 1, cleabsAffectes: ['BAT_A'] }), corps({ id: 2, cleabsAffectes: [] })];
    expect(optionsPourCorps(c, polys, 2).map((p) => p.repere)).toEqual(['B']);        // A pris par le corps 1
    expect(optionsPourCorps(c, polys, 1).map((p) => p.repere)).toEqual(['A', 'B']);    // le corps 1 garde A (modifiable)
  });

  it('polygones NON affectés signalés (cardinalités inégales : 2 corps, 1 polygone)', () => {
    const c = [corps({ id: 1, cleabsAffectes: ['BAT_A'] }), corps({ id: 2, cleabsAffectes: [] })];
    expect(polygonesNonAffectes(c, polys).map((p) => p.repere)).toEqual(['B']);        // B reste libre
    expect(corpsDuPolygone(c, 'BAT_A')?.id).toBe(1);
    expect(corpsDuPolygone(c, 'BAT_B')).toBeNull();
  });
});

describe('M3 — cotes par polygone (recopierCote / cotesEnNombres, purs)', () => {
  it('recopierCote pousse la valeur sur les cibles UNIQUEMENT, sans toucher aux autres cleabs', () => {
    const avant = { BAT_A: '90', BAT_B: '80', BAT_X: '10' };
    const apres = recopierCote(avant, ['BAT_A', 'BAT_B'], '90');
    expect(apres).toEqual({ BAT_A: '90', BAT_B: '90', BAT_X: '10' }); // BAT_X (hors cibles) intact
    expect(avant.BAT_B).toBe('80'); // immuable : l'entrée n'est pas mutée
  });

  it('cotesEnNombres : vide/blanc → null (non injecté) ; sinon Number ; jamais de propagation', () => {
    expect(cotesEnNombres({ BAT_A: '88.9', BAT_B: '', BAT_C: '  ', BAT_D: '80' }))
      .toEqual({ BAT_A: 88.9, BAT_B: null, BAT_C: null, BAT_D: 80 });
    // pas d'arrondi : la valeur brute est conservée
    expect(cotesEnNombres({ BAT_A: '88.907' }).BAT_A).toBe(88.907);
  });
});

describe('M7 — niveauSurlignement (pur)', () => {
  it('« mis en avant » PRIME sur le halo (coché/affecté ou survol/focus)', () => {
    expect(niveauSurlignement({ estMisEnAvant: true, affecte: true, actif: true })).toBe('mis-en-avant');
    expect(niveauSurlignement({ estMisEnAvant: true, affecte: false, actif: false })).toBe('mis-en-avant');
  });
  it('halo si affecté OU actif (et pas mis en avant)', () => {
    expect(niveauSurlignement({ estMisEnAvant: false, affecte: true, actif: false })).toBe('halo');
    expect(niveauSurlignement({ estMisEnAvant: false, affecte: false, actif: true })).toBe('halo');
  });
  it('aucun surlignement sinon', () => {
    expect(niveauSurlignement({ estMisEnAvant: false, affecte: false, actif: false })).toBe('aucun');
  });
});

describe('M7-bis — etatSurlignement (pur : atténuation des autres)', () => {
  it('le mis-en-avant N’EST PAS en retrait (opacité pleine) et garde son niveau', () => {
    expect(etatSurlignement({ estMisEnAvant: true, ilYaMiseEnAvant: true, affecte: true, actif: false }))
      .toEqual({ niveau: 'mis-en-avant', enRetrait: false });
  });
  it('quand un AUTRE est mis en avant, ce polygone passe EN RETRAIT (même affecté)', () => {
    expect(etatSurlignement({ estMisEnAvant: false, ilYaMiseEnAvant: true, affecte: true, actif: false }))
      .toEqual({ niveau: 'halo', enRetrait: true });
  });
  it('aucun champ focalisé (pas de mise en avant) → PERSONNE en retrait (rendu M6/M7 inchangé)', () => {
    expect(etatSurlignement({ estMisEnAvant: false, ilYaMiseEnAvant: false, affecte: true, actif: false }))
      .toEqual({ niveau: 'halo', enRetrait: false });
    expect(etatSurlignement({ estMisEnAvant: false, ilYaMiseEnAvant: false, affecte: false, actif: false }))
      .toEqual({ niveau: 'aucun', enRetrait: false });
  });
});
