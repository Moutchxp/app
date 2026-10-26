// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { CreationLocataire } from './CreationLocataire';
import { aujourdhuiParis } from '../../../../lib/location/reglagesDpe';

/**
 * 🔴 Arno (26/10/2026, 430) — « LE BIEN EST-IL LOUÉ AU MOMENT DE LA PRISE EN GESTION ? »
 *   · R1 : sous « Statut du bien » (En gestion), Oui / Non, OBLIGATOIRE (« Reste à renseigner ») ; sans la 430 : montrée, inactive, jamais exigée ;
 *   · R2 : Non → envoyé « rentré vide », l'écran de toujours (modale de succès) ;
 *   · R3 : Oui → la date du mandat (le champ du « Mandat de gestion », pré-rempli au jour), envoyée ; puis « Nouveau locataire » s'ouvre
 *     pour le locataire en place : bien choisi d'office, bandeau, suivi = « Mandat de gestion seul » daté du mandat, honoraires 0 figés.
 * Les VRAIS composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let avec430: boolean;
const assign = vi.fn();
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; avec430 = true; assign.mockReset();
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return ok({ logementId: 64 });
    }
    if (u.includes('rentreOccupeDisponible')) return ok(avec430);
    if (u.includes('rentreOccupe=64')) return ok({ lotId: 64, entreOccupe: true, dateMandat: '2026-10-15', titre: '25 Rue Henri Barbusse, GENNEVILLIERS' });
    // La fiche du bien et ses lots (le formulaire « Nouveau locataire » les lit dès que le bien est choisi).
    if (/[?&]lot=64\b/.test(u)) return ok({ bien: { id: 64, categorie: 'logement' }, complements: {} });
    if (u.includes('lotsBail=64')) return ok({ lots: [{ id: 64, role: 'logement', libelle: 'appartement', type: 'Studio', etage: null, numeroLot: '55', porte: 'C43', place: false, occupants: [], noms: [] }], sorte: 'seul', origineLibelle: '' });
    if (u.includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'CHALAH Ramdane', telephone: null, email: null, biens: [] }]);
    if (u.includes('/api/admin/location/suivi')) return ok({ disponible: true, apporteurs: [], negociateurs: [], collegues: [], regles: [], annuaire: false, moi: null });
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '', assign }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.querySelectorAll('.mis-voile').forEach((m) => m.remove()); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const question = () => container.querySelector('[data-rentre-occupe]') as HTMLFieldSetElement | null;
const choix = (c: 'oui' | 'non') => container.querySelector(`[data-rentre-occupe-choix="${c}"]`) as HTMLButtonElement;
const statut = (mot: 'En gestion' | 'Location seule') => [...container.querySelectorAll('[data-question-gestion="bien"] button')]
  .find((b) => b.textContent?.replace('✓ ', '') === mot) as HTMLButtonElement;
const soumettre = async () => {
  await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer();
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
/** Un parking nu complet (le plus court des biens), en gestion. */
const bienEnGestion = async () => {
  await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
  await calmer();
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '25 Rue Henri Barbusse');
  await clic(statut('En gestion'));
};

