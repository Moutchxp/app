import { describe, it, expect, vi, beforeEach } from 'vitest';

// db/client mocké : on assère le SQL et le comportement, aucune vraie connexion.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { dossierPasseEnRattachement, dossierDuCorps } from './gardeModification';

beforeEach(() => queryMock.mockReset());

describe('dossierPasseEnRattachement — RATT-EDIT (lot A3) : déclencheur contextuel (présence de permis_projection)', () => {
  it('EXISTS true → true (dossier DÉJÀ passé en Rattachement) ; requête sur permis_projection', async () => {
    queryMock.mockResolvedValue({ rows: [{ e: true }] });
    expect(await dossierPasseEnRattachement(470)).toBe(true);
    expect(String(queryMock.mock.calls[0][0])).toContain('permis_projection');
    expect(queryMock.mock.calls[0][1]).toEqual([470]);
  });

  it('EXISTS false → false (dossier en Analyse : le sous-droit n’est PAS réclamé — contextuel)', async () => {
    queryMock.mockResolvedValue({ rows: [{ e: false }] });
    expect(await dossierPasseEnRattachement(999)).toBe(false);
  });

  it('dossierId invalide (0) → false SANS requête', async () => {
    expect(await dossierPasseEnRattachement(0)).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('dossierDuCorps — résolution du dossier d’un geste porté par corpsId', () => {
  it('corps connu → dossier_id (nombre)', async () => {
    queryMock.mockResolvedValue({ rows: [{ dossier_id: 470 }] });
    expect(await dossierDuCorps(293)).toBe(470);
  });
  it('corps inconnu → null', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await dossierDuCorps(1)).toBeNull();
  });
  it('corpsId invalide → null sans requête', async () => {
    expect(await dossierDuCorps(0)).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
