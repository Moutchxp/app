import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES — DÉPOSER DANS « SYNDIC & IMMEUBLE », CÔTÉ SERVEUR ═════
 * Un SIMPLE CLASSEMENT LOCAL (décision d'Arno) : la même porte que les autres rangements manuels (`poserCategorieAlaMain`,
 * même geste rendu pour « Annuler », même trace datée), AUCUNE écriture dans la fiche syndic, et un refus motivé tant
 * que la base ne connaît pas la valeur (migration 344). 🔒 Toutes les lectures et écritures sont doublées.
 */
const query = vi.fn();
vi.mock('../../../../../../lib/db/client', () => ({ query: (...a: unknown[]) => query(...a), withTransaction: vi.fn() }));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'a.jorel@sansvisavis.com' }) }));
const poserCategorie = vi.fn();
const lireCartes = vi.fn();
vi.mock('../../../../../../lib/gestion/partieCategorieRepo', () => ({
  lireCategoriesDuBien: async () => [], lireCartesDuBien: (...a: unknown[]) => lireCartes(...a), coordonneesDesParties: async () => [],
  marquerCarteVerifiee: vi.fn(), modifierCarte: vi.fn(), poserCarteAlaMain: vi.fn(), retirerCarte: vi.fn(),
  annulerGesteDeRangement: vi.fn(), poserCategorieAlaMain: (...a: unknown[]) => poserCategorie(...a),
}));
vi.mock('../../../../../../lib/gestion/historiqueRepo', () => ({ contactsParLocataire: async () => [] }));
const syndicauxDuBien = vi.fn();
vi.mock('../../../../../../lib/gestion/partiesSyndicRepo', () => ({ syndicauxDuBien: (...a: unknown[]) => syndicauxDuBien(...a) }));
let disponible = true;
vi.mock('../../../../../../lib/gestion/schema', async (orig) => ({
  ...(await orig<typeof import('../../../../../../lib/gestion/schema')>()), syndicLocalDisponible: async () => disponible,
}));

const { GET, POST } = await import('./route');

const poste = (corps: unknown) => new Request('http://local/api/admin/gestion/historique/parties', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
});
const DEPOT = { cible: 'lot-343', adresse: 'valerka010276.grabovets@gmail.com', categorie: 'syndic_immeuble' };

beforeEach(() => {
  disponible = true;
  query.mockReset().mockResolvedValue({ rows: [] });
  lireCartes.mockReset().mockResolvedValue([]);
  syndicauxDuBien.mockReset().mockResolvedValue([]);
  poserCategorie.mockReset().mockResolvedValue({ ok: true, id: 701, nb: 1, retires: [655] });
});

describe('déposer dans « Syndic & immeuble » = un rangement manuel sur CE bien, par la porte unique', () => {
  it('🔴 la même porte que les autres rangements : le bien de la fiche, la catégorie, l’auteur de la session', async () => {
    const r = await POST(poste(DEPOT));
    expect(r.status).toBe(200);
    expect(poserCategorie).toHaveBeenCalledTimes(1);
    expect(poserCategorie.mock.calls[0][0]).toMatchObject({
      adresse: DEPOT.adresse, lotCle: '343', categorie: 'syndic_immeuble', locataireId: null,
      auteur: { id: 3, libelle: 'a.jorel@sansvisavis.com' },
    });
    /* Le geste est rendu tel quel : « Annuler » rouvre la ligne d'avant (ici le rangement 655) et retire la 701. */
    expect((await r.json()).geste).toEqual({ categoriesPosees: [701], categoriesRetirees: [655], cartesPosees: [], cartesRetirees: [] });
  });
  it('🔒 AUCUNE écriture dans la fiche syndic : ni requête sur ses tables, ni appel à ses routes ou à son dépôt', async () => {
    await POST(poste(DEPOT));
    const sql = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).not.toMatch(/gestion_syndic|gestion_copropriete/);
    expect(syndicauxDuBien).not.toHaveBeenCalled();
    const route = readFileSync('app/(admin)/api/admin/gestion/historique/parties/route.ts', 'utf8');
    expect(route).not.toMatch(/from '[^']*syndicRepo'|affecter-contact|coproprietes|contactsImmeubleRepo/);
  });
  it('sans la migration 344 : refus motivé, rien n’est écrit', async () => {
    disponible = false;
    const r = await POST(poste(DEPOT));
    expect(r.status).toBe(409);
    expect((await r.json()).motif).toContain('migration 344');
    expect(poserCategorie).not.toHaveBeenCalled();
  });
  it('la lecture dit à l’écran si la zone accepte le dépôt (syndicLocal)', async () => {
    const j = await (await GET(new Request('http://local/api/admin/gestion/historique/parties?cible=lot-343'))).json();
    expect(j.data.syndicLocal).toBe(true);
    disponible = false;
    const k = await (await GET(new Request('http://local/api/admin/gestion/historique/parties?cible=lot-343'))).json();
    expect(k.data.syndicLocal).toBe(false);
  });
});
