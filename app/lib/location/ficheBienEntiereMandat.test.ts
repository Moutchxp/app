import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien », 492) — « Modifier le bien » : le mandat PORTÉ PAR LE BIEN, lu et modifiable (« chacun modifiable sur son
 * bien ») ; le n° partagé contrôlé AVANT toute écriture (même propriétaire sans confirmation → « à confirmer » ; autre propriétaire → refus) : rien
 * n'est écrit. Toutes les écritures sont simulées.
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
const m = vi.hoisted(() => ({ decision: { etat: 'libre' } as Record<string, unknown>, ecrit: [] as unknown[], lus: { gestion: { numero: 'MG 41', signeLe: null }, transaction: { numero: null, signeLe: null }, signalements: [] as string[] } }));
class MandatAConfirmer extends Error {}
class MandatRefuse extends Error {}
vi.mock('./mandatParBienRepo', () => ({
  mandatParBienDisponible: async () => true, ensembleDuBien: async () => [11],
  decisionAvantEcriture: async () => m.decision,
  ecrireMandatDuBien: async (...a: unknown[]) => { m.ecrit.push(a.slice(1, 5)); return true; },
  mandatsDesBiens: async (ids: number[]) => ids.map((lotId) => ({ lotId, porteur: lotId, ...m.lus })),
  MandatAConfirmer, MandatRefuse,
}));
vi.mock('../db/client', () => ({ query: async () => ({ rows: [] }), withTransaction: async (f: (q: unknown) => unknown) => f(async () => ({ rows: [] })) }));
const { lireFicheEntiere, modifierFicheEntiere } = await import('./ficheBienEntiereRepo');
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
const ecritures = () => [modifierBien, modifierEncartBien, ajouterAnnexesCompletes, detacherAnnexe, sortirDuPortefeuille, transition].reduce((n, f) => n + f.mock.calls.length, 0) + m.ecrit.length;
beforeEach(() => { m.decision = { etat: 'libre' }; m.ecrit = []; });
const lue = async () => { const r = await lireFicheEntiere(7); if (r.etat !== 'ok') throw new Error(r.etat); return r.data; };
const MANDAT = { sorte: 'gestion', numero: 'MG 42', signeLe: '2026-11-18' };

describe('🔴 le mandat du bien dans « Modifier le bien »', () => {
  it('la lecture porte le mandat du bien (n°, date, gestion et transaction)', async () => {
    expect((await lue()).mandatBien).toEqual({ gestion: { numero: 'MG 41', signeLe: null }, transaction: { numero: null, signeLe: null }, signalements: [] });
  });
  it('libre : écrit sur le bien, avec ses propriétaires, et dit « Mandat du bien enregistré. »', async () => {
    const l = await lue();
    const r = await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: l.annexes, mandatBien: MANDAT }, AUTEUR, 'Location');
    expect(m.ecrit).toEqual([[7, { sorte: 'gestion', numero: 'MG 42', signeLe: '2026-11-18' }, [11], false]]);
    expect(r).toMatchObject({ etat: 'ok', data: { notes: ['Mandat du bien enregistré.'] } });
  });
  it('🔴 même propriétaire sans confirmation : « à confirmer », RIEN n’est écrit (ni le bien, ni le mandat) ; confirmé : écrit', async () => {
    const l = await lue();
    m.decision = { etat: 'a_confirmer', motif: 'PHRASE', adresses: ['4 rue _TEST MANDAT'] };
    const saisie = { version: l.version, valeurs: { ...l.encart.valeurs, commentaire: 'Après.' }, annexes: l.annexes, mandatBien: MANDAT };
    expect(await modifierFicheEntiere(7, saisie, AUTEUR, 'Location')).toEqual({ etat: 'mandat_a_confirmer', motif: 'PHRASE' });
    expect(ecritures()).toBe(0);
    m.decision = { etat: 'meme_proprietaire_confirme' };
    await modifierFicheEntiere(7, { ...saisie, confirmeMandat: true }, AUTEUR, 'Location');
    expect(m.ecrit).toEqual([[7, { sorte: 'gestion', numero: 'MG 42', signeLe: '2026-11-18' }, [11], true]]);
  });
  it('🔴 un autre propriétaire : refus, RIEN n’est écrit ; le mandat d’un changement de statut est contrôlé de même', async () => {
    const l = await lue();
    m.decision = { etat: 'refus', motif: 'AUTRE' };
    expect(await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: l.annexes, mandatBien: MANDAT }, AUTEUR, 'Location')).toEqual({ etat: 'refus', motif: 'AUTRE' });
    expect(await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: l.annexes,
      statut: { vers: 'location_seule', effetLe: '2026-11-18', motif: '', mandat: { sorte: 'transaction', numero: 'MT 7', signeLe: null } } }, AUTEUR, 'Location')).toEqual({ etat: 'refus', motif: 'AUTRE' });
    expect(ecritures()).toBe(0);
  });
  it('une annexe rattachée : pas de mandat propre (lecture nulle, saisie refusée)', async () => {
    lireStatutBien.mockResolvedValue({ disponible: true, lotId: 7, statut: 'en_gestion', depuis: '2019-03-01', suitLot: { id: 3, adresse: '1 rue X' }, gestes: [], archiveLe: null });
    const l = await lue();
    expect(l.mandatBien).toBeNull();
    expect((await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: l.annexes, mandatBien: MANDAT }, AUTEUR, 'Location')).etat).toBe('refus');
    expect(ecritures()).toBe(0);
  });
});
