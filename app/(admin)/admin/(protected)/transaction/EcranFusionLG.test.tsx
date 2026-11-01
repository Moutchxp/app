// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { EcranFusionLocationGestion } from './EcranFusionLG';
import { EcranLocationCA } from './EcranLocationCA';
import { EcranGestion } from './EcransTransaction';
import { ligneLocationCa, type LigneLocationCa } from '../../../../lib/transaction/locationCa';
import type { ActiviteLue } from '../../../../lib/location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../../../../lib/location/suivi/suivi';
import type { GestionMois } from '../../../../lib/transaction/modele';

/**
 * 🔴 LOT LG1 — l'écran « FUSION Location & Gestion » (routes simulées, lecture seule) : ouverture sur « Année » de l'année en cours ; les quatre
 * tuiles (tuile 4 = tuile 1 − tuile 3, chaque part = la tuile de sa page d'origine, rendue à côté sur les mêmes données) ; « Activité » ; les deux
 * fenêtres (total = tuile) ; le Résultat ; le tableau (total = somme, « — » d'un mois de gestion non saisi) ; « L'année » › « Tout ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const apporteurs: Apporteur[] = [{ id: 7, nom: 'Agence Martin', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false }];
let n = 0;
const a = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2026-09-12', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 500, honoLocataireHt: 400.05,
  primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [{ id: 3, libelle: 'Appartement — 12 rue des Lilas Puteaux' }], locataires: [], ...o,
} as ActiviteLue);
const lignes: LigneLocationCa[] = [a({ mandatGestion: true, avecGestion: true, apporteurId: 7, apporteurNom: 'Agence Martin' }), a({ dateSignature: '2026-08-03' }), a({ dateSignature: '2025-09-01', honoProprietaireHt: 300 })]
  .map((x) => ligneLocationCa(x, { regles, apporteurs }));
const g = (annee: number, mois: number, o: Partial<GestionMois>): GestionMois => ({ id: annee * 100 + mois, annee, mois, nbLots: 300, honorairesHt: 18000.07, adhocHt: 2914.8, mongaHt: 12.34,
  salarieHt: 2688.91, resteHt: 12384.02, note: null, origine: 'saisie', ...o } as GestionMois);
const gestion = [g(2026, 9, {}), g(2026, 8, { mongaHt: null, nbLots: 310 }), g(2025, 9, { honorairesHt: 17000 })];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.localStorage.setItem('trx-affichage-montants', 'ht');
  window.localStorage.removeItem('trx-fusion-couts-mode'); window.localStorage.removeItem('trx-fusion-net-mode'); window.localStorage.removeItem('trx-fusion-salaires');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: String(url).includes('vue=location')
    ? { disponible: true, aujourdhui: '2026-11-01', lignes } : { disponible: true, aujourdhui: '2026-11-01', ventes: [], gestion, location: null, monga: true } }) })) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const ouvrir = async (q: string, ecran: () => ReturnType<typeof createElement> = () => createElement(EcranFusionLocationGestion)) => {
  act(() => { root.unmount(); }); root = createRoot(container);
  window.history.replaceState(null, '', q); await act(async () => { root.render(ecran()); }); await calmer();
};
const cliquer = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const texte = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
/** 🔴 LOT LG3 — les catégories des fenêtres sont fermées à l'ouverture : les ouvrir avant de lire leurs lignes. */
const deplierCategories = async () => { for (const b of [...document.querySelectorAll<HTMLButtonElement>('[data-deplier-categorie][aria-expanded="false"]')]) await act(async () => { b.click(); }); };
const grand = (sel: string): number => centimes(texte(`${sel} strong`));

