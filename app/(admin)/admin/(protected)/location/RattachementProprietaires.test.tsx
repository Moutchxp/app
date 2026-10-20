// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';

/**
 * 🔴 « Ajouter un nouveau bien » — BLOC 1 : rattacher les personnes UNE À UNE (Arno, 18/10/2026). Les VRAIS composants,
 * routes simulées : rien ne part, rien n'est écrit (seul l'envoi final est relu, simulé).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** « Bien en gestion ? » (Arno, 20/10/2026) : obligatoire ; ces épreuves portent sur autre chose, on y répond Oui d'emblée. */
const repondreEnGestion = async () => {
  const oui = document.querySelector('[data-question-gestion="bien"] button');
  if (oui !== null) await act(async () => { oui.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const LEA = { id: 3, nom: 'MARTIN Léa', telephone: '+33611111111', email: 'lea@exemple.test', biens: ['3 rue du Port, PARIS'] };
const PAUL = { id: 4, nom: 'MARTIN Paul', telephone: '+33622222222', email: null, biens: ['3 rue du Port, PARIS'] };
const NOTAIRE = { id: 70, lotId: 12, email: 'notaire@exemple.test', nom: 'M. NOTAIRE Luc', qualite: 'notaire', telephone: '0140000001', biens: ['3 rue du Port, PARIS'] };
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let lectures: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; lectures = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok({ logementId: 9 }); }
    lectures.push(u);
    if (u.includes('proprietairesRecherche=')) return ok([{ id: 3, titre: 'MARTIN Léa', detail: '3 rue du Port, PARIS' }, { id: 4, titre: 'MARTIN Paul', detail: null }]);
    if (u.includes('personnesLiees=3')) return ok({ choisie: 3, proprietaires: [LEA, PAUL], contacts: [NOTAIRE] });
    if (u.includes('personnesLiees=4')) return ok({ choisie: 4, proprietaires: [PAUL, LEA], contacts: [NOTAIRE] });
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (t: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const chercherEtChoisir = async (nom: string) => {
  const input = container.querySelector('.loc-recherche input') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'martin'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
  await calmer();
  const r = [...container.querySelectorAll('[data-resultats-proprietaires] button')].find((b) => b.textContent?.includes(nom)) as HTMLButtonElement | undefined;
  if (r === undefined) return false;
  await act(async () => { r.click(); });
  await calmer();
  return true;
};
const cocher = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLInputElement).click(); }); };
const nomsCartes = (sel: string) => [...container.querySelectorAll(`${sel} .cp-nom`)].map((x) => x.textContent);

