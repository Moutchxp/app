// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InfoDestinataires } from './ConfirmationEnvois';

/** 🔴 Arno (05/11/2026) — le picto « i » pour les 3 types d'action : liste remplie / vide, lue à CHAQUE ouverture. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let liste: { adresse: string; libelle: string }[];
let urls: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  liste = [{ adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' }]; urls = [];
  global.fetch = vi.fn(async (u: string | URL | Request) => { urls.push(String(u)); return ok({ destinataires: liste, copies: [{ adresse: 'moi@exemple.test', libelle: 'Vous (Moi)' }] }); }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };

describe('InfoDestinataires', () => {
  for (const action of ['nouvelle_location', 'preavis', 'sortie'] as const) {
    it(`${action} : au clic, la liste de CE type d’action (« Destinataires » / « En copie ») ; re-clic : fermé`, async () => {
      await act(async () => { root.render(createElement(InfoDestinataires, { action })); });
      const i = container.querySelector('[data-picto-i]') as HTMLButtonElement;
      await act(async () => { i.click(); }); await calmer();
      expect(urls).toEqual([`/api/admin/location?destinatairesMails=${action}`]);
      expect([...container.querySelectorAll('.cev-bulle-titre')].map((t) => t.textContent)).toEqual(['Destinataires', 'En copie']);
      expect(container.querySelector('[data-destinataire]')?.textContent).toBe('ADHOC — gestion.criterimmo@gmail.com');
      expect(container.querySelector('[data-copie]')?.textContent).toBe('Vous (Moi) — moi@exemple.test');
      await act(async () => { i.click(); });
      expect(container.querySelector('[data-bulle-destinataires]')).toBeNull();
    });
  }
  it('au SURVOL aussi ; la liste est relue à chaque ouverture (jamais figée)', async () => {
    await act(async () => { root.render(createElement(InfoDestinataires, { action: 'preavis' })); });
    const zone = container.querySelector('[data-info-destinataires]')!;
    await act(async () => { zone.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); await calmer();
    expect(container.querySelector('[data-bulle-destinataires]')).not.toBeNull();
    await act(async () => { zone.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    expect(container.querySelector('[data-bulle-destinataires]')).toBeNull();
    liste = [];
    await act(async () => { zone.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); await calmer();
    expect(urls).toHaveLength(2);
    expect(container.querySelector('[data-aucun-destinataire]')).not.toBeNull();
  });
  it('liste VIDE : « Aucun destinataire configuré » + lien vers Paramètres Location > Destinataires mails', async () => {
    liste = [];
    await act(async () => { root.render(createElement(InfoDestinataires, { action: 'nouvelle_location' })); });
    await act(async () => { (container.querySelector('[data-picto-i]') as HTMLButtonElement).click(); }); await calmer();
    expect(container.querySelector('[data-aucun-destinataire]')?.textContent).toContain('Aucun destinataire configuré');
    expect(container.querySelector('[data-lien-destinataires]')?.getAttribute('href')).toBe('/admin/location/outils/parametres?onglet=destinataires');
  });
});
