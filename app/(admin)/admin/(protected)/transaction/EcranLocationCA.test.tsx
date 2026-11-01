// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { EcranLocationCA, lienSuiviDuMois, oublierTriEspaceLocation } from './EcranLocationCA';
import { ligneLocationCa, type LigneLocationCa } from '../../../../lib/transaction/locationCa';
import type { ActiviteLue } from '../../../../lib/location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../../../../lib/location/suivi/suivi';

/**
 * 🔴 LOT LO1 — l'écran « Suivi Chiffre d'affaires › Location » (route simulée, lecture seule) : les quatre tuiles (tuile 4 = tuile 1 − tuile 3), la
 * ligne « cumul », N−1, « Compter », le filtre Négociateur (2 : une série chacun), les cartes (détail, « Ouvrir dans Location », jour non connu),
 * le Résultat = l'Espace, « L'année » › « Tout » et « Toute l'histoire ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const apporteurs: Apporteur[] = [{ id: 7, nom: 'Agence Martin', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false }];
let n = 0;
const a = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2025-09-12', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 500, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [{ id: 3, libelle: 'Appartement — 12 rue des Lilas Puteaux' }], locataires: [], ...o,
});
// au 27/10/2025 : août 2025 (1), septembre 2025 (3 : un avec gestion + prime + apporteur, un sans, un mandat seul de Mélanie), septembre 2024 (N−1)
const lignes: LigneLocationCa[] = [
  a({ dateSignature: '2025-08-05', honoProprietaireHt: 200, honoLocataireHt: 100 }),
  a({ dateSignature: '2025-09-02', mandatGestion: true, avecGestion: true, apporteurId: 7, apporteurNom: 'Agence Martin', dateSupposee: true }),
  a({ dateSignature: '2025-09-15', libelleProprietaire: 'LEROY', lots: [{ id: 4, libelle: 'Parking — 3 rue Haute Courbevoie' }], honoProprietaireHt: 50, honoLocataireHt: 50 }),
  a({ dateSignature: '2025-09-20', type: 'gestion_seule', honoProprietaireHt: 0, honoLocataireHt: 0, mandatGestion: true, negociateurId: 8, negociateurLibelle: 'Mélanie' }),
  a({ dateSignature: '2024-09-10', honoProprietaireHt: 300, honoLocataireHt: 300 }),
].map((x) => ligneLocationCa(x, { regles, apporteurs }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.localStorage.setItem('trx-affichage-montants', 'ht');
  window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=9');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, aujourdhui: '2025-10-27', lignes } }) })) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-10-27T10:00:00Z'));
  oublierTriEspaceLocation();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const ouvrir = async (q: string) => { window.history.replaceState(null, '', q); await act(async () => { root.render(createElement(EcranLocationCA)); }); await calmer(); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);

describe('🔴 LOT LO1 — « Location » : Le mois', () => {
  for (const u of ['ht', 'ttc'] as const) {
    it(`septembre 2025 (${u.toUpperCase()}) : les quatre tuiles, leurs explications, la ligne « cumul », N−1 ; tuile 4 = tuile 1 − tuile 3 au centime`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir('/?vue=mois&annee=2025&mois=9');
      const f = u === 'ht' ? 1 : 1.2;
      expect([...container.querySelectorAll('.tdb-tuiles > li > .tdb-tuile')].map((t) => t.getAttribute('data-tuile'))).toEqual(['location-ca', 'location-baux', 'location-couts', 'location-net']);
      expect(texte('[data-tuile="location-ca"] .tdb-tuile-mot')).toBe('CA brut — septembrehonoraires de location encaissés');
      expect(texte('[data-tuile="location-net"] [data-tuile-explication-location]')).toBe('CA − primes et rétrocessions versées');
      // CA : 900 + 100 + 0 ; coûts : primes 150 + 150 (les deux mandats de gestion) + apporteur 90
      const [ca, couts, net] = ['[data-location-ca]', '[data-location-couts]', '[data-location-net]'].map((s) => centimes(texte(s)));
      expect([ca, couts, net]).toEqual([Math.round(1000 * f * 100), Math.round(390 * f * 100), Math.round(610 * f * 100)]);
      expect(net).toBe(ca - couts);
      // 🔴 LOT LO5 — sous le CA net : le « CA net d'apporteurs » du Suivi annuel (CA − apporteurs : 1 000 − 90), le même chiffre
      expect(texte('[data-location-net-apporteurs]')).toBe(`CA net d’apporteurs : ${u === 'ht' ? '910 €' : '1 092 €'}`);
      expect(texte('[data-location-nb]')).toBe('3');
      expect(texte('[data-location-mandats]')).toBe('dont 1 mandat de gestion seul');
      expect(container.querySelector('[data-location-couts]')!.className).toContain('trx-rouge');
      expect(container.querySelector('[data-location-net]')!.className).toContain('trx-vert');
      expect(texte('[data-location-cumul]')).toBe(`cumul 2025 à fin septembre : ${u === 'ht' ? '1 300 €' : '1 560 €'}`);
      expect(texte('[data-tuile-n1="location-ca"]')).toContain(`${u === 'ht' ? '600 €' : '720 €'} en 2024`);
      expect(texte('[data-location-parts]')).toBe(u === 'ht' ? 'dont propriétaire 550 € · locataire 450 €' : 'dont propriétaire 660 € · locataire 540 €');
    });
  }
  it('« Compter » : Avec gestion | Sans gestion | Mandat seul = une partition exacte de « Tous » ; gardé dans l’adresse', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    const lire = () => [Number(texte('[data-location-nb]')), centimes(texte('[data-location-ca]')), centimes(texte('[data-location-net]'))];
    const tous = lire();
    const parts: number[][] = [];
    for (const c of ['avec', 'sans', 'gestion_seule']) { await cliquer(`[data-compter="${c}"]`); parts.push(lire()); expect(new URLSearchParams(window.location.search).get('compter')).toBe(c); }
    expect([0, 1, 2].map((k) => parts.reduce((x, p) => x + p[k], 0))).toEqual(tous);
    expect(parts.map((p) => p[0])).toEqual([1, 1, 1]);
  });
  it('les cartes : une par ligne ; dépliée, le détail en lecture seule, « jour non connu », « Ouvrir dans Location » vers le Suivi du mois', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    expect(texte('[data-bloc="baux-location"] h3')).toBe('Les baux de septembre 2025');
    expect(texte('[data-bloc="baux-location"] [data-compteur-liste]')).toBe('(3)');
    const id = lignes[1].id;
    expect(texte(`[data-carte-bail="${id}"] [data-etiquette-gestion]`)).toBe('avec gestion');
    expect(texte(`[data-carte-bail="${id}"] [data-carte="signature"]`)).toBe('signé en septembre 2025');
    await cliquer(`[data-carte-bail="${id}"] [data-deplier]`);
    expect(texte(`[data-detail-bail="${id}"] [data-jour-non-connu]`)).toBe(' — jour non connu');
    expect(container.querySelector(`[data-ouvrir-location="${id}"]`)!.getAttribute('href')).toBe('/admin/location/outils/mois?annee=2025&mois=9');
    expect(lienSuiviDuMois({ annee: 2026, mois: 10 })).toBe('/admin/location/outils/mois?annee=2026&mois=10');
    expect(container.querySelectorAll('[data-detail-bail] input, [data-detail-bail] button')).toHaveLength(0); // aucune édition ici
  });
  it('le Résultat (CA brut − primes − rétrocessions = CA net) = la ligne de total de l’Espace par négociateur ; tri CA net', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    expect(centimes(texte('[data-resultat-net]'))).toBe(61000);
    await cliquer('[data-deplier="negociateurs-location"]');
    expect(centimes(texte('[data-total-espace-net]'))).toBe(centimes(texte('[data-resultat-net]')));
    await cliquer('[data-entete-tri="net"] [data-tri="net"]');
    expect([...container.querySelectorAll('[data-negociateur-location]')].map((x) => x.getAttribute('data-negociateur-location'))).toEqual(['Jean-Baptiste PONS', 'Mélanie']);
  });
  it('deux négociateurs : une série chacun (barres groupées), les tuiles sur la sélection', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9&negociateur=Jean-Baptiste%20PONS&negociateur=M%C3%A9lanie');
    expect(container.querySelectorAll('[data-bloc="histogramme-mois"] [data-barre-serie]').length).toBeGreaterThan(0);
    expect(texte('[data-location-nb]')).toBe('3');
  });
});

describe('🔴 LOT LO1 — « Location » : L’année', () => {
  it('Tout : « toutes les années », sans N−1 ; « Toute l’histoire » année par année ; une année s’ouvre', async () => {
    await ouvrir('/?vue=annee&annee=2025&vue-annee=tout');
    expect(texte('[data-tuile="location-ca"] .tdb-tuile-mot')).toContain('CA brut — toutes les années');
    expect(texte('[data-tuile-n1="location-ca"]')).toBe('Toutes les années (2024 → 2025)');
    await cliquer('[data-deplier="histoire-location"]');
    expect([...container.querySelectorAll('[data-annee-location]')].map((x) => [x.getAttribute('data-annee-location'), texte(`[data-histoire-ca="${x.getAttribute('data-annee-location')}"]`)]))
      .toEqual([['2024', '600 €'], ['2025', '1 300 €']]);
  });
  it('l’année 2025 = la somme de ses mois ; le même composant de ligne des années que la vente', async () => {
    await ouvrir('/?vue=annee&annee=2025');
    expect(centimes(texte('[data-location-ca]'))).toBe(130000);
    expect(container.querySelector('.trx-rangee-annees [data-decouper-annees="tout"]')).not.toBeNull();
  });
});

describe('🔴 LOT LO1 — la page et la lecture', () => {
  it('la page Location rend l’écran (plus « En construction »), sous le droit « Transaction » ; la route lit le Suivi sans rien écrire', () => {
    const page = readFileSync('app/(admin)/admin/(protected)/transaction/location/page.tsx', 'utf8');
    expect([page.includes('<EcranLocationCA />'), page.includes('accesTransaction()'), page.includes('EnConstruction')]).toEqual([true, true, false]);
    const lue = readFileSync('app/lib/transaction/locationLue.ts', 'utf8');
    expect(/INSERT|UPDATE|DELETE/.test(lue)).toBe(false);
    expect(readFileSync('app/(admin)/api/admin/transaction/route.ts', 'utf8')).toContain("if (vue === 'location') return json({ etat: 'ok', data: { aujourdhui, ...(await lireLocationCa()) } });");
  });
});
