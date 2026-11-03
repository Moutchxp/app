// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_MES_AFFAIRES } from './MesCompteurs';
import { URL_APPORTEURS } from './MesApporteurs';

/**
 * 🔴 MON ESPACE, LOT 9 — l'onglet « Mes apporteurs » dans le VRAI écran de « Mon espace », routes simulées (rien n'est écrit) : la liste
 * (coordonnées, collègue, chiffres), la recherche, « Modifier la fiche » seulement quand le serveur le permet, « + Nouvel apporteur » : un doublon
 * de l'annuaire est annoncé avec son collègue, la création est bloquée, « L'utiliser » ne crée rien. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fiche = (id: number, nom: string) => ({ id, nom, type: 'partenaire', baremes: [], archive: false, collegues: [] });
const mon = (o: Record<string, unknown>) => ({ interne: false, societe: null, telephone: null, email: null, collegue: 'Léa', recherche: '', modifiable: true,
  nbVentes: 0, caApporteHt: 0, retroHt: 0, ...o });
const LISTE = {
  apporteurs: [
    mon({ id: 1, libelle: 'DURAND Paul', telephone: '06 12 34 56 78', email: 'paul@durand.fr', nbVentes: 2, caApporteHt: 8000, fiche: { ...fiche(1, 'DURAND Paul'), collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Léa' }] } }),
    mon({ id: 2, libelle: 'MARTIN Lise', collegue: 'Marc', modifiable: false, fiche: fiche(2, 'MARTIN Lise') }),
  ],
  collegues: [{ id: 5, libelle: 'Léa' }, { id: 7, libelle: 'Marc' }], titulaireId: 5, administrateur: false, utiliserDisponible: true, identite: true, nomPrenom: true,
};
const DOUBLON = { id: 9, libelle: 'BERNARD Jean', collegue: 'Marc', raisons: ['telephone'] };
let posts: Record<string, unknown>[];
let repondre: (corps: Record<string, unknown>) => { status: number; corps: Record<string, unknown> };
let liste: Record<string, unknown>;
let doublons: unknown[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); // l'adresse (?vue=…) que l'écran écrit, comme la Transaction : chaque épreuve repart de zéro
  posts = []; doublons = []; liste = LISTE;
  repondre = () => ({ status: 200, corps: { etat: 'ok', data: null } });
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_MES_AFFAIRES)) return ok({ disponible: true, aujourdhui: '2026-11-02', titulaire: { id: 5, prenom: 'Léa', administrateur: false }, ventes: [],
      compteurs: { compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } }, actees: { nb: 0, ids: [], annee: 2026, ca: { htC: 0, ttcC: 0 } }, parAnnee: [] }, retrocessions: [] });
    if (u.startsWith(`${URL_APPORTEURS}/doublons`)) return ok(doublons);
    if (u === URL_APPORTEURS && init?.method === 'POST') {
      const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c);
      const x = repondre(c); return { ok: x.status === 200, status: x.status, json: async () => x.corps };
    }
    if (u === URL_APPORTEURS) return ok(liste);
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, v: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer();
};
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-onglet-mon-espace="apporteurs"]'); };
const ids = () => [...container.querySelectorAll('[data-mon-apporteur]')].map((e) => e.getAttribute('data-mon-apporteur'));

describe('🔴 « Mes apporteurs »', () => {
  it('la liste : coordonnées, collègue de rattachement, ventes et CA apporté sur mes ventes', async () => {
    await ouvrir();
    expect(ids()).toEqual(['1', '2']);
    const p = container.querySelector('[data-mon-apporteur="1"]')!.textContent ?? '';
    expect(p).toContain('06 12 34 56 78');
    expect(p).toContain('paul@durand.fr');
    expect(p).toContain('Collègue de rattachement : Léa');
    expect(p.replace(/\s/g, ' ')).toContain('2 ventes — CA apporté 8 000 € HT');
  });
  it('la recherche : nom, téléphone, e-mail', async () => {
    await ouvrir();
    await saisir('[data-recherche-apporteur]', 'martin');
    expect(ids()).toEqual(['2']);
    await saisir('[data-recherche-apporteur]', '0612');
    expect(ids()).toEqual(['1']);
    await saisir('[data-recherche-apporteur]', 'durand.fr');
    expect(ids()).toEqual(['1']);
  });
  it('« Modifier la fiche » : seulement là où le serveur le permet (son collègue, un administrateur)', async () => {
    await ouvrir();
    expect(container.querySelector('[data-modifier-apporteur="1"]')).not.toBeNull();
    expect(container.querySelector('[data-modifier-apporteur="2"]')).toBeNull();
  });
  it('« + Nouvel apporteur » : le même formulaire ; l’externe est rattaché à moi par défaut', async () => {
    await ouvrir();
    await cliquer('[data-nouvel-apporteur-mon-espace]');
    expect(container.querySelector('[data-fenetre-fiche-apporteur="nouveau"]')).not.toBeNull();
    expect(container.querySelector('[data-fiche-collegue]')?.textContent).toContain('Léa');
  });
  it('un doublon de l’annuaire : « Cet apporteur existe déjà, rattaché à Marc », création bloquée ; « L’utiliser » ne crée rien', async () => {
    doublons = [DOUBLON];
    await ouvrir();
    await cliquer('[data-nouvel-apporteur-mon-espace]');
    await saisir('[data-fiche-champ="telephone"]', '0611111111');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); }); await calmer();
    expect(container.querySelector('[data-doublon="9"]')?.textContent).toContain('Cet apporteur existe déjà, rattaché à Marc');
    expect((container.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer('[data-utiliser-apporteur="9"]');
    expect(posts).toEqual([{ action: 'utiliser', apporteurId: 9 }]);
    expect(container.querySelector('[data-fenetre-fiche-apporteur]')).toBeNull();
  });
  it('rien en commun : la création passe par la route de « Mon espace »', async () => {
    await ouvrir();
    await cliquer('[data-nouvel-apporteur-mon-espace]');
    await saisir('[data-fiche-champ="nomFamille"]', 'NOUVELLE');
    await saisir('[data-fiche-champ="prenom"]', 'Zoé');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); }); await calmer();
    await cliquer('[data-enregistrer-fiche]');
    expect(posts[0]).toMatchObject({ action: 'creer', apporteur: { nom: 'Zoé NOUVELLE', collegueId: 5, interne: false } });
  });
});

/**
 * 🔴 D26 (Arno, 03/11/2026) — la fiche d'un apporteur : UNE fenêtre pour créer et modifier, tous les champs, le collègue rattaché (moi par défaut à la
 * création ; un administrateur le choisit ou le change, « à rattacher » compris), journal et garde de version côté serveur (409 montré). Données fictives.
 */
