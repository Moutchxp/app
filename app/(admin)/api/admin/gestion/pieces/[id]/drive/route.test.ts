import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MIME_DOSSIER, type DossierDetail } from '../../../../../../../lib/gestion/drive';

/**
 * LOT 5-PJ-D — LE DÉPÔT REFUSE UNE CIBLE QUI N'EST PAS UN VRAI DOSSIER.
 *
 * 🔴 POURQUOI UN TEST DE ROUTE, alors que `cibleDepot.test.ts` éprouve déjà la règle : parce que la question n'est
 * pas « la règle est-elle juste » mais « est-elle BRANCHÉE, et avant le téléversement ». Retirer le bouton « Déposer
 * ici » des deux regroupements met l'écran d'accord avec la réalité ; seul le serveur protège d'une requête forgée,
 * d'un vieil onglet ou d'un appel rejoué.
 */

const gardeMock = vi.fn();
const jetonMock = vi.fn();
const schemaMock = vi.fn();
const auteurMock = vi.fn();
const deposerMock = vi.fn();
const depsMock = vi.fn();
const lireDossierMock = vi.fn();

vi.mock('../../../../../../../lib/admin/garde', () => ({
  exigerCompteActif: (...a: unknown[]) => gardeMock(...a),
}));
vi.mock('../../../../../../../lib/gestion/jetonCollaborateur', () => ({
  jetonPourRequete: (...a: unknown[]) => jetonMock(...a),
  messageAcces: (e: { motif?: string }) => e.motif ?? '',
}));
vi.mock('../../../../../../../lib/gestion/schema', () => ({
  depotsDriveDisponibles: () => schemaMock(),
}));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({
  auteurDeLaRequete: () => auteurMock(),
}));
vi.mock('../../../../../../../lib/gestion/depotDriveReel', () => ({
  depsReellesDepot: (...a: unknown[]) => depsMock(...a),
}));
vi.mock('../../../../../../../lib/gestion/depotDrive', () => ({
  deposerPieces: (...a: unknown[]) => deposerMock(...a),
  resumerDepot: () => '1 pièce déposée.',
}));
vi.mock('../../../../../../../lib/gestion/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../../lib/gestion/drive')>()),
  lireDossier: (_jeton: string, id: string) => lireDossierMock(id),
}));

import { POST } from './route';

const dossier = (id: string, nom = id): DossierDetail =>
  ({ id, nom, parents: [], driveId: null, mimeType: MIME_DOSSIER, corbeille: false });

const contexte = { params: Promise.resolve({ id: '7' }) };
const requete = (dossierId: string): Request =>
  new Request('http://local/api/admin/gestion/pieces/7/drive', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId }),
  });

beforeEach(() => {
  gardeMock.mockReset(); jetonMock.mockReset(); schemaMock.mockReset();
  auteurMock.mockReset(); deposerMock.mockReset(); depsMock.mockReset(); lireDossierMock.mockReset();

  gardeMock.mockResolvedValue(null);
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'J', compteGoogle: 'a.jorel@sansvisavis.com' });
  schemaMock.mockResolvedValue(true);
  auteurMock.mockResolvedValue({ id: 3, libelle: 'Arnaud Jorel' });
  depsMock.mockReturnValue({});
  deposerMock.mockResolvedValue([{ pieceId: 7, nomFichier: 'bail.pdf', etat: 'depose', lien: null }]);
  lireDossierMock.mockImplementation(async (id: string) => ({ ok: true, valeur: dossier(id) }));
});

describe('un REGROUPEMENT n’est pas une destination', () => {
  it.each(['svav:drives', 'svav:partages'])('%s est refusé, et AUCUNE pièce ne part', async (cible) => {
    const res = await POST(requete(cible), contexte);
    expect(res.status).toBe(400);
    const corps = await res.json();
    expect(corps.etat).toBe('cible_invalide');
    expect(corps.message).toContain('regroupement');
    expect(deposerMock).not.toHaveBeenCalled();
    expect(lireDossierMock).not.toHaveBeenCalled(); // on ne demande pas à Google ce qu'on sait déjà
  });
});

describe('une cible qui n’est pas un dossier', () => {
  it('un fichier est refusé AVANT le moindre téléversement', async () => {
    lireDossierMock.mockResolvedValue({ ok: true, valeur: { ...dossier('F'), mimeType: 'application/pdf' } });
    const res = await POST(requete('F'), contexte);
    expect(res.status).toBe(400);
    expect(deposerMock).not.toHaveBeenCalled();
  });

  it('un dossier à la corbeille est refusé', async () => {
    lireDossierMock.mockResolvedValue({ ok: true, valeur: { ...dossier('C'), corbeille: true } });
    const res = await POST(requete('C'), contexte);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('corbeille');
    expect(deposerMock).not.toHaveBeenCalled();
  });

  it('un dossier disparu est refusé, avec le motif de Google', async () => {
    lireDossierMock.mockResolvedValue({ ok: false, motif: 'Ce dossier n’existe plus dans le Drive.' });
    const res = await POST(requete('PERDU'), contexte);
    expect(res.status).toBe(400);
    expect(deposerMock).not.toHaveBeenCalled();
  });
});

describe('ce qui passe, et passe comme avant', () => {
  it('un vrai dossier laisse le dépôt se faire, pièce par pièce', async () => {
    const res = await POST(requete('DOS'), contexte);
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.etat).toBe('ok');
    expect(corps.resultats).toHaveLength(1);
    expect(deposerMock).toHaveBeenCalledTimes(1);
  });

  it('« Mon Drive » passe sans même une lecture : `root` est un alias que l’API résout elle-même', async () => {
    const res = await POST(requete('root'), contexte);
    expect(res.status).toBe(200);
    expect(lireDossierMock).not.toHaveBeenCalled();
  });

  /** La route a déjà lu le dossier pour le vérifier : le dépôt, qui a besoin de son nom, ne doit pas le repayer. */
  it('la lecture du dossier est PARTAGÉE avec le dépôt, pas refaite', async () => {
    let lectures = 0;
    lireDossierMock.mockImplementation(async (id: string) => { lectures += 1; return { ok: true, valeur: dossier(id) }; });
    // On rejoue ce que fait le dépôt réel : demander les infos du dossier avec le lecteur que la route lui passe.
    depsMock.mockImplementation((lire: (id: string) => Promise<unknown>) => {
      void lire('DOS');
      return {};
    });
    await POST(requete('DOS'), contexte);
    expect(lectures).toBe(1);
  });

  it('sans la migration 245, le dépôt est refusé AVANT le jeton, et on le DIT', async () => {
    schemaMock.mockResolvedValue(false);
    const res = await POST(requete('DOS'), contexte);
    expect(res.status).toBe(409);
    expect((await res.json()).etat).toBe('sans_schema');
    expect(jetonMock).not.toHaveBeenCalled();
  });
});
