// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonCopropriete, FicheCopropriete, refusContact } from './FicheCopropriete';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 2) — la fenêtre « Copropriété » et son bouton sous celui du syndic. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (c: unknown) => ({ ok: true, status: 200, json: async () => c }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[]; let lu: Record<string, unknown>; let parcelle: unknown[];
const FICHE = (o: Record<string, unknown> = {}) => ({ cle: 'residence les tilleuls', declaree: true, id: 7, libelle: 'Résidence Les Tilleuls', nom: null, horsCopropriete: false, nomenclature: null,
  codePostal: '75011', commune: 'Paris', adresses: [{ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', principale: true },
    { cle: '12 rue des lilas', libelle: '12 rue des Lilas', codePostal: '75011', commune: 'Paris', principale: false }],
  syndic: { id: 2, nom: 'Cabinet A', ville: 'Paris', depuis: '2026-01-01' },
  gestionnaires: [{ id: 5, civilite: 'Mme', prenom: 'Claire', nom: 'Test', titre: 'Gestionnaire', coordonnees: [{ sorte: 'email', libelle: null, valeur: 'claire@cabinet-a.test' }] }],
  contacts: [{ id: 1, categorie: 'gardien', libelle: null, civilite: 'M.', prenom: 'Paul', nom: 'Loge', note: null, coordonnees: [{ id: 3, sorte: 'telephone', libelle: null, valeur: '0611223344' }] }],
  biens: [{ id: 1, numero: 'W1', adresse: '12 rue des Lilas', copropriete: true }], desaccord: false, avec476: true, ...o });
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  lu = { fiche: FICHE(), coproprieteDuBien: true };
  parcelle = [{ libelle: '14 rue des Lilas', codePostal: '75011', commune: 'Paris', parcelle: 'AB12', etat: 'libre', copropriete: null, syndic: null },
    { libelle: '10 rue Voisine', codePostal: '75011', commune: 'Paris', parcelle: 'AB12', etat: 'prise', copropriete: '10 rue Voisine', syndic: { id: 9, nom: 'Cabinet B', ville: 'Lyon' } }];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('/api/admin/gestion/coproprietes/fiche') && (init?.method ?? 'GET') === 'GET') return json({ etat: 'ok', data: lu });
    if (u.startsWith('/api/admin/gestion/coproprietes/fiche')) {
      const c = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (c.action === 'parcelle') return json({ etat: 'ok', data: parcelle });
      posts.push(c); return json({ etat: 'ok', data: FICHE() });
    }
    if (u.startsWith('/api/admin/gestion/syndics?')) return json({ syndics: [{ id: 2, nom: 'Cabinet A', ville: 'Paris', nbCoproprietes: 3 }, { id: 4, nom: 'Cabinet C', ville: 'Nice', nbCoproprietes: 1 }] });
    return json({ etat: 'sans_schema' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const clic = async (s: string) => { await act(async () => { $(s).click(); }); await calmer(); };
const saisir = async (s: string, v: string) => { const el = $(s) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const ouvrir = async () => { await act(async () => { root.render(createElement(FicheCopropriete, { lotId: 1, onFerme: () => {} })); }); await calmer(); };

describe('le bouton sous « Créer le syndic »', () => {
  it('« Copropriété » ; un bien noté « pas en copropriété » : « Bien hors copropriété » dès le départ, la fiche aussi', async () => {
    await act(async () => { root.render(createElement(BoutonCopropriete, { lotId: 1 })); }); await calmer();
    expect(container.textContent).toBe('Copropriété');
    act(() => root.unmount()); root = createRoot(container);
    lu = { fiche: FICHE({ declaree: false, id: null, syndic: null }), coproprieteDuBien: false };
    await act(async () => { root.render(createElement(BoutonCopropriete, { lotId: 1 })); }); await calmer();
    expect(container.textContent).toBe('Bien hors copropriété');
    await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); }); await calmer();
    expect($('[data-fcp-titre]').textContent).toBe('Bien hors copropriété · Résidence Les Tilleuls');
    expect(document.querySelector('[data-fcp-syndic]')).toBeNull(); // ni syndic
    expect(document.querySelector('[data-fcp-ag]')).toBeNull(); // ni AG
    expect(document.querySelector('[data-fcp-adresses]')).not.toBeNull(); // mais adresses, digicodes, habitants
    expect(document.querySelector('[data-fcp-digicodes]')).not.toBeNull();
    expect(document.querySelector('[data-fcp-contacts]')).not.toBeNull();
    expect(($('[data-fcp-hors]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('un bien noté « pas en copropriété » sur une fiche déjà enregistrée', () => {
  it('le titre le dit, ni syndic ni AG ; la case reste celle de la fiche, avec la phrase qui propose de la cocher ; le syndic encore lié est dit', async () => {
    lu = { fiche: FICHE(), coproprieteDuBien: false };
    await ouvrir();
    expect($('[data-fcp-titre]').textContent).toBe('Bien hors copropriété · Résidence Les Tilleuls');
    expect(document.querySelector('[data-fcp-syndic]')).toBeNull();
    expect(document.querySelector('[data-fcp-ag]')).toBeNull();
    expect(($('[data-fcp-hors]') as HTMLInputElement).checked).toBe(false);
    expect($('[data-fcp-bien-hors]').textContent).toContain('rien n’est changé sans « Valider »');
    expect($('[data-fcp-hors-avec-syndic]').textContent).toContain('rien n’est retiré tout seul');
  });
});

describe('la fiche', () => {
  it('toutes ses adresses, un digicode par adresse, l’AG, le syndic (lien) et ses gestionnaires en lecture seule, les habitants et gardiens', async () => {
    await ouvrir();
    expect($('[data-fcp-titre]').textContent).toBe('Copropriété · Résidence Les Tilleuls');
    expect([...document.querySelectorAll('[data-fcp-adresse]')].map((x) => x.getAttribute('data-fcp-adresse'))).toEqual(['principale', 'secondaire']);
    expect($('[data-fcp-ouvrir-syndic]').textContent).toMatch(/^Cabinet A/i);
    expect($('[data-fcp-gestionnaires]').textContent).toContain('Claire TEST');
    expect($('[data-fcp-gestionnaires]').textContent).toContain('(lecture seule)');
    expect($('[data-fcp-contact="gardien"] [data-fcp-statut]').textContent).toBe('Gardien');
    expect($('[data-fcp-usage-interne]').textContent).toContain('jamais communiquées à un autre client');
    expect(document.querySelectorAll('[role="dialog"] select')).toHaveLength(0);
  });
  it('« + » : les adresses de la même parcelle (« Rattacher » ; prise par une autre copropriété : grisée avec son syndic) ; une autre adresse ; « × » retire', async () => {
    await ouvrir();
    await clic('[data-fcp-plus-adresse]');
    expect($('[data-fcp-prise]').textContent).toContain('déjà rattachée à une autre copropriété');
    expect($('[data-fcp-prise]').textContent).toContain('Lyon');
    await clic('[data-fcp-rattacher-parcelle]');
    await saisir('[data-fcp-rue]', '3 impasse Neuve');
    await clic('[data-fcp-ajouter-adresse]');
    expect([...document.querySelectorAll('[data-fcp-adresse="secondaire"]')].map((x) => x.textContent!.replace(/ ×$/, '').split(',')[0])).toEqual(['12 rue des Lilas', '14 rue des Lilas', '3 impasse Neuve']);
    await clic('[data-fcp-retirer]'); await clic('[data-fcp-retirer-oui]');
    await clic('[data-fcp-valider]');
    expect((posts[0].adresses as { libelle: string }[]).map((a) => a.libelle)).toEqual(['14 rue des Lilas', '3 impasse Neuve']);
  });
  it('habitants : statuts Gardien / Copropriétaire / Conseil syndical / Personnaliser (texte libre obligatoire) ; partent avec « Valider »', async () => {
    await ouvrir();
    await clic('[data-fcp-ajouter-contact]');
    expect([...document.querySelectorAll('[data-fcp-statut-choix]')].map((x) => x.textContent)).toEqual(['Gardien', 'Copropriétaire', 'Conseil syndical', 'Personnaliser']);
    expect($('[data-fcp-statut-choix="coproprietaire"]').getAttribute('aria-pressed')).toBe('true');
    await saisir('[data-fcp-prenom]', 'Léa'); await saisir('[data-fcp-nom-contact]', 'Martin');
    await clic('[data-fcp-plus-email]'); await saisir('[data-fcp-coord="email"]', 'lea@exemple.test');
    await clic('[data-fcp-statut-choix="personnalise"]');
    expect(($('[data-fcp-valider-contact]') as HTMLButtonElement).disabled).toBe(true);
    await saisir('[data-fcp-statut-libre]', 'Locataire');
    await clic('[data-fcp-valider-contact]');
    await clic('[data-fcp-valider]');
    expect(posts[0].contacts).toMatchObject([{ id: 1, categorie: 'gardien' }, { id: null, categorie: 'personnalise', libelle: 'Locataire', prenom: 'Léa', coordonnees: [{ sorte: 'email', valeur: 'lea@exemple.test' }] }]);
    expect(refusContact({ cle: 'x', id: null, categorie: 'coproprietaire', libelle: '', civilite: null, prenom: '', nom: '', note: '', coordonnees: [] })).toBe('Donnez au moins un nom ou un prénom.');
  });
  it('changer de syndic depuis la fiche ; une adresse de la parcelle gérée par un AUTRE syndic : « Oui, je confirme », le conflit part avec la saisie', async () => {
    await ouvrir();
    await clic('[data-fcp-choisir-syndic]');
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await calmer();
    await clic('[data-fcp-syndic-propose="4"]');
    expect($('[data-fcp-syndic-choisi]').textContent).toContain('passera en historique');
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-conflit]').textContent).toContain('10 rue Voisine');
    expect(posts).toHaveLength(0);
    await clic('[data-fcp-conflit-oui]');
    expect(posts[0]).toMatchObject({ syndicId: 4, conflitsParcelle: [{ autre: '10 rue Voisine', parcelle: 'AB12' }] });
  });
  it('une fiche encore à créer, d’autres adresses sur la parcelle non rattachées : l’alerte d’abord (« Voir les adresses » / « Valider quand même »)', async () => {
    lu = { fiche: FICHE({ declaree: false, id: null, syndic: null, gestionnaires: [] }), coproprieteDuBien: null };
    await ouvrir();
    expect($('[data-fcp-nouvelle]').textContent).toContain('créée au premier « Valider »');
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-alerte-parcelle]').textContent).toContain('14 rue des Lilas');
    await clic('[data-fcp-valider-quand-meme]');
    expect(posts[0]).toMatchObject({ alerteParcelleVue: true });
  });
  it('des biens qui se contredisent : l’alerte, rien n’est corrigé tout seul', async () => {
    lu = { fiche: FICHE({ desaccord: true }), coproprieteDuBien: true };
    await ouvrir();
    expect($('[data-fcp-desaccord]').textContent).toContain('rien n’est corrigé tout seul');
  });
});
