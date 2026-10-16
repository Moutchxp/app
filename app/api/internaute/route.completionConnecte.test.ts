import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * POST /api/internaute — complétion du compte d'un internaute CONNECTÉ (lot COORDONNEES-CONNU, décision 3a). PROUVE :
 * cases VIDES seulement, jamais l'e-mail, uniquement si la SESSION désigne le dossier réutilisé, par le chemin de
 * rectification existant (canal 'tunnel'), et sans jamais bloquer l'ingestion. `validerRectification` reste RÉELLE.
 */
const h = vi.hoisted(() => ({
  ingererProfil: vi.fn(), signerJetonRectification: vi.fn(), signerJetonEmission: vi.fn(),
  exigerInternaute: vi.fn(), lireCompte: vi.fn(), rectifierInternaute: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/internaute/socle', () => ({ ingererProfil: h.ingererProfil, ErreurAucunConsentement: class extends Error {} }));
vi.mock('../../lib/internaute/jetonRectification', () => ({ signerJetonRectification: h.signerJetonRectification, signerJetonEmission: h.signerJetonEmission }));
vi.mock('../../lib/internaute/authGarde', () => ({ exigerInternaute: h.exigerInternaute }));
vi.mock('../../lib/internaute/espace', () => ({ lireCompte: h.lireCompte }));
vi.mock('../../lib/internaute/cycleVie', () => ({ rectifierInternaute: h.rectifierInternaute }));

import { POST } from './route';

const corps = (identite: Record<string, unknown>) => ({
  identite: { prenom: 'Arno', nom: 'Essai', email: 'a@example.com', telephone: '+33611111111', ...identite },
  consentements: [],
  projet: { versionTunnel: 1, payload: {}, verdict: 'SANS_VIS_A_VIS', etage: 0, dernierEtage: false },
});
const requete = (b: unknown) => new Request('http://localhost/api/internaute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

describe('POST /api/internaute — compte connecté complété (cases vides seulement)', () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => f.mockReset());
    h.signerJetonEmission.mockResolvedValue('JETON_EMISSION');
    h.ingererProfil.mockResolvedValue({ internauteId: 'uuid-compte', projetId: 5, creeInternaute: false });
    h.rectifierInternaute.mockResolvedValue({ rectifie: true });
  });

  it('session = ce dossier, téléphone vide sur le compte → complété par la rectification existante (canal tunnel), rien d’autre', async () => {
    h.exigerInternaute.mockResolvedValue({ internauteId: 'uuid-compte' });
    h.lireCompte.mockResolvedValue({ prenom: 'Arno', nom: 'Essai', email: 'a@example.com', telephone: null });
    const res = await POST(requete(corps({ prenom: 'Autre' })));
    expect(res.status).toBe(200);
    expect(h.rectifierInternaute).toHaveBeenCalledTimes(1);
    expect(h.rectifierInternaute).toHaveBeenCalledWith('uuid-compte', { telephone: '+33611111111' }, null, 'tunnel');
  });

  it('compte déjà complet → aucune écriture (jamais d’écrasement)', async () => {
    h.exigerInternaute.mockResolvedValue({ internauteId: 'uuid-compte' });
    h.lireCompte.mockResolvedValue({ prenom: 'Arno', nom: 'Essai', email: 'a@example.com', telephone: '+33612345678' });
    await POST(requete(corps({ prenom: 'Autre', nom: 'Autre' })));
    expect(h.rectifierInternaute).not.toHaveBeenCalled();
  });

  it('session d’un AUTRE internaute → aucune écriture (verrou anti-tiers)', async () => {
    h.exigerInternaute.mockResolvedValue({ internauteId: 'uuid-autre' });
    h.lireCompte.mockResolvedValue({ prenom: null, nom: null, email: 'a@example.com', telephone: null });
    await POST(requete(corps({})));
    expect(h.lireCompte).not.toHaveBeenCalled();
    expect(h.rectifierInternaute).not.toHaveBeenCalled();
  });

  it('non connecté → aucune écriture (comportement d’avant)', async () => {
    h.exigerInternaute.mockResolvedValue({ refus: Response.json({}, { status: 401 }) });
    await POST(requete(corps({})));
    expect(h.rectifierInternaute).not.toHaveBeenCalled();
  });

  it('nouveau dossier créé → la complétion n’est même pas tentée', async () => {
    h.ingererProfil.mockResolvedValue({ internauteId: 'uuid-neuf', projetId: 6, creeInternaute: true });
    await POST(requete(corps({})));
    expect(h.exigerInternaute).not.toHaveBeenCalled();
  });

  it('jamais l’e-mail, même si le compte n’en a pas', async () => {
    h.exigerInternaute.mockResolvedValue({ internauteId: 'uuid-compte' });
    h.lireCompte.mockResolvedValue({ prenom: null, nom: 'Essai', email: null, telephone: '+33612345678' });
    await POST(requete(corps({})));
    expect(h.rectifierInternaute).toHaveBeenCalledWith('uuid-compte', { prenom: 'Arno' }, null, 'tunnel');
  });

  it('échec de la complétion → l’ingestion répond quand même 200 (non bloquant)', async () => {
    h.exigerInternaute.mockResolvedValue({ internauteId: 'uuid-compte' });
    h.lireCompte.mockRejectedValue(new Error('db down'));
    const res = await POST(requete(corps({})));
    expect(res.status).toBe(200);
    expect((await res.json()).jetonEmission).toBe('JETON_EMISSION');
  });
});
