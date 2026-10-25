import { describe, it, expect, vi, beforeEach } from 'vitest';

/** LOCATION « Outils de suivi » — l'export .xlsx : droit « Location », les filtres de l'écran, le droit aux commissions relu. */
vi.mock('server-only', () => ({}));
const exigerLocation = vi.fn();
vi.mock('../../../../../../lib/location/garde', () => ({ exigerLocation: (...a: unknown[]) => exigerLocation(...a) }));
const estAdministrateurActif = vi.fn();
vi.mock('../../../../../../lib/location/suivi/suiviRepo', () => ({ estAdministrateurActif: (...a: unknown[]) => estAdministrateurActif(...a) }));
const donneesTableau = vi.fn();
vi.mock('../../../../../../lib/location/suivi/tableauBordRepo', () => ({ donneesTableau: (...a: unknown[]) => donneesTableau(...a) }));
const classeurSuivi = vi.fn();
vi.mock('../../../../../../lib/location/suivi/exportXlsx', () => ({ classeurSuivi: (...a: unknown[]) => classeurSuivi(...a) }));
const { GET } = await import('./route');

const L = (id: number, date: string, avecGestion: boolean) => ({ id, dateSignature: date, avecGestion, negociateurId: 5, negociateurLibelle: 'JB', apporteurId: null, origineProprietaire: null });
beforeEach(() => {
  exigerLocation.mockReset().mockResolvedValue({ auteurId: 5 });
  estAdministrateurActif.mockReset().mockResolvedValue(false);
  donneesTableau.mockReset().mockResolvedValue({ activites: [L(1, '2025-03-01', true), L(2, '2026-03-01', true), L(3, '2026-04-02', false)], regles: [], apporteurs: [], retrocessions: [], negociateurs: [] });
  classeurSuivi.mockReset().mockResolvedValue(Buffer.from('xlsx'));
});

describe('GET /api/admin/location/suivi/export', () => {
  it('sans le droit Location : refusé, rien n’est lu', async () => {
    exigerLocation.mockResolvedValue({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await GET(new Request('http://x/export?annee=2026'))).status).toBe(403);
    expect(donneesTableau).not.toHaveBeenCalled();
  });
  it('l’année seule, filtrée comme l’écran ; le fichier part en pièce jointe', async () => {
    const r = await GET(new Request('http://x/export?annee=2026&gestion=sans'));
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="suivi-location-2026.xlsx"');
    const o = classeurSuivi.mock.calls[0][0];
    expect(o.activites.map((a: { id: number }) => a.id)).toEqual([3]);
    expect(o.voirCommissions).toBe(false);
    expect(o.filtres).toBe('sans gestion');
  });
  it('🔴 Arno (25/10/2026) — un négociateur non administrateur : SA commission brute de chaque mois, demandée pour SON compte ; rien d’un autre', async () => {
    donneesTableau.mockResolvedValue({ activites: [], regles: [], apporteurs: [], retrocessions: [], negociateurs: [],
      negociateurPropre: { cle: 'id:5', libelle: 'JB', lignes: [{ cle: 'id:5', libelle: 'JB', mois: '2026-03', totaux: { commission: 412.5, retrocessions: 40 } }], historique: [] } });
    await GET(new Request('http://x/export?annee=2026'));
    expect(donneesTableau.mock.calls[0][3]).toBe(5);
    const o = classeurSuivi.mock.calls[0][0];
    expect(o.voirCommissions).toBe(false);
    expect(o.commissionPropre).toEqual({ libelle: 'JB', parMois: { '2026-03': { commission: 412.5, retrocessions: 40 } } });
  });
  it('un administrateur : tout, sans commission « propre »', async () => {
    estAdministrateurActif.mockResolvedValue(true);
    await GET(new Request('http://x/export?annee=2026'));
    expect(donneesTableau.mock.calls[0][1]).toBe(true);
    expect(donneesTableau.mock.calls[0][3]).toBeNull();
    expect(classeurSuivi.mock.calls[0][0].commissionPropre).toBeUndefined();
  });
  it('🔴 Arno (25/10/2026, 4a) — la PÉRIODE du Suivi annuel : toutes les années lues, ses seules affaires, un onglet par mois de la période', async () => {
    const r = await GET(new Request('http://x/export?debut=2025-01-01&fin=2026-03-31&gestion=avec'));
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="suivi-location-2025-01-01_2026-03-31.xlsx"');
    expect(donneesTableau.mock.calls[0][0]).toBe(2026);
    expect(donneesTableau.mock.calls[0][4]).toEqual({ toutes: true });
    const o = classeurSuivi.mock.calls[0][0];
    expect(o.activites.map((a: { id: number }) => a.id)).toEqual([1, 2]);
    expect(o.mois).toHaveLength(15);
    expect([o.mois[0], o.mois.at(-1)]).toEqual(['2025-01', '2026-03']);
  });
  it('une période illisible ou inversée : l’année (comme avant)', async () => {
    await GET(new Request('http://x/export?debut=2026-01-01&fin=2025-01-01&annee=2026'));
    expect(donneesTableau.mock.calls[0][4]).toEqual({ toutes: false });
    expect(classeurSuivi.mock.calls[0][0].mois).toBeUndefined();
  });
});
