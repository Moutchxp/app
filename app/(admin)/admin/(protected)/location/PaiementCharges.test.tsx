// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { CSS_DPE_PNO } from './BlocDpe';
import { SectionLocationBien } from '../gestion/SectionsLocationFiche';

/**
 * 🔴 Arno (21/10/2026, migration 400) — « Nouveau bien », bloc 6 : l'encadré « PAIEMENT DES CHARGES » (Propriétaire / Agence), même
 * style que DPE / Assurance PNO, avec la mention « Qui règle les charges de copropriété au syndic ». FACULTATIF : ne bloque pas
 * « Enregistrer le bien », absent de « Reste à renseigner » ; pour les TROIS familles (logement, local, parking). Envoyé avec le
 * bien quand il est choisi, jamais sinon. Les VRAIS composants, routes simulées ; la géométrie est mesurée dans Chrome (banc).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok({ logementId: 9 }); }
    if (String(url).includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const encadre = () => container.querySelector('[data-charges-copro]') as HTMLElement | null;
const choix = (mot: string) => [...(encadre()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === mot) as HTMLButtonElement;
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const soumettre = async () => {
  await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer();
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
const rendre = async () => { await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); }); await calmer(); };
/** Un parking nu complet (tout l'obligatoire), en gestion. */
const parkingComplet = async () => {
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
  await clic([...container.querySelectorAll('[data-question-gestion="bien"] button')].find((b) => b.textContent?.replace('✓ ', '') === 'Oui')!);
};

describe('🔴 « Paiement des charges » — l’encadré de « Nouveau bien »', () => {
  it('dans le bloc « Caractéristiques complémentaires », pour les TROIS familles : titre, Propriétaire / Agence, mention discrète', async () => {
    await rendre();
    for (const f of ['logement', 'local', 'parking']) {
      await clic(container.querySelector(`[data-famille="${f}"]`)!);
      const e = encadre();
      expect(e, f).not.toBeNull();
      expect(e?.closest('section')?.querySelector('h3')?.textContent).toMatch(/Caractéristiques complémentaires$/);
      expect(e?.querySelector('h4')?.textContent).toBe('Paiement des charges');
      expect([...(e?.querySelectorAll('[aria-label="Paiement des charges"] button') ?? [])].map((b) => [b.textContent, b.getAttribute('aria-pressed')]))
        .toEqual([['Propriétaire', 'false'], ['Agence', 'false']]);
      expect(e?.querySelector('.loc-charges-mention')?.textContent).toBe('Qui règle les charges de copropriété au syndic');
    }
  });

  it('un parking nu : le bloc 6 n’a que « Paiement des charges » (ni DPE, ni PNO, ni entretien) ; Commentaires passe en 7', async () => {
    await rendre();
    await clic(container.querySelector('[data-famille="parking"]')!);
    const b6 = encadre()?.closest('section') as HTMLElement;
    expect(b6.querySelector('[data-ligne-dpe-pno], [data-entretien-bloc]')).toBeNull();
    expect(b6.querySelector('h3')?.textContent).toBe('5Caractéristiques complémentaires');
    expect([...container.querySelectorAll('form > .loc-section h3')].map((h) => h.textContent)).toContain('6Commentaires');
  });

  it('FACULTATIF : jamais dans « Reste à renseigner » ; le bien s’enregistre sans lui, et rien n’est envoyé pour lui', async () => {
    await rendre();
    await parkingComplet();
    expect(barre()).not.toMatch(/charges/i);
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(posts[0].action).toBe('creer-bien');
    expect(Object.prototype.hasOwnProperty.call(posts[0].logement, 'chargesCopro')).toBe(false);
  });

  it('« Agence » choisie : envoyée avec le bien ; un second clic la désélectionne (rien n’est alors envoyé)', async () => {
    await rendre();
    await parkingComplet();
    await clic(choix('Agence'));
    expect(choix('Agence').getAttribute('aria-pressed')).toBe('true');
    await soumettre();
    expect(posts.at(-1)?.logement).toMatchObject({ chargesCopro: 'agence' });
  });

  it('« Propriétaire » choisi : envoyé ; même style que les encadrés DPE / PNO ; pastilles qui passent à la ligne (jamais hors de l’encadré)', async () => {
    await rendre();
    await clic(container.querySelector('[data-famille="logement"]')!);
    await clic(choix('Propriétaire'));
    expect(choix('Propriétaire').getAttribute('aria-pressed')).toBe('true');
    expect(choix('Agence').getAttribute('aria-pressed')).toBe('false');
    expect(CSS_DPE_PNO).toContain('border:2px solid var(--color-svv-line);border-radius:20px;padding:18px 20px;background:var(--color-svv-field)}');
    expect(CSS_DPE_PNO).toContain('.loc-charges-bloc{display:flex;flex-direction:column;gap:10px;min-width:0;max-width:100%;box-sizing:border-box;');
  });
});

