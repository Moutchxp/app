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
  window.localStorage.removeItem('trx-fusion-couts-mode'); window.localStorage.removeItem('trx-fusion-net-mode');
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
      const loc = { ca: centimes(texte('[data-location-ca]')), net: centimes(texte('[data-location-net]')), couts: centimes(texte('[data-location-couts]')) };
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois', () => createElement(EcranGestion));
      const v = (k: string) => centimes(texte(`[data-tuile-valeur="${k}"]`));
      const ges = { ca: v('gestion-honoraires'), net: v('gestion-net'), couts: v('gestion-adhoc') + v('gestion-monga') + v('gestion-salaries') };
      await ouvrir('/?vue=mois&annee=2026&mois=9&vue-mois=mois');
      const [ca, couts, net] = ['[data-fusion-ca]', '[data-fusion-couts]', '[data-fusion-net]'].map((s) => centimes(texte(s)));
      expect([ca, couts, net]).toEqual([loc.ca + ges.ca, loc.couts + ges.couts, loc.net + ges.net]);
      expect(net).toBe(ca - couts);
      expect(texte('[data-fusion-ca-parts]')).toContain('dont location');
      expect(texte('[data-fusion-volume]')).toBe('1 bail · 300 lots');
      expect(document.querySelector('[data-fusion-couts]')!.className).toContain('trx-rouge');
      // la fenêtre « Coûts par famille » : total = tuile 3 ; les familles
      await cliquer('[data-tuile="fusion-couts"]');
      expect(grand('[data-fenetre-couts-fusion] [data-fenetre-total]')).toBe(couts);
      expect(['[data-sous-total-location="primes"]', '[data-sous-total-location="apporteurs"]', '[data-sous-total-fusion="adhoc"]', '[data-sous-total-fusion="monga"]', '[data-sous-total-fusion="salaries"]']
        .reduce((s, x) => s + grand(x), 0)).toBe(couts);
      await cliquer('[data-fermer-fenetre]');
      // la fenêtre « CA net » : ordre comptable, total = tuile 4 ; dont location + dont gestion = total
      await cliquer('[data-tuile="fusion-net"]');
      expect(grand('[data-fenetre-net-fusion] [data-fenetre-total]')).toBe(net);
      expect(grand('[data-net-fusion-ca]') - grand('[data-net-fusion-couts]')).toBe(net);
      expect(grand('[data-net-fusion-location-net]') + grand('[data-net-fusion-gestion-net]')).toBe(net);
      expect([grand('[data-net-fusion-location-net]'), grand('[data-net-fusion-gestion-net]')]).toEqual([loc.net, ges.net]);
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
    await cliquer('[data-activite="gestion"]'); const gg = lire();
    expect([0, 1, 2].map((i) => l[i] + gg[i])).toEqual(deux);
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
    expect(texte('[data-tuile-n1="fusion-ca"]')).toBe('Toutes les années (2025 → 2026)');
    const lignesT = [...document.querySelectorAll('[data-bloc="tableau-fusion"] [data-rangee-fusion]')];
    expect(lignesT.map((r) => r.getAttribute('data-rangee-fusion'))).toEqual(['2025', '2026']);
    expect(lignesT.reduce((s, r) => s + centimes(r.querySelector('[data-mot="Total CA"]')!.textContent!), 0)).toBe(centimes(texte('[data-fusion-ca]')));
    expect(document.querySelector('[data-deplier="histoire-fusion"]')).not.toBeNull();
  });
  it('la page : l’écran, sous le droit « Transaction » (plus « En construction »)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/transaction/location-gestion/fusion/page.tsx', 'utf8');
    expect([src.includes('<EcranFusionLocationGestion />'), src.includes('accesTransaction()'), src.includes('EnConstruction')]).toEqual([true, true, false]);
  });
});