describe('🔴 LOT LG1 — FUSION Location & Gestion', () => {
  it('sans paramètre : « Le mois » sur « Année » 2026 ; pas de filtre Négociateur, la ligne « détail par négociateur » vers la Location', async () => {
    await ouvrir('/');
    expect(document.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode')).toBe('annee');
    expect(texte('[data-tuile="fusion-ca"] .tdb-tuile-mot')).toContain('CA brut — 2026');
    expect(document.querySelector('[data-filtre="negociateur"]')).toBeNull();
    expect(texte('[data-note-negociateur]')).toBe('Le détail par négociateur est sur la page Location.');
  });
  for (const u of ['ht', 'ttc'] as const) {
    it(`septembre 2026 (${u.toUpperCase()}) : chaque part = la tuile de sa page d’origine ; tuile 4 = tuile 1 − tuile 3 ; fenêtres = tuiles`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      // les pages d'origine, sur les mêmes données
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois', () => createElement(EcranLocationCA));
      // 🔴 LOT LO13 — le « CA net d'apporteurs » a quitté la tuile : il est dans la fenêtre « CA net »
      await cliquer('[data-tuile="location-net"]');
      const loc = { ca: centimes(texte('[data-location-ca]')), net: centimes(texte('[data-location-net]')), couts: centimes(texte('[data-location-couts]')),
        netApporteurs: centimes(texte('[data-location-net-apporteurs] strong')) };
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois', () => createElement(EcranGestion));
      const v = (k: string) => centimes(texte(`[data-tuile-valeur="${k}"]`));
      const ges = { ca: v('gestion-honoraires'), net: v('gestion-net'), couts: v('gestion-adhoc') + v('gestion-monga') + v('gestion-salaries') };
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois');
      const [ca, couts, net] = ['[data-fusion-ca]', '[data-fusion-couts]', '[data-fusion-net]'].map((s) => centimes(texte(s)));
      // 🔴 LOT LG4 — « Avec salaires » : les primes sont dans les salaires de la gestion — la location AVANT primes (son CA net d'apporteurs)
      expect([ca, couts, net]).toEqual([loc.ca + ges.ca, loc.ca - loc.netApporteurs + ges.couts, loc.netApporteurs + ges.net]);
      expect(loc.netApporteurs - loc.net).toBeGreaterThan(0); // les primes du mois
      expect(net).toBe(ca - couts);
      expect(texte('[data-fusion-volume]')).toBe('1 bail · 300 lots');
      expect(document.querySelector('[data-fusion-couts]')!.className).toContain('trx-rouge');
      // 🔴 LOT LG5 — la fenêtre « CA brut » : dont location · gestion (l'ancienne ligne de la tuile), location + gestion = CA brut
      await cliquer('[data-tuile="fusion-ca"]');
      expect(texte('[data-fusion-ca-parts]')).toContain('dont location');
      expect([grand('[data-sous-total-ca-fusion="location"]') + grand('[data-sous-total-ca-fusion="gestion"]'), grand('[data-fenetre-ca-fusion] [data-fenetre-total]')]).toEqual([ca, ca]);
      expect([grand('[data-sous-total-ca-fusion="location"]'), grand('[data-sous-total-ca-fusion="gestion"]')]).toEqual([loc.ca, ges.ca]);
      await cliquer('[data-fermer-fenetre]');
      // la fenêtre « Coûts par famille » : total = tuile 3 ; les familles
      await cliquer('[data-tuile="fusion-couts"]'); await deplierCategories();
      // 🔴 LOT LO11 — le mois a des salaires (gestion) : primes et variable montrés, « inclus dans les salaires », non déduits (🔴 LOT LG5 : dans la fenêtre)
      expect(centimes(texte('[data-famille-tuile="primes"]'))).toBe(0);
      expect(texte('[data-fusion-inclus]')).toContain('inclus dans les salaires');
      expect(texte('[data-famille-tuile="salaries"]')).toContain('salaires gestion');
      expect(grand('[data-fenetre-couts-fusion] [data-fenetre-total]')).toBe(couts);
      expect(['[data-sous-total-location="primes"]', '[data-sous-total-location="apporteurs"]', '[data-sous-total-fusion="variable"]', '[data-sous-total-fusion="salairesLocation"]',
        '[data-sous-total-fusion="adhoc"]', '[data-sous-total-fusion="monga"]', '[data-sous-total-fusion="salaries"]'].reduce((s, x) => s + grand(x), 0)).toBe(couts);
      await cliquer('[data-fermer-fenetre]');
      // la fenêtre « CA net » : ordre comptable, total = tuile 4 ; dont location + dont gestion = total
      await cliquer('[data-tuile="fusion-net"]'); await deplierCategories();
      expect(grand('[data-fenetre-net-fusion] [data-fenetre-total]')).toBe(net);
      expect(grand('[data-net-fusion-ca]') - grand('[data-net-fusion-couts]')).toBe(net);
      expect(grand('[data-net-fusion-location-net]') + grand('[data-net-fusion-gestion-net]')).toBe(net);
      expect([grand('[data-net-fusion-location-net]'), grand('[data-net-fusion-gestion-net]')]).toEqual([loc.netApporteurs, ges.net]);
      expect(texte('[data-ligne-net-fusion="primes"]')).toContain('inclus dans les salaires');
      await cliquer('[data-mode-fenetre="transaction"]');
      expect(grand('[data-net-mois="2026-9"]')).toBe(net);
    });
  }
  it('« Activité » : Location + Gestion = Les deux (CA, coûts, net) ; gardé dans l’adresse', async () => {
    await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=annee');
    const lire = () => ['[data-fusion-ca]', '[data-fusion-couts]', '[data-fusion-net]'].map((s) => centimes(texte(s)));
    const deux = lire();
    await cliquer('[data-activite="location"]'); const l = lire();
    expect(new URLSearchParams(window.location.search).get('activite')).toBe('location');
    await cliquer('[data-tuile="fusion-couts"]'); // 🔴 LOT LG5 — les familles sont dans la fenêtre « Coûts »
    const primes = centimes(texte('[data-famille-tuile="primes"]')); const variable = centimes(texte('[data-famille-tuile="variable"]'));
    await cliquer('[data-fermer-fenetre]');
    await cliquer('[data-activite="gestion"]'); const gg = lire();
    // 🔴 LOT LO11 — la location seule (la page Location) déduit primes et variable ; les deux, les mois avec salaires de gestion, ne les déduisent pas
    expect([l[0] + gg[0], l[1] + gg[1] - primes - variable, l[2] + gg[2] + primes + variable]).toEqual(deux);
    expect([primes, variable > 0]).toEqual([15000, true]);
    expect(texte('[data-fusion-volume]')).toBe('305 lots en moyenne');
  });
  it('le Résultat de l’activité ; le tableau mois par mois : total = somme, « — » d’un mois de gestion non saisi (compté 0), les liens vers les pages d’origine', async () => {
    await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=annee');
    expect(centimes(texte('[data-resultat-fusion="net"]'))).toBe(centimes(texte('[data-fusion-net]')));
    expect(centimes(texte('[data-resultat-fusion="location-net"]')) + centimes(texte('[data-resultat-fusion="gestion-net"]'))).toBe(centimes(texte('[data-fusion-net]')));
    expect(texte('[data-rangee-fusion="2026-1"] [data-mot="Gestion CA"]')).toBe('—');
    const lignesT = [...document.querySelectorAll('[data-rangee-fusion]')];
    expect(lignesT.reduce((s, r) => s + centimes(r.querySelector('[data-mot="Total net"]')!.textContent!), 0)).toBe(centimes(texte('[data-total-fusion] [data-mot="Total net"]')));
    expect(centimes(texte('[data-total-fusion] [data-mot="Total CA"]'))).toBe(centimes(texte('[data-fusion-ca]')));
    expect(texte('[data-gestion-non-saisie]')).toContain('9 mois de gestion non saisis') // janvier → juillet, octobre, novembre (le mois en cours compte, comme sur la page Gestion);
    expect(document.querySelector('[data-lien-origine="location"]')!.getAttribute('href')).toBe('/admin/transaction/location?vue=mois&annee=2026&mois=9&vue-mois=annee');
    expect(document.querySelector('[data-lien-origine="gestion"]')!.getAttribute('href')).toBe('/admin/transaction/gestion?vue=mois&annee=2026&mois=9&vue-mois=annee');
  });
  it('« L’année » › « Tout » : sans N−1 ; « Toute l’histoire » ; Tout = la somme des années', async () => {
    await ouvrir('/?vue=annee&annee=2026&vue-annee=tout');
    expect(texte('[data-tuile-n1="fusion-volume"]')).toBe('Toutes les années (2025 → 2026)');
    await cliquer('[data-tuile="fusion-ca"]'); // 🔴 LOT LG5 — N−1 du CA brut : dans la fenêtre
    expect([texte('[data-repere-n1="ca"]'), document.querySelectorAll('[data-repere-ca-mois]').length]).toEqual(['Toutes les années (2025 → 2026)', 2]);
    expect([...document.querySelectorAll('[data-repere-ca-mois] strong')].reduce((x, n) => x + centimes(n.textContent!), 0)).toBe(centimes(texte('[data-fusion-ca]')));
    await cliquer('[data-fermer-fenetre]');
    const lignesT = [...document.querySelectorAll('[data-bloc="tableau-fusion"] [data-rangee-fusion]')];
    expect(lignesT.map((r) => r.getAttribute('data-rangee-fusion'))).toEqual(['2025', '2026']);
    expect(lignesT.reduce((s, r) => s + centimes(r.querySelector('[data-mot="Total CA"]')!.textContent!), 0)).toBe(centimes(texte('[data-fusion-ca]')));
    expect(document.querySelector('[data-deplier="histoire-fusion"]')).not.toBeNull();
  });
  for (const u of ['ht', 'ttc'] as const) {
    it(`🔴 LOT LG2 (${u.toUpperCase()}) — « Sans salaires » : coûts − salaires, CA net + salaires, titres « hors salaires », la même définition partout ; le choix n’ouvre pas la fenêtre`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois');
      const lire = () => ['[data-fusion-ca]', '[data-fusion-couts]', '[data-fusion-net]'].map((x) => centimes(texte(x)));
      const [ca, couts, net] = lire();
      expect(document.querySelector('[data-salaires="avec"]')!.getAttribute('aria-pressed')).toBe('true');
      expect(new URLSearchParams(window.location.search).get('salaires')).toBe('avec');
      await cliquer('[data-salaires="sans"]');
      expect(document.querySelector('[data-fenetre-couts-fusion]')).toBeNull(); // le choix n'ouvre pas la fenêtre
      const salaires = 268891; // septembre : 2 688,91 € (sans TVA : le même en HT et en TTC)
      // 🔴 LOT LO11 — primes et variable : inclus dans les salaires en « Avec » (mois avec salaires), déduits en « Sans »
      await cliquer('[data-tuile="fusion-couts"]'); // 🔴 LOT LG5 — les familles sont dans la fenêtre « Coûts »
      const primes = (u === 'ht' ? 15000 : 18000) + centimes(texte('[data-famille-tuile="variable"]'));
      expect(texte('[data-famille-tuile="salaries"]')).toContain('salaires gestion (non comptés)'); // 🔴 LOT LO11 — deux familles de salaires (location, gestion)
      expect(document.querySelector('[data-famille-tuile="salaries"]')!.className).toContain('loc-muet');
      await cliquer('[data-fermer-fenetre]');
      expect(lire()).toEqual([ca, couts - salaires + primes, net + salaires - primes]);
      expect(texte('[data-tuile="fusion-couts"] .tdb-tuile-mot')).toContain('Coûts hors salaires — septembre 2026');
      expect(texte('[data-tuile="fusion-net"] .tdb-tuile-mot')).toContain('CA net hors salaires — septembre 2026');
      expect([new URLSearchParams(window.location.search).get('salaires'), window.localStorage.getItem('trx-fusion-salaires')]).toEqual(['sans', 'sans']);
      // le Résultat, le tableau, le graphique
      expect(centimes(texte('[data-resultat-fusion="net"]'))).toBe(net + salaires - primes);
      expect(document.querySelector('[data-resultat-fusion="salaries"]')!.closest('dd')!.className).toContain('loc-muet');
      expect(centimes(texte('[data-rangee-fusion="2026-9"] [data-mot="Total net"]'))).toBe(net + salaires - primes);
      await cliquer('[data-mesure-bouton="couts"]');
      expect(texte('[data-bloc="histogramme-mois"] h3')).toContain('Coûts hors salaires');
      // les fenêtres : salaires en gris, non comptés / non déduits ; totaux = tuiles
      await cliquer('[data-tuile="fusion-couts"]'); await deplierCategories();
      expect(texte('[data-fenetre-couts-fusion] h2')).toBe('Coûts hors salaires par famille — septembre 2026');
      expect(grand('[data-fenetre-couts-fusion] [data-fenetre-total]')).toBe(couts - salaires + primes);
      expect(texte('[data-categorie-fusion="salaries"] [data-titre-categorie]')).toContain('non comptés');
      await cliquer('[data-fermer-fenetre]');
      await cliquer('[data-tuile="fusion-net"]'); await deplierCategories();
      expect(grand('[data-fenetre-net-fusion] [data-fenetre-total]')).toBe(net + salaires - primes);
      expect(texte('[data-ligne-net-fusion="salaries"]')).toContain('non déduite');
      expect(grand('[data-net-fusion-ca]') - grand('[data-net-fusion-couts]')).toBe(net + salaires - primes);
      await cliquer('[data-fermer-fenetre]');
      // retour « Avec salaires » : les chiffres d'avant
      await cliquer('[data-salaires="avec"]');
      expect(lire()).toEqual([ca, couts, net]);
    });
  }
  it('🔴 LOT LG2 — le choix retenu dans le navigateur ; l’adresse l’emporte (&salaires=avec) ; la tuile s’ouvre au clavier', async () => {
    window.localStorage.setItem('trx-fusion-salaires', 'sans');
    await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois');
    expect(document.querySelector('[data-salaires="sans"]')!.getAttribute('aria-pressed')).toBe('true');
    await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois&salaires=avec');
    expect(document.querySelector('[data-salaires="avec"]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { document.querySelector('[data-tuile="fusion-couts"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(document.querySelector('[data-fenetre-couts-fusion]')).not.toBeNull();
  });
  for (const [u, sal] of [['ht', 'avec'], ['ttc', 'sans']] as const) {
    it(`🔴 LOT LG3 (${u.toUpperCase()}, ${sal} salaires) — « Coûts par famille » : chaque catégorie FERMÉE à l’ouverture (triangle, nom, sous-total) ; un clic l’ouvre, un autre la ferme ; plusieurs ouvertes ; totaux inchangés ; rien de retenu`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir(`/?vue=mois&annee=2026&mois=9&vue-mois=mois&salaires=${sal}`);
      const couts = centimes(texte('[data-fusion-couts]'));
      await cliquer('[data-tuile="fusion-couts"]');
      const boutons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-fenetre-couts-fusion] [data-deplier-categorie]')];
      expect(boutons().map((b) => [b.getAttribute('data-deplier-categorie'), b.getAttribute('aria-expanded'), b.tagName, b.getAttribute('type')]))
        // 🔴 LOT LG4 — « Avec salaires » : pas de catégorie « Primes » (dans les salaires)
        // 🔴 LOT LO11 — primes (de retour, « inclus » les mois avec salaires), variable et salaires de la location
        .toEqual(['primes', 'apporteurs', 'variable', 'salairesLocation', 'adhoc', 'monga', 'salaries'].map((k) => [k, 'false', 'BUTTON', 'button']));
      expect(document.querySelectorAll('[data-fenetre-couts-fusion] [data-detail-categorie]')).toHaveLength(0);
      expect(boutons().every((b) => b.querySelector('.svv-triangle-boite') !== null && b.querySelector('[data-titre-categorie]') !== null)).toBe(true);
      // les sous-totaux restent sur la ligne fermée ; total haut = total bas = tuile
      const sous = ['[data-sous-total-location="primes"]', '[data-sous-total-location="apporteurs"]', '[data-sous-total-fusion="variable"]', '[data-sous-total-fusion="adhoc"]', '[data-sous-total-fusion="monga"]']
        .reduce((x, y) => x + grand(y), 0) + (sal === 'avec' ? grand('[data-sous-total-fusion="salaries"]') + grand('[data-sous-total-fusion="salairesLocation"]') : 0);
      expect([sous, grand('[data-fenetre-couts-fusion] [data-fenetre-total]'), centimes(texte('[data-fenetre-couts-fusion] [data-fenetre-total-haut] strong'))]).toEqual([couts, couts, couts]);
      // un clic ouvre, plusieurs ouvertes, un nouveau clic ferme
      await cliquer('[data-deplier-categorie="adhoc"]');
      await cliquer('[data-deplier-categorie="apporteurs"]');
      expect([...document.querySelectorAll('[data-detail-categorie]')].map((x) => x.getAttribute('data-detail-categorie'))).toEqual(['apporteurs', 'adhoc']);
      expect(document.querySelector('[data-ligne-fusion="adhoc-2026-9"]')).not.toBeNull();
      expect(document.querySelector('[data-deplier-categorie="adhoc"]')!.getAttribute('aria-expanded')).toBe('true');
      await cliquer('[data-deplier-categorie="adhoc"]');
      expect([...document.querySelectorAll('[data-detail-categorie]')].map((x) => x.getAttribute('data-detail-categorie'))).toEqual(['apporteurs']);
      expect(grand('[data-fenetre-couts-fusion] [data-fenetre-total]')).toBe(couts);
      // rien n'est retenu : refermée puis rouverte, la fenêtre a tout fermé
      await cliquer('[data-fermer-fenetre]');
      await cliquer('[data-tuile="fusion-couts"]');
      expect(document.querySelectorAll('[data-detail-categorie]')).toHaveLength(0);
      await cliquer('[data-fermer-fenetre]');
      // « CA net » : CA brut et coûts fermés ; = CA net et ses « dont » toujours visibles
      await cliquer('[data-tuile="fusion-net"]');
      expect([...document.querySelectorAll('[data-fenetre-net-fusion] [data-deplier-categorie]')].map((b) => [b.getAttribute('data-deplier-categorie'), b.getAttribute('aria-expanded')])).toEqual([['ca', 'false'], ['couts', 'false']]);
      expect(grand('[data-net-fusion-ca]') - grand('[data-net-fusion-couts]')).toBe(grand('[data-fenetre-net-fusion] [data-fenetre-total]'));
      expect(document.querySelector('[data-net-fusion-location-net]')).not.toBeNull();
      // « Par mois » : inchangé (ouvert)
      await cliquer('[data-mode-fenetre="transaction"]');
      expect(document.querySelectorAll('[data-fenetre-net-fusion] [data-deplier-categorie]')).toHaveLength(0);
      expect(document.querySelector('[data-net-mois="2026-9"]')).not.toBeNull();
    });
  }
  it('la page : l’écran, sous le droit « Transaction » (plus « En construction »)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/transaction/location-gestion/fusion/page.tsx', 'utf8');
    expect([src.includes('<EcranFusionLocationGestion />'), src.includes('accesTransaction()'), src.includes('EnConstruction')]).toEqual([true, true, false]);
  });
});

