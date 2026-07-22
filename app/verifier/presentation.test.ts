import { describe, it, expect } from 'vitest';
import { premierParam, formatDateFr, formatEtage, libelleVerdict, libelleTypeDocument, formatScoreVisuel, formatDescriptifVisuel, DEFINITION_SVV, MESSAGE_SANS_COMPTE } from './presentation';
import type { DescriptifVisuel } from '../lib/db/certificatVerification';

describe('premierParam', () => {
  it('string → elle-même', () => expect(premierParam('SAVV-2026-000001')).toBe('SAVV-2026-000001'));
  it('array → première valeur', () => expect(premierParam(['a', 'b'])).toBe('a'));
  it('undefined → undefined', () => expect(premierParam(undefined)).toBeUndefined());
  it('array vide → undefined', () => expect(premierParam([])).toBeUndefined());
});

describe('formatDateFr — ancrée Europe/Paris', () => {
  it('ISO valide → date française lisible (jour/mois/année)', () => {
    const s = formatDateFr('2026-07-15T09:30:00.000Z'); // 11h30 à Paris (été, +2)
    expect(s).toContain('15');
    expect(s).toContain('juillet');
    expect(s).toContain('2026');
  });
  it('entrée illisible → renvoyée telle quelle (pas de crash)', () => {
    expect(formatDateFr('pas-une-date')).toBe('pas-une-date');
  });
});

describe('formatEtage — null / 0 gérés', () => {
  it('null → Non renseigné', () => expect(formatEtage(null)).toBe('Non renseigné'));
  it('0 → Rez-de-chaussée', () => expect(formatEtage(0)).toBe('Rez-de-chaussée'));
  it('3 → 3ᵉ étage', () => expect(formatEtage(3)).toBe('3ᵉ étage'));
});

describe('libelleVerdict', () => {
  it('SANS_VIS_A_VIS → Sans vis-à-vis', () => expect(libelleVerdict('SANS_VIS_A_VIS')).toBe('Sans vis-à-vis'));
  it('VIS_A_VIS → Vis-à-vis', () => expect(libelleVerdict('VIS_A_VIS')).toBe('Vis-à-vis'));
  it('valeur inconnue → brute', () => expect(libelleVerdict('AUTRE')).toBe('AUTRE'));
});

describe('libelleTypeDocument (param doc, présentation non fiable)', () => {
  it("'nominatif' → « le certificat nominatif »", () => expect(libelleTypeDocument('nominatif')).toBe('le certificat nominatif'));
  it("'anonyme' → « la version anonymisée »", () => expect(libelleTypeDocument('anonyme')).toBe('la version anonymisée'));
  it("'visuel' → « le visuel »", () => expect(libelleTypeDocument('visuel')).toBe('le visuel'));
  it('absent (undefined) → générique « ce certificat »', () => expect(libelleTypeDocument(undefined)).toBe('ce certificat'));
  it('valeur inconnue → générique « ce certificat »', () => expect(libelleTypeDocument('n’importe-quoi')).toBe('ce certificat'));
});

describe('DEFINITION_SVV (texte du visuel)', () => {
  it('énonce le seuil 40 m, la mesure géométrique et l’exclusion de la végétation', () => {
    expect(DEFINITION_SVV).toContain('40 mètres');
    expect(DEFINITION_SVV).toMatch(/g[ée]om[ée]triquement|LiDAR/i);
    expect(DEFINITION_SVV).toMatch(/v[ée]g[ée]tation/i);
  });
});

describe('formatScoreVisuel', () => {
  it('score numérique → « N / 100 » (arrondi d’affichage)', () => expect(formatScoreVisuel(82.4)).toBe('82 / 100'));
  it('null → « — »', () => expect(formatScoreVisuel(null)).toBe('—'));
});

describe('formatDescriptifVisuel', () => {
  const base: DescriptifVisuel = {
    ville: 'Asnières-sur-Seine', typeBien: 'Appartement', surfaceM2: 72.35, pieces: 3,
    anneeOuEpoque: '2008', etage: 5, dernierEtage: false, exterieur: 'Balcon',
  };
  it('compose ville + descriptif, formate surface/étage, sans chambres ni adresse', () => {
    const rows = formatDescriptifVisuel(base);
    const map = Object.fromEntries(rows.map((r) => [r.label, r.valeur]));
    expect(map['Ville']).toBe('Asnières-sur-Seine');
    expect(map['Type']).toBe('Appartement');
    expect(map['Surface']).toBe('72,35 m²');
    expect(map['Pièces']).toBe('3');
    expect(map['Étage']).toBe('5ᵉ étage');
    expect(map['Dernier étage']).toBe('Non');
    expect(map['Année']).toBe('2008');
    expect(map['Extérieur']).toBe('Balcon');
    // JAMAIS de « Chambres » ni d'adresse.
    expect(map['Chambres']).toBeUndefined();
    expect(JSON.stringify(rows)).not.toMatch(/adresse|chambre/i);
    // Ordre : Ville en tête.
    expect(rows[0].label).toBe('Ville');
  });
  it('ville absente (certificat antérieur) → omission propre, PAS de ligne « Ville »', () => {
    const rows = formatDescriptifVisuel({ ...base, ville: null, exterieur: null });
    const labels = rows.map((r) => r.label);
    expect(labels).not.toContain('Ville');
    expect(labels).not.toContain('Extérieur');
    expect(labels).toContain('Type'); // le reste reste affiché
  });
  it('omet toutes les lignes nulles', () => {
    const rows = formatDescriptifVisuel({ ville: null, typeBien: null, surfaceM2: null, pieces: null, anneeOuEpoque: null, etage: null, dernierEtage: null, exterieur: null });
    expect(rows).toEqual([]);
  });
});

describe('MESSAGE_SANS_COMPTE (statut sans_compte)', () => {
  it('mentionne la non-authentifiabilité en ligne et l’absence de compte, sans révéler aucun champ', () => {
    expect(MESSAGE_SANS_COMPTE).toContain('authentifiable en ligne');
    expect(MESSAGE_SANS_COMPTE).toContain('compte Sans Vis-à-Vis®');
    // Aucun champ du certificat ne doit figurer dans le message (adresse, étage, verdict, date…).
    expect(MESSAGE_SANS_COMPTE).not.toMatch(/étage|verdict|adresse/i);
  });
});
