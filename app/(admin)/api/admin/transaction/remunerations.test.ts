import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sansRemunerations } from '../../../../lib/transaction/donneesGlobal';

/**
 * 🔴🔴 472 — CONFIDENTIALITÉ DES « RÉMUNÉRATIONS ASSOCIÉS » dans le Suivi CA (la route de la tuile Transaction, ouverte au droit « Transaction ») :
 * la lecture du CA global ne les demande QUE pour un compte qui a « Les coûts » (relu en base) ; pour tout autre, la lecture commune les retire,
 * lignes ET montants, avant tout calcul.
 */
vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ garde: vi.fn(), voit: vi.fn(), lire: vi.fn() }));
vi.mock('../../../../lib/transaction/garde', () => ({ exigerTransaction: () => h.garde() }));
vi.mock('../../../../lib/mon-espace/compteRepo', () => ({ estAdministrateur: async () => true, peutVoirCouts: (id: number) => h.voit(id) }));
vi.mock('../../../../lib/transaction/donneesGlobal', async (orig) => ({ ...(await orig<typeof import('../../../../lib/transaction/donneesGlobal')>()), lireDonneesGlobal: (...a: unknown[]) => h.lire(...a) }));
vi.mock('../../../../lib/transaction/repo', () => ({ transactionDisponible: async () => true }));
import { GET } from './route';

beforeEach(() => { h.garde.mockReset().mockResolvedValue({ auteurId: 9 }); h.voit.mockReset(); h.lire.mockReset().mockResolvedValue({ ventes: [] }); });
const lire = async () => (await GET(new Request('http://local/api/admin/transaction?vue=global'))).status;

describe('🔴 Suivi CA › CA global : les rémunérations des associés selon le compte', () => {
  it('un compte SANS « Les coûts » (droit Transaction seul) : la lecture ne les demande pas', async () => {
    h.voit.mockResolvedValue(false);
    expect(await lire()).toBe(200);
    expect(h.voit).toHaveBeenCalledWith(9);
    expect(h.lire).toHaveBeenCalledWith(expect.any(String), { remunerations: false });
  });
  it('un compte AVEC « Les coûts » : elles comptent dans toutes les analyses de coûts', async () => {
    h.voit.mockResolvedValue(true);
    expect(await lire()).toBe(200);
    expect(h.lire).toHaveBeenCalledWith(expect.any(String), { remunerations: true });
  });
  it('la voie de secours (aucun compte) : jamais', async () => {
    h.garde.mockResolvedValue({ auteurId: null });
    expect(await lire()).toBe(200);
    expect(h.voit).not.toHaveBeenCalled();
    expect(h.lire).toHaveBeenCalledWith(expect.any(String), { remunerations: false });
  });
  it('le filtre de la lecture commune : les lignes « remunerations » partent, toutes les autres restent', () => {
    const xs = [{ poste: 'salaires', m: 1 }, { poste: 'remunerations', m: 2 }, { poste: 'autres', m: 3 }];
    expect(sansRemunerations(xs)).toEqual([{ poste: 'salaires', m: 1 }, { poste: 'autres', m: 3 }]);
  });
});
