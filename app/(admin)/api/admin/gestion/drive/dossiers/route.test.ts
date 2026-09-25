import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MIME_DOSSIER, type DossierDetail } from '../../../../../../lib/gestion/drive';

/**
 * LOT 5-PJ-D — CE QUE LE SÉLECTEUR REND À L'OUVERTURE.
 *
 * On éprouve le COMPORTEMENT de la route, jamais la forme d'une requête : quels dossiers reviennent, dans quel ordre,
 * et ce qui se passe quand la mémoire des dépôts nomme un dossier auquel la personne connectée n'a pas accès. Les
 * pièces qu'elle assemble ont leurs propres tests (`dossiersRecents.test.ts`, `driveRepo.test.ts`).
 */

const gardeMock = vi.fn();
const jetonMock = vi.fn();
const schemaMock = vi.fn();
const dernierMock = vi.fn();
const recentsMock = vi.fn();
const maxMock = vi.fn();
const lireDossierMock = vi.fn();

vi.mock('../../../../../../lib/admin/garde', () => ({
  exigerCompteActif: (...a: unknown[]) => gardeMock(...a),
}));
vi.mock('../../../../../../lib/gestion/jetonCollaborateur', () => ({
  jetonPourRequete: (...a: unknown[]) => jetonMock(...a),
  messageAcces: (e: { motif?: string }) => e.motif ?? '',
}));
vi.mock('../../../../../../lib/gestion/schema', () => ({
  depotsDriveDisponibles: () => schemaMock(),
}));
vi.mock('../../../../../../lib/gestion/driveRepo', () => ({
  dernierDossierDuFil: (...a: unknown[]) => dernierMock(...a),
  dossiersRecentsDeposes: (...a: unknown[]) => recentsMock(...a),
  lireMaxDossiersRecents: () => maxMock(),
}));
// Seule la LECTURE d'un dossier est doublée : la mémoire de lecture, elle, doit rester la vraie — c'est elle qui
//   évite de redemander cinq fois le même ancêtre, et on veut le mesurer.
vi.mock('../../../../../../lib/gestion/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../lib/gestion/drive')>()),
  lireDossier: (_jeton: string, id: string) => lireDossierMock(id),
  // Doublées : sans cela, ces deux-là partiraient VRAIMENT sur le réseau pendant la suite.
  listerDrivesAvecId: async () => ({ ok: true, valeur: [] }),
  listerPartagesAvecMoi: async () => ({ ok: true, valeur: [] }),
}));

import { GET } from './route';

const dossier = (id: string, nom: string, parents: string[] = []): DossierDetail =>
  ({ id, nom, parents, driveId: null, mimeType: MIME_DOSSIER, corbeille: false });

const requete = (q = ''): Request => new Request(`http://local/api/admin/gestion/drive/dossiers${q}`);

/** Le Drive répond selon une table ; tout identifiant absent est « inaccessible », comme un 404 de Google. */
function driveContient(table: Record<string, DossierDetail>): void {
  lireDossierMock.mockImplementation(async (id: string) => {
    const d = table[id];
    return d === undefined
      ? { ok: false, motif: 'Ce dossier n’existe plus dans le Drive.' }
      : { ok: true, valeur: d };
  });
}

beforeEach(() => {
  gardeMock.mockReset(); jetonMock.mockReset(); schemaMock.mockReset();
  dernierMock.mockReset(); recentsMock.mockReset(); maxMock.mockReset(); lireDossierMock.mockReset();

  gardeMock.mockResolvedValue(null);                                   // autorisé par défaut ; le refus a son test
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'J', compteGoogle: 'a.jorel@sansvisavis.com' });
  schemaMock.mockResolvedValue(true);
  dernierMock.mockResolvedValue(null);
  recentsMock.mockResolvedValue([]);
  maxMock.mockResolvedValue(6);
  driveContient({});
});

describe('les barrières, avant toute question à Google', () => {
  it('le refus de la garde est rendu tel quel, et Google n’est pas interrogé', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    const res = await GET(requete());
    expect(res.status).toBe(403);
    expect(jetonMock).not.toHaveBeenCalled();
  });

  it('sans la migration 245, on le DIT, et aucun jeton n’est demandé', async () => {
    schemaMock.mockResolvedValue(false);
    const corps = await (await GET(requete())).json();
    expect(corps.etat).toBe('sans_schema');
    expect(jetonMock).not.toHaveBeenCalled();
  });
});

