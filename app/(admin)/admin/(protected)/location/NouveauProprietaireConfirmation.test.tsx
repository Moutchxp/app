// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationProprietaires } from './CreationProprietaires';

/**
 * 🔴 Arno (21/10/2026) — « Nouveau propriétaire » : « Enregistrer le propriétaire (sans bien) » confirme par une modale :
 *   · succès « ✓ Propriétaire enregistré » : nom, téléphone, e-mail ; « Voir la fiche », « Ajouter un bien à ce propriétaire »,
 *     « Créer un autre propriétaire », « Fermer » ;
 *   · échec : modale rouge (quoi, pourquoi, quoi faire ; saisie conservée) ;
 *   · « Enregistrement… » pendant l'envoi, un double clic n'envoie qu'UNE fois ; le parcours d'avant (le bien en dessous) reste.
 * Les vrais composants, route simulée : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let posts: Record<string, unknown>[];
let reponse: () => Promise<Response>;
let container: HTMLDivElement;
let root: Root;
const ok = (data: unknown) => new Response(JSON.stringify({ etat: 'ok', data }), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  const adm = document.createElement('div'); adm.className = 'svv-adm-root'; document.body.appendChild(adm);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; reponse = async () => ok({ ids: [41] });
  global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return reponse(); }
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const bouton = (texte: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(texte)) as HTMLButtonElement;
const set = (el: HTMLInputElement, v: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const modale = () => document.querySelector('[data-modale-issue]');

const preparer = async () => {
  await act(async () => { root.render(createElement(CreationProprietaires)); });
  const form = container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement;
  await act(async () => {
    set([...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')!.querySelector('input') as HTMLInputElement, 'Dupont');
    const v = form.querySelectorAll('.cp-saisie--valeur');
    set(v[0] as HTMLInputElement, '06 12 34 56 78');
    set(v[1] as HTMLInputElement, 'paul.dupont@exemple.test');
  });
  await act(async () => { (form.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer();
  await act(async () => { bouton('Oui').click(); });
  await act(async () => { set(container.querySelector('[data-mandat] input') as HTMLInputElement, 'MG 2026-041'); });
  await calmer();
};

describe('🔴 « Nouveau propriétaire » — « ✓ Propriétaire enregistré »', () => {
  it('SUCCÈS : la modale verte, le nom et les coordonnées principales, les quatre gestes ; une seule création', async () => {
    await preparer();
    const b = container.querySelector('[data-enregistrer-proprietaire]') as HTMLButtonElement;
    expect(b.textContent).toBe('Enregistrer le propriétaire (sans bien)');
    await act(async () => { b.click(); });
    await calmer();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'creer-proprietaires', enGestion: true, numeroMandat: 'MG 2026-041' });
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
    expect(modale()?.querySelector('h2')?.textContent).toBe('✓ Propriétaire enregistré');
    expect([...modale()!.querySelectorAll('[data-resume] div')].map((d) => d.textContent)).toEqual(['PropriétaireDUPONT', 'Téléphone06 12 34 56 78', 'E-mailpaul.dupont@exemple.test']);
    expect(modale()!.querySelector('[data-voir-fiche-proprietaire]')?.getAttribute('href')).toBe('/admin/location/proprietaire/41');
    expect(modale()!.querySelector('[data-ajouter-bien-proprietaire]')?.getAttribute('href')).toBe('/admin/location/nouveau-bien?proprietaires=41');
    expect(modale()!.querySelector('[data-creer-autre-proprietaire]')?.getAttribute('href')).toBe('/admin/location/nouveau-proprietaire');
    expect([...modale()!.querySelectorAll('.mis-action')].map((x) => x.textContent)).toEqual(['Fermer', 'Voir la fiche', 'Créer un autre propriétaire', 'Ajouter un bien à ce propriétaire']);
    await act(async () => { (modale()!.querySelector('[data-fermer-issue]') as HTMLElement).click(); });
    expect(modale()).toBeNull();
    // Déjà créé : plus de second « Enregistrer le propriétaire » ; le parcours du bien reste, sans recréer les fiches.
    expect(container.querySelector('[data-enregistrer-proprietaire]')).toBeNull();
    expect(container.querySelector('[data-continuer]')).not.toBeNull();
  });

  it('pendant l’envoi : « Enregistrement… », inactif ; un DOUBLE CLIC n’envoie qu’une fois', async () => {
    let liberer: () => void = () => {};
    reponse = () => new Promise((r) => { liberer = () => r(ok({ ids: [41] })); });
    await preparer();
    const b = container.querySelector('[data-enregistrer-proprietaire]') as HTMLButtonElement;
    await act(async () => { b.click(); b.click(); });
    expect(b.textContent).toBe('Enregistrement…');
    expect(b.disabled).toBe(true);
    await act(async () => { liberer(); });
    await calmer();
    expect(posts).toHaveLength(1);
  });

  it('ÉCHEC : la modale rouge — quoi, pourquoi, quoi faire ; la saisie reste', async () => {
    reponse = async () => new Response(JSON.stringify({ etat: 'refus', motif: 'Ce numéro de téléphone est déjà celui d’une autre fiche.' }), { headers: { 'Content-Type': 'application/json' } });
    await preparer();
    await act(async () => { (container.querySelector('[data-enregistrer-proprietaire]') as HTMLButtonElement).click(); });
    await calmer();
    expect(modale()?.getAttribute('data-modale-issue')).toBe('erreur');
    expect(modale()?.querySelector('[data-echec-quoi]')?.textContent).toBe('Le propriétaire n’a pas été enregistré.');
    expect(modale()?.querySelector('[data-echec-pourquoi]')?.textContent).toBe('Ce numéro de téléphone est déjà celui d’une autre fiche.');
    expect(modale()?.querySelector('[data-echec-faire]')?.textContent).toBe('Corrigez ce point, puis cliquez à nouveau sur « Enregistrer le propriétaire ».');
    expect(container.querySelectorAll('[data-recap="client"]')).toHaveLength(1);
    expect(container.querySelector('[data-enregistrer-proprietaire]')).not.toBeNull();
  });
});
