import { describe, it, expect } from 'vitest';
import {
  categorieDuBien, MOTS_CAVE, MOTS_PARKING, ORDRE_CATEGORIES, resumeDesLots, resumeParCategorie,
  type CategorieBien,
} from './categorieBien';

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA CATÉGORIE D'UN LOT, ET LE RÉSUMÉ DE LA CASE VERTE ═══════════════════
 *
 * ARNO (01/10/2026) : « PARKING = parking, garage, box, stationnement ; CAVE = cave, cellier ; LOGEMENT = tout le
 * reste (appartement, maison, studio, local, bureau, commerce…). […] “1 logement”, “1 logement + 1 parking”,
 * “1 logement + 3 parkings”, “3 parkings”, “2 logements + 1 cave”, “1 logement + 2 parkings + 1 cave”. »
 */
const c = (nature: string | null, typeBien: string | null = null): CategorieBien =>
  categorieDuBien({ nature, typeBien });

/**
 * ══ 🔴🔴 TOUTES LES NATURES PRÉSENTES EN BASE LE 01/10/2026, AVEC LEUR CATÉGORIE ═══════════════════════════════
 *
 * Arno demande la liste pour la vérifier. Elle est ÉPROUVÉE ici, pas seulement écrite dans un rapport : le jour
 * où quelqu'un déplace « Local commercial » vers les parkings, c'est ce tableau qui le dira.
 *
 * Relevé exact (365 lots) : Appartement 186 · Appartement meublé 133 · Parking 16 · Local commercial 14 ·
 * Garage 10 · Box 3 · A renseigner 2 · Maison 1.
 */
describe('🔴🔴 ① les natures RÉELLEMENT présentes en base, une par une', () => {
  const RELEVE: { nature: string; lots: number; attendu: CategorieBien }[] = [
    { nature: 'Appartement', lots: 186, attendu: 'logement' },
    { nature: 'Appartement meublé', lots: 133, attendu: 'logement' },
    { nature: 'Parking', lots: 16, attendu: 'parking' },
    { nature: 'Local commercial', lots: 14, attendu: 'logement' },
    { nature: 'Garage', lots: 10, attendu: 'parking' },
    { nature: 'Box', lots: 3, attendu: 'parking' },
    { nature: 'A renseigner', lots: 2, attendu: 'logement' },
    { nature: 'Maison', lots: 1, attendu: 'logement' },
  ];

  for (const r of RELEVE) {
    it(`« ${r.nature} » (${r.lots} lots) ⇒ ${r.attendu}`, () => {
      expect(c(r.nature)).toBe(r.attendu);
    });
  }

  /** ⚠️ LE RELEVÉ EST COMPLET : 365 lots, c'est le compte de la base au jour du lot. */
  it('⚠️ le relevé couvre les 365 lots de la base', () => {
    expect(RELEVE.reduce((n, r) => n + r.lots, 0)).toBe(365);
  });

  /**
   * 🔴 « A renseigner » TOMBE DANS LOGEMENT, et c'est la règle d'Arno (« tout le reste »). On ne fabrique pas une
   * quatrième catégorie « indéterminé » : elle ferait douter du classement pour deux lots qui se réparent à
   * l'import. C'est le seul point du relevé qui mérite son arbitrage.
   */
  it('🔴 « A renseigner » n’invente pas de quatrième catégorie', () => {
    expect(ORDRE_CATEGORIES).toEqual(['logement', 'parking', 'cave']);
    expect(c('A renseigner')).toBe('logement');
  });
});

describe('🔴 ② la règle, au-delà du relevé du jour', () => {
  it('🔴 les quatre mots d’Arno font un parking, quelle que soit la graphie', () => {
    for (const n of ['Parking', 'PARKING', 'Garage', 'box', 'Box fermé', 'Place de stationnement', 'Stationnement']) {
      expect(c(n), n).toBe('parking');
    }
    expect(MOTS_PARKING).toEqual(['parking', 'garage', 'box', 'stationnement']);
  });

  it('🔴 « cave » et « cellier » font une cave', () => {
    for (const n of ['Cave', 'CAVE', 'Cellier', 'Cave voûtée']) expect(c(n), n).toBe('cave');
    expect(MOTS_CAVE).toEqual(['cave', 'cellier']);
  });

  it('🔴 tout le reste est un logement', () => {
    for (const n of ['Appartement', 'Maison', 'Studio', 'Local commercial', 'Bureau', 'Commerce', 'Loft']) {
      expect(c(n), n).toBe('logement');
    }
  });

  /**
   * 🔴🔴 LE TYPE N'EST LU QUE SI LA NATURE NE DIT RIEN. Mesuré en base : 12 lots portent nature « Parking » ET
   * type « Garage » — le type AFFINE la nature. Mais rien n'interdit l'inverse un jour, et un type qui
   * l'emporterait sur une nature renseignée reclasserait un appartement en parking sur un mot de trop.
   */
  it('🔴🔴 une nature renseignée l’emporte TOUJOURS sur le type', () => {
    expect(c('Appartement', 'Garage')).toBe('logement');
    expect(c('Parking', 'Garage')).toBe('parking');
    expect(c('Box', 'Garage')).toBe('parking');
  });

  it('⚠️ nature vide : le type prend le relais', () => {
    expect(c(null, 'Garage')).toBe('parking');
    expect(c('', 'Cave')).toBe('cave');
    expect(c('   ', 'Type 2')).toBe('logement');
  });

  it('⚠️ rien du tout ⇒ logement, jamais « inconnu »', () => {
    expect(c(null, null)).toBe('logement');
    expect(categorieDuBien({})).toBe('logement');
  });

  /**
   * 🔴 UN MOT ENTIER, PAS UN MORCEAU. « Boxe » n'est pas « box », et « Cavendish » n'est pas « cave » : une
   * recherche par sous-chaîne classerait un jour un logement dans les caves sur une syllabe.
   */
  it('🔴 la comparaison porte sur le MOT entier', () => {
    expect(c('Boxe')).toBe('logement');
    expect(c('Cavendish')).toBe('logement');
    expect(c('Box-garage')).toBe('parking'); // …mais le trait d'union sépare bien deux mots
  });
});

