import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026) — l'écriture d'un groupe de l'encart : relue à la source, SEULS les champs du groupe, par les écritures de
 * « Nouveau bien » (mêmes contrôles), journalisée « Champ : ancienne → nouvelle ». Base et écritures simulées : rien n'est écrit.
 */
const query = vi.fn(async (..._a: unknown[]) => ({ rows: [], rowCount: 1 }));
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
const modifierBien = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: undefined }) as { etat: string; data?: undefined; motif?: string });
let fiche: unknown;
vi.mock('./locationRepo', () => ({ ficheBienLocation: async () => fiche, modifierBien: (...a: unknown[]) => modifierBien(...a) }));
const modifierComplementsBien = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: undefined }) as { etat: string; data?: undefined; motif?: string });
vi.mock('./creationBienRepo', () => ({ modifierComplementsBien: (...a: unknown[]) => modifierComplementsBien(...a) }));
const rattacherSyndicAuBien = vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok: boolean; motif?: string });
vi.mock('./syndicLocationRepo', async (orig) => ({ ...(await orig<object>()), rattacherSyndicAuBien: (...a: unknown[]) => rattacherSyndicAuBien(...a) }));
const { modifierEncartBien, lireEncartBien } = await import('./encartBienRepo');

const AUTEUR = { id: 5, libelle: 'arno@exemple.test' };
const BIEN = { id: 7, parentId: null, categorie: 'logement', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', nomAnnexe: null,
  etage: '2', porte: '21', numLotCopro: '12', surfaceCarrezM2: 61.8, surfaceExterieureM2: null };
const COMPLEMENTS = { typeLogement: 'appartement', meuble: false, nombrePieces: 3, surfaceHabitableM2: 64.2, batiment: 'B', escalier: null, ascenseur: true, digicode: false,
  digicodeCode: null, precisionAcces: null, syndicId: 31, syndicNom: 'CABINET ESSAI', commentaire: 'Avant.', dpeClasse: 'D', dpeNonSoumis: false, dpeDate: '2024-03-01',
  epoqueConstruction: null, chauffage: null, typeLocal: null, parkingSituation: null, parkingType: null, surfaceM2: null,
  idFiscal: null, chargesCopro: null, derniereAg: null, agApplicable: true, entretienAPrevoir: false, entretiens: [] };
const journaux = () => query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO gestion_journal')).map((c) => (c[1] as unknown[]));

beforeEach(() => {
  query.mockClear(); modifierBien.mockReset(); modifierComplementsBien.mockReset(); rattacherSyndicAuBien.mockReset();
  rattacherSyndicAuBien.mockResolvedValue({ ok: true });
  modifierBien.mockResolvedValue({ etat: 'ok', data: undefined }); modifierComplementsBien.mockResolvedValue({ etat: 'ok', data: undefined });
  fiche = { etat: 'ok', data: { bien: { ...BIEN }, complements: { ...COMPLEMENTS } } };
});

describe('🔴 lire : une seule source, fraîche', () => {
  it('les valeurs et ce que la fiche montre', async () => {
    const r = await lireEncartBien(7);
    if (r.etat !== 'ok') throw new Error();
    expect(r.data).toMatchObject({ famille: 'logement', annexe: false, avecIdFiscal: true, avecCharges: true, avecAg: true, avecEntretien: true,
      valeurs: { etage: '2', surfaceCarrezM2: '61,8', commentaire: 'Avant.', syndicId: '31' } });
  });
  it('sans les compléments (migration absente) : « sans_schema » ; bien inconnu : rendu tel quel', async () => {
    fiche = { etat: 'ok', data: { bien: BIEN, complements: null } };
    expect(await lireEncartBien(7)).toEqual({ etat: 'sans_schema' });
    fiche = { etat: 'inconnu' };
    expect(await lireEncartBien(7)).toEqual({ etat: 'inconnu' });
  });
});

