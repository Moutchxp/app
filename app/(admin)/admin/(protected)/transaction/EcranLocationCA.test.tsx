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
/** 🔴 LOT LO13 — les fenêtres sont rendues hors du conteneur : lire et fermer au niveau du document. */
const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const fermer = async () => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer(); };
/** 🔴 LOT LG3 — les catégories des fenêtres sont fermées à l'ouverture : les ouvrir avant de lire leurs lignes. */
const deplierCategories = async () => { for (const b of [...document.querySelectorAll<HTMLButtonElement>('[data-deplier-categorie][aria-expanded="false"]')]) await act(async () => { b.click(); }); };
/** 🔴 LOT LO11 — le variable du négociateur de septembre 2025 (15 % × (900 − 90) + 15 % × 100), sans TVA. */
const VARIABLE_SEPT = 13650;
const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);

describe('🔴 LOT LO1 — « Location » : Le mois', () => {
  for (const u of ['ht', 'ttc'] as const) {
    it(`septembre 2025 (${u.toUpperCase()}) : les quatre tuiles, leurs explications, la ligne « cumul », N−1 ; tuile 4 = tuile 1 − tuile 3 au centime`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir('/?vue=mois&annee=2025&mois=9');
      const f = u === 'ht' ? 1 : 1.2;
      expect([...container.querySelectorAll('.tdb-tuiles > li > .tdb-tuile')].map((t) => t.getAttribute('data-tuile'))).toEqual(['location-ca', 'location-baux', 'location-couts', 'location-net']);
      expect(texte('[data-tuile="location-ca"] .tdb-tuile-mot')).toBe('CA brut — septembrehonoraires de location encaissés');
      expect(texte('[data-tuile="location-net"] [data-tuile-explication-location]')).toBe('CA brut − coûts');
      // CA : 900 + 100 + 0 ; coûts : primes 150 + 150 (les deux mandats de gestion) + apporteur 90 ; 🔴 LOT LO11 — + le variable du négociateur
      // (15 % de la base : 810 → 121,50 ; 100 → 15 ; sans TVA), aucun salaire saisi : tout est déduit
      const [ca, couts, net] = ['[data-location-ca]', '[data-location-couts]', '[data-location-net]'].map((s) => centimes(texte(s)));
      expect([ca, couts, net]).toEqual([Math.round(1000 * f * 100), Math.round(390 * f * 100) + VARIABLE_SEPT, Math.round(1000 * f * 100) - Math.round(390 * f * 100) - VARIABLE_SEPT]);
      expect(net).toBe(ca - couts);
      expect(texte('[data-location-nb]')).toBe('3');
      expect(container.querySelector('[data-location-couts]')!.className).toContain('trx-rouge');
      expect(container.querySelector('[data-location-net]')!.className).toContain('trx-vert');
      // 🔴 LOT LO13 — tuiles épurées : seule la tuile « Baux » garde une ligne (N−1) ; le reste est dans les fenêtres
      expect(texte('[data-tuile-n1="location-baux"]')).toBe('1 en 2024');
      for (const x of ['[data-location-parts]', '[data-location-cumul]', '[data-location-mandats]', '[data-location-couts-detail]', '[data-location-net-apporteurs]', '[data-tuile-n1="location-ca"]', '[data-tuile-n1="location-couts"]', '[data-tuile-n1="location-net"]'])
        expect([x, container.querySelector(x)]).toEqual([x, null]);
      // la fenêtre « CA brut » : les anciennes lignes de la tuile, au centime
      await cliquer('[data-tuile="location-ca"]');
      expect(doc('[data-fenetre-ca-location] h2')).toBe('CA brut — septembre 2025');
      expect(doc('[data-location-parts]')).toBe(u === 'ht' ? 'dont propriétaire 550 € · locataire 450 €' : 'dont propriétaire 660 € · locataire 540 €');
      expect([doc('[data-location-mandats]'), doc('[data-repere-nb]'), doc('[data-repere-nb-n1]')]).toEqual(['1 mandat de gestion seul', '3', '1 en 2024']);
      expect([doc('[data-location-cumul-mot]'), centimes(doc('[data-location-cumul] strong'))]).toEqual(['Cumul 2025 à fin septembre', Math.round(1300 * f * 100)]);
      expect([centimes(doc('[data-repere-n1="ca"] strong')), doc('[data-repere-ecart="ca"]')]).toEqual([Math.round(600 * f * 100), ' +66,7 %']);
      expect(centimes(doc('[data-fenetre-total] strong'))).toBe(ca);
      await fermer();
      // 🔴 LOT LO5 — dans la fenêtre « CA net » : le « CA net d'apporteurs » du Suivi annuel (CA − apporteurs : 1 000 − 90), le même chiffre
      await cliquer('[data-tuile="location-net"]');
      expect([centimes(doc('[data-location-net-apporteurs] strong')), doc('[data-tuile-n1="location-net"]')]).toEqual([Math.round(910 * f * 100), expect.stringContaining('en 2024')]);
      await fermer();
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
    expect(texte('[data-bloc="baux-location"] .lr-titre')).toBe('Les baux de septembre 2025');
    expect(texte('[data-bloc="baux-location"] [data-compteur-liste]')).toBe('(3)');
    const id = lignes[1].id;
    expect(texte(`[data-carte-bail="${id}"] [data-etiquette-gestion]`)).toBe('avec gestion');
    expect(texte(`[data-carte-bail="${id}"] [data-carte="signature"]`)).toBe('signé en septembre 2025');
    await cliquer(`[data-carte-bail="${id}"] [data-deplier]`);
    expect(texte(`[data-detail-bail="${id}"] [data-jour-non-connu]`)).toBe(' — jour non connu');
    expect(container.querySelector(`[data-ouvrir-location="${id}"]`)!.getAttribute('href')).toBe(`/admin/location/outils/mois?annee=2025&mois=9&ligne=${id}`); // 🔴 LOT LO10 — &ligne : la ligne visée
    expect(lienSuiviDuMois({ annee: 2026, mois: 10 })).toBe('/admin/location/outils/mois?annee=2026&mois=10');
    expect(container.querySelectorAll('[data-detail-bail] input, [data-detail-bail] button')).toHaveLength(0); // aucune édition ici
  });
  it('le Résultat (CA brut − apporteurs − primes − variable − salaires = CA net) ; l’Espace par négociateur retire aussi le variable (🔴 LOT LO12) ; tri CA net', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    // 🔴 LOT LO11 — le variable devient un coût : 610 − 136,50
    expect([centimes(texte('[data-resultat-net]')), centimes(texte('[data-resultat-variable]')), centimes(texte('[data-resultat-salaires]'))]).toEqual([61000 - VARIABLE_SEPT, VARIABLE_SEPT, 0]);
    await cliquer('[data-deplier="negociateurs-location"]');
    // 🔴 LOT LO12 — l'Espace retire aussi le variable (mois sans salaires) : son total = le CA net du Résultat
    expect(centimes(texte('[data-total-espace-net]'))).toBe(61000 - VARIABLE_SEPT);
    await cliquer('[data-entete-tri="net"] [data-tri="net"]');
    expect([...container.querySelectorAll('[data-negociateur-location]')].map((x) => x.getAttribute('data-negociateur-location'))).toEqual(['Jean-Baptiste PONS', 'Mélanie']);
  });
  it('deux négociateurs : une série chacun (barres groupées), les tuiles sur la sélection', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9&negociateur=Jean-Baptiste%20PONS&negociateur=M%C3%A9lanie');
    expect(container.querySelectorAll('[data-bloc="histogramme-mois"] [data-barre-serie]').length).toBeGreaterThan(0);
    expect(texte('[data-location-nb]')).toBe('3');
  });
});

