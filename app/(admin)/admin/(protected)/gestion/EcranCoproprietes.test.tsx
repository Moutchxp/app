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

/** 🔴🔴 Arno (19/11/2026) — les copropriétés en double : cocher, « Regrouper… » (récapitulatif, confirmation), les propositions, « Ignorer », « Dégrouper ». */
describe('regrouper des fiches en une copropriété', () => {
  const P = { immeuble: '54 avenue Puvis de Chavannes', cle: '54 avenue puvis de chavannes', nom: '54 avenue Puvis de Chavannes', adresses: ['54 avenue Puvis de Chavannes, 92400 Courbevoie'],
    syndic: null, nbBiens: 39, hors: false, declaree: false };
  const A = { ...P, immeuble: '54 Avneue Puvis de Chavannes', cle: '54 avneue puvis de chavannes', nom: '54 Avneue Puvis de Chavannes', nbBiens: 1 };
  const H = { ...P, immeuble: '54 avenue Puvis de Chavannes (HARY)', cle: '54 avenue puvis de chavannes hary', nom: '54 avenue Puvis de Chavannes (HARY)', nbBiens: 4 };
  const fiche = (l: typeof P) => ({ cle: l.cle, immeuble: l.immeuble, nbBiens: l.nbBiens, declaree: l.declaree });
  let posts: Record<string, unknown>[]; let regroupements: unknown[]; let disponible: boolean;
  beforeEach(() => {
    posts = []; regroupements = []; disponible = true;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      const s = String(u); urls.push(s);
      if (s.startsWith('/api/admin/gestion/coproprietes/liste')) return json({ etat: 'ok', data: { lignes: [P, A, H], total: 3 } });
      if (s.startsWith('/api/admin/gestion/coproprietes/regroupement')) {
        if (init?.method === 'POST') {
          const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c);
          return json({ etat: 'ok', data: { message: c.action === 'regrouper' ? 'Regroupé : « 54 Avneue Puvis de Chavannes » devient une adresse de la copropriété.' : 'Dégroupé.' } });
        }
        return json({ etat: 'ok', data: { disponible, regroupements, propositions: [{ cles: [P.cle, A.cle, H.cle].sort(), principale: P.cle, signature: 'sig', fiches: [P, A, H].map(fiche) }] } });
      }
      return json({ etat: 'sans_schema' });
    }) as unknown as typeof fetch;
  });
  const monter = async () => { await act(async () => { root.render(createElement(EcranCoproprietes, {})); }); await attendre(); };
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await attendre(20); };

  it('le bandeau : « Ces 3 fiches semblent être la même copropriété — Regrouper ? », les fiches et leurs biens ; « Ignorer » est envoyé', async () => {
    await monter();
    const b = container.querySelector('[data-ecp-proposition]')!;
    expect(b.textContent).toContain('Ces 3 fiches semblent être la même copropriété — Regrouper ?');
    expect(b.textContent).toContain('« 54 avenue Puvis de Chavannes » (39 biens) · « 54 Avneue Puvis de Chavannes » (1 bien)');
    await cliquer('[data-ecp-ignorer]');
    expect(posts).toEqual([{ action: 'ignorer', cles: [P.cle, A.cle, H.cle].sort() }]);
    expect(container.querySelector('[data-ecp-message]')!.textContent).toMatch(/^Proposition ignorée/);
  });
  it('cocher deux fiches → « Regrouper… » : choix de l’adresse principale, récapitulatif, puis confirmation visible ; rien n’est envoyé avant « Confirmer »', async () => {
    await monter();
    // les lignes et leur bouton d'ouverture restent ; une case par ligne (cible 44 px)
    expect(container.querySelectorAll('[data-ecp-ligne]')).toHaveLength(3);
    expect((container.querySelector('[data-ecp-regrouper]'))).toBeNull();
    await cliquer(`[data-ecp-coche="${A.cle}"]`);
    expect((container.querySelector('[data-ecp-regrouper]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer(`[data-ecp-coche="${P.cle}"]`);
    await cliquer('[data-ecp-regrouper]');
    const m = container.querySelector('[data-ecp-modale="regrouper"]')!;
    expect(m.getAttribute('role')).toBe('dialog');
    // la principale d'office : celle qui a le plus de biens
    expect((m.querySelector(`[data-ecp-principale="${P.cle}"]`) as HTMLInputElement).checked).toBe(true);
    expect(m.querySelector('[data-ecp-recap]')!.textContent).toContain('Devient son adresse secondaire : « 54 Avneue Puvis de Chavannes ».');
    expect(m.querySelector('[data-ecp-recap]')!.textContent).toContain('1 bien rejoint cette copropriété');
    expect(posts).toEqual([]);
    await cliquer(`[data-ecp-principale="${A.cle}"]`);
    expect(container.querySelector('[data-ecp-recap]')!.textContent).toContain('« 54 Avneue Puvis de Chavannes » reste l’adresse principale.');
    await cliquer(`[data-ecp-principale="${P.cle}"]`);
    await cliquer('[data-ecp-confirmer]');
    expect(posts).toEqual([{ action: 'regrouper', principale: P.cle, cles: [A.cle, P.cle] }]);
    expect(container.querySelector('[data-ecp-modale]')).toBeNull();
    expect(container.querySelector('[data-ecp-message]')!.getAttribute('role')).toBe('status');
    expect(container.querySelector('[data-ecp-message]')!.textContent).toMatch(/^Regroupé :/);
    expect(container.querySelector('[data-ecp-selection]')).toBeNull();
  });
  it('« Annuler » ferme sans rien envoyer ; sans la migration 504 : la confirmation est impossible, et dite', async () => {
    disponible = false;
    await monter();
    await cliquer('[data-ecp-proposition-regrouper]');
    expect(container.querySelector('[data-ecp-refus]')!.textContent).toMatch(/migration 504/);
    expect((container.querySelector('[data-ecp-confirmer]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { [...container.querySelectorAll('[data-ecp-modale] button')].find((x) => x.textContent === 'Annuler')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[data-ecp-modale]')).toBeNull();
    expect(posts).toEqual([]);
  });
  it('« Dégrouper… » sous la copropriété regroupée : récapitulatif, puis confirmation', async () => {
    regroupements = [{ id: 5, cle: P.cle, principale: P.immeuble, regroupees: [A.immeuble, H.immeuble], le: '2026-11-19T15:00:00.000Z', par: 'a.jorel@sansvisavis.com' }];
    await monter();
    expect(container.querySelector('[data-ecp-regroupement="5"]')!.textContent).toContain('Regroupe « 54 Avneue Puvis de Chavannes », « 54 avenue Puvis de Chavannes (HARY) » (le 19/11/2026, par a.jorel@sansvisavis.com)');
    await cliquer('[data-ecp-degrouper="5"]');
    expect(container.querySelector('[data-ecp-modale="degrouper"]')!.textContent).toContain('ne seront plus des adresses de la copropriété « 54 avenue Puvis de Chavannes »');
    await cliquer('[data-ecp-confirmer]');
    expect(posts).toEqual([{ action: 'degrouper', id: 5 }]);
    expect(container.querySelector('[data-ecp-message]')!.textContent).toBe('Dégroupé.');
  });
});
