import { describe, it, expect, vi } from 'vitest';
import {
  construireEtatSources,
  resumeCouverture,
  ageEnJours,
  texteReingestion,
  etatDetection,
  CATALOGUE,
  DEPARTEMENTS,
  type LectureSource,
  type LectureDetection,
} from './sourcesFraicheur';

const meta = (cle: string) => CATALOGUE.find((m) => m.cle === cle)!;
const det = (o: Partial<LectureDetection> = {}): LectureDetection =>
  ({ source: 'x', actif: true, verifieLe: '2026-08-22T09:00:00Z', succes: true, dernierSuccesLe: '2026-08-22T09:00:00Z', editionDistante: null, dateDistante: null, motif: null, ...o });

/**
 * FRAÎCHEUR DES DONNÉES — modèle PUR. Vérifie les RÈGLES D'HONNÊTETÉ : ordre imposé (LiDAR en tête), millésime inconnu +
 * aucune réingestion pour le LiDAR, source vide dite explicitement, âge CALCULÉ (jamais figé), couverture reflétant le
 * contenu réel (prouvé en modifiant une fixture), et aucun appel réseau.
 */

const MAINTENANT = new Date('2026-08-23T09:00:00Z');

/** Fixture proche de la réalité du 22/08, mais dont on modifie librement les valeurs dans les tests. */
function lecturesReference(): LectureSource[] {
  return [
    { cle: 'lidar', millesime: null, substitut: 'millésime inconnu — 64 dalles MNT + 64 MNS', dateReference: null, vide: false, partielsParDept: ['92'] },
    { cle: 'bdtopo_bati', millesime: '2026-06-15', substitut: null, dateReference: '2026-06-15', vide: false, comptesParDept: { '75': 1, '77': 1, '78': 1, '92': 1, '93': 1, '94': 1 } },
    { cle: 'bdtopo_adresse', millesime: null, substitut: 'aucun millésime — dernière modification : 2026-03-20', dateReference: '2026-03-20', vide: false, comptesParDept: { '75': 120368, '92': 169484 } },
    { cle: 'cadastre', millesime: '2026-06-01', substitut: null, dateReference: '2026-06-01', vide: false, comptesParDept: { '75': 78154, '78': 670017, '92': 161859, '93': 232874 } },
    { cle: 'sitadel', millesime: '2026-07', substitut: null, dateReference: '2026-07-01', vide: false, comptesParDept: { '75': 4706, '78': 11731, '92': 5782, '93': 7816 } },
    { cle: 'dila', millesime: '2026-08-03', substitut: null, dateReference: '2026-08-03', vide: false },
    { cle: 'prada', millesime: '2026-07', substitut: null, dateReference: '2026-07-01', vide: false },
    { cle: 'bdnb', millesime: null, substitut: 'aucun millésime en base — 191262 lignes (année de construction)', dateReference: null, vide: false },
  ];
}

describe('construireEtatSources — ordre imposé', () => {
  it('rend UNE ligne par source, dans l’ordre du catalogue (LiDAR en tête)', () => {
    const lignes = construireEtatSources(lecturesReference(), MAINTENANT);
    expect(lignes.map((l) => l.cle)).toEqual([
      'lidar', 'bdtopo_bati', 'bdtopo_adresse', 'cadastre', 'sitadel', 'dila', 'prada', 'bdnb',
    ]);
    expect(lignes).toHaveLength(CATALOGUE.length);
    expect(lignes[0].nom).toBe('LiDAR HD');
  });
});

describe('RÈGLE D’HONNÊTETÉ — le LiDAR ne ment pas', () => {
  it('LiDAR → « millésime inconnu » (substitut, pas un millésime) ET « aucune procédure de réingestion »', () => {
    const lidar = construireEtatSources(lecturesReference(), MAINTENANT).find((l) => l.cle === 'lidar')!;
    expect(lidar.millesimeAffiche).toContain('millésime inconnu');
    expect(lidar.estSubstitut).toBe(true);
    expect(texteReingestion(lidar.reingestion)).toBe('aucune procédure de réingestion');
    expect(lidar.surveillance).toBe(false);
    expect(lidar.ageJours).toBeNull(); // aucune date → âge inconnu, jamais « à jour »
  });
});