describe('🔴 modifier un groupe', () => {
  it('rien de changé : aucune écriture, aucun journal', async () => {
    expect(await modifierEncartBien(7, 'commentaire', { commentaire: ' Avant. ' }, AUTEUR)).toEqual({ etat: 'ok', data: { changements: [] } });
    expect(modifierComplementsBien).not.toHaveBeenCalled(); expect(modifierBien).not.toHaveBeenCalled(); expect(journaux()).toEqual([]);
  });

  it('un champ HORS du groupe est ignoré (le commentaire envoyé avec « Caractéristiques »)', async () => {
    await modifierEncartBien(7, 'caracteristiques', { commentaire: 'Piraté', etage: '2' }, AUTEUR);
    expect(modifierComplementsBien).not.toHaveBeenCalled(); expect(journaux()).toEqual([]);
  });

  it('Commentaire : l’écriture des compléments, avec l’état COMPLET relu ; sans les clés des autres groupes ; journalisé', async () => {
    const r = await modifierEncartBien(7, 'commentaire', { commentaire: 'Après.' }, AUTEUR);
    expect(r).toEqual({ etat: 'ok', data: { changements: [{ cle: 'commentaire', champ: 'Commentaire libre', avant: 'Avant.', apres: 'Après.' }] } });
    const [id, envoi, auteur] = modifierComplementsBien.mock.calls[0] as [number, Record<string, unknown>, unknown];
    expect([id, auteur]).toEqual([7, AUTEUR]);
    expect(envoi).toMatchObject({ commentaire: 'Après.', batiment: 'B', typeLogement: 'appartement', nombrePieces: '3', meuble: 'non', syndicId: '31', dpeClasse: 'D' });
    for (const k of ['chargesCopro', 'idFiscal', 'derniereAg', 'entretienAPrevoir', 'entretiens']) expect(envoi, k).not.toHaveProperty(k);
    expect(modifierBien).not.toHaveBeenCalled();
    expect(journaux()).toEqual([[7, 'Commentaire libre : Avant.', 'Commentaire libre : Après.', 'Commentaire — Commentaire libre : Avant. → Après.', 5, 'arno@exemple.test']]);
  });

  it('Caractéristiques : compléments ET base (étage) ; la base garde catégorie et adresse du bien ; une ligne d’Historique par écriture', async () => {
    await modifierEncartBien(7, 'caracteristiques', { etage: '3', nombrePieces: '4' }, AUTEUR);
    expect(modifierComplementsBien.mock.calls[0][1]).toMatchObject({ nombrePieces: '4' });
    expect(modifierBien.mock.calls[0][1]).toEqual({ categorie: 'logement', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', nomAnnexe: '',
      etage: '3', porte: '21', numLotCopro: '12', surfaceCarrezM2: '61,8', surfaceExterieureM2: '' });
    expect(journaux().map((j) => j[3])).toEqual(['Caractéristiques — Pièces : 3 → 4', 'Caractéristiques — Étage : 2 → 3']);
  });

  it('Copropriété : ID fiscal, charges et AG partent avec elle ; DPE : les entretiens partent avec lui', async () => {
    await modifierEncartBien(7, 'copropriete', { idFiscal: '921234567890', chargesCopro: 'agence', derniereAg: '2026-06-15' }, AUTEUR);
    expect(modifierComplementsBien.mock.calls[0][1]).toMatchObject({ idFiscal: '921234567890', chargesCopro: 'agence', derniereAg: '2026-06-15' });
    await modifierEncartBien(7, 'dpe', { entretienAPrevoir: 'oui', entretiens: '[{"sorte":"chaudiere","nom":null,"dateAnniversaire":"2026-11-01"}]' }, AUTEUR);
    expect(modifierComplementsBien.mock.calls[1][1]).toMatchObject({ entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', dateAnniversaire: '2026-11-01' }] });
  });

  it('le syndic, comme « Nouveau bien » : changé → rattaché par l’immeuble du bien, avec ses contacts ; journalisé', async () => {
    const contacts = JSON.stringify({ contactsIds: [4], nouveauxContacts: [{ prenom: 'Léa', nom: 'Durand', email: 'l@x.test' }] });
    await modifierEncartBien(7, 'copropriete', { syndicId: '44', syndicNom: 'NOUVEAU SYNDIC', syndicContacts: contacts }, AUTEUR);
    expect(modifierComplementsBien.mock.calls[0][1]).toMatchObject({ syndicId: '44' });
    expect(rattacherSyndicAuBien.mock.calls[0]).toEqual([7, { id: 44, contactsIds: [4], nouveauxContacts: [{ prenom: 'Léa', nom: 'Durand', email: 'l@x.test' }] },
      { libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE' }, AUTEUR]);
    expect(journaux().map((j) => j[3])).toEqual(['Copropriété — Syndic : CABINET ESSAI → NOUVEAU SYNDIC',
      'Copropriété — Contacts du syndic pour ce bien : aucun ajout → 1 contact désigné, Léa Durand (nouveau)']);
  });

  it('un nouveau contact du syndic incomplet : refusé AVANT toute écriture ; un syndic inchangé n’est pas re-rattaché', async () => {
    const r = await modifierEncartBien(7, 'copropriete', { syndicContacts: JSON.stringify({ contactsIds: [], nouveauxContacts: [{ nom: 'Durand' }] }) }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Contact du syndic 1 : un téléphone ou un e-mail.' });
    expect(modifierComplementsBien).not.toHaveBeenCalled(); expect(rattacherSyndicAuBien).not.toHaveBeenCalled(); expect(journaux()).toEqual([]);
    await modifierEncartBien(7, 'copropriete', { numLotCopro: '13' }, AUTEUR);
    expect(rattacherSyndicAuBien).not.toHaveBeenCalled();
  });

  it('refus des contrôles de « Nouveau bien » : rendu tel quel, rien de journalisé', async () => {
    modifierComplementsBien.mockResolvedValue({ etat: 'refus', motif: 'La date du DPE ne peut pas être dans le futur.' });
    expect(await modifierEncartBien(7, 'dpe', { dpeDate: '2099-01-01' }, AUTEUR)).toEqual({ etat: 'refus', motif: 'La date du DPE ne peut pas être dans le futur.' });
    expect(journaux()).toEqual([]);
  });

  it('compléments écrits puis base refusée : la partie écrite reste dans l’Historique, et le refus le dit', async () => {
    modifierBien.mockResolvedValue({ etat: 'refus', motif: 'Surface Carrez invalide.' });
    const r = await modifierEncartBien(7, 'caracteristiques', { nombrePieces: '4', surfaceCarrezM2: 'abc' }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Surface Carrez invalide. Ont été enregistrés : Pièces.' });
    expect(journaux().map((j) => j[3])).toEqual(['Caractéristiques — Pièces : 3 → 4']);
  });
});
