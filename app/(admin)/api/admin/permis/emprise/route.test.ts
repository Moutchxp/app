import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * PROJ-2 — CONTRAT front → route. On mocke la garde, le repo, la GED et le stockage ; la GÉOMÉTRIE (calageEmprise) reste RÉELLE
 * (pure) pour prouver que la route recalcule la similitude CÔTÉ SERVEUR et enregistre un anneau en LAMBERT, jamais le tracé plan
 * reçu tel quel. On vérifie le COMPORTEMENT + les paramètres liés, pas la forme d'un SQL.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: async () => ({ admin: { id: 1 } }) }));
vi.mock('../../../../../lib/permis/empriseReconstruiteRepo', () => ({
  listerEmprises: async () => [{ id: 1, dossierId: 11434, libelle: '2D1', anneau: [], surfaceM2: 100, pieceId: 55, page: 2, calage: null, residuM: 0, creeLe: null }],
  enregistrerEmprise: vi.fn(async () => ({ ok: true, id: 42 })),
  supprimerEmprise: vi.fn(async () => 1),
  lireContexteEmprise: async () => ({ empreinteAnneaux: [], surfaceTerrainM2: 2886.5, surfacePlancherM2: 900, nbEtages: 3 }),
}));
vi.mock('../../../../../lib/permis/lectureGed', () => ({
  depsReellesLectureGed: () => ({ listerPieces: async () => [
    { id: 55, nomFichier: 'PC2.pdf', typeMime: 'application/pdf', cleStockage: 'k1', tailleOctets: 1 },
    { id: 56, nomFichier: 'photo.jpg', typeMime: 'image/jpeg', cleStockage: 'k2', tailleOctets: 1 },
  ] }),
}));
vi.mock('../../../../../lib/sitadel/demandeRepo', () => ({ lireCleTelechargeable: async () => ({ cle: 'ged/dossier/55.pdf', nomFichier: 'PC2.pdf' }) }));
vi.mock('../../../../../lib/stockage', () => ({ urlSignee: async (cle: string) => `https://signed.example/${cle}` }));

import { GET, POST } from './route';
import { enregistrerEmprise, supprimerEmprise } from '../../../../../lib/permis/empriseReconstruiteRepo';

const get = (q: string) => GET(new Request(`http://test.local/api/admin/permis/emprise${q}`));
const post = (body: unknown) => POST(new Request('http://test.local/api/admin/permis/emprise', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('PROJ-2 — GET', () => {
  it('ne renvoie que les pièces PDF, plus les emprises et le contexte (jamais la clé de stockage)', async () => {
    const res = await get('?dossierId=11434');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.pieces).toEqual([{ id: 55, nomFichier: 'PC2.pdf', typeMime: 'application/pdf' }]); // JPG écartée, cleStockage absente
    expect(j.emprises).toHaveLength(1);
    expect(j.contexte.surfaceTerrainM2).toBe(2886.5);
  });
  it('dossierId absent/invalide → 400', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?dossierId=abc')).status).toBe(400);
  });
});

describe('PROJ-2 — POST enregistrer : géométrie recalculée SERVEUR (plan → Lambert)', () => {
  it('similitude ×2 : tracé plan 5×5 → anneau Lambert 10×10 (aire 100 m²), enregistré en Lambert', async () => {
    const body = {
      action: 'enregistrer', dossierId: '11434', libelle: '2D1', pieceId: 55, page: 2,
      // calage : (0,0)→(0,0) et (1,0)→(2,0) ⇒ échelle ×2, sans rotation
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
      ratioDeclare: null,
    };
    const res = await post(body);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.id).toBe(42);
    expect(j.surfaceM2).toBeCloseTo(100, 6); // 5×5 pt × échelle² (4) = 100 m²
    expect(j.vraisemblance.empriseVsPlancher).toBe('petite'); // attendu ~300 m² (900/3), tolérance ±40 % → [180;420] ; 100 < 180
    // l'anneau PASSÉ au repo est en LAMBERT (×2), pas le tracé plan
    const arg = (enregistrerEmprise as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { anneau: { x: number; y: number }[]; dossierId: number };
    expect(arg.dossierId).toBe(11434);              // chaîne bigint acceptée et coercée
    expect(arg.anneau[1]).toEqual({ x: 10, y: 0 }); // 5 pt × 2 = 10 m
  });

  it('contour < 3 sommets → 400, aucun enregistrement', async () => {
    const res = await post({ action: 'enregistrer', dossierId: 11434, libelle: 'X', anneauPlan: [{ x: 0, y: 0 }, { x: 1, y: 1 }], paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 1, y: 0 } }] });
    expect(res.status).toBe(400);
    expect(enregistrerEmprise).not.toHaveBeenCalled();
  });

  it('calage insuffisant (points confondus) → 400', async () => {
    const res = await post({ action: 'enregistrer', dossierId: 11434, libelle: 'X', anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], paires: [{ plan: { x: 2, y: 2 }, lambert: { x: 0, y: 0 } }, { plan: { x: 2, y: 2 }, lambert: { x: 9, y: 9 } }] });
    expect(res.status).toBe(400);
  });
});

describe('PROJ-2 — POST signer_piece / supprimer', () => {
  it('signer_piece → URL signée inline (clé jamais exposée au client)', async () => {
    const res = await post({ action: 'signer_piece', pieceId: 55 });
    const j = await res.json();
    expect(j.url).toBe('https://signed.example/ged/dossier/55.pdf');
  });
  it('supprimer → scopé au dossier', async () => {
    const res = await post({ action: 'supprimer', dossierId: 11434, id: 42 });
    expect(res.status).toBe(200);
    expect(supprimerEmprise).toHaveBeenCalledWith(42, 11434);
  });
});
