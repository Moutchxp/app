import { describe, it, expect } from 'vitest';
import {
  scoreFamille2,
  type EntreeFamille2,
  type TypePaysage,
  type MonumentRemarquable,
} from './scorePaysage';

function entree(over: Partial<EntreeFamille2> = {}): EntreeFamille2 {
  return {
    photoExploitable: true,
    typeDominant: null,
    monument: null,
    facadesHistoriquesMajoritaires: false,
    murAveugle: false,
    antennesParabolesPremierPlan: false,
    fouillis: false,
    batimentResidentielHautAxe: false,
    carrefourOuCimetiereCentral: false,
    batimentHautParabolesAxe: false,
    ...over,
  };
}

const monument = (over: Partial<MonumentRemarquable> = {}): MonumentRemarquable => ({
  zone: 'central',
  visiblePlusDeMoitie: true,
  ligneDeVueDegagee: true,
  ...over,
});

describe('scoreFamille2 — type dominant (25 pts)', () => {
  const cas: Array<[TypePaysage, number]> = [
    ['mer_panoramique', 25],
    ['fleuve_lac', 22],
    ['nature_parc', 20],
    ['espaces_verts', 16],
    ['urbain_harmonieux', 12],
    ['urbain_standard', 8],
    ['urbain_dense', 4],
  ];
  for (const [type, pts] of cas) {
    it(`${type} → ${pts}`, () => {
      expect(scoreFamille2(entree({ typeDominant: type })).typeDominant).toBe(pts);
    });
  }

  it('null → 0', () => {
    expect(scoreFamille2(entree({ typeDominant: null })).typeDominant).toBe(0);
  });
});

describe('scoreFamille2 — remarquables (15 pts, non cumulatif)', () => {
  it('central + ≥ moitié → 15', () => {
    const r = scoreFamille2(entree({ monument: monument({ zone: 'central', visiblePlusDeMoitie: true }) }));
    expect(r.remarquables).toBe(15);
    expect(r.detail.remarquablesSource).toBe('monument');
  });

  it('central + < moitié → 10', () => {
    expect(
      scoreFamille2(entree({ monument: monument({ zone: 'central', visiblePlusDeMoitie: false }) }))
        .remarquables,
    ).toBe(10);
  });

  it('extrémité + ≥ moitié → 10', () => {
    expect(
      scoreFamille2(entree({ monument: monument({ zone: 'extremite', visiblePlusDeMoitie: true }) }))
        .remarquables,
    ).toBe(10);
  });

  it('extrémité + < moitié → 7', () => {
    expect(
      scoreFamille2(entree({ monument: monument({ zone: 'extremite', visiblePlusDeMoitie: false }) }))
        .remarquables,
    ).toBe(7);
  });

  it('monument sans LOS dégagée → ignoré (0)', () => {
    const r = scoreFamille2(entree({ monument: monument({ ligneDeVueDegagee: false }) }));
    expect(r.remarquables).toBe(0);
    expect(r.detail.remarquablesSource).toBe('aucun');
  });

  it('façades seules → 10', () => {
    const r = scoreFamille2(entree({ facadesHistoriquesMajoritaires: true }));
    expect(r.remarquables).toBe(10);
    expect(r.detail.remarquablesSource).toBe('facades');
  });

  it('non cumulatif : monument 15 + façades 10 → 15 (monument gagne)', () => {
    const r = scoreFamille2(
      entree({ monument: monument(), facadesHistoriquesMajoritaires: true }),
    );
    expect(r.remarquables).toBe(15);
    expect(r.detail.remarquablesSource).toBe('monument');
  });

  it('rien → 0', () => {
    const r = scoreFamille2(entree());
    expect(r.remarquables).toBe(0);
    expect(r.detail.remarquablesSource).toBe('aucun');
  });
});

describe('scoreFamille2 — propreté (10 pts, plancher 0)', () => {
  it('aucun malus → 10', () => {
    expect(scoreFamille2(entree()).proprete).toBe(10);
  });

  const malusSeuls: Array<[Partial<EntreeFamille2>, number, number]> = [
    [{ murAveugle: true }, 4, 6],
    [{ antennesParabolesPremierPlan: true }, 3, 7],
    [{ fouillis: true }, 3, 7],
    [{ batimentHautParabolesAxe: true }, 3, 7],
    [{ batimentResidentielHautAxe: true }, 3, 7],
    [{ carrefourOuCimetiereCentral: true }, 3, 7],
  ];
  for (const [flag, malus, attendu] of malusSeuls) {
    it(`${Object.keys(flag)[0]} seul → −${malus} → ${attendu}`, () => {
      const r = scoreFamille2(entree(flag));
      expect(r.proprete).toBe(attendu);
      expect(r.detail.malusPropreteApplique).toBe(malus);
    });
  }

  it('empilement qui dépasse 10 → plancher 0', () => {
    const r = scoreFamille2(
      entree({
        murAveugle: true, // 4
        antennesParabolesPremierPlan: true, // 3
        fouillis: true, // 3
        batimentResidentielHautAxe: true, // 3
      }),
    );
    expect(r.detail.malusPropreteApplique).toBe(13);
    expect(r.proprete).toBe(0);
  });
});

describe('scoreFamille2 — photo inexploitable', () => {
  it('neutralise type & remarquables & malus photo, garde malus data', () => {
    const r = scoreFamille2(
      entree({
        photoExploitable: false,
        typeDominant: 'mer_panoramique', // ignoré
        monument: monument(), // ignoré
        facadesHistoriquesMajoritaires: true, // ignoré
        murAveugle: true, // malus photo ignoré
        batimentResidentielHautAxe: true, // malus data appliqué (−3)
      }),
    );
    expect(r.typeDominant).toBe(0);
    expect(r.remarquables).toBe(0);
    expect(r.proprete).toBe(7); // 10 − 3 (data), malus photo non appliqué
    expect(r.detail.malusPropreteApplique).toBe(3);
    expect(r.scorePartiel).toBe(true);
    expect(r.total).toBe(7);
  });
});

describe('scoreFamille2 — cas additionnés', () => {
  it('cas max réaliste : mer + monument central ≥ moitié + aucun malus → 50/50', () => {
    const r = scoreFamille2(
      entree({ typeDominant: 'mer_panoramique', monument: monument() }),
    );
    expect(r.typeDominant).toBe(25);
    expect(r.remarquables).toBe(15);
    expect(r.proprete).toBe(10);
    expect(r.total).toBe(50);
    expect(r.scorePartiel).toBe(false);
  });

  it('cas complet : urbain harmonieux + façades + fouillis + carrefour → 12+10+4', () => {
    const r = scoreFamille2(
      entree({
        typeDominant: 'urbain_harmonieux', // 12
        facadesHistoriquesMajoritaires: true, // remarquables 10
        fouillis: true, // −3 (photo)
        carrefourOuCimetiereCentral: true, // −3 (data)
      }),
    );
    expect(r.typeDominant).toBe(12);
    expect(r.remarquables).toBe(10);
    expect(r.proprete).toBe(4); // 10 − 6
    expect(r.total).toBe(26);
  });
});
