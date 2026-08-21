import { describe, it, expect } from 'vitest';
import { decisionGabaritPlanche, agregerGabarit, RESERVE_DIVERGENCE, type ItemTexte, type CandidatGabarit } from './decisionGabaritPlu';

/**
 * N10-I — extraction PURE de la hauteur max PLU par position. Fixtures calées sur la mesure réelle (permis 07512024V0037) :
 * échelle affine y = 14,1733·alt − 763,15, libellé « hauteur maximale PLU » posé sur la ligne de gabarit, cotes « NN,NN (NGF) ».
 */
const M = 14.1733, B = -763.15;
const yDe = (alt: number) => M * alt + B;
const cote = (alt: number, x = 900): ItemTexte => ({ str: `${alt.toFixed(2).replace('.', ',')} (NGF) ${(alt - 0.33).toFixed(2).replace('.', ',')} NVP`, x, y: yDe(alt), fs: 4 });
const NIVEAUX = [60.83, 65.23, 71.23, 74.63, 80.83, 84.63, 92.63, 97.13]; // 8 ancrages réels
const ancrages = () => NIVEAUX.map((a) => cote(a));
const libelle = (y: number): ItemTexte => ({ str: 'hauteur maximale PLU', x: 290, y, fs: 6 });

describe('decisionGabaritPlanche — règles a→e', () => {
  it('a) libellé absent → abstention « libellé absent »', () => {
    const d = decisionGabaritPlanche([...ancrages()]);
    expect(d.statut).toBe('abstenue');
    if (d.statut === 'abstenue') expect(d.motif).toContain('libellé');
  });

  it('aucune cote NGF (que du NVP) → abstention', () => {
    const items: ItemTexte[] = [libelle(yDe(101)), { str: '100,67 NVP', x: 68, y: yDe(101), fs: 6 }];
    const d = decisionGabaritPlanche(items);
    expect(d.statut).toBe('abstenue');
    if (d.statut === 'abstenue') expect(d.motif).toContain('NGF');
  });

  it('b+c) Coupe BB : libellé sur 101,00 → retenue 101,00, écart converti petit, confiance confirmée, R²≈1', () => {
    // libellé ~3 unités sous la cote 101,00 (mesuré : Δ=0,21 m)
    const items: ItemTexte[] = [...ancrages(), cote(101.00, 68), cote(101.53, 744), libelle(yDe(101.00) - 3)];
    const d = decisionGabaritPlanche(items);
    expect(d.statut).toBe('retenue');
    if (d.statut === 'retenue') {
      expect(d.valeurNgf).toBe(101);
      expect(d.confiance).toBe('confirmee');
      expect(d.r2).toBeGreaterThan(0.9999);
      expect(d.ecartM).not.toBeNull();
      expect(d.ecartM!).toBeLessThan(0.30);
    }
  });

  it('b) Coupe AA : libellé sur 100,00 (pas de 101,00 sur la page) → retenue 100,00', () => {
    const items: ItemTexte[] = [...ancrages(), cote(100.00, 700), cote(101.53, 466), libelle(yDe(100.00) - 3.7)];
    const d = decisionGabaritPlanche(items);
    expect(d.statut === 'retenue' && d.valeurNgf).toBe(100);
  });

  it('lit la part NGF, JAMAIS la NVP, dans un item mixte « 101,00 (NGF)/100,67 NVP »', () => {
    const items: ItemTexte[] = [...ancrages(), { str: '101,00 (NGF)/100,67NVP', x: 68, y: yDe(101), fs: 6 }, libelle(yDe(101) - 3)];
    const d = decisionGabaritPlanche(items);
    expect(d.statut === 'retenue' && d.valeurNgf).toBe(101); // 101 (NGF), pas 100,67 (NVP)
  });

  it('d) libellé hors de portée de toute cote NGF (>0,50 m) → abstention, jamais la 2e plus proche', () => {
    const items: ItemTexte[] = [...ancrages(), cote(101.00, 68), libelle(yDe(101.00) - 20)]; // ~1,4 m sous la cote
    const d = decisionGabaritPlanche(items);
    expect(d.statut).toBe('abstenue');
    if (d.statut === 'abstenue') expect(d.motif).toContain('portée');
  });

  it('c) échelle non calibrable (<5 ancrages) → retenue par voie directe, écart null, confiance abaissée + motif', () => {
    // Coupe CC : peu d'ancrages, mais le libellé colle à 101,00
    const items: ItemTexte[] = [cote(97.13), cote(92.63), cote(101.00, 712), libelle(yDe(101.00) - 1)];
    const d = decisionGabaritPlanche(items);
    expect(d.statut).toBe('retenue');
    if (d.statut === 'retenue') {
      expect(d.valeurNgf).toBe(101);
      expect(d.ecartM).toBeNull();
      expect(d.confiance).toBe('a_verifier');
      expect(d.motifEchelle).toContain('non convertible');
    }
  });
});

describe('agregerGabarit — concordance / divergence', () => {
  const cand = (v: number, planche: string, page = 1): CandidatGabarit => ({ valeurNgf: v, planche, page, ecartM: 0.2, confiance: 'confirmee' });

  it('aucun candidat → aucune', () => {
    expect(agregerGabarit([]).statut).toBe('aucune');
  });

  it('toutes concordantes (à 0,05 m près) → une valeur', () => {
    const a = agregerGabarit([cand(101.0, 'BB'), cand(101.0, 'CC'), cand(100.98, 'DD')]);
    expect(a.statut).toBe('concordante');
    if (a.statut === 'concordante') { expect(a.groupes).toHaveLength(1); expect(Math.abs(a.valeur - 101)).toBeLessThanOrEqual(0.05); }
  });

  it('07512024V0037 : BB/CC=101 · AA/Sud=100 → DIVERGENTE (2 groupes, aucun départage)', () => {
    const a = agregerGabarit([cand(101, 'PC3.2 BB'), cand(101, 'PC3.3 CC'), cand(100, 'PC3.1 AA'), cand(100, 'PC5.5 Sud')]);
    expect(a.statut).toBe('divergente');
    if (a.statut === 'divergente') {
      expect(a.groupes).toHaveLength(2);
      const g101 = a.groupes.find((g) => g.valeur === 101)!, g100 = a.groupes.find((g) => g.valeur === 100)!;
      expect(g101.sources.map((s) => s.planche).sort()).toEqual(['PC3.2 BB', 'PC3.3 CC']);
      expect(g100.sources.map((s) => s.planche).sort()).toEqual(['PC3.1 AA', 'PC5.5 Sud']);
    }
  });

  it('RESERVE_DIVERGENCE est le motif métier arbitré, mot pour mot', () => {
    expect(RESERVE_DIVERGENCE).toBe('le gabarit NGF varie selon le plateau de nivellement de la portion coupée');
  });
});
