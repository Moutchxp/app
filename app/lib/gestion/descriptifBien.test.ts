import { describe, it, expect } from 'vitest';
import {
  adresseEntiere, descriptifDuBien, descriptifHorsLigne, AUCUN_DETAIL_SUPPLEMENTAIRE, immeubleRepeteLAdresse,
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
      'Nature', 'Type', 'Adresse', 'Propriétaire', 'Locataire en place', 'Date d’entrée',
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
    expect(valeur(LOT_360, 'Date d’entrée')).toBe('01/09/2024');
  });

  /**
   * 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — LE NOM ET LA DATE SONT DEUX LIGNES. Arno veut pouvoir cacher le
   * locataire déjà visible sur la ligne SANS perdre sa date d'entrée, qu'il demande expressément de garder.
   */
  it('🔴🔴 le locataire et sa date d’entrée sont deux lignes distinctes', () => {
    expect(valeur(LOT_360, 'Locataire en place')).toBe('MARTIN Paul');
    expect(valeur(LOT_360, 'Date d’entrée')).toBe('01/09/2024');
  });

  it('🔴 plusieurs propriétaires sont tous nommés', () => {
    expect(valeur({ ...LOT_360, proprietaires: ['RYAN Aidan', 'RYAN Bernadette'] }, 'Propriétaire'))
      .toBe('RYAN Aidan, RYAN Bernadette');
  });

  it('🔴 plusieurs occupants font plusieurs lignes', () => {
    const l = descriptifDuBien({ ...LOT_360, occupants: [{ nom: 'A', depuis: '2024-01-01' }, { nom: 'B' }] })
      .filter((x) => x.libelle === 'Locataire en place' || x.libelle === 'Date d’entrée');
    expect(l.map((x) => x.valeur)).toEqual(['A', '01/01/2024', 'B']);
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
      'Propriétaire', 'Locataire en place', 'Date d’entrée', 'N° de lot', 'En gestion depuis', 'Dossier Drive',
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
 * ══ 🔴🔴 ③ LOT PROPOSITIONS-EMAILS-MULTIPLES — LA FENÊTRE NE RÉPÈTE PAS LA LIGNE ═══════════════════════════════
 *
 * ARNO (01/10/2026) : « Elle n'affiche que ce qui n'est PAS déjà sur la ligne : ni l'adresse, ni le type, ni le
 * propriétaire, ni le locataire en place s'ils sont déjà visibles. Elle garde le reste […]. S'il ne reste rien :
 * “Aucun détail supplémentaire — compléter la fiche du bien”, avec le lien. »
 */
describe('🔴🔴 ③ ce qui est déjà sur la ligne n’est pas répété', () => {
  /** Ce que l'écran de rattachement affiche vraiment : le titre du bien, puis ses parties. */
  const LIGNE = '10 rue Chateaubriand, CHATILLON — Appartement meublé · Type 2'
    + ' propriétaire THAI Cécile locataire MARTIN Paul';

  it('🔴🔴 adresse, nature, type, propriétaire et locataire disparaissent de la fenêtre', () => {
    const restant = descriptifHorsLigne(descriptifDuBien(LOT_360), LIGNE).map((l) => l.libelle);
    for (const parti of ['Adresse', 'Nature', 'Type', 'Propriétaire', 'Locataire en place']) {
      expect(restant, parti).not.toContain(parti);
    }
  });

  /** 🔴 ET LE RESTE EST GARDÉ — y compris la date d'entrée, qu'Arno nomme expressément. */
  it('🔴🔴 le reste est gardé : date d’entrée, n° de lot, gestion, Drive', () => {
    expect(descriptifHorsLigne(descriptifDuBien(LOT_360), LIGNE).map((l) => l.libelle))
      .toEqual(['Date d’entrée', 'N° de lot', 'En gestion depuis', 'Dossier Drive']);
  });

  /** ⚠️ LE CODE POSTAL N'EST PAS SUR LA LIGNE, et il ne doit pas suffire à faire répéter l'adresse. */
  it('⚠️ l’adresse part même si la ligne n’écrit pas le code postal', () => {
    const l = descriptifHorsLigne(descriptifDuBien(LOT_360), '10 rue Chateaubriand, CHATILLON');
    expect(l.map((x) => x.libelle)).not.toContain('Adresse');
  });

  it('🔴 ce que la ligne NE dit PAS reste affiché', () => {
    const l = descriptifHorsLigne(descriptifDuBien(LOT_360), '10 rue Chateaubriand, CHATILLON');
    expect(l.map((x) => x.libelle)).toContain('Propriétaire');
    expect(l.map((x) => x.libelle)).toContain('Nature');
  });

  /** ⚠️ SANS LIGNE CONNUE, ON NE RETIRE RIEN : le doute profite à ce qui se voit. */
  it('⚠️ une ligne inconnue ne fait rien disparaître', () => {
    expect(descriptifHorsLigne(descriptifDuBien(LOT_360), null)).toHaveLength(9);
    expect(descriptifHorsLigne(descriptifDuBien(LOT_360), '   ')).toHaveLength(9);
  });

  /** 🔴 LE N° DE LOT N'EST JAMAIS EFFACÉ, même si la ligne contient son nombre par hasard. */
  it('🔴🔴 le n° de lot survit à tout : c’est l’identité du bien', () => {
    expect(descriptifHorsLigne(descriptifDuBien(LOT_360), 'lot 360 — 10 rue Chateaubriand')
      .map((l) => l.libelle)).toContain('N° de lot');
  });

  it('🔴 quand il ne reste rien, la phrase d’Arno est celle-ci', () => {
    const tout = descriptifDuBien({ nature: 'Appartement', typeBien: 'Studio', adresse: '4 rue Hugo' });
    expect(descriptifHorsLigne(tout, '4 rue Hugo — Appartement · Studio')).toEqual([]);
    expect(AUCUN_DETAIL_SUPPLEMENTAIRE).toBe('Aucun détail supplémentaire — compléter la fiche du bien');
  });

  it('⚠️ une fiche entièrement vide ne rend aucune ligne', () => {
    expect(descriptifHorsLigne(descriptifDuBien({}), 'quoi que ce soit')).toEqual([]);
  });
});

/** 🔒 PAS D'E/S : ce module décide de ce qui s'affiche, il ne lit rien. */
describe('🔒 module pur', () => {
  it('🔒 aucun import', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/descriptifBien.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
