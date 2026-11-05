// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ComptesPage, { LIBELLE_CREER_COLLABORATEUR, messageCompteCree } from './page';

/**
 * 🔴 Arno (05/11/2026) — LE FORMULAIRE « CRÉER UN COMPTE » REPLIÉ PAR DÉFAUT sur une seule ligne « Créer un nouveau Collaborateur ».
 * Un repli d'AFFICHAGE seul : mêmes champs, mêmes règles, mêmes permissions. Routes simulées : aucun compte n'est créé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let reponseCreation: { status: number; corps: Record<string, unknown> };
let posts: Record<string, unknown>[];
beforeEach(() => {
  posts = [];
  reponseCreation = { status: 201, corps: { motDePasseTemporaire: 'Tmp-essai-0000' } };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return { ok: reponseCreation.status < 300, status: reponseCreation.status, json: async () => reponseCreation.corps };
    }
    return { ok: true, status: 200, json: async () => ({ comptes: [], societeDisponible: true, statutDisponible: true, commissionneDisponible: true }) };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const ligne = () => container.querySelector('[data-replier-creation]') as HTMLButtonElement;
const formulaire = () => container.querySelector('form.cpt-form');
const saisir = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const champ = (ph: string) => container.querySelector(`input[placeholder="${ph}"]`) as HTMLInputElement;
const rendre = async () => { await act(async () => { root.render(createElement(ComptesPage)); }); await calmer(); };
const basculer = async () => { await act(async () => { ligne().click(); }); };
const remplir = async () => {
  act(() => { saisir(champ('Prénom'), 'Essai'); saisir(champ('Nom'), 'REPLI'); saisir(champ('adresse e-mail'), 'essai.repli@exemple.test'); });
  await act(async () => { (container.querySelector('[data-societe-creation] button, [role="radiogroup"][aria-labelledby="societe-creation"] button') as HTMLButtonElement | null)?.click(); });
};
const creer = async () => {
  await act(async () => { formulaire()!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await calmer();
};

describe('🔴 « Créer un nouveau Collaborateur » : replié par défaut', () => {
  it('à l’ouverture : la seule ligne, chevron fermé, aucun champ, aucun message rouge', async () => {
    await rendre();
    expect(ligne().textContent).toBe(`${LIBELLE_CREER_COLLABORATEUR}▸`);
    expect(ligne().getAttribute('aria-expanded')).toBe('false');
    expect(formulaire()).toBeNull();
    const bloc = container.querySelector('[data-creation-compte]')!;
    expect(bloc.querySelector('.cpt-err')).toBeNull();
    expect(bloc.querySelector('[data-societe-creation-manque], [data-statut-creation-manque]')).toBeNull();
    expect(bloc.textContent).not.toMatch(/obligatoire|à renseigner/i);
  });

  it('un clic déplie le formulaire IDENTIQUE (champs, rôle, Société, Statut, Permissions, bouton) ; un autre le replie', async () => {
    await rendre();
    await basculer();
    expect(ligne().getAttribute('aria-expanded')).toBe('true');
    expect(ligne().textContent).toBe(`${LIBELLE_CREER_COLLABORATEUR}▾`);
    expect([champ('Prénom'), champ('Nom'), champ('adresse e-mail')].every((x) => x !== null)).toBe(true);
    expect(formulaire()!.querySelector('select.cpt-champ')).not.toBeNull();
    expect([...formulaire()!.querySelectorAll('.cpt-perms-titre')].map((x) => x.textContent)).toEqual(['Société', 'Statut', 'Permissions ']);
    expect(formulaire()!.querySelectorAll('.cpt-perms .cpt-tuile').length).toBeGreaterThan(0);
    expect(formulaire()!.querySelector('button[type="submit"]')?.textContent).toBe('Créer le compte');
    // Une fois déplié, les messages « obligatoire » apparaissent (règles inchangées).
    expect(formulaire()!.querySelector('[data-societe-creation-manque]')).not.toBeNull();
    await basculer();
    expect(formulaire()).toBeNull();
  });

  it('replier en cours de saisie GARDE la saisie', async () => {
    await rendre();
    await basculer();
    act(() => { saisir(champ('Prénom'), 'Essai'); saisir(champ('Nom'), 'REPLI'); });
    await basculer();
    await basculer();
    expect([champ('Prénom').value, champ('Nom').value]).toEqual(['Essai', 'REPLI']);
  });
});

describe('🔴 après la création', () => {
  it('réussie : le formulaire se VIDE, se REPLIE, et « Compte de Essai REPLI créé » s’affiche', async () => {
    await rendre();
    await basculer();
    await remplir();
    await creer();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ prenom: 'Essai', nom: 'REPLI', identifiant: 'essai.repli@exemple.test' });
    expect(formulaire()).toBeNull();
    expect(ligne().getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-compte-cree]')?.textContent).toBe('Compte de Essai REPLI créé');
    await basculer();
    expect([champ('Prénom').value, champ('Nom').value, champ('adresse e-mail').value]).toEqual(['', '', '']);
  });

  it('en erreur : il RESTE déplié, la saisie conservée, l’erreur dite', async () => {
    reponseCreation = { status: 409, corps: { erreur: 'Identifiant déjà utilisé.' } };
    await rendre();
    await basculer();
    await remplir();
    await creer();
    expect(formulaire()).not.toBeNull();
    expect([champ('Prénom').value, champ('Nom').value, champ('adresse e-mail').value]).toEqual(['Essai', 'REPLI', 'essai.repli@exemple.test']);
    expect(container.querySelector('[data-compte-cree]')).toBeNull();
    expect([...container.querySelectorAll('p[role="alert"].cpt-err')].map((x) => x.textContent)).toContain('Identifiant déjà utilisé.');
  });

  it('le message : « Compte de Prénom Nom créé », l’adresse à défaut de nom', () => {
    expect(messageCompteCree(' Jean ', 'DUPONT', 'j@x.fr')).toBe('Compte de Jean DUPONT créé');
    expect(messageCompteCree('', '', 'j@x.fr')).toBe('Compte de j@x.fr créé');
  });
});