/**
 * 🔴 LOT LG5 — tuiles épurées (Le mois / L'année) ; la fenêtre « CA brut » (nouvelle) ; les fenêtres « Coûts » et « CA net » portent ce qui a quitté
 * leurs tuiles (familles, « inclus dans les salaires », dont location · gestion, N−1), en HT et en TTC, avec et sans salaires.
 */
describe('🔴 LOT LG5 — FUSION : tuiles épurées, fenêtre « CA brut »', () => {
  const tuiles = () => [...document.querySelectorAll('[data-ecran-fusion-tuiles] .tdb-tuile')].map((t) => [t.getAttribute('data-tuile'),
    [...t.children].filter((x) => !x.matches('style')).map((x) => x.className.split(' ')[0])]);
  afterEach(() => { window.localStorage.removeItem('trx-fusion-ca-mode'); window.localStorage.removeItem('trx-fusion-salaires'); window.localStorage.setItem('trx-affichage-montants', 'ht'); });
  for (const q of ['/?vue=mois&annee=2026&mois=9&vue-mois=mois', '/?vue=annee&annee=2026', '/?vue=mois&annee=2026&mois=9&vue-mois=periode&periode=2026-08,2026-09']) {
    it(`titre, montant, parenthèse (Volume : N−1) et « Voir le détail » seulement — ${q}`, async () => {
      await ouvrir(q);
      const garde = ['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-montant-autre', 'tdb-tuile-n1'];
      expect(tuiles()).toEqual([['fusion-ca', garde], ['fusion-volume', garde], ['fusion-couts', ['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-montant-autre', 'trx-tuile-choix', 'tdb-tuile-n1']], ['fusion-net', garde]]); // 🔴 LOT LG6
      for (const x of ['[data-fusion-ca-parts]', '[data-fusion-cumul]', '[data-fusion-volume-detail]', '[data-fusion-couts-familles]', '[data-fusion-inclus]', '[data-fusion-net-parts]',
        '[data-tuile-n1="fusion-ca"]', '[data-tuile-n1="fusion-couts"]', '[data-tuile-n1="fusion-net"]']) expect([x, document.querySelector(x)]).toEqual([x, null]);
      expect([...document.querySelectorAll('[data-voir-detail-fusion]')].map((x) => x.getAttribute('data-voir-detail-fusion'))).toEqual(['ca', 'couts', 'net']);
    });
  }
  for (const u of ['ht', 'ttc'] as const) {
    it(`septembre 2026 (${u.toUpperCase()}) : la fenêtre « CA brut » — location + gestion = CA brut ; cumul, même période un an plus tôt ; Par mois`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois');
      const ca = centimes(texte('[data-fusion-ca]'));
      // la référence : le cumul = la période janvier → septembre ; un an plus tôt = septembre 2025 (les tuiles de ces pages, mêmes totaux)
      await cliquer('[data-tuile="fusion-ca"]');
      expect(texte('[data-fenetre-ca-fusion] h2')).toBe('CA brut — septembre 2026');
      await cliquer('[data-mode-fenetre="categorie"]');
      expect(grand('[data-sous-total-ca-fusion="location"]') + grand('[data-sous-total-ca-fusion="gestion"]')).toBe(ca);
      expect(texte('[data-fusion-ca-parts]')).toMatch(/^dont location .* · gestion /);
      expect(texte('[data-fusion-cumul-mot]')).toBe('Cumul 2026 à fin septembre');
      const cumul = grand('[data-fusion-cumul]'); const n1 = grand('[data-repere-n1="ca"]');
      await cliquer('[data-mode-fenetre="transaction"]');
      expect(grand('[data-ca-mois="2026-9"]')).toBe(ca);
      await cliquer('[data-fermer-fenetre]');
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=periode&periode=2026-01,2026-02,2026-03,2026-04,2026-05,2026-06,2026-07,2026-08,2026-09');
      expect(centimes(texte('[data-fusion-ca]'))).toBe(cumul);
      await ouvrir('/?vue=mois&annee=2025&mois=9&vue-mois=mois');
      expect(centimes(texte('[data-fusion-ca]'))).toBe(n1);
    });
  }
  it('Sans salaires : « Coûts » porte les familles (salaires non comptés) et N−1 ; « CA net » dont location · gestion et N−1', async () => {
    await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois&salaires=sans');
    await cliquer('[data-tuile="fusion-couts"]');
    expect([texte('[data-fenetre-couts-fusion] [data-famille-tuile="salaries"]'), texte('[data-fenetre-couts-fusion] [data-tuile-n1="fusion-couts"]')])
      .toEqual([expect.stringContaining('(non comptés)'), expect.stringContaining('en 2025')]);
    await cliquer('[data-fermer-fenetre]');
    const net = centimes(texte('[data-fusion-net]'));
    await cliquer('[data-tuile="fusion-net"]');
    const parts = texte('[data-fenetre-net-fusion] [data-fusion-net-parts]').match(/dont location (.*) · gestion (.*)/)!;
    expect(centimes(parts[1]) + centimes(parts[2])).toBe(net);
    expect(texte('[data-fenetre-net-fusion] [data-tuile-n1="fusion-net"]')).toContain('en 2025');
  });
});