/**
 * ══ 🔴🔴 ③ LE RÉSUMÉ — LES SIX EXEMPLES D'ARNO, MOT POUR MOT ═══════════════════════════════════════════════════
 */
describe('🔴🔴 ③ le résumé de la case verte', () => {
  const r = (...cats: CategorieBien[]) => resumeParCategorie(cats.map((x) => ({ categorie: x })));

  it('🔴 « 1 logement »', () => { expect(r('logement')).toBe('1 logement'); });
  it('🔴 « 1 logement + 1 parking »', () => {
    expect(r('logement', 'parking')).toBe('1 logement + 1 parking');
  });
  it('🔴 « 1 logement + 3 parkings »', () => {
    expect(r('logement', 'parking', 'parking', 'parking')).toBe('1 logement + 3 parkings');
  });
  it('🔴 « 3 parkings »', () => {
    expect(r('parking', 'parking', 'parking')).toBe('3 parkings');
  });
  it('🔴 « 2 logements + 1 cave »', () => {
    expect(r('logement', 'logement', 'cave')).toBe('2 logements + 1 cave');
  });
  it('🔴 « 1 logement + 2 parkings + 1 cave »', () => {
    expect(r('logement', 'parking', 'parking', 'cave')).toBe('1 logement + 2 parkings + 1 cave');
  });

  /** 🔴 L'ORDRE EST FIXE : logement, parking, cave — quel que soit l'ordre dans lequel on a coché. */
  it('🔴 l’ordre ne dépend pas de celui des cases cochées', () => {
    expect(r('cave', 'parking', 'logement')).toBe('1 logement + 1 parking + 1 cave');
    expect(r('parking', 'logement')).toBe('1 logement + 1 parking');
  });

  /** ⚠️ ON N'ÉCRIT PAS LES ZÉROS : l'absence dit mieux que « 0 parking ». */
  it('⚠️ une catégorie vide ne s’écrit pas', () => {
    expect(r('logement')).not.toContain('parking');
    expect(r('parking')).not.toContain('logement');
  });

  it('⚠️ aucun bien ⇒ « aucun bien », jamais une ligne vide', () => {
    expect(resumeParCategorie([])).toBe('aucun bien');
  });

  /** ⚠️ UNE CATÉGORIE ABSENTE VAUT LOGEMENT : la même règle que `categorieDuBien`, et jamais un trou. */
  it('⚠️ une cible sans catégorie compte comme un logement', () => {
    expect(resumeParCategorie([{}, { categorie: null }])).toBe('2 logements');
  });
});

/**
 * ══ 🔴🔴 ④ LE CAS RÉEL D'ARNO : Mme THAI Cécile, lots 360 + 397 ════════════════════════════════════════════════
 *
 * Relevé en base : lot 360 = « Appartement meublé / Type 2 », lot 397 = « Parking / Garage », même adresse
 * (10 rue Chateaubriand, CHATILLON). Attendu par Arno : « 1 logement + 1 parking ».
 */
describe('🔴🔴 ④ le cas réel, bout en bout', () => {
  it('🔴🔴 lots 360 + 397 ⇒ « 1 logement + 1 parking »', () => {
    expect(resumeDesLots([
      { nature: 'Appartement meublé', typeBien: 'Type 2' },
      { nature: 'Parking', typeBien: 'Garage' },
    ])).toBe('1 logement + 1 parking');
  });

  /**
   * 🔴 « UN LOGEMENT QUI INCLUT UN PARKING DANS LE MÊME LOT COMPTE COMME 1 LOGEMENT » (Arno). Un lot a UNE
   * nature, donc UNE catégorie : il n'y a rien à dédoubler, et c'est exactement pour cela qu'on ne cherche pas
   * le mot « parking » dans le libellé d'un appartement.
   */
  it('🔴 un appartement « avec parking » reste 1 logement', () => {
    expect(resumeDesLots([{ nature: 'Appartement', typeBien: 'Type 3 avec parking' }])).toBe('1 logement');
  });
});

/** 🔒 LE MODULE EST PUR : il ne connaît ni la base, ni le DOM, ni React. */
describe('🔒 module pur', () => {
  it('🔒 aucun import', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/categorieBien.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