describe('la vue d’ouverture', () => {
  it('propose les dossiers récents, avec leur chemin et la date du dernier dépôt', async () => {
    recentsMock.mockResolvedValue([
      { id: 'D1', nom: 'mémoire', driveId: null, dernierDepot: '2026-09-25T10:00:00Z' },
    ]);
    driveContient({
      D1: dossier('D1', 'Dupont', ['P']),
      P: dossier('P', '1 actifs', ['R']),
      R: dossier('R', 'My Drive'), // ce que Google répond pour la racine du Mon Drive, en anglais
    });

    const corps = await (await GET(requete())).json();
    expect(corps.mode).toBe('accueil');
    expect(corps.recents).toHaveLength(1);
    expect(corps.recents[0]).toMatchObject({
      id: 'D1', nom: 'Dupont', chemin: 'Mon Drive › 1 actifs', dernierDepot: '2026-09-25T10:00:00Z',
    });
  });

  it('le dernier dossier de l’ÉCHANGE est mis en tête, et retiré des récents', async () => {
    dernierMock.mockResolvedValue({ id: 'D1', nom: 'Dupont' });
    recentsMock.mockResolvedValue([
      { id: 'D1', nom: 'Dupont', driveId: null, dernierDepot: '2026-09-25T10:00:00Z' },
      { id: 'D2', nom: 'Martin', driveId: null, dernierDepot: '2026-09-24T10:00:00Z' },
    ]);
    driveContient({ D1: dossier('D1', 'Dupont'), D2: dossier('D2', 'Martin') });

    const corps = await (await GET(requete('?fil=383'))).json();
    expect(corps.dernier.id).toBe('D1');
    expect(corps.recents.map((r: { id: string }) => r.id)).toEqual(['D2']);
    expect(dernierMock).toHaveBeenCalledWith(383);
  });

  /** 🔴 LA MÉMOIRE DES DÉPÔTS EST COMMUNE, LES DROITS NE LE SONT PAS. */
  it('un dossier récent inaccessible est omis, et son nom ne sort PAS de la route', async () => {
    recentsMock.mockResolvedValue([
      { id: 'SECRET', nom: 'Propriétaire confidentiel', driveId: null, dernierDepot: '2026-09-25T10:00:00Z' },
      { id: 'D2', nom: 'Martin', driveId: null, dernierDepot: '2026-09-24T10:00:00Z' },
    ]);
    driveContient({ D2: dossier('D2', 'Martin') }); // SECRET n'est pas visible par cette personne

    const res = await GET(requete());
    const texte = await res.text();
    expect(texte).not.toContain('Propriétaire confidentiel');
    expect(JSON.parse(texte).recents.map((r: { id: string }) => r.id)).toEqual(['D2']);
  });

  it('aucun dépôt nulle part ⇒ la racine tout de suite, en disant pourquoi', async () => {
    const corps = await (await GET(requete())).json();
    expect(corps.mode).toBe('racines');
    expect(corps.motif).toBe('sans_depot');
    expect(corps.dossiers).toHaveLength(3);
  });

  it('des dépôts, mais aucun dossier accessible ⇒ la racine, avec un motif DIFFÉRENT', async () => {
    recentsMock.mockResolvedValue([{ id: 'X', nom: 'X', driveId: null, dernierDepot: '2026-09-25T10:00:00Z' }]);
    const corps = await (await GET(requete())).json();
    expect(corps.mode).toBe('racines');
    expect(corps.motif).toBe('sans_recent_accessible');
  });

  it('le vivier demandé est plus large que le nombre affiché : sinon un seul refus raccourcirait la liste', async () => {
    maxMock.mockResolvedValue(6);
    await GET(requete());
    expect(recentsMock.mock.calls[0][0]).toBeGreaterThan(6);
  });
});

describe('la racine, et les deux regroupements', () => {
  /** 🔴 LE DÉFAUT CORRIGÉ PAR CE LOT : « Déposer ici » était proposé sur deux entrées qui ne sont pas des dossiers. */
  it('« Drives partagés » et « Partagés avec moi » sont marqués comme des REGROUPEMENTS ; « Mon Drive » non', async () => {
    const corps = await (await GET(requete('?vue=racines'))).json();
    expect(corps.mode).toBe('racines');
    const par = Object.fromEntries(corps.dossiers.map((d: { id: string; regroupement?: boolean }) => [d.id, d.regroupement === true]));
    expect(par).toEqual({ root: false, 'svav:drives': true, 'svav:partages': true });
  });

  /**
   * MÊME DÉFAUT, AUTRE ENDROIT, vu à l'écran le 25/09 : à l'intérieur d'un regroupement, le bouton du bas proposait
   * « Déposer dans « Drives partagés » ». C'est la MIETTE qui l'alimente : elle porte donc le marqueur, elle aussi.
   */
  it.each([
    ['svav:drives', 'Drives partagés'],
    ['svav:partages', 'Partagés avec moi'],
  ])('la miette de %s est marquée regroupement : pas de « Déposer dans … » au bas de l’écran', async (id, nom) => {
    const corps = await (await GET(requete(`?parent=${encodeURIComponent(id)}`))).json();
    expect(corps.ariane).toEqual([{ id, nom, regroupement: true }]);
  });

  it('« Parcourir tout le Drive » ne va PAS chercher les dossiers récents', async () => {
    await GET(requete('?vue=racines'));
    expect(recentsMock).not.toHaveBeenCalled();
  });
});
