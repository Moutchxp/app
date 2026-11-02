// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { GestesAffaire, URL_GESTE } from './GestesAffaire';
import { empreinteDe } from '../../../../lib/mon-espace/mesAffaires';

/**
 * 🔴 MON ESPACE, LOT 7 — dans le VRAI écran de « Mon espace », routes simulées (rien n'est écrit), horloge simulée :
 *   · les gestes (décision 5) : « Acte signé » (confirmé dans la page, avec la date), « Annuler le compromis » (la fenêtre de la tuile),
 *     « Revenir en compromis » ; envoyés avec la version ; absents pour une affaire qui n'est pas à moi ;
 *   · le rafraîchissement : un geste de Marc apparaît chez Léa sans rechargement manuel (« Marc a mis à jour … », la ligne éclairée) ; aucune
 *     relecture pendant une saisie ; session expirée : « reconnectez-vous » ; autre panne : rien.
 * Données fictives : Léa (5) à l'entrée, Marc (7) à la sortie.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const base = { societe: 'criterimmo', honorairesTtc: 12000, annee: 2027, mois: null, dateCompromis: '2026-10-01', apporteur: null, note: null, origine: 'saisie', sourceFichier: null,
  sourceOnglet: null, sourceLigne: null, lignes: [], double: null, numeroMandat: 'M-1', repartition: { retroApporteurTtc: 0, parties: [
    { sorte: 'entree', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null },
    { sorte: 'sortie', compteId: 7, negociateur: 'Marc DURAND', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 7, nom: 'Marc DURAND' }, apporteurId: null, personnes: [] },
  mesCotes: ['entree'], commissionsRetirees: false };
const compromis = (version: number, auteurId = 5, prenom = 'Léa') => ({ ...base, id: 1, libelle: 'DUPONT / MARTIN', statut: 'compromis', version,
  derniereModification: { auteurId, prenom, libelle: `${prenom}@x.fr` } });
const vendue = { ...base, id: 2, libelle: 'VENDUE / ACQUISE', statut: 'vendue', annee: 2026, mois: 3, version: 30, derniereModification: null };
const pasAMoi = { ...base, id: 9, libelle: 'PAS À MOI', statut: 'compromis', version: 5, mesCotes: [] };
let ventes: unknown[];
let empreinte: { status: number; valeur: string };
let appels: { url: string; methode: string; corps?: Record<string, unknown> }[];
let container: HTMLDivElement;
let root: Root;
const compteur = (ids: number[]) => ({ nb: ids.length, ids, ca: { htC: 0, ttcC: 0 } });
beforeEach(() => {
  ventes = [compromis(41), vendue, pasAMoi]; empreinte = { status: 200, valeur: 'E1' }; appels = [];
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, methode: init?.method ?? 'GET', ...(init?.body ? { corps: JSON.parse(String(init.body)) } : {}) });
    if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: null }) };
    // l'empreinte du serveur : celle des affaires telles qu'elles sont MAINTENANT (la même fonction que le serveur)
    if (u.startsWith(URL_EMPREINTE)) return { ok: empreinte.status === 200, status: empreinte.status, json: async () => ({ etat: 'ok', data: { empreinte: empreinteDe(ventes as never) } }) };
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, aujourdhui: '2026-11-02', titulaire: { id: 5, prenom: 'Léa', administrateur: false }, ventes,
      schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true },
      compteurs: { compromis: compteur([1]), actees: { ...compteur([2]), annee: 2026 }, parAnnee: [{ ...compteur([2]), annee: 2026 }] } } }) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const texte = (sel: string): string => (document.querySelector(sel)?.textContent ?? '').replace(/\s/g, ' ');
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); };
const lecturesAffaires = (): number => appels.filter((a) => a.url.startsWith(URL_MES_AFFAIRES)).length;
const attendre = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await calmer(); };
const posts = () => appels.filter((a) => a.methode === 'POST');

describe('🔴 les gestes depuis « Mon espace »', () => {
  it('« Acte signé » : la date, la confirmation dans la page, puis l’envoi avec la version ; la liste est relue', async () => {
    await ouvrir();
    await cliquer('[data-ma-vente="1"] button[data-deplier]');
    await cliquer('[data-acte-signe-mon-espace="1"]');
    expect(texte('[data-confirmation-acte="1"] [role="status"]')).toBe('Valider l’acte signé du 02/11/2026 pour « DUPONT / MARTIN » ?');
    expect(posts()).toEqual([]);
    const avant = lecturesAffaires();
    await act(async () => { (container.querySelector('[data-confirmation-acte="1"]') as HTMLFormElement).requestSubmit(); });
    await calmer();
    expect(posts().map((p) => [p.url, p.corps])).toEqual([[URL_GESTE, { id: 1, version: 41, geste: 'acte-signe', dateActe: '2026-11-02' }]]);
    expect(lecturesAffaires()).toBe(avant + 1);
  });
  it('« Annuler le compromis » : la fenêtre de la tuile (motif), envoyée à « Mon espace » ; « Abandonner » un acte : rien n’est envoyé', async () => {
    await ouvrir();
    await cliquer('[data-ma-vente="1"] button[data-deplier]');
    await cliquer('[data-acte-signe-mon-espace="1"]');
    await cliquer('[data-abandonner-geste]');
    await cliquer('[data-annuler-mon-espace="1"]');
    expect(document.querySelector('[data-modale-annulation="1"]')).not.toBeNull();
    await act(async () => { (document.querySelector('[data-confirmer-annulation]') as HTMLElement).click(); });
    await calmer();
    expect(posts().map((p) => p.corps)).toEqual([{ geste: 'compromis-annuler', id: 1, version: 41, annulation: { motif: 'defaut_credit', autre: '', date: '2026-11-02', note: '' } }]);
  });
  it('« Mes ventes » : « Revenir en compromis », confirmé dans la page', async () => {
    await ouvrir();
    await cliquer('[data-compteur="actees"]');
    await cliquer('[data-ma-vente="2"] button[data-deplier]');
    expect(container.querySelector('[data-acte-signe-mon-espace="2"]')).toBeNull();
    await cliquer('[data-retour-mon-espace="2"]');
    expect(texte('[data-confirmation-retour="2"] [role="status"]')).toBe('Remettre « VENDUE / ACQUISE » en compromis en cours ? L’acte ne sera plus compté dans le CA.');
    await cliquer('[data-confirmer-retour-mon-espace]');
    expect(posts().map((p) => p.corps)).toEqual([{ id: 2, version: 30, geste: 'retour-compromis' }]);
  });
});

describe('🔴 le rafraîchissement automatique', () => {
  it('un changement survenu AVANT le premier battement n’est pas perdu (la référence = les affaires chargées)', async () => {
    await ouvrir();
    ventes = [compromis(48, 7, 'Marc'), vendue, pasAMoi];
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await calmer();
    expect(texte('[data-mise-a-jour]')).toContain('Marc a mis à jour « DUPONT / MARTIN »');
  });
  it('un geste de Marc apparaît chez Léa sans rechargement manuel : « Marc a mis à jour … », la ligne éclairée, puis plus éclairée', async () => {
    await ouvrir();
    await attendre(15_000);
    const avant = lecturesAffaires();
    // rien n'a changé : aucune relecture
    await attendre(15_000);
    expect(lecturesAffaires()).toBe(avant);
    // Marc signe : la version de l'affaire avance, l'empreinte change
    ventes = [compromis(55, 7, 'Marc'), vendue, pasAMoi];
    await attendre(15_000);
    expect(lecturesAffaires()).toBe(avant + 1);
    expect(texte('[data-mise-a-jour]')).toContain('Marc a mis à jour « DUPONT / MARTIN »');
    expect(container.querySelector('[data-eclairee="oui"] [data-ma-vente="1"]')).not.toBeNull();
    await attendre(5_000);
    expect(container.querySelector('[data-eclairee="oui"]')).toBeNull();
  });
  it('mes propres changements ne se disent pas', async () => {
    await ouvrir();
    await attendre(15_000);
    ventes = [compromis(60, 5, 'Léa'), vendue, pasAMoi];
    await attendre(15_000);
    expect(container.querySelector('[data-mise-a-jour]')).toBeNull();
  });
  it('aucune relecture pendant une saisie (acte ouvert) ; la saisie fermée, la relecture se fait', async () => {
    await ouvrir();
    await attendre(15_000);
    await cliquer('[data-ma-vente="1"] button[data-deplier]');
    await cliquer('[data-acte-signe-mon-espace="1"]');
    const avant = lecturesAffaires();
    ventes = [compromis(70, 7, 'Marc'), vendue, pasAMoi];
    await attendre(45_000);
    expect(lecturesAffaires()).toBe(avant);
    expect(container.querySelector('[data-confirmation-acte="1"]')).not.toBeNull();
    await cliquer('[data-abandonner-geste]');
    await attendre(15_000);
    expect(lecturesAffaires()).toBe(avant + 1);
  });
  it('session expirée (401) : « reconnectez-vous » ; une autre panne (500) : aucun message', async () => {
    empreinte = { status: 500, valeur: '' };
    await ouvrir();
    await attendre(15_000);
    expect(container.querySelector('[data-reconnexion]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    empreinte = { status: 401, valeur: '' };
    await attendre(15_000);
    expect(texte('[data-reconnexion]')).toContain('reconnectez-vous');
  });
  it('au retour sur l’onglet : l’empreinte est relue tout de suite', async () => {
    await ouvrir();
    const n = appels.filter((a) => a.url.startsWith(URL_EMPREINTE)).length;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await calmer();
    expect(appels.filter((a) => a.url.startsWith(URL_EMPREINTE)).length).toBe(n + 1);
  });
});

describe('aucun geste sans le droit d’agir (bouton absent ; le serveur refuse aussi : 403)', () => {
  it('sans droit : le composant des gestes ne rend RIEN ; avec : « Acte signé » et « Annuler le compromis »', async () => {
    const rendre = async (peutAgir: boolean) => { await act(async () => { root.render(createElement(GestesAffaire, { v: pasAMoi as never, aujourdhui: '2026-11-02', peutAgir,
      onFait: () => {}, onOccupe: () => {} })); }); };
    await rendre(false);
    expect(container.innerHTML).toBe('');
    await rendre(true);
    expect([container.querySelector('[data-acte-signe-mon-espace="9"]') !== null, container.querySelector('[data-annuler-mon-espace="9"]') !== null]).toEqual([true, true]);
  });
});
