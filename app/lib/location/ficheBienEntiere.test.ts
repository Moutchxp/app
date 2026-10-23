import { describe, expect, it } from 'vitest';
import { valeursDepuis, champsDuGroupe, GROUPES_FICHE, type PorteeEncart } from './encartBien';
import { changementsAnnexes, changementsFiche, changementStatut, empreinte, refusFiche, type AnnexeLue, type SaisieFiche, type StatutLu } from './ficheBienEntiere';
import { gestesPour } from '../gestion/statutBien';
import type { ComplementsFiche } from './bienComplet';

/**
 * 🔴 Arno (23/10/2026) — « Modifier » la fiche ENTIÈRE dans le formulaire « Nouveau bien » : les changements de toute la fiche (bien,
 * annexes, statut), les refus d'avant toute écriture, l'empreinte (version). PUR.
 */
const BIEN = { categorie: 'logement' as const, adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE',
  etage: '2', porte: '21', numLotCopro: '12', surfaceCarrezM2: 61.8, surfaceExterieureM2: null };
const COMPLEMENTS = { typeLogement: 'appartement', meuble: false, nombrePieces: 3, surfaceHabitableM2: 64.2, batiment: 'B', ascenseur: true, digicode: false,
  commentaire: 'Avant.', dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false, entretiens: [], assurancePno: true, pnoDateAnniversaire: '2026-05-01',
  syndicId: null, syndicNom: null } as unknown as ComplementsFiche;