/**
 * 🔴 LOT LO6 — les tuiles 3 et 4 ouvrent leur fenêtre (la coque de la vente : croix, Échap, clic hors, « Par bail | Par catégorie » retenu) ; le
 * total de chaque fenêtre = sa tuile au centime ; CA brut − apporteurs − primes = CA net ; le nom d'un bail déplie sa carte ; lecture seule.
 */
describe('🔴 LOT LO6 — les fenêtres « Primes et rétrocessions » et « CA net »', () => {
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const grand = (sel: string): number => centimes(doc(`${sel} strong`));
  // une page neuve (l'état de l'écran — « Compter », négociateurs — part de l'adresse)
  const rouvrir = async (q: string) => { act(() => { root.unmount(); }); root = createRoot(container); await ouvrir(q); };
  afterEach(() => { window.localStorage.removeItem('trx-location-couts-mode'); window.localStorage.removeItem('trx-location-net-mode'); });
  for (const u of ['ht', 'ttc'] as const) {
    it(`septembre 2025 (${u.toUpperCase()}) : tuile 3 → « Primes et rétrocessions — septembre 2025 », total = tuile, 2 baux concernés, primes + apporteurs`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      const f = u === 'ht' ? 1 : 1.2;
      await ouvrir('/?vue=mois&annee=2025&mois=9');
      const tuile = container.querySelector('[data-tuile="location-couts"]')!;
      // 🔴 LOT LO12 — une tuile cliquable qui porte le sélecteur « Avec | Sans salaires » (un bouton ne peut pas contenir de boutons)
      expect([tuile.tagName, tuile.getAttribute('role'), tuile.getAttribute('tabindex')]).toEqual(['DIV', 'button', '0']);
      expect(texte('[data-voir-detail-location="couts"]')).toBe('Voir le détail');
      // la tuile garde montant et explication ; 🔴 LOT LO13 — les familles et N−1 sont dans la fenêtre
      for (const x of ['[data-location-couts]', '[data-tuile-explication-location]']) expect(tuile.querySelector(x)).not.toBeNull();
      await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
      expect([document.querySelector('[data-fenetre-couts-location] [data-location-couts-detail]') !== null, document.querySelector('[data-fenetre-couts-location] [data-tuile-n1="location-couts"]') !== null]).toEqual([true, true]);
      expect(doc('[data-fenetre-couts-location] h2')).toBe('Coûts — septembre 2025');
      expect(grand('[data-fenetre-total]')).toBe(centimes(texte('[data-location-couts]')));
      expect(grand('[data-fenetre-total]')).toBe(Math.round(390 * f * 100) + VARIABLE_SEPT);
      expect(doc('[data-fenetre-couts-location] [data-dossiers]')).toBe('2 baux concernés');
      expect(grand('[data-sous-total-location="primes"]')).toBe(Math.round(300 * f * 100));
      expect(grand('[data-sous-total-location="apporteurs"]')).toBe(Math.round(90 * f * 100));
      expect(grand('[data-sous-total-location="variable"]')).toBe(VARIABLE_SEPT);
      expect(['primes', 'apporteurs', 'variable', 'salaires'].reduce((t, k) => t + grand(`[data-sous-total-location="${k}"]`), 0)).toBe(grand('[data-fenetre-total]'));
      // les primes, du plus récent au plus ancien : le mandat seul de Mélanie (20/09), puis le bail avec gestion (02/09)
      expect([...document.querySelectorAll('[data-ligne-prime]')].map((x) => Number(x.getAttribute('data-ligne-prime')))).toEqual([lignes[3].id, lignes[1].id]);
      expect(doc(`[data-ligne-prime="${lignes[1].id}"] [data-nego]`)).toBe('Jean-Baptiste PONS');
      expect(document.querySelector('[data-sous-total-location="primes"]')!.className).toContain('trx-rouge');
      expect(doc('[data-groupe-apporteur="Agence Martin"] .trx-fc-sous')).toBe('1 bail');
      expect(grand('[data-cumul-apporteur="Agence Martin"]')).toBe(Math.round(90 * f * 100));
      expect(document.querySelectorAll('[data-fenetre-couts-location] input, [data-fenetre-couts-location] textarea, [data-fenetre-couts-location] select')).toHaveLength(0);
      // Par bail : un bloc par bail qui porte un coût, du plus récent au plus ancien ; « Prime » / « Apporteur » ; sous-total par bail
      await cliquerDoc('[data-mode-fenetre="transaction"]');
      expect(doc('[data-mode-fenetre="transaction"]')).toBe('Par bail');
      // 🔴 LOT LO11 — un bail qui ne porte que du variable (15 € sur 100 €) a son bloc
      expect([...document.querySelectorAll('[data-bail-couts]')].map((x) => Number(x.getAttribute('data-bail-couts')))).toEqual([lignes[3].id, lignes[2].id, lignes[1].id]);
      expect([...document.querySelectorAll(`[data-bail-couts="${lignes[1].id}"] [data-etiquette]`)].map((x) => x.textContent)).toEqual(['Prime', 'Apporteur', 'Variable']);
      expect(grand(`[data-verse-bail="${lignes[1].id}"]`)).toBe(Math.round(240 * f * 100) + 12150);
      expect(doc(`[data-bail-couts="${lignes[1].id}"] [data-signe]`)).toBe('Signé en septembre 2025');
      expect([...document.querySelectorAll('[data-verse-bail]')].reduce((t, x) => t + centimes(x.querySelector('strong')!.textContent!), 0)).toBe(grand('[data-fenetre-total]'));
      expect(window.localStorage.getItem('trx-location-couts-mode')).toBe('transaction');
    });
    it(`septembre 2025 (${u.toUpperCase()}) : tuile 4 → « CA net », ordre comptable ; CA brut − apporteurs − primes = CA net = tuile, au centime ; Par bail`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir('/?vue=mois&annee=2025&mois=9');
      expect(container.querySelector('[data-tuile="location-net"]')!.tagName).toBe('BUTTON');
      await cliquer('[data-tuile="location-net"]'); await deplierCategories();
      expect(document.querySelector('[data-fenetre-net-location] [data-location-net-apporteurs]')).not.toBeNull(); // 🔴 LOT LO13 — quitte la tuile
      expect(doc('[data-fenetre-net-location] h2')).toBe('CA net — septembre 2025');
      const corps = document.querySelector('[data-fenetre-net-location] .trx-fc-corps')!;
      expect([...corps.querySelectorAll('[data-net-ca], [data-categorie-location], [data-net-apporteurs], [data-total-net]')].map((x) => x.querySelector('[data-titre-categorie], span')!.textContent))
        .toEqual(['CA brut', '− Commissions d’apporteurs', '= CA net d’apporteurs', '− Primes de nouvelle gestion', '− Variable du négociateur (sans TVA)', '− Salaires chargés (sans TVA)', '= CA net']);
      const ca = grand('[data-net-ca-montant]'); const app = grand('[data-fenetre-net-location] [data-sous-total-location="apporteurs"]');
      const nap = grand('[data-net-apporteurs-montant]'); const pr = grand('[data-fenetre-net-location] [data-sous-total-location="primes"]');
      const net = grand('[data-fenetre-net-location] [data-fenetre-total]');
      expect(ca).toBe(centimes(texte('[data-location-ca]')));
      expect(net).toBe(centimes(texte('[data-location-net]')));
      const vr = grand('[data-fenetre-net-location] [data-sous-total-location="variable"]'); const sa = grand('[data-fenetre-net-location] [data-sous-total-location="salaires"]');
      expect([ca - app, nap - pr - vr - sa, vr]).toEqual([nap, net, VARIABLE_SEPT]);
      expect(doc('[data-net-parts]')).toBe(u === 'ht' ? 'dont propriétaire 550 € HT · locataire 450 € HT' : 'dont propriétaire 660 € TTC · locataire 540 € TTC');
      expect(document.querySelector('[data-net-ca-montant]')!.className).toContain('trx-vert');
      expect(doc('[data-fenetre-net-location] [data-dossiers]')).toBe('3 baux');
      await cliquerDoc('[data-mode-fenetre="transaction"]');
      const blocs = [...document.querySelectorAll('[data-bail-net]')];
      expect(blocs.map((x) => Number(x.getAttribute('data-bail-net')))).toEqual([lignes[3].id, lignes[2].id, lignes[1].id]);
      for (const b of blocs) {
        const id = b.getAttribute('data-bail-net');
        const [c, ap, p, v] = [`[data-ca-bail="${id}"]`, `[data-bail-net="${id}"] [data-cout-bail="apporteur"]`, `[data-bail-net="${id}"] [data-cout-bail="prime"]`,
          `[data-bail-net="${id}"] [data-cout-bail="variable"]`].map(grand);
        expect(c - ap - p - v).toBe(grand(`[data-net-bail="${id}"]`));
      }
      expect(blocs.reduce((t, b) => t + grand(`[data-net-bail="${b.getAttribute('data-bail-net')}"]`), 0)).toBe(net);
    });
  }
  it('un mois sans prime ni apporteur (août 2025) : 0 bail concerné, « Aucune » ; 🔴 LOT LO11 — seul le variable (45 €) ; la fenêtre CA net y tient', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=8');
    await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
    expect(doc('[data-dossiers]')).toBe('0 bail concerné');
    expect(grand('[data-fenetre-total]')).toBe(4500);
    expect([...document.querySelectorAll('[data-aucune]')].map((x) => [x.getAttribute('data-aucune'), x.textContent])).toEqual([['primes', 'Aucune'], ['apporteurs', 'Aucune'], ['salaires', 'Aucun mois saisi']]);
    await cliquerDoc('[data-fermer-fenetre]');
    expect(document.querySelector('[data-fenetre-couts-location]')).toBeNull();
    await cliquer('[data-tuile="location-net"]'); await deplierCategories();
    expect(grand('[data-fenetre-total]')).toBe(30000 - 4500);
    expect(grand('[data-fenetre-total]')).toBe(grand('[data-net-ca-montant]') - 4500);
  });
  it('fermer : Échap, clic hors de la fenêtre ; le nom d’un bail ferme la fenêtre et déplie sa carte dans « Les baux »', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] }); vi.setSystemTime(new Date('2025-10-27T10:00:00Z'));
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('[data-fenetre-couts-location]')).toBeNull();
    await cliquer('[data-tuile="location-net"]'); await deplierCategories();
    await act(async () => { document.querySelector('.trx-fc-voile')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(document.querySelector('[data-fenetre-net-location]')).toBeNull();
    const id = lignes[1].id;
    expect(container.querySelector(`[data-carte-bail="${id}"]`)!.getAttribute('data-replie')).toBe('replie');
    await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
    await cliquerDoc(`[data-ligne-prime="${id}"] [data-aller-bail="${id}"]`);
    await act(async () => { vi.runAllTimers(); });
    expect(document.querySelector('[data-fenetre-couts-location]')).toBeNull();
    expect(container.querySelector(`[data-carte-bail="${id}"]`)!.getAttribute('data-replie')).toBe('ouvert');
  });
  it('les filtres de la page s’appliquent : « Compter » Avec gestion, le négociateur, la période ; L’année', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9&compter=avec');
    await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
    // 🔴 LOT LO11 — + le variable du bail avec gestion (121,50)
    expect([grand('[data-fenetre-total]'), doc('[data-dossiers]')]).toEqual([24000 + 12150, '1 bail concerné']);
    await cliquerDoc('[data-fermer-fenetre]');
    await rouvrir('/?vue=mois&annee=2025&mois=9&negociateur=M%C3%A9lanie');
    await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
    expect([grand('[data-fenetre-total]'), centimes(texte('[data-location-couts]'))]).toEqual([15000, 15000]);
    expect(document.querySelectorAll('[data-groupe-apporteur]')).toHaveLength(0);
    await cliquerDoc('[data-fermer-fenetre]');
    await rouvrir('/?vue=mois&annee=2025&mois=9&vue-mois=periode&periode=2025-08,2025-09');
    await cliquer('[data-tuile="location-net"]'); await deplierCategories();
    expect(texte('[data-bloc="baux-location"] [data-compteur-liste]')).toBe('(4)'); // août + septembre
    expect(grand('[data-fenetre-total]')).toBe(61000 + 30000 - VARIABLE_SEPT - 4500); // 🔴 LOT LO11 — moins le variable des deux mois
    expect(doc('[data-fenetre-net-location] h2')).toBe(`CA net — ${texte('[data-bloc="baux-location"] .lr-titre').replace('Les baux de ', '')}`);
    expect(grand('[data-fenetre-total]')).toBe(centimes(texte('[data-location-net]')));
    await cliquerDoc('[data-fermer-fenetre]');
    await rouvrir('/?vue=annee&annee=2025');
    await cliquer('[data-tuile="location-net"]'); await deplierCategories();
    expect(doc('[data-fenetre-net-location] h2')).toBe('CA net — 2025');
    expect(grand('[data-fenetre-total]')).toBe(centimes(texte('[data-location-net]')));
  });
});

