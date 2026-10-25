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
});
