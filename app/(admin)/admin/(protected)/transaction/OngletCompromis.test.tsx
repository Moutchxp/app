// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranGlobal, EcranSociete } from './EcransTransaction';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 TUILE « TRANSACTION », LOT D (27/10/2026) — les vrais écrans, route simulée (rien n'est écrit) : l'onglet « Compromis » AVANT « Le mois »
 * et « L'année », ses totaux et sa répartition, « Acte signé » puis « Revenir en compromis » ; le formulaire d'un compromis et son bloc
 * « Négociateurs et répartition » (50/50, même négociateur 100 %, partie extérieure, somme ≠ 100 % dite et refusée côté écran) ; le CA global.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JB = { id: 5, nom: 'Jean-Baptiste PONS', societe: 'criterimmo' as const };
const MY = { id: 7, nom: 'Mylène EBERLIN', societe: 'macj' as const };
const compromis: Vente = { id: 41, societe: 'criterimmo', libelle: 'DUPONT / MARTIN', honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-10-20',
  apporteur: 'Julien Deblois', note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null,
  repartition: { retroApporteurTtc: 2400, parties: [
    { sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 40, montantHt: null },
    { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 40, montantHt: null },
    { sorte: 'exterieure', compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', coordonnees: null, pourcentage: 20, montantHt: null }] },
  dossier: { adresseBien: '1 rue A, Puteaux', dateActePrevue: '2027-01-15', dateActe: null, entree: { id: 5, nom: JB.nom }, sortie: { id: 7, nom: MY.nom }, apporteurId: 4,
    personnes: [{ id: 3, role: 'vendeur', nom: 'DUPONT', telephone: '06 12 34 56 78', email: 'p.dupont@exemple.fr', adresse: null }, { id: 8, role: 'acquereur', nom: 'MARTIN', telephone: null, email: null, adresse: null }] } };
const references = { lotD: true, negociateurs: [JB, MY], apporteurs: [{ id: 4, nom: 'Julien Deblois' }], personnes: [{ id: 3, nom: 'DUPONT', telephone: '06 12 34 56 78', email: 'p.dupont@exemple.fr', adresse: null }] };
const societe = { disponible: true, societe: 'criterimmo', aujourdhui: '2026-10-27', ventes: [], retrocessions: [], aRattacher: [], doubles: [] };
const global = { disponible: true, aujourdhui: '2026-10-27', location: {}, gestion: [], ventes: [] };

let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let reponsePost: { etat: string; motif?: string };
beforeEach(() => {
  posts = []; reponsePost = { etat: 'ok' };
  window.history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ ...reponsePost, data: null }) }; }
    const u = String(url);
    const data = u.includes('vue=compromis') ? { disponible: true, aujourdhui: '2026-10-27', societe: 'criterimmo', compromis: [compromis], ...references }
      : u.includes('vue=references') ? { disponible: true, aujourdhui: '2026-10-27', ...references } : u.includes('vue=global') ? global : u.includes('vue=journal') ? [] : societe;
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ouvrir = async () => {
  await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); });
  await calmer();
};

describe('l’onglet « Compromis »', () => {
  it('placé AVANT « Le mois » et « L’année » ; « Le mois » reste l’onglet d’ouverture', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('.trx-vues [role="tab"]')].map((b) => b.textContent)).toEqual(['Compromis', 'Le mois', 'L’année']);
    expect(container.querySelector('[data-vue="mois"]')!.getAttribute('aria-selected')).toBe('true');
  });
  it('chaque compromis : personnes et coordonnées, bien, dates, commission, négociateurs, apporteur, répartition par partie et par société ; les totaux', async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    expect(texte('[data-nb-compromis]')).toBe('1');
    expect(texte('[data-commission-en-cours]')).toBe('10 000,00 €');
    // (12 000 − 2 400) ÷ 1,2 = 8 000 HT nets ; 40 % = 3 200
    expect(texte('[data-part-compromis="criterimmo"]')).toBe('3 200,00 €');
    const fiche = texte('[data-compromis="41"]');
    for (const m of ['DUPONT', '06 12 34 56 78', 'p.dupont@exemple.fr', 'MARTIN', '1 rue A, Puteaux', '20/10/2026', '15/01/2027', '10 000,00 € HT', '12 000,00 € TTC',
      'Jean-Baptiste PONS', 'Mylène EBERLIN', 'Julien Deblois', 'rétrocession 2 400,00 € TTC', 'Part extérieure — Agence du Parc', '1 600,00 € HT']) expect(fiche).toContain(m);
    expect(texte('[data-part-societe-compromis="macj"]')).toBe('3 200,00 € HT');
  });
  it('« Acte signé » envoie la date de l’acte ; « Revenir en compromis » le défait', async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-acte-signe="41"]');
    await saisir('[data-date-acte]', '2026-12-18');
    await cliquer('[data-confirmer-acte]');
    expect(posts).toContainEqual({ action: 'acte-signe', id: 41, dateActe: '2026-12-18' });
    expect(texte('[data-acte-fait]')).toContain('vente encaissée au mois de l’acte');
    await cliquer('[data-revenir-compromis]');
    expect(posts).toContainEqual({ action: 'retour-compromis', id: 41 });
  });
  it('le CA global réunit les deux sociétés dans son onglet « Compromis »', async () => {
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer();
    expect([...container.querySelectorAll('[role="tab"]')].slice(0, 2).map((b) => b.textContent)).toEqual(['Compromis', 'Le mois et l’année']);
    await cliquer('[data-vue="compromis"]');
    expect(container.querySelector('[data-onglet-compromis="tous"]')).not.toBeNull();
    expect(texte('[data-part-compromis="macj"]')).toBe('3 200,00 €');
  });
});

