import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (18/11/2026) — « Le message « Bâtiment et digicodes enregistrés. » de « Modifier le bien » ne doit s'afficher que si un bâtiment ou un digicode a
 * réellement été écrit ; sinon, aucun message. » Toutes les écritures sont simulées.
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
const dg = vi.hoisted(() => ({ ecrit: 0, ordre: [] as string[] }));
vi.mock('../gestion/digicodesRepo', () => ({ digicodesUnifiesDisponibles: async () => true, RefusDigicode: class RefusDigicode extends Error {} }));
vi.mock('../gestion/digicodes', () => ({ validerDigicodesBien: (b: unknown) => (b === undefined ? null : b) }));
vi.mock('../gestion/digicodesBienRepo', () => ({ ecrireDigicodesDuBien: async (_q: unknown, _id: unknown, _d: unknown, _o: unknown, _a: unknown, compte?: { ecrit: number }) => {
  dg.ordre.push('digicodes'); if (compte !== undefined) compte.ecrit += dg.ecrit; return null; } }));
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
beforeEach(() => { m.decision = { etat: 'libre' }; m.ecrit = []; dg.ecrit = 0; dg.ordre = []; });
const lue = async () => { const r = await lireFicheEntiere(7); if (r.etat !== 'ok') throw new Error(r.etat); return r.data; };
const PLACE = { batiment: null, batimentConfirme: false, commun: null, codeBatiment: null, autres: [] };

describe('🔴 « Bâtiment et digicodes enregistrés. » seulement si quelque chose a été écrit', () => {
  it('la place des digicodes envoyée telle quelle (rien d’écrit) : AUCUN message', async () => {
    const l = await lue();
    const r = await modifierFicheEntiere(7, { version: l.version, valeurs: { ...l.encart.valeurs, commentaire: 'Après.' }, annexes: l.annexes, digicodesBien: PLACE }, AUTEUR, 'Location');
    expect(r).toMatchObject({ etat: 'ok' });
    if (r.etat !== 'ok') throw new Error();
    expect(r.data.notes).not.toContain('Bâtiment et digicodes enregistrés.');
    const seul = await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: l.annexes, digicodesBien: PLACE }, AUTEUR, 'Location');
    expect(seul).toEqual({ etat: 'ok', data: { changements: [], notes: [] } });
  });
  it('un bâtiment ou un digicode réellement écrit : le message', async () => {
    dg.ecrit = 1;
    const l = await lue();
    const r = await modifierFicheEntiere(7, { version: l.version, valeurs: l.encart.valeurs, annexes: l.annexes, digicodesBien: PLACE }, AUTEUR, 'Location');
    expect(r).toEqual({ etat: 'ok', data: { changements: [], notes: ['Bâtiment et digicodes enregistrés.'] } });
  });
});

describe('🔴🔴 Arno (27/11/2026, 23h30, point 4) — une seule base : l’ADRESSE change dans ce même « Modifier »', () => {
  it('les digicodes et bâtiments saisis (ceux de la NOUVELLE adresse) s’écrivent APRÈS l’adresse ; sans changement d’adresse : avant, comme toujours', async () => {
    modifierEncartBien.mockImplementation(async () => { dg.ordre.push('adresse'); return { etat: 'ok', data: { changements: [{ cle: 'adresse', champ: 'Adresse' }] } }; });
    dg.ecrit = 1;
    const l = await lue();
    const r = await modifierFicheEntiere(7, { version: l.version, valeurs: { ...l.encart.valeurs, adresse: '7 rue _TEST Deux Adresses', codePostal: '92600', commune: 'ASNIERES' },
      annexes: l.annexes, digicodesBien: { ...PLACE, batiment: 'C' }, adresseSaisie: { nature: 'hors_liste', horsListeConfirme: true } }, AUTEUR, 'Location');
    expect(r.etat).toBe('ok');
    expect(dg.ordre).toEqual(['adresse', 'digicodes']);
    dg.ordre = [];
    modifierEncartBien.mockImplementation(async () => { dg.ordre.push('encart'); return { etat: 'ok', data: { changements: [{ cle: 'commentaire', champ: 'Commentaire' }] } }; });
    await modifierFicheEntiere(7, { version: l.version, valeurs: { ...l.encart.valeurs, commentaire: 'Après.' }, annexes: l.annexes, digicodesBien: { ...PLACE, batiment: 'C' } }, AUTEUR, 'Location');
    expect(dg.ordre).toEqual(['digicodes', 'encart']);
  });
});