describe('🔴 LOT LO7 — « Le mois » : ouverture sans paramètre sur « Année »', () => {
  const rouvrir = async (q: string) => { act(() => { root.unmount(); }); root = createRoot(container); await ouvrir(q); };
  it('sans paramètre (tuile « Location » de Location & Gestion, menu) : Année 2026, les 12 mois, le cumul de l’année ; le choix de la visite reste', async () => {
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    await ouvrir('/');
    expect(container.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode')).toBe('annee');
    expect(texte('[data-filtre="annee"]')).toContain('2026');
    expect(container.querySelectorAll('[data-onglet-mois][aria-pressed="true"]')).toHaveLength(12);
    expect(texte('[data-tuile="location-ca"] .tdb-tuile-mot')).toContain('CA brut — 2026');
    expect(new URLSearchParams(window.location.search).get('vue-mois')).toBe('annee');
    await cliquer('[data-decouper="mois"]');
    await cliquer('[data-onglet-mois="9"]');
    expect(container.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode')).toBe('mois');
  });
  it('un lien qui précise une vue la garde : &vue-mois=mois, &mois=…, &periode=… ; « L’année » inchangée', async () => {
    for (const [q, attendu] of [['/?vue=mois&annee=2025&vue-mois=mois', 'mois'], ['/?vue=mois&annee=2025&mois=9', 'mois'], ['/?vue=mois&annee=2025&periode=2025-08,2025-09', 'periode'],
      ['/?vue=mois&annee=2025&vue-mois=annee', 'annee']] as const) {
      await rouvrir(q);
      expect([q, container.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode')]).toEqual([q, attendu]);
    }
    await rouvrir('/?vue=annee&annee=2025');
    expect(container.querySelector('[data-vue="annee"]')!.getAttribute('aria-selected')).toBe('true');
  });
});

/**
 * 🔴 LOT LO10 — la liste des baux : plus de 25, REPLIÉE à l'arrivée (une ligne : triangle, titre, compteur, total) ; un clic déplie / replie ;
 * 25 ou moins : ouverte ; le tri et la recherche restent dans l'en-tête ; taper une recherche déplie ; un lien vers un bail déplie la liste et le bail.
 */
describe('🔴 LOT LG3 — fenêtres « Primes et rétrocessions » et « CA net » : catégories fermées à l’ouverture', () => {
  afterEach(() => { window.localStorage.removeItem('trx-location-couts-mode'); window.localStorage.removeItem('trx-location-net-mode'); });
  for (const u of ['ht', 'ttc'] as const) {
    it(`(${u.toUpperCase()}) fermées (nom + sous-total) ; un clic ouvre les baux ; plusieurs ouvertes ; totaux inchangés ; « Par bail » inchangé`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      window.localStorage.removeItem('trx-location-couts-mode'); window.localStorage.removeItem('trx-location-net-mode');
      await ouvrir('/?vue=mois&annee=2025&mois=9');
      const couts = centimes(texte('[data-location-couts]'));
      await act(async () => { (container.querySelector('[data-tuile="location-couts"]') as HTMLElement).click(); }); await calmer();
      expect([...document.querySelectorAll('[data-deplier-categorie]')].map((b) => [b.getAttribute('data-deplier-categorie'), b.getAttribute('aria-expanded')]))
        .toEqual([['primes', 'false'], ['apporteurs', 'false'], ['variable', 'false'], ['salaires', 'false']]); // 🔴 LOT LO11 — variable et salaires
      expect(document.querySelectorAll('[data-ligne-prime], [data-groupe-apporteur]')).toHaveLength(0);
      const sous = (k: string) => centimes(document.querySelector(`[data-sous-total-location="${k}"] strong`)!.textContent!);
      expect(sous('primes') + sous('apporteurs') + sous('variable') + sous('salaires')).toBe(couts);
      await act(async () => { (document.querySelector('[data-deplier-categorie="primes"]') as HTMLElement).click(); });
      await act(async () => { (document.querySelector('[data-deplier-categorie="apporteurs"]') as HTMLElement).click(); });
      expect([document.querySelectorAll('[data-ligne-prime]').length, document.querySelectorAll('[data-groupe-apporteur]').length]).toEqual([2, 1]);
      await act(async () => { (document.querySelector('[data-deplier-categorie="primes"]') as HTMLElement).click(); });
      expect([document.querySelectorAll('[data-ligne-prime]').length, document.querySelectorAll('[data-groupe-apporteur]').length]).toEqual([0, 1]);
      expect(centimes(document.querySelector('[data-fenetre-total] strong')!.textContent!)).toBe(couts);
      await act(async () => { (document.querySelector('[data-mode-fenetre="transaction"]') as HTMLElement).click(); });
      expect([document.querySelectorAll('[data-deplier-categorie]').length, document.querySelectorAll('[data-bail-couts]').length]).toEqual([0, 3]);
    });
  }
});

describe('🔴 LOT LO10 — « Les baux de … » repliée au-delà de 25', () => {
  // juillet 2025 : 30 baux (CA 100 € + i), dont un « Léon » à retrouver
  const juillet = Array.from({ length: 30 }, (_, i) => ligneLocationCa(a({ dateSignature: `2025-07-${String((i % 28) + 1).padStart(2, '0')}`, honoProprietaireHt: 60 + i, honoLocataireHt: 40,
    libelleLocataire: i === 7 ? 'Léon BERNARD' : 'MARTIN', mandatGestion: i === 3, avecGestion: i === 3, apporteurId: i === 3 ? 7 : null, apporteurNom: i === 3 ? 'Agence Martin' : null }), { regles, apporteurs }));
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, aujourdhui: '2025-10-27', lignes: [...lignes, ...juillet] } }) })) as unknown as typeof fetch;
  });
  const entete = () => container.querySelector('[data-deplier-liste="baux-location"]') as HTMLButtonElement;
  for (const u of ['ht', 'ttc'] as const) {
    it(`30 baux (${u.toUpperCase()}) : repliée sur une ligne — triangle, titre, (30), total = somme des cartes ; clic : ouverte, puis repliée`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir('/?vue=mois&annee=2025&mois=7');
      expect(entete().getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[data-bloc="baux-location"]')!.getAttribute('data-replie')).toBe('replie');
      expect(container.querySelectorAll('[data-carte-bail]')).toHaveLength(0);
      expect(entete().querySelector('.svv-triangle-boite')).not.toBeNull();
      expect([texte('[data-bloc="baux-location"] .lr-titre'), texte('[data-bloc="baux-location"] [data-compteur-liste]')]).toEqual(['Les baux de juillet 2025', '(30)']);
      // le tri et la recherche restent visibles, liste repliée
      expect(container.querySelector('[data-choix-tri-liste]')).not.toBeNull();
      expect(container.querySelector('[data-recherche-liste]')).not.toBeNull();
      const totalHt = juillet.reduce((t, l) => t + l.caC.htC, 0); const totalTtc = juillet.reduce((t, l) => t + l.caC.ttcC, 0);
      expect([centimes(texte('[data-total-liste-ht]')), centimes(texte('[data-total-liste-ttc]'))]).toEqual([totalHt, totalTtc]);
      expect(texte('[data-total-liste="baux-location"] [data-montant-grand]')).toContain(u === 'ht' ? 'HT' : 'TTC');
      await cliquer('[data-deplier-liste="baux-location"]');
      expect(entete().getAttribute('aria-expanded')).toBe('true');
      const cartes = [...container.querySelectorAll('[data-carte-bail]')];
      expect(cartes).toHaveLength(30);
      expect(cartes.reduce((t, c) => t + centimes(c.querySelector(u === 'ht' ? '[data-carte="ca-ht"]' : '[data-carte="ca-ttc"]')!.textContent!), 0)).toBe(u === 'ht' ? totalHt : totalTtc);
      await cliquer('[data-deplier-liste="baux-location"]');
      expect(container.querySelectorAll('[data-carte-bail]')).toHaveLength(0);
    });
  }
  it('3 baux (septembre) : ouverte comme avant, repliable d’un clic', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    expect(entete().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('[data-carte-bail]')).toHaveLength(3);
    await cliquer('[data-deplier-liste="baux-location"]');
    expect(container.querySelectorAll('[data-carte-bail]')).toHaveLength(0);
  });
  it('taper une recherche déplie la liste ; le total suit les cartes montrées', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=7');
    const champ = container.querySelector('[data-recherche-liste]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'léon');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await calmer();
    expect(entete().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('[data-carte-bail]')).toHaveLength(1);
    expect(texte('[data-bloc="baux-location"] [data-compteur-liste]')).toBe('(1 sur 30)');
    expect(centimes(texte('[data-total-liste-ht]'))).toBe(juillet[7].caC.htC);
  });
  it('un lien vers un bail (fenêtre « Primes et rétrocessions ») déplie la liste, puis la carte', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] }); vi.setSystemTime(new Date('2025-10-27T10:00:00Z'));
    await ouvrir('/?vue=mois&annee=2025&mois=7');
    expect(entete().getAttribute('aria-expanded')).toBe('false');
    await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
    const id = juillet[3].id;
    await act(async () => { (document.querySelector(`[data-ligne-prime="${id}"] [data-aller-bail="${id}"]`) as HTMLElement).click(); });
    for (let i = 0; i < 5; i++) await act(async () => { vi.advanceTimersByTime(30); });
    expect(entete().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector(`[data-carte-bail="${id}"]`)!.getAttribute('data-replie')).toBe('ouvert');
  });
  it('une autre période : la règle repart (septembre ouvert → juillet replié)', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    expect(entete().getAttribute('aria-expanded')).toBe('true');
    await cliquer('[data-onglet-mois="7"]');
    expect(entete().getAttribute('aria-expanded')).toBe('false');
  });
});