/**
 * 🔴 LOT LG6 — les trois tuiles qui portent « Avec salaires | Sans salaires » (Location « Coûts », Gestion « Salaires chargés », FUSION « Coûts ») :
 * titre, explication, montant, montant converti, PUIS le sélecteur (sa rangée propre de la grille alignée : rangée 4), puis N−1 et « Voir le détail » ;
 * un clic dans le sélecteur n'ouvre rien. (L'alignement au pixel est mesuré dans Chrome : rapport du lot.)
 */
describe('🔴 LOT LG6 — le sélecteur sous le montant, dans sa rangée propre', () => {
  const ecrans = [
    { nom: 'Location', tuile: 'location-couts', ecran: () => createElement(EcranLocationCA) },
    { nom: 'Gestion', tuile: 'gestion-salaries', ecran: () => createElement(EcranGestion) },
    { nom: 'FUSION', tuile: 'fusion-couts', ecran: () => createElement(EcranFusionLocationGestion) },
  ];
  afterEach(() => { window.localStorage.removeItem('trx-fusion-salaires'); window.localStorage.setItem('trx-affichage-montants', 'ht'); });
  for (const e of ecrans) for (const q of ['/?vue=mois&annee=2026&mois=9&vue-mois=mois', '/?vue=annee&annee=2026']) for (const sal of ['avec', 'sans']) for (const u of ['ht', 'ttc'] as const) {
    it(`${e.nom} — ${q} — ${sal} salaires — ${u.toUpperCase()}`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir(`${q}&salaires=${sal}`, e.ecran);
      const t = document.querySelector(`[data-tuile="${e.tuile}"]`)!;
      const ordre = [...t.children].map((x) => x.className.split(' ')[0]);
      expect(ordre.slice(0, 4)).toEqual(['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-montant-autre', 'trx-tuile-choix']);
      expect([t.querySelector('.tdb-tuile-mot [data-salaires-choix]'), t.querySelector(':scope > [data-tuile-choix] [data-salaires-choix]')!.getAttribute('data-salaires-choix')]).toEqual([null, sal]);
      expect(t.closest('ul')!.classList.contains('trx-tuiles-choix')).toBe(true);
      // la grille : le sélecteur dans la rangée 4 de toutes les tuiles de la liste ; N−1 en 5 ; « Voir le détail » en 7
      const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
      for (const r of ['ul.trx-tuiles-alignees.trx-tuiles-choix>li{grid-row:span 7}', 'ul.trx-tuiles-alignees.trx-tuiles-choix .tdb-tuile>.trx-tuile-choix{grid-row:4;',
        'ul.trx-tuiles-alignees.trx-tuiles-choix .tdb-tuile>.tdb-tuile-n1{grid-row:5}', 'ul.trx-tuiles-alignees.trx-tuiles-choix .tdb-tuile>.tdb-tuile-n1.trx-tuile-voir{grid-row:7}']) expect(css).toContain(r);
      // un clic dans le sélecteur : le choix change, aucune fenêtre ne s'ouvre
      await cliquer(`[data-tuile="${e.tuile}"] [data-salaires="${sal === 'avec' ? 'sans' : 'avec'}"]`);
      expect([document.querySelector('[role="dialog"]'), new URLSearchParams(window.location.search).get('salaires')]).toEqual([null, sal === 'avec' ? 'sans' : 'avec']);
    });
  }
});
