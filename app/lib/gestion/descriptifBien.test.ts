import { describe, it, expect } from 'vitest';
import {
  adresseEntiere, descriptifDuBien, descriptifPauvre, DESCRIPTIF_A_COMPLETER, immeubleRepeteLAdresse,
} from './descriptifBien';

/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LE DESCRIPTIF DE LA PASTILLE « i » ══════════════════════════════════════
 *
 * ARNO : « TOUT le descriptif connu du bien […]. Un champ vide n'est pas affiché ; s'il ne reste presque rien,
 * la fenêtre l'indique (“descriptif à compléter dans la fiche du bien”). »
 */
const LOT_360 = {
  cle: '360', nature: 'Appartement meublé', typeBien: 'Type 2',
  adresse: '10 rue Chateaubriand', codePostal: '92320', commune: 'CHATILLON',
  immeuble: '10 rue Chateaubriand',
  gestionDebut: '2021-03-15',
  proprietaires: ['THAI Cécile'],
  occupants: [{ nom: 'MARTIN Paul', depuis: '2024-09-01' }],
  driveDossierId: '1AbC',
};

const libelles = (b: Parameters<typeof descriptifDuBien>[0]) => descriptifDuBien(b).map((l) => l.libelle);
const valeur = (b: Parameters<typeof descriptifDuBien>[0], libelle: string) =>
  descriptifDuBien(b).find((l) => l.libelle === libelle)?.valeur;

describe('🔴🔴 ① tout ce que la base sait, et rien de plus', () => {
  it('🔴 un bien complet rend ses lignes, dans l’ordre d’Arno', () => {
    expect(libelles(LOT_360)).toEqual([
      'Nature', 'Type', 'Adresse', 'Propriétaire', 'Locataire en place',
      'N° de lot', 'En gestion depuis', 'Dossier Drive',
    ]);
  });

  it('🔴 l’adresse est composée en entier', () => {
    expect(valeur(LOT_360, 'Adresse')).toBe('10 rue Chateaubriand, 92320 CHATILLON');
    expect(adresseEntiere({ adresse: '4 rue Hugo', commune: 'PUTEAUX' })).toBe('4 rue Hugo, PUTEAUX');
    expect(adresseEntiere({})).toBe('');
  });

  /** 🔴 LE NUMÉRO DE LOT EST ICI, ET C'EST LA CONTREPARTIE EXACTE DE SON RETRAIT DU TITRE. */
  it('🔴🔴 le numéro de lot est dans la fenêtre d’information', () => {
    expect(valeur(LOT_360, 'N° de lot')).toBe('360');
  });

  it('🔴 les dates sont écrites à la française', () => {
    expect(valeur(LOT_360, 'En gestion depuis')).toBe('15/03/2021');
    expect(valeur(LOT_360, 'Locataire en place')).toBe('MARTIN Paul — depuis le 01/09/2024');
  });

  it('🔴 plusieurs propriétaires sont tous nommés', () => {
    expect(valeur({ ...LOT_360, proprietaires: ['RYAN Aidan', 'RYAN Bernadette'] }, 'Propriétaire'))
      .toBe('RYAN Aidan, RYAN Bernadette');
  });

  it('🔴 plusieurs occupants font plusieurs lignes', () => {
    const l = descriptifDuBien({ ...LOT_360, occupants: [{ nom: 'A', depuis: '2024-01-01' }, { nom: 'B' }] })
      .filter((x) => x.libelle === 'Locataire en place');
    expect(l.map((x) => x.valeur)).toEqual(['A — depuis le 01/01/2024', 'B']);
  });

  /** ⚠️ UN CHAMP VIDE N'EST PAS AFFICHÉ — la règle d'Arno, et ce qui rend la liste honnête. */
  it('⚠️ aucun champ vide, aucune ligne vide', () => {
    const l = descriptifDuBien({ cle: '9', nature: 'Parking', proprietaires: [], occupants: [] });
    expect(l.map((x) => x.libelle)).toEqual(['Nature', 'N° de lot']);
    expect(l.every((x) => x.valeur.trim() !== '')).toBe(true);
  });

  /**
   * 🔴🔴 LES CHAMPS QUI N'EXISTENT PAS EN BASE (étage, surface, pièces, annexes, escalier) SONT PRÉVUS, et
   * s'afficheront le jour où l'import les portera. Aujourd'hui, ils ne s'inventent pas.
   */
  it('🔴🔴 étage, surface, pièces, annexes et escalier s’affichent DÈS qu’ils existent', () => {
    const l = descriptifDuBien({
      ...LOT_360, etage: '2e étage', surface: '48 m²', pieces: '3', annexes: 'parking, cave',
      escalier: 'Escalier B',
    });
    expect(l.map((x) => x.libelle)).toEqual([
      'Nature', 'Type', 'Nombre de pièces', 'Surface', 'Annexes', 'Adresse', 'Étage', 'Escalier',
      'Propriétaire', 'Locataire en place', 'N° de lot', 'En gestion depuis', 'Dossier Drive',
    ]);
  });

  it('⚠️ …et ils sont absents quand la base ne les porte pas', () => {
    expect(libelles(LOT_360)).not.toContain('Étage');
    expect(libelles(LOT_360)).not.toContain('Surface');
  });
});

