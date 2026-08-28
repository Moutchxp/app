import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT PROV-3 (2) — POST action 'declare_champ' : écrit UN seul champ déclaré en 'saisie' (trancher une divergence en un clic).
 * On mocke la garde, le dépôt (`ecrireCaracteristiquesGlobales`) et `query` (lecture des CHECK) : ce test porte sur le COMPORTEMENT
 * de l'action (garde admin, liste blanche des clés, écriture d'UNE seule clé en mode 'saisie'), pas sur le SQL.
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../../../../../lib/permis/caracteristiquesRepo', () => ({
  lirePermisCaracteristiques: vi.fn(), ecrireGlobal: vi.fn(), ecrireCorps: vi.fn(),
  ecrireCaracteristiquesGlobales: vi.fn(async () => ({ ecrits: ['nbLogements'], ignores: [] })),
  ecrireDestinations: vi.fn(), creerCorps: vi.fn(), supprimerCorps: vi.fn(), definirRepere: vi.fn(),
  definirAdresseCorps: vi.fn(), validerSommetCorps: vi.fn(),
}));

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { ecrireCaracteristiquesGlobales } from '../../../../../lib/permis/caracteristiquesRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const ecrire = ecrireCaracteristiquesGlobales as unknown as ReturnType<typeof vi.fn>;
const req = (body: unknown) => POST(new Request('http://test/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => { vi.clearAllMocks(); garde.mockResolvedValue({ auteurId: 5 }); });

describe('POST declare_champ (PROV-3 point 2)', () => {
  it('non-administrateur → refus, aucune écriture', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await req({ action: 'declare_champ', dossierId: 531, cle: 'nbLogements', valeur: '21' })).status).toBe(403);
    expect(ecrire).not.toHaveBeenCalled();
  });

  it('clé HORS liste blanche (ex. natureProjet) → 400, aucune écriture', async () => {
    const res = await req({ action: 'declare_champ', dossierId: 531, cle: 'natureProjet', valeur: 'habitation' });
    expect(res.status).toBe(400);
    expect(ecrire).not.toHaveBeenCalled();
  });

  it('clé valide + valeur valide → écrit UNE SEULE clé en mode « saisie »', async () => {
    const res = await req({ action: 'declare_champ', dossierId: 531, cle: 'nbLogements', valeur: '21' });
    expect(res.status).toBe(200);
    expect(ecrire).toHaveBeenCalledTimes(1);
    const [dossierId, valeurs, mode] = ecrire.mock.calls[0];
    expect(dossierId).toBe(531);
    expect(valeurs).toEqual({ nbLogements: 21 }); // UNE seule clé — les autres champs ne sont pas touchés
    expect(mode).toBe('saisie');                  // origine 'saisie' → protégée par l'invariant 103
  });

  it('valeur invalide (nb_logements négatif) → 422, aucune écriture', async () => {
    const res = await req({ action: 'declare_champ', dossierId: 531, cle: 'nbLogements', valeur: '-3' });
    expect(res.status).toBe(422);
    expect(ecrire).not.toHaveBeenCalled();
  });
});
