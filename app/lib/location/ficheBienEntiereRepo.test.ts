import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (23/10/2026) — « Modifier » la fiche entière, côté serveur : la VERSION d'abord (rien n'est écrit sur une version
 * dépassée), les refus avant toute écriture, puis chaque partie par le geste qui l'écrivait déjà (encart, annexes, statut et ses
 * suites Drive / mail). Toutes les écritures sont simulées : rien n'est écrit.
 */
vi.mock('server-only', () => ({}));
const fiche = vi.fn();
const modifierBien = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: undefined }) as { etat: string; motif?: string });
vi.mock('./locationRepo', () => ({ ficheBienLocation: (...a: unknown[]) => fiche(...a), modifierBien: (...a: unknown[]) => modifierBien(...a) }));
const modifierEncartBien = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { changements: [] as { cle: string; champ: string }[] } }) as { etat: string; motif?: string; data?: { changements: { cle: string; champ: string }[] } });
const journaliser = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('./encartBienRepo', async (orig) => {
  const vrai = await orig<typeof import('./encartBienRepo')>();
  return { lectureDepuisFiche: vrai.lectureDepuisFiche, modifierEncartBien: (...a: unknown[]) => modifierEncartBien(...a), journaliser: (...a: unknown[]) => journaliser(...a) };
});
vi.mock('./creationBienRepo', () => ({ annexeNomPnoDisponible: async () => true, ajouterAnnexesCompletes: (...a: unknown[]) => ajouterAnnexesCompletes(...a) }));
const ajouterAnnexesCompletes = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { ids: [90] } }) as { etat: string; motif?: string });
const detacherAnnexe = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: undefined }) as { etat: string; motif?: string });
vi.mock('./entretienAnnexeRepo', () => ({ detacherAnnexe: (...a: unknown[]) => detacherAnnexe(...a) }));
const sortirDuPortefeuille = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { lots: [31] } }) as { etat: string; motif?: string; data?: { lots: number[] } });
vi.mock('./portefeuilleRepo', () => ({ sortirDuPortefeuille: (...a: unknown[]) => sortirDuPortefeuille(...a) }));
const avecMail = vi.fn(async (r: unknown) => r);
vi.mock('./mailPortefeuilleRepo', () => ({ avecMail: (r: unknown) => avecMail(r) }));
vi.mock('./resumeBienRepo', () => ({ resumeDuBien: async () => ({ proprietaires: [{ nom: 'DURAND Léa' }], mandat: null }) }));
const lireStatutBien = vi.fn();
vi.mock('../gestion/statutBienRepo', () => ({ lireStatutBien: (...a: unknown[]) => lireStatutBien(...a) }));
const transition = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { lots: [7, 31], avertissement: null }, drive: { ok: true, motif: null } }) as unknown);
vi.mock('../gestion/statutBienSuites', () => ({ transitionStatutAvecSuites: (...a: unknown[]) => transition(...a) }));
const { lireFicheEntiere, modifierFicheEntiere, versionDuBien } = await import('./ficheBienEntiereRepo');
const { gestesPour } = await import('../gestion/statutBien');

const AUTEUR = { id: 5, libelle: 'arno@exemple.test' };
const BIEN = { id: 7, parentId: null, categorie: 'logement', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', creeDansLApplication: true,
  etage: '2', porte: '21', numLotCopro: '12', surfaceCarrezM2: 61.8, surfaceExterieureM2: null };
const CAVE = { id: 31, parentId: 7, categorie: 'cave', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', creeDansLApplication: false,
  etage: '-1', porte: null, numLotCopro: '40', surfaceCarrezM2: null, surfaceExterieureM2: null, adresseAutre: false, nomAnnexe: null, annotation: null, detachee: false };
const SORTIE = { ...CAVE, id: 32, sorti: true };
const COMPLEMENTS = { typeLogement: 'appartement', meuble: false, nombrePieces: 3, commentaire: 'Avant.', dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false,
  entretiens: [], idFiscal: null, chargesCopro: null, agApplicable: true, assurancePno: null, pnoDateAnniversaire: null };