describe('🔴 D26 — la fiche d’un apporteur : une fenêtre, tout modifiable', () => {
  const choisir = async (champ: string, option: string) => { await cliquer(`[${champ}]`); await cliquer(`[data-liste-choix] [data-option="${option}"]`); };
  const fenetre = () => container.querySelector('[data-fenetre-fiche-apporteur]');
  it('création : rattachée à moi par défaut, modifiable ; tous les champs partent avec la création', async () => {
    await ouvrir();
    await cliquer('[data-nouvel-apporteur-mon-espace]');
    expect(container.querySelector('[data-fiche-collegue]')?.textContent).toContain('Léa');
    await choisir('data-fiche-collegue', '7');
    expect(container.querySelector('[data-fiche-collegue]')?.textContent).toContain('Marc');
    await saisir('[data-fiche-champ="nomFamille"]', 'NOUVELLE');
    await saisir('[data-fiche-champ="prenom"]', 'Zoé');
    await saisir('[data-fiche-champ="adresse"]', '3 rue des Lilas');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); }); await calmer();
    await cliquer('[data-enregistrer-fiche]');
    expect(posts[0]).toMatchObject({ action: 'creer', apporteur: { nom: 'Zoé NOUVELLE', collegueId: 7, interne: false,
      fiche: { nomFamille: 'NOUVELLE', prenom: 'Zoé', adresse: '3 rue des Lilas' } } });
    expect(fenetre()).toBeNull();
  });
  it('la fenêtre, pas la carte : sections titrées, chaque libellé au-dessus d’une vraie case de saisie, les styles des champs chargés', async () => {
    await ouvrir();
    await cliquer('[data-modifier-apporteur="1"]');
    const f = fenetre()!;
    expect(f.querySelector('[role="dialog"]')).not.toBeNull();
    expect(f.closest('[data-mon-apporteur]')).toBeNull(); // plus coincée dans la carte
    expect([...f.querySelectorAll('[data-section-fiche]')].map((x) => x.getAttribute('data-section-fiche'))).toEqual(['identite', 'contact', 'rattachement', 'notes']);
    for (const cle of ['nomFamille', 'prenom', 'societe', 'telephone', 'email', 'adresse', 'notes']) {
      const champ = f.querySelector(`[data-fiche-champ="${cle}"]`)!;
      expect(['INPUT', 'TEXTAREA']).toContain(champ.tagName);
      const libelle = champ.closest('label.plo-champ')!;
      expect(libelle.firstElementChild?.tagName).toBe('SPAN'); // le libellé, puis la case (colonne)
      expect(libelle.firstElementChild?.textContent).not.toBe('');
    }
    expect(f.querySelector('[data-autres="telephones"] [data-ajouter-autre="telephones"]')).not.toBeNull();
    // La cause du formulaire cassé : les styles des champs (ceux de la Location) sont bien dans la fenêtre.
    const css = [...f.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.plo-champ{display:flex;flex-direction:column');
    expect(css).toContain('.plo-champ input{min-height:44px');
    expect(css).toContain('.plo-grille{display:grid');
  });
  it('modifier : chaque champ part avec sa version ; « Enregistrer » actif dès qu’un champ change ; non-administrateur : collègue en lecture', async () => {
    await ouvrir();
    await cliquer('[data-modifier-apporteur="1"]');
    expect((container.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-fiche-collegue]')).toBeNull();
    expect(container.querySelector('[data-fiche-rattachement-admin]')).not.toBeNull();
    await saisir('[data-fiche-champ="societe"]', 'Agence du Parc');
    await saisir('[data-fiche-champ="telephone"]', '0700000000');
    await saisir('[data-fiche-champ="email"]', 'contact@parc.fr');
    await saisir('[data-fiche-champ="adresse"]', '1 place Verte');
    await cliquer('[data-ajouter-autre="emails"]');
    await saisir('[data-autre="emails-0"]', 'autre@parc.fr');
    await act(async () => { const t = container.querySelector('[data-fiche-champ="notes"]') as HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'Rencontré au salon'); t.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer();
    expect(container.querySelector('[data-etat-fiche]')?.textContent).toBe('6 champ(s) modifié(s).');
    await cliquer('[data-enregistrer-fiche]');
    expect(container.querySelectorAll('[data-recap-champ]').length).toBe(6);
    await cliquer('[data-recap-confirmer]');
    expect(posts).toEqual([{ action: 'fiche', apporteurId: 1, version: null, fiche: expect.objectContaining({ societe: 'Agence du Parc', telephone: '0700000000',
      email: 'contact@parc.fr', adresse: '1 place Verte', emailsAutres: ['autre@parc.fr'], notes: 'Rencontré au salon' }) }]);
    expect(fenetre()).toBeNull();
    expect(container.querySelector('[data-message-apporteurs]')?.textContent).toBe('Fiche enregistrée');
  });
  it('écriture périmée : le 409 du serveur est dit, rien n’est fermé, « Recharger » est proposé', async () => {
    repondre = () => ({ status: 409, corps: { etat: 'conflit', motif: 'La fiche a été modifiée par lea@x.fr entre-temps.' } });
    await ouvrir();
    await cliquer('[data-modifier-apporteur="1"]');
    await saisir('[data-fiche-champ="societe"]', 'X');
    await cliquer('[data-enregistrer-fiche]'); await cliquer('[data-recap-confirmer]');
    expect(container.querySelector('[data-fiche-motif]')?.textContent).toContain('modifiée par lea@x.fr');
    expect(container.querySelector('[data-recharger-fiche]')).not.toBeNull();
    expect(fenetre()).not.toBeNull();
  });
  it('administrateur, apporteur « à rattacher » : le collègue choisi, la question des honoraires, puis le rattachement (collègue lu à l’ouverture)', async () => {
    liste = { ...LISTE, administrateur: true, avec419: true, toujours: true,
      apporteurs: [mon({ id: 3, libelle: 'PETIT Max', collegue: null, fiche: fiche(3, 'PETIT Max') })] };
    await ouvrir();
    await cliquer('[data-modifier-apporteur="3"]');
    await cliquer('[data-enregistrer-fiche]'); // rien n'a changé : inactif
    expect(posts).toEqual([]);
    await choisir('data-fiche-collegue', '7');
    expect(container.querySelector('[data-fiche-question-honoraires]')?.textContent).toContain('Marc touche des honoraires');
    expect((container.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(true); // la question est obligatoire
    await cliquer('[data-fiche-reponse="non"]');
    await cliquer('[data-enregistrer-fiche]');
    expect(container.querySelector('[data-recap-champ="collegue"]')?.textContent).toContain('à rattacher → Marc');
    await cliquer('[data-recap-confirmer]');
    expect(posts).toEqual([{ action: 'rattachement', apporteurId: 3, collegueAvant: null, rattachement: { sorte: 'rattacher', collegueId: 7, depuisToujours: true,
      remuneration: { remunere: false, mode: 'one_shot', taux: '', tauxGestion: '', dureeAnnees: 'indeterminee' } } }]);
    expect(fenetre()).toBeNull();
  });
  it('administrateur : le taux et la rémunération en vigueur, et les panneaux de la Location pour les modifier', async () => {
    liste = { ...LISTE, administrateur: true, avec419: true, toujours: true };
    await ouvrir();
    await cliquer('[data-modifier-apporteur="1"]');
    expect(container.querySelector('[data-fiche-regle-en-vigueur]')).not.toBeNull();
    await cliquer('[data-fiche-ouvrir-taux]');
    expect(container.querySelector('[data-panneau="taux"]')).not.toBeNull();
  });
});

describe('🔴 D32 (Arno, 03/11/2026, option B) — « Me rattacher cet apporteur » (collaborateur, apporteur « à rattacher »)', () => {
  const LIBRE = mon({ id: 3, libelle: 'PETIT Zoé', collegue: null, modifiable: false, peutSeRattacher: true, fiche: fiche(3, 'PETIT Zoé') });
  it('seul ce bouton pour cette fiche (pas « Modifier la fiche ») ; la fenêtre envoie un rattachement À MOI, avec la réponse, sans taux', async () => {
    liste = { ...LISTE, toujours: true, apporteurs: [...LISTE.apporteurs, LIBRE] };
    await ouvrir();
    const carte = container.querySelector('[data-mon-apporteur="3"]')!;
    expect([...carte.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Me rattacher cet apporteur']);
    expect(container.querySelector('[data-me-rattacher="2"]')).toBeNull(); // MARTIN Lise : déjà rattachée à Marc → aucun bouton
    await cliquer('[data-me-rattacher="3"]');
    expect(container.querySelector('[data-fenetre-me-rattacher="3"]')).not.toBeNull();
    expect((container.querySelector('[data-valider-me-rattacher]') as HTMLButtonElement).disabled).toBe(true); // la question d'abord
    expect(container.querySelector('[data-fenetre-me-rattacher] [data-fiche-collegue]')).toBeNull(); // aucun choix de collègue
    await cliquer('[data-me-rattacher-reponse="oui"]');
    expect(container.querySelector('[data-me-rattacher-remuneration]')?.textContent).toMatch(/administrateur/);
    expect(container.querySelector('[data-fenetre-me-rattacher] [data-fiche-remuneration-taux]')).toBeNull(); // aucun taux
    await cliquer('[data-me-rattacher-toujours]');
    await cliquer('[data-valider-me-rattacher]');
    expect(posts.at(-1)).toEqual({ action: 'rattachement', apporteurId: 3, collegueAvant: null,
      rattachement: { sorte: 'rattacher', collegueId: 5, depuisToujours: true, remuneration: { remunere: true } } });
    expect(container.querySelector('[data-message-apporteurs]')?.textContent).toMatch(/vous est rattaché. Sa rémunération .* administrateur/);
  });
  it('un refus du serveur (403) est dit dans la fenêtre ; rien ne change', async () => {
    liste = { ...LISTE, apporteurs: [...LISTE.apporteurs, LIBRE] };
    repondre = () => ({ status: 403, corps: { etat: 'refus', motif: 'Cet apporteur est déjà rattaché : changer son rattachement est réservé aux administrateurs.' } });
    await ouvrir();
    await cliquer('[data-me-rattacher="3"]');
    await cliquer('[data-me-rattacher-reponse="non"]');
    await cliquer('[data-valider-me-rattacher]');
    expect(container.querySelector('[data-me-rattacher-motif]')?.textContent).toMatch(/déjà rattaché/);
  });
});
