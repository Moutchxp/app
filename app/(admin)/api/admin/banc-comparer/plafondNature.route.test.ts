// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴 Arno (22/10/2026) — banc d'essai : le plafond des faisceaux nature (distance_max_m) borné portée (200) ≤ v ≤ 500, comme la
 * configuration réelle. La route refuse 150 et 600 et accepte 300 ; l'éditeur renomme le champ, ajoute l'aide et le message.
 */
const appels: unknown[] = [];
vi.mock('../../../../lib/admin/garde', () => ({ aLaPermission: vi.fn(async () => true) }));
vi.mock('../../../../lib/db/bancEssai', () => ({ comparerProfils: vi.fn(async (...a: unknown[]) => { appels.push(a); return { ok: true, statut: 'OK' }; }) }));
const { POST } = await import('./route');
const { PROFIL_DEGAGEMENT_DEFAUT } = await import('../../../../lib/svv/profilDegagement');
const { default: EditeurProfilTest } = await import('../../../admin/(protected)/banc-test/EditeurProfilTest');

const corps = (plafond: number) => ({ point: { lat: 48.9, lon: 2.26 }, azimutPrincipalDeg: 229, etage: 4, profilTest: { ...PROFIL_DEGAGEMENT_DEFAUT, distanceMaxM: plafond } });
const poster = (b: unknown) => POST(new Request('http://x/api/admin/banc-comparer', { method: 'POST', body: JSON.stringify(b) }));

beforeEach(() => { appels.length = 0; });

describe('🔴 route du banc : mêmes bornes que la configuration réelle', () => {
  it('300 accepté (le banc lance la comparaison)', async () => {
    const r = await poster(corps(300));
    expect(r.status).toBe(200);
    expect(appels).toHaveLength(1);
  });
  it('150 et 600 refusés (400, message clair), sans rien lancer', async () => {
    for (const v of [150, 600]) {
      const r = await poster(corps(v));
      expect(r.status).toBe(400);
      expect((await r.json()).message).toMatch(/plafond des faisceaux nature doit être compris entre 200 m .*et 500 m/);
    }
    expect(appels).toHaveLength(0);
  });
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let c: HTMLDivElement; let root: Root;
describe('🔴 éditeur du banc : libellé, aide et message sous le champ', () => {
  beforeEach(() => { c = document.createElement('div'); document.body.appendChild(c); root = createRoot(c); });
  afterEach(() => { act(() => root.unmount()); c.remove(); });
  const monter = async (plafond: number) => {
    await act(async () => { root.render(createElement(EditeurProfilTest, { profilActif: PROFIL_DEGAGEMENT_DEFAUT, profilTest: { ...PROFIL_DEGAGEMENT_DEFAUT, distanceMaxM: plafond }, onChange: () => {}, onReset: () => {} })); });
    c.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = true; });
  };
  it('le champ s’appelle « Plafond des faisceaux nature » et porte l’aide ; 300 sans message', async () => {
    await monter(300);
    expect(c.textContent).toContain('Plafond des faisceaux nature');
    expect(c.textContent).not.toContain('Plafond de distance perçue par faisceau');
    expect(c.querySelector('[data-aide-champ="distance_max_m"]')!.textContent).toBe('Dès qu’un faisceau survole un espace vert, il peut compter jusqu’à cette valeur au lieu de 200 m ; le capital de la note reste 61 × 200 m.');
    expect(c.querySelector('[data-erreur-champ="distance_max_m"]')).toBeNull();
  });
  it('une saisie hors bornes n’est PAS ramenée dans les bornes : 150 arrive tel quel au profil de test', async () => {
    const recus: number[] = [];
    await act(async () => { root.render(createElement(EditeurProfilTest, { profilActif: PROFIL_DEGAGEMENT_DEFAUT, profilTest: PROFIL_DEGAGEMENT_DEFAUT, onChange: (p: { distanceMaxM: number }) => { recus.push(p.distanceMaxM); }, onReset: () => {} })); });
    const aide = c.querySelector('[data-aide-champ="distance_max_m"]')!;
    const champ = aide.parentElement!.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, '150');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(recus).toEqual([150]);
  });
  it('150 et 600 : message sous le champ', async () => {
    for (const v of [150, 600]) {
      await monter(v);
      expect(c.querySelector('[data-erreur-champ="distance_max_m"]')!.textContent).toMatch(/entre 200 m .*et 500 m/);
    }
  });
});
