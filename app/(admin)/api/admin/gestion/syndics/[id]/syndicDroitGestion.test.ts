import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (28/11/2026, 14h00, point 4) — « mêmes droits (administrateur toujours ; sans le droit, boutons absents et mention claire), contrôlés côté
 * serveur ». La fenêtre ouverte depuis la Location écrit par CETTE route, celle de la Gestion : sans le droit « Gestion », le refus de la garde est rendu
 * tel quel et RIEN n'est lu ni écrit ; avec lui, la saisie va à la porte unique enregistrerSyndic.
 */
const g = vi.hoisted(() => ({ refus: null as Response | null, droits: [] as string[] }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async (_r: Request, droit: string) => { g.droits.push(droit); return g.refus; }) }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
const repo = vi.hoisted(() => ({ enregistrerSyndic: vi.fn(async () => ({ ok: true, id: 54 })) }));
vi.mock('../../../../../../lib/gestion/syndicRepo', () => ({
  enregistrerSyndic: repo.enregistrerSyndic, ficheSyndic: vi.fn(), supprimerSyndic: vi.fn(), syndicsDisponibles: async () => true,
}));
import { PUT } from './route';

const corps = { nom: 'CABINET _TEST', adresse: '1 rue _TEST', codePostal: '75001', ville: 'Paris', immeubles: [], confirmeDoublons: true, doublonsSyndicIgnores: [],
  coordonneesCabinet: [{ id: null, sorte: 'telephone', libelle: 'Portable', valeur: '0611223344' }] };
const appel = () => PUT(new Request('http://localhost/api/admin/gestion/syndics/54', { method: 'PUT', body: JSON.stringify(corps) }), { params: Promise.resolve({ id: '54' }) });
beforeEach(() => { g.refus = null; g.droits = []; repo.enregistrerSyndic.mockClear(); });

describe('PUT /api/admin/gestion/syndics/[id] — le droit « Gestion »', () => {
  it('sans le droit : le refus de la garde (403), et enregistrerSyndic n’est jamais appelé', async () => {
    g.refus = Response.json({ erreur: 'Accès refusé.' }, { status: 403 });
    const r = await appel();
    expect(r.status).toBe(403);
    expect(g.droits).toEqual(['gestion']);
    expect(repo.enregistrerSyndic).not.toHaveBeenCalled();
  });
  it('avec le droit : la saisie (et la liste du cabinet) va à la porte unique', async () => {
    const r = await appel();
    expect(r.status).toBe(200);
    expect(repo.enregistrerSyndic).toHaveBeenCalledTimes(1);
    expect((repo.enregistrerSyndic.mock.calls[0] as unknown[])[1]).toMatchObject({ coordonneesCabinet: [{ sorte: 'telephone', libelle: 'Portable', valeur: '0611223344' }] });
  });
});
