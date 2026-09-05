import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PL-C — route /api/admin/permis/planche POST (modification). Test FONCTIONNEL (garde + repos mockés) : sélection vide REFUSÉE,
 * provenance = admin authentifié (auteurDe), appels validerSelection / retirerSelection corrects. Jamais permis_parcelle.
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn(async () => ({ auteurId: 2 })) })); // admin id 2
vi.mock('../../../../../lib/permis/selectionParcelleRepo', () => ({
  validerSelection: vi.fn(async () => ({ ok: true, nbSelectionnees: 2, nbDemandees: 2, empreinte: null })),
  retirerSelection: vi.fn(async () => ({ ok: true, nbRetirees: 2, empreinte: null })),
}));
vi.mock('../../../../../lib/permis/plancheParcellesRepo', () => ({
  parcellesVoisines: vi.fn(async () => ({ selection: { active: true, idus: ['A', 'B'] } })),
  suggestionsAdresse: vi.fn(async () => [{ label: 'Rue de l’Inspecteur Allès 75019 Paris', x: 655865, y: 6864587 }]),
  bornerRayon: (n: number) => n ?? 50,
}));

import { GET, POST } from './route';
import { suggestionsAdresse } from '../../../../../lib/permis/plancheParcellesRepo';
import { validerSelection, retirerSelection } from '../../../../../lib/permis/selectionParcelleRepo';

const req = (body: unknown) => new Request('http://x/api/admin/permis/planche', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());

describe('POST — valider / retirer une sélection superposée', () => {
  it('SÉLECTION VIDE (idus absents) → 400, aucun appel à validerSelection (jamais un succès muet)', async () => {
    const res = await POST(req({ action: 'valider', dossierId: 468, idus: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/sélection vide/);
    expect(validerSelection).not.toHaveBeenCalled();
  });
  it('valider avec des parcelles → validerSelection(dossierId, idus, "2") : l’AUTEUR est l’admin authentifié', async () => {
    const res = await POST(req({ action: 'valider', dossierId: 468, idus: ['75119000DI0649', '75119000DI0648'] }));
    expect(res.status).toBe(200);
    expect(validerSelection).toHaveBeenCalledWith(468, ['75119000DI0649', '75119000DI0648'], '2'); // '2' = auteurDe(garde), jamais un harnais
  });
  it('retirer → retirerSelection(dossierId, "2")', async () => {
    const res = await POST(req({ action: 'retirer', dossierId: 468 }));
    expect(res.status).toBe(200);
    expect(retirerSelection).toHaveBeenCalledWith(468, '2');
  });
  it('action inconnue → 400', async () => {
    const res = await POST(req({ action: 'nimporte', dossierId: 468 }));
    expect(res.status).toBe(400);
  });
  it('dossierId invalide → 400 (jamais une écriture sur un id douteux)', async () => {
    const res = await POST(req({ action: 'retirer', dossierId: 0 }));
    expect(res.status).toBe(400);
    expect(retirerSelection).not.toHaveBeenCalled();
  });
});

describe('GET ?suggest — autocomplétion d’adresse (PL-E)', () => {
  it('renvoie les suggestions (label + point) via suggestionsAdresse', async () => {
    const res = await GET(new Request('http://x/api/admin/permis/planche?dossierId=468&suggest=inspecteur'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(suggestionsAdresse).toHaveBeenCalledWith(468, 'inspecteur');
    expect(j.suggestions[0]).toMatchObject({ label: expect.stringContaining('Inspecteur Allès'), x: 655865, y: 6864587 });
  });
});