describe('RÈGLE D’HONNÊTETÉ — une source vide le dit', () => {
  it('source sans donnée → « aucune donnée en base », âge nul, couverture toute absente', () => {
    const lectures = lecturesReference().map((l) => (l.cle === 'lidar' ? { ...l, vide: true, partielsParDept: [] } : l));
    const lidar = construireEtatSources(lectures, MAINTENANT).find((l) => l.cle === 'lidar')!;
    expect(lidar.vide).toBe(true);
    expect(lidar.millesimeAffiche).toBe('aucune donnée en base');
    expect(lidar.ageJours).toBeNull();
    expect(Object.values(lidar.couverture!).every((c) => c === 'absent')).toBe(true);
  });

  it('source absente des relevés → indisponible (lecture impossible, distinct de vide)', () => {
    const sansSitadel = lecturesReference().filter((l) => l.cle !== 'sitadel');
    const sitadel = construireEtatSources(sansSitadel, MAINTENANT).find((l) => l.cle === 'sitadel')!;
    expect(sitadel.vide).toBe(true);
    expect(sitadel.indisponible).toBe(false); // absent des relevés → traité comme vide, pas comme erreur de lecture
  });
});

describe('L’âge est CALCULÉ, pas codé en dur', () => {
  it('ageEnJours dérive de la date de référence et de « maintenant »', () => {
    expect(ageEnJours('2026-06-15', MAINTENANT)).toBe(69);
    expect(ageEnJours('2026-08-03', MAINTENANT)).toBe(20);
    expect(ageEnJours(null, MAINTENANT)).toBeNull();
  });
  it('même source, deux « maintenant » différents → deux âges différents (rien de figé)', () => {
    const bdtopo = (m: Date) => construireEtatSources(lecturesReference(), m).find((l) => l.cle === 'bdtopo_bati')!.ageJours;
    expect(bdtopo(new Date('2026-06-15T00:00:00Z'))).toBe(0);
    expect(bdtopo(new Date('2026-07-15T00:00:00Z'))).toBe(30);
  });
});

describe('COUVERTURE — reflète le contenu réel de la base (prouvé par fixture)', () => {
  it('cadastre présent là où il y a des parcelles, absent ailleurs ; LiDAR partiel sur le 92', () => {
    const lignes = construireEtatSources(lecturesReference(), MAINTENANT);
    const cad = lignes.find((l) => l.cle === 'cadastre')!.couverture!;
    expect(cad['75']).toBe('present');
    expect(cad['93']).toBe('present');
    expect(cad['77']).toBe('absent');
    expect(cad['94']).toBe('absent');
    const lidar = lignes.find((l) => l.cle === 'lidar')!.couverture!;
    expect(lidar['92']).toBe('partiel');
    expect(lidar['75']).toBe('absent');
  });

  it('MODIFIER la fixture (retirer le 93 du cadastre) → la couverture du 93 passe à absent', () => {
    const lectures = lecturesReference().map((l) =>
      l.cle === 'cadastre' ? { ...l, comptesParDept: { '75': 78154, '78': 670017, '92': 161859 } } : l,
    );
    const cad = construireEtatSources(lectures, MAINTENANT).find((l) => l.cle === 'cadastre')!.couverture!;
    expect(cad['93']).toBe('absent'); // avant modif : « present » — la couverture suit le contenu, pas un codage en dur
    expect(cad['75']).toBe('present');
  });

  it('les sources NON spatiales n’ont pas de couverture', () => {
    const lignes = construireEtatSources(lecturesReference(), MAINTENANT);
    expect(lignes.find((l) => l.cle === 'dila')!.couverture).toBeUndefined();
    expect(lignes.find((l) => l.cle === 'bdnb')!.couverture).toBeUndefined();
  });
});

