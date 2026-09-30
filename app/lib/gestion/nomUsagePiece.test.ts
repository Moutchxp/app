import { describe, it, expect } from 'vitest';
import {
  aEteRenommee, cheminTouchantLaProduction, mentionDoublonDossier, mentionRecueSous, nomAffiche,
  nomRepriseDepuisDrive, trierCopiesARenommer, type CopieDrive,
} from './nomUsagePiece';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LES DÉCISIONS, ÉPROUVÉES SANS BASE NI DRIVE ═════════════════════════════
 *
 * Arno : « une pièce jointe ne doit avoir qu'un seul nom, qu'elle soit dans un mail ou dans le Drive ».
 *
 * Tout ce qui se décide est ici : quel nom s'affiche, ce qu'on renomme, ce qu'on refuse, et qui gagne quand deux
 * copies du même fichier portent deux noms différents dans Drive.
 */
const copie = (id: string, o: Partial<CopieDrive> = {}): CopieDrive => ({
  driveFileId: id, dossierId: 'dos-1', dossierNom: '00 Arrivée des mails', origine: 'copie', ...o,
});

describe('🔴 le nom affiché : celui d’usage, sinon celui d’origine', () => {
  it('jamais renommée : le nom d’origine', () => {
    expect(nomAffiche({ nomOrigine: 'scan_0042.pdf', nomUsage: null })).toBe('scan_0042.pdf');
  });

  it('renommée : le nom d’usage', () => {
    expect(nomAffiche({ nomOrigine: 'scan_0042.pdf', nomUsage: 'Quittance juillet.pdf' }))
      .toBe('Quittance juillet.pdf');
  });

  /** ⚠️ UN NOM VIDE N'EST PAS UN NOM : une chaîne blanche en base ne doit pas faire disparaître la pièce. */
  it('⚠️ un nom d’usage blanc retombe sur l’origine', () => {
    expect(nomAffiche({ nomOrigine: 'a.pdf', nomUsage: '   ' })).toBe('a.pdf');
    expect(nomAffiche({ nomOrigine: 'a.pdf', nomUsage: '' })).toBe('a.pdf');
  });

  /**
   * 🔴 LA MENTION EXISTE PARCE QUE LE MAIL N'A PAS CHANGÉ. Gmail garde la pièce sous son nom d'origine et ne
   * permet pas de la renommer : sans elle, on chercherait « Quittance juillet.pdf » dans un mail qui dit
   * « scan_0042.pdf ».
   */
  it('🔴 « reçue sous : … » quand les deux diffèrent, et RIEN sinon', () => {
    expect(mentionRecueSous({ nomOrigine: 'scan_0042.pdf', nomUsage: 'Quittance.pdf' }))
      .toBe('reçue sous : scan_0042.pdf');
    expect(mentionRecueSous({ nomOrigine: 'a.pdf', nomUsage: null })).toBeNull();
    expect(mentionRecueSous({ nomOrigine: 'a.pdf', nomUsage: 'a.pdf' })).toBeNull();
    expect(aEteRenommee({ nomOrigine: 'a.pdf', nomUsage: 'a.pdf' })).toBe(false);
  });
});

describe('🔴🔴 ce qu’on renomme, et ce qu’on refuse', () => {
  it('🔴 un identifiant HORS REGISTRE est refusé, avec son motif', () => {
    const { aRenommer, refus } = trierCopiesARenommer([copie('a'), copie('b')], new Set(['a']));
    expect(aRenommer.map((c) => c.driveFileId)).toEqual(['a']);
    expect(refus[0].driveFileId).toBe('b');
    expect(refus[0].motif).toContain('n’est pas une copie que ce programme a créée');
  });

  /** 🔴🔴 LE DOSSIER PROTÉGÉ L'EMPORTE SUR TOUT, même sur la présence au registre. */
  it('🔴🔴 « Documents clients scannés » est refusé même depuis le registre', () => {
    const { aRenommer, refus } = trierCopiesARenommer(
      [copie('a', { dossierNom: 'Documents clients scannés' })], new Set(['a']));
    expect(aRenommer).toEqual([]);
    expect(refus[0].motif).toContain('Documents clients scannés');
  });

  it('🔴 les trois sous-dossiers de production aussi', () => {
    for (const nom of ['1 actifs', '2 vendus', '3 perdus']) {
      expect(trierCopiesARenommer([copie('a', { dossierNom: nom })], new Set(['a'])).aRenommer, nom).toEqual([]);
    }
  });

  it('🔴 un identifiant de dossier de production CONNU est refusé', () => {
    const { aRenommer } = trierCopiesARenommer(
      [copie('a', { dossierId: 'prod-1' })], new Set(['a']), new Set(['prod-1']));
    expect(aRenommer).toEqual([]);
  });

  /** ⚠️ TROIS FAÇONS DE RECONNAÎTRE LE MÊME INTERDIT : il suffit qu'UNE attrape le cas. */
  it('⚠️ le chemin complet est examiné, pas seulement le dossier immédiat', () => {
    expect(cheminTouchantLaProduction(
      { dossierId: 'd', dossierNom: 'sous-dossier', chemin: 'Documents clients scannés/1 actifs/x' },
    )).not.toBeNull();
    expect(cheminTouchantLaProduction({ dossierId: 'd', dossierNom: '00 Arrivée des mails', chemin: null }))
      .toBeNull();
  });

  it('⚠️ une copie listée deux fois n’est retenue qu’une fois', () => {
    expect(trierCopiesARenommer([copie('a'), copie('a')], new Set(['a'])).aRenommer).toHaveLength(1);
  });

  it('les dépôts de « Ranger » (origine manuelle) sont à nous eux aussi', () => {
    const { aRenommer } = trierCopiesARenommer(
      [copie('a', { origine: 'manuel', dossierNom: '3 Quittances' })], new Set(['a']));
    expect(aRenommer).toHaveLength(1);
  });
});

