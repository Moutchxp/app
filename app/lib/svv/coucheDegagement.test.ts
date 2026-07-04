import { describe, it, expect } from 'vitest';
import { distancePercueFaisceau, noteDegagement, detecterChaineCouloir, diagnostiquerCouloir, cartoucheDegagement, cartoucheVueNature, cartoucheImmobilier, type ExtractionVueNature } from './coucheDegagement';
import { PROFIL_DEGAGEMENT_DEFAUT as P } from './profilDegagement';
import type { FaisceauResultat } from './scoreDegagement';

/** Faisceau fabriqué à la main (par défaut : axe, dégagé, aucun enrichissement). */
function f(over: Partial<FaisceauResultat> = {}): FaisceauResultat {
  return { offsetDeg: 0, distanceObstacleM: null, ...over };
}

describe('distancePercueFaisceau — F1 base', () => {
  it('neutre : distanceObstacleM = perçue', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100 }), P)).toBe(100);
  });
  it('dégagé (null) → distanceMaxM (200)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: null }), P)).toBe(200);
  });
  it('F1 plancher : aucun bonus → jamais sous la distance brute', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 120 }), P)).toBe(120);
  });
});

describe('distancePercueFaisceau — familles ANNÉE (Étape 2 ; remplace F2 boostF2)', () => {
  it('≤1900 dans le cône → 100 × 1.5 = 150 (capé distMax 300)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactAnnee: 1880 }), P)).toBe(150);
  });
  it('1901–1935 dans le cône → 100 × 1.2 = 120', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactAnnee: 1920 }), P)).toBe(120);
  });
  it('1901–1935 sur le flanc (offset 80) → 100 × 1.1 = 110', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 80, impactAnnee: 1920 }), P)).toBeCloseTo(110, 10);
  });
  it('année > 1935 → ordinaire, pas de pondération (reste 100)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactAnnee: 1970 }), P)).toBe(100);
  });
  it('année sans distance (dégagé) → base 200 (aucune famille sans obstacle)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: null, impactAnnee: 1880 }), P)).toBe(200);
  });
  it('impactAncien seul (sans impactAnnee) n’est plus consulté → ordinaire (100)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, impactAncien: true }), P)).toBe(100);
  });
});

describe('distancePercueFaisceau — F4 (nature traversée)', () => {
  it('50 m de nature (obstacle à 50) → additif base 50 + 2.5×50 = 175', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 50, natureTraverseeM: 50 }), P);
    expect(r).toBe(175);
  });
  it('nature plafonne : 180 + 2.5×180 = 630 → clampé 200', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 180, natureTraverseeM: 180 }), P);
    expect(r).toBe(200);
  });
});

describe('distancePercueFaisceau — familles MH / Inventaire (Étape 2 ; remplace F3 forfait)', () => {
  it('MH dans le cône → 100 × 2.0 = 200 (capé distMax 400)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactMH: true }), P)).toBe(200);
  });
  it('MH sur le flanc (offset 80) → 100 × 1.5 = 150', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 80, impactMH: true }), P)).toBe(150);
  });
  it('Inventaire dans le cône → 100 × 2.0 = 200', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactInventaire: true }), P)).toBe(200);
  });
  it('ancien F3 (impactNature remarquable) n’est plus consulté → ordinaire (100)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100, impactNature: 'Eglise' }), P)).toBe(100);
  });
});

describe('distancePercueFaisceau — priorité de famille + cumul nature (Étape 2)', () => {
  it('priorité : MH gagne sur année (MH + 1880 → coeff MH 2.0, pas 1.5)', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactMH: true, impactAnnee: 1880 }), P);
    expect(r).toBe(200); // 100 × 2.0 (MH), l'année ne s'applique pas
  });
  it('Patrimoine mondial → faisceau fixe 800, aucun calcul', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactEmblematique: true, impactMH: true }), P);
    expect(r).toBe(800);
  });
  it('cumul nature + MH cône : P1=200, div(50)=1.5, P2=100×2/1.5 → 200 + 133.33 = 333.33 (capé 400)', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactMH: true, natureTraverseeM: 50 }), P);
    expect(r).toBeCloseTo(200 + (100 * 2.0) / 1.5, 10); // 333.3333…
  });
  it('cumul capé à distMax famille : 1901–1935 (distMax 200) reste ≤ 200', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactAnnee: 1920, natureTraverseeM: 50 }), P);
    expect(r).toBe(200);
  });
  it('bâti ordinaire + nature → calcul classique (base + F4), inchangé', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 50, natureTraverseeM: 50 }), P);
    expect(r).toBe(175); // 50 + 2.5×50
  });
});