describe('resumeCouverture — pour la ligne de contexte', () => {
  it('extrait les départements couverts par le LiDAR (verdict) et par le bâti', () => {
    const r = resumeCouverture(construireEtatSources(lecturesReference(), MAINTENANT));
    expect(r.departementsLidar).toEqual(['92']);
    expect(r.departementsBati).toEqual(['75', '77', '78', '92', '93', '94']);
  });
});

describe('etatDetection (lot 2) — états et règle d’honnêteté', () => {
  it('source NON détectable (LiDAR) → non_verifiable + motif explicite', () => {
    const e = etatDetection(meta('lidar'), null, undefined, MAINTENANT);
    expect(e.statut).toBe('non_verifiable');
    if (e.statut === 'non_verifiable') expect(e.motif).toMatch(/passage unique|rien à comparer/i);
  });
  it('détectable mais jamais vérifiée → jamais_verifie', () => {
    expect(etatDetection(meta('cadastre'), '2026-06-01', undefined, MAINTENANT).statut).toBe('jamais_verifie');
  });
  it('réglage désactivé → desactive', () => {
    expect(etatDetection(meta('cadastre'), '2026-06-01', det({ actif: false }), MAINTENANT).statut).toBe('desactive');
  });
  it('ÉCHEC → « échec depuis N j », JAMAIS « à jour » (règle d’honnêteté)', () => {
    const e = etatDetection(meta('cadastre'), '2026-06-01', det({ succes: false, verifieLe: '2026-08-23T09:00:00Z', dernierSuccesLe: '2026-08-13T09:00:00Z', motif: 'HTTP 500' }), MAINTENANT);
    expect(e.statut).toBe('echec');
    expect(e.statut).not.toBe('a_jour');
    if (e.statut === 'echec') expect(e.depuisJours).toBe(10); // depuis le dernier succès (13/08 → 23/08)
  });
  it('édition distante = édition locale → a_jour', () => {
    expect(etatDetection(meta('cadastre'), '2026-06-01', det({ editionDistante: '2026-06-01', dateDistante: '2026-06-01' }), MAINTENANT).statut).toBe('a_jour');
  });
  it('édition distante PLUS RÉCENTE que le local → mise_a_jour avec le millésime distant', () => {
    const e = etatDetection(meta('bdtopo_adresse'), '2026-03-20', det({ editionDistante: '2026-06-15', dateDistante: '2026-06-15' }), MAINTENANT);
    expect(e.statut).toBe('mise_a_jour');
    if (e.statut === 'mise_a_jour') expect(e.editionDistante).toBe('2026-06-15');
  });
  it('construireEtatSources fusionne la détection par source', () => {
    const detections: LectureDetection[] = [det({ source: 'cadastre', editionDistante: '2026-06-01', dateDistante: '2026-06-01' })];
    const cad = construireEtatSources(lecturesReference(), MAINTENANT, detections).find((l) => l.cle === 'cadastre')!;
    expect(cad.detection?.statut).toBe('a_jour');
    // Sans relevé fourni pour le LiDAR → non_verifiable (non détectable par nature).
    const lidar = construireEtatSources(lecturesReference(), MAINTENANT, detections).find((l) => l.cle === 'lidar')!;
    expect(lidar.detection?.statut).toBe('non_verifiable');
  });
});

describe('AUCUN appel réseau (test négatif)', () => {
  it('le modèle ne touche jamais fetch', () => {
    const espion = vi.fn(() => { throw new Error('réseau interdit'); });
    const original = globalThis.fetch;
    globalThis.fetch = espion as unknown as typeof fetch;
    try {
      const lignes = construireEtatSources(lecturesReference(), MAINTENANT);
      resumeCouverture(lignes);
      for (const d of DEPARTEMENTS) expect(typeof d).toBe('string');
    } finally {
      globalThis.fetch = original;
    }
    expect(espion).not.toHaveBeenCalled();
  });
});
