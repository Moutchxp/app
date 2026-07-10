import { describe, it, expect } from 'vitest';
import {
  construireUrl,
  jourParis,
  decalerJours,
  fenetreDefaut,
  preset,
  libelleMasque,
  partsVerdicts,
  entonnoirCumule,
  estVide,
  formatNombre,
  PLANCHER_N,
  type Statistiques,
  type VentilationSure,
} from './affichage';

describe('fenêtre & URL — le client ne fait que consommer l’API du Lot 4', () => {
  it('construireUrl encode debut/fin/grain', () => {
    expect(construireUrl({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' })).toBe(
      '/api/admin/statistiques?debut=2026-01-01&fin=2026-01-31&grain=jour',
    );
  });
  it('jourParis rend une date Europe/Paris (bascule du jour à minuit Paris)', () => {
    expect(jourParis(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01'); // 00:30 Paris
  });
  it('decalerJours est insensible au changement d’heure (UTC)', () => {
    expect(decalerJours('2026-03-28', 1)).toBe('2026-03-29'); // passage heure d'été FR : aucun décalage
    expect(decalerJours('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('fenetreDefaut = 30 derniers jours, preset 7j/90j corrects', () => {
    const f = fenetreDefaut(new Date('2026-07-10T12:00:00Z'));
    expect(f).toEqual({ debut: '2026-06-11', fin: '2026-07-10', grain: 'jour' });
    expect(preset('7j', 'jour', new Date('2026-07-10T12:00:00Z')).debut).toBe('2026-07-04');
    expect(preset('90j', 'semaine', new Date('2026-07-10T12:00:00Z')).grain).toBe('semaine');
  });
});

describe('masquage k — affiché tel quel, JAMAIS reconstitué', () => {
  it('insuffisant → « données insuffisantes », aucun chiffre', () => {
    const v: VentilationSure<{ n: number }> = { visibles: [], masque: null, insuffisant: true };
    const l = libelleMasque(v);
    expect(l).toMatch(/insuffisantes/i);
    expect(l).not.toMatch(/\d/); // AUCUN nombre : rien à reconstituer
  });
  it('masque agrégé (≥2 zones, ≥k) → affiche l’agrégat FOURNI par l’API, pas une soustraction', () => {
    const v: VentilationSure<{ n: number }> = { visibles: [{ n: 50 }], masque: { nbCellules: 2, total: 13 }, insuffisant: false };
    expect(libelleMasque(v)).toBe('2 zones masquées (total 13)'); // 13 = masque.total (donné), jamais total−visibles
  });
  it('rien de masqué → pas de libellé', () => {
    expect(libelleMasque({ visibles: [{ n: 20 }], masque: null })).toBeNull();
  });
  it('défense en profondeur : un groupe masqué à UNE seule zone → « données insuffisantes », jamais sa valeur', () => {
    // Ne peut pas arriver sous le contrat Lot 4 (≥2 zones sinon insuffisant), mais si ça arrivait, on ne
    // restitue PAS la valeur unique (ce serait la dé-anonymiser).
    const l = libelleMasque({ visibles: [], masque: { nbCellules: 1, total: 12 } });
    expect(l).toMatch(/insuffisantes/i);
    expect(l).not.toMatch(/12/);
  });
});

describe('verdicts — % ou « échantillon faible » (SPEC §4), sans recalcul des comptes', () => {
  it('sous le plancher (total < 30) → pas de %, on montre les comptes', () => {
    const r = partsVerdicts({ sans_vis_a_vis: 5, vis_a_vis: 2, indetermine: 1, total: 8 });
    expect(r.echantillonFaible).toBe(true);
    expect(r.parts.every((p) => p.pct === null)).toBe(true);
    expect(r.parts[0].n).toBe(5); // le compte reste celui de l'API
  });
  it('au-dessus du plancher → % arrondi', () => {
    const r = partsVerdicts({ sans_vis_a_vis: 60, vis_a_vis: 30, indetermine: 10, total: 100 });
    expect(r.echantillonFaible).toBe(false);
    expect(r.parts[0].pct).toBe(60);
    expect(r.parts[1].pct).toBe(30);
  });
  it('PLANCHER_N vaut 30 (seuil d’affichage, distinct de k)', () => {
    expect(PLANCHER_N).toBe(30);
  });
});

describe('entonnoir cumulé — dérivation d’affichage des agrégats fournis', () => {
  it('« a atteint au moins » = somme suffixe des « étape la plus loin »', () => {
    const pts = [
      { etape: 'intro', atteinte_max: 10 },
      { etape: 'photo', atteinte_max: 6 },
      { etape: 'resultat', atteinte_max: 4 },
    ];
    const f = entonnoirCumule(pts);
    expect(f[0].atteinte_min).toBe(20); // intro : 10+6+4
    expect(f[1].atteinte_min).toBe(10); // photo : 6+4
    expect(f[2].atteinte_min).toBe(4); //  resultat : 4
    expect(f[0].libelle).toBe('Arrivée');
  });
  it('l’étape « analyse » (jamais instrumentée séparément) est RETIRÉE de l’entonnoir affiché', () => {
    const pts = [
      { etape: 'infos_logement', atteinte_max: 10 },
      { etape: 'analyse', atteinte_max: 0 }, // toujours 0
      { etape: 'resultat', atteinte_max: 20 },
    ];
    const f = entonnoirCumule(pts);
    expect(f.map((p) => p.etape)).toEqual(['infos_logement', 'resultat']); // analyse absente
    expect(f[0].atteinte_min).toBe(30); // cumul inchangé (analyse=0 comptée dans le suffixe)
  });
});

describe('estVide — période sans données exploitable', () => {
  const base: Statistiques = {
    fenetre: { debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' },
    k: 11,
    trafic: [],
    verdicts: { sans_vis_a_vis: 0, vis_a_vis: 0, indetermine: 0, total: 0 },
    analyses: { lancees: 0, resultats: 0 },
    entonnoir: [],
    communes: { visibles: [], masque: null },
    provenance: { par_source_medium: { visibles: [], masque: null }, par_referer: { visibles: [], masque: null } },
  };
  it('tout à zéro → vide', () => {
    expect(estVide(base)).toBe(true);
  });
  it('des analyses → non vide', () => {
    expect(estVide({ ...base, analyses: { lancees: 3, resultats: 2 } })).toBe(false);
  });
  it('un masquage (insuffisant) → NON vide (il y a des données, juste masquées)', () => {
    expect(estVide({ ...base, communes: { visibles: [], masque: null, insuffisant: true } })).toBe(false);
  });
});

describe('formatNombre — FR', () => {
  it('sépare les milliers', () => {
    expect(formatNombre(12345).replace(/\s/g, ' ')).toMatch(/12.345/);
  });
});