describe('noteDegagement — malus couloir (latéral, cumul proportionnel)', () => {
  // Champ de 61 faisceaux (offsets -90..+90 par pas de 3°). Seuls offsetDeg + distanceObstacleM
  // renseignés → distancePercueFaisceau = base = distanceObstacleM (aucun boost F2/F3/F4).
  function champ61(dist: (offset: number) => number | null): FaisceauResultat[] {
    const fs: FaisceauResultat[] = [];
    for (let off = -90; off <= 90; off += 3) fs.push(f({ offsetDeg: off, distanceObstacleM: dist(off) }));
    return fs;
  }

  it('n°3..16 collent tous (droite distObst=2, latéral<3) → validée, n=30, malus = n·0.01·S', () => {
    const fs = champ61((off) => (off > 0 ? 2 : null)); // droite bouchée près, gauche+axe dégagés
    const droite = detecterChaineCouloir(fs, P, 'droite');
    expect(droite.validee).toBe(true);
    expect(droite.indices.length).toBe(30); // positions 1..16 + prolongation 17..30
    const [dGauche, dDroite] = diagnostiquerCouloir(fs, P);
    expect(dGauche.validee).toBe(false);
    expect(dDroite.validee).toBe(true);
    expect(dDroite.n).toBe(30);
    // S = 30×2 (droite) + 31×200 (gauche+axe dégagés) = 6260 ; malus LINÉAIRE = 30×0.01×S = 1878
    expect(dDroite.malusM).toBeCloseTo(30 * 0.01 * 6260, 6);
    // note = ((S − malus)/61/200)×80 = (4382/12200)×80
    expect(noteDegagement(fs, P)).toBeCloseTo(28.734426, 5);
  });

  it('n°1 latéral > 3 (toléré) mais n°3..16 collent → validée, n°1 compté (n=30)', () => {
    const fs = champ61((off) => (off > 0 ? (off === 90 ? 5 : 2) : null)); // +90° : latéral 5 > 3
    const droite = detecterChaineCouloir(fs, P, 'droite');
    expect(droite.validee).toBe(true);
    expect(droite.indices.length).toBe(30);
    expect(droite.indices).toContain(60); // le faisceau +90° (index 60) EST dans la chaîne (compté au malus)
  });

  it('un des n°3..16 (offset +63°) latéral > 3 → NON validée, malus 0', () => {
    const fs = champ61((off) => (off > 0 ? (off === 63 ? 10 : 2) : null)); // +63° : latéral 8.9 > 3
    const droite = detecterChaineCouloir(fs, P, 'droite');
    expect(droite.validee).toBe(false);
    expect(droite.indices.length).toBe(0);
    const [, dDroite] = diagnostiquerCouloir(fs, P);
    expect(dDroite.validee).toBe(false);
    expect(dDroite.malusM).toBe(0);
  });
});

describe('noteDegagement — agrégation /80 (dégagement) + clamp /90', () => {
  it('liste vide → 0', () => {
    expect(noteDegagement([], P)).toBe(0);
  });
  it('tous perçus 200 → note plafond dégagement 80', () => {
    const fs = Array.from({ length: 5 }, () => f({ distanceObstacleM: null })); // base 200
    expect(noteDegagement(fs, P)).toBe(80);
  });
  it('tous à 0 → note 0', () => {
    const fs = Array.from({ length: 5 }, () => f({ distanceObstacleM: 0 }));
    expect(noteDegagement(fs, P)).toBe(0);
  });
  it('moyenne 100 et 200 → 150 → note (150/200)×80 = 60', () => {
    const fs = [f({ distanceObstacleM: 100 }), f({ distanceObstacleM: null })]; // 100 et 200
    expect(noteDegagement(fs, P)).toBe(60);
  });
});

