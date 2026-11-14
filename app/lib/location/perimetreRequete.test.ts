import { describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (14/11/2026, 473) — une requête d'écriture s'exécute DANS le périmètre du test qu'elle touche ; un mélange est refusé (403). */
const vus: unknown[] = [];
let reponse: { ok: true; perimetre: { testId: number; createurEmail: string } | null } | { ok: false; motif: string } = { ok: true, perimetre: null };
vi.mock('./preavisTestRepo', () => ({ perimetreDuGeste: async (o: unknown) => { vus.push(o); return reponse; } }));
const { dansLePerimetreDuTest } = await import('./perimetreRequete');
const { perimetreCourant } = await import('./perimetreTest');

const req = (corps: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(corps) });

describe('dansLePerimetreDuTest', () => {
  it('lit occupations, biens et tâche du corps ; le traitement voit le périmètre du test ; le corps reste lisible par la route', async () => {
    reponse = { ok: true, perimetre: { testId: 3, createurEmail: 'a@x.fr' } };
    const r = req({ action: 'programmer-previsite', occupationIds: [5000], lotId: '900' });
    let vu: unknown = null; let corps: unknown = null;
    const res = await dansLePerimetreDuTest(r, async () => { vu = perimetreCourant(); corps = await r.json(); return new Response('ok'); }, { tacheId: 12 });
    expect(await res.text()).toBe('ok');
    expect(vu).toEqual({ testId: 3, createurEmail: 'a@x.fr' });
    expect((corps as { action: string }).action).toBe('programmer-previsite');
    expect(vus.at(-1)).toEqual({ occupationIds: [5000], lotIds: [900], tacheIds: [12] });
  });
  it('un test mêlé à de vrais biens : 403, la route n’est PAS exécutée', async () => {
    reponse = { ok: false, motif: 'Un préavis de test ne se mêle jamais à de vrais locataires : refusé.' };
    let appelee = false;
    const res = await dansLePerimetreDuTest(req({ occupationIds: [5000, 11] }), async () => { appelee = true; return new Response('ok'); });
    expect(res.status).toBe(403);
    expect(appelee).toBe(false);
  });
  it('aucun test : la route telle quelle, hors périmètre', async () => {
    reponse = { ok: true, perimetre: null };
    let vu: unknown = 'x';
    await dansLePerimetreDuTest(req({ occupationIds: [11] }), async () => { vu = perimetreCourant(); return new Response('ok'); });
    expect(vu).toBeNull();
  });
});
