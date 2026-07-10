import { describe, it, expect } from 'vitest';
import { validerPatch } from './validation';

/**
 * Ligne actuelle minimale (valeurs = seed migration 003) suffisante pour
 * l'anti-repli : mode valide + distance_max_m ≤ analysis_range_m.
 */
function ligneActuelle(): Record<string, unknown> {
  return {
    id: 1,
    mode_combinaison: 'max',
    distance_max_m: 200,
    analysis_range_m: 200,
    plafond_degagement: 80,
  };
}

describe('validerPatch — rejets', () => {
  it('body vide → erreur « aucune colonne à modifier »', () => {
    const r = validerPatch({}, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('aucune colonne');
  });

  it('colonne inconnue → erreur', () => {
    const r = validerPatch({ colonne_bidon: 5 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('inconnue');
  });

  it('colonne VESTIGIALE (boost_f2) → erreur (non éditable)', () => {
    const r = validerPatch({ boost_f2: 0.5 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('non éditable');
  });

  it('colonne technique `id` → erreur (non éditable)', () => {
    const r = validerPatch({ id: 2 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('non éditable');
  });

  it('string numérique "85" → erreur (pas de coercition)', () => {
    const r = validerPatch({ plafond_degagement: '85' as unknown as number }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('numérique');
  });

  it('NaN → erreur', () => {
    const r = validerPatch({ plafond_degagement: NaN }, ligneActuelle());
    expect(r.ok).toBe(false);
  });

  it('Infinity → erreur', () => {
    const r = validerPatch({ plafond_degagement: Infinity }, ligneActuelle());
    expect(r.ok).toBe(false);
  });

  it('float sur une colonne entière ÉDITABLE (couloir_fenetre_condition_n) → erreur « entière »', () => {
    const r = validerPatch({ couloir_fenetre_condition_n: 16.5 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('entière');
  });

  it('analysis_range_m (MIROIR verrouillé) → erreur « non éditable » (rejet AVANT le contrôle de type)', () => {
    // Même une valeur parfaitement valide (200, entier, dans la plage) est refusée : la colonne est verrouillée.
    const r = validerPatch({ analysis_range_m: 200 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs[0].colonne).toBe('analysis_range_m');
      expect(r.erreurs[0].message).toContain('non éditable');
    }
  });

  it('valeur hors plage → erreur', () => {
    const r = validerPatch({ plafond_degagement: 5000 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('maximum');
  });

  it('null → erreur (NOT NULL)', () => {
    const r = validerPatch({ plafond_degagement: null }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0].message).toContain('NOT NULL');
  });

  it('distance_max_m résultant > analysis_range_m → erreur (anti-repli)', () => {
    // Portée courante = 200 ; on pousse distance_max_m à 300 → repli forcé.
    const r = validerPatch({ distance_max_m: 300 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.some((e) => e.colonne === 'distance_max_m')).toBe(true);
  });

  it("mode_combinaison='xyz' → erreur (hors liste fermée {max, addition, sequentiel})", () => {
    const r = validerPatch({ mode_combinaison: 'xyz' }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs[0].message).toContain('liste fermée');
      expect(r.erreurs[0].message).toContain('sequentiel');
    }
  });

  it("mode_combinaison_repli='sequentiel' → erreur 422 (hors liste fermée {max, addition})", () => {
    const r = validerPatch({ mode_combinaison_repli: 'sequentiel' }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs[0].colonne).toBe('mode_combinaison_repli');
      expect(r.erreurs[0].message).toContain('liste fermée');
      expect(r.erreurs[0].message).not.toContain('sequentiel');
    }
  });
});

describe('validerPatch — acceptations', () => {
  it('patch VIVE valide → ok + colonne dans `set`', () => {
    const r = validerPatch({ plafond_degagement: 85 }, ligneActuelle());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.set).toEqual([{ colonne: 'plafond_degagement', valeur: 85 }]);
    }
  });

  it('mode_combinaison valide → ok', () => {
    const r = validerPatch({ mode_combinaison: 'addition' }, ligneActuelle());
    expect(r.ok).toBe(true);
  });

  it("mode_combinaison_repli='addition' → ok", () => {
    const r = validerPatch({ mode_combinaison_repli: 'addition' }, ligneActuelle());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.set).toEqual([{ colonne: 'mode_combinaison_repli', valeur: 'addition' }]);
  });

  it('distance_max_m seul (≤ portée en base) → ok + set = [distance_max_m] uniquement', () => {
    // La paire est dissoute : distance_max_m s'écrit seul, borné par la portée EN BASE (200), inchangée.
    const r = validerPatch({ distance_max_m: 180 }, ligneActuelle());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.set).toEqual([{ colonne: 'distance_max_m', valeur: 180 }]);
  });

  it('groupe {distance_max_m, analysis_range_m} → REFUSÉ (analysis_range_m verrouillé, aucune écriture)', () => {
    // Tenter de desserrer le garde-fou en co-soumettant les deux est bloqué net.
    const r = validerPatch({ distance_max_m: 300, analysis_range_m: 300 }, ligneActuelle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.some((e) => e.colonne === 'analysis_range_m' && e.message.includes('non éditable'))).toBe(true);
  });
});
