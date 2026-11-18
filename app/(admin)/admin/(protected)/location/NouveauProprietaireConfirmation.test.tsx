// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationProprietaires } from './CreationProprietaires';

/**
 * 🔴🔴 Arno (18/11/2026) — « ajouter en dessous du "non" dans le bouton une légende "(Sauvegarde du propriétaire)". lorsque l'on clic sur non, cela
 * enregistre le profil du propriétaire et ouvre une modale de validation pour dire que le nouveau propriétaire est bien enregistré. » ; « Tests vitest :
 * légende présente ; « Non » avec propriétaire incomplet = aucune écriture ; « Non » valide = un seul propriétaire, zéro bien, modale affichée ; double
 * clic = un seul propriétaire. »
 * (D'avant, Arno 21/10/2026 — « Nouveau propriétaire » : « Enregistrer le propriétaire (sans bien) » confirme par une modale :
 *   · succès « ✓ Propriétaire enregistré » : nom, téléphone, e-mail ; « Voir la fiche », « Ajouter un bien à ce propriétaire »,
 *     « Créer un autre propriétaire », « Fermer » ;
 *   · échec : modale rouge (quoi, pourquoi, quoi faire ; saisie conservée) ;
 *   · « Enregistrement… » pendant l'envoi, un double clic n'envoie qu'UNE fois ; le parcours d'avant (le bien en dessous) reste.
 * ) Les vrais composants, route simulée : rien n'est écrit.
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

const carte = async () => {
  await act(async () => { root.render(createElement(CreationProprietaires)); });
  const form = container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement;
  await act(async () => {
    set([...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')!.querySelector('input') as HTMLInputElement, 'Dupont');
    set([...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Prénom')!.querySelector('input') as HTMLInputElement, 'Paul');
    const v = form.querySelectorAll('.cp-saisie--valeur');
    set(v[0] as HTMLInputElement, '06 12 34 56 78');
    set(v[1] as HTMLInputElement, 'paul.dupont@exemple.test');
  });
  await act(async () => { (form.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer();
};
const non = () => container.querySelector('[data-question-gestion="creer-bien"] button[aria-pressed]:last-of-type') as HTMLButtonElement;
const creations = () => posts.filter((p) => p.action === 'creer-proprietaires' || p.action === 'creer-proprietaires-et-bien' || p.action === 'creer-bien');

describe('🔴 « Non » (Sauvegarde du propriétaire)', () => {
  it('la légende, plus petite, SOUS le mot « Non », dans le bouton ; le « Oui » ne change pas', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const [oui, n] = [...container.querySelectorAll('[data-question-gestion="creer-bien"] button')];
    expect(oui.textContent).toBe('Oui');
    expect(oui.querySelector('[data-legende-non]')).toBeNull();
    expect(n.querySelector('[data-legende-non]')?.textContent).toBe('(Sauvegarde du propriétaire)');
    expect(n.querySelector('[data-legende-non]')?.tagName).toBe('SMALL');
    expect(n.firstChild?.textContent).toBe('Non');
  });
  it('propriétaire INCOMPLET (aucune carte client enregistrée) : rien n’est envoyé, les manques en rouge, PAS de modale', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await act(async () => { non().click(); });
    await calmer();
    expect(posts).toEqual([]);
    expect(modale()).toBeNull();
    expect(container.querySelector('.cp-refus')?.textContent).toContain('Remplissez et enregistrez au moins une carte');
  });
  it('« Non » valide : UN propriétaire enregistré, AUCUN bien, la modale « Propriétaire enregistré », sa phrase et « Ouvrir la fiche du propriétaire »', async () => {
    await carte();
    await act(async () => { non().click(); });
    await calmer();
    expect(creations().map((p) => p.action)).toEqual(['creer-proprietaires']);
    expect(posts[0]).not.toHaveProperty('enGestion');
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
    expect(modale()?.querySelector('h2')?.textContent).toBe('✓ Propriétaire enregistré');
    expect(modale()?.textContent).toContain('Le nouveau propriétaire Paul DUPONT est bien enregistré.');
    const fiche = modale()!.querySelector('[data-voir-fiche-proprietaire]') as HTMLAnchorElement;
    expect([fiche.textContent, fiche.getAttribute('href')]).toEqual(['Ouvrir la fiche du propriétaire', '/admin/location/proprietaire/41']);
    expect(fiche.className).toContain('svv-btn-primary');
    // les gestes qui y étaient déjà restent, en second
    expect([...modale()!.querySelectorAll('.mis-action')].map((x) => x.textContent)).toEqual(['Ouvrir la fiche du propriétaire', 'Ajouter un bien à ce propriétaire', 'Créer un autre propriétaire', 'Fermer']);
    expect([...modale()!.querySelectorAll('[data-resume] div')].map((d) => d.textContent)).toEqual(['Téléphone06 12 34 56 78', 'E-mailpaul.dupont@exemple.test']);
  });
  it('🔴 DOUBLE CLIC : un seul propriétaire (le « Non » inactif pendant l’envoi) ; une fois enregistré, un second « Non » ne renvoie plus la création', async () => {
    let liberer: () => void = () => {};
    reponse = () => new Promise((r) => { liberer = () => r(ok({ ids: [41] })); });
    await carte();
    await act(async () => { non().click(); non().click(); });
    expect(non().disabled).toBe(true);
    await act(async () => { liberer(); });
    await calmer();
    expect(creations()).toHaveLength(1);
    await act(async () => { (modale()!.querySelector('[data-fermer-issue]') as HTMLElement).click(); });
    await act(async () => { non().click(); });
    await calmer();
    expect(creations()).toHaveLength(1);
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
  });
  it('🔴 enregistré par « Non », puis « Oui » : le bien se rattache à CETTE fiche — elle n’est jamais recréée', async () => {
    await carte();
    await act(async () => { non().click(); });
    await calmer();
    await act(async () => { (modale()!.querySelector('[data-fermer-issue]') as HTMLElement).click(); });
    await act(async () => { bouton('Oui').click(); });
    await calmer();
    expect(container.querySelector('[data-formulaire-bien]')).not.toBeNull();
    expect(creations()).toHaveLength(1);
  });
  it('un refus du SERVEUR (pas un manque) : sa modale rouge, comme avant — quoi, pourquoi, quoi faire ; la saisie reste', async () => {
    reponse = async () => new Response(JSON.stringify({ etat: 'refus', motif: 'Ce numéro de téléphone est déjà celui d’une autre fiche.' }), { headers: { 'Content-Type': 'application/json' } });
    await carte();
    await act(async () => { non().click(); });
    await calmer();
    expect(modale()?.getAttribute('data-modale-issue')).toBe('erreur');
    expect(modale()?.querySelector('[data-echec-quoi]')?.textContent).toBe('Le propriétaire n’a pas été enregistré.');
    expect(modale()?.querySelector('[data-echec-pourquoi]')?.textContent).toBe('Ce numéro de téléphone est déjà celui d’une autre fiche.');
    expect(container.querySelectorAll('[data-recap="client"]')).toHaveLength(1);
    expect(container.querySelector('[data-enregistrer-proprietaire]')).not.toBeNull();
  });
});
