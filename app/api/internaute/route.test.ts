import { describe, it, expect, vi } from 'vitest';

/**
 * POST /api/internaute — LIVRAISON (Commit 2). La route de l'Écran A doit désormais ACCEPTER un corps à 0 consentement :
 * elle crée le profil (`ingererProfil`) et frappe le jeton d'émission — le PDF est dû à tous. On mocke `socle`
 * (`ingererProfil`) et les signeurs ; `validerCorpsIngestion` reste RÉEL → on prouve qu'un vrai corps à 0 consentement
 * passe la validation et n'est PLUS refusé (422 supprimé). Aucun secret, aucune base.
 */
const { ingererProfil } = vi.hoisted(() => ({ ingererProfil: vi.fn() }));
const { signerJetonRectification, signerJetonEmission } = vi.hoisted(() => ({
  signerJetonRectification: vi.fn(),
  signerJetonEmission: vi.fn(),
}));
vi.mock('../../lib/internaute/socle', () => ({ ingererProfil, ErreurAucunConsentement: class extends Error {} }));
vi.mock('../../lib/internaute/jetonRectification', () => ({ signerJetonRectification, signerJetonEmission }));

import { POST } from './route';

function requete(body: unknown): Request {
  return new Request('http://localhost/api/internaute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Corps VALIDE (identité + projet requis) mais SANS aucun consentement.
const CORPS_SANS_CONSENTEMENT = {
  identite: { prenom: 'Sans', nom: 'Consentement', email: 'livraison@example.com', telephone: null },
  consentements: [],
  projet: { versionTunnel: 1, payload: {}, verdict: 'SANS_VIS_A_VIS', etage: 0, dernierEtage: false },
};

describe('POST /api/internaute — 0 consentement n’est plus refusé (Commit 2)', () => {
  it('0 consentement → 200, profil ingéré, jeton d’émission frappé (le PDF pourra partir)', async () => {
    ingererProfil.mockResolvedValue({ internauteId: 'uuid-livraison', projetId: 77, creeInternaute: true });
    signerJetonRectification.mockResolvedValue('JETON_RECT');
    signerJetonEmission.mockResolvedValue('JETON_EMISSION');

    const res = await POST(requete(CORPS_SANS_CONSENTEMENT));

    expect(res.status).toBe(200); // AVANT Commit 2 : 422 « au moins un consentement requis »
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.projetId).toBe(77);
    expect(data.jetonEmission).toBe('JETON_EMISSION');
    expect(ingererProfil).toHaveBeenCalledTimes(1); // la route INGÈRE au lieu de refuser
  });
});