beforeEach(() => {
  for (const f of [modifierBien, modifierEncartBien, journaliser, ajouterAnnexesCompletes, detacherAnnexe, sortirDuPortefeuille, transition]) f.mockClear();
  fiche.mockResolvedValue({ etat: 'ok', data: { bien: { ...BIEN }, complements: { ...COMPLEMENTS }, annexes: [{ ...CAVE }, { ...SORTIE }] } });
  lireStatutBien.mockResolvedValue({ disponible: true, lotId: 7, statut: 'en_gestion', depuis: '2019-03-01', suitLot: null, gestes: gestesPour('en_gestion'), archiveLe: null });
  modifierEncartBien.mockResolvedValue({ etat: 'ok', data: { changements: [] } });
});
const ecritures = () => [modifierBien, modifierEncartBien, ajouterAnnexesCompletes, detacherAnnexe, sortirDuPortefeuille, transition].reduce((n, f) => n + f.mock.calls.length, 0);
const lue = async () => { const r = await lireFicheEntiere(7); if (r.etat !== 'ok') throw new Error(r.etat); return r.data; };

describe('🔴 la lecture : toute la fiche, une empreinte', () => {
  it('valeurs, annexes DANS le portefeuille (une annexe sortie n’est pas modifiable ici), statut, propriétaires', async () => {
    const l = await lue();
    expect(l.encart.valeurs).toMatchObject({ adresse: '15 rue Carle Hebert', categorie: 'logement', commentaire: 'Avant.', surfaceCarrezM2: '61,8' });
    expect(l.encart.adresseModifiable).toBe(true);
    expect(l.annexes.map((a) => a.id)).toEqual([31]);
    expect(l.statut?.gestes.map((g) => g.cle)).toEqual(gestesPour('en_gestion').map((g) => g.cle));
    expect(l.proprietaires).toEqual(['DURAND Léa']);
    expect((await versionDuBien(7))).toEqual({ etat: 'ok', data: { version: l.version } });
  });
  it('le bien changé en base → une autre empreinte', async () => {
    const v1 = (await lue()).version;
    fiche.mockResolvedValue({ etat: 'ok', data: { bien: { ...BIEN, etage: '3' }, complements: { ...COMPLEMENTS }, annexes: [{ ...CAVE }] } });
    expect((await lue()).version).not.toBe(v1);
  });
});

describe('🔴 « Ce bien a été modifié par ailleurs — recharger ? »', () => {
  it('version dépassée : RIEN n’est écrit, l’issue « conflit » le dit', async () => {
    const l = await lue();
    const r = await modifierFicheEntiere(7, { version: 'autre', valeurs: { ...l.encart.valeurs, commentaire: 'Après.' }, annexes: l.annexes }, AUTEUR, 'Gestion');
    expect(r).toEqual({ etat: 'conflit', motif: 'Ce bien a été modifié par ailleurs — recharger ?' });
    expect(ecritures()).toBe(0);
  });
  it('rien de changé : aucune écriture', async () => {
    const l = await lue();
    expect(await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: l.annexes }, AUTEUR, 'Location')).toEqual({ etat: 'ok', data: { changements: [], notes: [] } });
    expect(ecritures()).toBe(0);
  });
  it('un refus d’avant écriture (parking nu avec une annexe) : rien n’est écrit', async () => {
    const l = await lue();
    const r = await modifierFicheEntiere(7, { version: l.version, valeurs: { ...l.encart.valeurs, categorie: 'parking' }, annexes: l.annexes }, AUTEUR, 'Gestion');
    expect(r.etat).toBe('refus');
    expect(ecritures()).toBe(0);
  });
});

