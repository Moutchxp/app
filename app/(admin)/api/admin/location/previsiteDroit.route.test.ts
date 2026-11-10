import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (10/11/2026, option A) — UN COMPTE GESTION SEUL (sans le droit « Location ») : aucune écriture possible côté serveur. Les gestes
 * de la pré-visite, de l'état des lieux et de la sortie passent par `/api/admin/location`, dont la garde (`exigerLocation`, droit relu en base)
 * refuse ; aucune fonction d'écriture n'est appelée. Base et droits simulés.
 */
vi.mock('../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../lib/location/garde', () => ({ exigerLocation: async () => ({ refus: new Response(JSON.stringify({ etat: 'refus' }), { status: 403 }) }) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 9, libelle: 'gestion-seule@exemple.test' }) }));
const { ecritures, planifierEdls, enregistrerSortie } = vi.hoisted(() => ({
  ecritures: { programmerPrevisite: vi.fn(), deplacerPrevisite: vi.fn(), reaffecterPrevisite: vi.fn(), envoyerCompteRendu: vi.fn(), envoyerRefus: vi.fn() },
  planifierEdls: vi.fn(), enregistrerSortie: vi.fn(),
}));
vi.mock('../../../../lib/location/previsiteRepo', () => ({
  ...Object.fromEntries(Object.entries(ecritures).map(([k, f]) => [k, (...a: unknown[]) => f(...a)])),
  apercuCompteRendu: vi.fn(), apercuRdvPrevisite: vi.fn(), apercuRefus: vi.fn(), avecPrevisites: vi.fn(), collegesPrevisite: vi.fn(),
  envoyerMailLocatairesPrevisite: vi.fn(), texteRefusPropose: vi.fn(),
}));
vi.mock('../../../../lib/location/edlsRepo', () => ({ planifierEdls: (...a: unknown[]) => planifierEdls(...a), deplacerEdls: vi.fn(), reattribuerEdls: vi.fn(), confiablesEdls: vi.fn() }));
vi.mock('../../../../lib/location/sortieLocatairesRepo', () => ({
  enregistrerSortie: (...a: unknown[]) => enregistrerSortie(...a), notifierSortie: vi.fn(), rechercherOccupants: vi.fn(), lireBail: vi.fn(),
  bauxDuLocataire: vi.fn(), corrigerSortie: vi.fn(), annulerSortie: vi.fn(), encartDuBail: vi.fn(),
}));

import { POST } from './route';

const post = (corps: unknown) => POST(new Request('http://localhost/api/admin/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }));
beforeEach(() => { for (const f of [...Object.values(ecritures), planifierEdls, enregistrerSortie]) f.mockClear(); });

describe('compte Gestion seul : aucune écriture possible côté serveur', () => {
  it.each([
    ['programmer-previsite', { occupationIds: [11], jour: '2026-11-20', debut: '10:00', fin: '11:00', destinataires: [3] }],
    ['deplacer-previsite', { occupationIds: [11], jour: '2026-11-21', debut: '10:00', fin: '11:00' }],
    ['reaffecter-previsite', { occupationIds: [11], destinataires: [3] }],
    ['compte-rendu-previsite', { occupationIds: [11], corps: 'CR', aussiLocataires: false }],
    ['refus-previsite', { occupationIds: [11], texte: 'Bonjour,' }],
    ['planifier-edls', { occupationIds: [11], jour: '2026-11-20', debut: '10:00', fin: '11:00', confieA: 3 }],
    ['sortie-locataires', { occupationId: 11, sortants: [11], date: '2026-11-30' }],
  ])('« %s » : refusé (403), rien n’est écrit', async (action, corps) => {
    const r = await post({ action, ...corps });
    expect(r.status).toBe(403);
    for (const f of [...Object.values(ecritures), planifierEdls, enregistrerSortie]) expect(f).not.toHaveBeenCalled();
  });
});