describe('le formulaire d’un compromis et sa répartition', () => {
  const nouveau = async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-nouveau-compromis]');
    await saisir('[data-champ="commission"]', '12000');
  };
  const choisir = async (champ: string, id: number) => {
    await cliquer(`[data-champ="${champ}"]`);
    await cliquer(`[role="option"][data-option="${id}"]`);
  };
  it('deux négociateurs ⇒ 50/50 ; le même ⇒ 100 % ; une partie extérieure, puis « Revenir au 50/50 »', async () => {
    await nouveau();
    await choisir('entree', 5);
    await choisir('sortie', 5);
    expect([...container.querySelectorAll('[data-partie-pct]')].map((i) => (i as HTMLInputElement).value)).toEqual(['100']);
    expect(texte('[data-partie="entree_sortie"]')).toContain('Entrée et sortie du mandat');
    await choisir('sortie', 7);
    expect([...container.querySelectorAll('[data-partie-pct]')].map((i) => (i as HTMLInputElement).value)).toEqual(['50', '50']);
    expect(texte('[data-part-societe="criterimmo"]')).toBe('5 000,00 € HT');
    expect(texte('[data-part-societe="macj"]')).toBe('5 000,00 € HT');
    await cliquer('[data-ajouter-exterieure]');
    await saisir('[data-partie-pct="0"]', '40');
    await saisir('[data-partie-pct="1"]', '40');
    await saisir('[data-partie-pct="2"]', '20');
    await saisir('[data-partie-nom]', 'Agence du Parc');
    expect(texte('[data-part-exterieure]')).toBe('2 000,00 € HT');
    expect(container.querySelector('[data-motif-repartition]')).toBeNull();
    // saisie en € : 4 500 € HT pour la sortie ⇒ 45 %, et la somme ne fait plus 100 %
    await saisir('[data-partie-eur="1"]', '4500');
    expect((container.querySelector('[data-partie-pct="1"]') as HTMLInputElement).value).toBe('45');
    expect(texte('[data-motif-repartition]')).toMatch(/fait 105 %/);
    await cliquer('[data-revenir-5050]');
    expect([...container.querySelectorAll('[data-partie-pct]')].map((i) => (i as HTMLInputElement).value)).toEqual(['50', '50']);
  });
  it('un refus du serveur est dit, la saisie reste à l’écran', async () => {
    await nouveau();
    await saisir('[data-personne-nom="0"]', 'DUPONT');
    reponsePost = { etat: 'refus', motif: 'La répartition fait 110 % (…) : elle doit faire exactement 100 %.' };
    await cliquer('[data-enregistrer-dossier]');
    expect(posts.at(-1)).toMatchObject({ action: 'dossier-enregistrer', id: null, dossier: { societe: 'criterimmo', statut: 'compromis', honorairesTtc: '12000' } });
    expect(texte('[data-motif-dossier]')).toMatch(/exactement 100 %/);
    expect((container.querySelector('[data-personne-nom="0"]') as HTMLInputElement).value).toBe('DUPONT');
    expect((container.querySelector('[data-champ="commission"]') as HTMLInputElement).value).toBe('12000');
  });
  it('choisir une personne de l’annuaire reprend sa fiche (aucun doublon)', async () => {
    await nouveau();
    await saisir('[data-personne-nom="0"]', 'DUPONT — 06 12 34 56 78 — p.dupont@exemple.fr');
    await cliquer('[data-enregistrer-dossier]');
    const p = (posts.at(-1)!.dossier as { personnes: { id: number | null; nom: string }[] }).personnes[0];
    expect(p).toMatchObject({ id: 3, nom: 'DUPONT' });
  });
});