const PORTEE: PorteeEncart = { famille: 'logement', annexe: false, avecIdFiscal: true, avecCharges: true, avecAg: true, avecEntretien: true, adresseModifiable: true, avecPno: true };
const CAVE: AnnexeLue = { id: 31, categorie: 'cave', etage: '-1', porte: '', numLotCopro: '40', nomAnnexe: '', annotation: '', detachee: false, parkingSituation: '', parkingType: '',
  autreAdresse: false, adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', adresseModifiable: false };
const STATUT: StatutLu = { statut: 'en_gestion', depuis: '2019-03-01', gestes: gestesPour('en_gestion'), disponible: true, suitLot: null };
const lu = (o: Partial<{ portee: PorteeEncart; annexes: AnnexeLue[]; statut: StatutLu | null }> = {}) => ({
  encart: { ...(o.portee ?? PORTEE), valeurs: valeursDepuis(BIEN, COMPLEMENTS) }, annexes: o.annexes ?? [CAVE], statut: o.statut === undefined ? STATUT : o.statut,
});
const saisie = (l: ReturnType<typeof lu>, o: Partial<SaisieFiche> = {}): SaisieFiche => ({
  version: 'v1', valeurs: { ...l.encart.valeurs }, annexes: l.annexes.map((a) => ({ ...a })), statut: null, ...o,
});

describe('🔴 les valeurs pré-remplies : TOUTE la fiche, depuis une seule source', () => {
  it('famille, adresse, PNO s’ajoutent aux valeurs de l’encart ; « Le bien et son adresse » ouvre le formulaire', () => {
    const v = valeursDepuis(BIEN, COMPLEMENTS);
    expect(v).toMatchObject({ categorie: 'logement', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', assurancePno: 'oui', pnoDateAnniversaire: '2026-05-01',
      etage: '2', surfaceCarrezM2: '61,8', commentaire: 'Avant.' });
    expect(GROUPES_FICHE[0]).toBe('bien');
    expect(champsDuGroupe('bien', PORTEE).map((c) => c.cle)).toEqual(['categorie', 'adresse', 'codePostal', 'commune']);
  });
  it('un bien importé : l’adresse n’est pas un champ de la saisie ; une annexe : ni famille, ni PNO', () => {
    expect(champsDuGroupe('bien', { ...PORTEE, adresseModifiable: false }).map((c) => c.cle)).toEqual(['categorie']);
    expect(champsDuGroupe('bien', { ...PORTEE, annexe: true }).map((c) => c.cle)).toEqual(['adresse', 'codePostal', 'commune']);
    expect(champsDuGroupe('dpe', { ...PORTEE, annexe: true }).map((c) => c.cle)).not.toContain('assurancePno');
  });
});

describe('🔴 « aucun champ perdu » : la saisie relue telle quelle ne change rien', () => {
  it('aucun changement, aucun refus', () => {
    const l = lu();
    expect(changementsFiche(l, saisie(l))).toEqual([]);
    expect(refusFiche(l, saisie(l))).toBeNull();
  });
  it('chaque champ montré, changé, apparaît en « Champ : ancienne → nouvelle » (dans l’ordre du formulaire)', () => {
    const l = lu();
    const s = saisie(l, { valeurs: { ...l.encart.valeurs, adresse: '16 rue Carle Hebert', commentaire: 'Après.', assurancePno: 'non', pnoDateAnniversaire: '' } });
    expect(changementsFiche(l, s).map((c) => `${c.champ} : ${c.avant} → ${c.apres}`)).toEqual([
      'Adresse : 15 rue Carle Hebert → 16 rue Carle Hebert',
      'Assurance PNO : oui → non', 'Assurance PNO (date anniversaire) : 01/05/2026 → non renseigné',
      'Commentaire libre : Avant. → Après.',
    ]);
  });
});

describe('🔴 les annexes', () => {
  it('modifiée, ajoutée, sortie du portefeuille', () => {
    const lignes = changementsAnnexes([CAVE], [
      { ...CAVE, etage: '-2', annotation: 'Clé chez le gardien' },
      { ...CAVE, id: null, categorie: 'autre', nomAnnexe: 'Cellier', etage: '', numLotCopro: '', annotation: '' },
    ]);
    expect(lignes.map((c) => `${c.champ} : ${c.avant} → ${c.apres}`)).toEqual([
      'Annexe Cave · lot 40 — étage : sous-sol 1 → sous-sol 2',
      'Annexe Cave · lot 40 — annotation : aucune → Clé chez le gardien',
      'Annexe ajoutée (Cellier) : aucune → à l’adresse du bien',
    ]);
    expect(changementsAnnexes([CAVE], [{ ...CAVE, sortir: true }]).map((c) => c.apres)).toEqual(['sortie du portefeuille (rien n’est effacé)']);
    // Ajoutée puis retirée du formulaire avant validation : rien.
    expect(changementsAnnexes([], [{ ...CAVE, id: null, sortir: true }])).toEqual([]);
  });
  it('refus d’avant toute écriture : nom d’une annexe « Autre », autre adresse vide, parking nu avec annexes, adresse d’une annexe importée', () => {
    const l = lu();
    expect(refusFiche(l, saisie(l, { annexes: [{ ...CAVE }, { ...CAVE, id: null, categorie: 'autre', nomAnnexe: '' }] }))).toMatch(/^Annexe 2 : le nom de l’annexe « Autre » est obligatoire/);
    expect(refusFiche(l, saisie(l, { annexes: [{ ...CAVE, id: null, autreAdresse: true, adresse: '' }] }))).toBe('Annexe 1 : l’autre adresse est à renseigner.');
    expect(refusFiche(l, saisie(l, { valeurs: { ...l.encart.valeurs, categorie: 'parking' } }))).toMatch(/^Un parking nu n’a pas d’annexes/);
    expect(refusFiche(l, saisie(l, { valeurs: { ...l.encart.valeurs, categorie: 'parking' }, annexes: [{ ...CAVE, sortir: true }] }))).toBeNull();
    const autre = { ...CAVE, autreAdresse: true, adresse: '3 rue X' };
    const l2 = lu({ annexes: [autre] });
    expect(refusFiche(l2, saisie(l2, { annexes: [{ ...autre, adresse: '4 rue X' }] }))).toMatch(/tenue par l’import WIPPIMMO/);
  });
});

describe('🔴 l’adresse d’un bien importé et le statut', () => {
  it('l’adresse d’un bien importé (WIPPIMMO) ne se modifie pas ici', () => {
    const l = lu({ portee: { ...PORTEE, adresseModifiable: false } });
    expect(refusFiche(l, saisie(l, { valeurs: { ...l.encart.valeurs, adresse: 'ailleurs' } }))).toBe('L’adresse de ce bien est tenue par l’import WIPPIMMO : elle ne se modifie pas ici.');
  });
  it('seules les transitions permises ; la ligne dit la date d’effet, le motif et le mandat', () => {
    const l = lu();
    const t = { vers: 'location_seule' as const, effetLe: '2026-10-23', motif: 'Fin du mandat', mandat: { sorte: 'transaction' as const, numero: 'MT-4', signeLe: '2026-10-20' } };
    expect(refusFiche(l, saisie(l, { statut: t }))).toBeNull();
    expect(refusFiche(l, saisie(l, { statut: { ...t, vers: 'en_gestion' } }))).toBe('Ce changement de statut n’est pas permis pour ce bien.');
    expect(refusFiche(lu({ statut: { ...STATUT, disponible: false, gestes: [] } }), saisie(l, { statut: t }))).toMatch(/ne peut pas encore changer/);
    expect(changementStatut(STATUT, t).map((c) => `${c.champ} : ${c.avant} → ${c.apres}`))
      .toEqual(['Statut du bien : En gestion → Location seule (au 23/10/2026, motif : Fin du mandat, mandat de transaction locative n° MT-4 signé le 20/10/2026)']);
  });
});

describe('🔴 l’empreinte (version)', () => {
  it('deux lectures égales → même empreinte, quel que soit l’ordre des clés ; un champ changé → une autre', () => {
    const a = { encart: { valeurs: { a: '1', b: '2' } }, annexes: [CAVE] };
    expect(empreinte(a)).toBe(empreinte({ annexes: [{ ...CAVE }], encart: { valeurs: { b: '2', a: '1' } } }));
    expect(empreinte(a)).not.toBe(empreinte({ ...a, encart: { valeurs: { a: '1', b: '3' } } }));
    expect(empreinte(a)).toMatch(/^[0-9a-f]{16}$/);
  });
});
