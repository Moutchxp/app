// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { SectionLocationBien } from '../gestion/SectionsLocationFiche';

/**
 * 🔴 Arno (21/10/2026, migration 401) — « Nouveau bien », bloc « Le bien » : le champ « ID FISCAL DU BIEN » (avis de taxe foncière),
 * pour le bien principal des TROIS familles, JAMAIS sur une carte d'annexe. FACULTATIF (ne bloque pas « Enregistrer le bien »,
 * absent de « Reste à renseigner ») ; espaces retirés à l'enregistrement ; avertissement discret, non bloquant, s'il ne compte
 * pas 12 chiffres ; mention « Sur l'avis de taxe foncière ». Modifiable depuis la fiche du bien (jamais d'une annexe).
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
const bloc = () => container.querySelector('[data-id-fiscal]') as HTMLElement | null;
const champId = () => bloc()?.querySelector('input') as HTMLInputElement;
const avert = () => bloc()?.querySelector('[data-id-fiscal-avert]')?.textContent ?? null;
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

describe('🔴 « ID fiscal du bien » — l’écran « Nouveau bien »', () => {
  it('dans le bloc « Le bien », pour les TROIS familles : libellé, mention « Sur l’avis de taxe foncière », aucun avertissement à vide', async () => {
    await rendre();
    expect(bloc()).toBeNull(); // rien tant qu'aucune famille n'est choisie (comme tout le bloc)
    for (const f of ['logement', 'local', 'parking']) {
      await clic(container.querySelector(`[data-famille="${f}"]`)!);
      expect(bloc(), f).not.toBeNull();
      expect(bloc()?.closest('[data-bloc-bien]'), f).not.toBeNull();
      expect(bloc()?.querySelector('h4')?.textContent).toBe('ID fiscal du bien');
      expect(bloc()?.querySelector('#loc-id-fiscal-aide')?.textContent).toBe('Sur l’avis de taxe foncière');
      expect(champId().placeholder).toMatch(/^ex\. /);
      expect(avert()).toBeNull();
    }
  });

  it('JAMAIS sur une carte d’annexe (cave, parking annexe, autre)', async () => {
    await rendre();
    await clic(container.querySelector('[data-famille="logement"]')!);
    for (const mot of ['+ Cave', '+ Parking', '+ Autre']) await clic([...container.querySelectorAll('button')].find((b) => b.textContent === mot)!);
    const annexes = [...container.querySelectorAll('.loc-annexes > li:not(.loc-racine)')];
    expect(annexes.length).toBe(3);
    for (const a of annexes) {
      expect(a.querySelector('[data-id-fiscal]')).toBeNull();
      expect(a.textContent).not.toMatch(/fiscal/i);
    }
    expect(container.querySelectorAll('[data-id-fiscal]').length).toBe(1);
  });

  it('avertissement discret, NON bloquant, s’il ne compte pas 12 chiffres (les espaces ne comptent pas)', async () => {
    await rendre();
    await clic(container.querySelector('[data-famille="parking"]')!);
    for (const [saisie, attendu] of [['92 123 456 789 0', null], ['921234567890', null], ['9212345', 'Un identifiant fiscal compte habituellement 12 chiffres'],
      ['92A234567890', 'Un identifiant fiscal compte habituellement 12 chiffres'], ['   ', null]] as const) {
      await saisir(champId(), saisie);
      expect(avert(), saisie).toBe(attendu);
    }
  });

  it('FACULTATIF : jamais dans « Reste à renseigner » ; enregistré sans lui ; avec lui, envoyé avec le bien (même « inhabituel »)', async () => {
    await rendre();
    await parkingComplet();
    expect(barre()).not.toMatch(/fiscal/i);
    await soumettre();
    expect(posts).toHaveLength(1);
    expect((posts[0].logement as Record<string, unknown>).idFiscal ?? '').toBe('');
    await saisir(champId(), '9212 3456');
    expect(avert()).not.toBeNull();
    expect(barre()).not.toMatch(/fiscal/i);
    await soumettre();
    expect(posts).toHaveLength(2);
    expect(posts[1].logement).toMatchObject({ idFiscal: '9212 3456' }); // les espaces sont retirés par le serveur (bienComplet)
  });
});

describe('🔴 « ID fiscal du bien » — la fiche du bien (modifiable), jamais celle d’une annexe', () => {
  const ficheLot = (id: number, idFiscal: unknown, annexe = false) => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
      if (String(url).includes(`lot=${id}`)) {
        return ok({
          fiche: { id, numero: String(id), adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
          bien: { id, numero: String(id), adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', nature: null, typeBien: null, categorie: annexe ? 'cave' : 'logement', etage: null,
            porte: null, numLotCopro: null, surfaceCarrezM2: null, surfaceExterieureM2: null, parentId: annexe ? 10 : null, proprietaire: 'EXEMPLE Claire', locataireEnPlace: null, creeDansLApplication: true },
          parent: annexe ? { id: 10, numero: '10', adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', categorie: 'logement', parentId: null } : null,
          rattachables: [], locations: [], location372: true, annexes: [],
          complements: { batiment: null, escalier: null, typeLogement: 'studio', nombrePieces: null, meuble: null, surfaceHabitableM2: null, syndicId: null, syndicNom: null,
            epoqueConstruction: null, chauffage: null, dpeClasse: 'D', dpeDate: '2024-01-01', commentaire: null, typeLocal: null, parkingSituation: null, parkingType: null,
            surfaceM2: null, ascenseur: null, digicode: null, digicodeCode: null, precisionAcces: null, agApplicable: false,
            ...(idFiscal === undefined ? {} : { idFiscal }) },
        });
      }
      return ok(null);
    }) as unknown as typeof fetch;
  };
  const ligne = (comp: Element, mot: string) => [...comp.querySelectorAll('dt')].find((d) => d.textContent === mot)?.nextElementSibling?.textContent ?? null;
  const bouton = (comp: Element, mot: string) => [...comp.querySelectorAll('button')].find((b) => b.textContent === mot) as HTMLButtonElement;

  it('fiche : « ID fiscal » affiché ; « Modifier » → champ, avertissement, envoi ; « non renseigné » si vide', async () => {
    ficheLot(10, '921234567890');
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    const comp = container.querySelector('[data-complements]') as HTMLElement;
    expect(ligne(comp, 'ID fiscal')).toBe('921234567890');
    await act(async () => { bouton(comp, 'Modifier').click(); });
    const champ = comp.querySelector('[data-id-fiscal] input') as HTMLInputElement;
    expect(champ.value).toBe('921234567890');
    expect(comp.querySelector('[data-id-fiscal-avert]')).toBeNull();
    await saisir(champ, '92 12');
    expect(comp.querySelector('[data-id-fiscal-avert]')?.textContent).toBe('Un identifiant fiscal compte habituellement 12 chiffres');
    await act(async () => { bouton(comp, 'Enregistrer').click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'complements-bien', id: 10, champs: { idFiscal: '92 12' } });
    act(() => { root.unmount(); }); root = createRoot(container);
    ficheLot(10, null);
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    expect(ligne(container.querySelector('[data-complements]')!, 'ID fiscal')).toBe('non renseigné');
  });

  it('sans la migration 401 : ni ligne, ni champ, rien d’envoyé', async () => {
    ficheLot(10, undefined);
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    const comp = container.querySelector('[data-complements]') as HTMLElement;
    expect(ligne(comp, 'ID fiscal')).toBeNull();
    await act(async () => { bouton(comp, 'Modifier').click(); });
    expect(comp.querySelector('[data-id-fiscal]')).toBeNull();
    await act(async () => { bouton(comp, 'Enregistrer').click(); });
    await calmer();
    expect(Object.prototype.hasOwnProperty.call((posts.at(-1) as { champs: object }).champs, 'idFiscal')).toBe(false);
  });
});