describe('🔴 bloc 1 « Propriétaire(s) » : qui rattacher à ce bien ?', () => {
  it('un couple : le panneau s’ouvre sous la recherche (pas de modale), 2 groupes, SEULE la personne cherchée cochée → une seule rattachée', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await repondreEnGestion();
    await chercherEtChoisir('MARTIN Léa');
    const panneau = container.querySelector('[data-qui-rattacher]') as HTMLElement;
    expect(panneau.closest('.loc-section')?.querySelector('h3')?.textContent).toContain('Propriétaire(s)');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(panneau.querySelector('h4')?.textContent).toBe('Qui rattacher à ce bien ?');
    expect([...panneau.querySelectorAll('.loc-qui-groupe-titre')].map((x) => x.textContent)).toEqual(['Propriétaire Personnes propriétaires (2)', 'Contact du propriétaire Contacts du propriétaire (1)']);
    expect(panneau.querySelector('[data-groupe="proprietaires"] .cp-role--proprietaire')).not.toBeNull();
    expect(panneau.querySelector('[data-groupe="contacts"] .cp-role--contact')).not.toBeNull();
    expect(panneau.textContent).toContain('Possède déjà : 3 rue du Port, PARIS');
    expect((panneau.querySelector('[data-coche-proprietaire="3"]') as HTMLInputElement).checked).toBe(true);
    expect((panneau.querySelector('[data-coche-proprietaire="4"]') as HTMLInputElement).checked).toBe(false);
    expect((panneau.querySelector('[data-coche-contact="70"]') as HTMLInputElement).checked).toBe(false);
    await act(async () => { bouton('Rattacher la sélection')!.click(); });
    expect(container.querySelector('[data-qui-rattacher]')).toBeNull();
    expect(nomsCartes('[data-proprietaires]')).toEqual(['MARTIN Léa']);
    expect(container.querySelector('[data-contacts-proprietaire]')).toBeNull();
  });

  it('les deux personnes + le contact existant ; envoyés à l’enregistrement (personnes cochées seules propriétaires, contact rattaché)', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await repondreEnGestion();
    await chercherEtChoisir('MARTIN Léa');
    await cocher('[data-coche-proprietaire="4"]');
    await cocher('[data-coche-contact="70"]');
    await act(async () => { bouton('Rattacher la sélection')!.click(); });
    expect(nomsCartes('[data-proprietaires]')).toEqual(['MARTIN Léa', 'MARTIN Paul']);
    expect(nomsCartes('[data-contacts-proprietaire]')).toEqual(['M. NOTAIRE Luc']);
    // Remplir le minimum puis enregistrer : l'envoi porte les 2 propriétaires et la carte de contact existante.
    await act(async () => { (container.querySelector('[data-famille="logement"]') as HTMLButtonElement).click(); });
    await act(async () => { [...container.querySelectorAll('[aria-label="Type de logement"] button')][0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const adr = container.querySelector('.cab-enveloppe input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(adr, '3 rue du Port'); adr.dispatchEvent(new Event('input', { bubbles: true })); });
    // Arno (18/10/2026) : DPE et « Entretien à prévoir » obligatoires pour un logement (classe D, date, Non).
    await act(async () => { [...container.querySelectorAll('[aria-label="Classe DPE"] button')].find((b) => b.textContent === 'D')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const dpeDate = container.querySelector('[data-dpe-date] input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(dpeDate, '2024-03-01'); dpeDate.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (container.querySelector('[data-entretien-reponse="non"]') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'creer-bien', proprietaireIds: [3, 4], contactsExistants: [70] });
  });

  it('cartes en LECTURE SEULE (aucun champ, aucun crayon) avec « Modifier dans la fiche ↗ » ; la croix retire du bien seulement, sans écrire', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await repondreEnGestion();
    await chercherEtChoisir('MARTIN Léa');
    await cocher('[data-coche-contact="70"]');
    await act(async () => { bouton('Rattacher la sélection')!.click(); });
    const bloc = container.querySelector('[data-cartes-bloc]') as HTMLElement;
    expect(bloc.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(bloc.querySelector('[aria-label="Modifier"]')).toBeNull();
    expect([...bloc.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Modifier dans la fiche ↗', '/admin/location/proprietaire/3'], ['Modifier dans la fiche ↗', '/admin/location/bien/12'],
    ]);
    const avant = lectures.length;
    await act(async () => { (bloc.querySelector('[aria-label="Retirer M. NOTAIRE Luc de ce bien"]') as HTMLButtonElement).click(); });
    expect(nomsCartes('[data-contacts-proprietaire]')).toEqual([]);
    expect(nomsCartes('[data-proprietaires]')).toEqual(['MARTIN Léa']);
    // Aucune requête : la fiche de la Gestion n'est jamais touchée par la croix.
    expect(posts).toEqual([]);
    expect(lectures.length).toBe(avant);
  });

  it('jamais de doublon : une 2e recherche montre les déjà rattachés cochés et grisés, et n’ajoute que le nouveau', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await repondreEnGestion();
    await chercherEtChoisir('MARTIN Léa');
    await cocher('[data-coche-contact="70"]');
    await act(async () => { bouton('Rattacher la sélection')!.click(); });
    // Léa n'est plus proposée par la recherche ; Paul, oui.
    expect(await chercherEtChoisir('MARTIN Léa')).toBe(false);
    await chercherEtChoisir('MARTIN Paul');
    const lea = container.querySelector('[data-coche-proprietaire="3"]') as HTMLInputElement;
    expect([lea.checked, lea.disabled]).toEqual([true, true]);
    const notaire = container.querySelector('[data-coche-contact="70"]') as HTMLInputElement;
    expect([notaire.checked, notaire.disabled]).toEqual([true, true]);
    await cocher('[data-coche-contact="70"]');
    await act(async () => { bouton('Rattacher la sélection')!.click(); });
    expect(nomsCartes('[data-proprietaires]')).toEqual(['MARTIN Léa', 'MARTIN Paul']);
    expect(nomsCartes('[data-contacts-proprietaire]')).toEqual(['M. NOTAIRE Luc']);
  });

  it('au moins une personne propriétaire cochée pour valider ; « Annuler » ferme sans rien rattacher', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await repondreEnGestion();
    await chercherEtChoisir('MARTIN Léa');
    await cocher('[data-coche-proprietaire="3"]');
    await cocher('[data-coche-contact="70"]');
    await act(async () => { bouton('Rattacher la sélection')!.click(); });
    expect(container.querySelector('[data-qui-rattacher] [role="alert"]')?.textContent).toBe('Cochez au moins une personne propriétaire.');
    expect(container.querySelector('[data-cartes-bloc] .cp-carte')).toBeNull();
    await act(async () => { bouton('Annuler')!.click(); });
    expect(container.querySelector('[data-qui-rattacher]')).toBeNull();
    expect(container.querySelector('[data-cartes-bloc] .cp-carte')).toBeNull();
  });
});