describe('cartoucheDegagement — 12 catégories (descriptif, score-only)', () => {
  // Champ synthétique de 61 faisceaux (offsets -90..+90 pas 3°), distObst piloté par offset.
  const champ = (dist: (offset: number) => number | null): FaisceauResultat[] => {
    const fs: FaisceauResultat[] = [];
    for (let off = -90; off <= 90; off += 3) fs.push(f({ offsetDeg: off, distanceObstacleM: dist(off) }));
    return fs;
  };
  const cat = (dist: (offset: number) => number | null): string => cartoucheDegagement(champ(dist), P);

  it('1. Panoramique — tout dégagé ≥ 200 (null partout)', () => {
    expect(cat(() => null)).toBe('Panoramique');
  });
  it('2. Totalement dégagée — tout à 150 (dégagé + lointain, mais < 200)', () => {
    expect(cat(() => 150)).toBe('Totalement dégagée');
  });
  it('3. Globalement dégagé — ~74% dégagés à 50 m (non lointain)', () => {
    expect(cat((o) => (Math.abs(o) <= 66 ? 50 : 20))).toBe('Globalement dégagé');
  });
  it('4. Vue couloir — deux chaînes validées, axe ouvert (et NON Dent creuse)', () => {
    const r = cat((o) => (Math.abs(o) <= 6 ? null : 2));
    expect(r).toBe('Vue couloir');
    expect(r).not.toBe('Dent creuse');
  });
  it('5. Enfilade à droite — chaîne droite seule', () => {
    expect(cat((o) => (o > 0 ? 2 : null))).toBe('Enfilade à droite');
  });
  it('6. Enfilade à gauche — chaîne gauche seule', () => {
    expect(cat((o) => (o < 0 ? 2 : null))).toBe('Enfilade à gauche');
  });
  it('7. Dégagé à droite — droite 100%, gauche ~33%, sans chaîne (NON Dent creuse / NON Vue face)', () => {
    const r = cat((o) => (o >= 0 ? null : Math.abs(o) >= 63 ? null : 20));
    expect(r).toBe('Dégagé à droite');
    expect(r).not.toBe('Dent creuse');
    expect(r).not.toBe('Vue face dégagée');
  });
  it('8. Dégagé à gauche — symétrique', () => {
    expect(cat((o) => (o <= 0 ? null : Math.abs(o) >= 63 ? null : 20))).toBe('Dégagé à gauche');
  });
  it('9. Dent creuse — axe ouvert + 2 murs collés (latéral<6) par flanc, sans chaîne', () => {
    expect(cat((o) => { const a = Math.abs(o); return a <= 6 ? null : a === 9 || a === 12 ? 25 : 30; })).toBe(
      'Dent creuse',
    );
  });
  it('10. Vue face dégagée — 5 centraux ≥ 70, flancs denses ~25 m non collés (NON Dent creuse / NON dense)', () => {
    const r = cat((o) => (Math.abs(o) <= 12 ? 80 : 25));
    expect(r).toBe('Vue face dégagée');
    expect(r).not.toBe('Dent creuse');
    expect(r).not.toBe('Environnement dense');
  });
  it('11. Partiellement dégagée — ~51% dégagés, symétrique, centre mêlé', () => {
    expect(cat((o) => (Math.abs(o) % 6 === 0 ? null : 20))).toBe('Partiellement dégagée');
  });
  it('12. Environnement dense — tout bouché à 20 m (centre compris)', () => {
    expect(cat(() => 20)).toBe('Environnement dense');
  });
});

describe('cartoucheVueNature — badge nature (descriptif, score-only)', () => {
  // 41 faisceaux du cône (offsets -60..+60 pas 3°), une fraction avec natureTraverseeM > 0 (trigger).
  const cone = (fractionNature: number): FaisceauResultat[] => {
    const fs: FaisceauResultat[] = [];
    const total = 41;
    const avecNature = Math.round(fractionNature * total);
    let i = 0;
    for (let off = -60; off <= 60; off += 3) {
      fs.push(f({ offsetDeg: off, distanceObstacleM: 100, natureTraverseeM: i < avecNature ? 10 : 0 }));
      i++;
    }
    return fs;
  };
  const ext = (o: Partial<ExtractionVueNature>): ExtractionVueNature => ({
    verdureM: 0, planEauM: 0, coursEauM: 0, nomVerdure: null, nomPlanEau: null, ...o,
  });

  it('dominante nommée (parc) → "Vue sur [nom]"', () => {
    expect(cartoucheVueNature(cone(1), ext({ verdureM: 100, nomVerdure: 'Parc de Bécon' }))).toBe('Vue sur Parc de Bécon');
  });
  it("dominante non nommée (cours d'eau long) + parc nommé ratio 0.60 → nommé gagne", () => {
    expect(cartoucheVueNature(cone(1), ext({ coursEauM: 100, verdureM: 60, nomVerdure: 'Parc Y' }))).toBe('Vue sur Parc Y');
  });
  it("dominante non nommée (cours d'eau long) + parc nommé ratio 0.25 → générique dominante", () => {
    expect(cartoucheVueNature(cone(1), ext({ coursEauM: 100, verdureM: 25, nomVerdure: 'Parc Z' }))).toBe("Vue sur cours d'eau");
  });
  it('ratio pile 0.40 → "Vue sur [nom]" (frontière incluse)', () => {
    expect(cartoucheVueNature(cone(1), ext({ coursEauM: 100, verdureM: 40, nomVerdure: 'Parc W' }))).toBe('Vue sur Parc W');
  });
  it('sous le seuil de trigger (< 20% du cône) → null', () => {
    expect(cartoucheVueNature(cone(0.1), ext({ verdureM: 100, nomVerdure: 'Parc' }))).toBeNull();
  });
  it('hors dép.92 (extraction vide, longueurs 0) → null', () => {
    expect(cartoucheVueNature(cone(1), ext({}))).toBeNull();
  });
});

