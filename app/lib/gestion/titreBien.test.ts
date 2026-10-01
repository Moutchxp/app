import { describe, it, expect } from 'vitest';
import { qualiteDuBien, sansNumeroDeLot, titreDuBien, titreParmi, titresDistincts } from './titreBien';

/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LE TITRE D'UN BIEN ══════════════════════════════════════════════════════
 *
 * ARNO (01/10/2026) : « le titre d'un bien devient “adresse — Type de bien”, par exemple “10 rue Chateaubriand,
 * CHATILLON — Appartement meublé · Type 2” et “10 rue Chateaubriand, CHATILLON — Parking”. Le numéro de lot
 * n'apparaît plus dans le titre. »
 */
const CHATEAUBRIAND = '10 rue Chateaubriand, CHATILLON';

describe('🔴🔴 ① les deux exemples d’Arno, mot pour mot', () => {
  it('🔴🔴 un logement : « adresse — Nature · Type »', () => {
    expect(titreDuBien({
      cle: '360', adresse: CHATEAUBRIAND, nature: 'Appartement meublé', typeBien: 'Type 2',
    })).toBe('10 rue Chateaubriand, CHATILLON — Appartement meublé · Type 2');
  });

  /** 🔴 « Parking · Garage » se lirait comme une hésitation : pour un parking, la nature dit tout. */
  it('🔴🔴 un parking : « adresse — Parking », sans son type', () => {
    expect(titreDuBien({
      cle: '397', adresse: CHATEAUBRIAND, nature: 'Parking', typeBien: 'Garage',
    })).toBe('10 rue Chateaubriand, CHATILLON — Parking');
  });

  /** 🔴🔴 LA PROMESSE DU LOT : plus aucun numéro de lot dans un titre. */
  it('🔴🔴 aucun des deux ne porte de numéro de lot', () => {
    for (const b of [
      { cle: '360', adresse: CHATEAUBRIAND, nature: 'Appartement meublé', typeBien: 'Type 2' },
      { cle: '397', adresse: CHATEAUBRIAND, nature: 'Parking', typeBien: 'Garage' },
    ]) {
      expect(titreDuBien(b)).not.toContain('lot');
      expect(sansNumeroDeLot(titreDuBien(b))).toBe(true);
    }
  });
});

describe('🔴 ② la qualité, cas par cas', () => {
  it('🔴 un logement réunit la nature et le type', () => {
    expect(qualiteDuBien({ nature: 'Appartement', typeBien: 'Studio' })).toBe('Appartement · Studio');
    expect(qualiteDuBien({ nature: 'Maison', typeBien: 'Type 6' })).toBe('Maison · Type 6');
  });

  it('🔴 un parking, un garage, un box : la nature seule', () => {
    expect(qualiteDuBien({ nature: 'Parking', typeBien: 'Garage' })).toBe('Parking');
    expect(qualiteDuBien({ nature: 'Garage', typeBien: 'Garage' })).toBe('Garage');
    expect(qualiteDuBien({ nature: 'Box', typeBien: 'Garage' })).toBe('Box');
  });

  it('🔴 une cave aussi', () => {
    expect(qualiteDuBien({ nature: 'Cave', typeBien: 'Cellier' })).toBe('Cave');
  });

  /** ⚠️ UN IMPORT QUI REMPLIT LES DEUX PAREIL NE DOIT PAS ÉCRIRE « Studio · Studio ». */
  it('⚠️ jamais deux fois le même mot', () => {
    expect(qualiteDuBien({ nature: 'Studio', typeBien: 'studio' })).toBe('Studio');
  });

  it('⚠️ un seul des deux champs : celui qui est là', () => {
    expect(qualiteDuBien({ nature: 'Local commercial', typeBien: null })).toBe('Local commercial');
    expect(qualiteDuBien({ nature: null, typeBien: 'Type 3' })).toBe('Type 3');
  });

  it('⚠️ aucun des deux : rien, et surtout rien d’inventé', () => {
    expect(qualiteDuBien({})).toBe('');
  });
});

describe('⚠️ ③ ce qui manque ne casse pas le titre', () => {
  it('sans qualité : l’adresse seule', () => {
    expect(titreDuBien({ cle: '283', adresse: '126 rue de Villiers, LEVALLOIS PERRET' }))
      .toBe('126 rue de Villiers, LEVALLOIS PERRET');
  });

  it('sans adresse : la qualité seule', () => {
    expect(titreDuBien({ cle: '9', nature: 'Parking' })).toBe('Parking');
  });

  /** ⚠️ UN TITRE BLANC DANS UNE LISTE À COCHER EST UNE LIGNE QU'ON NE PEUT NI LIRE NI DÉSIGNER. */
  it('⚠️ rien du tout : la clé, en dernier recours', () => {
    expect(titreDuBien({ cle: '77' })).toBe('Lot 77');
    expect(titreDuBien({})).toBe('');
  });
});