/**
 * 🔴 LOT LO11 — la règle d'Arno, mois par mois : un mois SANS salaires chargés saisis déduit apporteurs + primes + variable ; un mois AVEC salaires
 * déduit apporteurs + salaires (primes et variable montrés, « inclus dans les salaires »). Le tableau mois par mois, la saisie (journalisée), le
 * filtre (salaires non comptés), la base sans la 447 (« Saisir » grisé).
 */
describe('🔴 LOT LO11 — salaires chargés de la Location, variable du négociateur', () => {
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const rouvrir = async (q: string) => { act(() => { root.unmount(); }); root = createRoot(container); await ouvrir(q); };
  const avecSalaires = (salaires: unknown) => {
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, status: 200, json: async () => (init?.method === 'POST' ? { etat: 'ok', data: null }
      : { etat: 'ok', data: { disponible: true, aujourdhui: '2025-10-27', lignes, retrocessions: [], salaires } }) })) as unknown as typeof fetch;
  };
  for (const u of ['ht', 'ttc'] as const) {
    it(`septembre 2025 avec 400 € de salaires saisis (${u.toUpperCase()}) : coûts = apporteurs + salaires ; primes et variable « inclus » ; CA net = CA − coûts`, async () => {
      avecSalaires([{ id: 1, annee: 2025, mois: 9, salairesHt: 400, note: null }]);
      window.localStorage.setItem('trx-affichage-montants', u);
      const f = u === 'ht' ? 1 : 1.2;
      await ouvrir('/?vue=mois&annee=2025&mois=9');
      const [ca, couts, net] = ['[data-location-ca]', '[data-location-couts]', '[data-location-net]'].map((x) => centimes(texte(x)));
      expect([ca, couts, net]).toEqual([Math.round(1000 * f * 100), Math.round(90 * f * 100) + 40000, Math.round(1000 * f * 100) - Math.round(90 * f * 100) - 40000]);
      await cliquer('[data-tuile="location-couts"]');
      expect(doc('[data-location-inclus]')).toContain('inclus dans les salaires'); // 🔴 LOT LO13 — dans la fenêtre « Coûts »
      await fermer();
      expect([centimes(texte('[data-resultat-primes]')), centimes(texte('[data-resultat-variable]')), centimes(texte('[data-resultat-salaires]'))]).toEqual([0, 0, 40000]);
      expect(texte('[data-resultat-location] [data-inclus-salaires]')).toContain('inclus dans les salaires');
      // le tableau : la ligne de septembre — primes et variable montrés, « inclus » ; salaires 400 ; « Modifier »
      const sept = '[data-rangee-location="2025-9"]';
      expect(texte(`${sept} [data-location-primes]`)).toContain('inclus dans les salaires');
      expect(centimes(texte(`${sept} [data-location-salaires]`))).toBe(40000);
      expect(centimes(texte(`${sept} [data-location-net-mois]`))).toBe(net);
      expect(texte(`${sept} [data-saisir-salaires]`)).toBe('Modifier');
      expect(texte('[data-rangee-location="2025-8"] [data-saisir-salaires]')).toBe('Saisir');
      // les fenêtres : total = tuile ; la somme des catégories = le total
      await cliquer('[data-tuile="location-couts"]'); await deplierCategories();
      const g = (sel: string) => centimes(document.querySelector(`${sel} strong`)?.textContent ?? '');
      expect(g('[data-fenetre-total]')).toBe(couts);
      expect(['primes', 'apporteurs', 'variable', 'salaires'].reduce((x, k) => x + g(`[data-sous-total-location="${k}"]`), 0)).toBe(couts);
      expect(document.querySelectorAll('[data-ligne-prime] [data-inclus-salaires]').length).toBe(2);
      await cliquerDoc('[data-fermer-fenetre]');
      await cliquer('[data-tuile="location-net"]'); await deplierCategories();
      expect(g('[data-fenetre-total]')).toBe(net);
      await cliquerDoc('[data-mode-fenetre="transaction"]');
      const blocs = [...document.querySelectorAll('[data-net-bail]')].reduce((x, b) => x + g(`[data-net-bail="${b.getAttribute('data-net-bail')}"]`), 0);
      expect(blocs - 40000).toBe(net); // les baux, moins les salaires (hors bail)
      window.localStorage.removeItem('trx-location-net-mode');
    });
  }
  it('la saisie : « Modifier » ouvre la fenêtre, « Enregistrer » envoie le mois et le montant (HT) ; un filtre : salaires non comptés (mention)', async () => {
    avecSalaires([{ id: 1, annee: 2025, mois: 9, salairesHt: 400, note: null }]);
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    await cliquer('[data-saisir-salaires="2025-9"]');
    const champ = document.querySelector('[data-champ-salaires-location]') as HTMLInputElement;
    expect(champ.value).toBe('400');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, '450,50'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await cliquerDoc('[data-enregistrer-salaires-location]');
    const appel = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(JSON.parse(String(appel[1].body))).toEqual({ action: 'location-salaires-enregistrer', annee: 2025, mois: 9, salaires: { salairesHt: '450,50', note: '' } });
    await rouvrir('/?vue=mois&annee=2025&mois=9&compter=avec');
    expect(texte('[data-filtre-salaires]')).toContain('ne sont pas comptés');
    expect(centimes(texte('[data-location-couts]'))).toBe(24000 + 12150); // sans salaires : apporteur + prime + variable
  });
  it('sans la 447 (salaires null) : « Saisir » grisé, la mention ; la règle « sans salaires » partout', async () => {
    avecSalaires(null);
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    expect((container.querySelector('[data-saisir-salaires="2025-9"]') as HTMLButtonElement).disabled).toBe(true);
    expect(texte('[data-sans-447]')).toContain('migration 447');
    expect(centimes(texte('[data-location-couts]'))).toBe(39000 + VARIABLE_SEPT);
  });
  it('« L’année » : le tableau année par année (2024, 2025) ; total = la somme des années', async () => {
    avecSalaires([]);
    await ouvrir('/?vue=annee&annee=2025&vue-annee=tout');
    const rangs = [...container.querySelectorAll('[data-rangee-location]')];
    expect(rangs.map((r) => r.getAttribute('data-rangee-location'))).toEqual(['2024', '2025']);
    expect(rangs.reduce((x, r) => x + centimes(r.querySelector('[data-location-net-mois]')!.textContent!), 0)).toBe(centimes(texte('[data-total-location] [data-location-net-mois]')));
    expect(container.querySelector('[data-rangee-location] [data-saisir-salaires]')).toBeNull();
  });
});

