import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 LES PRÉAVIS LUS CÔTÉ GESTION (Arno, 10/11/2026, option A) — la route de LECTURE : au droit « Gestion » (relu en base), la MÊME donnée
 * que la Location (mêmes fonctions) ; AUCUNE écriture n'y est atteignable. Base et droits simulés.
 */
let droitGestion = true;
vi.mock('../../../../../lib/admin/garde', () => ({
  exigerCompteActif: async (_r: Request, module: string) => (module === 'gestion' && !droitGestion ? new Response(null, { status: 403 }) : null),
}));
const LIGNES = { disponible: true, etatDesLieux: true, planification: true, lignes: [{ cle: 'A' }] };
const preavisEnCours = vi.fn(async () => LIGNES);
const avecPrevisites = vi.fn(async (r: unknown) => ({ ...(r as object), previsite: true }));
const encartDuBail = vi.fn(async (id: number) => (id === 11 ? { lotId: 7 } : null));
vi.mock('../../../../../lib/location/preavisRepo', () => ({ preavisEnCours: () => preavisEnCours() }));
vi.mock('../../../../../lib/location/previsiteRepo', () => ({ avecPrevisites: (r: unknown) => avecPrevisites(r) }));
vi.mock('../../../../../lib/location/sortieLocatairesRepo', () => ({ encartDuBail: (id: number) => encartDuBail(id) }));

import * as route from './route';

const get = (q: string) => route.GET(new Request(`http://localhost/api/admin/gestion/preavis?${q}`));
beforeEach(() => { droitGestion = true; preavisEnCours.mockClear(); avecPrevisites.mockClear(); encartDuBail.mockClear(); });

describe('la lecture des préavis côté Gestion', () => {
  it('compte Gestion : la même donnée que la Location (preavisEnCours + avecPrevisites)', async () => {
    const r = await get('preavisEnCours=1');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ etat: 'ok', data: { ...LIGNES, previsite: true } });
    expect(preavisEnCours).toHaveBeenCalledTimes(1);
    expect(avecPrevisites).toHaveBeenCalledWith(LIGNES);
  });
  it('l’encart du logement de la ligne dépliée', async () => {
    expect(await (await get('encartBail=11')).json()).toEqual({ etat: 'ok', data: { lotId: 7 } });
    expect(await (await get('encartBail=12')).json()).toEqual({ etat: 'inconnu' });
  });
  it('sans le droit « Gestion » : refusé, rien n’est lu', async () => {
    droitGestion = false;
    expect((await get('preavisEnCours=1')).status).toBe(403);
    expect(preavisEnCours).not.toHaveBeenCalled();
  });
  it('🔴 AUCUNE ÉCRITURE atteignable : la route n’exporte que GET', () => {
    expect(Object.keys(route).filter((k) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(k))).toEqual([]);
  });
});