describe('🔴 « Paiement des charges » — la fiche du bien (modifiable) (l’encart du bien : ResumeBien.test.tsx)', () => {
  const ficheBien = (chargesCopro: unknown) => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
      if (String(url).includes('lot=10')) {
        return ok({
          fiche: { id: 10, numero: '10', adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
          bien: { id: 10, numero: '10', adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', nature: null, typeBien: null, categorie: 'logement', etage: null,
            porte: null, numLotCopro: null, surfaceCarrezM2: null, surfaceExterieureM2: null, parentId: null, proprietaire: 'EXEMPLE Claire', locataireEnPlace: null, creeDansLApplication: true },
          parent: null, rattachables: [], locations: [], location372: true, annexes: [],
          complements: { batiment: null, escalier: null, typeLogement: 'studio', nombrePieces: null, meuble: null, surfaceHabitableM2: null, syndicId: null, syndicNom: 'CABINET ESSAI',
            epoqueConstruction: null, chauffage: null, dpeClasse: 'D', dpeDate: '2024-01-01', commentaire: null, typeLocal: null, parkingSituation: null, parkingType: null,
            surfaceM2: null, ascenseur: null, digicode: null, digicodeCode: null, precisionAcces: null, agApplicable: false,
            ...(chargesCopro === undefined ? {} : { chargesCopro }) },
        });
      }
      return ok(null);
    }) as unknown as typeof fetch;
  };
  const ligne = (comp: Element, mot: string) => [...comp.querySelectorAll('dt')].find((d) => d.textContent === mot)?.nextElementSibling?.textContent ?? null;

  it('fiche : « Charges de copropriété : payées par le propriétaire » sous le syndic ; « Modifier » → « Agence » envoyé et relu', async () => {
    ficheBien('proprietaire');
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    const comp = container.querySelector('[data-complements]') as HTMLElement;
    const mots = [...comp.querySelectorAll('dt')].map((d) => d.textContent);
    expect(mots.indexOf('Charges de copropriété')).toBe(mots.indexOf('Syndic') + 1);
    expect(ligne(comp, 'Charges de copropriété')).toBe('payées par le propriétaire');
    await act(async () => { ([...comp.querySelectorAll('button')].find((b) => b.textContent === 'Modifier') as HTMLButtonElement).click(); });
    const select = [...comp.querySelectorAll('label')].find((l) => l.firstChild?.textContent === 'Paiement des charges')?.querySelector('select') as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([['', '— non renseigné —'], ['proprietaire', 'Propriétaire'], ['agence', 'Agence']]);
    expect(select.value).toBe('proprietaire');
    await act(async () => { select.value = 'agence'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { ([...comp.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'complements-bien', id: 10, champs: { chargesCopro: 'agence' } });
  });

  it('fiche : non renseigné → « non renseigné » ; sans la migration 400 : ni ligne, ni choix, rien d’envoyé', async () => {
    ficheBien(null);
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    expect(ligne(container.querySelector('[data-complements]')!, 'Charges de copropriété')).toBe('non renseigné');
    act(() => { root.unmount(); }); root = createRoot(container);
    ficheBien(undefined);
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    const comp = container.querySelector('[data-complements]') as HTMLElement;
    expect(ligne(comp, 'Charges de copropriété')).toBeNull();
    await act(async () => { ([...comp.querySelectorAll('button')].find((b) => b.textContent === 'Modifier') as HTMLButtonElement).click(); });
    expect([...comp.querySelectorAll('label')].some((l) => l.firstChild?.textContent === 'Paiement des charges')).toBe(false);
    await act(async () => { ([...comp.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer') as HTMLButtonElement).click(); });
    await calmer();
    expect(Object.prototype.hasOwnProperty.call((posts.at(-1) as { champs: object }).champs, 'chargesCopro')).toBe(false);
  });

});