/**
 * ⚠️ LE BÂTIMENT N'EST ÉCRIT QUE S'IL APPREND QUELQUE CHOSE : mesuré, l'immense majorité des lots porte
 * `immeuble` = `adresse`, et répéter l'adresse sous un autre libellé ferait douter qu'on lise la bonne fiche.
 */
describe('⚠️ ② le bâtiment, seulement s’il apprend quelque chose', () => {
  it('⚠️ un bâtiment qui répète l’adresse n’est pas écrit', () => {
    expect(libelles(LOT_360)).not.toContain('Bâtiment');
    expect(immeubleRepeteLAdresse(LOT_360)).toBe(true);
  });

  it('🔴 un vrai bâtiment est écrit', () => {
    expect(valeur({ ...LOT_360, immeuble: 'Bât. B — escalier 2' }, 'Bâtiment')).toBe('Bât. B — escalier 2');
  });

  it('⚠️ un bâtiment absent n’est pas un bâtiment différent', () => {
    expect(immeubleRepeteLAdresse({ adresse: '4 rue Hugo' })).toBe(true);
  });
});

/**
 * ══ 🔴🔴 ③ « S'IL NE RESTE PRESQUE RIEN, LA FENÊTRE L'INDIQUE » ════════════════════════════════════════════════
 *
 * « Presque rien » = rien au-delà de ce que le TITRE disait déjà (nature, type, adresse). Une fenêtre qui ne
 * ferait que répéter le titre laisserait croire que le bien est décrit alors qu'il ne l'est pas.
 */
describe('🔴🔴 ③ un descriptif qui n’apprend rien le DIT', () => {
  it('🔴🔴 nature, type et adresse seuls : la fenêtre l’indique', () => {
    const l = descriptifDuBien({
      nature: 'Appartement', typeBien: 'Studio', adresse: '4 rue Hugo', commune: 'PUTEAUX',
    });
    expect(l).toHaveLength(3);
    expect(descriptifPauvre(l)).toBe(true);
    expect(DESCRIPTIF_A_COMPLETER).toBe('Descriptif à compléter dans la fiche du bien.');
  });

  it('🔴 un seul champ de plus suffit à ne plus le dire', () => {
    expect(descriptifPauvre(descriptifDuBien({ nature: 'Appartement', cle: '12' }))).toBe(false);
    expect(descriptifPauvre(descriptifDuBien({ nature: 'Appartement', proprietaires: ['X'] }))).toBe(false);
  });

  it('⚠️ une fiche entièrement vide est pauvre, elle aussi', () => {
    expect(descriptifPauvre(descriptifDuBien({}))).toBe(true);
  });

  it('⚠️ une fiche complète ne l’est pas', () => {
    expect(descriptifPauvre(descriptifDuBien(LOT_360))).toBe(false);
  });
});

/** 🔒 PAS D'E/S : ce module décide de ce qui s'affiche, il ne lit rien. */
describe('🔒 module pur', () => {
  it('🔒 aucun import', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/descriptifBien.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
