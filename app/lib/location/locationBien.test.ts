import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categorieDuBien, enArbre, libelleEtage, resumeBien, verifierChampsBien } from './locationBien';

/** 🔴 TUILE LOCATION (correction d'Arno du 17/10/2026) — le bien, ses annexes en arbre, et les gardes de la tuile. */
describe('la catégorie d’un bien : saisie, sinon déduite de WIPPIMMO (sans rien écrire)', () => {
  it('saisie prioritaire, puis déduction, puis logement', () => {
    expect(categorieDuBien({ categorie: 'cave', nature: 'Appartement', typeBien: null })).toBe('cave');
    expect(categorieDuBien({ categorie: null, nature: 'Parking', typeBien: 'Garage' })).toBe('parking');
    expect(categorieDuBien({ categorie: null, nature: 'Local commercial', typeBien: '' })).toBe('local');
    expect(categorieDuBien({ categorie: null, nature: 'Appartement meublé', typeBien: 'Studio' })).toBe('logement');
  });
});

describe('les champs d’un bien : tout est facultatif, les nombres sont des nombres', () => {
  it('surfaces au format français, code postal à 5 chiffres, catégorie fermée', () => {
    const v = verifierChampsBien({ etage: ' 3 ', porte: 'G', numLotCopro: '27', surfaceCarrezM2: '41,8', surfaceExterieureM2: '4', categorie: 'logement' });
    expect(v).toEqual({ ok: true, valeurs: { categorie: 'logement', etage: '3', porte: 'G', numLotCopro: '27', surfaceCarrezM2: 41.8,
      surfaceExterieureM2: 4, adresse: null, codePostal: null, commune: null } });
    expect(verifierChampsBien({ surfaceCarrezM2: 'grand' }).ok).toBe(false);
    expect(verifierChampsBien({ codePostal: '7501' }).ok).toBe(false);
    expect(verifierChampsBien({ categorie: 'chateau' }).ok).toBe(false);
    expect(verifierChampsBien({}).ok).toBe(true);
  });
  it('libellés : étage et résumé', () => {
    expect(libelleEtage('3')).toBe('3e étage');
    expect(libelleEtage('0')).toBe('rez-de-chaussée');
    expect(libelleEtage('-1')).toBe('sous-sol 1');
    expect(libelleEtage('RDC')).toBe('RDC');
    expect(resumeBien({ etage: '-2', porte: '52', numLotCopro: '152', surfaceCarrezM2: null, surfaceExterieureM2: null, categorie: 'parking' }))
      .toBe('sous-sol 2 · place 52 · lot de copro n° 152');
  });
});

describe('l’arbre : chaque logement suivi de ses annexes', () => {
  it('range les annexes sous leur logement ; une annexe orpheline reste visible', () => {
    const a = enArbre([{ id: 1, parentId: null }, { id: 2, parentId: 1 }, { id: 3, parentId: 1 }, { id: 4, parentId: 99 }, { id: 5, parentId: null }]);
    expect(a.map((x) => [x.bien.id, x.annexes.map((y) => y.id)])).toEqual([[1, [2, 3]], [4, []], [5, []]]);
  });
});

describe('🔴 gardes de la tuile Location', () => {
  const norm = (f: string): string => readFileSync(f, 'utf8').replace(/\s+/g, ' ');
  it('la route relit le droit Location à chaque appel (GET et POST) et n’offre aucune suppression', () => {
    const route = norm('app/(admin)/api/admin/location/route.ts');
    expect(route.match(/await exigerLocation\(request\)/g)).toHaveLength(2);
    expect(route).not.toMatch(/supprimerPersonne|DELETE/);
  });
  it('le dépôt n’efface rien et ne touche jamais l’adresse d’un bien importé', () => {
    const repo = norm('app/lib/location/locationRepo.ts');
    expect(repo).not.toMatch(/DELETE FROM|TRUNCATE/);
    expect(repo).toContain("const app = rows[0].wippimmo_id.startsWith('app-');");
    expect(repo).toContain("${app ? \", adresse = $8, code_postal = $9, commune = $10, adresse_normalisee = $11\" : ''}");
  });
  it('les écrans de la Location vivent sous /admin/location (et pas dans la Gestion)', () => {
    for (const f of ['AccueilLocation.tsx', 'FicheBienLocation.tsx', 'FichePersonneLocation.tsx', 'CreationProprietaireBien.tsx']) {
      const src = readFileSync(`app/(admin)/admin/(protected)/location/${f}`, 'utf8');
      expect(src, f).not.toMatch(/\/api\/admin\/gestion\b/);
    }
  });
});
