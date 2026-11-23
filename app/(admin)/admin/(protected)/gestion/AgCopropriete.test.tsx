// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AgCopropriete } from './AgCopropriete';

/** 🔴 Arno (16/11/2026, 475) — le bloc « AG de la copropriété » (fiche du bien, fiche syndic) : dates, statut, qui, quand — LECTURE SEULE. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (c: unknown) => ({ ok: true, status: 200, json: async () => c }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let urls: string[]; let reponse: unknown;
const ENTREE = (o: Record<string, unknown>) => ({ id: 1, type: 'derniere', statut: 'officielle', date: '2026-03-12', confirmation: false, origine: 'fiche_bien',
  saisieLe: '2026-04-01T10:00:00.000Z', saisiePar: 'Claire Test', sortieId: null, aRattacher: false, ...o });
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); urls = [];
  reponse = { etat: 'ok', data: { copropriete: 'Résidence Fictive', immeuble: 'Résidence Fictive', applicable: true, entrees: [
    ENTREE({ id: 3, type: 'prochaine', statut: 'officielle', date: '2027-04-02', origine: 'sortie', sortieId: 12, saisiePar: 'Arnaud JOREL', saisieLe: '2026-11-16T10:00:00.000Z' }),
    ENTREE({ id: 2, type: 'prochaine', statut: 'projetee', date: '2027-03-12', origine: 'sortie', sortieId: 11, saisiePar: 'Arnaud JOREL', saisieLe: '2026-11-15T10:00:00.000Z' }),
    ENTREE({ id: 1 })] } };
  global.fetch = vi.fn(async (url: string | URL | Request) => { urls.push(String(url)); return json(reponse); }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

describe('AgCopropriete', () => {
  it('fiche du bien : lu par le BIEN (jamais par le syndic) ; chaque date avec son statut, qui et quand ; officielle et projetée distinctes', async () => {
    await act(async () => { root.render(createElement(AgCopropriete, { lotId: 7 })); });
    await calmer();
    expect(urls).toEqual(['/api/admin/gestion/immeubles/ag?lotId=7']);
    expect(container.querySelector('.agc-titre')?.textContent).toBe('AG de la copropriété — Résidence Fictive');
    const lignes = [...container.querySelectorAll('[data-agc-entree]')];
    expect(lignes.map((x) => x.textContent)).toEqual([
      '02/04/2027 — prochaine AGO, officielle — saisie par Arnaud JOREL le 16/11/2026 (sortie n° 12)',
      '12/03/2027 — prochaine AGO, projetée — saisie par Arnaud JOREL le 15/11/2026 (sortie n° 11)',
      '12/03/2026 — dernière AG tenue (AGO) — saisie par Claire Test le 01/04/2026 (fiche du bien)']);
    expect(lignes.map((x) => x.className)).toEqual(['agc-entree agc-entree--officielle', 'agc-entree agc-entree--projetee', 'agc-entree agc-entree--tenue']);
    const css = container.querySelector('style')!.textContent!;
    expect(css).toContain('.agc-entree--projetee{border-style:dashed;font-style:italic}');
  });
  it('fiche syndic : lu par l’IMMEUBLE de la copropriété ; un bien sans copropriété : « à rattacher » ; aucun historique : le dit ; sans la 475 : rien', async () => {
    reponse = { etat: 'ok', data: { copropriete: null, immeuble: '3 impasse Neuve', applicable: true, entrees: [] } };
    await act(async () => { root.render(createElement(AgCopropriete, { immeuble: '3 impasse Neuve' })); });
    await calmer();
    expect(urls[0]).toBe('/api/admin/gestion/immeubles/ag?immeuble=3%20impasse%20Neuve');
    expect(container.querySelector('[data-agc-a-rattacher]')?.textContent).toBe(' — à rattacher à une copropriété');
    expect(container.querySelector('[data-agc-vide]')?.textContent).toBe('Aucune AG enregistrée.');
    reponse = { etat: 'sans_schema' };
    await act(async () => { root.render(createElement(AgCopropriete, { lotId: 8 })); });
    await calmer();
    expect(container.querySelector('[data-ag-copropriete-bloc]')).toBeNull();
  });
});

/** 🔴🔴 Arno (17/11/2026, 481) : « FICHE COPROPRIÉTÉ, bloc « AG » : […] Ajoute « + Ajouter un PV d'AG » : date du PV (obligatoire), type obligatoire AGO / AGE, note facultative. […] modifier une erreur se fait par « Corriger » (avec trace), sans jamais effacer. » */
describe('🔴🔴 la fiche Copropriété : « + Ajouter un PV d’AG » et « Corriger »', () => {
  let posts: Record<string, unknown>[];
  const saisir = async (el: Element, v: string) => { await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
  const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
  const $ = (s: string) => container.querySelector(s) as HTMLElement;
  beforeEach(() => {
    posts = [];
    const lu = { etat: 'ok', data: { copropriete: 'Résidence _TEST AG', immeuble: 'Résidence _TEST AG', applicable: true, pv: true, entrees: [
      ENTREE({ id: 3, type: 'prochaine', statut: 'projetee', date: '2027-03-12', origine: 'sortie', sortieId: 11 }),
      ENTREE({ id: 2, date: '2015-03-12', origine: 'reprise', nature: 'ago' }),
      ENTREE({ id: 1, date: '2024-06-01', nature: 'age', note: 'travaux de façade', origine: 'fiche_copropriete' })] } };
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json({ etat: 'ok', data: { entrees: [ENTREE({ id: 9, date: '2026-03-12', nature: 'ago', origine: 'fiche_copropriete' })] } }); }
      return json(lu);
    }) as unknown as typeof fetch;
  });
  it('les PV du plus récent au plus ancien (type, auteur, date de saisie, note), chacun avec « Corriger » ; les autres dates restent, en dessous', async () => {
    await act(async () => { root.render(createElement(AgCopropriete, { immeuble: 'Résidence _TEST AG', edition: true })); }); await calmer();
    // 🔴 (Arno, 23/11/2026) la liste complète est repliée par défaut : « Afficher l'historique des AG (N) » la déplie
    await clic($('[data-agc-historique-lien]'));
    expect([...container.querySelectorAll('[data-agc-pv]')].map((l) => [l.querySelector('[data-agc-pv-date]')?.textContent, l.querySelector('[data-agc-pv-type]')?.textContent]))
      .toEqual([['01/06/2024', 'AGE (assemblée générale extraordinaire)'], ['12/03/2015', 'AGO (assemblée générale ordinaire)']]);
    expect($('[data-agc-pv="1"]').textContent).toContain('saisie par Claire Test le 01/04/2026 (fiche copropriété)');
    expect($('[data-agc-pv="1"] [data-agc-pv-note]').textContent).toBe('Note : travaux de façade');
    expect(container.querySelectorAll('[data-agc-corriger]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-agc-autres] [data-agc-entree]')).toHaveLength(1);
  });
  it('« + Ajouter un PV d’AG » : aucun message avant une tentative ; date et type obligatoires ; puis l’envoi (date, AGO, note) et l’historique relu', async () => {
    await act(async () => { root.render(createElement(AgCopropriete, { immeuble: 'Résidence _TEST AG', edition: true })); }); await calmer();
    await clic($('[data-agc-ajouter-pv]'));
    expect($('[data-agc-form="ajout"]')).not.toBeNull();
    expect($('[data-agc-pv-erreur]')).toBeNull();
    expect(container.querySelector('[data-agc-pv-type-choix][aria-pressed="true"]')).toBeNull();
    await clic($('[data-agc-pv-enregistrer]'));
    // 🔴 (Arno, 23/11/2026) « + Ajouter une AG » : la mention de la date officielle, bien visible
    expect($('[data-agc-mention-officielle]').textContent).toBe('Date officielle uniquement : l’assemblée a eu lieu ou sa date est fixée par convocation.');
    expect($('[data-agc-pv-erreur]').textContent).toBe('Renseignez la date de l’AG.');
    expect(posts).toEqual([]);
    await saisir($('[data-agc-pv-date-saisie]'), '2026-03-12');
    await clic($('[data-agc-pv-enregistrer]'));
    expect($('[data-agc-pv-erreur]').textContent).toContain('Choisissez le type');
    await clic($('[data-agc-pv-type-choix="ago"]'));
    await saisir($('[data-agc-pv-note-saisie]'), 'PV reçu du syndic');
    await clic($('[data-agc-pv-enregistrer]'));
    expect(posts).toEqual([{ action: 'ag', immeuble: 'Résidence _TEST AG', date: '2026-03-12', nature: 'ago', note: 'PV reçu du syndic' }]);
    expect($('[data-agc-form]')).toBeNull();
    await clic($('[data-agc-historique-lien]'));
    expect([...container.querySelectorAll('[data-agc-pv-date]')].map((x) => x.textContent)).toEqual(['12/03/2026']);
  });
  it('« Corriger » : le formulaire prérempli (date, type, note), envoyé avec la saisie corrigée ; « Annuler » ne change rien', async () => {
    await act(async () => { root.render(createElement(AgCopropriete, { immeuble: 'Résidence _TEST AG', edition: true })); }); await calmer();
    await clic($('[data-agc-historique-lien]'));
    await clic($('[data-agc-corriger="2"]'));
    expect(($('[data-agc-form="correction"] [data-agc-pv-date-saisie]') as HTMLInputElement).value).toBe('2015-03-12');
    expect($('[data-agc-pv-type-choix="ago"]').getAttribute('aria-pressed')).toBe('true');
    await clic($('[data-agc-pv-annuler]'));
    expect($('[data-agc-form]')).toBeNull();
    expect(posts).toEqual([]);
    await clic($('[data-agc-corriger="2"]'));
    await clic($('[data-agc-pv-type-choix="age"]'));
    await clic($('[data-agc-pv-enregistrer]'));
    expect(posts).toEqual([{ action: 'ag', immeuble: 'Résidence _TEST AG', date: '2015-03-12', nature: 'age', note: null, corrige: 2 }]);
  });
  // 🔴🔴 Arno (23/11/2026) — « pouvoir voir l'historique complet des anciennes dates d'AG de la copropriété si on le souhaite (option d'affichage) »
  it('par défaut : la dernière AGO et la prochaine AG connues ; « Afficher l’historique des AG (N) » déplie la liste complète, un nouveau clic la replie', async () => {
    await act(async () => { root.render(createElement(AgCopropriete, { immeuble: 'Résidence _TEST AG', edition: true })); }); await calmer();
    expect($('[data-agc-resume-derniere]').textContent).toBe('Dernière AGO : 12/03/2015 — saisie par Claire Test le 01/04/2026');
    expect($('[data-agc-resume-prochaine]').textContent).toBe('Prochaine AG : 12/03/2027 — AGO, projetée — saisie par Claire Test le 01/04/2026');
    expect($('[data-agc-ajouter-pv]').textContent).toBe('+ Ajouter une AG');
    const lien = $('[data-agc-historique-lien]');
    expect([lien.textContent, lien.getAttribute('aria-expanded')]).toEqual(['Afficher l’historique des AG (3)', 'false']);
    expect($('[data-agc-historique]')).toBeNull();
    await clic(lien);
    expect([lien.textContent, lien.getAttribute('aria-expanded')]).toEqual(['Masquer l’historique des AG', 'true']);
    expect(container.querySelectorAll('[data-agc-historique] [data-agc-pv]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-agc-historique] [data-agc-autres] [data-agc-entree]')).toHaveLength(1);
    expect($('[data-agc-pv="1"]').textContent).toContain('AGE (assemblée générale extraordinaire) — officielle');
    await clic(lien);
    expect($('[data-agc-historique]')).toBeNull();
  });
  it('une AG OFFICIELLE à venir l’emporte sur une projection comme « prochaine AG » ; elle se corrige dans l’historique', async () => {
    const lu = { etat: 'ok', data: { copropriete: 'Résidence _TEST AG', immeuble: 'Résidence _TEST AG', applicable: true, pv: true, entrees: [
      ENTREE({ id: 4, type: 'prochaine', statut: 'officielle', date: '2999-03-15', nature: 'age', origine: 'fiche_copropriete' }),
      ENTREE({ id: 3, type: 'prochaine', statut: 'projetee', date: '2999-03-12', origine: 'sortie', sortieId: 11 })] } };
    global.fetch = vi.fn(async () => json(lu)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(AgCopropriete, { immeuble: 'Résidence _TEST AG', edition: true })); }); await calmer();
    expect($('[data-agc-resume-derniere]').textContent).toBe('Dernière AGO : aucune connue');
    expect($('[data-agc-resume-prochaine]').textContent).toContain('Prochaine AG : 15/03/2999 — AGE, officielle');
    await clic($('[data-agc-historique-lien]'));
    expect(container.querySelectorAll('[data-agc-corriger]')).toHaveLength(1);
    expect($('[data-agc-corriger="4"]')).not.toBeNull();
  });
  it('hors de la fiche Copropriété (sans `edition`) : la lecture seule d’avant, aucun bouton', async () => {
    await act(async () => { root.render(createElement(AgCopropriete, { lotId: 7 })); }); await calmer();
    expect(container.querySelector('[data-agc-ajouter-pv]')).toBeNull();
    expect(container.querySelector('[data-agc-corriger]')).toBeNull();
    expect(container.querySelectorAll('[data-agc-entree]')).toHaveLength(3);
  });
});