/**
 * ══ 🔴 QUAND LE NOM A CHANGÉ DANS GOOGLE DRIVE ════════════════════════════════════════════════════════════════
 *
 * Arno : « Si plusieurs copies d'une même pièce ont des noms différents, la plus récemment modifiée gagne. »
 */
describe('🔴 le nom repris depuis Drive', () => {
  it('rien à reprendre quand tout est déjà au bon nom', () => {
    expect(nomRepriseDepuisDrive('Bon.pdf', [
      { driveFileId: 'a', nom: 'Bon.pdf', modifieLe: '2026-09-30T10:00:00Z' },
    ])).toBeNull();
    expect(nomRepriseDepuisDrive('Bon.pdf', [])).toBeNull();
  });

  it('🔴 un nom changé est repris, et l’on sait DE QUELLE copie il vient', () => {
    expect(nomRepriseDepuisDrive('Ancien.pdf', [
      { driveFileId: 'a', nom: 'Neuf.pdf', modifieLe: '2026-09-30T10:00:00Z' },
    ])).toEqual({ nom: 'Neuf.pdf', venantDe: 'a' });
  });

  /**
   * 🔴 LA RÈGLE D'ARBITRAGE, ET C'EN EST UNE : deux copies renommées différemment sont deux intentions
   * contradictoires. Sans règle écrite, on prendrait celle que la requête rend en premier — au hasard, et pas le
   * même hasard d'une fois sur l'autre.
   */
  it('🔴 la plus récemment MODIFIÉE gagne', () => {
    expect(nomRepriseDepuisDrive('Ancien.pdf', [
      { driveFileId: 'a', nom: 'Vieux.pdf', modifieLe: '2026-09-28T10:00:00Z' },
      { driveFileId: 'b', nom: 'Récent.pdf', modifieLe: '2026-09-30T10:00:00Z' },
    ])).toEqual({ nom: 'Récent.pdf', venantDe: 'b' });
  });

  it('⚠️ une date absente ou illisible PERD toujours', () => {
    expect(nomRepriseDepuisDrive('Ancien.pdf', [
      { driveFileId: 'a', nom: 'Sans date.pdf', modifieLe: null },
      { driveFileId: 'b', nom: 'Datée.pdf', modifieLe: '2026-09-01T10:00:00Z' },
    ])).toEqual({ nom: 'Datée.pdf', venantDe: 'b' });
    expect(nomRepriseDepuisDrive('Ancien.pdf', [
      { driveFileId: 'a', nom: 'Illisible.pdf', modifieLe: 'pas une date' },
    ])?.nom).toBe('Illisible.pdf');
  });

  /** ⚠️ À ÉGALITÉ PARFAITE, L'IDENTIFIANT TRANCHE : deux passes doivent donner le MÊME résultat. */
  it('⚠️ à égalité de date, le résultat est STABLE d’une passe à l’autre', () => {
    const vus = [
      { driveFileId: 'aaa', nom: 'A.pdf', modifieLe: '2026-09-30T10:00:00Z' },
      { driveFileId: 'zzz', nom: 'Z.pdf', modifieLe: '2026-09-30T10:00:00Z' },
    ];
    expect(nomRepriseDepuisDrive('X.pdf', vus)).toEqual(nomRepriseDepuisDrive('X.pdf', [...vus].reverse()));
  });

  it('un nom vide dans Drive n’est jamais repris — un nom vide n’est pas un nom', () => {
    expect(nomRepriseDepuisDrive('Bon.pdf', [{ driveFileId: 'a', nom: '   ', modifieLe: null }])).toBeNull();
  });
});

/**
 * 🔴 LE DOUBLON : on fait ce que fait Drive (les deux conservés), et l'on DIT que c'est arrivé. Refuser
 * contredirait Drive ; renommer « (2) » créerait un nom que personne n'a demandé.
 */
describe('🔴 le doublon de nom dans un même dossier', () => {
  it('les deux sont conservés, et le message le dit', () => {
    const m = mentionDoublonDossier('Quittance.pdf', '3 Quittances');
    expect(m).toContain('Quittance.pdf');
    expect(m).toContain('3 Quittances');
    expect(m).toContain('Les deux sont conservés');
  });

  it('sans nom de dossier connu, la phrase reste lisible', () => {
    expect(mentionDoublonDossier('a.pdf', null)).toContain('ce dossier');
  });
});