describe('cartoucheImmobilier — badge époque du bâti PAR FAISCEAU (descriptif, score-only)', () => {
  const N = 41; // cône ±60°
  // Construit nCone faisceaux : les `touchants` (année | null) touchent du bâti, le reste ne touche pas.
  const champ = (nCone: number, touchants: (number | null)[]): { annee: number | null; touche: boolean }[] =>
    Array.from({ length: nCone }, (_, i) =>
      i < touchants.length ? { annee: touchants[i], touche: true } : { annee: null, touche: false },
    );

  it('trigger OK + tranche 1850–1913 à 60% des touchants → "Bâti majoritaire : 1850–1913"', () => {
    // 33 touchants (33/41 ≥ 0.70) ; 20 en 1850-1913 (20/33 = 0.606 ≥ 0.50)
    const t = [...Array(20).fill(1900), ...Array(7).fill(1975), ...Array(6).fill(null)];
    expect(cartoucheImmobilier(N, champ(N, t))).toBe('Bâti majoritaire : 1850–1913');
  });
  it('plancher (Avant 1850) majoritaire → "Bâti majoritaire : avant 1850"', () => {
    // 4 touchants sur 5 (0.80) ; 2 avant 1850 (1800, 1820) = 2/4 = 0.50
    expect(cartoucheImmobilier(5, champ(5, [1800, 1820, 1975, null]))).toBe('Bâti majoritaire : avant 1850');
  });
  it('plafond (À partir de 2021) majoritaire → "Bâti majoritaire : après 2020"', () => {
    // 4 touchants sur 5 (0.80) ; 2 après 2020 (2025, 2030) = 2/4 = 0.50
    expect(cartoucheImmobilier(5, champ(5, [2025, 2030, 1975, null]))).toBe('Bâti majoritaire : après 2020');
  });
  it('trigger OK + non-datés ≥ 50% des touchants → null', () => {
    const t = [...Array(18).fill(null), ...Array(8).fill(1900), ...Array(7).fill(1975)]; // 33 touchants, non daté 18/33 = 0.545
    expect(cartoucheImmobilier(N, champ(N, t))).toBeNull();
  });
  it('trigger OK + aucune tranche ≥ 50% (éparpillé) → null', () => {
    const t = [...Array(11).fill(1900), ...Array(11).fill(1975), ...Array(11).fill(2005)]; // 33 touchants, max 11/33 = 0.333
    expect(cartoucheImmobilier(N, champ(N, t))).toBeNull();
  });
  it('tranche pile à 50% des touchants → affichée (frontière incluse, ≥)', () => {
    // 4 touchants sur nCone=5 (4/5 = 0.80 ≥ 0.70) ; 1850-1913 = 2/4 = 0.50
    expect(cartoucheImmobilier(5, champ(5, [1900, 1880, 1975, null]))).toBe('Bâti majoritaire : 1850–1913');
  });
  it('sous le trigger 70% → null', () => {
    const t = Array(20).fill(1900); // 20/41 = 0.488 < 0.70
    expect(cartoucheImmobilier(N, champ(N, t))).toBeNull();
  });
  it('0 bâti touché → null', () => {
    expect(cartoucheImmobilier(N, champ(N, []))).toBeNull();
  });
});
