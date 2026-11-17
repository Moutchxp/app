// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { choisirAdresseBan } from './choisirAdresseEssai';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses uniformisées », lot 3) — « les adresses des biens (« Nouveau bien », « Modifier le bien », annexes à une autre adresse)
 * passent sur ChampAdresseBan réutilisé tel quel ; plus de Code postal / Commune tapés à la main ; adresse absente de la liste = saisie libre autorisée
 * avec confirmation, marquée « hors liste — à vérifier » ; rue sans numéro = même fenêtre de confirmation ; aucune adresse existante réécrite. Le choix de
 * l'adresse doit continuer d'alimenter la copropriété, les digicodes connus, les PV d'AG et le syndic, exactement comme aujourd'hui. »
 * « Nouveau bien », avec les vrais composants ; routes et Base Adresse Nationale simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let lectures: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; lectures = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok({ logementId: 9 }); }
    lectures.push(String(url));
    if (String(url).includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const bouton = (mot: string, dans: ParentNode = document) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.trim() === mot) as HTMLButtonElement;
const champAdresse = () => container.querySelector('[data-adresse-bien="bien"] .cab-enveloppe input') as HTMLInputElement;
const soumettre = async () => {
  await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer();
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
const rendre = async () => { await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); }); await calmer(); };
/** Un parking nu complet sauf l'adresse, en gestion. */
const parkingSansAdresse = async () => {
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await clic([...container.querySelectorAll('[data-question-gestion="bien"] button')].find((b) => b.textContent?.replace('✓ ', '') === 'En gestion')!);
};
const logement = () => posts.at(-1)?.logement as Record<string, unknown> | undefined;

describe('🔴 « Nouveau bien » : l’adresse se CHOISIT dans la liste', () => {
  it('code postal et commune : plus tapés, remplis par le choix ; « liste » envoyée avec l’adresse ; la copropriété et le syndic lisent l’adresse choisie', async () => {
    await rendre();
    await parkingSansAdresse();
    const cp = q('[data-adresse-bien="bien"] [data-adresse-cp]') as HTMLInputElement;
    expect(cp.readOnly).toBe(true);
    expect((q('[data-adresse-bien="bien"] [data-adresse-commune]') as HTMLInputElement).readOnly).toBe(true);
    await choisirAdresseBan(champAdresse(), '3 Rue du Port', '92400', 'Courbevoie');
    expect(cp.value).toBe('92400');
    expect((q('[data-adresse-bien="bien"] [data-adresse-commune]') as HTMLInputElement).value).toBe('COURBEVOIE');
    // les lectures nourries par l'adresse (ici : l'AG connue de la copropriété) partent avec l'adresse CHOISIE — comme avant
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(lectures).toContain(`/api/admin/location?agPourAdresse=${encodeURIComponent('3 Rue du Port')}`);
    await soumettre();
    expect(logement()).toMatchObject({ adresse: '3 Rue du Port', codePostal: '92400', commune: 'COURBEVOIE',
      adresseSaisie: { nature: 'liste', pays: null, horsListeConfirme: false, sansNumeroConfirme: false } });
  });

  it('tapée sans être choisie : « Choisissez l’adresse dans la liste proposée » ; rien n’est envoyé', async () => {
    await rendre();
    await parkingSansAdresse();
    await saisir(champAdresse(), '3 rue du Port');
    expect(q('[data-adresse-a-choisir]')?.textContent).toContain('Adresse absente de la liste ?');
    await soumettre();
    expect(posts).toHaveLength(0);
    expect(q('.mis-boite')?.textContent).toContain('Choisissez l’adresse dans la liste proposée');
  });

  it('« Adresse absente de la liste ? » : la confirmation ; « Revenir à la liste » ne change rien ; confirmée : saisie libre marquée, « hors liste » envoyée', async () => {
    await rendre();
    await parkingSansAdresse();
    await saisir(champAdresse(), '2 impasse Neuve');
    await clic(q('[data-adresse-hors-liste]')!);
    expect(q('[data-fenetre-carte]')?.textContent).toContain('marquée « hors liste — à vérifier »');
    await clic(bouton('Revenir à la liste'));
    expect(q('[data-fenetre-carte]')).toBeNull();
    expect(q('[data-adresse-libre]')).toBeNull();
    await clic(q('[data-adresse-hors-liste]')!);
    await clic(bouton('Confirmer : adresse hors liste'));
    expect(q('[data-adresse-bien="bien"] [data-adresse-marque]')?.textContent).toBe('hors liste — à vérifier');
    expect((q('[data-adresse-libre]') as HTMLInputElement).value).toBe('2 impasse Neuve');
    // code postal et commune : tapés ici seulement, et exigés
    await soumettre();
    expect(posts).toHaveLength(0);
    expect(q('.mis-boite')?.textContent).toContain('code postal à 5 chiffres');
    await clic([...document.querySelectorAll('.mis-boite button')].at(-1)!);
    await saisir(q('[data-adresse-bien="bien"] [data-adresse-cp]') as HTMLInputElement, '92400');
    await saisir(q('[data-adresse-bien="bien"] [data-adresse-commune]') as HTMLInputElement, 'courbevoie');
    await soumettre();
    expect(logement()).toMatchObject({ adresse: '2 impasse Neuve', codePostal: '92400', commune: 'COURBEVOIE',
      adresseSaisie: { nature: 'hors_liste', horsListeConfirme: true } });
  });

  it('une rue sans numéro : la fenêtre « Adresse sans numéro » ; « Corriger » n’envoie rien ; « Confirmer » envoie, confirmation jointe', async () => {
    await rendre();
    await parkingSansAdresse();
    await choisirAdresseBan(champAdresse(), 'Rue du Port', '92400', 'Courbevoie');
    await soumettre();
    expect(posts).toHaveLength(0);
    expect(q('[data-fenetre-carte]')?.textContent).toContain('Cette adresse n’a pas de numéro : Rue du Port, 92400 COURBEVOIE.');
    await clic(bouton('Corriger'));
    expect(posts).toHaveLength(0);
    await soumettre();
    await clic(bouton('Confirmer'));
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(posts).toHaveLength(1);
    expect(logement()?.adresseSaisie).toMatchObject({ nature: 'liste', sansNumeroConfirme: true });
  });

  it('une annexe « Autre adresse » : le même champ, code postal et commune remplis par le choix ; « liste » envoyée avec elle', async () => {
    await rendre();
    await clic(container.querySelector('[data-famille="logement"]')!);
    await clic(bouton('+ Cave', container));
    await clic(bouton('Autre adresse', container));
    const bloc = q('[data-adresse-bien="annexe-0"]')!;
    expect((bloc.querySelector('[data-adresse-cp]') as HTMLInputElement).readOnly).toBe(true);
    await choisirAdresseBan(bloc.querySelector('.cab-enveloppe input') as HTMLInputElement, '9 Impasse Lointaine', '92400', 'Courbevoie');
    expect((bloc.querySelector('[data-adresse-commune]') as HTMLInputElement).value).toBe('COURBEVOIE');
    // l'adresse du bien, tapée sans être choisie, arrête l'envoi avant l'annexe
    expect(q('[data-adresse-bien="bien"] [data-adresse-cp]')).not.toBeNull();
  });
});

