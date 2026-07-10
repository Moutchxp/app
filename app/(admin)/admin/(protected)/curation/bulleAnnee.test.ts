import { describe, it, expect } from 'vitest';
import { libelleAnnee, contenuBulleAnnee, doitCreerAuDoubleClic } from './bulleAnnee';

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
    // Garanties anti-« bug perçu » : non vide, pas un simple tiret.
    expect(libelleAnnee(null).length).toBeGreaterThan(0);
    expect(libelleAnnee(null)).not.toBe('—');
    expect(libelleAnnee(null)).not.toBe('');
  });

  it('valeur non finie (NaN/Infinity) → repli sur le libellé « non renseignée »', () => {
    expect(libelleAnnee(NaN)).toBe('Année de construction non renseignée');
    expect(libelleAnnee(Infinity)).toBe('Année de construction non renseignée');
  });
});

describe('contenuBulleAnnee', () => {
  it('enveloppe le libellé dans un role="status" (annonce lecteur d’écran) + classe de style', () => {
    const html = contenuBulleAnnee(1954);
    expect(html).toContain('role="status"');
    expect(html).toContain('class="svv-cur-bulle"');
    expect(html).toContain('Construit en 1954');
  });

  it('année absente → contenu explicite (aucun vide dans la bulle)', () => {
    expect(contenuBulleAnnee(null)).toContain('Année de construction non renseignée');
  });

  it('aucun jargon de source (BDNB/DGFiP) dans la bulle', () => {
    for (const v of [1954, null] as (number | null)[]) {
      const html = contenuBulleAnnee(v);
      expect(html).not.toMatch(/BDNB|DGFiP/i);
    }
  });
});

describe('doitCreerAuDoubleClic (règle de conflit d’interaction)', () => {
  it('mode bulle INACTIF → le double-clic crée un tag (comportement existant préservé)', () => {
    expect(doitCreerAuDoubleClic(false)).toBe(true);
  });

  it('mode bulle ACTIF → la création par double-clic est SUSPENDUE', () => {
    expect(doitCreerAuDoubleClic(true)).toBe(false);
  });
});