/** 🔴🔴 Arno (17/11/2026) : « AG DANS « Copropriété & ID fiscal » : ajoute le module PV d'AG déjà créé, réutilisé tel quel […] si ce dernier est une AGE, afficher AUSSI la dernière AGO, pour information […] si l'adresse n'est pas encore choisie ou si le bien n'est relié à aucune copropriété : le dire clairement ; un PV saisi avant l'enregistrement du bien est rattaché à la copropriété à l'enregistrement. » */
describe('🔴🔴 le bloc AG de « Nouveau bien » / « Modifier le bien »', () => {
  let posts: { url: string; corps: Record<string, unknown> }[]; let lu: unknown; let enAttente: unknown[];
  const $ = (s: string) => container.querySelector(s) as HTMLElement;
  const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
  const saisir = async (el: Element, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
  const COPRO = { copropriete: { libelle: 'Résidence _TEST AG', cle: 'residence test ag' }, immeuble: 'Résidence _TEST AG', pv: true, entrees: [
    ENTREE({ id: 2, date: '2025-06-01', nature: 'age', origine: 'fiche_copropriete' }), ENTREE({ id: 1, date: '2024-03-12', nature: 'ago', origine: 'fiche_copropriete' })] };
  beforeEach(() => {
    posts = []; enAttente = []; lu = COPRO;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      if (init?.method === 'POST') { posts.push({ url: String(url), corps: JSON.parse(String(init.body)) as Record<string, unknown> }); return json({ etat: 'ok', data: { entrees: [] } }); }
      return json({ etat: 'ok', data: lu });
    }) as unknown as typeof fetch;
  });
  const monter = async (p: Record<string, unknown>) => {
    const { AgDuBien } = await import('./AgCopropriete');
    await act(async () => { root.render(createElement(AgDuBien, { immeuble: null, sansAdresse: false, enAttente: enAttente as never, onEnAttente: (x: unknown[]) => { enAttente = x; }, ...p } as never)); });
    await calmer();
  };
  it('le dernier PV (date, nature) ; une AGE : AUSSI la dernière AGO, pour information ; lu par la route de la Location', async () => {
    await monter({ immeuble: 'residence test ag' });
    expect(urls.at(-1)).toBe('/api/admin/location?agImmeuble=residence%20test%20ag');
    expect($('[data-ag-bien-dernier]').textContent).toBe('Dernier PV : 01/06/2025 — AGE (assemblée générale extraordinaire)');
    expect($('[data-ag-bien-derniere-ago]').textContent).toBe('Dernière AGO, pour information : 12/03/2024');
  });
  it('« Nouveau bien » : le PV saisi est GARDÉ (rien n’est envoyé), rattaché à l’enregistrement', async () => {
    await monter({ immeuble: 'residence test ag' });
    await clic($('[data-agc-ajouter-pv]'));
    await saisir($('[data-agc-pv-date-saisie]'), '2026-03-12');
    await clic($('[data-agc-pv-type-choix="ago"]'));
    await clic($('[data-agc-pv-enregistrer]'));
    expect(posts).toEqual([]);
    expect(enAttente).toEqual([{ date: '2026-03-12', nature: 'ago', note: null }]);
  });
  it('« Modifier le bien » relié à sa copropriété : le PV est écrit tout de suite, par la route de la Location (« pv-ag »), dans la copropriété', async () => {
    await monter({ lotId: 449 });
    expect(urls.at(-1)).toBe('/api/admin/location?agBien=449');
    await clic($('[data-agc-ajouter-pv]'));
    await saisir($('[data-agc-pv-date-saisie]'), '2026-03-12');
    await clic($('[data-agc-pv-type-choix="age"]'));
    await clic($('[data-agc-pv-enregistrer]'));
    expect(posts).toEqual([{ url: '/api/admin/location', corps: { action: 'pv-ag', immeuble: 'residence test ag', date: '2026-03-12', nature: 'age', note: null } }]);
  });
  it('adresse pas encore choisie, ou aucune copropriété : le dire ; sans la 481 : aucun bloc', async () => {
    await monter({ sansAdresse: true });
    expect($('[data-ag-bien-sans-adresse]').textContent).toBe('Choisissez d’abord l’adresse du bien : les PV d’AG de sa copropriété s’afficheront ici.');
    lu = { copropriete: null, immeuble: '1 rue _TEST AG', pv: true, entrees: [] };
    await monter({ immeuble: '1 rue test ag' });
    expect($('[data-ag-bien-sans-copro]').textContent).toContain('Ce bien n’est relié à aucune copropriété');
    lu = { ...COPRO, pv: false };
    await monter({ immeuble: 'residence test ag 2' });
    expect($('[data-ag-bien]')).toBeNull();
  });
  it('les PV en attente : listés « à enregistrer avec le bien », « Retirer » les ôte', async () => {
    enAttente = [{ date: '2026-03-12', nature: 'ago', note: '_TEST AG' }];
    await monter({ immeuble: 'residence test ag' });
    expect($('[data-ag-bien-en-attente]').textContent).toContain('12/03/2026 — AGO (assemblée générale ordinaire) — _TEST AGà enregistrer avec le bien');
    await clic($('[data-ag-bien-retirer="0"]'));
    expect(enAttente).toEqual([]);
  });
});

