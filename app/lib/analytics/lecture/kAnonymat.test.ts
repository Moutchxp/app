import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./requete', () => ({ lireGrandLivre: vi.fn() }));

import { ventilerSous_k, lireSeuilK, K_DEFAUT } from './kAnonymat';
import { lireGrandLivre } from './requete';

const q = lireGrandLivre as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

// Jeu de données stable : X(2)+Y(3) forment un groupe masqué DÉJÀ sûr (≥2 cellules) → la suppression
// secondaire ne « tire » aucune cellule visible, on isole donc proprement l'effet du seuil sur A(10)/B(11).
const CELLULES = [{ c: 'A', n: 10 }, { c: 'X', n: 2 }, { c: 'Y', n: 3 }, { c: 'B', n: 11 }, { c: 'C', n: 50 }];

describe('ventilerSous_k — suppression PRIMAIRE (cellule < k masquée, ≥ k visible)', () => {
  it('à k=11 : une cellule à 10 est MASQUÉE, une à 11 est VISIBLE', () => {
    const r = ventilerSous_k(CELLULES, 11);
    const visibles = r.visibles.map((x) => x.c);
    expect(visibles).toContain('B'); // 11 ≥ k → visible
    expect(visibles).toContain('C'); // 50 ≥ k → visible
    expect(visibles).not.toContain('A'); // 10 < k → masquée
    expect(r.masque).toEqual({ nbCellules: 3, total: 15 }); // X+Y+A (≥2, ≥k) → agrégat restituable
  });
});

describe('ventilerSous_k — seuil DEPUIS la config (pas en dur)', () => {
  it('à k=5 : la même cellule à 10 devient VISIBLE (le masquage suit le seuil)', () => {
    const r = ventilerSous_k(CELLULES, 5);
    const visibles = r.visibles.map((x) => x.c);
    expect(visibles).toContain('A'); // 10 ≥ 5 → désormais visible
    expect(visibles).toContain('B');
    expect(visibles).not.toContain('X'); // 2 < 5 → masquée
    expect(visibles).not.toContain('Y'); // 3 < 5 → masquée
  });
});

describe('ventilerSous_k — suppression SECONDAIRE / anti-soustraction (SPEC §A.5)', () => {
  it('une SEULE cellule < k force à tirer une cellule visible (sinon déductible par soustraction)', () => {
    // [A:10 (<k), B:11 (≥k), C:99] : A seule masquée → on TIRE la plus petite visible (B=11) dans le masqué.
    const r = ventilerSous_k([{ c: 'A', n: 10 }, { c: 'B', n: 11 }, { c: 'C', n: 99 }], 11);
    const visibles = r.visibles.map((x) => x.c);
    expect(visibles).toEqual(['C']); // seule C reste visible
    expect(visibles).not.toContain('B'); // B (11) TIRÉE dans le masqué → non déductible
    expect(r.masque).toEqual({ nbCellules: 2, total: 21 }); // A+B agrégés (≥2, ≥k) → A non isolable
  });

  it('résidu masqué d’UNE seule cellule (rien à tirer) → total CACHÉ (jamais l’exact)', () => {
    const r = ventilerSous_k([{ c: 'A', n: 10 }], 11);
    expect(r).toEqual({ visibles: [], masque: null, insuffisant: true }); // ni cellule ni compte restitués // le compte exact de A n'est jamais restitué
  });

  it('groupe masqué dont la somme < k → total CACHÉ (l’agrégat lui-même est trop petit)', () => {
    const r = ventilerSous_k([{ c: 'A', n: 5 }, { c: 'B', n: 4 }], 11);
    expect(r).toEqual({ visibles: [], masque: null, insuffisant: true }); // somme 9 < 11 → tout supprimé
  });

  it('ANTI-SOUSTRACTION inter-métriques : population totale < k → tout supprimé (rien à soustraire)', () => {
    // Cas provenance : 8 visites d'UN seul referer (< k). Même en connaissant le total (8) d'une métrique
    // FRÈRE (trafic), l'API ne restitue NI la cellule NI son compte → 8 − 0 n'attribue rien.
    const r = ventilerSous_k([{ c: 'referer-niche', n: 8 }], 11);
    expect(r.insuffisant).toBe(true);
    expect(r.visibles).toEqual([]);
    expect(r.masque).toBeNull();
  });

  it('anti-soustraction (résidu SÛR) : masque agrège ≥2 cellules ≥k → aucune isolable, visibles ne fuient pas', () => {
    const r = ventilerSous_k([{ c: 'A', n: 10 }, { c: 'B', n: 11 }, { c: 'C', n: 99 }], 11);
    expect(r.masque?.nbCellules).toBeGreaterThanOrEqual(2); // A+B agrégés (21), non répartissable en 10/11
    expect(JSON.stringify(r.visibles)).not.toMatch(/"A"|"B"/);
  });

  it('toutes ≥ k → rien masqué', () => {
    const r = ventilerSous_k([{ c: 'A', n: 20 }, { c: 'B', n: 30 }], 11);
    expect(r.visibles).toHaveLength(2);
    expect(r.masque).toBeNull();
  });
});

describe('lireSeuilK — lecture runtime depuis la config, repli sûr', () => {
  it('lit la valeur de config (ex. 11)', async () => {
    q.mockResolvedValueOnce([{ valeur: '11' }]);
    expect(await lireSeuilK()).toBe(11);
  });
  it('valeur modifiée en base (5) → suivie', async () => {
    q.mockResolvedValueOnce([{ valeur: '5' }]);
    expect(await lireSeuilK()).toBe(5);
  });
  it('config absente / invalide / erreur → repli K_DEFAUT (11)', async () => {
    q.mockResolvedValueOnce([]); // absente
    expect(await lireSeuilK()).toBe(K_DEFAUT);
    q.mockResolvedValueOnce([{ valeur: 'abc' }]); // invalide
    expect(await lireSeuilK()).toBe(K_DEFAUT);
    q.mockRejectedValueOnce(new Error('DB down')); // erreur
    expect(await lireSeuilK()).toBe(K_DEFAUT);
  });
});
