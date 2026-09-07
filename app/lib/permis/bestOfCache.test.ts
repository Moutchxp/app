import { describe, it, expect, beforeEach } from 'vitest';
import { empreinteGed, bestOfMemo, _viderBestOfCache } from './bestOfCache';

beforeEach(() => _viderBestOfCache());

const A = { id: 1, cleStockage: 'k1', tailleOctets: 100, nomFichier: 'a.pdf' };
const B = { id: 2, cleStockage: 'k2', tailleOctets: 200, nomFichier: 'b.pdf' };

describe('P1 — empreinteGed : change à TOUTE mutation de la GED (ajout / suppression / remplacement / renommage)', () => {
  it('STABLE par permutation d’ordre (tri interne par id) → un simple ré-ordre n’invalide pas', () => {
    expect(empreinteGed([A, B])).toBe(empreinteGed([B, A]));
  });
  it('🔴 AJOUT d’une pièce → empreinte DIFFÉRENTE', () => {
    expect(empreinteGed([A])).not.toBe(empreinteGed([A, B]));
  });
  it('🔴 SUPPRESSION d’une pièce → empreinte DIFFÉRENTE', () => {
    expect(empreinteGed([A, B])).not.toBe(empreinteGed([A]));
  });
  it('🔴 REMPLACEMENT (même id, clé de stockage OU taille change) → empreinte DIFFÉRENTE', () => {
    expect(empreinteGed([A])).not.toBe(empreinteGed([{ ...A, cleStockage: 'k1-bis' }]));
    expect(empreinteGed([A])).not.toBe(empreinteGed([{ ...A, tailleOctets: 101 }]));
  });
  it('🔴 RENOMMAGE (même id/clé/taille, nom change) → empreinte DIFFÉRENTE', () => {
    expect(empreinteGed([A])).not.toBe(empreinteGed([{ ...A, nomFichier: 'renomme.pdf' }]));
  });
  it('taille NULL tolérée (chaîne stable)', () => {
    expect(empreinteGed([{ ...A, tailleOctets: null }])).toBe(empreinteGed([{ ...A, tailleOctets: null }]));
  });
});

describe('P1 — bestOfMemo : cache par (dossier + empreinte), invalidation par clé, isolation, prudence', () => {
  it('MÊME clé → `calcul` exécuté UNE seule fois (chaud = gratuit) ; valeur identique servie', async () => {
    let n = 0;
    const calc = async () => { n += 1; return { valeur: { x: n }, cachable: true }; };
    const v1 = await bestOfMemo(7424, 'emp', calc);
    const v2 = await bestOfMemo(7424, 'emp', calc);
    expect(n).toBe(1);
    expect(v2).toBe(v1); // même référence cachée → best-of octet pour octet identique
  });
  it('🔴 empreinte DIFFÉRENTE (GED modifiée) → RECALCUL (invalidation par la clé)', async () => {
    let n = 0;
    const calc = async () => { n += 1; return { valeur: { x: n }, cachable: true }; };
    await bestOfMemo(7424, 'emp-A', calc);
    await bestOfMemo(7424, 'emp-B', calc);
    expect(n).toBe(2);
  });
  it('🔴 ISOLATION : un AUTRE dossier (même empreinte) ne lit JAMAIS l’entrée', async () => {
    let n = 0;
    const calc = async () => { n += 1; return { valeur: { x: n }, cachable: true }; };
    await bestOfMemo(7424, 'emp', calc);
    await bestOfMemo(11430, 'emp', calc);
    expect(n).toBe(2);
  });
  it('🔴 PRUDENCE : `cachable=false` (extraction en échec, possiblement transitoire) → NON mis en cache → recalculé', async () => {
    let n = 0;
    const calc = async () => { n += 1; return { valeur: { x: n }, cachable: false }; };
    await bestOfMemo(7424, 'emp', calc);
    await bestOfMemo(7424, 'emp', calc);
    expect(n).toBe(2); // en cas de doute, recalcule (jamais un best-of dégradé figé)
  });
});