/** 🔴🔴 Arno (23/11/2026) — la fiche Copropriété NOUVELLE : « + Ajouter une AG » ; les AG sont GARDÉES et partent avec le « Valider ». */
describe('🔴🔴 la fiche Copropriété nouvelle : AG gardées jusqu’au « Valider »', () => {
  it('une AG saisie (passée ou à venir) est GARDÉE, rien n’est envoyé ; « Retirer » l’ôte', async () => {
    const { AgFicheNouvelle } = await import('./AgCopropriete');
    let enAttente: unknown[] = [];
    const posts: unknown[] = [];
    global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => { if (init?.method === 'POST') posts.push(init.body); return json({ etat: 'ok' }); }) as unknown as typeof fetch;
    const monter = async () => { await act(async () => { root.render(createElement(AgFicheNouvelle, { enAttente: enAttente as never, onEnAttente: (x: unknown[]) => { enAttente = x; } } as never)); }); await calmer(); };
    await monter();
    const $ = (q: string) => container.querySelector(q) as HTMLElement;
    expect($('[data-agc-vide]').textContent).toBe('Aucune AG saisie.');
    await act(async () => { $('[data-agc-ajouter-pv]').click(); }); await calmer();
    expect($('[data-agc-mention-officielle]').textContent).toBe('Date officielle uniquement : l’assemblée a eu lieu ou sa date est fixée par convocation.');
    expect(($('[data-agc-pv-date-saisie]') as HTMLInputElement).max).toBe('');
    await act(async () => { const el = $('[data-agc-pv-date-saisie]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '2999-03-15'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { $('[data-agc-pv-type-choix="ago"]').click(); });
    expect($('[data-agc-pv-enregistrer]').textContent).toBe('Garder cette AG');
    await act(async () => { $('[data-agc-pv-enregistrer]').click(); }); await calmer();
    expect(enAttente).toEqual([{ date: '2999-03-15', nature: 'ago', note: null }]);
    expect(posts).toEqual([]);
    await monter();
    expect($('[data-agc-en-attente]').textContent).toContain('15/03/2999 — AGO (assemblée générale ordinaire) — officielleEnregistrée avec la copropriété au « Valider ».');
    await act(async () => { $('[data-agc-en-attente-retirer="0"]').click(); });
    expect(enAttente).toEqual([]);
  });
});
