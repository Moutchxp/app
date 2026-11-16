// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranCoproprietes } from './EcranCoproprietes';
import { BarreAnnuaire } from './BarreAnnuaire';
import { aplatirResultats, GROUPES, LIBELLE_TYPE } from '../../../../lib/location/recherchePortefeuille';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 4) — l'écran « Copropriétés », et le groupe « Copropriétés » de la recherche. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (c: unknown) => ({ ok: true, status: 200, json: async () => c }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let urls: string[];
const LIGNES = [
  { immeuble: 'Résidence Les Tilleuls', cle: 'residence les tilleuls', nom: 'Les Tilleuls', adresses: ['Résidence Les Tilleuls, 75011 Paris', '12 rue des Lilas, 75011 Paris'],
    syndic: { id: 2, nom: 'Cabinet A', ville: 'Paris' }, nbBiens: 3, hors: false, declaree: true },
  { immeuble: '3 impasse Neuve', cle: '3 impasse neuve', nom: '3 impasse Neuve', adresses: ['3 impasse Neuve, 75011 Paris'], syndic: null, nbBiens: 1, hors: true, declaree: false },
];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); urls = [];
  global.fetch = vi.fn(async (u: string | URL | Request) => {
    const s = String(u); urls.push(s);
    if (s.startsWith('/api/admin/gestion/coproprietes/liste')) return json({ etat: 'ok', data: { lignes: s.includes('q=tilleuls') ? [LIGNES[0]] : LIGNES, total: 2 } });
    if (s.startsWith('/api/admin/gestion/annuaire')) return json({ etat: 'ok', data: { personnes: [], tronque: false } });
    if (s.startsWith('/api/admin/gestion/coproprietes/fiche')) return json({ etat: 'ok', data: { fiche: null, coproprieteDuBien: null } });
    return json({ etat: 'sans_schema' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
const attendre = async (ms = 260) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const saisir = async (el: HTMLInputElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };

describe('l’écran « Copropriétés »', () => {
  it('une ligne par copropriété : nom, adresses, syndic, nombre de biens, « Bien hors copropriété », « fiche à créer » ; le compte', async () => {
    await act(async () => { root.render(createElement(EcranCoproprietes, {})); }); await attendre();
    expect(container.querySelector('[data-ecp-compte]')!.textContent).toBe('2');
    const [a, b] = [...container.querySelectorAll('[data-ecp-ligne]')];
    expect(a.querySelector('[data-ecp-adresses]')!.textContent).toBe('Résidence Les Tilleuls, 75011 Paris · 12 rue des Lilas, 75011 Paris');
    expect(a.querySelector('[data-ecp-syndic]')!.textContent).toMatch(/^Syndic : Cabinet A/i);
    expect(a.querySelector('[data-ecp-biens]')!.textContent).toBe('3 biens');
    expect(b.querySelector('[data-ecp-hors]')!.textContent).toBe(' · Bien hors copropriété');
    expect(b.querySelector('[data-ecp-a-creer]')).not.toBeNull();
  });
  it('la recherche interroge la liste ; une ligne ouvre la fiche copropriété (par son immeuble)', async () => {
    await act(async () => { root.render(createElement(EcranCoproprietes, {})); }); await attendre();
    await saisir(container.querySelector('[data-ecp-recherche]') as HTMLInputElement, 'tilleuls'); await attendre();
    expect(urls.at(-1)).toBe('/api/admin/gestion/coproprietes/liste?q=tilleuls');
    expect(container.querySelectorAll('[data-ecp-ligne]')).toHaveLength(1);
    await act(async () => { (container.querySelector('[data-ecp-ligne]') as HTMLButtonElement).click(); }); await attendre(20);
    expect(urls.some((u) => u === '/api/admin/gestion/coproprietes/fiche?immeuble=R%C3%A9sidence%20Les%20Tilleuls')).toBe(true);
  });
  it('« ouvrirDepart » (le lien de la recherche de la Location) : la fiche s’ouvre dès l’arrivée', async () => {
    await act(async () => { root.render(createElement(EcranCoproprietes, { ouvrirDepart: '3 impasse Neuve' })); }); await attendre(20);
    expect(urls.some((u) => u === '/api/admin/gestion/coproprietes/fiche?immeuble=3%20impasse%20Neuve')).toBe(true);
  });
});

describe('le groupe « Copropriétés » de la recherche', () => {
  it('Gestion : après les personnes, avec sa capsule (« Copropriété » ou « Bien hors copropriété ») ; elle ouvre la fiche', async () => {
    await act(async () => { root.render(createElement(BarreAnnuaire, { onFiche: () => {} })); });
    await saisir(container.querySelector('input[type="search"]') as HTMLInputElement, 'rue'); await attendre(400);
    const lignes = [...container.querySelectorAll('[data-resultat-copropriete]')];
    expect(lignes.map((l) => l.querySelector('.gst-annuaire-role')!.textContent)).toEqual(['Copropriété', 'Bien hors copropriété']);
    await act(async () => { lignes[0].querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await attendre(20);
    expect(urls.some((u) => u.startsWith('/api/admin/gestion/coproprietes/fiche?immeuble=R%C3%A9sidence'))).toBe(true);
  });
  it('Location : le groupe existe, après les syndics, et chaque ligne garde l’immeuble qui ouvre sa fiche', () => {
    expect(GROUPES).toEqual(['proprietaires', 'locataires', 'syndics', 'coproprietes', 'biens']);
    expect(LIBELLE_TYPE.coproprietes).toBe('Copropriété');
    const l = aplatirResultats({ proprietaires: [], locataires: [], syndics: [], biens: [], tronque: false,
      coproprietes: [{ id: 1, titre: 'Les Tilleuls', telephone: null, email: null, adresse: '12 rue des Lilas', detail: null, ancien: false, cle: 'Résidence Les Tilleuls' }] });
    expect(l.map((x) => [x.groupe, x.cle])).toEqual([['coproprietes', 'Résidence Les Tilleuls']]);
  });
});
