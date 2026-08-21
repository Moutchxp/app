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

import { controlerRegleGabarit, enonceRegle, type LecturePlanche } from './decisionGabaritPlu';

describe('N10-M — contrôle de règle gabarit = plateau + plafond', () => {
  // reproduction 07512024V0037 : AA 100/69 · CC 101/70 · Est 102/71 · Nord 101/70 · Ouest 101/70 (fit OK) ; BB fit hors seuil ; Sud plateau absent
  const L = (planche: string, gabarit: number | null, plateau: number | null, fitOk = true): LecturePlanche => ({ planche, page: 1, gabarit, plateau, fitOk });
  const lectures0037 = (): LecturePlanche[] => [
    L('PC3.1 AA', 100, 69), L('PC3.3 CC', 101, 70), L('PC5.2 Est', 102, 71), L('PC5.4 Nord', 101, 70), L('PC5.3 Ouest', 101, 70),
    L('PC3.2 BB', 101, 70.63, false), // fit hors seuil → EXCLUE (jamais parce que 30,37 dérange)
    L('PC5.5 Sud', 100, null),        // plateau absent → pas dans le contrôle
  ];

  it('règle VÉRIFIÉE : plafond 31, plateau min 69, gabarit 100→102, BB exclue « non concluante »', () => {
    const r = controlerRegleGabarit(lectures0037());
    expect(r.statut).toBe('verifiee');
    if (r.statut === 'verifiee') {
      expect(r.plafond).toBeCloseTo(31, 5);
      expect(r.plateauMin).toBe(69); expect(r.plateauMax).toBe(71);
      expect(r.gabaritMin).toBe(100); expect(r.gabaritMax).toBe(102);
      expect(r.planches).toHaveLength(5);                 // BB et Sud hors contrôle
      expect(r.exclues).toEqual([{ planche: 'PC3.2 BB', page: 1, motif: 'non concluante (fit hors seuil)' }]);
    }
  });

  it('la valeur par défaut = plateau min + plafond = 69 + 31 = 100', () => {
    const r = controlerRegleGabarit(lectures0037());
    if (r.statut === 'verifiee') expect(r.plateauMin + r.plafond).toBeCloseTo(100, 5);
  });

  it('énoncé factuel de la règle (sans jargon, sans « divergentes »)', () => {
    const r = controlerRegleGabarit(lectures0037());
    if (r.statut === 'verifiee') {
      const s = enonceRegle(r);
      expect(s).toContain('gabarit = plateau de nivellement + 31 m');
      expect(s).toContain('de 100 à 102 NGF');
      expect(s).toContain('(69 à 71)');
      expect(s).not.toContain('divergent');
    }
  });

  it('écarts NON constants → NON vérifiée (vraie divergence, comportement N10-I préservé)', () => {
    const r = controlerRegleGabarit([L('A', 100, 69), L('B', 101, 69), L('C', 102, 69)]); // écarts 31/32/33
    expect(r.statut).toBe('non_verifiee');
  });

  it('moins de 3 planches à deux libellés + fit OK → NON vérifiée', () => {
    const r = controlerRegleGabarit([L('A', 100, 69), L('B', 101, 70)]);
    expect(r.statut).toBe('non_verifiee');
  });

  it('BB seule (fit hors seuil) n’entre jamais dans le contrôle et ne bascule pas en divergence', () => {
    const r = controlerRegleGabarit([L('A', 100, 69), L('B', 101, 70), L('C', 102, 71), L('BB', 101, 70.63, false)]);
    expect(r.statut).toBe('verifiee');
    if (r.statut === 'verifiee') expect(r.plafond).toBeCloseTo(31, 5);
  });
});
