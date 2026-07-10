import { describe, it, expect } from 'vitest';
import { libelleAnnee, libelleEtages, contenuBulleBatiment, doitCreerAuDoubleClic } from './bulleBatiment';

describe('libelleAnnee', () => {
  it('année connue → « Construit en <annee> » (entier brut, sans séparateur)', () => {
    expect(libelleAnnee(1954)).toBe('Construit en 1954');
    expect(libelleAnnee(2003)).toBe('Construit en 2003');
    expect(libelleAnnee(1789)).toBe('Construit en 1789');
  });

  it('année absente (null/undefined) → libellé EXPLICITE, jamais un vide ni un tiret', () => {
    const attendu = 'Année de construction non renseignée';
    expect(libelleAnnee(null)).toBe(attendu);
    expect(libelleAnnee(undefined)).toBe(attendu);
    expect(libelleAnnee(null).length).toBeGreaterThan(0);
    expect(libelleAnnee(null)).not.toBe('—');
    expect(libelleAnnee(null)).not.toBe('');
  });

  it('valeur non finie (NaN/Infinity) → repli sur le libellé « non renseignée »', () => {
    expect(libelleAnnee(NaN)).toBe('Année de construction non renseignée');
    expect(libelleAnnee(Infinity)).toBe('Année de construction non renseignée');
  });
});

describe('libelleEtages', () => {
  // ⚠️ Test DÉDIÉ au 0 : décision Arno — « 0 étage » telle quelle, JAMAIS « non renseigné ».
  it('etages = 0 → « 0 étage » (singulier), et surtout PAS « non renseigné » (le 0 n’est pas avalé)', () => {
    expect(libelleEtages(0)).toBe('0 étage');
    expect(libelleEtages(0)).not.toBe('Nombre d’étages non renseigné');
  });

  it('etages = 1 → « 1 étage » (singulier)', () => {
    expect(libelleEtages(1)).toBe('1 étage');
  });

  it('etages = 5 → « 5 étages » (pluriel)', () => {
    expect(libelleEtages(5)).toBe('5 étages');
    expect(libelleEtages(2)).toBe('2 étages');
  });

  it('etages = null/undefined → « Nombre d’étages non renseigné », jamais un vide', () => {
    const attendu = 'Nombre d’étages non renseigné';
    expect(libelleEtages(null)).toBe(attendu);
    expect(libelleEtages(undefined)).toBe(attendu);
    expect(libelleEtages(null).length).toBeGreaterThan(0);
    expect(libelleEtages(null)).not.toBe('');
  });

  it('valeur non finie (NaN/Infinity) → « non renseigné » (jamais « NaN étage »)', () => {
    expect(libelleEtages(NaN)).toBe('Nombre d’étages non renseigné');
    expect(libelleEtages(Infinity)).toBe('Nombre d’étages non renseigné');
  });
});

describe('contenuBulleBatiment — 4 combinaisons année × étages', () => {
  it('les DEUX présents → deux lignes de valeur, aucune ligne d’absence', () => {
    const html = contenuBulleBatiment(1954, 5);
    expect(html).toContain('Construit en 1954');
    expect(html).toContain('5 étages');
    expect(html).not.toContain('non renseigné');
    // Deux lignes distinctes.
    expect((html.match(/svv-cur-bulle-l/g) ?? []).length).toBe(2);
  });

  it('année SEULE (étages absents) → « Construit en … » + « Nombre d’étages non renseigné »', () => {
    const html = contenuBulleBatiment(1954, null);
    expect(html).toContain('Construit en 1954');
    expect(html).toContain('Nombre d’étages non renseigné');
  });

  it('étages SEULS (année absente, y compris 0 étage) → « Année … non renseignée » + « 0 étage »', () => {
    const html = contenuBulleBatiment(null, 0);
    expect(html).toContain('Année de construction non renseignée');
    // Le 0 survit MÊME quand l’année manque (aucun court-circuit falsy global).
    expect(html).toContain('0 étage');
    expect(html).not.toContain('Nombre d’étages non renseigné');
  });

  it('AUCUN des deux → les deux lignes d’absence empilées (jamais un vide)', () => {
    const html = contenuBulleBatiment(null, null);
    expect(html).toContain('Année de construction non renseignée');
    expect(html).toContain('Nombre d’étages non renseigné');
    expect((html.match(/svv-cur-bulle-l/g) ?? []).length).toBe(2);
  });

  it('role="status" (annonce lecteur d’écran) + classe de style, aucun jargon de source', () => {
    const html = contenuBulleBatiment(1954, 5);
    expect(html).toContain('role="status"');
    expect(html).toContain('class="svv-cur-bulle"');
    expect(html).not.toMatch(/BDNB|DGFiP|BD ?TOPO/i);
  });
});

describe('doitCreerAuDoubleClic (règle de conflit d’interaction — ACQUISE, doit survivre)', () => {
  it('mode bulle INACTIF → le double-clic crée un tag (comportement existant préservé)', () => {
    expect(doitCreerAuDoubleClic(false)).toBe(true);
  });

  it('mode bulle ACTIF → la création par double-clic est SUSPENDUE', () => {
    expect(doitCreerAuDoubleClic(true)).toBe(false);
  });
});
