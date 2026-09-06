import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT PROV-3 (2) — POST action 'declare_champ' : écrit UN seul champ déclaré en 'saisie' (trancher une divergence en un clic).
 * On mocke la garde, le dépôt (`ecrireCaracteristiquesGlobales`) et `query` (lecture des CHECK) : ce test porte sur le COMPORTEMENT
 * de l'action (garde admin, liste blanche des clés, écriture d'UNE seule clé en mode 'saisie'), pas sur le SQL.
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../../../../../lib/permis/caracteristiquesRepo', () => ({
  lirePermisCaracteristiques: vi.fn(), ecrireGlobal: vi.fn(), ecrireCorps: vi.fn(async () => ({ ecrits: ['altitudeSommetNgf'], ignores: [] })),
  ecrireCaracteristiquesGlobales: vi.fn(async () => ({ ecrits: ['nbLogements'], ignores: [] })),
  ecrireDestinations: vi.fn(), creerCorps: vi.fn(), supprimerCorps: vi.fn(), definirRepere: vi.fn(),
  definirAdresseCorps: vi.fn(), validerSommetCorps: vi.fn(), lireAltitudeDernierPlancherCorps: vi.fn(async () => null), attribuerNomsRepli: vi.fn(),
}));

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { ecrireCaracteristiquesGlobales, validerSommetCorps, ecrireCorps, lireAltitudeDernierPlancherCorps } from '../../../../../lib/permis/caracteristiquesRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const ecrire = ecrireCaracteristiquesGlobales as unknown as ReturnType<typeof vi.fn>;
const validerSommet = validerSommetCorps as unknown as ReturnType<typeof vi.fn>;
const ecrireUnCorps = ecrireCorps as unknown as ReturnType<typeof vi.fn>;
const lirePlancher = lireAltitudeDernierPlancherCorps as unknown as ReturnType<typeof vi.fn>;
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

describe('DURCISSEMENT — POST valider_sommet : refus serveur si sommet SOUS le dernier plancher (défense en profondeur)', () => {
  it('sommet < plancher (au-delà de la marge) → 422 + message clair, AUCUNE validation écrite', async () => {
    lirePlancher.mockResolvedValueOnce(115.68); // plancher du corps
    const res = await req({ action: 'valider_sommet', corpsId: 5, valeur: 107.04 });
    expect(res.status).toBe(422);
    expect((await res.json()).erreur).toContain('sous le dernier plancher');
    expect(validerSommet).not.toHaveBeenCalled(); // rien n'est validé
  });
  it('sommet > plancher → validation écrite (200)', async () => {
    lirePlancher.mockResolvedValueOnce(115.68);
    const res = await req({ action: 'valider_sommet', corpsId: 5, valeur: 122.65 });
    expect(res.status).toBe(200);
    expect(validerSommet).toHaveBeenCalledWith(5, 122.65, expect.anything());
  });
  it('sommet = plancher (dans la marge) → validation ACCEPTÉE (avertissement seulement, jamais bloquant)', async () => {
    lirePlancher.mockResolvedValueOnce(115.68);
    const res = await req({ action: 'valider_sommet', corpsId: 5, valeur: 115.68 });
    expect(res.status).toBe(200);
    expect(validerSommet).toHaveBeenCalledWith(5, 115.68, expect.anything());
  });
  it('plancher absent (null) → jamais de blocage (impossible à prouver) → 200', async () => {
    lirePlancher.mockResolvedValueOnce(null);
    const res = await req({ action: 'valider_sommet', corpsId: 5, valeur: 12.0 });
    expect(res.status).toBe(200);
    expect(validerSommet).toHaveBeenCalled();
  });
  it('champ vidé (valeur vide) → efface la validation, jamais bloqué par la cohérence', async () => {
    const res = await req({ action: 'valider_sommet', corpsId: 5, valeur: '' });
    expect(res.status).toBe(200);
    expect(validerSommet).toHaveBeenCalledWith(5, null, expect.anything());
  });
});

describe('PÉRIMÈTRE — l’ENREGISTREMENT du bâtiment n’est JAMAIS bloqué par l’incohérence (seule la validation l’est)', () => {
  it("action 'corps' avec un sommet incohérent (107,04) → écrit quand même (le dossier reste sauvegardable/corrigeable)", async () => {
    const res = await req({ action: 'corps', corpsId: 5, valeurs: { altitudeSommetNgf: 107.04, altitudeDernierPlancherNgf: 115.68 } });
    expect(res.status).toBe(200);
    expect(ecrireUnCorps).toHaveBeenCalledTimes(1);
    expect(lirePlancher).not.toHaveBeenCalled(); // le contrôle de cohérence ne s'applique PAS à l'enregistrement
  });
});
