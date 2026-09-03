import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * EXT-1 (étape 2) — POST /permis/extraire (bouton « Diagnostic complet des documents », LOT 56-B). On MOCKE la garde + `executerExtractionPermis` : ce fichier
 * teste le COMPORTEMENT de la route (garde admin, validation dossierId, vision TOUJOURS incluse à la relève, compte rendu relayé,
 * 404/503). L'orchestration elle-même est un module serveur à part.
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/permis/executerExtraction', () => ({ executerExtractionPermis: vi.fn() }));

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerExtractionPermis } from '../../../../../lib/permis/executerExtraction';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const extraire = executerExtractionPermis as unknown as ReturnType<typeof vi.fn>;
const req = (body: unknown) => POST(new Request('http://test/api/admin/permis/extraire', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const RAPPORT = { ok: true, numDau: '07512025V0006', champsRetenus: 3, nbPieces: 46, piecesSansCandidat: 39, visionTournee: true, visionPieces: 1, motifVision: null };

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 });
  extraire.mockResolvedValue(RAPPORT);
});

describe('EXT-1 — POST /permis/extraire', () => {
  it('non-administrateur → refus, aucune extraction', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await req({ dossierId: 531 })).status).toBe(403);
    expect(extraire).not.toHaveBeenCalled();
  });

  it('dossierId invalide → 400, aucune extraction', async () => {
    expect((await req({})).status).toBe(400);
    expect((await req({ dossierId: 'x' })).status).toBe(400);
    expect((await req({ dossierId: 0 })).status).toBe(400);
    expect(extraire).not.toHaveBeenCalled();
  });

  it('relance → vision TOUJOURS incluse, compte rendu relayé', async () => {
    const res = await req({ dossierId: 531 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rapport: RAPPORT });
    // 🔑 un geste délibéré paie l'appel externe : avecVision est TRUE quel que soit le réglage du versement.
    expect(extraire).toHaveBeenCalledWith(531, expect.objectContaining({ avecVision: true }));
    expect(extraire.mock.calls[0][1].majPar).toMatch(/relance/);
  });

  it('permis inconnu (ok:false) → 404', async () => {
    extraire.mockResolvedValueOnce({ ok: false, numDau: null, champsRetenus: 0, nbPieces: 0, piecesSansCandidat: 0, visionTournee: false, visionPieces: 0, motifVision: 'dossier inconnu' });
    expect((await req({ dossierId: 999 })).status).toBe(404);
  });

  it('échec interne → 503', async () => {
    extraire.mockRejectedValueOnce(new Error('boom'));
    expect((await req({ dossierId: 531 })).status).toBe(503);
  });
});
