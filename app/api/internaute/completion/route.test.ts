import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks des dépendances de la route (mêmes spécificateurs que dans route.ts). On teste l'ORCHESTRATION de l'Écran B
// — CAS 2 (consentement donné SEULEMENT en B → création + frappe du jeton d'émission) et CAS 3 (aucun consentement) —
// SANS base, SANS pipeline, SANS jeton réel. `signerJetonEmission` renvoie un PLACEHOLDER opaque : aucun secret, aucun
// vrai jeton nulle part (ni en clair, ni en log).
const { validerCorpsIngestion, auMoinsUnConsentement } = vi.hoisted(() => ({
  validerCorpsIngestion: vi.fn(),
  auMoinsUnConsentement: vi.fn(),
}));
const { ingererProfil } = vi.hoisted(() => ({ ingererProfil: vi.fn() }));
const { completerParcours } = vi.hoisted(() => ({ completerParcours: vi.fn() }));
const { verifierJetonRectification, signerJetonEmission } = vi.hoisted(() => ({
  verifierJetonRectification: vi.fn(),
  signerJetonEmission: vi.fn(),
}));

// Classes d'erreur : la route fait `e instanceof …` dans son catch (non atteint par ces cas heureux, mais l'export doit
// exister). HOISTÉES avec les mocks : les factory `vi.mock` sont remontées en tête du fichier → une `class` déclarée plus
// bas ne serait pas encore initialisée au moment où la factory s'exécute (ReferenceError).
const { ErreurAucunConsentement, ErreurEmailDuplique } = vi.hoisted(() => ({
  ErreurAucunConsentement: class extends Error {},
  ErreurEmailDuplique: class extends Error {},
}));

vi.mock('../../../lib/internaute/ingestion', () => ({ validerCorpsIngestion, auMoinsUnConsentement }));
vi.mock('../../../lib/internaute/socle', () => ({ ingererProfil, ErreurAucunConsentement }));
vi.mock('../../../lib/internaute/cycleVie', () => ({ completerParcours, ErreurEmailDuplique }));
vi.mock('../../../lib/internaute/jetonRectification', () => ({ verifierJetonRectification, signerJetonEmission }));

import { POST } from './route';

// Corps SANS jeton (jetonFourni=false → pas de CAS 1). `validerCorpsIngestion` étant mocké, le contenu réel importe peu ;
// on fournit un `corps` cohérent que la route relit (`corps.consentements`, `corps.identite`).
const CORPS = {
  identite: { prenom: 'Recon', nom: 'EcranB', email: 'recon@example.test', telephone: null },
  consentements: [{ finalite: 'email_marketing', version: 1 }],
  projet: { versionTunnel: 1, payload: {} },
};
const req = (body: unknown) => ({ json: async () => body }) as unknown as Request;

beforeEach(() => {
  validerCorpsIngestion.mockReset();
  auMoinsUnConsentement.mockReset();
  ingererProfil.mockReset();
  completerParcours.mockReset();
  verifierJetonRectification.mockReset();
  signerJetonEmission.mockReset();
  validerCorpsIngestion.mockReturnValue({ ok: true, corps: CORPS });
});

describe('POST /api/internaute/completion — émission à l’Écran B (CAS 2) & non-couplage (CAS 3)', () => {
  it('(a) consentement en B, pas de jeton en A → CAS 2 : frappe le jeton du projet créé et le RENVOIE', async () => {
    auMoinsUnConsentement.mockReturnValue(true); // au moins un consentement coché en B
    ingererProfil.mockResolvedValue({ internauteId: 'internaute-neuf', projetId: 77, creeInternaute: true });
    signerJetonEmission.mockResolvedValue('jeton-emission-mock'); // PLACEHOLDER opaque, jamais un vrai jeton

    const res = await POST(req({ ...CORPS })); // pas de `jeton` → CAS 2 (jamais CAS 1)
    // le jeton est frappé pour le projet RÉELLEMENT créé dans cette requête
    expect(signerJetonEmission).toHaveBeenCalledWith(77);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, cree: true, complete: true, projetId: 77, jetonEmission: 'jeton-emission-mock' });
    // CAS 2 pur : aucune complétion d'un profil existant
    expect(completerParcours).not.toHaveBeenCalled();
  });

  it('(b) aucun consentement nulle part → CAS 3 : aucun profil créé, aucun jeton', async () => {
    auMoinsUnConsentement.mockReturnValue(false); // rien coché en B

    const res = await POST(req({ ...CORPS, consentements: [] }));
    expect(ingererProfil).not.toHaveBeenCalled(); // invariant « consentement avant persistance » : aucune création
    expect(signerJetonEmission).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, cree: false, complete: false });
    expect(body.jetonEmission).toBeUndefined();
    expect(body.projetId).toBeUndefined();
  });
});