describe('🔴 chaque partie par le geste qui l’écrivait déjà', () => {
  it('le bien (tous les groupes de l’encart), une annexe modifiée, détachée, une nouvelle, puis le statut et ses suites', async () => {
    const l = await lue();
    modifierEncartBien.mockResolvedValueOnce({ etat: 'ok', data: { changements: [{ cle: 'commentaire', champ: 'Commentaire libre' }] } });
    const r = await modifierFicheEntiere(7, {
      version: l.version, valeurs: { ...l.encart.valeurs, commentaire: 'Après.' },
      annexes: [{ ...l.annexes[0], etage: '-2', detachee: true }, { ...l.annexes[0], id: null, categorie: 'parking', parkingType: 'box_simple', etage: '-1', numLotCopro: '' }],
      statut: { vers: 'location_seule', effetLe: '2026-10-23', motif: '', mandat: null },
    }, AUTEUR, 'Location');
    expect(r.etat).toBe('ok');
    // ① le bien
    expect(modifierEncartBien.mock.calls[0][0]).toBe(7);
    expect(modifierEncartBien.mock.calls[0][1]).toEqual(['bien', 'caracteristiques', 'situation', 'copropriete', 'dpe', 'commentaire']);
    expect(modifierEncartBien.mock.calls[0][2]).toMatchObject({ commentaire: 'Après.', adresse: '15 rue Carle Hebert' });
    // ② l'annexe existante : sa base (étage) avec SES surfaces et son adresse (importée : jamais réécrite), puis « Détachée »
    expect(modifierBien.mock.calls[0]).toEqual([31, { categorie: 'cave', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', etage: '-2', porte: '',
      numLotCopro: '40', surfaceCarrezM2: '', surfaceExterieureM2: '', nomAnnexe: '', annotation: '' }, AUTEUR]);
    expect(detacherAnnexe.mock.calls[0]).toEqual([31, true, AUTEUR]);
    // ③ la nouvelle : l'écriture de « Nouveau bien »
    expect(ajouterAnnexesCompletes.mock.calls[0][0]).toBe(7);
    expect(ajouterAnnexesCompletes.mock.calls[0][1]).toMatchObject([{ id: null, categorie: 'parking', parkingType: 'box_simple', etage: '-1' }]);
    // ④ le statut, par le mécanisme du geste de la fiche (mail et dossier Drive), avec la tuile d'origine
    expect(transition.mock.calls[0]).toEqual([7, { vers: 'location_seule', effetLe: '2026-10-23', motif: '', mandat: null }, AUTEUR, 'Location']);
    if (r.etat !== 'ok') throw new Error();
    expect(r.data.notes).toEqual(['Son annexe rattachée a suivi le statut.', 'Le dossier Drive du bien a été déplacé dans l’arbre de son nouveau statut.']);
    // L'Historique du bien dit les annexes (une ligne par annexe modifiée, une pour les nouvelles).
    expect(journaliser.mock.calls.map((c) => (c[1] as { titre: string }).titre)).toEqual(['Annexes', 'Annexes']);
  });

  it('« Supprimer » une annexe existante = la SORTIR du portefeuille (avec la confirmation d’une annexe louée), jamais un effacement', async () => {
    const l = await lue();
    await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: [{ ...l.annexes[0], sortir: true }], confirmeOccupation: true }, AUTEUR, 'Gestion');
    expect(sortirDuPortefeuille.mock.calls[0]).toEqual(['bien', 31, AUTEUR, { confirmeOccupation: true }]);
    expect(modifierBien).not.toHaveBeenCalled();
  });

  it('une partie refusée arrête la suite ; ce qui a été écrit est dit', async () => {
    const l = await lue();
    modifierEncartBien.mockResolvedValueOnce({ etat: 'ok', data: { changements: [{ cle: 'commentaire', champ: 'Commentaire libre' }] } });
    modifierBien.mockResolvedValueOnce({ etat: 'refus', motif: 'Étage illisible.' });
    const r = await modifierFicheEntiere(7, { version: l.version, valeurs: { ...l.encart.valeurs, commentaire: 'Après.' }, annexes: [{ ...l.annexes[0], etage: '??' }],
      statut: { vers: 'location_seule', effetLe: '2026-10-23', motif: '', mandat: null } }, AUTEUR, 'Gestion');
    expect(r).toEqual({ etat: 'refus', motif: 'Étage illisible. Ont été enregistrés : Commentaire libre.' });
    expect(transition).not.toHaveBeenCalled();
  });

  it('l’adresse changée d’un bien créé ici : la note dit que le dossier Drive n’est ni renommé ni déplacé', async () => {
    const l = await lue();
    modifierEncartBien.mockResolvedValueOnce({ etat: 'ok', data: { changements: [{ cle: 'adresse', champ: 'Adresse' }] } });
    const r = await modifierFicheEntiere(7, { version: l.version, valeurs: { ...l.encart.valeurs, adresse: '16 rue Carle Hebert' }, annexes: l.annexes }, AUTEUR, 'Gestion');
    if (r.etat !== 'ok') throw new Error();
    expect(r.data.notes).toEqual(['Le dossier Drive du bien garde son nom et sa place : un changement d’adresse ne le renomme ni ne le déplace.']);
    expect(transition).not.toHaveBeenCalled();
  });

  it('une annexe inconnue de la fiche n’est jamais écrite', async () => {
    const l = await lue();
    await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: [{ ...l.annexes[0] }, { ...l.annexes[0], id: 999, etage: '-3' }] }, AUTEUR, 'Gestion');
    expect(ecritures()).toBe(0);
  });
});
