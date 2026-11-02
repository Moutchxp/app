// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { compteursAgence, statistiquesAgence } from '../../../../lib/mon-espace/agence';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE — les onglets du Suivi CA (« Compromis | Mois | Année(s) ») et l'onglet « Année(s) », dans le VRAI écran, routes simulées :
 * « Compromis » par défaut (?vue=), la rangée des années (Année | Période | Tout, barres rouges), une année s'ouvre d'un clic, « Mois par mois »
 * de l'année et un mois qui ouvre l'onglet « Mois » ; les tuiles = « Mes statistiques » ; mode agence : le graphique du Suivi CA. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-02';
const z = { htC: 0, ttcC: 0 };
const m = (ht: number) => ({ htC: ht, ttcC: Math.round(ht * 1.2) });
const mois12 = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => (vals[i + 1] === undefined ? z : m(vals[i + 1])));
const nb12 = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => vals[i + 1] ?? 0);
let jourDonnees = JOUR; // le « aujourd'hui » du serveur simulé
const perso = (administrateur: boolean) => ({ disponible: true, aujourdhui: jourDonnees, titulaire: { id: 5, prenom: 'Léa', administrateur }, ventes: [],
  compteurs: { compromis: { nb: 1, ids: [], ca: m(500000) }, actees: { nb: 0, ids: [], annee: 2026, ca: z }, parAnnee: [] },
  statistiques: { annees: [
    { annee: 2024, ca: mois12({ 5: 200000 }), nb: nb12({ 5: 1 }), aConfirmer: z, aConfirmerNb: 0 },
    { annee: 2025, ca: mois12({ 3: 300000 }), nb: nb12({ 3: 1 }), aConfirmer: z, aConfirmerNb: 0 },
    { annee: 2026, ca: mois12({ 3: 600000, 6: 500000 }), nb: nb12({ 3: 1, 6: 1 }), aConfirmer: m(200000), aConfirmerNb: 1 }] }, retrocessions: [] });
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `AFFAIRE ${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: null, sourceLigne: id, lignes: [], double: null, version: id, ...o });
const VENTES = [vente(1, {}), vente(2, { annee: 2025, mois: 4, honorairesTtc: 6000 })];
const dA = { societe: 'macj' as const, ventes: VENTES, retrocessions: [], statutsNegociateurs: {} };
const agence = () => ({ ...perso(true), ventes: VENTES.map((v) => ({ ...v, mesCotes: [], commissionsRetirees: false })), compteurs: compteursAgence(dA, JOUR),
  statistiques: statistiquesAgence(dA, JOUR), statutsNegociateurs: {}, agence: { cle: 'macj', societe: 'macj' } });
let admin: boolean;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); // l'adresse (?vue=…) que l'écran écrit, comme la Transaction : chaque épreuve repart de zéro
  admin = false; jourDonnees = JOUR;
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_EMPREINTE)) return ok({ empreinte: '#0' });
    if (u.startsWith(`${URL_MES_AFFAIRES}?agence=`)) return ok(agence());
    if (u.startsWith(URL_MES_AFFAIRES)) return ok(perso(admin));
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
// un clic DOM (les barres du graphique sont du SVG, sans `.click()`)
const cliquer = async (sel: string) => { await act(async () => { container.querySelector(sel)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const euros = (t: string): number => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
const rendre = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); };
const ouvrirAnnees = async () => { await rendre(); await cliquer('[data-vue="annee"]'); };
const choisies = () => [...container.querySelectorAll('.trx-rangee-annees [data-onglet-annee]')].filter((b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-pressed') === 'true')
  .map((b) => b.getAttribute('data-onglet-annee'));

describe('🔴 les onglets du Suivi CA dans « Mon espace »', () => {
  it('« Compromis » par défaut ; « Mois » et « Année(s) » écrivent l’adresse comme la Transaction (?vue=mois, ?vue=annee)', async () => {
    await rendre();
    expect(container.querySelector('[data-vue="compromis"]')?.getAttribute('aria-selected')).toBe('true');
    await cliquer('[data-vue="mois"]');
    expect(new URLSearchParams(window.location.search).get('vue')).toBe('mois');
    await cliquer('[data-vue="annee"]');
    expect(new URLSearchParams(window.location.search).get('vue')).toBe('annee');
    await cliquer('[data-vue="compromis"]');
    expect(new URLSearchParams(window.location.search).get('vue')).toBeNull();
  });
  it('une adresse ?vue=annee rouvre « Année(s) »', async () => {
    window.history.replaceState(null, '', '/?vue=annee');
    await rendre();
    expect(container.querySelector('[data-vue="annee"]')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-annees-mon-espace]')).not.toBeNull();
  });
});

describe('🔴 l’onglet « Année(s) »', () => {
  it('Année (défaut) : l’année en cours ; ses tuiles = « Mes statistiques » (Année), N−1 = 2025', async () => {
    await ouvrirAnnees();
    expect(container.querySelector('[data-decouper-annees="annee"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(choisies()).toEqual(['2026']);
    expect([...container.querySelectorAll('.trx-rangee-annees [data-onglet-annee]')].map((b) => b.getAttribute('data-onglet-annee'))).toEqual(['2024', '2025', '2026']);
    expect(euros(texte('[data-valeur-tuile="ca-annee"]'))).toBe(13000);
    expect(texte('[data-valeur-tuile="nombre-annee"]')).toBe('3');
    expect(texte('[data-tuile-n1="ca"]')).toContain('en 2025');
    expect(euros(texte('[data-valeur-tuile="previsionnel"]'))).toBe(5000);
  });
  it('une année de la rangée la choisit ; Période : deux années additionnées ; Tout : toutes, sans N−1', async () => {
    await ouvrirAnnees();
    await cliquer('.trx-rangee-annees [data-onglet-annee="2025"]');
    expect(euros(texte('[data-valeur-tuile="ca-annee"]'))).toBe(3000);
    await cliquer('.trx-rangee-annees [data-onglet-annee="2026"]');
    expect(euros(texte('[data-valeur-tuile="ca-annee"]'))).toBe(13000);
    await cliquer('[data-decouper-annees="periode"]');
    await cliquer('.trx-rangee-annees [data-onglet-annee="2025"]');
    expect(choisies()).toEqual(['2025', '2026']);
    expect(euros(texte('[data-valeur-tuile="ca-annee"]'))).toBe(16000);
    expect(container.querySelector('[data-bloc="graphe-annees"]')?.getAttribute('data-periode-annees')).toBe('2025,2026');
    await cliquer('[data-decouper-annees="tout"]');
    expect(euros(texte('[data-valeur-tuile="ca-annee"]'))).toBe(18000);
    expect(texte('[data-tuile-n1="ca"]')).toContain('Toutes les années (2024 → 2026)');
  });
  it('« Mois par mois — 2026 » : le graphique de l’année ; un mois ouvre l’onglet « Mois » sur ce mois', async () => {
    await ouvrirAnnees();
    await cliquer('[data-echelle="mois"]');
    // le graphique « Mois par mois » de la page du Suivi CA (`GrapheMois`), sur mes chiffres
    expect(container.querySelector('[data-bloc="histogramme-mois"]')).not.toBeNull();
    await cliquer('[data-bloc="histogramme-mois"] [data-barre-mois="3"]');
    expect(container.querySelector('[data-vue="mois"]')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.trx-rangee-mois:not(.trx-rangee-annees)')?.getAttribute('data-decoupage')).toBe('mois');
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-mot')).toBe('CA HT — mars');
  });
  it('l’écart sous la rangée des années et des mois : les classes de la page d’une structure du Suivi CA (tdb loc-page)', async () => {
    await ouvrirAnnees();
    expect(container.querySelector('[data-annees-mon-espace]')?.className).toContain('tdb loc-page');
    await cliquer('[data-vue="mois"]');
    expect(container.querySelector('[data-accueil-mon-espace]')?.className).toContain('tdb loc-page');
  });
  it('mode agence : les tuiles de « L’année » (CA net) et le graphique « Année par année » du Suivi CA (avec « CA net »)', async () => {
    admin = true;
    await rendre();
    await cliquer('[data-espace="macj"]');
    await cliquer('[data-vue="annee"]');
    expect(container.querySelector('[data-tuile="ca-net-annee"]')).not.toBeNull();
    expect(container.querySelector('[data-tuile="mes-compromis"]')).toBeNull();
    expect(container.querySelector('[data-bloc="graphe-annees"] [data-mesure-bouton="net"]')?.textContent).toBe('CA net');
    expect(euros(texte('[data-valeur-tuile="ca-annee"]'))).toBe(10000);
  });
});

describe('🔴 décision 14 — les anciennes adresses des onglets retirés', () => {
  it('?vue=ventes / ?vue=statistiques → « Mois » (jamais une page vide) ; les autres : la règle de la Transaction', async () => {
    const { vueDArrivee } = await import('./MesCompteurs');
    expect([vueDArrivee('ventes', false), vueDArrivee('statistiques', false), vueDArrivee('annee', false), vueDArrivee(null, false)]).toEqual(['mois', 'mois', 'annee', 'compromis']);
    window.history.replaceState(null, '', '/?vue=statistiques');
    await rendre();
    expect(container.querySelector('[data-vue="mois"]')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-accueil-mon-espace]')).not.toBeNull();
  });
});

describe('🔴 Arno (03/11/2026) — l’onglet « Mois » : l’année en cours, janvier → mois en cours soulignés', () => {
  const soulignes = () => [...container.querySelectorAll('.trx-rangee-mois:not(.trx-rangee-annees) [data-onglet-mois][aria-pressed="true"]')].map((b) => Number(b.getAttribute('data-onglet-mois')));
  const anneeVue = () => texte('[data-tuile="cumul"] .tdb-tuile-mot');
  it('« Année(s) » sur 2025, puis l’onglet « Mois » de la barre : 2026, « Année », janvier → novembre soulignés, décembre non', async () => {
    await ouvrirAnnees();
    await cliquer('.trx-rangee-annees [data-onglet-annee="2025"]');
    expect(new URLSearchParams(window.location.search).get('annee')).toBe('2025');
    await cliquer('[data-vue="mois"]');
    expect(anneeVue()).toContain('cumulé 2026');
    expect(container.querySelector('[data-decouper="annee"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(soulignes()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new URLSearchParams(window.location.search).get('annee')).toBe('2026');
  });
  it('une adresse de « Année(s) » (?vue=annee&annee=2025) rechargée : « Mois » ne l’hérite pas (2026)', async () => {
    window.history.replaceState(null, '', '/?vue=annee&annee=2025');
    await rendre();
    await cliquer('[data-vue="mois"]');
    expect(anneeVue()).toContain('cumulé 2026');
  });
  it('la barre 2025 du graphique « Année par année » : « Mois » sur 2025, ses 12 mois soulignés (une année passée, entière)', async () => {
    await ouvrirAnnees();
    await cliquer('[data-bloc="graphe-annees"] [data-barre-annee="2025"]');
    expect(container.querySelector('[data-vue="mois"]')?.getAttribute('aria-selected')).toBe('true');
    expect(anneeVue()).toContain('cumulé 2025');
    expect(soulignes()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it('arrivée sans paramètre puis « Mois » : 2026 ; mode agence : pareil', async () => {
    await rendre();
    await cliquer('[data-vue="mois"]');
    expect(anneeVue()).toContain('cumulé 2026');
    act(() => { root.unmount(); }); root = createRoot(container); window.history.replaceState(null, '', '/'); admin = true;
    await rendre();
    await cliquer('[data-espace="macj"]');
    await cliquer('[data-vue="annee"]');
    await cliquer('.trx-rangee-annees [data-onglet-annee="2025"]');
    await cliquer('[data-vue="mois"]');
    expect(anneeVue()).toContain('cumulé 2026');
    expect(soulignes()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it.each([['2026-01-15T10:00:00Z', [1]], ['2026-12-10T10:00:00Z', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]] as const)('le %s : les mois soulignés de l’année en cours', async (date, attendus) => {
    vi.setSystemTime(new Date(date)); jourDonnees = date.slice(0, 10);
    await rendre();
    await cliquer('[data-vue="mois"]');
    expect(soulignes()).toEqual([...attendus]);
  });
});
