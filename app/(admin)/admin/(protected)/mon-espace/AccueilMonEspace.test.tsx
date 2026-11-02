// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { compteursAgence, statistiquesAgence } from '../../../../lib/mon-espace/agence';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE — l'accueil au format « Le mois » et « + Nouveau compromis » sur la ligne du sélecteur, dans le VRAI écran, routes simulées :
 * « Année » par défaut ; les tuiles = « Mes statistiques » (vue personnelle) ; 4ᵉ tuile : « Mes compromis en cours » (ma part) ou, en mode agence,
 * « CA net cumulé » et le graphique du Suivi CA ; les compteurs et les onglets restent. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-02';
const z = { htC: 0, ttcC: 0 };
const m = (ht: number) => ({ htC: ht, ttcC: Math.round(ht * 1.2) });
const mois12 = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => (vals[i + 1] === undefined ? z : m(vals[i + 1])));
const nb12 = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => vals[i + 1] ?? 0);
const perso = (administrateur: boolean) => ({ disponible: true, aujourdhui: JOUR, titulaire: { id: 5, prenom: 'Léa', administrateur }, ventes: [],
  compteurs: { compromis: { nb: 2, ids: [], ca: m(750000) }, actees: { nb: 3, ids: [], annee: 2026, ca: m(1300000) }, parAnnee: [] },
  statistiques: { annees: [
    { annee: 2025, ca: mois12({ 3: 300000 }), nb: nb12({ 3: 1 }), aConfirmer: z, aConfirmerNb: 0 },
    { annee: 2026, ca: mois12({ 3: 600000, 6: 500000 }), nb: nb12({ 3: 1, 6: 1 }), aConfirmer: m(200000), aConfirmerNb: 1 }] }, retrocessions: [] });
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `AFFAIRE ${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: null, sourceLigne: id, lignes: [], double: null, version: id, ...o });
const VENTES = [vente(1, { statut: 'compromis', mois: null, dateCompromis: '2026-10-01' }), vente(2, {}), vente(3, { annee: 2025, mois: 4, honorairesTtc: 6000 })];
const dA = { societe: 'macj' as const, ventes: VENTES, retrocessions: [], statutsNegociateurs: {} };
const agence = () => ({ ...perso(true), ventes: VENTES.map((v) => ({ ...v, mesCotes: [], commissionsRetirees: false })), compteurs: compteursAgence(dA, JOUR),
  statistiques: statistiquesAgence(dA, JOUR), statutsNegociateurs: {}, agence: { cle: 'macj', societe: 'macj' } });
let admin: boolean;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); // l'adresse (?vue=…) que l'écran écrit, comme la Transaction : chaque épreuve repart de zéro
  admin = false;
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
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
/** Le montant écrit (« 13 000,00 € », « 13 000 € HT ») en euros. */
const euros = (t: string): number => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
/** L'écran, puis l'onglet « Mois » (l'onglet par défaut est « Compromis », comme la Transaction). */
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-vue="mois"]'); };

describe('🔴 la ligne du sélecteur et l’accueil', () => {
  it('« + Nouveau compromis » est sur la ligne du sélecteur (après lui) ; un collaborateur : le bouton seul sur la ligne', async () => {
    admin = true;
    await ouvrir();
    const ligne = container.querySelector('[data-ligne-espace]')!;
    expect([...ligne.children].map((e) => (e.hasAttribute('data-selecteur-espace') ? 'selecteur' : e.hasAttribute('data-nouveau-compromis-mon-espace') ? 'bouton' : '?'))).toEqual(['selecteur', 'bouton']);
    expect(container.querySelector('.mes-compteurs-tete [data-nouveau-compromis-mon-espace]')).toBeNull();
    act(() => { root.unmount(); }); root = createRoot(container); admin = false;
    await ouvrir();
    expect(container.querySelector('[data-ligne-espace] [data-selecteur-espace]')).toBeNull();
    expect(container.querySelector('[data-ligne-espace] [data-nouveau-compromis-mon-espace]')).not.toBeNull();
  });
  it('« Année » par défaut : la rangée des mois, les mois écoulés soulignés (janvier → novembre)', async () => {
    await ouvrir();
    expect(container.querySelector('.trx-rangee-mois')?.getAttribute('data-decoupage')).toBe('annee');
    expect(container.querySelector('[data-decouper="annee"]')?.getAttribute('aria-pressed')).toBe('true');
    expect([...container.querySelectorAll('[data-onglet-mois][aria-pressed="true"]')].map((b) => b.getAttribute('data-onglet-mois'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  });
  it('vue personnelle : les tuiles = « Mes statistiques » (CA, ventes) ; 4ᵉ tuile « Mes compromis en cours » (ma part) et la projection', async () => {
    await ouvrir();
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-mot')).toBe('CA HT — année');
    const caAccueil = euros(texte('[data-valeur-tuile="ca"]'));
    const nbAccueil = texte('[data-valeur-tuile="nombre"]');
    expect(texte('[data-tuile="cumul"] .tdb-tuile-mot')).toBe('CA HT cumulé 2026 (à fin novembre)');
    expect(euros(texte('[data-valeur-tuile="cumul"]'))).toBe(11000);
    expect(euros(texte('[data-valeur-tuile="previsionnel"]'))).toBe(7500);
    expect(texte('[data-tuile-nb-compromis]')).toBe('2 compromis');
    expect(container.querySelector('[data-tuile="ca-net-cumul"]')).toBeNull();
    await cliquer('[data-onglet-mon-espace="statistiques"]');
    expect(euros(texte('[data-valeur-ca]'))).toBe(caAccueil);
    expect(texte('[data-valeur-nb]')).toBe(nbAccueil);
    expect(caAccueil).toBe(13000);
  });
  it('« Mois » puis mars : les tuiles du mois (= « Mes statistiques », Mois, mars)', async () => {
    await ouvrir();
    await cliquer('[data-decouper="mois"]');
    await cliquer('[data-onglet-mois="3"]');
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-mot')).toBe('CA HT — mars');
    expect(euros(texte('[data-valeur-tuile="ca"]'))).toBe(6000);
    expect(texte('[data-tuile-n1="ca"]')).toContain('en 2025 (+100');
  });
  it('décisions 8, 9 et 11 : ni compteurs ni liste « Année » au-dessus des mois ; les 3 onglets du Suivi CA puis ceux de « Mon espace » (sans « Mes compromis en cours »)', async () => {
    await ouvrir();
    expect(container.querySelectorAll('[data-compteur]').length).toBe(0);
    expect(container.querySelector('[data-accueil-mon-espace] [data-filtre="annee"]')).toBeNull();
    expect([...container.querySelectorAll('.trx-vues [role="tab"]')].map((b) => b.getAttribute('data-vue') ?? b.getAttribute('data-onglet-mon-espace')))
      .toEqual(['compromis', 'mois', 'annee', 'ventes', 'statistiques', 'apporteurs']);
  });
  it('mode agence : 4ᵉ tuile « CA net HT cumulé », le graphique du Suivi CA (avec « CA net »)', async () => {
    admin = true;
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    expect(container.querySelector('[data-tuile="mes-compromis"]')).toBeNull();
    expect(texte('[data-tuile="ca-net-cumul"] .tdb-tuile-mot')).toContain('CA net HT cumulé 2026 (à fin novembre)');
    expect(container.querySelector('[data-bloc="histogramme-mois"]')).not.toBeNull();
    expect(container.querySelector('[data-bloc="histogramme-mois"] [data-mesure-bouton="net"]')?.textContent).toBe('CA net');
    expect(euros(texte('[data-valeur-tuile="ca"]'))).toBe(10000);
  });
  it('la barre d’onglets suit IMMÉDIATEMENT la ligne « Voir … », sur LA MÊME LIGNE que « Montants en HT | TTC » ; décision 10 : plus de phrase', async () => {
    admin = true;
    await ouvrir();
    const ligne = container.querySelector('[data-ligne-espace]')!;
    const suivante = ligne.nextElementSibling!;
    expect(suivante.hasAttribute('data-ligne-onglets')).toBe(true);
    expect([...suivante.children].map((e) => e.className)).toEqual(['trx-barre', 'mes-compteurs-tete']);
    expect(suivante.querySelector('[data-afficher="ttc"]')).not.toBeNull();
    expect(container.querySelector('[data-note-ca]')).toBeNull();
    expect(container.textContent).not.toContain('Le montant est votre CA');
    expect(container.querySelectorAll('.trx-barre [role="tab"]').length).toBe(6);
  });
  it('vue perso : LE graphique du Suivi CA en « Vendu + compromis » (vendu en bas, mes compromis au-dessus) ; mesures CA, CA net (décision 13), Nombre', async () => {
    await ouvrir();
    const g = container.querySelector('[data-bloc="histogramme-mois"]')!;
    expect(g).not.toBeNull();
    expect(g.querySelector('[data-legende-empile]')).not.toBeNull();
    expect([...g.querySelectorAll('[data-mesure-bouton]')].map((b) => b.getAttribute('data-mesure-bouton'))).toEqual(['ca', 'net', 'nombre']);
    // la bascule Mensuel / Cumul
    await cliquer('[data-bloc="histogramme-mois"] [data-cumul-bouton]');
    expect(container.querySelector('[data-bloc="histogramme-mois"] [data-cumul-bouton]')?.getAttribute('data-cumul-etat')).toBe('cumul');
  });
});
