import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 MON ESPACE, LOT 7 — la VRAIE route POST /api/admin/mon-espace/geste, base simulée : qui peut faire le geste (négociateur de l'affaire ou
 * administrateur ; 403 sinon, la fonction de la tuile n'est jamais appelée), la version transmise (409 renvoyé tel quel), les saisies refusées.
 */
const h = vi.hoisted(() => ({ garde: vi.fn(), acte: vi.fn(), annuler: vi.fn(), retour: vi.fn(), role: 'collaborateur' }));
vi.mock('../../../../../lib/mon-espace/garde', () => ({ exigerMonEspace: h.garde }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'lea@x.fr' }) }));
vi.mock('../../../../../lib/db/client', () => ({ query: async () => ({ rows: [{ role: h.role }] }) }));
vi.mock('../../../../../lib/transaction/repo', () => ({
  acteSigne: h.acte, annulerCompromis: h.annuler, retourCompromis: h.retour, comptesRapprochesDesLibelles: async () => ({}),
  lireVentes: async () => [{ id: 3, libelle: 'X', lignes: [], repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 7, negociateur: 'Marc' }] },
    dossier: { entree: { id: 7, nom: 'Marc' }, sortie: { id: 5, nom: 'Léa' } } }],
}));
import { POST } from './route';

const poster = async (corps: Record<string, unknown>) => {
  const r = await POST(new Request('http://local/api/admin/mon-espace/geste', { method: 'POST', body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as { etat?: string; motif?: string; conflit?: boolean } };
};
beforeEach(() => {
  h.garde.mockResolvedValue({ auteurId: 5 }); h.role = 'collaborateur';
  for (const f of [h.acte, h.annuler, h.retour]) f.mockReset().mockResolvedValue({ ok: true });
});

describe('🔴 POST /api/admin/mon-espace/geste', () => {
  it('Léa (sortie) : « Acte signé » part vers acteSigne de la tuile, avec la date et la version', async () => {
    expect((await poster({ geste: 'acte-signe', id: 3, version: 41, dateActe: '2026-11-20' })).status).toBe(200);
    expect(h.acte).toHaveBeenCalledWith(3, '2026-11-20', { id: 5, libelle: 'lea@x.fr' }, 41);
  });
  it('« Annuler le compromis » (motif obligatoire) et « Revenir en compromis » : les fonctions de la tuile', async () => {
    expect((await poster({ geste: 'compromis-annuler', id: 3, version: 41, annulation: { motif: 'defaut_credit', date: '2026-11-02' } })).status).toBe(200);
    expect(h.annuler).toHaveBeenCalledWith(3, { motif: 'Défaut de crédit', date: '2026-11-02', note: null }, { id: 5, libelle: 'lea@x.fr' }, 41);
    expect((await poster({ geste: 'compromis-annuler', id: 3, annulation: { motif: 'autre', autre: '', date: '2026-11-02' } })).status).toBe(422);
    expect((await poster({ geste: 'retour-compromis', id: 3, version: 42 })).status).toBe(200);
    expect(h.retour).toHaveBeenCalledWith(3, { id: 5, libelle: 'lea@x.fr' }, 42);
  });
  it('un collaborateur hors de l’affaire : 403, rien n’est appelé ; un administrateur : accepté', async () => {
    h.garde.mockResolvedValue({ auteurId: 9 });
    expect((await poster({ geste: 'acte-signe', id: 3, dateActe: '2026-11-20' })).status).toBe(403);
    expect(h.acte).not.toHaveBeenCalled();
    h.role = 'administrateur';
    expect((await poster({ geste: 'acte-signe', id: 3, dateActe: '2026-11-20' })).status).toBe(200);
  });
  it('un collègue a enregistré entre-temps : 409, le motif de la tuile tel quel', async () => {
    h.acte.mockResolvedValue({ ok: false, motif: 'Un collègue vient de modifier cette affaire — rechargez pour voir ses changements avant d’enregistrer.', conflit: true });
    const r = await poster({ geste: 'acte-signe', id: 3, version: 1, dateActe: '2026-11-20' });
    expect([r.status, r.corps.conflit]).toEqual([409, true]);
  });
  it('geste inconnu, date illisible, affaire inconnue : refusés', async () => {
    expect((await poster({ geste: 'supprimer', id: 3 })).status).toBe(400);
    expect((await poster({ geste: 'acte-signe', id: 3, dateActe: 'demain' })).status).toBe(422);
    expect((await poster({ geste: 'acte-signe', id: 99, dateActe: '2026-11-20' })).status).toBe(404);
  });
});
