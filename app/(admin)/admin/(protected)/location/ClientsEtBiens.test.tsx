// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ClientsEtBiens } from './ClientsEtBiens';

/**
 * 🔴 Arno (21/10/2026, 403) — TUILE LOCATION, « CLIENTS ET BIENS » :
 *   · recherche (nom, téléphone, e-mail, adresse) et filtre « Tous / En gestion / Location seule / Ancienne gestion », passés à la
 *     route ; un propriétaire, ses biens, la fiche de chacun ;
 *   · une pastille par bien : VERT en gestion, BLEU location seule, GRIS ancienne gestion.
 * Le vrai composant, route simulée : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let appels: string[];
let hote: HTMLDivElement;
let racine: Root;
const PAGE = { total: 1, page: 0, parPage: 25, clients: [{ id: 49, nom: 'CHALAH Ramdane', telephone: '06 12 34 56 78', email: 'r.chalah@exemple.test', biens: [
  { id: 1, adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS', categorie: 'logement', statut: 'en_gestion', annexes: 1 },
  { id: 2, adresse: '3 rue Voisine', commune: 'ASNIÈRES', categorie: 'parking', statut: 'location_seule', annexes: 0 },
  { id: 3, adresse: '9 rue Ancienne', commune: 'PARIS', categorie: null, statut: 'ancienne_gestion', annexes: 0 },
] }] };
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    appels.push(decodeURIComponent(String(url)));
    return new Response(JSON.stringify({ etat: 'ok', data: PAGE }), { headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); };

describe('🔴 « Clients et biens »', () => {
  it('le propriétaire, ses biens, leurs pastilles (vert / bleu / gris), les liens vers les fiches de la Location', async () => {
    await act(async () => { racine.render(createElement(ClientsEtBiens)); });
    await calmer();
    expect(appels.at(-1)).toContain('clients=1&q=&statut=tous&page=0');
    const client = hote.querySelector('[data-client="49"]')!;
    expect(client.querySelector('.cb-nom')?.getAttribute('href')).toBe('/admin/location/proprietaire/49');
    expect(client.querySelector('.cb-coord')?.textContent).toBe('06 12 34 56 78 · r.chalah@exemple.test');
    const biens = [...client.querySelectorAll('[data-bien-client]')];
    expect(biens.map((b) => b.querySelector('a')?.getAttribute('href'))).toEqual(['/admin/location/bien/1', '/admin/location/bien/2', '/admin/location/bien/3']);
    expect(biens.map((b) => [b.querySelector('[data-statut-bien]')?.textContent, b.querySelector('[data-statut-bien]')?.className.split(' ')[1]])).toEqual([
      ['En gestion', 'sdb-pastille--vert'], ['Location seule', 'sdb-pastille--bleu'], ['Ancienne gestion', 'sdb-pastille--gris']]);
    expect(biens[0].textContent).toContain('+ 1 annexe');
  });

  it('les filtres et la recherche partent à la route ; le filtre choisi est marqué', async () => {
    await act(async () => { racine.render(createElement(ClientsEtBiens)); });
    await calmer();
    expect([...hote.querySelectorAll('[data-filtre-statut]')].map((b) => b.textContent)).toEqual(['Tous', 'En gestion', 'Location seule', 'Ancienne gestion']);
    await act(async () => { (hote.querySelector('[data-filtre-statut="location_seule"]') as HTMLElement).click(); });
    await calmer();
    expect(appels.at(-1)).toContain('statut=location_seule');
    expect(hote.querySelector('[data-filtre-statut="location_seule"]')?.getAttribute('aria-pressed')).toBe('true');
    const champ = hote.querySelector('[data-recherche-clients]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'barbusse'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await calmer();
    expect(appels.at(-1)).toContain('clients=1&q=barbusse&statut=location_seule&page=0');
  });
});