describe('🔴 LOT LO1 — « Location » : L’année', () => {
  it('Tout : « toutes les années », sans N−1 ; « Toute l’histoire » année par année ; une année s’ouvre', async () => {
    await ouvrir('/?vue=annee&annee=2025&vue-annee=tout');
    expect(texte('[data-tuile="location-ca"] .tdb-tuile-mot')).toContain('CA brut — toutes les années');
    expect(texte('[data-tuile-n1="location-baux"]')).toBe('Toutes les années (2024 → 2025)');
    await cliquer('[data-tuile="location-ca"]'); // 🔴 LOT LO13 — N−1 du CA brut : dans la fenêtre
    expect([doc('[data-repere-n1="ca"]'), document.querySelectorAll('[data-repere-ca-mois]').length]).toEqual(['Toutes les années (2024 → 2025)', 2]);
    await fermer();
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

/**
 * 🔴 LOT LO12 — « Avec salaires | Sans salaires » sur la Location (le composant et la mémoire de la FUSION, &salaires=avec|sans) ; l'Espace par
 * négociateur retire le variable à la règle des mois ; le nom court de la période (liste complète en infobulle) ; l'en-tête des listes repliées.
 */
describe('🔴 LOT LO12 — Location : avec / sans salaires, Espace, période courte, en-tête des listes', () => {
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const rouvrir = async (q: string) => { act(() => { root.unmount(); }); root = createRoot(container); await ouvrir(q); };
  const avecSalaires = (salaires: unknown) => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, aujourdhui: '2025-10-27', lignes, retrocessions: [], salaires } }) })) as unknown as typeof fetch;
  };
  afterEach(() => { window.localStorage.removeItem('trx-fusion-salaires'); });
  for (const u of ['ht', 'ttc'] as const) {
    it(`septembre 2025, 400 € de salaires (${u.toUpperCase()}) : Sans = Avec + salaires − primes − variable, au centime ; tuiles, Résultat, tableau, Espace`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      const f = u === 'ht' ? 1 : 1.2;
      avecSalaires([{ id: 1, annee: 2025, mois: 9, salairesHt: 400, note: null }]);
      await ouvrir('/?vue=mois&annee=2025&mois=9');
      // Avec (défaut) : CA − apporteurs − salaires ; primes et variable « inclus »
      expect(new URLSearchParams(window.location.search).get('salaires')).toBe('avec');
      const netAvec = centimes(texte('[data-location-net]'));
      expect(netAvec).toBe(Math.round(100000 * f) - Math.round(9000 * f) - 40000);
      // le sélecteur sous le titre de la tuile « Coûts » : un clic ne l'ouvre pas, l'adresse et la mémoire suivent
      expect(container.querySelector('[data-tuile="location-couts"] .tdb-tuile-mot [data-salaires-choix="avec"]')).not.toBeNull();
      await cliquer('[data-tuile="location-couts"] [data-salaires="sans"]');
      expect([document.querySelector('[data-fenetre-couts-location]'), new URLSearchParams(window.location.search).get('salaires'), window.localStorage.getItem('trx-fusion-salaires')]).toEqual([null, 'sans', 'sans']);
      // Sans : aucun salaire compté, primes et variable déduits
      const netSans = centimes(texte('[data-location-net]'));
      expect(netSans - netAvec).toBe(40000 - Math.round(30000 * f) - VARIABLE_SEPT);
      expect(netSans).toBe(Math.round(61000 * f) - VARIABLE_SEPT);
      expect(texte('[data-tuile="location-couts"] .tdb-tuile-mot')).toContain('Coûts hors salaires — septembre');
      expect(texte('[data-tuile="location-net"] .tdb-tuile-mot')).toContain('CA net hors salaires — septembre');

      expect([centimes(texte('[data-resultat-net]')), centimes(texte('[data-resultat-salaires-non-comptes]')), container.querySelector('[data-resultat-salaires]')]).toEqual([netSans, 40000, null]);
      const sept = '[data-rangee-location="2025-9"]';
      expect([centimes(texte(`${sept} [data-location-net-mois]`)), texte(`${sept} [data-salaires-non-comptes]`), container.querySelector(`${sept} [data-location-salaires] .loc-muet`) !== null]).toEqual([netSans, 'non comptés', true]);
      await cliquer('[data-deplier="negociateurs-location"]');
      expect([centimes(texte('[data-total-espace-net]')), container.querySelector('[data-espace-salaires]')]).toEqual([netSans, null]);
      // la fenêtre « Coûts hors salaires » : salaires en gris, non comptés ; son total = la tuile
      await cliquer('[data-tuile="location-couts"]');
      expect(doc('[data-fenetre-couts-location] h2, [data-fenetre-couts-location] h3')).toContain('Coûts hors salaires');
      expect(centimes(doc('[data-sous-total-location="salaires-non-comptes"]'))).toBe(40000);
      expect(doc('[data-fenetre-couts-location] [data-location-salaires-non-comptes]')).toContain('salaires (non comptés) 400'); // 🔴 LOT LO13
      expect(centimes(doc('[data-fenetre-total] strong'))).toBe(centimes(texte('[data-location-couts]')));
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await calmer();
      // de retour en « Avec » : l'Espace montre les salaires (non répartis), son total retombe sur le CA net ; primes et variable « inclus »
      await cliquer('[data-tuile="location-couts"] [data-salaires="avec"]');
      expect([centimes(texte('[data-total-espace-net]')), centimes(texte('[data-espace-salaires-montant]')), centimes(texte('[data-espace-variable="Jean-Baptiste PONS"]'))]).toEqual([netAvec, 40000, 0]);
      expect(texte('[data-espace-inclus="variable-Jean-Baptiste PONS"]')).toContain('inclus dans les salaires');
    });
  }
  it('l’adresse &salaires=sans l’emporte sur la mémoire ; la mémoire sans adresse', async () => {
    window.localStorage.setItem('trx-fusion-salaires', 'avec');
    await rouvrir('/?vue=mois&annee=2025&mois=9&salaires=sans');
    expect(container.querySelector('[data-tuile="location-couts"] [data-salaires-choix]')!.getAttribute('data-salaires-choix')).toBe('sans');
    window.localStorage.setItem('trx-fusion-salaires', 'sans');
    await rouvrir('/?vue=mois&annee=2025&mois=9');
    expect(container.querySelector('[data-tuile="location-couts"] [data-salaires-choix]')!.getAttribute('data-salaires-choix')).toBe('sans');
  });
  it('l’Espace par négociateur retire le variable de chacun (mois sans salaires) ; la somme des lignes = le CA net', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9');
    await cliquer('[data-deplier="negociateurs-location"]');
    const net = (n: string) => centimes(texte(`[data-espace-net="${n}"]`));
    expect([centimes(texte('[data-espace-variable="Jean-Baptiste PONS"]')), centimes(texte('[data-espace-variable="Mélanie"]'))]).toEqual([VARIABLE_SEPT, 0]);
    expect(net('Jean-Baptiste PONS') + net('Mélanie')).toBe(centimes(texte('[data-resultat-net]')));
  });
  it('une période non contiguë : « 2 mois de 2025 », la liste complète en infobulle (tuiles, liste, Résultat) ; l’en-tête de la liste sur deux lignes', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9&vue-mois=periode&periode=2025-08,2025-10');
    expect(texte('[data-tuile="location-ca"] .tdb-tuile-mot')).toContain('CA brut — 2 mois de 2025');
    expect(container.querySelector('[data-ecran-location-tuiles]')!.getAttribute('title')).toBe('août, octobre 2025');
    expect([texte('#trx-baux-location-titre'), container.querySelector('#trx-baux-location-titre')!.getAttribute('title')]).toEqual(['Les baux de 2 mois de 2025', 'août, octobre 2025']);
    expect([texte('#trx-resultat-location'), container.querySelector('#trx-resultat-location')!.getAttribute('title')]).toEqual(['Résultat de la location — 2 mois de 2025', 'août, octobre 2025']);
    // ligne 1 : triangle, titre + compteur, total à droite ; ligne 2 : les outils
    const entete = container.querySelector('[data-liste-repliee="baux-location"] .lr-entete')!;
    expect([...entete.children].map((x) => x.className)).toEqual(['lr-h', 'lr-outils']);
    expect(entete.querySelector('.lr-outils [data-tri-liste]')).not.toBeNull();
    expect([...entete.querySelector('.lr-bascule')!.children].map((x) => x.className.split(' ').at(-1))).toEqual(['lr-triangle', 'lr-nom', 'lr-total']);
    expect(container.querySelector('.lr-nom [data-compteur-liste]')).not.toBeNull();
    await rouvrir('/?vue=mois&annee=2025&mois=9&vue-mois=periode&periode=2025-08,2025-09');
    expect([texte('#trx-baux-location-titre'), container.querySelector('#trx-baux-location-titre')!.getAttribute('title')]).toEqual(['Les baux de août → sept. 2025', 'août → sept. 2025']);
    expect([...container.querySelector('[data-liste-repliee="baux-location"] .lr-entete')!.children].map((x) => x.className)).toEqual(['lr-h', 'lr-outils']);
  });
});