/**
 * ══ 🔴🔴 ④ DEUX BIENS QUI SE RESSEMBLENT ══════════════════════════════════════════════════════════════════════
 *
 * ARNO : « Deux biens de même adresse et même type : départager par l'étage ou la mention utile la plus courte
 * (“2e étage”, “bât. B”), jamais par le numéro de lot seul. »
 *
 * ⚠️ MESURÉ LE 01/10/2026 : `gestion_annuaire_lot` n'a NI étage, NI surface, NI nombre de pièces. La seule
 * mention disponible est le BÂTIMENT (`immeuble`) — et c'est donc elle qu'on emploie.
 */
describe('🔴🔴 ④ départager deux biens homonymes', () => {
  const A = { cle: '1', adresse: '4 rue Hugo, PUTEAUX', nature: 'Appartement', typeBien: 'Studio' };

  it('🔴 des biens DIFFÉRENTS gardent leur titre nu', () => {
    expect(titresDistincts([A, { ...A, cle: '2', typeBien: 'Type 2' }]).map((x) => x.titre))
      .toEqual(['4 rue Hugo, PUTEAUX — Appartement · Studio', '4 rue Hugo, PUTEAUX — Appartement · Type 2']);
  });

  it('🔴🔴 deux homonymes sont départagés par le BÂTIMENT', () => {
    const t = titresDistincts([
      { ...A, cle: '1', immeuble: 'Bât. A' },
      { ...A, cle: '2', immeuble: 'Bât. B' },
    ]).map((x) => x.titre);
    expect(t).toEqual([
      '4 rue Hugo, PUTEAUX — Appartement · Studio · Bât. A',
      '4 rue Hugo, PUTEAUX — Appartement · Studio · Bât. B',
    ]);
    // 🔴 ET SURTOUT PAS PAR LE NUMÉRO DE LOT : c'est la demande, au mot près.
    for (const x of t) expect(sansNumeroDeLot(x)).toBe(true);
  });

  /** ⚠️ UN BÂTIMENT QUI RÉPÈTE L'ADRESSE N'APPREND RIEN : 283 lots sur 365 ont `immeuble` = `adresse`. */
  it('⚠️ un bâtiment qui répète l’adresse ne départage pas', () => {
    const t = titresDistincts([
      { ...A, cle: '1', immeuble: '4 rue Hugo' },
      { ...A, cle: '2', immeuble: '4 rue Hugo' },
    ]).map((x) => x.titre);
    expect(t).toEqual([
      '4 rue Hugo, PUTEAUX — Appartement · Studio · lot 1',
      '4 rue Hugo, PUTEAUX — Appartement · Studio · lot 2',
    ]);
  });

  /**
   * 🔴 LE NUMÉRO EN DERNIER RECOURS, ET SEULEMENT LÀ. Deux titres rigoureusement identiques dans une liste à
   * cocher sont pires que le numéro qu'on voulait cacher : on ne saurait plus laquelle des cases on coche.
   */
  it('🔴 rien pour départager : le numéro, et il ne sert QU’À ÇA', () => {
    const t = titresDistincts([{ ...A, cle: '1' }, { ...A, cle: '2' }]).map((x) => x.titre);
    expect(t[0]).toContain('lot 1');
    expect(t[1]).toContain('lot 2');
    expect(t[0]).not.toBe(t[1]);
  });

  it('⚠️ un bien seul n’est jamais départagé de personne', () => {
    expect(titresDistincts([{ ...A, immeuble: 'Bât. A' }])[0].titre)
      .toBe('4 rue Hugo, PUTEAUX — Appartement · Studio');
  });

  it('le raccourci `titreParmi` rend le même titre que la liste', () => {
    const liste = [{ ...A, cle: '1', immeuble: 'Bât. A' }, { ...A, cle: '2', immeuble: 'Bât. B' }];
    expect(titreParmi(liste, '2')).toBe('4 rue Hugo, PUTEAUX — Appartement · Studio · Bât. B');
    expect(titreParmi(liste, 'inconnu')).toBe('');
  });
});

/** 🔒 PAS D'E/S : ce module décide, il ne lit rien. */
describe('🔒 module sans entrée-sortie', () => {
  it('🔒 il n’importe que la règle des catégories', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/titreBien.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([
      "import { categorieDuBien } from './categorieBien';",
    ]);
    expect(/fetch\(|query\(/.test(src)).toBe(false);
  });
});
