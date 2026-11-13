import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sansRemunerations } from '../../../../lib/transaction/donneesGlobal';

/**
 * 🔴🔴 472 — CONFIDENTIALITÉ DES « RÉMUNÉRATIONS ASSOCIÉS » dans le Suivi CA (la route de la tuile Transaction, ouverte au droit « Transaction ») :
 * la lecture du CA global ne les demande QUE pour un compte qui a « Les coûts » (relu en base) ; pour tout autre, la lecture commune les retire,
 * lignes ET montants, avant tout calcul.
 */
vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ garde: vi.fn(), voit: vi.fn(), lire: vi.fn(), location: vi.fn(), lignes: vi.fn() }));
vi.mock('../../../../lib/transaction/garde', () => ({ exigerTransaction: () => h.garde() }));
vi.mock('../../../../lib/mon-espace/compteRepo', () => ({ estAdministrateur: async () => true, peutVoirCouts: (id: number) => h.voit(id) }));
vi.mock('../../../../lib/transaction/donneesGlobal', async (orig) => ({ ...(await orig<typeof import('../../../../lib/transaction/donneesGlobal')>()), lireDonneesGlobal: (...a: unknown[]) => h.lire(...a) }));
vi.mock('../../../../lib/transaction/repo', () => ({ transactionDisponible: async () => true, lireCoutsLignes: () => h.lignes() }));
vi.mock('../../../../lib/transaction/locationLue', () => ({ lireLocationCa: () => h.location() }));
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

describe('🔴🔴 la confidentialité des salaires (option 1) : la RÉPONSE de la route', () => {
  const l = (id: number, compteId: number, mois: number, montantHt: number, famille = 'vente') => ({ id, societe: 'criterimmo', famille, poste: 'salaires', annee: 2026, mois, compteId,
    compteLibelle: `Salarié ${compteId}`, libelle: null, montantHt, version: 1 });
  const LIGNES = [l(1, 5, 9, 2100.5), l(2, 8, 9, 1900), l(3, 5, 10, 2200), l(4, 4, 9, 1800, 'location')];
  const DONNEES = { ventes: [], coutsLignes: LIGNES, coutsSaisis: LIGNES.filter((x) => x.famille === 'vente').map(({ societe, famille, poste, annee, mois, montantHt }) => ({ societe, famille, poste, annee, mois, montantHt })),
    gestion: [], locationCa: { lignes: [], retrocessions: [], salaires: [{ annee: 2026, mois: 9, salairesHt: 1800, note: null }], dus: [] } };
  const corps = async (vue: string) => JSON.stringify(await (await GET(new Request(`http://local/api/admin/transaction?vue=${vue}`))).json());
  beforeEach(() => { h.lire.mockResolvedValue(DONNEES); h.lignes.mockResolvedValue(LIGNES); h.location.mockResolvedValue({ disponible: true, lignes: [], retrocessions: [],
    salaires: [{ annee: 2026, mois: 9, salairesHt: 1800, note: null }], dus: [] }); });
  it('compte Transaction SANS « Les coûts » — CA global : aucun salaire individuel (ni ligne, ni nom, ni montant seul), l’agrégat de deux salariés seulement', async () => {
    h.voit.mockResolvedValue(false);
    const c = await corps('global');
    expect(c).not.toMatch(/Salarié \d|2100\.5|"montantHt":1900|"montantHt":2200|"salairesHt":1800/);
    expect(c).toContain('"montantHt":4000.5'); // septembre, deux salariés : l'agrégat
    expect(c).toContain('"salairesMasques"');
  });
  it('… et Suivi CA › Location : le mois d’un seul salarié n’est pas livré', async () => {
    h.voit.mockResolvedValue(false);
    const c = await corps('location');
    expect(c).not.toContain('"salairesHt":1800');
    expect(c).toContain('"salairesHt":null');
  });
  it('compte « Les coûts » : tout, comme avant (le détail compris)', async () => {
    h.voit.mockResolvedValue(true);
    expect(await corps('global')).toContain('Salarié 5');
    expect(await corps('location')).toContain('"salairesHt":1800');
  });
});