describe('R1 — la question, obligatoire pour un bien en gestion', () => {
  it('sous « Statut du bien » (En gestion) ; sans réponse : dans « Reste à renseigner », rien n’est envoyé', async () => {
    await bienEnGestion();
    expect(question()?.closest('[data-question-gestion="bien"]')).not.toBeNull();
    expect(question()?.querySelector('legend')?.textContent).toBe('Le bien est-il loué au moment de la prise en gestion ? *');
    expect([choix('oui'), choix('non')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect(barre()).toBe('Reste à renseigner (1) : Le bien est-il loué au moment de la prise en gestion ? Oui ou Non.');
    await soumettre();
    expect(posts).toEqual([]);
  });
  it('« Location seule » : aucune prise en gestion, la question disparaît et n’est pas envoyée', async () => {
    await bienEnGestion();
    await clic(statut('Location seule'));
    expect(question()).toBeNull();
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    await soumettre();
    expect(posts[0]).toMatchObject({ action: 'creer-bien', enGestion: false });
    expect(posts[0]).not.toHaveProperty('entreOccupe');
  });
  it('sans la migration 430 : montrée, inactive, avec « disponible après la mise à jour » ; jamais exigée ni envoyée', async () => {
    avec430 = false;
    await bienEnGestion();
    expect(question()?.disabled).toBe(true);
    expect(container.querySelector('[data-rentre-occupe-sans-430]')?.textContent).toMatch(/^Disponible après la mise à jour de la base \(migration 430\)/);
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    await soumettre();
    expect(posts[0]).toMatchObject({ action: 'creer-bien', enGestion: true });
    expect(posts[0]).not.toHaveProperty('entreOccupe');
  });
});

describe('R2 — Non : rentré vide, rien ne change', () => {
  it('envoyé « non », sans date ; la modale de succès de toujours, aucun enchaînement', async () => {
    await bienEnGestion();
    await clic(choix('non'));
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    await soumettre();
    expect(posts[0]).toMatchObject({ action: 'creer-bien', enGestion: true, entreOccupe: false });
    expect(posts[0]).not.toHaveProperty('dateMandat');
    expect(assign).not.toHaveBeenCalled();
    expect(document.querySelector('[data-modale-issue="succes"]')).not.toBeNull();
  });
});

describe('R3 — Oui : la date du mandat, puis le locataire en place', () => {
  it('la date du mandat pré-remplie au jour, dans le champ du « Mandat de gestion » (une seule valeur) ; envoyée ; « Nouveau locataire » s’ouvre', async () => {
    await bienEnGestion();
    await clic(choix('oui'));
    const date = container.querySelector('[data-date-mandat-occupe]') as HTMLInputElement;
    expect(date.value).toBe(aujourdhuiParis());
    expect((container.querySelector('[data-mandat-date="gestion"]') as HTMLInputElement).value).toBe(aujourdhuiParis());
    await saisir(date, '2026-10-15');
    expect((container.querySelector('[data-mandat-date="gestion"]') as HTMLInputElement).value).toBe('2026-10-15');
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    await soumettre();
    expect(posts[0]).toMatchObject({ action: 'creer-bien', enGestion: true, entreOccupe: true, dateMandat: '2026-10-15',
      mandat: { sorte: 'gestion', signeLe: '2026-10-15' } });
    expect(assign).toHaveBeenCalledWith('/admin/location/nouveau-locataire?bien=64&enPlace=1');
  });
  it('date du mandat vidée : « Reste à renseigner » la demande', async () => {
    await bienEnGestion();
    await clic(choix('oui'));
    await saisir(container.querySelector('[data-date-mandat-occupe]') as HTMLInputElement, '');
    expect(barre()).toBe('Reste à renseigner (1) : Bien loué à la prise en gestion : la date du mandat de gestion (JJ/MM/AAAA).');
  });
});

describe('R3 — « Nouveau locataire » pour le locataire en place (le MÊME formulaire, rien de retiré)', () => {
  const monter = async () => {
    await act(async () => { root.render(createElement(CreationLocataire, { bienInitial: 64, enPlace: true })); });
    await calmer(); await calmer();
  };
  it('bien choisi d’office, bandeau « locataire en place », date d’entrée libre (ex. 2014), les quatre blocs présents', async () => {
    await monter();
    expect(container.querySelector('[data-locataire-en-place]')?.textContent).toContain('Locataire en place à la prise en gestion');
    expect(container.querySelector('[data-locataire-en-place]')?.textContent).toContain('du 15/10/2026');
    expect(container.querySelector('[data-bloc-bien-loue]')?.textContent).toContain('25 Rue Henri Barbusse, GENNEVILLIERS');
    for (const b of ['[data-bloc-bien-loue]', '[data-bloc-conditions]', '[data-bloc-suivi]', '[data-date-entree]']) expect(container.querySelector(b), b).not.toBeNull();
    await saisir(container.querySelector('[data-date-entree]') as HTMLInputElement, '2014-03-01');
    expect((container.querySelector('[data-date-entree]') as HTMLInputElement).value).toBe('2014-03-01');
  });
  it('suivi commercial : « Mandat de gestion seul », daté du mandat (figé), honoraires de location 0 figés', async () => {
    await monter();
    expect(container.querySelector('[data-type-activite="gestion_seule"]')?.textContent).toContain('Mandat de gestion seul');
    const date = container.querySelector('[data-date-mandat-en-place]') as HTMLInputElement;
    expect([date.value, date.readOnly]).toEqual(['2026-10-15', true]);
    const hono = container.querySelector('[data-hono-proprietaire-ht]') as HTMLInputElement;
    expect([hono.value, hono.disabled]).toEqual(['0', true]);
    expect((container.querySelector('[data-hono-locataire-ht]') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('[data-hono-en-place]')?.textContent).toContain('aucun honoraire de location');
  });
  it('l’écran de toujours sans le mode : aucun bandeau, la nature « Bail » choisissable', async () => {
    await act(async () => { root.render(createElement(CreationLocataire, {})); });
    await calmer();
    expect(container.querySelector('[data-locataire-en-place]')).toBeNull();
    expect(container.querySelector('[data-type-activite="gestion_seule"]')).toBeNull();
  });
});
