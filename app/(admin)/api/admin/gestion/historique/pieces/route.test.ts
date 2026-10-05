import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const etendreMock = vi.fn();
const porteursMock = vi.fn();
vi.mock('../../../../../../lib/gestion/historiqueRepo', () => ({
  etendreCible: (...a: unknown[]) => etendreMock(...a),
  porteursDePieces: (...a: unknown[]) => porteursMock(...a),
}));

import { GET } from './route';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LES PIÈCES DE TOUTE LA SÉLECTION ══════════════════════════════════════
 *
 * RÈGLE D'ARNO (05/10/2026) : « le résumé contient les pièces de TOUS les mails de la sélection (toutes les
 * parties cochées, toute la période), pas seulement des 100 chargés. […] Le compteur “N pièces dans cette
 * sélection” = la somme réelle. »
 *
 * CE QUE CES ÉPREUVES TIENNENT : la route lit les MÊMES filtres que le listing, elle IGNORE la pagination (c'est
 * tout son objet), elle compte les PIÈCES et non les mails, et elle ne tait ni la troncature ni la panne.
 */
const requete = (q: string) => new Request(`http://local/api/admin/gestion/historique/pieces${q}`);

const MESSAGE = {
  messageId: 12, recuLe: '2026-03-04T09:00:00Z', sens: 'recu' as const,
  de: 'proprio@exemple.fr', deNom: 'Propriétaire', objet: 'Quittance',
  pieces: [
    { pieceId: 1, nomFichier: 'quittance.pdf', typeMime: 'application/pdf', tailleOctets: 9, disponible: true, motifNonStocke: null, empreinte: 'aa' },
    { pieceId: 2, nomFichier: 'constat.pdf', typeMime: 'application/pdf', tailleOctets: 8, disponible: true, motifNonStocke: null, empreinte: 'bb' },
  ],
};

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  etendreMock.mockReset(); etendreMock.mockResolvedValue({ etat: 'ok', data: { sorte: 'lot', cle: '290' } });
  porteursMock.mockReset(); porteursMock.mockResolvedValue({ messages: [], tronque: false });
});

describe('les pièces de toute la sélection', () => {
  it('🔒 exige le droit « gestion » : la réponse nomme des fichiers et des personnes', async () => {
    await GET(requete('?cible=lot-290'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('🔒 refus ⇒ aucune lecture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(requete('?cible=lot-290'))).status).toBe(403);
    expect(porteursMock).not.toHaveBeenCalled();
  });

  it('🔴 une cible illisible est refusée, plutôt que répondue de travers', async () => {
    for (const q of ['', '?cible=', '?cible=zzz-1']) {
      const res = await GET(requete(q));
      expect(res.status).toBe(400);
      expect((await res.json() as { etat: string }).etat).toBe('cible_invalide');
    }
    expect(porteursMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 LE CŒUR DU POINT 5 : les mêmes tamis que le listing, par la même lecture (`lireFiltres`). Une seconde
   * écriture des filtres aurait fini par montrer les pièces d'une sélection que le fil n'affiche pas.
   */
  it('🔴 elle transmet les MÊMES filtres que le listing — parties, période, options', async () => {
    await GET(requete('?cible=lot-290&avec=a%40x.fr,b%40y.fr&du=2026-01-01&au=2026-03-31&pieces=avec'));
    const f = porteursMock.mock.calls[0][1] as {
      interlocuteurs: string[]; du: string | null; au: string | null; pieces: string;
    };
    expect(f.interlocuteurs).toEqual(['a@x.fr', 'b@y.fr']);
    expect(f.du).toBe('2026-01-01');
    expect(f.au).toBe('2026-03-31');
    expect(f.pieces).toBe('avec');
  });

  /**
   * 🔴 LA PAGINATION NE CHANGE RIEN, ET C'EST TOUT L'OBJET DE CETTE ROUTE. Le dépôt ne lit ni `page` ni
   * `taille` ; cette épreuve tient la promesse à l'entrée, pour que personne n'aille les y rebrancher.
   */
  it('🔴 `page` et `taille` ne changent pas la réponse : on veut la sélection ENTIÈRE', async () => {
    porteursMock.mockResolvedValue({ messages: [MESSAGE], tronque: false });
    const a = await (await GET(requete('?cible=lot-290'))).json() as { data: { nbPieces: number } };
    const b = await (await GET(requete('?cible=lot-290&page=3&taille=10'))).json() as {
      data: { nbPieces: number };
    };
    expect(a.data.nbPieces).toBe(2);
    expect(b.data.nbPieces).toBe(2);
  });

  /** 🔴 LE COMPTE EST CELUI DES PIÈCES, PAS DES MAILS : c'est le nombre que porte le bouton du résumé. */
  it('🔴 `nbPieces` est la somme des pièces de tous les mails rendus', async () => {
    porteursMock.mockResolvedValue({
      messages: [MESSAGE, { ...MESSAGE, messageId: 13, pieces: [MESSAGE.pieces[0]] }],
      tronque: false,
    });
    const d = await (await GET(requete('?cible=lot-290'))).json() as {
      etat: string; data: { messages: unknown[]; nbPieces: number; tronque: boolean };
    };
    expect(d.etat).toBe('ok');
    expect(d.data.messages).toHaveLength(2);
    expect(d.data.nbPieces).toBe(3);
    expect(d.data.tronque).toBe(false);
  });

  /** ⚠️ LA TRONCATURE VOYAGE : l'écran l'écrit (`motPorteeDuResume`) plutôt que de mentir par omission. */
  it('⚠️ `tronque` est rendu tel quel quand la borne est atteinte', async () => {
    porteursMock.mockResolvedValue({ messages: [MESSAGE], tronque: true });
    const d = await (await GET(requete('?cible=lot-290'))).json() as { data: { tronque: boolean } };
    expect(d.data.tronque).toBe(true);
  });

  /** ⚠️ `sans_schema` / `inconnue` SONT RENDUS EN 200 : aucun n'est une panne, et l'écran les connaît déjà. */
  it('⚠️ une cible sans schéma ou inconnue est rendue telle quelle, en 200', async () => {
    etendreMock.mockResolvedValue({ etat: 'inconnue' });
    const res = await GET(requete('?cible=lot-999'));
    expect(res.status).toBe(200);
    expect((await res.json() as { etat: string }).etat).toBe('inconnue');
    expect(porteursMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 PAS DE CATCH MUET : une liste vide se lirait « aucune pièce dans cette sélection », ce qui serait faux.
   * L'écran distingue l'échec du résumé vide (`EtatPieces`), et il ne peut le faire que si la route le dit.
   */
  it('🔴 une base muette rend 503, jamais une liste vide', async () => {
    porteursMock.mockRejectedValue(new Error('base muette'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(requete('?cible=lot-290'));
    expect(res.status).toBe(503);
    expect((await res.json() as { etat: string }).etat).toBe('erreur');
  });

  it('🔒 jamais de cache partagé : la réponse dit quels fichiers un bien a reçus', async () => {
    const res = await GET(requete('?cible=lot-290'));
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