/**
 * 🔴 LOT LO13 — tuiles épurées sur « Le mois » et « L'année » ; la fenêtre « CA brut » (nouvelle) ; les fenêtres « Coûts » et « CA net » portent ce
 * qui a quitté leurs tuiles (familles, CA net d'apporteurs, N−1), en HT et en TTC, avec et sans salaires.
 */
describe('🔴 LOT LO13 — tuiles épurées, fenêtre « CA brut »', () => {
  const lignesTuile = () => [...container.querySelectorAll('[data-ecran-location-tuiles] .tdb-tuile')].map((t) => [t.getAttribute('data-tuile'),
    [...t.children].filter((x) => !x.matches('style')).map((x) => x.className.split(' ')[0])]);
  afterEach(() => { window.localStorage.removeItem('trx-location-ca-mode'); window.localStorage.removeItem('trx-fusion-salaires'); });
  for (const q of ['/?vue=mois&annee=2025&mois=9', '/?vue=annee&annee=2025', '/?vue=mois&annee=2025&mois=9&vue-mois=periode&periode=2025-08,2025-09']) {
    it(`les quatre tuiles ne gardent que titre, montant, parenthèse (Baux : N−1) et « Voir le détail » — ${q}`, async () => {
      await ouvrir(q);
      expect(lignesTuile()).toEqual([
        ['location-ca', ['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-montant-autre', 'tdb-tuile-n1']],
        ['location-baux', ['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-montant-autre', 'tdb-tuile-n1']],
        ['location-couts', ['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-montant-autre', 'tdb-tuile-n1']],
        ['location-net', ['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-montant-autre', 'tdb-tuile-n1']],
      ]);
      expect([...container.querySelectorAll('[data-voir-detail-location]')].map((x) => x.getAttribute('data-voir-detail-location'))).toEqual(['ca', 'couts', 'net']);
    });
  }
  for (const u of ['ht', 'ttc'] as const) {
    it(`L’année 2025 (${u.toUpperCase()}) : « CA brut » = la tuile ; propriétaire + locataire = CA brut ; Par bail = la somme des baux ; mois par mois = l’année`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ouvrir('/?vue=annee&annee=2025');
      const ca = centimes(texte('[data-location-ca]'));
      await cliquer('[data-tuile="location-ca"]');
      expect([doc('[data-fenetre-ca-location] h2'), document.querySelector('[data-fenetre-ca-location] [data-mode-fenetre="categorie"]') !== null]).toEqual(['CA brut — 2025', true]);
      await act(async () => { (document.querySelector('[data-mode-fenetre="categorie"]') as HTMLElement).click(); }); await calmer();
      const sous = (k: string) => centimes(doc(`[data-sous-total-location="${k}"] strong`));
      expect(sous('proprietaire') + sous('locataire')).toBe(ca);
      expect(centimes(doc('[data-fenetre-total] strong'))).toBe(ca);
      // l'année : pas de cumul (« L'année ») ; le CA brut mois par mois = l'année
      expect(document.querySelector('[data-location-cumul]')).toBeNull();
      expect([...document.querySelectorAll('[data-repere-ca-mois] strong')].reduce((x, n) => x + centimes(n.textContent!), 0)).toBe(ca);
      await act(async () => { (document.querySelector('[data-mode-fenetre="transaction"]') as HTMLElement).click(); }); await calmer();
      expect([...document.querySelectorAll('[data-ca-bail] strong')].reduce((x, n) => x + centimes(n.textContent!), 0)).toBe(ca);
      // le nom d'un bail ferme la fenêtre
      await act(async () => { (document.querySelector('[data-aller-bail]') as HTMLElement).click(); }); await calmer();
      expect(document.querySelector('[data-fenetre-ca-location]')).toBeNull();
    });
  }
  it('Sans salaires : la fenêtre « Coûts hors salaires » porte les familles (salaires non comptés) et N−1 ; « CA net » son CA net d’apporteurs', async () => {
    await ouvrir('/?vue=mois&annee=2025&mois=9&salaires=sans');
    await cliquer('[data-tuile="location-couts"]');
    expect(doc('[data-fenetre-couts-location] [data-location-couts-detail]')).toContain('variable 136,50 €');
    expect(doc('[data-fenetre-couts-location] [data-tuile-n1="location-couts"]')).toContain('en 2024');
    await fermer();
    await cliquer('[data-tuile="location-net"]');
    expect(doc('[data-fenetre-net-location] h2')).toBe('CA net hors salaires — septembre 2025');
    expect(centimes(doc('[data-fenetre-net-location] [data-location-net-apporteurs] strong'))).toBe(91000);
  });
});