describe('🔴 la fiche du bien › Caractéristiques › Modifier (un bien créé dans l’application) : le même champ', () => {
  const monter = async (cree = true) => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
      if (String(url).includes('lot=11')) {
        return ok({
          fiche: { id: 11, numero: '11', adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
          bien: { id: 11, numero: '11', adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', nature: null, typeBien: null, categorie: 'cave', nomAnnexe: null, etage: '-1',
            porte: '4', numLotCopro: '52', surfaceCarrezM2: null, surfaceExterieureM2: null, parentId: null, proprietaire: 'EXEMPLE Claire', locataireEnPlace: null, creeDansLApplication: cree },
          parent: null, rattachables: [], locations: [], location372: true, annexes: [],
        });
      }
      return ok(null);
    }) as unknown as typeof fetch;
    const { SectionLocationBien } = await import('../gestion/SectionsLocationFiche');
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 11, ouvrir: () => {} })); });
    await calmer();
    const bloc = [...container.querySelectorAll('section.loc-bloc')].find((x) => x.querySelector('h3')?.textContent === 'Caractéristiques') as HTMLElement;
    await clic(bouton('Modifier', bloc));
    return bloc;
  };

  it('non touchée : envoyée telle quelle, sans « adresseSaisie » ; choisie : code postal et commune remplis, « liste » envoyée', async () => {
    const bloc = await monter();
    expect((bloc.querySelector('[data-adresse-bien="caracteristiques"] [data-adresse-cp]') as HTMLInputElement).readOnly).toBe(true);
    await clic(bouton('Enregistrer', bloc));
    expect(posts.at(-1)).toMatchObject({ action: 'modifier-bien', id: 11, champs: { adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS' } });
    expect((posts.at(-1)?.champs as Record<string, unknown>)).not.toHaveProperty('adresseSaisie');
    await clic(bouton('Modifier', bloc));
    await choisirAdresseBan(bloc.querySelector('[data-adresse-bien="caracteristiques"] .cab-enveloppe input') as HTMLInputElement, '12 Rue de l’Essai', '75011', 'Paris');
    await clic(bouton('Enregistrer', bloc));
    expect(posts.at(-1)?.champs).toMatchObject({ adresse: '12 Rue de l’Essai', codePostal: '75011', commune: 'PARIS', adresseSaisie: { nature: 'liste' } });
  });

  it('tapée sans être choisie : refusée, rien n’est envoyé', async () => {
    const bloc = await monter();
    await saisir(bloc.querySelector('[data-adresse-bien="caracteristiques"] .cab-enveloppe input') as HTMLInputElement, '12 rue de l’Essai');
    await clic(bouton('Enregistrer', bloc));
    expect(posts).toHaveLength(0);
    expect(bloc.querySelector('.cp-refus')?.textContent).toContain('Choisissez l’adresse dans la liste proposée');
  });

  it('un bien importé de WIPPIMMO : pas d’adresse à modifier ici, comme avant', async () => {
    const bloc = await monter(false);
    expect(bloc.querySelector('[data-adresse-bien]')).toBeNull();
    expect(bloc.textContent).toContain('L’adresse de ce bien est tenue par WIPPIMMO');
  });
});
