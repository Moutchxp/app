// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccueilLocationGestion, AccueilTransaction, AccueilVentes, EcranGestion, EcranGlobal, EcranSociete, LigneDesMois, moisRougesDeLAnnee, syntheseGlobal, vueInitiale } from './EcransTransaction';
import { celluleGlobal, previsionnel } from '../../../../lib/transaction/modele';
import { venteDansSociete } from '../../../../lib/transaction/interCabinet';
import { compromisEnCours } from '../../../../lib/transaction/compromisEnCours';
import { existsSync, readFileSync } from 'node:fs';
import { ARIANE, FilAriane } from './FilAriane';
import type { DonneesSociete, LigneVente, Vente } from '../../../../lib/transaction/modele';
/** 🔴 LOT DQ — « aujourd'hui » des épreuves (le placement des compromis en cours en « Vendu + compromis »). */
const JOUR_DQ = '2025-10-27';

/**
 * 🔴 TUILE « TRANSACTION » (27/10/2026) — les vrais écrans, route simulée (rien n'est écrit) : l'accueil et ses trois cases, le mois
 * d'une société (tuiles, ventes, résultat de l'agence, rétrocession « à répartir » et son rattachement), l'année (toute l'histoire),
 * le CA global (vente + location + gestion, la gestion saisie au mois).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ligne = (negociateur: string, role: LigneVente['role'], montantTtc: number | null): LigneVente => ({
  id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: role !== 'negociateur', origine: 'import', sourceFichier: 'TABLEAU DE BORD MACJ 2025.xlsx',
  sourceOnglet: negociateur, sourceLigne: 30, note: null });
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `V${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2025, mois: 1,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: 'TABLEAU DE BORD MACJ 2025.xlsx', sourceOnglet: 'MYLENE', sourceLigne: id, lignes: [], double: null, ...o });
const donnees: DonneesSociete = {
  disponible: true, societe: 'macj', aujourdhui: '2025-10-27',
  ventes: [
    vente(1, { libelle: 'GAVEZ DE CAMPOS/ ASMAR', honorairesTtc: 11025, lignes: [ligne('MYLENE', 'negociateur', 3215), ligne('CEDRIC', 'part', 7810)] }),
    vente(2, { libelle: 'LOMBARDI FORT', honorairesTtc: 16275, mois: 2 }),
    vente(3, { libelle: 'CALMET', honorairesTtc: 25000, statut: 'compromis', mois: null }),
    vente(4, { libelle: 'SANS MOIS', honorairesTtc: 6000, mois: null }),
    vente(5, { libelle: 'AN PASSÉ', honorairesTtc: 6000, annee: 2024, mois: 1 }),
  ],
  retrocessions: [{ id: 9, societe: 'macj', annee: 2025, mois: 1, negociateur: 'MYLENE', montantTtc: 1200, apporteur: null, venteId: null, libelle: '=1200', origine: 'import',
    sourceOnglet: 'MYLENE', sourceCellule: 'D3', interne: true }],
  aRattacher: [],
  // LOT Q — MYLENE, rapprochée d'un compte INDÉPENDANT : sa paye est déduite du reste à l'agence.
  statutsNegociateurs: { MYLENE: 'independant' },
};
const donneesGlobal = { disponible: true, aujourdhui: '2025-10-27', location: { '2025-01': 9296.05 }, gestion: [{ id: 1, annee: 2025, mois: 1, nbLots: null, honorairesHt: 14127, adhocHt: 6437, salarieHt: null, resteHt: 7690, note: null, origine: 'import' }],
  ventes: donnees.ventes.map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois, honorairesTtc: v.honorairesTtc, libelle: v.libelle })) };
let container: HTMLDivElement;
let root: Root;
let posts: unknown[];
beforeEach(() => {
  posts = [];
  // 🔴 LOT BW — « Le mois » / « L'année » suivent le choix « HT | TTC » retenu (TTC par défaut) : ces épreuves lisent les montants en HT.
  window.localStorage.setItem('trx-affichage-montants', 'ht');
  window.history.replaceState(null, '', '/?annee=2025&mois=1');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  donneesGlobal.ventes = donnees.ventes.map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois, honorairesTtc: v.honorairesTtc, libelle: v.libelle }));
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: null }) }; }
    const data = String(url).includes('vue=global') ? donneesGlobal : String(url).includes('vue=journal') ? []
      // LOT L — l'onglet « Compromis » (l'arrivée) lit sa propre vue.
      : String(url).includes('vue=compromis') ? { disponible: true, aujourdhui: '2025-10-27', societe: 'macj', compromis: [], annules: [], lotD: true, negociateurs: [], apporteurs: [], personnes: [] }
      : donnees;
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-10-27T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
/** 🔴 LOT CG5 — le CA global replie ses tableaux à l'arrivée : les déplier (chacun encore replié) avant de les lire. */
const deplierGlobal = async () => {
  for (let k = 0; k < 3; k++) for (const b of [...document.querySelectorAll<HTMLButtonElement>('[data-ca-global] [data-deplier-liste][aria-expanded="false"]')]) await act(async () => { b.click(); });
  await calmer();
};
// 🔴 LOT DU — le texte d'un élément SANS la ligne d'explication des tuiles (`data-tuile-explication`, éprouvée par ses propres tests : « LOT DU »).
const sansExplication = (n: Element): string => { const c = n.cloneNode(true) as Element; c.querySelectorAll('[data-tuile-explication]').forEach((x) => x.remove()); return c.textContent ?? ''; };
const texte = (sel: string): string => { const n = container.querySelector(sel); return n === null ? '' : sansExplication(n).replace(/\s/g, ' '); };
/** 🔴 LOT LO12 — le titre d'une tuile sans son sélecteur « Avec | Sans salaires » (posé sous le titre). */
const titreSansChoix = (sel: string): string => { const n = container.querySelector(sel)?.cloneNode(true) as HTMLElement | undefined; if (n === undefined) return ''; n.querySelectorAll('[data-salaires-choix]').forEach((x) => x.remove()); return sansExplication(n).replace(/\s/g, ' '); };

describe('l’accueil de la tuile', () => {
  it('LOT L — trois cases : « Transactions ventes » (01/11/2026 ; ex-« Transaction vente », ex-« Transaction »), « Location & Gestion » (LOT DX, ex-« Gestion »), « CA global »', async () => {
    await act(async () => { root.render(createElement(AccueilTransaction)); });
    expect([...container.querySelectorAll('[data-tuile-transaction]')].map((a) => [a.querySelector('.loc-case-titre')!.textContent, a.getAttribute('href')]))
      .toEqual([['Transactions ventes', '/admin/transaction/ventes'], ['Location & Gestion', '/admin/transaction/location-gestion'], ['CA global', '/admin/transaction/global']]);
    // Arno (01/11/2026) — le titre seul : plus de légende ; le nom du lien = son titre
    expect([...container.querySelectorAll('[data-tuile-transaction]')].map((a) => [a.querySelectorAll('.loc-case-phrase').length, a.textContent])).toEqual([[0, 'Transactions ventes'], [0, 'Location & Gestion'], [0, 'CA global']]);
  });
  it('🔴 LOT DX — « Location & Gestion » : Location, Gestion (la page existante) et « FUSION Location & Gestion » ; trois cases de même taille', async () => {
    await act(async () => { root.render(createElement(AccueilLocationGestion)); });
    expect([...container.querySelectorAll('[data-tuile-transaction]')].map((a) => [a.querySelector('.loc-case-titre')!.textContent, a.getAttribute('href'), a.textContent]))
      .toEqual([['Location', '/admin/transaction/location', 'Location'], ['Gestion', '/admin/transaction/gestion', 'Gestion'],
        ['FUSION Location & Gestion', '/admin/transaction/location-gestion/fusion', 'FUSION Location & Gestion']]);
    // la grille de « Transaction vente » : trois colonnes, une seule au téléphone
    expect(container.querySelector('ul.loc-cases')!.className).toBe('loc-cases loc-cases--accueil trx-cases-nav');
  });
  it('LOT L — « Transactions ventes » : CRITERIMMO, MACJ et (LOT DM) « FUSION VENTES CRITERIMMO & MACJ », vers leurs écrans', async () => {
    await act(async () => { root.render(createElement(AccueilVentes)); });
    expect([...container.querySelectorAll('[data-tuile-transaction]')].map((a) => [a.querySelector('.loc-case-titre')!.textContent, a.getAttribute('href')]))
      .toEqual([['CRITERIMMO', '/admin/transaction/criterimmo'], ['MACJ', '/admin/transaction/macj'], ['FUSION VENTES CRITERIMMO & MACJ', '/admin/transaction/fusion']]);
    expect([container.querySelectorAll('.loc-case-phrase').length, texte('[data-tuile-transaction="fusion"]')]).toEqual([0, 'FUSION VENTES CRITERIMMO & MACJ']);
  });
  it('LOT M / DM — trois cases de même taille (la grille de l’accueil, une colonne au téléphone) ; l’accueil garde ses trois colonnes', async () => {
    await act(async () => { root.render(createElement(AccueilVentes)); });
    expect(container.querySelector('ul.loc-cases')!.className).toBe('loc-cases loc-cases--accueil trx-cases-nav');
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(AccueilTransaction)); });
    expect(container.querySelector('ul.loc-cases')!.className).toBe('loc-cases loc-cases--accueil trx-cases-nav');
  });
  it('Arno (01/11/2026) — les trois pages, un seul gabarit : le titre seul, centré, une seule règle de titre, la hauteur d’un titre sur deux lignes ; la Location garde le sien', async () => {
    for (const ecran of [AccueilTransaction, AccueilVentes, AccueilLocationGestion]) {
      act(() => { root.unmount(); }); root = createRoot(container);
      await act(async () => { root.render(createElement(ecran)); });
      const liens = [...container.querySelectorAll('ul.trx-cases-nav > li > a.loc-case[href]')];
      // chaque case : un lien dont le seul contenu (son nom accessible) est le titre
      expect([ecran.name, liens.length, liens.every((a) => a.children.length === 1 && a.firstElementChild!.className === 'loc-case-titre')]).toEqual([ecran.name, 3, true]);
    }
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('').replace(/\s+/g, ' ');
    for (const f of ['.loc-cases.trx-cases-nav{--trx-case-titre:1.375rem;--trx-case-interligne:1.25;', 'grid-auto-rows:1fr', 'justify-content:center;align-items:center;text-align:center',
      'min-height:calc(2 * var(--trx-case-titre) * var(--trx-case-interligne)',
      '.loc-cases.trx-cases-nav .loc-case-titre{font-family:inherit;font-weight:800;font-size:var(--trx-case-titre);line-height:var(--trx-case-interligne);text-transform:uppercase;max-width:100%;text-wrap:balance;overflow-wrap:normal']) expect(css).toContain(f);
    // UNE règle de titre : aucune autre taille propre à une page ou à une case du gabarit ; plus de règle de légende
    expect(css.match(/trx-cases-nav[^{]*\.loc-case-titre\{/g)).toHaveLength(1);
    expect(css).not.toContain('trx-cases-nav .loc-case-phrase');
    // l'accueil de la Location (.loc-cases--accueil seule) ne change pas
    expect(css).toContain('.loc-cases--accueil .loc-case{min-height:18rem');
    // Arno (01/11/2026) — 178 px : marge intérieure 60,5 px → 2 × 22 × 1,25 + 2 × 60,5 + 2. La ligne des cases CENTRÉE DANS LA FENÊTRE (≥ 768 px) :
    // la page remplit la zone principale (:has), la ligne est collante à calc(50dvh − sa demi-hauteur) — jamais au-dessus de sa place, 32 px
    // sous le fil d'Ariane. Téléphone : 16 px + les 16 px de l'en-tête = 32 px sous le fil.
    expect(container.querySelector('.loc-page')!.className).toBe('loc-page trx-cases-zone');
    for (const f of ['--trx-case-marge:60.5px', '.trx-cases-zone{padding-top:16px}', '.svv-adm-main:has(.trx-cases-zone){display:flex;flex-direction:column}',
      '.svv-adm-main:has(.trx-cases-zone) > .gst-page{flex:1 0 auto;display:flex;flex-direction:column}', '.gst-page > .trx-cases-zone{flex:1 0 auto}',
      '.trx-cases-zone > .loc-cases.trx-cases-nav{position:sticky;top:calc(50dvh - (var(--trx-case-titre) * var(--trx-case-interligne) + var(--trx-case-marge) + 1px))}']) expect(css).toContain(f);
    expect(css).toMatch(/@media \(min-width:768px\)\{ \.svv-adm-main:has\(\.trx-cases-zone\)/);
    // AUCUNE valeur fixe de POSITION (commit 2b60519 abandonné) : ni --trx-cases-haut / --trx-page-haut, ni cale ; le « top » de la ligne ne se
    // compose que de dvh et des variables de TAILLE des cases (le 1px : la bordure)
    expect(css).not.toMatch(/--trx-cases-haut|--trx-page-haut|trx-cases-zone\)::before/);
    const regle = css.match(/\.trx-cases-zone > \.loc-cases\.trx-cases-nav\{([^}]*)\}/)![1];
    const top = regle.match(/top:(calc\(.*\))$/)![1];
    expect(top.replace(/var\(--trx-case-(titre|interligne|marge)\)/g, '').replace(/50dvh|1px/g, '')).not.toMatch(/\d+(\.\d+)?(px|rem|em)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b[^}]*\}[^{]*trx-cases-nav|trx-cases-nav[^}]*#[0-9a-f]{3,6}\b/i);
  });
});

describe('une société — le mois', () => {
  it('le CA HT du mois, ses ventes, le résultat de l’agence ; le compromis et le « mois à confirmer » hors du mois', async () => {
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('9 187,50 €');
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-n1')).toContain('5 000 € en 2024');
    expect([...container.querySelectorAll('[data-bloc="ventes-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['1']);
    // 🔴 LOT CH — la somme des cartes : 11 025 − 3 215 (paye de Mylène), ÷ 1,2 ; la rétrocession « à répartir » (1 200 TTC) est dite à part, non déduite.
    expect(texte('[data-reste-agence]')).toBe('6 508,33 €');
    expect(texte('[data-total-hors-resultat]')).toBe('1 000 € HT (1 200 € TTC)');
    // 🔴 LOT DA — en « Vendu », la 4ᵉ tuile est le CA net cumulé ; « Compromis en cours » est la 4ᵉ tuile du mode « Compromis »
    await act(async () => { (container.querySelector('[data-mode-mois="compromis"]') as HTMLElement).click(); });
    expect(texte('[data-tuile="compromis"] .tdb-tuile-valeur')).toBe('20 833,33 €');
    window.localStorage.removeItem('trx-mois-mode'); // le mode est retenu par le navigateur : les épreuves suivantes partent de « Vendu »
  });
  it('D5 — la rétrocession « à répartir » se rattache à la main à la vente du négociateur et du mois', async () => {
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect(container.querySelector('[data-a-repartir]')).not.toBeNull();
    const champ = container.querySelector('[data-rattacher="9"]') as HTMLElement;
    await act(async () => { champ.click(); });
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.startsWith('GAVEZ')) as HTMLElement;
    expect(option).toBeDefined();
    await act(async () => { option.click(); });
    await calmer();
    expect(posts).toContainEqual({ action: 'retro-rattacher', id: 9, venteId: 1 });
  });
});

describe('une société — l’année', () => {
  it('toute l’histoire, année par année ; les « mois à confirmer » comptent dans l’année', async () => {
    window.history.replaceState(null, '', '/?vue=annee');
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect([...container.querySelectorAll('[data-annee-histoire]')].map((x) => x.getAttribute('data-annee-histoire'))).toEqual(['2024', '2025']);
    const l2025 = container.querySelector('[data-annee-histoire="2025"]')!;
    // 🔴 LOT BW — l'unité choisie (ici HT) en grand, l'autre entre parenthèses.
    expect(l2025.querySelector('[data-mot="CA HT"]')?.textContent?.replace(/\s/g, ' ')).toBe('27 750 € HT (33 300 € TTC)');
    expect(l2025.querySelector('[data-mot="dont mois à confirmer"]')?.textContent?.replace(/\s/g, ' ')).toBe('5 000 € HT (6 000 € TTC)');
  });
});

describe('le CA global', () => {
  it('vente MACJ + location + gestion, mois par mois ; CRITERIMMO porte la location et la gestion', async () => {
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer(); await deplierGlobal();
    const janvier = container.querySelector('[data-mois-global="1"]')!;
    const cel = (mot: string): string => janvier.querySelector(`[data-mot="${mot}"]`)?.textContent?.replace(/\s/g, ' ') ?? '';
    expect(cel('Vente MACJ')).toBe('9 187,50 €');
    expect(cel('Location')).toBe('9 296,05 €');
    expect(cel('Gestion')).toBe('14 127 €');
    expect(cel('Total')).toBe('32 610,55 €');
    expect(texte('[data-tuile="previsionnel"] .tdb-tuile-valeur')).toBe('20 833,33 €');
    expect(container.querySelector('[data-mois-a-confirmer]')).not.toBeNull();
  });
});

describe('🔴 LOT C — « Ventes à attribuer »', () => {
  const dhibMacj = vente(20, { libelle: 'DHIB/FARIA', honorairesTtc: 10000, mois: 3, double: { cle: 'double|DHIB', attribution: 'a_attribuer' } });
  const dhibCrit = { ...vente(21, { libelle: 'DHIB / FARIA', honorairesTtc: 12000, mois: 3, double: { cle: 'double|DHIB', attribution: 'a_attribuer' as const } }), societe: 'criterimmo' as const };
  it('le bloc liste la vente, hors du total de la société ; « Attribuer à CRITERIMMO » envoie le geste', async () => {
    donnees.ventes.push(dhibMacj);
    donnees.doubles = [dhibMacj, dhibCrit];
    window.history.replaceState(null, '', '/?annee=2025&mois=3');
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    // LOT D — un seul bloc replié sur une ligne (triangle à gauche) ; déplié, le contenu d'avant.
    expect(texte('#trx-a-attribuer .tdb-replie-mot')).toBe('Ventes à attribuer (1)');
    expect(container.querySelector('[data-attribuer]')).toBeNull();
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('0 €');
    await act(async () => { (container.querySelector('[data-deplier="a-attribuer"]') as HTMLButtonElement).click(); });
    await act(async () => { (container.querySelector('[data-attribuer="criterimmo"]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts).toContainEqual({ action: 'attribuer', cle: 'double|DHIB', societe: 'criterimmo' });
    donnees.ventes.pop(); delete donnees.doubles;
  });
  it('🔴 LOT CX — le bloc est le DERNIER de la page (onglet Compromis, Le mois, L’année ; CA global), replié ; il se déplie et attribue toujours', async () => {
    donnees.ventes.push(dhibMacj);
    donnees.doubles = [dhibMacj, dhibCrit];
    try {
      const dernier = (racine: string) => { const r = container.querySelector(racine)!; const kids = [...r.children].filter((x) => x.tagName !== 'STYLE');
        return kids.at(-1)!.contains(container.querySelector('#trx-a-attribuer')); };
      for (const vue of ['compromis', 'mois', 'annee'] as const) {
        act(() => { root.unmount(); }); root = createRoot(container);
        window.history.replaceState(null, '', `/?vue=${vue}&annee=2025&mois=3`);
        await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
        expect([vue, dernier('[data-transaction]'), texte('#trx-a-attribuer .tdb-replie-mot'), container.querySelector('[data-attribuer]')]).toEqual([vue, true, 'Ventes à attribuer (1)', null]);
        await act(async () => { (container.querySelector('[data-deplier="a-attribuer"]') as HTMLButtonElement).click(); });
        await act(async () => { (container.querySelector('[data-attribuer="criterimmo"]') as HTMLButtonElement).click(); }); await calmer();
        expect(posts.at(-1)).toEqual({ action: 'attribuer', cle: 'double|DHIB', societe: 'criterimmo' });
      }
      act(() => { root.unmount(); }); root = createRoot(container);
      donneesGlobal.ventes = [...donneesGlobal.ventes, ...[dhibMacj, dhibCrit].map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois,
        honorairesTtc: v.honorairesTtc, libelle: v.libelle, double: v.double }))];
      window.history.replaceState(null, '', '/?annee=2025');
      await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
      expect(dernier('[data-ca-global]')).toBe(true);
    } finally { donnees.ventes.pop(); delete donnees.doubles; }
  });
  it('le CA global la compte une fois (le plus bas), dans aucune société', async () => {
    donneesGlobal.ventes = [...donneesGlobal.ventes, ...[dhibMacj, dhibCrit].map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois,
      honorairesTtc: v.honorairesTtc, libelle: v.libelle, double: v.double }))];
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer(); await deplierGlobal();
    expect(texte('[data-a-attribuer-global] [data-mot="Total"]')).toBe('8 333,33 €');
    expect(texte('[data-mois-global="3"] [data-mot="Vente MACJ"]')).toBe('0 €');
    expect(texte('#trx-a-attribuer .tdb-replie-mot')).toBe('Ventes à attribuer (1)');
  });
});

describe('🔴 LOT L — l’arborescence', () => {
  const T = 'app/(admin)/admin/(protected)/transaction';
  it('les trois niveaux existent, chacun avec « ← Retour » vers son parent et son fil d’Ariane ; le droit « Transaction » garde tout l’arbre', () => {
    const pages: [string, string, keyof typeof ARIANE][] = [['page.tsx', '', 'accueil'], ['ventes/page.tsx', '/admin/transaction', 'ventes'],
      ['criterimmo/page.tsx', '/admin/transaction/ventes', 'criterimmo'], ['macj/page.tsx', '/admin/transaction/ventes', 'macj'],
      ['gestion/page.tsx', '/admin/transaction/location-gestion', 'gestion'], ['global/page.tsx', '/admin/transaction', 'global'], ['fusion/page.tsx', '/admin/transaction/ventes', 'fusion'],
      // 🔴 LOT DX — « Location & Gestion », la Location et leur FUSION
      ['location-gestion/page.tsx', '/admin/transaction', 'locationGestion'], ['location/page.tsx', '/admin/transaction/location-gestion', 'location'],
      ['location-gestion/fusion/page.tsx', '/admin/transaction/location-gestion', 'fusionLocationGestion']];
    for (const [f, retour, ariane] of pages) {
      const src = readFileSync(`${T}/${f}`, 'utf8');
      if (retour !== '') expect(src).toContain(`retour="${retour}"`);
      expect(src).toContain(`ARIANE.${ariane}`);
      expect(src).toContain('accesTransaction()');
    }
    expect(readFileSync('proxy.ts', 'utf8')).toContain("['/admin/transaction', 'transaction']");
    // 🔴 LOT DM : « Suivi Chiffre d'affaires » › « Transactions ventes »
    expect(ARIANE.criterimmo.map((e) => e.libelle)).toEqual(['Suivi Chiffre d’affaires', 'Transactions ventes', 'CRITERIMMO']);
    expect(ARIANE.fusion.map((e) => e.libelle)).toEqual(['Suivi Chiffre d’affaires', 'Transactions ventes', 'FUSION VENTES CRITERIMMO & MACJ']);
    // Arno (01/11/2026) — « Transactions ventes » écrit une fois (TITRE_VENTES) : le h1 de /ventes, sa case, le maillon des pages filles
    expect(ARIANE.ventes.map((e) => e.libelle)).toEqual(['Suivi Chiffre d’affaires', 'Transactions ventes']);
    expect(readFileSync(`${T}/ventes/page.tsx`, 'utf8')).toContain('titre={TITRE_VENTES}');
    // les h1 du module en capitales : UNE règle, posée par le fil d'Ariane (dans l'en-tête des dix pages), le texte inchangé
    act(() => { root.render(createElement(FilAriane, { etapes: ARIANE.ventes })); });
    const cssAriane = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(cssAriane).toContain('.svv-page-head:has([data-fil-ariane]) .svv-page-title{text-transform:uppercase}');
    expect(cssAriane.match(/text-transform:uppercase/g)).toHaveLength(1);
    // Arno (01/11/2026) — le titre de la page FUSION vente : le même libellé, lu de la même constante ; plus aucune copie de l'ancien nom
    expect(readFileSync(`${T}/fusion/page.tsx`, 'utf8')).toContain('titre={TITRE_FUSION_VENTE}');
    for (const f of ['fusion/page.tsx', 'FilAriane.tsx', 'EcransTransaction.tsx']) expect([f, readFileSync(`${T}/${f}`, 'utf8').includes('\'FUSION CRITERIMMO & MACJ\'')]).toEqual([f, false]);
    // 🔴 LOT DX : « Suivi Chiffre d'affaires » › « Location & Gestion » › Location | Gestion | FUSION Location & Gestion
    expect(ARIANE.gestion).toEqual([{ libelle: 'Suivi Chiffre d’affaires', href: '/admin/transaction' }, { libelle: 'Location & Gestion', href: '/admin/transaction/location-gestion' }, { libelle: 'Gestion' }]);
    expect(ARIANE.location.map((e) => e.libelle)).toEqual(['Suivi Chiffre d’affaires', 'Location & Gestion', 'Location']);
    expect(ARIANE.fusionLocationGestion.map((e) => e.libelle)).toEqual(['Suivi Chiffre d’affaires', 'Location & Gestion', 'FUSION Location & Gestion']);
    expect(ARIANE.locationGestion.map((e) => e.libelle)).toEqual(['Suivi Chiffre d’affaires', 'Location & Gestion']);
  });
  it('les anciennes adresses restent valides : /criterimmo, /macj, /global ; une adresse du mois (?annee&mois) rouvre « Le mois »', () => {
    for (const f of ['criterimmo', 'macj', 'global']) expect(existsSync(`${T}/${f}/page.tsx`)).toBe(true);
    expect(vueInitiale(null, false)).toBe('compromis');
    expect(vueInitiale(null, true)).toBe('mois');
    expect(vueInitiale('annee', false)).toBe('annee');
    expect(vueInitiale('compromis', true)).toBe('compromis');
  });
  it('une société : sans paramètre, on arrive sur « Compromis » ; « Le mois » s’écrit dans l’adresse', async () => {
    window.history.replaceState(null, '', '/');
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect(container.querySelector('[data-vue="compromis"]')!.getAttribute('aria-selected')).toBe('true');
    await act(async () => { (container.querySelector('[data-vue="mois"]') as HTMLElement).click(); });
    expect(new URLSearchParams(window.location.search).get('vue')).toBe('mois');
  });
  it('Arno (01/11/2026) — CRITERIMMO, MACJ, FUSION : à l’arrivée, « Le mois » est sur « Année » ; « Mois » choisi reste en changeant de mois et de mode', async () => {
    const choix = () => container.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode');
    const vueMois = () => new URLSearchParams(window.location.search).get('vue-mois');
    try {
      for (const societe of ['criterimmo', 'macj', 'tous'] as const) {
        act(() => { root.unmount(); }); root = createRoot(container);
        // l'adresse d'arrivée des tuiles, du fil d'Ariane et de « ← Retour » : sans paramètre
        window.history.replaceState(null, '', '/');
        await act(async () => { root.render(createElement(EcranSociete, { societe })); });
        await calmer();
        await act(async () => { (container.querySelector('[data-vue="mois"]') as HTMLElement).click(); }); await calmer();
        expect([societe, choix(), container.querySelector('[data-decouper="annee"]')!.getAttribute('aria-pressed'), vueMois()]).toEqual([societe, 'annee', 'true', 'annee']);
        // les trois boutons restent là
        expect([...container.querySelectorAll('[data-choix-periode] button')].map((x) => x.textContent)).toEqual(['Mois', 'Période', 'Année']);
        // le choix de la visite reste
        await act(async () => { (container.querySelector('[data-decouper="mois"]') as HTMLElement).click(); }); await calmer();
        await act(async () => { (container.querySelector('[data-onglet-mois="3"]') as HTMLElement).click(); }); await calmer();
        await act(async () => { (container.querySelector('[data-mode-mois="compromis"]') as HTMLElement).click(); }); await calmer();
        expect([societe, choix(), vueMois(), new URLSearchParams(window.location.search).get('mois')]).toEqual([societe, 'mois', 'mois', '3']);
      }
      // un lien qui précise « Mois » le garde
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&vue-mois=mois');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); });
      await calmer();
      expect([choix(), vueMois()]).toEqual(['mois', 'mois']);
    } finally { window.localStorage.removeItem('trx-mois-mode'); } // « Compromis » cliqué est retenu par le navigateur : les épreuves suivantes ne doivent pas en hériter
  });
});

describe('🔴 LOT L — « Gestion », déplacée du CA global', () => {
  it('les mêmes chiffres (mêmes données, `vue=global`) ; le même formulaire de saisie, enregistré par le même geste', async () => {
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGestion)); });
    await calmer();
    expect(texte('[data-gestion-honoraires="1"]')).toBe('14 127 €');
    const janvier = container.querySelector('[data-mois-gestion="1"]')!;
    expect(janvier.querySelector('[data-mot="ADHOC"]')!.textContent!.replace(/\s/g, ' ')).toBe('6 437 €');
    expect(janvier.querySelector('[data-mot="Reste"]')!.textContent!.replace(/\s/g, ' ')).toBe('7 690 €');
    // 🔴 LOT GE1 : « Année par année » est dans « L'année » › « Tout »
    await act(async () => { (container.querySelector('[data-decouper-annees="tout"]') as HTMLElement).click(); }); await calmer();
    expect(texte('[data-annee-gestion="2025"] [data-mot="Honoraires"]')).toBe('14 127 €');
    await act(async () => { (container.querySelector('[data-decouper-annees="annee"]') as HTMLElement).click(); }); await calmer();
    await act(async () => { (container.querySelector('[data-saisir-gestion="2"]') as HTMLElement).click(); });
    expect(container.querySelector('[data-saisie-gestion]')).not.toBeNull();
    await act(async () => { (container.querySelector('[data-enregistrer-gestion]') as HTMLElement).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'gestion-enregistrer', annee: 2025, mois: 2 });
  });
  it('le CA global garde la gestion dans ses montants (même cellule), et renvoie vers « Gestion » pour la saisie', async () => {
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer(); await deplierGlobal();
    expect(texte('[data-mois-global="1"] [data-mot="Gestion"]')).toBe('14 127 €');
    expect(container.querySelector('[data-lien-gestion] a')!.getAttribute('href')).toBe('/admin/transaction/gestion?annee=2025');
  });
});

describe('🔴 LOT GE1 — l’écran « Gestion » : Le mois | L’année, tuiles, graphique, tableau', () => {
  const g = (id: number, annee: number, mois: number, o: Record<string, unknown>) => ({ id, annee, mois, nbLots: null, honorairesHt: null, adhocHt: null, salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...o });
  // janvier 2025 (le jeu commun : 14 127 − 6 437), mars 2025 (avec salarié et lots), janvier 2024 (N−1)
  const jeu = () => [donneesGlobal.gestion[0], g(2, 2025, 3, { honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, resteHt: 13735.63, nbLots: 310 }),
    g(3, 2024, 1, { honorairesHt: 10000, adhocHt: 5000, salarieHt: 0, resteHt: 5000, nbLots: 280 })];
  let avant: typeof donneesGlobal.gestion;
  beforeEach(() => { avant = donneesGlobal.gestion; donneesGlobal.gestion = jeu() as unknown as typeof donneesGlobal.gestion; });
  afterEach(() => { donneesGlobal.gestion = avant; });
  const ouvrirG = async (q: string) => { window.history.replaceState(null, '', q); await act(async () => { root.render(createElement(EcranGestion)); }); await calmer(); };
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const valeur = (cle: string) => centimesDe(texte(`[data-tuile-valeur="${cle}"]`));
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const adresse = () => new URLSearchParams(window.location.search);

  // 🔴 LOT LO7 — sans vue du mois dans l'adresse (tuile « Gestion » de Location & Gestion, menu) : « Année », l'année en cours ; un lien qui en précise une la garde
  it('🔴 LOT LO7 — ouverture sans paramètre : « Le mois » sur « Année » (année en cours, 12 mois) ; &vue-mois=mois, &mois=…, &periode=… gardent leur choix', async () => {
    const an = new Date().getFullYear();
    await ouvrirG('/');
    expect([container.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode'), container.querySelector('[data-decouper="annee"]')!.getAttribute('aria-pressed')]).toEqual(['annee', 'true']);
    expect(container.querySelectorAll('[data-onglet-mois][aria-pressed="true"]')).toHaveLength(10); // Arno (01/11/2026) — seuls les mois écoulés ; les 12 restent là
    expect(container.querySelectorAll('[data-onglet-mois]')).toHaveLength(12);
    expect([adresse().get('vue-mois'), adresse().get('annee')]).toEqual(['annee', String(an)]);
    // le choix de la visite reste : « Mois » choisi, il y reste en changeant de mois
    await cliquer('[data-decouper="mois"]');
    await cliquer('[data-onglet-mois="3"]');
    expect(container.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode')).toBe('mois');
    for (const [q, attendu] of [['/?vue=mois&annee=2025&vue-mois=mois', 'mois'], ['/?vue=mois&annee=2025&mois=3', 'mois'], ['/?vue=mois&annee=2025&periode=2025-01,2025-03', 'periode']] as const) {
      act(() => { root.unmount(); }); root = createRoot(container);
      await ouvrirG(q);
      expect([q, container.querySelector('[data-choix-periode]')!.getAttribute('data-choix-periode')]).toEqual([q, attendu]);
    }
  });

  it('Le mois (janvier 2025) : 4 tuiles — honoraires, ADHOC (rouge), salariés (gris à 0), CA net = honoraires − ADHOC − salariés au centime ; N−1 et écart ; pas de HT | TTC ni de Négociateur', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=1');
    expect([...container.querySelectorAll('[data-tuile]')].map((x) => x.getAttribute('data-tuile'))).toEqual(['gestion-honoraires', 'gestion-adhoc', 'gestion-monga', 'gestion-salaries', 'gestion-net']); // 🔴 LOT GE3 : MONGA
    expect([valeur('gestion-honoraires'), valeur('gestion-adhoc'), valeur('gestion-salaries'), valeur('gestion-net')]).toEqual([1412700, 643700, 0, 769000]);
    expect(valeur('gestion-honoraires') - valeur('gestion-adhoc') - valeur('gestion-salaries')).toBe(valeur('gestion-net'));
    expect([container.querySelector('[data-tuile-valeur="gestion-adhoc"]')!.className, container.querySelector('[data-tuile-valeur="gestion-salaries"]')!.className])
      .toEqual([expect.stringContaining('trx-rouge'), expect.stringContaining('trx-cout-nul')]);
    expect(texte('[data-tuile-n1="gestion-honoraires"]')).toBe('10 000 € en 2024 (+41,3 %)');
    expect([texte('[data-tuile="gestion-net"] .tdb-tuile-mot'), texte('[data-gestion-lots]'), texte('[data-tuile="gestion-net"] [data-montant-autre]')]).toEqual(['CA net HT — janvier 2025', 'lots : —', '(9 228 € TTC · lots : —)']);
    // 🔴 LOT GE2 : le sélecteur « Montants HT | TTC » de la Transaction ; toujours pas de filtre Négociateur
    expect([container.querySelector('.trx-champ-unite [data-affichage-montants]') !== null, container.querySelector('[data-filtre="negociateur"]'), container.querySelector('[data-filtre="annee"]') !== null]).toEqual([true, null, true]);
    // le tableau : les 12 mois de l'année, son titre et son total disent l'année
    expect([texte('[data-bloc="gestion-mois"] h3'), texte('[data-total-gestion] th')]).toEqual(['2025 mois par mois (HT ; envoyé chaque mois par le comptable)', 'Total — 2025']);
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_TRANSACTION).toContain('[data-ecran-gestion] .tdb-histo-entete-detail .tdb-mesures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'); // 🔴 LOT GE4 : la grille 3 × 2
    // mars : avec salariés et lots
    await cliquer('[data-onglet-mois="3"]');
    expect([valeur('gestion-net'), texte('[data-gestion-lots]'), adresse().get('mois')]).toEqual([1618463 - 244900 - 268891, '310 lots', '3']);
  });

  it('Mois | Période | Année : les sommes des mois, les lots en moyenne, le tableau des mois concernés et sa ligne de total ; un mois non saisi : « — » et « mois non saisi » dans l’encadré', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=2');
    expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] .tdb-bulle-titre')).toBe('Février 2025 — mois non saisi');
    expect([valeur('gestion-honoraires'), texte('[data-mois-gestion="2"] [data-mot="Honoraires"]'), texte('[data-saisir-gestion="2"]')]).toEqual([0, '—', 'Saisir']);
    expect(container.querySelectorAll('[data-table-gestion] tbody tr[data-mois-gestion]').length).toBe(12);
    await cliquer('[data-decouper="periode"]');
    await cliquer('[data-onglet-mois="1"]'); await cliquer('[data-onglet-mois="3"]');
    expect([adresse().get('vue-mois'), adresse().get('periode')]).toEqual(['periode', '2025-01,2025-02,2025-03']);
    expect([valeur('gestion-honoraires'), valeur('gestion-net'), texte('[data-gestion-lots]')]).toEqual([1412700 + 1618463, 769000 + 1618463 - 244900 - 268891, '310 lots en moyenne']);
    expect([...container.querySelectorAll('[data-table-gestion] tbody tr[data-mois-gestion]')].map((x) => x.getAttribute('data-mois-gestion'))).toEqual(['1', '2', '3']);
    expect([texte('[data-total-gestion] th'), texte('[data-total-gestion] [data-mot="Honoraires"]'), container.querySelector('[data-total-gestion]')!.classList.contains('trx-ligne-total')])
      .toEqual(['Total — janv. → mars 2025', '30 311,63 €', true]); // 🔴 LOT LO12 — le nom court
    expect(texte('[data-bloc="histogramme-mois"] style')).toContain('[data-periode-graphe] g[data-barre-mois]{opacity:.35}');
    await cliquer('[data-decouper="annee"]');
    expect([valeur('gestion-honoraires'), container.querySelectorAll('[data-table-gestion] tbody tr[data-mois-gestion]').length]).toEqual([1412700 + 1618463, 12]);
  });

  it('le graphique : Honoraires | ADHOC | Salariés | CA net | Lots ; Mensuel (N−1 hachurée, le mois en rouge, aucun mois pâle) / Cumul', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=3');
    expect([...container.querySelectorAll('[data-mesure-bouton]')].map((x) => x.textContent)).toEqual(['CA', 'CA net', 'Lots', 'ADHOC', 'MONGA', 'Salaires']); // 🔴 LOT GE4 : grille 3 × 2
    const barre = (k: number) => Number(container.querySelector(`[data-bloc="histogramme-mois"] [data-barre-mois="${k}"] .tdb-barre`)!.getAttribute('data-valeur'));
    expect([barre(1), barre(3), container.querySelector('[data-barre-mois="3"] .tdb-barre--courante') !== null, container.querySelector('[data-barre-n1="1"]') !== null,
      container.querySelectorAll('.tdb-barre-annee--pale').length]).toEqual([14127, 16184.63, true, true, 0]);
    await cliquer('[data-mesure-bouton="net"]');
    expect([barre(3), adresse().get('mesure')]).toEqual([(1618463 - 244900 - 268891) / 100, 'net']);
    await cliquer('[data-mesure-bouton="lots"]');
    expect(barre(3)).toBe(310);
    await cliquer('[data-mesure-bouton="honoraires"]');
    await cliquer('[data-cumul-bouton]');
    expect(Number(container.querySelector('[data-point-cumul="3"]')!.getAttribute('data-valeur'))).toBeCloseTo(14127 + 16184.63, 6);
    expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] .tdb-bulle-titre')).toBe('Cumul 2025 à fin mars');
  });

  it('L’année : ligne des années, Année | Période | Tout ; « Année par année » et « Mois par mois — 2025 » ; Tout : le tableau année par année, sans N−1 ; l’ancien lien ?annee=2025', async () => {
    await ouvrirG('/?annee=2025');
    expect([container.querySelector('[data-vue="annee"]')!.getAttribute('aria-selected'), [...container.querySelectorAll('[data-onglet-annee]')].map((b) => b.textContent)]).toEqual(['true', ['2024', '2025']]);
    expect([valeur('gestion-honoraires'), texte('[data-tuile-n1="gestion-honoraires"]')]).toEqual([1412700 + 1618463, '10 000 € en 2024 (+203,1 %)']);
    expect(container.querySelector('[data-bloc="graphe-annees"] [data-barre-annee="2025"] .tdb-barre--courante')).not.toBeNull();
    await cliquer('[data-echelle="mois"]');
    expect([texte('[data-bloc="histogramme-mois"] h3'), adresse().get('graphe')]).toEqual(['Mois par mois — 2025 (CA HT)', 'mois']);
    await cliquer('[data-echelle="annees"]');
    await cliquer('[data-decouper-annees="periode"]'); await cliquer('[data-onglet-annee="2024"]');
    expect([adresse().get('vue-annee'), adresse().get('annees'), valeur('gestion-honoraires'), container.querySelectorAll('[data-table-gestion] tbody tr[data-mois-gestion]').length])
      .toEqual(['periode', '2024,2025', 1000000 + 1412700 + 1618463, 24]);
    await cliquer('[data-decouper-annees="tout"]');
    expect([texte('[data-tuile-n1="gestion-net"]'), container.querySelector('[data-table-gestion]'), texte('[data-annee-gestion="2024"] [data-mot="Honoraires"]')])
      .toEqual(['Toutes les années (2024 → 2025)', null, '10 000 €']);
    expect(container.querySelector('[data-bloc="graphe-annees"] [data-bulle-bloc="n1"]')).toBeNull();
  });

  it('« Modifier » : la saisie du comptable, enregistrée, et la page se met à jour aussitôt ; le téléphone', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=1');
    await cliquer('[data-saisir-gestion="1"]');
    expect(container.querySelector('[data-saisie-gestion]')).not.toBeNull();
    // ce que la base rendra après l'enregistrement
    donneesGlobal.gestion = [{ ...donneesGlobal.gestion[0], honorairesHt: 15000 }, ...donneesGlobal.gestion.slice(1)] as typeof donneesGlobal.gestion;
    await cliquer('[data-enregistrer-gestion]');
    expect(posts.at(-1)).toMatchObject({ action: 'gestion-enregistrer', annee: 2025, mois: 1 });
    expect([container.querySelector('[data-saisie-gestion]'), valeur('gestion-honoraires'), texte('[data-mois-gestion="1"] [data-mot="Honoraires"]')]).toEqual([null, 1500000, '15 000 €']);
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_TRANSACTION).toContain('.trx-ligne-total th,.trx-ligne-total td{background:var(--color-svv-field)}');
    expect(container.querySelector('.trx-rangee-mois')).not.toBeNull(); // la ligne des mois de la Transaction (mêmes règles au téléphone)
  });
});

describe('🔴 LOT GE2 — « Gestion » : Montants HT | TTC', () => {
  const g = (id: number, annee: number, mois: number, o: Record<string, unknown>) => ({ id, annee, mois, nbLots: null, honorairesHt: null, adhocHt: null, salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...o });
  // mars 2025 : honoraires 16 184,63, ADHOC 2 449, salariés 2 688,91 (reste saisi 11 046,72) ; mars 2024 : N−1
  const jeu = () => [g(2, 2025, 3, { honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, resteHt: 11046.72, nbLots: 310 }), g(3, 2024, 3, { honorairesHt: 10000.01, adhocHt: 5000, salarieHt: 0, resteHt: 5000.01 })];
  let avant: typeof donneesGlobal.gestion;
  beforeEach(() => { avant = donneesGlobal.gestion; donneesGlobal.gestion = jeu() as unknown as typeof donneesGlobal.gestion; });
  afterEach(() => { donneesGlobal.gestion = avant; window.localStorage.setItem('trx-affichage-montants', 'ht'); });
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const valeur = (cle: string) => centimesDe(texte(`[data-tuile-valeur="${cle}"]`));
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const ouvrirG = async (q: string) => { window.history.replaceState(null, '', q); await act(async () => { root.render(createElement(EcranGestion)); }); await calmer(); };

  it('la bascule HT ↔ TTC : honoraires et ADHOC × 1,20, salariés identiques (« sans TVA »), CA net TTC = honoraires TTC − ADHOC TTC − salariés au centime ; titres, petit montant, N−1', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=3');
    const ht = { h: valeur('gestion-honoraires'), a: valeur('gestion-adhoc'), s: valeur('gestion-salaries'), n: valeur('gestion-net') };
    expect(ht).toEqual({ h: 1618463, a: 244900, s: 268891, n: 1618463 - 244900 - 268891 });
    expect([texte('[data-tuile="gestion-honoraires"] .tdb-tuile-mot'), texte('[data-tuile="gestion-honoraires"] [data-montant-autre]'), texte('[data-tuile="gestion-salaries"] [data-montant-autre]')])
      .toEqual(['Honoraires de gestion HT — mars 2025', '(19 421,56 € TTC)', '(sans TVA)']);
    await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
    const ttc = { h: valeur('gestion-honoraires'), a: valeur('gestion-adhoc'), s: valeur('gestion-salaries'), n: valeur('gestion-net') };
    expect(ttc).toEqual({ h: Math.round(1618463 * 1.2), a: 293880, s: 268891, n: Math.round(1618463 * 1.2) - 293880 - 268891 });
    expect(ttc.h - ttc.a - ttc.s).toBe(ttc.n);
    expect([texte('[data-tuile="gestion-net"] .tdb-tuile-mot'), texte('[data-tuile="gestion-honoraires"] [data-montant-autre]'), texte('[data-tuile-n1="gestion-honoraires"]')])
      .toEqual(['CA net TTC — mars 2025', '(16 184,63 € HT)', '12 000,01 € en 2024 (+61,8 %)']);
    // le graphique, l'encadré, le tableau et ses totaux suivent
    expect(Number(container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="3"] .tdb-barre')!.getAttribute('data-valeur'))).toBeCloseTo(19421.56, 6);
    expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]')).toContain('CA TTC19 421,56 €'); // 🔴 LOT GE4 : « CA » dans l'encadré
    expect([texte('[data-mois-gestion="3"] [data-mot="Honoraires"]'), texte('[data-mois-gestion="3"] [data-mot="Salaires chargés"]'), texte('[data-mois-gestion="3"] [data-mot="Reste"]'),
      texte('[data-total-gestion] [data-mot="ADHOC"]')]).toEqual(['19 421,56 €', '2 688,91 €', '13 793,85 €', '2 938,80 €']); // reste TTC = 19 421,56 − 2 938,80 − 2 688,91
    expect(texte('[data-bloc="gestion-mois"] h3')).toContain('TTC, salaires chargés sans TVA'); // 🔴 LOT GE5
    // salariés : identiques dans les deux unités
    await cliquer('[data-affichage-montants] [data-afficher="ht"]');
    expect(valeur('gestion-salaries')).toBe(ttc.s);
  });

  it('le choix est partagé avec la Transaction (même mémoire) ; L’année et « Tout » suivent ; « Modifier » reste en HT', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    await ouvrirG('/?vue=annee&vue-annee=tout');
    expect([container.querySelector('[data-afficher="ttc"]')!.getAttribute('aria-pressed'), texte('[data-annee-gestion="2025"] [data-mot="Honoraires"]'), texte('[data-bloc="gestion-annees"] h3')])
      .toEqual(['true', '19 421,56 €', 'Année par année (TTC)']);
    await cliquer('[data-affichage-montants] [data-afficher="ht"]');
    expect(window.localStorage.getItem('trx-affichage-montants')).toBe('ht');
    await cliquer('[data-decouper-annees="annee"]');
    await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
    await cliquer('[data-saisir-gestion-mois="2025-3"]');
    expect([texte('[data-montants-ht]'), (container.querySelector('[data-champ-gestion="honorairesHt"]') as HTMLInputElement).value]).toEqual(['Montants HT (la saisie du comptable).', '16184,63']);
  });
});

describe('🔴 LOT GE3 — « Gestion » : le coût MONGA (entre ADHOC et Salarié)', () => {
  const g = (id: number, annee: number, mois: number, o: Record<string, unknown>) => ({ id, annee, mois, nbLots: null, honorairesHt: null, adhocHt: null, salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...o });
  const jeu = () => [g(2, 2025, 3, { honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, resteHt: 11046.72 }), g(3, 2024, 3, { honorairesHt: 10000, adhocHt: 5000, resteHt: 5000 })];
  let avant: typeof donneesGlobal.gestion;
  beforeEach(() => { avant = donneesGlobal.gestion; donneesGlobal.gestion = jeu() as unknown as typeof donneesGlobal.gestion; (donneesGlobal as { monga?: boolean }).monga = true; });
  afterEach(() => { donneesGlobal.gestion = avant; delete (donneesGlobal as { monga?: boolean }).monga; window.localStorage.setItem('trx-affichage-montants', 'ht'); });
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const valeur = (cle: string) => centimesDe(texte(`[data-tuile-valeur="${cle}"]`));
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const taper = async (cle: string, x: string) => {
    const el = container.querySelector(`[data-champ-gestion="${cle}"]`) as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, x); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const ouvrirG = async (q: string) => { window.history.replaceState(null, '', q); await act(async () => { root.render(createElement(EcranGestion)); }); await calmer(); };

  it('un mois sans MONGA : inchangé au centime ; les 5 tuiles (MONGA gris à 0), la colonne et l’onglet MONGA, dans l’ordre Honoraires · ADHOC · MONGA · Salarié · Reste', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=3');
    expect([valeur('gestion-monga'), valeur('gestion-net'), container.querySelector('[data-tuile-valeur="gestion-monga"]')!.className]).toEqual([0, 1618463 - 244900 - 268891, expect.stringContaining('trx-cout-nul')]);
    expect([...container.querySelectorAll('[data-tuile]')].map((x) => x.getAttribute('data-tuile'))).toEqual(['gestion-honoraires', 'gestion-adhoc', 'gestion-monga', 'gestion-salaries', 'gestion-net']);
    expect([...container.querySelectorAll('[data-table-gestion] thead th')].map((x) => x.textContent).slice(2, 7)).toEqual(['Honoraires', 'ADHOC', 'MONGA', 'Salaires chargés', 'Reste']); // 🔴 LOT GE5
    expect([texte('[data-mois-gestion="3"] [data-mot="MONGA"]'), texte('[data-mois-gestion="3"] [data-mot="Reste"]')]).toEqual(['—', '11 046,72 €']);
    expect([...container.querySelectorAll('[data-mesure-bouton]')].map((x) => x.textContent).slice(3, 6)).toEqual(['ADHOC', 'MONGA', 'Salaires']); // 🔴 LOT GE4 : la ligne des coûts
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_TRANSACTION).toContain('.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(5,minmax(0,1fr))}');
    expect(CSS_TRANSACTION).toContain('@media (max-width:760px){ .tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(2,minmax(0,1fr))} }');
  });

  it('« Modifier » : MONGA entre ADHOC et Salarié ; le reste saisi diminue d’autant ; enregistré ; la page suit (tuiles, tableau, total, graphique), HT et TTC', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=3');
    await cliquer('[data-saisir-gestion-mois="2025-3"]');
    expect([...container.querySelectorAll('[data-saisie-gestion] [data-champ-gestion]')].map((x) => x.getAttribute('data-champ-gestion')))
      .toEqual(['nbLots', 'honorairesHt', 'adhocHt', 'mongaHt', 'resteHt']);
    // 🔴 R3 — les salaires : le total venant de « Les coûts » et le lien, plus de case de saisie
    expect(container.querySelector('[data-saisir-dans-couts="gestion"]')?.getAttribute('href')).toBe('/admin/mon-espace?espace=criterimmo&onglet=couts&couts-tableau=gestion');
    await taper('mongaHt', '500');
    expect((container.querySelector('[data-champ-gestion="resteHt"]') as HTMLInputElement).value).toBe('10546,72');
    await taper('mongaHt', '500,05');
    expect((container.querySelector('[data-champ-gestion="resteHt"]') as HTMLInputElement).value).toBe('10546,67');
    expect(texte('[data-saisie-gestion] form')).toContain('Proposé : 10 546,67 €');
    donneesGlobal.gestion = [{ ...(jeu()[0] as object), mongaHt: 500.05, resteHt: 10546.67 }, jeu()[1]] as unknown as typeof donneesGlobal.gestion;
    await cliquer('[data-enregistrer-gestion]');
    expect(posts.at(-1)).toMatchObject({ action: 'gestion-enregistrer', annee: 2025, mois: 3, gestion: { mongaHt: '500,05', resteHt: '10546,67' } });
    expect([valeur('gestion-monga'), valeur('gestion-net'), texte('[data-mois-gestion="3"] [data-mot="MONGA"]'), texte('[data-mois-gestion="3"] [data-mot="Reste"]'), texte('[data-total-gestion] [data-mot="MONGA"]')])
      .toEqual([50005, 1618463 - 244900 - 50005 - 268891, '500,05 €', '10 546,67 €', '500,05 €']);
    expect(valeur('gestion-honoraires') - valeur('gestion-adhoc') - valeur('gestion-monga') - valeur('gestion-salaries')).toBe(valeur('gestion-net'));
    expect(texte('[data-tuile-n1="gestion-monga"]')).toBe('0 € en 2024 (—)');
    await cliquer('[data-mesure-bouton="monga"]');
    expect(Number(container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="3"] .tdb-barre')!.getAttribute('data-valeur'))).toBe(500.05);
    expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]')).toContain('MONGA HT500,05 €');
    await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
    expect([valeur('gestion-monga'), texte('[data-mois-gestion="3"] [data-mot="MONGA"]'), valeur('gestion-net')])
      .toEqual([60006, '600,06 €', Math.round(1618463 * 1.2) - 293880 - 60006 - 268891]);
  });

  it('Période, Année, Tout : la colonne MONGA et ses totaux ; sans la migration 446 : MONGA à 0, champ grisé ; l’observateur ne peut pas écrire', async () => {
    donneesGlobal.gestion = [{ ...(jeu()[0] as object), mongaHt: 100, resteHt: 10946.72 }, g(4, 2025, 4, { honorairesHt: 1000, mongaHt: 10.5, resteHt: 989.5 }), jeu()[1]] as unknown as typeof donneesGlobal.gestion;
    await ouvrirG('/?vue=mois&annee=2025&mois=4&vue-mois=periode&periode=2025-03,2025-04');
    expect([valeur('gestion-monga'), texte('[data-total-gestion] [data-mot="MONGA"]')]).toEqual([11050, '110,50 €']);
    await cliquer('[data-decouper="annee"]');
    expect(valeur('gestion-monga')).toBe(11050);
    await cliquer('[data-vue="annee"]'); await cliquer('[data-decouper-annees="tout"]');
    expect([texte('[data-annee-gestion="2025"] [data-mot="MONGA"]'), [...container.querySelectorAll('[data-table-gestion-annees] thead th')].map((x) => x.textContent).slice(2, 7)])
      .toEqual(['110,50 €', ['Honoraires', 'ADHOC', 'MONGA', 'Salaires chargés', 'Reste']]); // 🔴 LOT GE5
    // sans la 446 : le champ est grisé, son motif dit
    act(() => { root.unmount(); }); root = createRoot(container);
    delete (donneesGlobal as { monga?: boolean }).monga;
    donneesGlobal.gestion = jeu() as unknown as typeof donneesGlobal.gestion;
    await ouvrirG('/?vue=mois&annee=2025&mois=3');
    await cliquer('[data-saisir-gestion-mois="2025-3"]');
    expect([(container.querySelector('[data-champ-gestion="mongaHt"]') as HTMLInputElement).disabled, texte('[data-saisie-gestion] form')]).toEqual([true, expect.stringContaining('migration 446')]);
    const { ecritureRefuseeObservateur } = await import('../../../../lib/admin/observateur');
    expect([ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/transaction'), ecritureRefuseeObservateur('observateur', 'GET', '/api/admin/transaction')]).toEqual([true, false]);
  });
});

describe('🔴 LOT GE4 — « Gestion » : les onglets du graphique en grille 3 × 2', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const ouvrirG = async (q: string) => { window.history.replaceState(null, '', q); await act(async () => { root.render(createElement(EcranGestion)); }); await calmer(); };
  const onglets = () => [...container.querySelectorAll('[data-bloc="histogramme-mois"] [data-mesure-bouton], [data-bloc="graphe-annees"] [data-mesure-bouton]')];

  it('ligne 1 : CA · CA net · Lots ; ligne 2 : ADHOC · MONGA · Salaires — une grille de 3 colonnes de même largeur ; un seul actif ; l’encadré dit « CA » / « Salaires » ; tuiles et tableau inchangés', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=1');
    expect(onglets().map((x) => [x.getAttribute('data-mesure-bouton'), x.textContent])).toEqual([['honoraires', 'CA'], ['net', 'CA net'], ['lots', 'Lots'], ['adhoc', 'ADHOC'], ['monga', 'MONGA'], ['salaries', 'Salaires']]);
    const { CSS_TRANSACTION } = await import('./commun');
    for (const r of ['[data-ecran-gestion] .tdb-histo-entete-detail .tdb-mesures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:4px;row-gap:4px}',
      '[data-ecran-gestion] .tdb-histo-entete-detail .tdb-mesure{width:100%;min-width:0;padding-left:4px;padding-right:4px;white-space:nowrap;text-align:center}',
      '@media (max-width:420px){ [data-ecran-gestion] .tdb-histo-entete-detail .tdb-mesure{font-size:.9rem} }']) expect(CSS_TRANSACTION).toContain(r);
    expect(onglets().filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.textContent)).toEqual(['CA']);
    expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]')).toContain('CA HT');
    await cliquer('[data-mesure-bouton="salaries"]');
    expect([onglets().filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.textContent), new URLSearchParams(window.location.search).get('mesure')]).toEqual([['Salaires'], 'salaries']);
    // 🔴 LOT CG12 — aucun salaire saisi (ni N−1) : le message à la place du graphique ; l'onglet garde « Salaires » (lot GE5)
    expect(texte('[data-bloc="histogramme-mois"] [data-aucune-donnee]')).toBe('Aucune donnée pour ces filtres');
    // les tuiles et le tableau gardent leurs libellés
    expect([texte('[data-tuile="gestion-honoraires"] .tdb-tuile-mot'), titreSansChoix('[data-tuile="gestion-salaries"] .tdb-tuile-mot'), [...container.querySelectorAll('[data-table-gestion] thead th')].map((x) => x.textContent)[2]])
      .toEqual(['Honoraires de gestion HT — janvier 2025', 'Salaires chargés — janvier 2025', 'Honoraires']); // 🔴 LOT GE5 : sans HT ni TTC ; 🔴 LOT LO12 : le sélecteur sous le titre
  });

  it('les anciens liens (&mesure=honoraires, &mesure=salaries) ; « L’année » : la même grille', async () => {
    await ouvrirG('/?vue=mois&annee=2025&mois=1&mesure=salaries');
    expect(onglets().filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.textContent)).toEqual(['Salaires']);
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrirG('/?vue=annee&annee=2025&mesure=honoraires');
    expect([onglets().map((x) => x.textContent), onglets().filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.textContent)])
      .toEqual([['CA', 'CA net', 'Lots', 'ADHOC', 'MONGA', 'Salaires'], ['CA']]);
  });
});

describe('🔴 LOT GE5 — « Gestion » : « Coûts salariaux chargés » (🔴 LOT LO11 : « Salaires chargés »)', () => {
  it('la tuile (sans HT ni TTC, « (sans TVA) » dessous), la colonne, l’encadré, la fenêtre « Modifier » ; l’onglet garde « Salaires » ; HT et TTC', async () => {
    const avant = donneesGlobal.gestion;
    donneesGlobal.gestion = [{ id: 2, annee: 2025, mois: 3, nbLots: null, honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, resteHt: 11046.72, note: null, origine: 'saisie' }] as unknown as typeof donneesGlobal.gestion;
    try {
      for (const u of ['ht', 'ttc'] as const) {
        window.localStorage.setItem('trx-affichage-montants', u);
        act(() => { root.unmount(); }); root = createRoot(container);
        window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=3&mesure=salaries');
        await act(async () => { root.render(createElement(EcranGestion)); }); await calmer();
        expect([u, titreSansChoix('[data-tuile="gestion-salaries"] .tdb-tuile-mot'), texte('[data-tuile="gestion-salaries"] [data-montant-autre]'), texte('[data-tuile-valeur="gestion-salaries"]')])
          .toEqual([u, 'Salaires chargés — mars 2025', '(sans TVA)', '2 688,91 €']);
        expect([texte('[data-mois-gestion="3"] [data-mot="Salaires chargés"]'), container.querySelector('[data-mesure-bouton="salaries"]')!.textContent]).toEqual(['2 688,91 €', 'Salaires']);
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]')).toContain('Salaires chargés2 688,91 €');
      }
      await act(async () => { (container.querySelector('[data-saisir-gestion-mois="2025-3"]') as HTMLElement).click(); }); await calmer();
      // 🔴 R3 — la fenêtre montre le total des salariés (« Les coûts ») et le lien ; plus de case
      expect(container.querySelector('[data-champ-gestion="salarieHt"]')).toBeNull();
      expect([container.querySelector('[data-salaires-gestion-couts] span')!.textContent, texte('[data-salaires-gestion-total]'), texte('[data-saisir-dans-couts="gestion"]')])
        .toEqual(['Salaires chargés (HT)', '2 688,91 €', 'Saisir dans Les coûts']);
    } finally { donneesGlobal.gestion = avant; window.localStorage.setItem('trx-affichage-montants', 'ht'); }
  });
});

/**
 * 🔴 LOT LO12 — « Gestion » : « Avec salaires | Sans salaires » sous le titre de la tuile « Salaires chargés » (le composant et la mémoire de la
 * FUSION, &salaires=) : Sans, les salaires restent montrés en gris, « non comptés », et ne sont plus déduits (CA net = honoraires − ADHOC − MONGA),
 * partout (tuiles, tableau, graphique) ; Sans = Avec + salaires, au centime, en HT et en TTC.
 */
describe('🔴 LOT LO12 — « Gestion » : avec / sans salaires', () => {
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  it('mars 2025 : Sans = Avec + salaires au centime (HT et TTC) ; tuile grise « non comptés », CA net « hors salaires », tableau, encadré, adresse', async () => {
    const avant = donneesGlobal.gestion;
    donneesGlobal.gestion = [{ id: 2, annee: 2025, mois: 3, nbLots: null, honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, resteHt: 11046.72, note: null, origine: 'saisie' }] as unknown as typeof donneesGlobal.gestion;
    const valeur = (cle: string) => centimesDe(texte(`[data-tuile-valeur="${cle}"]`));
    try {
      for (const u of ['ht', 'ttc'] as const) {
        window.localStorage.setItem('trx-affichage-montants', u);
        window.localStorage.removeItem('trx-fusion-salaires');
        act(() => { root.unmount(); }); root = createRoot(container);
        window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=3&mesure=net');
        await act(async () => { root.render(createElement(EcranGestion)); }); await calmer();
        const avec = { net: valeur('gestion-net'), reste: centimesDe(texte('[data-gestion-reste="2025-3"]')), total: centimesDe(texte('[data-total-gestion-reste]')) };
        expect([u, avec.net, avec.reste, avec.total, new URLSearchParams(window.location.search).get('salaires')]).toEqual([u, u === 'ht' ? 1104672 : 1379385, avec.net, avec.net, 'avec']);
        expect(container.querySelector('[data-tuile="gestion-salaries"] > [data-tuile-choix] [data-salaires-choix="avec"]')).not.toBeNull();
        await cliquer('[data-tuile="gestion-salaries"] [data-salaires="sans"]');
        const sans = { net: valeur('gestion-net'), reste: centimesDe(texte('[data-gestion-reste="2025-3"]')), total: centimesDe(texte('[data-total-gestion-reste]')) };
        expect([sans.net - avec.net, sans.reste - avec.reste, sans.total - avec.total]).toEqual([268891, 268891, 268891]);
        expect([titreSansChoix('[data-tuile="gestion-salaries"] .tdb-tuile-mot'), valeur('gestion-salaries'), container.querySelector('[data-tuile-valeur="gestion-salaries"]')!.className]).toEqual(['Salaires chargés — non comptés — mars 2025', 268891, expect.stringContaining('loc-muet')]);
        expect(texte('[data-tuile="gestion-net"] .tdb-tuile-mot')).toBe(`CA net hors salaires ${u.toUpperCase()} — mars 2025`);
        expect([container.querySelector('[data-gestion-salaires="2025-3"]')!.className, [...container.querySelectorAll('[data-table-gestion] thead th')].map((x) => x.textContent).slice(5, 7)])
          .toEqual(['loc-muet', ['Salaires chargés (non comptés)', 'Reste hors salaires']]);
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]')).toContain('CA net hors salaires');
        expect([new URLSearchParams(window.location.search).get('salaires'), window.localStorage.getItem('trx-fusion-salaires')]).toEqual(['sans', 'sans']);
      }
    } finally { donneesGlobal.gestion = avant; window.localStorage.setItem('trx-affichage-montants', 'ht'); window.localStorage.removeItem('trx-fusion-salaires'); }
  });
});

/** 🔴 LOT LO15 (Arno) — Gestion : une case de salaires vide = « pas encore saisi » : « à saisir » (gris, italique) ; un mois à venir garde « — ». */
describe('🔴 LOT LO15 — « Gestion » : salaires « à saisir »', () => {
  it('2025 (le 27/10) : janvier saisi sans salarié et février non saisi → « à saisir » ; mars saisi → son montant ; novembre → « — » ; le total et l’encadré', async () => {
    const avant = donneesGlobal.gestion;
    donneesGlobal.gestion = [...avant, { id: 2, annee: 2025, mois: 3, nbLots: null, honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, resteHt: 11046.72, note: null, origine: 'saisie' }] as unknown as typeof donneesGlobal.gestion;
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1&mesure=salaries');
      await act(async () => { root.render(createElement(EcranGestion)); }); await calmer();
      for (const m of [1, 2]) {
        const e = container.querySelector(`[data-gestion-salaires="2025-${m}"] [data-salaires-a-saisir]`) as HTMLElement;
        expect([m, e.tagName, e.textContent, e.className]).toEqual([m, 'EM', 'à saisir', 'loc-muet trx-a-saisir']);
      }
      expect(texte('[data-gestion-salaires="2025-3"]')).toBe('2 688,91 €');
      expect(texte('[data-gestion-salaires="2025-11"]')).toBe('—');
      // janvier → octobre commencés, mars seul saisi : 9 mois à saisir sous le total
      expect(texte('[data-total-gestion] [data-salaires-a-saisir-nb]')).toBe('9 mois à saisir');
      expect(texte('[data-bloc="histogramme-mois"] [data-bulle-note]')).toBe('1 mois de salaires à saisir');
    } finally { donneesGlobal.gestion = avant; }
  });
});

describe('🔴 LOT L — le CA global : synthèse par société, puis le global', () => {
  it('CRITERIMMO = vente + location + gestion ; MACJ = vente ; global = la somme des sociétés (et des ventes à attribuer)', async () => {
    const e = { ventes: donneesGlobal.ventes, location: donneesGlobal.location, gestion: donneesGlobal.gestion };
    const lignes = syntheseGlobal(e, 2025);
    const de = (cle: string) => lignes.find((l) => l.cle === cle)!;
    const c = de('criterimmo');
    expect(c.totalHt).toBe((c.venteHt ?? 0) + (c.locationHt ?? 0) + (c.gestionHt ?? 0));
    expect(de('macj').totalHt).toBe(de('macj').venteHt);
    const somme = lignes.filter((l) => l.cle !== 'global').reduce((t, l) => t + l.totalHt, 0);
    expect(de('global').totalHt).toBeCloseTo(somme, 9);
    expect(de('global').totalHt).toBe(celluleGlobal(e, 2025, null).totalHt);
    expect(de('global').totalN1Ht).toBe(celluleGlobal(e, 2024, null).totalHt);
    expect(de('global').previsionnelHt).toBe(previsionnel(e, 2025).totalHt);
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer(); await deplierGlobal();
    expect([...container.querySelectorAll('[data-synthese]')].map((x) => x.getAttribute('data-synthese'))).toEqual(['criterimmo', 'macj', 'global']);
    expect(texte('[data-synthese="criterimmo"] [data-synthese-total]')).toBe('23 423,05 €');
    expect(texte('[data-synthese="global"] [data-synthese-total]')).toBe(texte('[data-total-annee] [data-mot="Total"]'));
  });
});

/**
 * 🔴 LOT CG1 (Arno) — le CA global en « Montants HT | TTC » : le MÊME sélecteur (la mémoire partagée), en haut à droite des filtres ; chaque montant
 * suit le choix ; en TTC, chaque part = sa page d'origine (vente : HT × TVA ; location : Σ TTC des lignes au centime ; gestion : TTC de chaque mois).
 */
describe('🔴 LOT CG1 — le CA global en « HT | TTC »', () => {
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  it('les parts TTC = leurs pages d’origine (même fonction) ; global = somme des lignes ; HT inchangé', async () => {
    const { celluleGlobalEn } = await import('../../../../lib/transaction/globalUnite');
    const { totauxGestion } = await import('../../../../lib/transaction/gestionVue');
    const e = { ventes: donneesGlobal.ventes, location: donneesGlobal.location, gestion: donneesGlobal.gestion as never, locationTtcC: { '2025-01': 1115526 } };
    const ht = celluleGlobalEn(e, 2025, null, 'ht'); const ttc = celluleGlobalEn(e, 2025, null, 'ttc');
    expect(ht).toEqual(celluleGlobal(e, 2025, null));
    expect(ttc.locationHt).toBe(11155.26);
    expect(Math.round(ttc.gestionHt! * 100)).toBe(totauxGestion(donneesGlobal.gestion as never, Array.from({ length: 12 }, (_, i) => ({ annee: 2025, mois: i + 1 }))).honorairesTtcC);
    expect([ttc.venteCriterimmoHt, ttc.venteMacjHt]).toEqual([ht.venteCriterimmoHt * 1.2, ht.venteMacjHt * 1.2]);
    expect(ttc.totalHt).toBeCloseTo(ttc.criterimmoHt + ttc.macjHt + ttc.aAttribuerHt - ttc.interCabinetHt, 9);
    for (const u of ['ht', 'ttc'] as const) {
      const lignes = syntheseGlobal(e, 2025, undefined, u);
      const g = lignes.find((l) => l.cle === 'global')!;
      expect([u, Math.round(lignes.filter((l) => l.cle !== 'global').reduce((t, l) => t + l.totalHt, 0) * 100)]).toEqual([u, Math.round(g.totalHt * 100)]);
    }
  });
  it('le sélecteur en haut à droite des filtres ; la bascule HT ↔ TTC : tuiles (grand + entre parenthèses), titres, synthèse, mois par mois, année par année ; mémoire partagée ; jamais « −0 € »', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
    // 🔴 LOT CG4 — le sélecteur sur la ligne des onglets, à droite ; l'encart de filtres n'existe plus (retrait autorisé par Arno)
    const barre = container.querySelector('[data-ca-global] [data-barre-onglets-global]')!;
    expect([barre.children[0].getAttribute('role'), barre.lastElementChild!.hasAttribute('data-unite-global-onglets')]).toEqual(['tablist', true]);
    expect(barre.querySelector('[data-afficher="ht"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-ca-global] form.tdb-filtres')).toBeNull();
    const lireTout = () => ({
      titre: texte('[data-tuile="global"] .tdb-tuile-mot'), grand: centimesDe(texte('[data-tuile="global"] .tdb-tuile-valeur')), petit: texte('[data-tuile="global"] [data-montant-autre]'),
      synthese: [...container.querySelectorAll('[data-synthese] td')].map((x) => x.textContent), h3: [...container.querySelectorAll('[data-ca-global] h3:not(.trx-bilan-titre):not(#trx-g-graphe)')].map((x) => (x.querySelector('.lr-titre') ?? x).textContent).slice(0, 4) }); // 🔴 LOT CG8 — sans les titres des cadres « Bilan » // 🔴 LOT CG5 — le titre seul (sans le total replié)
    const ht = lireTout();
    expect(ht.titre).toBe('CA global HT (2025)');
    expect(ht.h3).toEqual(['Synthèse 2025 par société, puis le global (HT)', 'Chiffre d’affaires global 2025 mois par mois (HT)', 'Coûts globaux 2025 mois par mois (HT)', 'Résultat net 2025 (HT ; avec salaires)']); // 🔴 LOT CG2 / CG5 / CG7
    await cliquer('[data-afficher="ttc"]');
    const ttc = lireTout();
    expect(window.localStorage.getItem('trx-affichage-montants')).toBe('ttc');
    expect(ttc.titre).toBe('CA global TTC (2025)');
    expect(ttc.h3).toEqual(['Synthèse 2025 par société, puis le global (TTC)', 'Chiffre d’affaires global 2025 mois par mois (TTC)', 'Coûts globaux 2025 mois par mois (TTC ; apporteurs et primes de location, variable et salaires sans TVA)', 'Résultat net 2025 (TTC ; avec salaires)']); // 🔴 LOT CG2 / CG5 / CG7
    // le grand montant TTC, le petit HT (et inversement) : les deux unités de la même cellule
    expect([ht.petit.endsWith('TTC)'), ttc.petit.endsWith('HT)')]).toEqual([true, true]);
    expect(centimesDe(ht.petit)).toBe(ttc.grand);
    expect(centimesDe(ttc.petit)).toBe(ht.grand);
    // la synthèse : celle de la fonction, dans l'unité ; chaque montant TTC
    const e = { ventes: donneesGlobal.ventes, location: donneesGlobal.location, gestion: donneesGlobal.gestion as never };
    const s = syntheseGlobal(e, 2025, undefined, 'ttc');
    expect(centimesDe(texte('[data-synthese="global"] [data-synthese-total]'))).toBe(Math.round(s.find((l) => l.cle === 'global')!.totalHt * 100));
    expect(centimesDe(texte('[data-total-annee] [data-mot="Total"]'))).toBe(ttc.grand);
    expect(centimesDe(texte('[data-annee-global="2025"] [data-mot="Réalisé"]'))).toBe(ttc.grand);
    expect(container.textContent).not.toMatch(/[−-]0\u00a0€/);
    // le choix est partagé : une autre page (même clé), et le retour en HT
    await cliquer('[data-afficher="ht"]');
    expect(lireTout()).toEqual(ht);
  });
});

/**
 * 🔴 LOT CG2 (Arno) — « Coûts globaux [année] mois par mois », sous le CA : colonnes par activité, Total = somme des colonnes, N−1 et écart inversé ;
 * « Avec | Sans salaires » partagé ; « à saisir » ; le défilement horizontal et la colonne Mois fixe ; le même tableau année par année.
 */
describe('🔴 LOT CG2 — les coûts globaux du CA global', () => {
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  it('titres, groupes, total = somme des colonnes (HT et TTC), N−1, écart inversé, « à saisir », Avec | Sans salaires partagé, année par année', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.localStorage.removeItem('trx-fusion-salaires');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
    expect(texte('#trx-g-mois-titre')).toBe('Chiffre d’affaires global 2025 mois par mois (HT)');
    expect(texte('#trx-g-couts-titre')).toBe('Coûts globaux 2025 mois par mois (HT)');
    const table = container.querySelector('[data-table-couts="global-couts"]')!;
    expect([...table.querySelectorAll('[data-groupe-couts]')].map((x) => x.getAttribute('data-groupe-couts'))).toEqual(['vente', 'location', 'gestion', 'total']); // 🔴 LOT CG3
    expect([...table.querySelectorAll('thead tr:first-child th')].map((x) => x.textContent)).toEqual(['Mois', 'Vente (CRITERIMMO + MACJ)', 'Location', 'Gestion', 'Total et comparaison']); // 🔴 LOT CG3 — le 4ᵉ bloc
    expect([...table.querySelectorAll('thead tr:last-child th')].slice(-3).map((x) => x.textContent)).toEqual(['Total coûts', '2024', 'Écart']);
    expect([...table.querySelectorAll('tbody tr')].map((x) => x.getAttribute('data-rangee-couts'))).toEqual([...Array.from({ length: 12 }, (_, i) => `2025-${i + 1}`), '2025']);
    expect(table.querySelector('[data-total-couts]')!.className).toBe('tdb-fort trx-ligne-total');
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.trx-couts-defile{overflow-x:auto;');
    expect(css).toContain('.trx-table-groupes thead tr:first-child th:first-child,.trx-table-groupes tbody th:first-child{position:sticky;left:0;'); // 🔴 LOT CG3
    const total = (r: Element) => centimesDe(r.querySelector('[data-cout="total"]')!.textContent!);
    const colonnes = (r: Element) => ['vente-commissions', 'vente-apporteurs', 'vente-exterieures', 'location-apporteurs', 'location-primes', 'location-variable', 'location-salaires', 'gestion-adhoc', 'gestion-monga', 'gestion-salaires']
      .reduce((t, k) => { const c = r.querySelector(`[data-cout="${k}"] > span:not(.loc-muet)`); return t + (c === null ? 0 : centimesDe(c.textContent!)); }, 0);
    for (const u of ['ht', 'ttc'] as const) {
      if (u === 'ttc') await cliquer('[data-afficher="ttc"]');
      for (const r of table.querySelectorAll('tbody tr')) { if (r.querySelector('[data-cout="total"]')!.textContent !== '—') expect([u, r.getAttribute('data-rangee-couts'), colonnes(r)]).toEqual([u, r.getAttribute('data-rangee-couts'), total(r)]); }
    }
    expect(texte('#trx-g-couts-titre')).toContain('(TTC ;');
    // la gestion de janvier 2025 : salarié non saisi → « à saisir » ; un mois à venir (décembre, le 27/10/2025) : « — »
    expect(texte('[data-rangee-couts="2025-1"] [data-cout="gestion-salaires"]')).toBe('à saisir');
    expect(texte('[data-rangee-couts="2025-12"] [data-cout="total"]')).toBe('—');
    // l'écart inversé : une hausse des coûts en rouge
    const r = [...table.querySelectorAll('tbody tr')].find((x) => x.querySelector('[data-cout="ecart"]')!.textContent!.startsWith('+') && !x.querySelector('[data-cout="ecart"]')!.textContent!.startsWith('+0'));
    if (r !== undefined) expect(r.querySelector('[data-cout="ecart"]')!.className).toContain('tdb-signe--negatif');
    // « Avec | Sans salaires » : la mémoire partagée de Location / Gestion / FUSION
    await cliquer('[data-bloc="global-couts"] [data-salaires="sans"]');
    expect([window.localStorage.getItem('trx-fusion-salaires'), texte('#trx-g-couts-titre')]).toEqual(['sans', 'Coûts globaux 2025 mois par mois (TTC ; apporteurs et primes de location, variable et salaires sans TVA ; hors salaires)']);
    // année par année : une ligne par année
    expect([...container.querySelectorAll('[data-table-couts="global-couts-annees"] tbody tr')].map((x) => x.getAttribute('data-rangee-couts'))).toEqual(['2024', '2025']);
    window.localStorage.removeItem('trx-fusion-salaires');
  });
});

/**
 * 🔴 LOT CG3 (Arno) — le CA global : la ligne des années et « Année | Période | Tout » de la vente (anciens liens « ?annee= » compris) ; Période = la
 * somme des années, au centime ; les tableaux « … [période] année par année » ; le titre des coûts et « Avec | Sans salaires » sur une ligne ; les blocs.
 */
describe('🔴 LOT CG3 — le CA global : Année | Période | Tout, blocs', () => {
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const valeur = (k: string) => centimesDe(texte(`[data-tuile="${k}"] .tdb-tuile-valeur`));
  it('un ancien lien « ?annee=2025 » : Année 2025, les tableaux mois par mois ; Période 2024 + 2025 = la somme des années (HT et TTC, avec et sans salaires) ; Tout : sans comparaison', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.localStorage.removeItem('trx-fusion-salaires');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
    expect(container.querySelector('[data-choix-annees]')!.getAttribute('data-choix-annees')).toBe('annee');
    expect(container.querySelector('[data-onglet-annee="2025"]')!.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-filtre="annee"]')).toBeNull(); // le champ « Année » est remplacé (accord d'Arno)
    expect(container.querySelector('[data-barre-onglets-global] [data-unite-global-onglets] [data-afficher="ht"]')).not.toBeNull(); // 🔴 LOT CG4
    expect([texte('#trx-g-mois-titre'), texte('#trx-g-couts-titre')]).toEqual(['Chiffre d’affaires global 2025 mois par mois (HT)', 'Coûts globaux 2025 mois par mois (HT)']);
    const parAnnee: Record<string, Record<string, number>> = {};
    for (const u of ['ht', 'ttc'] as const) {
      if (u === 'ttc') await cliquer('[data-afficher="ttc"]');
      for (const a of [2024, 2025]) {
        await cliquer(`[data-onglet-annee="${a}"]`);
        parAnnee[`${u}${a}`] = { global: valeur('global'), criterimmo: valeur('criterimmo'), macj: valeur('macj'),
          couts: centimesDe(texte('[data-total-couts] [data-cout="total"]')) };
      }
    }
    // Période : 2024 et 2025 choisies
    await cliquer('[data-decouper-annees="periode"]');
    if (container.querySelector('[data-onglet-annee="2024"]')!.getAttribute('aria-pressed') !== 'true') await cliquer('[data-onglet-annee="2024"]');
    await deplierGlobal(); // 🔴 LOT CG5 — les tableaux de la période arrivent repliés
    expect(new URLSearchParams(window.location.search).get('vue-annee')).toBe('periode');
    expect(new URLSearchParams(window.location.search).get('annees')).toBe('2024,2025');
    for (const u of ['ttc', 'ht'] as const) {
      if (u === 'ht') await cliquer('[data-afficher="ht"]');
      for (const k of ['global', 'criterimmo', 'macj'] as const) expect([u, k, valeur(k)]).toEqual([u, k, parAnnee[`${u}2024`][k] + parAnnee[`${u}2025`][k]]);
      expect(centimesDe(texte('[data-total-couts] [data-cout="total"]'))).toBe(parAnnee[`${u}2024`].couts + parAnnee[`${u}2025`].couts);
    }
    expect(texte('#trx-g-annees-periode-titre')).toBe('Chiffre d’affaires global 2024 → 2025 année par année (HT)');
    expect(texte('#trx-g-couts-titre')).toBe('Coûts globaux 2024 → 2025 année par année (HT)');
    expect([...container.querySelectorAll('[data-annee-periode-global]')].map((x) => x.getAttribute('data-annee-periode-global'))).toEqual(['2024', '2025', 'total']);
    expect(centimesDe(texte('[data-annee-periode-global="total"] [data-mot="Total"]'))).toBe(valeur('global'));
    expect(container.querySelector('[data-bloc="global-mois"]')).toBeNull();
    // « Sans salaires » : la période = la somme des années aussi
    await cliquer('[data-bloc="global-couts-periode"] [data-salaires="sans"]');
    const sansP = centimesDe(texte('[data-total-couts] [data-cout="total"]'));
    const sansA = [...container.querySelectorAll('[data-table-couts="global-couts-periode"] tbody tr:not([data-total-couts]) [data-cout="total"]')].reduce((t, x) => t + centimesDe(x.textContent!), 0);
    expect(sansP).toBe(sansA);
    // Tout : aucune comparaison
    await cliquer('[data-decouper-annees="tout"]'); await deplierGlobal();
    expect(texte('[data-tuile="global"] .tdb-tuile-n1')).toBe('Toutes les années (2024 → 2025)');
    expect([texte('[data-synthese="global"] [data-mot="Écart"]'), texte('[data-annee-periode-global="total"] [data-mot="Écart"]'), texte('[data-total-couts] [data-cout="ecart"]')]).toEqual(['—', '—', '—']);
    window.localStorage.removeItem('trx-fusion-salaires');
  });
  it('le titre des coûts et « Avec | Sans salaires » sur une ligne (téléphone : dessous) ; les blocs Vente · Location · Gestion · Total dans les deux tableaux', async () => {
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
    // 🔴 LOT CG5 — la ligne d'en-tête repliable : le titre (h3) et, sur la même ligne, « Avec | Sans salaires »
    const tete = container.querySelector('[data-bloc="global-couts"] .lr-ligne')!;
    expect([tete.children[0].tagName, tete.children[1].querySelector('[data-couts-tete] [data-salaires-choix]') !== null]).toEqual(['H3', true]);
    for (const t of ['[data-table-global]', '[data-table-couts="global-couts"]']) {
      const table = container.querySelector(t)!;
      expect([t, [...table.querySelectorAll('colgroup.trx-g')].map((x) => x.getAttribute('data-bloc-colonnes'))]).toEqual([t, ['vente', 'location', 'gestion', 'total']]);
      expect([...table.querySelectorAll('colgroup.trx-g--fond')].map((x) => x.getAttribute('data-bloc-colonnes'))).toEqual(['vente', 'gestion']);
      expect(table.closest('.trx-table-defile')).not.toBeNull();
      expect(table.className).toContain('trx-table-groupes');
    }
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.trx-table-groupes colgroup.trx-g{border-left:2px solid var(--color-svv-line-strong)}');
    expect(css).toContain('.trx-table-groupes colgroup.trx-g--fond{background:color-mix(in srgb, var(--color-svv-ink) 4%, transparent)}');
    expect(css).toContain('@media (max-width:640px){ .trx-couts-tete{flex-direction:column;align-items:flex-start}');
    expect(css).toContain('.tdb-table.trx-table-groupes{display:table;width:auto}'); // téléphone : le vrai tableau, qui défile (pas de cartes)
  });
});

/**
 * 🔴 LOT CG4 (Arno) — le CA global : « Montants HT | TTC » sur la ligne des onglets, à droite, actif sur les deux onglets ; l'encart de filtres vide
 * retiré (accord d'Arno) ; une année sans donnée comptée (la seule date butoir d'un compromis) n'est pas sur la ligne des années (règle du lot DH).
 */
describe('🔴 LOT CG4 — le CA global : sélecteur sur la ligne des onglets, années comptées', () => {
  it('2027 présente par la seule date butoir d’un compromis : absente de la ligne des années ; le sélecteur à droite des onglets, sur les deux onglets', async () => {
    const avant = donneesGlobal.ventes;
    donneesGlobal.ventes = [...avant, { id: 9927, societe: 'criterimmo', statut: 'compromis', annee: 2027, mois: 1, honorairesTtc: 7500, libelle: 'COMPROMIS 2027' }] as typeof avant;
    try {
      window.localStorage.setItem('trx-affichage-montants', 'ht');
      window.history.replaceState(null, '', '/?annee=2025');
      await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
      expect([...container.querySelectorAll('[data-onglet-annee]')].map((x) => x.getAttribute('data-onglet-annee'))).toEqual(['2024', '2025']);
      // la ligne des années vient juste sous les onglets (plus d'encart de filtres)
      const barre = container.querySelector('[data-barre-onglets-global]')!;
      expect(barre.nextElementSibling!.getAttribute('data-decoupage-annees')).toBe('annee');
      // « Année par année » garde toutes les années (comme « Toute l'histoire » du lot DH)
      expect(container.querySelector('[data-annee-global="2027"]')).not.toBeNull();
      for (const o of ['compromis', 'ca'] as const) {
        await act(async () => { (container.querySelector(`[data-vue="${o}"]`) as HTMLElement).click(); }); await calmer();
        expect([o, container.querySelectorAll('[data-afficher]').length, container.querySelector('[data-barre-onglets-global] [data-afficher="ht"]') !== null]).toEqual([o, 2, true]);
      }
      const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
      expect(css).toContain('.trx-vues-barre{display:flex;flex-wrap:wrap;');
      expect(css).toContain('.trx-unite-onglets{display:flex;align-items:center;gap:8px;margin-left:auto;');
    } finally { donneesGlobal.ventes = avant; }
  });
});

/**
 * 🔴 LOT CG5 (accord d'Arno) — sous la synthèse, chaque tableau est REPLIÉ à l'arrivée sur une ligne (triangle rouge, titre, total à droite) ; un clic
 * l'ouvre, un autre le referme, plusieurs peuvent être ouverts ; « Avec | Sans salaires » reste utilisable replié ; « Chiffre d'affaires année par année ».
 */
describe('🔴 LOT CG5 — le CA global : tableaux repliés à l’arrivée', () => {
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const etats = () => [...container.querySelectorAll('[data-ca-global] [data-deplier-liste]')].map((b) => [b.getAttribute('data-deplier-liste'), b.getAttribute('aria-expanded')]);
  const grandTotal = (section: string) => centimesDe(texte(`[data-total-liste="${section}"] [data-montant-grand]`));
  it('tous repliés à l’arrivée ; ouvrir / fermer d’un clic ; plusieurs ouverts ; totaux des lignes = totaux des tableaux (HT et TTC) ; salaires replié ; Période / Tout', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.localStorage.removeItem('trx-fusion-salaires');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect(etats()).toEqual([['global-mois', 'false'], ['global-couts', 'false'], ['global-resultat', 'false'], ['global-annees', 'false'], ['global-couts-annees', 'false'], ['global-resultat-annees', 'false']]); // 🔴 LOT CG7 — les deux lignes « Résultat net »
    expect([container.querySelector('[data-table-global]'), container.querySelector('[data-table-couts]'), container.querySelector('[data-table-global-annees]')]).toEqual([null, null, null]);
    // la synthèse et les tuiles : toujours ouvertes
    expect([container.querySelector('[data-table-synthese]') !== null, container.querySelector('[data-tuile="global"]') !== null]).toEqual([true, true]);
    expect(texte('#trx-g-annees-titre')).toBe('Chiffre d’affaires année par année (HT ; réalisé et prévisionnel)');
    expect(texte('#trx-g-couts-annees-titre')).toBe('Coûts globaux année par année (HT)');
    // « Avec | Sans salaires » replié : il agit sans déplier
    const avant = grandTotal('global-couts');
    await cliquer('[data-a-droite-liste="global-couts"] [data-salaires="sans"]');
    expect([etats()[1][1], window.localStorage.getItem('trx-fusion-salaires'), texte('#trx-g-couts-titre')]).toEqual(['false', 'sans', 'Coûts globaux 2025 mois par mois (HT ; hors salaires)']);
    expect(grandTotal('global-couts')).toBeLessThanOrEqual(avant);
    await cliquer('[data-a-droite-liste="global-couts"] [data-salaires="avec"]');
    // ouvrir deux tableaux : les deux restent ouverts ; les totaux des lignes = ceux des tableaux
    for (const u of ['ht', 'ttc'] as const) {
      if (u === 'ttc') await cliquer('[data-barre-onglets-global] [data-afficher="ttc"]');
      if (container.querySelector('[data-deplier-liste="global-mois"]')!.getAttribute('aria-expanded') === 'false') await cliquer('[data-deplier-liste="global-mois"]');
      if (container.querySelector('[data-deplier-liste="global-couts"]')!.getAttribute('aria-expanded') === 'false') await cliquer('[data-deplier-liste="global-couts"]');
      expect(etats().slice(0, 2)).toEqual([['global-mois', 'true'], ['global-couts', 'true']]);
      expect([u, grandTotal('global-mois')]).toEqual([u, centimesDe(texte('[data-total-annee] [data-mot="Total"]'))]);
      expect([u, grandTotal('global-couts')]).toEqual([u, centimesDe(texte('[data-total-couts] [data-cout="total"]'))]);
      await cliquer('[data-deplier-liste="global-annees"]'); await cliquer('[data-deplier-liste="global-couts-annees"]');
      const realise = [...container.querySelectorAll('[data-annee-global] [data-mot="Réalisé"]')].reduce((t, x) => t + centimesDe(x.textContent!), 0);
      const couts = [...container.querySelectorAll('[data-table-couts="global-couts-annees"] tbody [data-cout="total"]')].reduce((t, x) => t + centimesDe(x.textContent!), 0);
      expect([u, grandTotal('global-annees'), grandTotal('global-couts-annees')]).toEqual([u, realise, couts]);
      // un clic referme
      await cliquer('[data-deplier-liste="global-annees"]'); await cliquer('[data-deplier-liste="global-couts-annees"]');
      expect(etats().filter((x) => x[0] === 'global-annees' || x[0] === 'global-couts-annees')).toEqual([['global-annees', 'false'], ['global-couts-annees', 'false']]);
      expect(container.querySelector('[data-table-global-annees]')).toBeNull();
    }
    // Période : les tableaux de la période arrivent repliés, avec leur total
    await cliquer('[data-decouper-annees="periode"]');
    await cliquer('[data-onglet-annee="2024"]');
    expect(etats().slice(0, 2)).toEqual([['global-annees-periode', 'false'], ['global-couts-periode', 'false']]);
    expect(grandTotal('global-annees-periode')).toBe(centimesDe(texte('[data-tuile="global"] .tdb-tuile-valeur')));
    await cliquer('[data-decouper-annees="tout"]');
    expect(etats().slice(0, 2).map((x) => x[0])).toEqual(['global-annees-periode', 'global-couts-periode']);
    // focus visible et vrai bouton (Entrée / Espace)
    const b = container.querySelector('[data-deplier-liste="global-annees-periode"]')!;
    expect([b.tagName, b.getAttribute('type')]).toEqual(['BUTTON', 'button']);
    expect([...container.querySelectorAll('style')].map((x) => x.textContent).join('')).toContain('.lr-bascule:focus-visible{outline:2px solid var(--color-svv-red)');
    window.localStorage.removeItem('trx-fusion-salaires');
  });
});

/**
 * 🔴 LOT CG6 (Arno) — les lignes repliées : le total dans une colonne de largeur commune, au bord droit (les totaux exactement les uns sous les autres) ;
 * « Avec | Sans salaires » à gauche du total ; les tuiles : CRITERIMMO · MACJ · CA global · Prévisionnel.
 */
describe('🔴 LOT CG6 — le CA global : totaux alignés, sélecteur à gauche du total, ordre des tuiles', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  it('chaque ligne repliée : triangle · titre · (sélecteur) · total, dans la même grille ; Année / Période / Tout ; HT et TTC ; avec et sans salaires', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.localStorage.removeItem('trx-fusion-salaires');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect([...container.querySelectorAll('[data-ca-global] .tdb-tuiles [data-tuile]')].map((x) => x.getAttribute('data-tuile'))).toEqual(['criterimmo', 'macj', 'global', 'previsionnel']);
    const lignes = () => [...container.querySelectorAll('[data-ca-global] [data-deplier-liste]')].map((b) => b.closest('.lr-ligne')!);
    const verifier = () => {
      const ls = lignes();
      expect(ls.length).toBe(6); // 🔴 LOT CG7 — avec les deux lignes « Résultat net »
      for (const l of ls) {
        const enfants = [...l.children].map((x) => x.className.split(' ')[0]);
        const section = l.querySelector('[data-deplier-liste]')!.getAttribute('data-deplier-liste')!;
        expect([section, l.className, enfants.at(-1), l.lastElementChild!.getAttribute('data-total-liste')]).toEqual([section, 'lr-ligne lr-ligne--colonne', 'lr-total', section]);
        // le sélecteur des salaires (lignes des coûts) : juste à gauche du total
        if (section.includes('couts') || section.includes('resultat')) expect([section, enfants]).toEqual([section, ['lr-h', 'lr-a-droite', 'lr-total']]);
        else expect([section, enfants]).toEqual([section, ['lr-h', 'lr-total']]);
        expect(l.querySelector('[data-deplier-liste] [data-total-liste]')).toBeNull(); // le total hors du bouton, dans sa colonne
      }
    };
    verifier();
    await cliquer('[data-barre-onglets-global] [data-afficher="ttc"]'); verifier();
    await cliquer('[data-a-droite-liste="global-couts"] [data-salaires="sans"]'); verifier();
    await cliquer('[data-decouper-annees="periode"]'); verifier();
    await cliquer('[data-decouper-annees="tout"]'); verifier();
    // le total reste cliquable : il ouvre / referme comme la ligne
    await cliquer('[data-total-liste="global-annees"]');
    expect(container.querySelector('[data-deplier-liste="global-annees"]')!.getAttribute('aria-expanded')).toBe('true');
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.lr-ligne--colonne{display:grid;grid-template-columns:minmax(0,1fr) auto 14rem;');
    expect(css).toContain('.lr-ligne--colonne>.lr-total-col{grid-column:3;grid-row:1;justify-self:stretch;display:flex;justify-content:flex-end;');
    expect(css).toContain('@media (max-width:640px){\n  .lr-ligne--colonne{grid-template-columns:minmax(0,1fr) 9.5rem}');
    window.localStorage.removeItem('trx-fusion-salaires');
  });
});

/**
 * 🔴 LOT CG7 (Arno) — « Résultat net [période] » après les coûts de la période, « Résultat net année par année » après les coûts année par année :
 * CA − coûts (les totaux des lignes au-dessus), HT | TTC, avec | sans salaires ; repliée, un clic ouvre le détail ; la somme des lignes = le total.
 */
describe('🔴 LOT CG7 — le CA global : Résultat net', () => {
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const grand = (section: string) => centimesDe(texte(`[data-total-liste="${section}"] [data-montant-grand]`));
  const petit = (section: string) => centimesDe(texte(`[data-total-liste="${section}"] [data-montant-petit]`));
  it('placées après les coûts ; résultat = CA − coûts (HT / TTC, avec / sans salaires, Année / Période / Tout) ; détail : somme des lignes = total', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.localStorage.removeItem('trx-fusion-salaires');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect([...container.querySelectorAll('[data-ca-global] [data-deplier-liste]')].map((b) => b.getAttribute('data-deplier-liste')))
      .toEqual(['global-mois', 'global-couts', 'global-resultat', 'global-annees', 'global-couts-annees', 'global-resultat-annees']);
    const sec = container.querySelector('[data-bloc="global-resultat"]')!;
    expect(sec.className).toContain('trx-resultat-net');
    expect(texte('#trx-g-resultat-titre')).toBe('Résultat net 2025 (HT ; avec salaires)');
    expect(texte('[data-total-liste="global-resultat"]').startsWith('=')).toBe(true);
    const verifier = (u: string, paires: [string, string, string][]) => {
      for (const [res, ca, couts] of paires) {
        expect([u, res, grand(res)]).toEqual([u, res, grand(ca) - grand(couts)]);
        expect([u, res, petit(res)]).toEqual([u, res, petit(ca) - petit(couts)]);
        expect(texte(`[data-a-droite-liste="${res}"] [data-resultat-net-calcul]`).replace(/\s/g, ' ')).toContain(`CA ${texte(`[data-total-liste="${ca}"] [data-montant-grand]`).replace(/\s?(HT|TTC)$/, '').replace(/\s/g, ' ')} − coûts`);
      }
    };
    const annee: [string, string, string][] = [['global-resultat', 'global-mois', 'global-couts'], ['global-resultat-annees', 'global-annees', 'global-couts-annees']];
    verifier('ht', annee);
    await cliquer('[data-a-droite-liste="global-couts"] [data-salaires="sans"]');
    expect(texte('#trx-g-resultat-titre')).toBe('Résultat net 2025 (HT ; hors salaires)');
    verifier('ht-sans', annee);
    await cliquer('[data-barre-onglets-global] [data-afficher="ttc"]');
    verifier('ttc-sans', annee);
    await cliquer('[data-a-droite-liste="global-couts"] [data-salaires="avec"]');
    verifier('ttc', annee);
    // le détail : une ligne par mois (+ « Hors mois » s'il y a lieu), son total en trame grise ; la somme des lignes = le total = la ligne
    await cliquer('[data-deplier-liste="global-resultat"]');
    const corps = container.querySelector('[data-table-resultat-net="global-resultat"]')!;
    const lignes = [...corps.querySelectorAll('tbody tr:not([data-total-resultat-net-ligne])')];
    expect(lignes.length).toBeGreaterThanOrEqual(12);
    const totalLigne = corps.querySelector('[data-total-resultat-net-ligne]')!;
    expect(totalLigne.className).toBe('tdb-fort trx-ligne-total');
    for (const k of ['ca', 'couts', 'net'] as const) {
      expect([k, lignes.reduce((t, l) => t + centimesDe(l.querySelector(`[data-resultat-net="${k}"]`)!.textContent!), 0)]).toEqual([k, centimesDe(totalLigne.querySelector(`[data-resultat-net="${k}"]`)!.textContent!)]);
    }
    expect(centimesDe(totalLigne.querySelector('[data-resultat-net="net"]')!.textContent!)).toBe(grand('global-resultat'));
    expect([...corps.querySelectorAll('colgroup.trx-g')].map((x) => x.getAttribute('data-bloc-colonnes'))).toEqual(['resultat', 'comparaison']);
    // les mentions : les mois de salaires à saisir (la gestion de 2025 n'a pas de salarié saisi)
    expect(texte('[data-bloc="global-resultat"] [data-mention-a-saisir]')).toContain('mois de salaires à saisir');
    // Période et Tout : la ligne de la période, CA − coûts de la période
    await cliquer('[data-decouper-annees="periode"]'); await cliquer('[data-onglet-annee="2024"]');
    expect(texte('#trx-g-resultat-titre')).toBe('Résultat net 2024 → 2025 (TTC ; avec salaires)');
    verifier('periode', [['global-resultat-periode', 'global-annees-periode', 'global-couts-periode']]);
    await cliquer('[data-decouper-annees="tout"]');
    verifier('tout', [['global-resultat-periode', 'global-annees-periode', 'global-couts-periode']]);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.trx-resultat-net{border-color:var(--color-svv-line-strong);box-shadow:inset 0 0 0 1px var(--color-svv-line-strong);background:color-mix(in srgb, var(--color-svv-ink) 7%, var(--color-svv-surface))}');
    window.localStorage.removeItem('trx-fusion-salaires');
  });
});

/**
 * 🔴 LOT CG8 (Arno) — deux cadres « Bilan » : [période] (CA global · Coûts globaux · Résultat net) et « année par année » (les mêmes, toutes les
 * années) ; « − » et « = » discrets entre les lignes ; « Ventes à attribuer » hors des cadres, en bas ; repli, salaires et colonne des totaux inchangés.
 */
describe('🔴 LOT CG8 — le CA global : les cadres « Bilan »', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const cadre = (b: string) => container.querySelector(`[data-ca-global] [data-bilan="${b}"]`)!;
  const contenu = (b: string) => [...cadre(b).children].filter((x) => x.tagName !== 'STYLE').map((x) => x.getAttribute('data-bilan-signe') ?? x.getAttribute('data-bloc') ?? x.className);
  it('deux cadres et leurs trois lignes dans l’ordre ; titres en Année / Période / Tout ; HT et TTC ; avec et sans salaires ; « Ventes à attribuer » dehors', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.localStorage.removeItem('trx-fusion-salaires');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    const verifier = (titre: string, p: [string, string, string]) => {
      expect(texte('#trx-g-bilan')).toBe(titre);
      expect(contenu('periode')).toEqual(['trx-bilan-titre', p[0], 'moins', p[1], 'egal', p[2]]);
      expect(texte('#trx-g-bilan-annees')).toBe('Bilan — année par année');
      expect(contenu('annees')).toEqual(['trx-bilan-titre', 'global-annees', 'moins', 'global-couts-annees', 'egal', 'global-resultat-annees']);
      expect([...cadre('periode').querySelectorAll('[data-bilan-signe]')].map((x) => x.textContent)).toEqual(['−', '=']);
      // les six lignes gardent la même grille de totaux (lot CG6)
      expect(container.querySelectorAll('[data-ca-global] [data-bilan] .lr-ligne--colonne').length).toBe(6);
      // « Ventes à attribuer » (s'il y en a) : hors des cadres, après eux
      expect(container.querySelector('[data-bilan] [data-groupe-double]')).toBeNull();
      const groupe = container.querySelector('[data-ca-global] [data-groupe-double]');
      if (groupe !== null) expect(cadre('annees').compareDocumentPosition(groupe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    };
    const annee: [string, string, string] = ['global-mois', 'global-couts', 'global-resultat'];
    verifier('Bilan 2025 — mois par mois', annee);
    await cliquer('[data-barre-onglets-global] [data-afficher="ttc"]'); verifier('Bilan 2025 — mois par mois', annee);
    await cliquer('[data-a-droite-liste="global-couts"] [data-salaires="sans"]'); verifier('Bilan 2025 — mois par mois', annee);
    await cliquer('[data-decouper-annees="periode"]'); await cliquer('[data-onglet-annee="2024"]');
    verifier('Bilan 2024 → 2025', ['global-annees-periode', 'global-couts-periode', 'global-resultat-periode']);
    await cliquer('[data-decouper-annees="tout"]');
    verifier('Bilan — toutes les années', ['global-annees-periode', 'global-couts-periode', 'global-resultat-periode']);
    // le repli et le sélecteur des salaires : inchangés dans le cadre
    expect(container.querySelector('[data-deplier-liste="global-couts-periode"]')!.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-a-droite-liste="global-couts-periode"] [data-salaires="avec"]')).not.toBeNull();
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.trx-bilan{display:flex;flex-direction:column;border:1px solid var(--color-svv-line-strong);border-radius:16px;');
    expect(css).toContain('background:color-mix(in srgb, var(--color-svv-ink) 3%, var(--color-svv-surface))}');
    window.localStorage.removeItem('trx-fusion-salaires');
  });
});

/**
 * 🔴 LOT CG9 (Arno) — le graphique du CA global, sous les tuiles : les filtres par famille (dans l'adresse), une ou plusieurs séries ; les valeurs
 * relues dans les tableaux du Bilan (tout coché = les totaux, mois par mois) ; N−1 = les mêmes filtres un an plus tôt.
 */
describe('🔴 LOT CG9 — le CA global : le graphique filtré', () => {
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const graphe = () => container.querySelector('[data-bloc="global-graphe"]')!;
  it('placé sous les tuiles et avant la Synthèse ; tout coché = le CA du Bilan mois par mois (HT et TTC) ; N−1 hachuré ; filtres dans l’adresse ; réinitialiser', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.localStorage.removeItem('trx-fusion-salaires');
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
    const tuiles = container.querySelector('[data-ca-global] .tdb-tuiles')!;
    expect(tuiles.nextElementSibling!.getAttribute('data-bloc')).toBe('global-graphe');
    expect(graphe().nextElementSibling!.getAttribute('data-bloc')).toBe('global-synthese');
    // 🔴 D25 — la ligne « Famille » (l'ancienne « Activité », fusionnée avec les coûts)
    expect([...graphe().querySelectorAll('[data-famille-filtre]')].map((x) => x.getAttribute('data-famille-filtre'))).toEqual(['mesure', 'structure', 'famille', 'comparer', 'affichage']);
    for (const u of ['ht', 'ttc'] as const) {
      if (u === 'ttc') await cliquer('[data-barre-onglets-global] [data-afficher="ttc"]');
      // chaque barre = le total du mois du tableau « Chiffre d'affaires global » (les mois commencés)
      for (const b of [...graphe().querySelectorAll('[data-barre-mois-global]')]) {
        const m = b.getAttribute('data-barre-mois-global'); const r = b.querySelector('.tdb-barre');
        if (r === null) continue;
        // 🔴 LOT CG11 — après décembre, « Mois à confirmer » : la ligne du même nom du tableau
        expect([u, m, Math.round(Number(r.getAttribute('data-valeur')) * 100)]).toEqual([u, m, centimesDe(texte(m === '13' ? '[data-mois-a-confirmer] [data-mot="Total"]' : `[data-mois-global="${m}"] [data-mot="Total"]`))]);
      }
      expect(graphe().querySelectorAll('.tdb-barre-n1').length).toBe(13);
    }
    // Mesure = Coûts : la famille « Coûts » apparaît ; Comparer = Familles ; l'adresse garde les filtres
    await cliquer('[data-filtre-graphe="Mesure"] [data-choix-graphe="couts"]');
    // 🔴 D25 — en « Coûts » : chaque famille a son compteur et s'ouvre sur SES coûts ; aucune liste ouverte au départ
    expect(graphe().querySelector('[data-liste-couts]')).toBeNull();
    expect(texte('[data-compteur-famille="vente"]')).toBe('5/5');
    await cliquer('[data-filtre-graphe="Comparer"] [data-choix-graphe="familles"]');
    expect(new URLSearchParams(window.location.search).get('g-mesure')).toBe('couts');
    expect(new URLSearchParams(window.location.search).get('g-comparer')).toBe('familles');
    expect(graphe().querySelector('[data-graphe-global-series]')!.getAttribute('data-graphe-global-series')).toBe('empile');
    // chaque série = sa colonne du tableau des coûts, et leur somme = le total des coûts du mois (septembre, au repos)
    const sept = (k: string) => centimesDe(texte(`[data-rangee-couts="2025-9"] [data-cout="${k}"]`));
    const serie = (cle: string) => Math.round(Number(graphe().querySelector(`[data-point-global="9"] [data-barre-serie="${cle}"]`)?.getAttribute('data-valeur') ?? 0) * 100);
    expect(serie('commissions')).toBe(sept('vente-commissions'));
    expect(serie('adhoc')).toBe(sept('gestion-adhoc'));
    const somme = [...graphe().querySelectorAll('[data-point-global="9"] [data-barre-serie]')].reduce((t, x) => t + Math.round(Number(x.getAttribute('data-valeur')) * 100), 0);
    expect(somme).toBe(sept('total'));
    // côte à côte
    await cliquer('[data-filtre-graphe="Barres"] [data-choix-graphe="cote"]');
    expect(graphe().querySelector('[data-graphe-global-series]')!.getAttribute('data-graphe-global-series')).toBe('cote');
    // les choix impossibles : grisés avec leur raison
    await cliquer('[data-case-graphe="criterimmo"]');
    const loc = graphe().querySelector('[data-case-graphe="location"]') as HTMLInputElement;
    expect([loc.disabled, loc.closest('[title]')!.getAttribute('title')]).toEqual([true, 'La location et la gestion sont à CRITERIMMO : cochez « CRITERIMMO ».']);
    // réinitialiser : le réglage par défaut, l'adresse nettoyée
    await cliquer('[data-reinitialiser-filtres]');
    expect(['g-mesure', 'g-comparer', 'g-structures'].map((k) => new URLSearchParams(window.location.search).get(k))).toEqual([null, null, null]);
    expect(texte('[data-filtres-graphe-bouton]')).toBe('Filtres (0 actif)');
  });
  it('Résultat net Location + Gestion en cumul : la courbe ; Structures entre elles ; Période : une barre par année ; un lien partagé rouvre les filtres', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.history.replaceState(null, '', '/?annee=2025&g-mesure=net&g-activites=location,gestion&g-cumul=1');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect(graphe().querySelector('[data-choix-graphe="net"]')!.getAttribute('aria-pressed')).toBe('true');
    expect((graphe().querySelector('[data-case-graphe="vente"]') as HTMLInputElement).checked).toBe(false);
    expect(graphe().querySelector('[data-courbe]')).not.toBeNull();
    expect(texte('[data-filtres-graphe-bouton]')).toBe('Filtres (3 actifs)');
    await cliquer('[data-filtre-graphe="Comparer"] [data-choix-graphe="structures"]');
    expect([...graphe().querySelectorAll('[data-legende-serie]')].map((x) => x.getAttribute('data-legende-serie'))).toEqual(['criterimmo']); // 🔴 LOT CG10 — plus de « Ventes à attribuer » ; 🔴 LOT CG12 — MACJ (aucune location ni gestion : tout à 0) ni tracée ni dans la légende
    await cliquer('[data-decouper-annees="periode"]'); await cliquer('[data-onglet-annee="2024"]');
    expect([...graphe().querySelectorAll('[data-point-global]')].map((x) => x.getAttribute('data-point-global'))).toEqual(['2024', '2025']);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.trx-gf-panneau{display:none}\n  .trx-gf-panneau--ouvert{display:flex}'); // téléphone : panneau repliable
  });
});

/**
 * 🔴 LOT CG10 (Arno) — le graphique : plus de « Ventes à attribuer » (mention de leur montant sous le graphique) ; « Location et Gestion : Séparées |
 * Réunies » (une seule case, une seule série « Location & Gestion »), dans l'adresse, la réinitialisation et le compteur.
 */
describe('🔴 LOT CG10 — le graphique : ventes à attribuer hors du graphique, Location & Gestion réunies', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const graphe = () => container.querySelector('[data-bloc="global-graphe"]')!;
  const valeur = (sel: string) => Math.round(Number(graphe().querySelector(sel)?.getAttribute('data-valeur') ?? 0) * 100);
  it('pas de case « Ventes à attribuer » ; un ancien lien qui la contient : ignoré ; la mention de leur montant', async () => {
    const avant = donneesGlobal.ventes;
    // une vente notée chez les deux sociétés (à attribuer) en 2025
    donneesGlobal.ventes = [...avant, { id: 9901, societe: 'criterimmo', statut: 'vendue', annee: 2025, mois: 3, honorairesTtc: 6000, libelle: 'DOUBLE', double: { cle: 'd1', attribution: null } },
      { id: 9902, societe: 'macj', statut: 'vendue', annee: 2025, mois: 3, honorairesTtc: 6000, libelle: 'DOUBLE', double: { cle: 'd1', attribution: null } }] as typeof avant;
    try {
      window.localStorage.setItem('trx-affichage-montants', 'ttc');
      window.history.replaceState(null, '', '/?annee=2025&g-structures=criterimmo,macj,a_attribuer');
      await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
      expect([...graphe().querySelectorAll('[data-filtre-graphe="Structure"] [data-case-graphe]')].map((x) => x.getAttribute('data-case-graphe'))).toEqual(['criterimmo', 'macj']);
      expect(texte('[data-filtres-graphe-bouton]')).toBe('Filtres (0 actif)');
      expect(texte('[data-hors-ventes-a-attribuer]')).toBe('Hors ventes à attribuer : 6 000 € TTC (comptées dans le Bilan)');
    } finally { donneesGlobal.ventes = avant; }
  });
  it('Réunies : une case « Location & Gestion » ; une série = Location + Gestion, côte à côte et en cumul ; adresse, compteur, réinitialiser', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.history.replaceState(null, '', '/?annee=2025&g-comparer=activites&g-empile=non');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect([...graphe().querySelectorAll('[data-legende-serie]')].map((x) => x.getAttribute('data-legende-serie'))).toEqual(['vente', 'location', 'gestion']);
    const sep = (mois: number) => valeur(`[data-point-global="${mois}"] [data-barre-serie="location"]`) + valeur(`[data-point-global="${mois}"] [data-barre-serie="gestion"]`);
    const avantSep = [1, 6, 9].map(sep);
    await cliquer('[data-filtre-graphe="Location et Gestion"] [data-choix-graphe="reunies"]');
    expect([...graphe().querySelectorAll('[data-filtre-graphe="Activité"] [data-case-graphe]')].map((x) => x.getAttribute('data-case-graphe'))).toEqual(['vente', 'location_gestion']);
    expect([...graphe().querySelectorAll('[data-legende-serie]')].map((x) => x.textContent)).toEqual(['Vente', 'Location & Gestion']);
    expect([1, 6, 9].map((m) => valeur(`[data-point-global="${m}"] [data-barre-serie="location_gestion"]`))).toEqual(avantSep);
    expect(graphe().querySelectorAll('[data-point-global="9"] [data-barre-serie]').length).toBe(2); // une seule barre pour les deux
    expect(new URLSearchParams(window.location.search).get('g-lg')).toBe('reunies');
    expect(texte('[data-filtres-graphe-bouton]')).toBe('Filtres (3 actifs)');
    // en cumul : une seule courbe « Location & Gestion »
    await cliquer('[data-filtre-graphe="Période"] [data-choix-graphe="cumul"]');
    expect([...graphe().querySelectorAll('[data-trait-serie]')].map((x) => x.getAttribute('data-trait-serie'))).toEqual(['vente', 'location_gestion']);
    // décocher la case unique : la location et la gestion sortent toutes deux
    await cliquer('[data-case-graphe="location_gestion"]');
    expect(new URLSearchParams(window.location.search).get('g-activites')).toBe('vente');
    await cliquer('[data-reinitialiser-filtres]');
    expect([new URLSearchParams(window.location.search).get('g-lg'), texte('[data-filtres-graphe-bouton]')]).toEqual([null, 'Filtres (0 actif)']);
  });
});

/**
 * 🔴 LOT CG11 (Arno) — la fin d'année du graphique = le total de l'année (tuiles, Bilan) : les ventes signées sans mois (« mois à confirmer ») forment
 * un point après décembre, présent seulement quand il est non nul ; l'encadré à droite : les séries par valeur décroissante, égalité alphabétique.
 */
describe('🔴 LOT CG11 — le graphique : « Mois à confirmer », fin d’année = total de l’année ; encadré trié', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const graphe = () => container.querySelector('[data-bloc="global-graphe"]')!;
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const cents = (x: Element | null): number => Math.round(Number(x?.getAttribute('data-valeur') ?? 0) * 100);
  it('une vente sans mois en 2024 : la barre « à conf. » ; somme des barres = tuile = Bilan (HT, TTC) ; Cumul au repos = la fin d’année ; sans elle, pas de point', async () => {
    const avant = donneesGlobal.ventes;
    donneesGlobal.ventes = [...avant, { id: 9911, societe: 'criterimmo', statut: 'vendue', annee: 2024, mois: null, honorairesTtc: 15000, libelle: 'SANS MOIS' }] as typeof avant;
    try {
      window.localStorage.setItem('trx-affichage-montants', 'ht');
      window.history.replaceState(null, '', '/?annee=2024');
      await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
      for (const u of ['ht', 'ttc'] as const) {
        if (u === 'ttc') await cliquer('[data-barre-onglets-global] [data-afficher="ttc"]');
        const tuile = centimesDe(texte('[data-tuile="global"] .tdb-tuile-valeur'));
        expect(centimesDe(texte('[data-total-annee] [data-mot="Total"]'))).toBe(tuile);
        expect(graphe().getAttribute('data-mois-hors')).toBe('a-confirmer');
        const barres = [...graphe().querySelectorAll('[data-barre-mois-global]')];
        expect(barres.map((b) => b.getAttribute('data-barre-mois-global'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
        expect(barres[12].querySelector('.tdb-axe')!.textContent).toBe('à conf.');
        expect(cents(barres[12].querySelector('.tdb-barre'))).toBe(u === 'ht' ? 1250000 : 1500000);
        expect([u, barres.reduce((t, b) => t + cents(b.querySelector('.tdb-barre')), 0)]).toEqual([u, tuile]);
        // Cumul : au repos, la fin d'année (mois à confirmer compris) = la tuile
        await cliquer('[data-filtre-graphe="Période"] [data-choix-graphe="cumul"]');
        expect(cents(graphe().querySelector('[data-point-cumul="13"]'))).toBe(tuile);
        expect(texte('[data-bloc="global-graphe"] .tdb-bulle-titre')).toBe(`Cumul 2024 — fin d’année (mois à confirmer compris) (${u.toUpperCase()})`); // 🔴 LOT CG12 — l'unité
        // plusieurs séries, en cumul : la fin d'année de chaque structure, et le total
        await cliquer('[data-filtre-graphe="Comparer"] [data-choix-graphe="structures"]');
        const fin = [...graphe().querySelectorAll('[data-point-global="13"] [data-point-serie]')].reduce((t, x) => t + cents(x), 0);
        expect(fin).toBe(tuile);
        await cliquer('[data-reinitialiser-filtres]');
      }
    } finally { donneesGlobal.ventes = avant; }
    // sans vente sans mois : pas de 13e point (les 12 mois, comme avant)
    window.history.replaceState(null, '', '/?annee=2024');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect(graphe().querySelector('[data-barre-mois-global="13"]')).toBeNull();
    expect(graphe().hasAttribute('data-mois-hors')).toBe(false);
  });
  it('l’encadré : les séries par valeur décroissante (au repos et au survol), égalité alphabétique ; Total en bas ; la légende garde son ordre', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.history.replaceState(null, '', '/?annee=2025&g-comparer=activites');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    const lignes = () => [...graphe().querySelectorAll('[data-detail-serie]')].map((x) => ({ cle: x.getAttribute('data-detail-serie')!, v: centimesDe(x.querySelector('.tdb-bulle-montant')!.textContent!) }));
    const trie = (xs: { v: number }[]) => xs.every((x, j) => j === 0 || xs[j - 1].v >= x.v);
    expect(trie(lignes())).toBe(true);
    expect(graphe().querySelector('[data-bulle="sous"]')!.lastElementChild!.hasAttribute('data-detail-total-global')).toBe(true);
    // janvier (location et gestion importées) : survolé, l'ordre se recalcule
    await act(async () => { graphe().querySelector('[data-point-global="1"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); await calmer();
    expect(trie(lignes())).toBe(true);
    expect(lignes().map((x) => x.cle)).toEqual(['gestion', 'location', 'vente'].sort((a, b) => {
      const v = (c: string) => lignes().find((x) => x.cle === c)!.v; return v(b) - v(a) || a.localeCompare(b, 'fr');
    }));
    expect([...graphe().querySelectorAll('[data-legende-serie]')].map((x) => x.getAttribute('data-legende-serie'))).toEqual(['vente', 'location', 'gestion']);
  });
});

/**
 * 🔴 LOT CG12 (Arno) — présentation des graphiques du Suivi CA : une série toute à 0 ni tracée ni dans la légende ; l'encadré sans ligne à 0 (les
 * négatives restent ; Total et N−1 toujours) ; « Aucune donnée pour ces filtres » ; « Réinitialiser » sur la ligne « Affichage » ; +15 % de hauteur ;
 * l'unité dans le titre de l'encadré.
 */
describe('🔴 LOT CG12 — graphiques : zéros masqués, réinitialiser, hauteur, unité', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const graphe = () => container.querySelector('[data-bloc="global-graphe"]')!;
  const val = (x: Element) => Number(x.getAttribute('data-valeur'));
  it('Familles de coûts : la légende et les barres sans famille toute à 0 ; l’encadré sans ligne à 0 ; Total en bas ; le titre avec l’unité', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    window.history.replaceState(null, '', '/?annee=2025&g-mesure=couts&g-comparer=familles');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    const legende = [...graphe().querySelectorAll('[data-legende-serie]')].map((x) => x.getAttribute('data-legende-serie')!);
    expect(legende.length).toBeGreaterThan(0);
    expect(legende.length).toBeLessThan(10); // des familles à 0 toute l'année : retirées
    for (const c of legende) expect([c, [...graphe().querySelectorAll(`[data-barre-serie="${c}"]`)].some((x) => val(x) !== 0)]).toEqual([c, true]);
    expect(graphe().querySelectorAll('[data-barre-serie]').length).toBe([...graphe().querySelectorAll('[data-point-global]')].reduce((t, p) => t + p.querySelectorAll('[data-barre-serie]').length, 0));
    await act(async () => { graphe().querySelector('[data-point-global="1"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); await calmer();
    const lignes = [...graphe().querySelectorAll('[data-detail-serie] .tdb-bulle-montant')].map((x) => x.textContent!);
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) expect(l).not.toBe('0 €');
    expect(graphe().querySelector('[data-bulle="sous"]')!.lastElementChild!.hasAttribute('data-detail-total-global')).toBe(true);
    expect(texte('[data-bloc="global-graphe"] [data-titre-detail]')).toBe('Janvier 2025 (HT)');
    await cliquer('[data-barre-onglets-global] [data-afficher="ttc"]');
    expect(texte('[data-bloc="global-graphe"] [data-titre-detail]')).toMatch(/\(TTC\)$/);
  });
  it('une valeur négative reste (ligne et barre) ; plus aucune valeur : « Aucune donnée pour ces filtres »', async () => {
    const avant = donneesGlobal.ventes;
    donneesGlobal.ventes = [...avant, { id: 9921, societe: 'macj', statut: 'vendue', annee: 2023, mois: 5, honorairesTtc: -1200, libelle: 'AVOIR' }] as typeof avant;
    try {
      window.localStorage.setItem('trx-affichage-montants', 'ht');
      window.history.replaceState(null, '', '/?annee=2023&g-structures=macj&g-activites=vente&g-comparer=structures');
      await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
      await act(async () => { graphe().querySelector('[data-point-global="5"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); await calmer();
      expect(graphe().querySelector('[data-point-global="5"] [data-barre-serie="macj"]')!.getAttribute('data-valeur')).toBe('-1000');
      expect(texte('[data-bloc="global-graphe"] [data-detail-serie="macj"] .tdb-bulle-montant')).toBe('-1 000 €');
    } finally { donneesGlobal.ventes = avant; }
    // aucune famille de coûts cochée : plus aucune valeur — le message, à la place du graphique ; le panneau des filtres reste
    await act(async () => { root.render(createElement('div')); }); // un nouvel écran : les filtres relus dans l'adresse
    window.history.replaceState(null, '', '/?annee=2025&g-mesure=couts&g-comparer=familles');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    // 🔴 D25 — « Aucun » se fait famille par famille
    for (const fam of ['vente', 'location', 'gestion']) { await cliquer(`[data-ouvrir-famille="${fam}"]`); await cliquer(`[data-familles-aucun="${fam}"]`); }
    expect(texte('[data-bloc="global-graphe"] [data-aucune-donnee]')).toBe('Aucune donnée pour ces filtres');
    expect(graphe().querySelector('[data-filtres-graphe]')).not.toBeNull();
  });
  it('« Réinitialiser les filtres » sur la ligne « Affichage », à droite ; la zone de tracé +15 % ; plus de point « arrondi »', async () => {
    window.history.replaceState(null, '', '/?annee=2025&g-comparer=activites');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect(graphe().querySelector('[data-famille-filtre="affichage"] [data-reinitialiser-filtres]')).not.toBeNull();
    expect(graphe().querySelector('[data-filtres-graphe] > [data-reinitialiser-filtres]')).toBeNull();
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.trx-gf-reinit{margin-left:auto;font-size:.8rem}');
    expect(css).toContain('.trx-gf-reinit{margin-left:0;align-self:flex-end}'); // téléphone : sous les boutons, à droite
    const { HAUSSE_TRACE } = await import('../location/TableauBordSuivi');
    expect(HAUSSE_TRACE).toBe(1.15);
    expect(graphe().querySelector('svg')!.getAttribute('viewBox')).toBe(`0 0 640 ${16 + 28 + 186 * 1.15}`);
    expect([...graphe().querySelectorAll('.tdb-axe')].map((x) => x.textContent)).not.toContain('arrondi');
  });
});

describe('🔴 LOT Q — « Le mois » et « L’année » : seuls les indépendants sont déduits ; les internes et les inconnus, à part', () => {
  it('MYLENE salariée : sa paye n’est plus déduite, elle s’affiche « Internes — non déduits » ; son statut dans l’espace par négociateur', async () => {
    const avant = donnees.statutsNegociateurs;
    donnees.statutsNegociateurs = { MYLENE: 'salarie' };
    try {
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
      await calmer();
      // 11 025 − 1 200 (apporteur), ÷ 1,2 : la paye de Mylène (3 215) n'est plus déduite.
      expect(texte('[data-reste-agence]')).toBe('9 187,50 €'); // 🔴 LOT CH : la rétrocession « à répartir » (1 200 TTC) n'est plus déduite — dite à part
      expect(texte('[data-total-hors-resultat]')).toBe('1 000 € HT (1 200 € TTC)');
      expect(texte('[data-paye-deduite]')).toBe('0 €');
      expect(texte('[data-internes-non-deduits]')).toBe('2 679,17 €');
      // 🔴 LOT CC — la carte : sa commission, NON comptabilisée (salariée) : en gris, pas en rouge
      expect(texte('[data-vente="1"] [data-nego-com]')).toBe('2 679,17 €');
      expect(container.querySelector('[data-vente="1"] [data-nego-com]')!.parentElement!.className).not.toContain('trx-rouge');
      await act(async () => { (container.querySelector('[data-bloc="negociateurs-mois"] button') as HTMLElement).click(); });
      expect(texte('[data-statut-negociateur="MYLENE"]')).toBe('Salarié — paye interne, non déduite');
    } finally { donnees.statutsNegociateurs = avant; }
  });
  it('statut inconnu : non déduit et SIGNALÉ', async () => {
    const avant = donnees.statutsNegociateurs;
    donnees.statutsNegociateurs = { MYLENE: null };
    try {
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
      await calmer();
      expect(texte('[data-a-renseigner-non-deduits]')).toBe('2 679,17 €');
      await act(async () => { (container.querySelector('[data-bloc="negociateurs-mois"] button') as HTMLElement).click(); });
      expect(texte('[data-statut-negociateur="MYLENE"]')).toBe('à renseigner — paye non déduite');
    } finally { donnees.statutsNegociateurs = avant; }
  });
});

describe('🔴 LOT R — l’inter-cabinet dans « Le mois » et le CA global', () => {
  // HEIDIDON signée en janvier 2025 : CRITERIMMO (Arnaud, entrée) porte 4 000 TTC ; MACJ (Pierre, indépendant) reçoit 50 %.
  const parties = [
    { sorte: 'entree' as const, compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' as const },
    { sorte: 'sortie' as const, compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const }];
  const heididon = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, repartition: { retroApporteurTtc: 0, apporteurInterne: true, parties },
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: '2025-01-15', entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] },
    lignes: [{ ...ligne('Pierre Thevenin', 'negociateur', 1000), cote: 'sortie', origine: 'saisie' }] });

  it('CA global : CRITERIMMO 3 333,33 + MACJ 1 666,67 − 1 666,67 neutralisé = 3 333,33 HT, une seule fois ; la ligne « Inter-cabinet entre nos sociétés »', () => {
    const e = { ventes: [heididon], location: null, gestion: [] };
    const lignes = syntheseGlobal(e, 2025);
    expect(lignes.map((l) => l.cle)).toEqual(['criterimmo', 'macj', 'inter_cabinet', 'global']);
    const de = (cle: string) => lignes.find((l) => l.cle === cle)!;
    expect(de('inter_cabinet').libelle.replace(/\s/g, ' ')).toBe('Inter-cabinet entre nos sociétés : 1 666,67 € (neutralisé)');
    // 🔴 LOT CG1 — chaque part au centime (le montant affiché), les totaux en sont la somme
    expect([de('criterimmo').totalHt, de('macj').totalHt, de('global').totalHt, de('global').venteHt]).toEqual([3333.33, 1666.67, 3333.33, 3333.33]);
  });

  // 🔴 LOT CG1 — en TTC : les mêmes lignes, chaque vente au TTC de sa page (HT × TVA), l'inter-cabinet neutralisé une fois, global = somme des lignes
  it('🔴 LOT CG1 — CA global en TTC : CRITERIMMO 4 000 + MACJ 2 000 − 2 000 neutralisé = 4 000 TTC ; global = la somme des lignes', () => {
    const e = { ventes: [heididon], location: null, gestion: [] };
    const lignes = syntheseGlobal(e, 2025, undefined, 'ttc');
    const de = (cle: string) => lignes.find((l) => l.cle === cle)!;
    expect(lignes.map((l) => [l.cle, Math.round(l.totalHt * 100)])).toEqual([['criterimmo', 400000], ['macj', 200000], ['inter_cabinet', -200000], ['global', 400000]]);
    expect(de('inter_cabinet').libelle.replace(/\s/g, ' ')).toBe('Inter-cabinet entre nos sociétés : 2 000 € (neutralisé)');
    expect(Math.round(lignes.filter((l) => l.cle !== 'global').reduce((t, l) => t + l.totalHt, 0) * 100)).toBe(Math.round(de('global').totalHt * 100));
  });

  // 🔴 LOT CG2 — les coûts de la vente (page FUSION) : l'inter-cabinet entre nos sociétés n'est jamais un coût ; CA − coûts = le CA net de la page
  it('🔴 LOT CG2 — coûts de la vente : commission de Pierre (1 000 TTC), pas d’inter-cabinet ; CA 4 000 − coûts = CA net FUSION', async () => {
    const { coutsVente, coutsGlobaux } = await import('../../../../lib/transaction/coutsGlobal');
    const { caNetVente } = await import('../../../../lib/transaction/carteAffaireLignes');
    const c = coutsVente([heididon]);
    expect([c.ca.ttcC, c.commissions.ttcC, c.apporteurs.ttcC, c.exterieures.ttcC]).toEqual([400000, 100000, 0, 0]);
    for (const k of ['htC', 'ttcC'] as const) expect(c.ca[k] - c.commissions[k] - c.apporteurs[k] - c.exterieures[k]).toBe(caNetVente(heididon, null)[k]);
    const g = coutsGlobaux({ ventes: [heididon], retrocessions: [], location: null, gestion: [] }, 2025, 1);
    expect([g.total.ttcC, g.vente.net.ttcC]).toEqual([100000, 300000]);
  });

  it('« Le mois » de MACJ : la ligne miroir (sa part, jamais 4 000), « Voir la vente d’origine » au lieu de « Modifier » ; le reste déduit Pierre', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const m = venteDansSociete(heididon, 'macj')!;
    const avant = donnees.ventes;
    const retros = donnees.retrocessions;
    donnees.ventes = [m];
    donnees.retrocessions = [];
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
      await calmer();
      const row = '[data-cartes-ventes] [data-vente="38"]';
      expect(texte(`${row} [data-carte="titre"]`)).toContain('HEIDIDON — inter-cabinet reçu de CRITERIMMO');
      // 🔴 LOT CA — la carte miroir de l'onglet Compromis : sa part en grand ; « Voir la vente d'origine » est dans la fiche.
      expect(texte(`${row} [data-carte="commission-ht"]`)).toBe('1 666,67 € HT');
      expect(texte(row)).not.toContain('4 000');
      expect(container.querySelector(`${row} [data-modifier-vente]`)).toBeNull();
      expect(container.querySelector(`${row} [data-voir-origine]`)).toBeNull();
      await act(async () => { (container.querySelector('[data-vente="38"] .tdb-replie-ligne') as HTMLElement).click(); }); await calmer();
      expect(container.querySelector('[data-vente="38"] [data-contenu-replie] [data-voir-origine="38"]')!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=38');
      // Reste : 1 666,67 − 833,33 (Pierre, 1 000 TTC, indépendant) = 833,33 HT
      expect(texte('[data-reste-agence]')).toBe('833,34 €'); // 🔴 LOT CH : la somme des cartes, au centime (part 1 666,67 − commission 833,33);
    } finally { donnees.ventes = avant; donnees.retrocessions = retros; }
  });

  it('« Le mois » de CRITERIMMO (porteuse) : le CA de la vente, et « − Inter-cabinet vers nos autres sociétés »', async () => {
    const avant = donnees.ventes;
    const avantS = donnees.societe;
    const retros = donnees.retrocessions;
    donnees.retrocessions = [];
    donnees.ventes = [heididon];
    donnees.societe = 'criterimmo';
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); });
      await calmer();
      // 🔴 LOT BZ — « CA de la vente » quitte la ligne repliée : la répartition de la fiche dépliée le dit (CA de la porteuse, part de MACJ).
      expect(container.querySelector('[data-cartes-ventes] [data-part-vente]')).toBeNull();
      const lire = globalThis.fetch;
      globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => (String(url).includes('vue=references') ? { ok: true, status: 200, json: async () => ({ etat: 'ok',
        data: { disponible: true, lotD: true, negociateurs: [{ id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' }, { id: 8, nom: 'Pierre Thevenin', societe: 'macj' }], apporteurs: [], personnes: [] } }) }
        : lire(url, init))) as unknown as typeof fetch;
      act(() => { root.unmount(); }); root = createRoot(container);
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); }); await calmer();
      await act(async () => { (container.querySelector('[data-vente="38"] .tdb-replie-ligne') as HTMLElement).click(); }); await calmer();
      expect(texte('[data-vente="38"] [data-contenu-replie]')).toContain('CA de CRITERIMMO (société porteuse du mandat)');
      expect(texte('[data-inter-cabinet-mois]')).toBe('1 666,67 €');
      // Reste : 3 333,33 − 1 666,67 ; Pierre (MACJ) n'est pas déduit chez CRITERIMMO
      expect(texte('[data-reste-agence]')).toBe('1 666,66 €'); // 🔴 LOT CH : la somme des cartes (part de l'agence de l'entrée, centimes du lot AH);
      expect(texte('[data-paye-deduite]')).toBe('0 €');
    } finally { donnees.ventes = avant; donnees.societe = avantS; donnees.retrocessions = retros; }
  });
});

describe('🔴 LOT AY / CL — « Espace par négociateur » : CA généré, Com, Rétrocessions, CA net (= la somme des « reste » de ses cartes)', () => {
  // HEIDIDON signée en janvier 2025 : CRITERIMMO (Arnaud, associé non commissionné, entrée — comme en recette) porte 4 000 TTC ; MACJ (Pierre,
  // indépendant) reçoit 50 % et touche 1 000 TTC.
  const parties = [
    { sorte: 'entree' as const, compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' as const, commissionne: false },
    { sorte: 'sortie' as const, compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const }];
  const heididon = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, repartition: { retroApporteurTtc: 0, apporteurInterne: true, parties },
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: '2025-01-15', entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] },
    lignes: [{ ...ligne('Pierre Thevenin', 'negociateur', 1000), cote: 'sortie', origine: 'saisie' }] });
  const ouvrirEspace = async () => { await act(async () => { (container.querySelector('[data-bloc="negociateurs-mois"] button') as HTMLElement).click(); }); };

  it('CRITERIMMO : Arnaud (associé) — sa part 1 666,66 € HT (centimes du lot AH), CA net = reste ; Pierre (MACJ) : 0 € (reversé) ; total CA net = Reste à l’agence', async () => {
    const [avant, avantS, retros] = [donnees.ventes, donnees.societe, donnees.retrocessions];
    donnees.ventes = [heididon]; donnees.societe = 'criterimmo'; donnees.retrocessions = [];
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); });
      await calmer(); await ouvrirEspace();
      expect([...container.querySelectorAll('[data-table-negociateurs] thead th')].map((x) => x.textContent))
        .toEqual(['Négociateur', 'Statut', 'Ventes', 'CA HT généré▲▼', 'Com HT', 'Rétrocessions HT', 'CA net HT▲▼']); // 🔴 LOT CL (▲▼ : le tri du lot CO)
      expect(texte('[data-ca-genere="Arnaud Jorel"]')).toBe('1 666,66 €'); // LOT BA : la part de l'entrée au centime du lot AH (celle de la Répartition)
      expect(texte('[data-ca-net="Arnaud Jorel"]')).toBe('1 666,66 €');
      expect([texte('[data-ca-genere="Pierre Thevenin"]'), texte('[data-ca-net="Pierre Thevenin"]')]).toEqual(['0 €', '0 €']); // reversé à MACJ
      expect(texte('[data-reste-agence]')).toBe('1 666,66 €'); // 🔴 LOT CH : la somme des cartes (centimes du lot AH)
      expect(texte('[data-total-ca-net]')).toBe(texte('[data-reste-agence]'));
    } finally { donnees.ventes = avant; donnees.societe = avantS; donnees.retrocessions = retros; }
  });

  it('MACJ (ligne miroir) : Pierre (indépendant) — CA généré 1 666,67 € HT, Com 833,33 € (rouge, comptabilisée), CA net 833,34 € = reste', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const [avant, retros] = [donnees.ventes, donnees.retrocessions];
    donnees.ventes = [venteDansSociete(heididon, 'macj')!]; donnees.retrocessions = [];
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
      await calmer(); await ouvrirEspace();
      expect([texte('[data-ca-genere="Pierre Thevenin"]'), texte('[data-com-espace="Pierre Thevenin"]'), texte('[data-ca-net="Pierre Thevenin"]')]).toEqual(['1 666,67 €', '833,33 €', '833,34 €']);
      expect(container.querySelector('[data-com-espace="Pierre Thevenin"]')!.closest('.trx-rouge')).not.toBeNull();
      expect(texte('[data-reste-agence]')).toBe('833,34 €'); // 🔴 LOT CH : la somme des cartes, au centime
      expect(texte('[data-total-ca-net]')).toBe(texte('[data-reste-agence]'));
    } finally { donnees.ventes = avant; donnees.retrocessions = retros; }
  });
});

describe('🔴 LOT BS — « Le mois » en trois modes : Vendu | Compromis | Vendu + compromis ; le graphique de la Location (CA | Nombre)', () => {
  // Janvier 2025 : la vente 1 signée (11 025 TTC) ; deux compromis datés de janvier (6 000 en cours, 3 600 passé en acte en mars) ; un annulé
  // daté de janvier (jamais compté) ; deux compromis sans date (CALMET 25 000, 2 400) ; janvier 2024 : un compromis daté (1 200), signé en février 2024.
  const compromisDates = [
    vente(11, { libelle: 'COMPROMIS EN COURS', honorairesTtc: 6000, statut: 'compromis', mois: null, dateCompromis: '2025-01-10', lignes: [ligne('CEDRIC', 'negociateur', 500)] }),
    vente(12, { libelle: 'COMPROMIS PUIS ACTE', honorairesTtc: 3600, statut: 'vendue', mois: 3, dateCompromis: '2025-01-20', lignes: [ligne('MYLENE', 'negociateur', 600)] }),
    vente(13, { libelle: 'ANNULÉ', honorairesTtc: 9000, statut: 'annulee', mois: null, dateCompromis: '2025-01-05' }),
    vente(14, { libelle: 'SANS DATE', honorairesTtc: 2400, statut: 'compromis', mois: null }),
    vente(15, { libelle: 'N-1', honorairesTtc: 1200, statut: 'vendue', annee: 2024, mois: 2, dateCompromis: '2024-01-15' }),
  ];
  let avant: Vente[];
  beforeEach(() => { avant = donnees.ventes; donnees.ventes = [...avant, ...compromisDates]; try { window.localStorage.removeItem('trx-mois-mode'); } catch { /* */ } });
  afterEach(() => { donnees.ventes = avant; try { window.localStorage.removeItem('trx-mois-mode'); } catch { /* */ } });
  const ouvrir = async (adresse = '/?vue=mois&annee=2025&mois=1') => {
    act(() => { root.unmount(); }); root = createRoot(container);
    window.history.replaceState(null, '', adresse);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
  };
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const tuile = (cle: string) => [texte(`[data-tuile="${cle}"] .tdb-tuile-mot`), texte(`[data-tuile="${cle}"] .tdb-tuile-valeur`), texte(`[data-tuile="${cle}"] .tdb-tuile-n1`)];

  it('les règles (PUR) : date du compromis, annulés exclus, un compromis passé en acte compte au mois de son compromis ; « tous » = vendu + compromis, au centime, mois par mois', async () => {
    const M = await import('../../../../lib/transaction/modele');
    const v = donnees.ventes;
    expect(M.compromisDuMois(v, 2025, 1).map((x) => x.id)).toEqual([11, 12]);
    expect(M.compromisSansDate(v, 2025).map((x) => x.id)).toEqual([3, 14]);
    const vendu = M.caHtParMois(v, 2025, 'macj'); const comp = M.caHtCompromisParMois(v, 2025, 'macj'); const tous = M.caHtParMoisMode(v, 2025, 'macj', 'tous', JOUR_DQ);
    expect(M.caHtParMoisMode(v, 2025, 'macj', 'vendu', JOUR_DQ)).toEqual(vendu);
    // 🔴 LOT BT — « tous » = vendu + compromis EN COURS seulement (la 12, passée en acte en mars, n'y compte qu'en mars, dans le vendu).
    const enCours = Array.from({ length: 12 }, (_, i) => M.compromisEnCoursDuMois(v, 2025, i + 1, JOUR_DQ).reduce((t, x) => t + M.caHt(x, 'macj'), 0));
    for (let i = 0; i < 12; i++) expect(tous[i]).toBe(vendu[i] + enCours[i]);
    expect([comp[0], enCours[0], vendu[0], vendu[2]]).toEqual([9600 / 1.2, 6000 / 1.2, 11025 / 1.2, 3600 / 1.2]);
    expect(M.nombreParMoisMode(v, 2025, 'tous', JOUR_DQ).slice(0, 3)).toEqual([2, 1, 1]);
    const d = { ...donnees, ventes: v };
    const T = M.totauxMoisMode(d, 2025, 1, 'tous', JOUR_DQ); const Tv = M.totauxMois(d, 2025, 1);
    const Tc = M.totaux(M.compromisEnCoursDuMois(v, 2025, 1, JOUR_DQ), [], 'macj', undefined);
    expect([T.caHt, T.nbVentes, T.resteHt]).toEqual([Tv.caHt + Tc.caHt, Tv.nbVentes + Tc.nbVentes, Tv.resteHt + Tc.resteHt]);
    expect(M.totauxMoisMode(d, 2025, 1, 'vendu', JOUR_DQ)).toEqual(Tv);
  });

  it('par défaut « Vendu » : l’écran d’avant au centime ; le sélecteur à trois positions dans la barre des filtres', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('[data-filtre="mode"] [data-mode-mois]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]))
      .toEqual([['Vendu', 'true'], ['Compromis', 'false'], ['Vendu + compromis', 'false']]);
    expect(container.querySelector('[data-filtre="mode"]')!.closest('form.tdb-filtres')).not.toBeNull();
    expect(tuile('ca-mois')).toEqual(['CA HT — janvier', '9 187,50 €', '5 000 € en 2024 (+83,8 %)']);
    expect(tuile('ventes-mois')).toEqual(['Ventes — janvier', '1', '1 en 2024']);
    expect(texte('[data-reste-agence]')).toBe('6 508,33 €'); // 🔴 LOT CH : la rétrocession « à répartir » n'est plus déduite);
    expect(container.querySelector('[data-compromis-sans-date]')).toBeNull();
    expect(container.querySelector('[data-bloc="compromis-du-mois"]')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('mode')).toBe('vendu');
  });

  it('« Compromis » : à la date du compromis, annulé exclu ; N−1 dans le même mode ; « N compromis sans date — non placés dans un mois » ; la liste du mois', async () => {
    await ouvrir();
    await cliquer('[data-mode-mois="compromis"]');
    // 🔴 LOT DZ — « CA brut des compromis » ; l'ancienne tuile « cumulé » passe en ligne du bas de la tuile 1 (même valeur), avant N−1
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-mot')).toBe('CA brut des compromis — janvier');
    expect([texte('[data-tuile="ca-mois"] .tdb-tuile-valeur'), texte('[data-tuile="ca-mois"] [data-tuile-cumul]'), texte('[data-tuile-n1="ca"]')])
      .toEqual(['8 000 €', 'cumul 2025 à fin janvier : 8 000 €', '1 000 € en 2024 (+700 %)']);
    expect(tuile('ventes-mois')).toEqual(['Compromis — janvier', '2', '1 en 2024']);
    expect(container.querySelector('[data-tuile="cumul"]')).toBeNull();
    expect(container.querySelector('[data-compromis-sans-date]')).toBeNull(); // 🔴 LOT CR — la mention est retirée (accord d'Arno) ; ils ne comptent dans aucun mois
    expect([...container.querySelectorAll('[data-bloc="compromis-du-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['12', '11']); // 🔴 LOT DJ : la date la plus récente d'abord
    expect(container.querySelector('[data-bloc="ventes-mois"]')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('mode')).toBe('compromis');
  });

  it('« Vendu + compromis » : la somme au centime (compromis EN COURS seulement, LOT BT) ; les deux listes ; la barre empilée ; l’encart : vendu, compromis, total', async () => {
    await ouvrir();
    await cliquer('[data-mode-mois="tous"]');
    // janvier 2025 : la vente 1 (9 187,50) + le compromis en cours 11 (5 000) ; la 12, signée en mars, n'y est plus. 2024 : la vente 5 (5 000) seule.
    expect(tuile('ca-mois')).toEqual(['CA HT vendu + compromis — janvier', '14 187,50 €', '5 000 € en 2024 (+183,8 %)']);
    expect(tuile('ventes-mois')[1]).toBe('2');
    expect([container.querySelector('[data-bloc="ventes-mois"]') !== null, container.querySelector('[data-bloc="compromis-du-mois"]') !== null]).toEqual([true, true]);
    const janv = container.querySelector('[data-barre-mois="1"]')!;
    expect([...janv.querySelectorAll('[data-barre-empilee] [data-empile]')].map((r) => [r.getAttribute('data-empile'), Number(r.getAttribute('data-valeur-part')).toFixed(2)]))
      .toEqual([['bas', '5000.00'], ['haut', '0.00'], ['bas', '9187.50'], ['haut', '5000.00']]); // N−1 (hachurée) dessinée d'abord, comme avant
    await act(async () => { container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="1"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); // 🔴 LOT CV : l'encadré au repos montre le mois en cours ; janvier se survole
    expect([...container.querySelectorAll('[data-histo-detail] [data-bulle-bloc="courant"] .tdb-bulle-ligne')].map((p) => p.textContent!.replace(/\s/g, ' ')))
      .toEqual(['Vendu9 187,50 €', 'Compromis5 000,00 €', 'Total HT14 187,50 € (17 025,00 € TTC)', 'Ventes + compromis2']);
    expect(container.querySelector('[data-legende-empile]')).not.toBeNull();
  });

  it('les onglets « CA | Nombre de ventes » (Compromis : « Nombre de compromis » ; combiné : « Nombre ») et le bouton « ⇄ Mensuel » de la Location ; en nombre : l’axe entier et l’encart en nombre', async () => {
    await ouvrir();
    const onglets = () => [...container.querySelectorAll('[data-bloc="histogramme-mois"] [data-mesure-bouton]')].map((b) => b.textContent);
    expect(onglets()).toEqual(['CA', 'CA net', 'Nombre de ventes']); // 🔴 LOT CW : « CA net » entre les deux
    expect(container.querySelector('[data-bloc="histogramme-mois"] [data-cumul-bouton]')!.textContent).toBe('⇄Mensuel');
    await cliquer('[data-mode-mois="compromis"]');
    expect(onglets()).toEqual(['CA', 'CA net', 'Nombre de compromis']);
    await cliquer('[data-mesure-bouton="nombre"]');
    await act(async () => { container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="1"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); // 🔴 LOT CV : l'encadré au repos montre le mois en cours ; janvier se survole
    expect(texte('[data-histo-detail] [data-bulle-bloc="courant"]')).toBe('2025Compromis2');
    expect(texte('[data-histo-detail] [data-bulle-bloc="n1"]')).toBe('2024Compromis1');
    expect(new URLSearchParams(window.location.search).get('mesure')).toBe('nombre');
    await cliquer('[data-mode-mois="tous"]');
    expect(onglets()).toEqual(['CA', 'CA net', 'Nombre']);
    expect([...container.querySelectorAll('[data-histo-detail] [data-bulle-bloc="courant"] .tdb-bulle-ligne')].map((p) => p.textContent)).toEqual(['Vendu1', 'Compromis1', 'Total2']); // LOT BT : la 12, signée, n'est plus qu'en vendu (mars)
    await cliquer('[data-cumul-bouton]');
    expect(container.querySelector('[data-courbe="mois-cumul"]')).not.toBeNull();
  });

  it('le filtre « Négociateur » s’applique dans chaque mode', async () => {
    await ouvrir();
    await cliquer('[data-mode-mois="compromis"]');
    await cliquer('[data-filtre="negociateur"]');
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'MYLENE') as HTMLElement;
    await act(async () => { option.click(); }); await calmer();
    expect(tuile('ca-mois')[1]).toBe('3 000 €');
    expect(tuile('ventes-mois')[1]).toBe('1');
  });

  it('le mode est retenu après rechargement (navigateur), et l’adresse (&mode=…) l’emporte pour un lien partagé', async () => {
    await ouvrir();
    await cliquer('[data-mode-mois="tous"]');
    await ouvrir('/?vue=mois&annee=2025&mois=1');
    expect(container.querySelector('[data-mode-mois="tous"]')!.getAttribute('aria-pressed')).toBe('true');
    await ouvrir('/?vue=mois&annee=2025&mois=1&mode=compromis');
    expect(container.querySelector('[data-mode-mois="compromis"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(tuile('ca-mois')[1]).toBe('8 000 €');
  });

  it('inter-cabinet : un compromis porté par CRITERIMMO, reçu à 50 % par MACJ — chacune sa part, comme pour une vente (la règle ne change pas)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const parties = [
      { sorte: 'entree' as const, compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' as const },
      { sorte: 'sortie' as const, compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const }];
    const h = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, statut: 'compromis', mois: null, dateCompromis: '2025-01-12', repartition: { retroApporteurTtc: 0, apporteurInterne: true, parties },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] } });
    const M = await import('../../../../lib/transaction/modele');
    expect(M.caHtParMoisMode([h], 2025, 'criterimmo', 'compromis', JOUR_DQ)[0]).toBeCloseTo(4000 / 1.2, 9);
    expect(M.caHtParMoisMode([venteDansSociete(h, 'macj')!], 2025, 'macj', 'compromis', JOUR_DQ)[0]).toBeCloseTo(2000 / 1.2, 9);
  });

  it('le CA global n’a pas d’écran « Le mois » : pas de sélecteur de mode (ses tableaux ne changent pas)', async () => {
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
    expect(container.querySelector('[data-filtre="mode"]')).toBeNull();
    expect(container.querySelector('[data-table-global]')).not.toBeNull();
  });

  it('la Location ne change pas : sans `mesures`, l’en-tête garde CA · Baux · Gestion ; sans `empile`, une barre simple', async () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx', 'utf8');
    expect(src).toContain("(mesures ?? (MESURES_MOIS as unknown as readonly { cle: M; mot: string }[]))");
    expect(src).toContain('{avecCourant && b.valeur !== null && (b.empile !== undefined'); // 🔴 LOT CG12 — une série toute à 0 n'est pas tracée
    const L = await import('../location/TableauBordSuivi');
    expect(L.MESURES_MOIS.map((x) => x.mot)).toEqual(['CA', 'Baux', 'Gestion']);
  });
});

describe('🔴 LOT BT — « Vendu + compromis » : une affaire n’est jamais comptée deux fois', () => {
  const v = (id: number, o: Partial<Vente>) => vente(id, { societe: 'macj', ...o });
  // Une affaire : compromis en octobre 2025, acte en décembre 2025 ; un compromis en cours d'octobre 2025 ; les mêmes en 2024.
  const ventes = [
    v(21, { libelle: 'OCT PUIS DÉC', honorairesTtc: 12000, statut: 'vendue', annee: 2025, mois: 12, dateCompromis: '2025-10-08' }),
    v(22, { libelle: 'EN COURS OCT', honorairesTtc: 6000, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-10-15' }),
    v(23, { libelle: 'N-1 OCT PUIS DÉC', honorairesTtc: 2400, statut: 'vendue', annee: 2024, mois: 12, dateCompromis: '2024-10-02' }),
    v(24, { libelle: 'N-1 EN COURS OCT', honorairesTtc: 1200, statut: 'compromis', annee: 2024, mois: null, dateCompromis: '2024-10-20' }),
    v(25, { libelle: 'ANNULÉ OCT', honorairesTtc: 9000, statut: 'annulee', annee: 2025, mois: null, dateCompromis: '2025-10-01' }),
  ];
  it('combiné : l’affaire signée seulement en décembre (vendu), le compromis en cours en octobre ; idem en N−1', async () => {
    const M = await import('../../../../lib/transaction/modele');
    // 🔴 LOT DQ (Arno) — le compromis 24, encore en cours mais daté de 2024, compte dans l'année en cours (2025, au 27/10), au mois en cours
    // (octobre) ; 2024 ne le compte plus (il appartient à l'année en cours). Les actes signés : à la date de l'acte, inchangé.
    const tous = M.caHtParMoisMode(ventes, 2025, 'macj', 'tous', JOUR_DQ);
    expect([tous[9], tous[11]]).toEqual([(6000 + 1200) / 1.2, 12000 / 1.2]);
    expect(M.nombreParMoisMode(ventes, 2025, 'tous', JOUR_DQ).reduce((a, b) => a + b, 0)).toBe(3);
    const n1 = M.caHtParMoisMode(ventes, 2024, 'macj', 'tous', JOUR_DQ);
    expect([n1[9], n1[11]]).toEqual([0, 2400 / 1.2]);
    const ids = Array.from({ length: 12 }, (_, i) => [...M.ventesDuMois(ventes, 2025, i + 1), ...M.compromisDuMode(ventes, 2025, i + 1, 'tous', JOUR_DQ)].map((x) => x.id)).flat();
    expect(ids.sort()).toEqual([21, 22, 24]);
  });
  it('le mode « Compromis » : l’affaire signée compte au mois de son compromis, le compromis en cours de 2024 au mois en cours (lot DR) ; le mode « Vendu » ne change pas, au centime', async () => {
    const M = await import('../../../../lib/transaction/modele');
    // 🔴 LOT DR (Arno) — le compromis 24, encore en cours mais daté de 2024, compte aussi en mode « Compromis » dans l'année en cours (octobre 2025).
    expect(M.caHtParMoisMode(ventes, 2025, 'macj', 'compromis', JOUR_DQ)[9]).toBe((18000 + 1200) / 1.2);
    expect(M.compromisDuMode(ventes, 2025, 10, 'compromis', JOUR_DQ).map((x) => x.id)).toEqual([21, 22, 24]);
    expect(M.compromisDuMode(ventes, 2024, null, 'compromis', JOUR_DQ).map((x) => x.id)).toEqual([23]);
    expect(M.caHtParMoisMode(ventes, 2025, 'macj', 'vendu', JOUR_DQ)).toEqual(M.caHtParMois(ventes, 2025, 'macj'));
    const d = { ...donnees, ventes, retrocessions: [] };
    expect(M.totauxMoisMode(d, 2025, 12, 'vendu', JOUR_DQ)).toEqual(M.totauxMois(d, 2025, 12));
  });
  it('l’écran : la règle dite sous le sélecteur ; « Les compromis en cours du mois » en mode combiné', async () => {
    const avant = donnees.ventes; donnees.ventes = ventes;
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=10&mode=tous');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
      expect(texte('[data-regle-mode]')).toBe('Vendu + compromis : chaque affaire une seule fois — à la date de l’acte si elle est signée ; sinon, compromis en cours comptés dans l’année en cours (au mois du compromis, ou au mois en cours s’il n’est pas daté de l’année).'); // 🔴 LOT DQ
      expect(texte('#trx-compromis-mois')).toContain('Les compromis en cours du mois — octobre 2025');
      // 🔴 LOT CZ — la phrase seulement en « Vendu + compromis » : ni en « Vendu », ni en « Compromis » (aucun élément, donc aucune place) ; bascule instantanée
      const champMode = () => container.querySelector('.trx-champ-mode')!;
      for (const m of ['vendu', 'compromis'] as const) {
        await act(async () => { (container.querySelector(`[data-mode-mois="${m}"]`) as HTMLElement).click(); });
        expect([m, container.querySelector('[data-regle-mode]'), [...champMode().children].map((x) => x.className)]).toEqual([m, null, ['', 'trx-unites trx-modes']]);
      }
      await act(async () => { (container.querySelector('[data-mode-mois="tous"]') as HTMLElement).click(); });
      expect(container.querySelector('[data-regle-mode]')).not.toBeNull();
      // 🔴 LOT DQ — octobre 2025 (le mois en cours) : le compromis daté d'octobre, et celui de 2024 encore en cours, avec la mention
      expect([...container.querySelectorAll('[data-bloc="compromis-du-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente')).sort()).toEqual(['22', '24']);
      expect(texte('[data-bloc="compromis-du-mois"] [data-mention-reportes]')).toBe(' — 1 compromis non daté ou antérieur, compté au mois en cours');
      expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('6 000 €');
    } finally { donnees.ventes = avant; }
  });
});

describe('🔴 LOT BU — « Le mois » : chaque vente se déplie sur LA fiche de l’onglet Compromis ; colonne « Négociateur » (entrée)', () => {
  const parties = [
    { sorte: 'entree' as const, compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' as const },
    { sorte: 'sortie' as const, compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const }];
  const complete = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null,
    repartition: { retroApporteurTtc: 0, apporteurInterne: true, parties }, prixVente: 160000, dateCompromis: '2024-12-10',
    dossier: { adresseBien: '1 rue A, Puteaux', dateActePrevue: null, dateActe: '2025-01-15', entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null,
      personnes: [{ id: 3, role: 'vendeur', nom: 'DUPONT', telephone: null, email: null, adresse: null }] } });
  const refs = { lotD: true, negociateurs: [{ id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' }, { id: 8, nom: 'Pierre Thevenin', societe: 'macj' }], apporteurs: [], personnes: [], uniteCommission: true, annulation: true };
  let refsDispo: boolean;
  let lectures: number;
  const ouvrirMois = async (ventes: Vente[], societe: 'criterimmo' | 'macj' = 'criterimmo', adresse = '/?vue=mois&annee=2025&mois=1') => {
    const avant = { ventes: donnees.ventes, societe: donnees.societe, retros: donnees.retrocessions };
    donnees.ventes = ventes; donnees.societe = societe; donnees.retrocessions = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: null }) }; }
      const u = String(url);
      if (u.includes('vue=societe')) lectures += 1;
      const data = u.includes('vue=references') ? { disponible: refsDispo, ...refs } : u.includes('vue=journal') ? [] : { ...donnees, disponible: refsDispo };
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) };
    }) as unknown as typeof fetch;
    act(() => { root.unmount(); }); root = createRoot(container);
    window.history.replaceState(null, '', adresse);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    return () => { donnees.ventes = avant.ventes; donnees.societe = avant.societe; donnees.retrocessions = avant.retros; };
  };
  beforeEach(() => { refsDispo = true; lectures = 0; window.localStorage.setItem('trx-affichage-montants', 'ttc'); try { window.localStorage.removeItem('trx-mois-mode'); } catch { /* */ } });
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };

  it('replié : la colonne « Négociateur » (l’entrée seule ; un import sans entrée : le nom importé), le triangle rouge partagé à gauche ; aucun montant ne change', async () => {
    const fin = await ouvrirMois([complete, donnees.ventes[0]]);
    try {
      // 🔴 LOT CA — la carte : « Entrée : X · Sortie : Y » (deux négociateurs), « Négociateur : X » sinon (un import : le nom importé).
      // 🔴 LOT CC — une ligne par négociateur : « Arnaud Jorel · entrée », « Pierre Thevenin · sortie » ; un import : une ligne, le nom importé.
      expect([...container.querySelectorAll('[data-vente="38"] [data-carte-negos] > [data-nego-ligne]')].map((x) => `${x.querySelector('[data-nego-nom]')!.textContent} ${x.querySelector('[data-nego-cote]')!.textContent}`)).toEqual(['Arnaud Jorel · entrée', 'Pierre Thevenin · sortie']);
      expect([...container.querySelectorAll('[data-vente="1"] [data-nego-nom]')].map((x) => x.textContent)).toEqual(['MYLENE, CEDRIC']);
      const b = container.querySelector('[data-vente="38"] .tdb-replie-ligne')!;
      expect([b.getAttribute('aria-expanded'), b.querySelector('svg[data-triangle]')?.getAttribute('data-triangle')]).toEqual(['false', 'replie']);
      const ca = texte('[data-tuile="ca-mois"] .tdb-tuile-valeur');
      await cliquer('[data-vente="38"] .tdb-replie-ligne');
      expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe(ca);
    } finally { fin(); }
  });

  it('déplier (triangle ou ligne) / replier ; plusieurs à la fois ; la fiche est celle de l’onglet Compromis (Vendeurs | Acquéreurs, informations communes, répartition, actions)', async () => {
    const fin = await ouvrirMois([complete, donnees.ventes[0]]);
    try {
      await cliquer('[data-vente="38"] .tdb-replie-ligne');
      const f = '[data-vente="38"] [data-contenu-replie]';
      expect(container.querySelector('[data-vente="38"] .tdb-replie-ligne')!.getAttribute('aria-expanded')).toBe('true');
      expect([...container.querySelectorAll(`${f} [data-colonne]`)].map((x) => x.getAttribute('data-colonne'))).toEqual(['vendeur', 'acquereur']);
      for (const sel of ['[data-informations-communes]', '[data-repartition-compromis]', '[data-modifier-compromis="38"]', '[data-base-resultat="entree"]'])
        expect([sel, container.querySelector(`${f} ${sel}`) !== null]).toEqual([sel, true]);
      expect(texte(`${f} [data-honoraires-cote="entree"] .trx-calcul-mot`)).toBe('Honoraires nets partie vendeur');
      expect(texte(`${f} [data-info="prix"] dd`)).toBe('160 000 €');
      // vendue : ni « Acte signé » ni « Annulation »
      expect([container.querySelector(`${f} [data-acte-signe]`), container.querySelector(`${f} [data-annulation-compromis]`)]).toEqual([null, null]);
      // un clic sur la LIGNE (hors boutons) ouvre la seconde : deux à la fois
      const ouvertes = () => [...container.querySelectorAll('[data-cartes-ventes] [data-contenu-replie]')].map((x) => x.closest('[data-vente]')!.getAttribute('data-vente'));
      await act(async () => { (container.querySelector('[data-vente="1"] [data-carte="titre"]') as HTMLElement).click(); }); await calmer();
      expect(ouvertes()).toEqual(['38', '1']);
      await cliquer('[data-vente="38"] .tdb-replie-ligne');
      expect(ouvertes()).toEqual(['1']);
      const src = (await import('node:fs')).readFileSync('app/(admin)/admin/(protected)/transaction/OngletCompromis.tsx', 'utf8');
      expect(src).toContain('<DetailAffaire v={v} hote={hote} />');
    } finally { fin(); }
  });

  it('une vente importée incomplète : la fiche s’ouvre sans erreur, « à renseigner » ; l’étiquette « import » et la source sont dans la fiche (LOT BZ)', async () => {
    const fin = await ouvrirMois([donnees.ventes[0]]);
    try {
      await cliquer('[data-vente="1"] .tdb-replie-ligne');
      expect(texte('[data-vente="1"] [data-carte="titre"]')).toBe('GAVEZ DE CAMPOS/ ASMAR');
      // sans adresse, sans prix, sans date d'acte : « à renseigner » ; l'acte, son mois
      expect(texte('[data-vente="1"] [data-carte="adresse"]')).toBe('adresse à renseigner');
      expect(texte('[data-vente="1"] [data-carte="acte"]')).toBe('acte signé en janvier 2025');
      expect(texte('[data-vente="1"] [data-contenu-replie] [data-informations-communes] h4')).toContain('import');
      expect(texte('[data-vente="1"] [data-contenu-replie] [data-source-fiche]')).toBe('TABLEAU DE BORD MACJ 2025.xlsx › MYLENE › ligne 1');
      expect(texte('[data-vente="1"] [data-contenu-replie]')).toContain('à renseigner');
      expect(container.querySelector('[data-vente="1"] [data-contenu-replie] [data-colonne="vendeur"]')).not.toBeNull();
    } finally { fin(); }
  });

  it('inter-cabinet : la ligne miroir de MACJ se déplie sur la fiche miroir (part reçue, vente d’origine)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const fin = await ouvrirMois([venteDansSociete(complete, 'macj')!], 'macj');
    try {
      expect([...container.querySelectorAll('[data-vente="38"] [data-nego-nom]')].map((x) => x.textContent)).toEqual(['Pierre Thevenin']); // la part de MACJ : son seul côté
      await cliquer('[data-vente="38"] .tdb-replie-ligne');
      expect(container.querySelector('[data-vente="38"] [data-contenu-replie] [data-miroir-bloc]')).not.toBeNull();
      expect(container.querySelector('[data-vente="38"] [data-contenu-replie] [data-voir-origine="38"]')!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=38');
    } finally { fin(); }
  });

  it('mode « Compromis » et « Vendu + compromis » : les compromis du mois se déplient aussi, avec « Acte signé »', async () => {
    const comp = { ...complete, id: 40, statut: 'compromis' as const, mois: null, dateCompromis: '2025-01-12' };
    const fin = await ouvrirMois([complete, comp], 'criterimmo', '/?vue=mois&annee=2025&mois=1&mode=tous');
    try {
      await cliquer('[data-bloc="compromis-du-mois"] [data-vente="40"] .tdb-replie-ligne');
      expect(container.querySelector('[data-vente="40"] [data-contenu-replie] [data-acte-signe="40"]')).not.toBeNull();
      expect(container.querySelector('[data-bloc="compromis-du-mois"] [data-vente="40"] [data-nego-ligne="entree"]')).not.toBeNull();
    } finally { fin(); }
  });

  it('HT et TTC : la fiche suit l’unité retenue (sélecteur de l’onglet Compromis)', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    const fin = await ouvrirMois([complete]);
    try {
      await cliquer('[data-vente="38"] .tdb-replie-ligne');
      expect(texte('[data-vente="38"] [data-contenu-replie] [data-honoraires-cote="entree"]')).toContain('€ HT');
      expect(texte('[data-vente="38"] [data-contenu-replie] [data-honoraires-cote="entree"]').indexOf('HT')).toBeLessThan(texte('[data-vente="38"] [data-contenu-replie] [data-honoraires-cote="entree"]').indexOf('TTC'));
    } finally { fin(); }
  });

  it('une modification faite dans la fiche relit l’écran (ligne, tuiles, graphique, résultat) sans recharger', async () => {
    const fin = await ouvrirMois([complete]);
    try {
      await cliquer('[data-vente="38"] .tdb-replie-ligne');
      await cliquer('[data-vente="38"] [data-contenu-replie] [data-modifier-compromis="38"]');
      expect(container.querySelector('[data-formulaire-dossier="38"]')).not.toBeNull();
      const avant = lectures;
      await cliquer('[data-enregistrer-dossier]');
      expect(posts.some((p) => (p as { action?: string }).action === 'dossier-enregistrer')).toBe(true);
      expect(lectures).toBeGreaterThan(avant);
    } finally { fin(); }
  });

  it('observateur : la fiche se lit, ses gestes d’écriture sont inactifs, et le serveur refuse (403, garde centrale)', async () => {
    refsDispo = false;
    const fin = await ouvrirMois([complete]);
    try {
      await cliquer('[data-vente="38"] .tdb-replie-ligne');
      expect((container.querySelector('[data-vente="38"] [data-contenu-replie] [data-modifier-compromis="38"]') as HTMLButtonElement).disabled).toBe(true);
      const { ecritureRefuseeObservateur } = await import('../../../../lib/admin/observateur');
      expect(ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/transaction')).toBe(true);
    } finally { fin(); }
  });
});

describe('🔴 LOT BV — libellés : « Com négo » et « − Commissions des négociateurs indépendants (HT) » (aucun montant ne change)', () => {
  it('la colonne et la ligne du résultat de l’agence', async () => {
    window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1');
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    expect(texte('[data-bloc="ventes-mois"] [data-vente="1"] [data-carte-negos]')).toContain('com négo'); // LOT CC : la ligne du négociateur
    expect(container.querySelector('[data-bloc="ventes-mois"] [data-vente="1"] [data-nego-com]')).not.toBeNull();
    expect(container.querySelector('[data-paye-deduite]')!.closest('dd')!.previousElementSibling!.textContent).toBe('− Commissions des négociateurs indépendants (HT)');
    expect(container.textContent).not.toContain('Paye négo');
    expect(container.textContent).not.toContain('Paye des négociateurs');
    expect(texte('[data-reste-agence]')).toBe('6 508,33 €'); // 🔴 LOT CH : la rétrocession « à répartir » n'est plus déduite);
  });
});

describe('🔴 LOT BW — « Le mois » : une ligne par négociateur ; « HT | TTC » sur « Le mois » et « L’année »', () => {
  const partie = (sorte: 'entree' | 'sortie', compteId: number, negociateur: string, societe: 'criterimmo' | 'macj', pourcentage: number) =>
    ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: 'independant' as const });
  const lc = (id: number, negociateur: string, montantTtc: number, cote: 'entree' | 'sortie'): LigneVente =>
    ({ id, negociateur, role: 'negociateur', montantTtc, nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, cote } as LigneVente);
  const dossier = (e: [number, string], s: [number, string]) => ({ adresseBien: null, dateActePrevue: null, dateActe: '2025-01-15', entree: { id: e[0], nom: e[1] }, sortie: { id: s[0], nom: s[1] }, apporteurId: null, personnes: [] });
  // CRITERIMMO : Jean-Baptiste rentre le mandat, Cédric vend ; 10 000,01 TTC, apporteur 333,33, partage 33 / 67 (des centimes qui ne tombent pas juste).
  const deux = vente(50, { societe: 'criterimmo', libelle: 'DUPONT / MARTIN', honorairesTtc: 10000.01, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null,
    lignes: [lc(1, 'Jean-Baptiste PONS', 2000, 'entree'), lc(2, 'Cédric JULLIEN', 1500, 'sortie')],
    repartition: { retroApporteurTtc: 333.33, apporteurInterne: true, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 33), partie('sortie', 9, 'Cédric JULLIEN', 'criterimmo', 67)] },
    dossier: dossier([5, 'Jean-Baptiste PONS'], [9, 'Cédric JULLIEN']) });
  // Inter-cabinet : l'entrée chez CRITERIMMO (porteuse), la sortie chez MACJ.
  const ic = vente(51, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null,
    repartition: { retroApporteurTtc: 0, apporteurInterne: true, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 8, 'Pierre THEVENIN', 'macj', 50)] },
    dossier: dossier([5, 'Jean-Baptiste PONS'], [8, 'Pierre THEVENIN']) });
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const montant = (sel: string): number => centimes(texte(sel));
  const ouvrirSur = async (ventes: Vente[], societe: 'criterimmo' | 'macj', adresse = '/?vue=mois&annee=2025&mois=1', retrocessions: DonneesSociete['retrocessions'] = []) => {
    const avant = { ventes: donnees.ventes, societe: donnees.societe, retros: donnees.retrocessions, statuts: donnees.statutsNegociateurs };
    donnees.ventes = ventes; donnees.societe = societe; donnees.retrocessions = retrocessions;
    donnees.statutsNegociateurs = { 'Jean-Baptiste PONS': 'independant', 'Cédric JULLIEN': 'independant', 'Pierre THEVENIN': 'independant', MYLENE: 'independant' };
    const refs = { lotD: true, negociateurs: [{ id: 5, nom: 'Jean-Baptiste PONS', societe: 'criterimmo' }, { id: 9, nom: 'Cédric JULLIEN', societe: 'criterimmo' }, { id: 8, nom: 'Pierre THEVENIN', societe: 'macj' }],
      apporteurs: [], personnes: [], uniteCommission: true, annulation: true };
    const lire = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => (String(url).includes('vue=references') && init?.method !== 'POST'
      ? { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, ...refs } }) } : lire(url, init))) as unknown as typeof fetch;
    act(() => { root.unmount(); }); root = createRoot(container);
    window.history.replaceState(null, '', adresse);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    return () => { donnees.ventes = avant.ventes; donnees.societe = avant.societe; donnees.retrocessions = avant.retros; donnees.statutsNegociateurs = avant.statuts; };
  };
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  beforeEach(() => { try { window.localStorage.removeItem('trx-mois-mode'); } catch { /* */ } });

  // 🔴 LOT CA — les ventes de « Le mois » sont les CARTES de l'onglet Compromis (`CarteAffaire`) : la ligne grise de la vente (négociateurs, rétro,
  // com négo, reste agence, dans l'unité choisie) remplace le tableau et les deux lignes entrée / sortie du lot BW (accord d'Arno).
  // 🔴 LOT CC — la carte repliée : le nom, adresse · date, puis UNE LIGNE PAR NÉGOCIATEUR (les montants des cadres de la fiche, dans l'unité choisie).
  it('une vente à un seul négociateur (import sans sortie) : une ligne, sans « entrée / sortie »', async () => {
    const fin = await ouvrirSur([donnees.ventes[0]], 'macj');
    try {
      expect(container.querySelectorAll('[data-bloc="ventes-mois"] [data-cartes-ventes] > li').length).toBe(1);
      expect(container.querySelector('[data-bloc="ventes-mois"] table')).toBeNull();
      expect(texte('[data-vente="1"] [data-carte-negos]')).toBe('MYLENE, CEDRIC — honoraires nets 9 187,50 € · com négo 2 679,17 € · reste 6 508,33 €');
      // 🔴 LOT CD — sans apporteur : « honoraires nets » en gris
      expect(container.querySelector('[data-vente="1"] [data-nego-nets]')!.className).not.toContain('trx-rouge');
      expect(montant('[data-vente="1"] [data-nego-reste]')).toBe(montant('[data-reste-agence]'));
    } finally { fin(); }
  });

  it('entrée ≠ sortie : deux lignes ; honoraires des lignes + apporteur = la commission, au centime (HT et TTC) ; com négo = la paye ; reste = le résultat', async () => {
    const fin = await ouvrirSur([deux], 'criterimmo');
    try {
      expect([...container.querySelectorAll('[data-vente="50"] [data-nego-nom]')].map((x) => x.textContent)).toEqual(['Jean-Baptiste PONS', 'Cédric JULLIEN']);
      expect([...container.querySelectorAll('[data-vente="50"] [data-nego-cote]')].map((x) => x.textContent)).toEqual(['· entrée', '· sortie']);
      expect(texte('[data-bloc="ventes-mois"] [data-compteur-liste]')).toBe('(1)');
      // 🔴 LOT CD — un apporteur est déduit : « honoraires nets » en ROUGE sur les deux lignes ; plus de mention « apporteur » sur les lignes
      expect([...container.querySelectorAll('[data-vente="50"] [data-nego-nets]')].map((x) => x.className.includes('trx-rouge'))).toEqual([true, true]);
      expect(container.querySelector('[data-vente="50"] [data-apporteur-carte]')).toBeNull();
      // l'apporteur tel que la fiche le déduit (cadre gris), en centimes HT et TTC
      const { lignesCarteAffaire } = await import('../../../../lib/transaction/carteAffaireLignes');
      const apporteur = lignesCarteAffaire(deux, 'criterimmo').apporteur!;
      const somme = (k: string) => [...container.querySelectorAll(`[data-vente="50"] [data-nego-${k}]`)].reduce((t, x) => t + centimes(x.textContent!), 0);
      for (const u of ['ht', 'ttc'] as const) {
        if (u === 'ttc') await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
        expect(somme('honoraires') + (u === 'ttc' ? apporteur.ttcC : apporteur.htC)).toBe(montant(`[data-vente="50"] [data-carte="${u === 'ht' ? 'commission-ht' : 'commission'}"]`));
        expect(somme('com')).toBe(montant('[data-paye-deduite]'));
        expect(somme('reste')).toBe(montant('[data-reste-agence]'));
        expect(texte('[data-vente="50"] [data-carte-negos]')).not.toMatch(/\(|HT|TTC/);
      }
    } finally { fin(); }
  });

  it('un clic sur la carte déplie la fiche (lot BU), un second la replie', async () => {
    const fin = await ouvrirSur([deux], 'criterimmo');
    try {
      await act(async () => { (container.querySelector('[data-vente="50"] [data-carte-negos]') as HTMLElement).click(); }); await calmer();
      expect(container.querySelectorAll('[data-vente="50"] [data-contenu-replie]').length).toBe(1);
      expect(container.querySelector('[data-vente="50"] .tdb-replie-ligne')!.getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('[data-vente="50"] [data-contenu-replie] [data-modifier-compromis="50"]')).not.toBeNull();
      await cliquer('[data-vente="50"] .tdb-replie-ligne');
      expect(container.querySelector('[data-vente="50"] [data-contenu-replie]')).toBeNull();
    } finally { fin(); }
  });

  it('inter-cabinet, page de la porteuse : la ligne de sortie dit « reversé à MACJ » à la place de com négo / reste ; chez MACJ, la carte miroir', async () => {
    let fin = await ouvrirSur([ic], 'criterimmo');
    try {
      expect(texte('[data-vente="51"] [data-nego-ligne="sortie"]')).toBe('Pierre THEVENIN · sortie — honoraires nets 1 666,67 € · reversé à MACJ 1 666,67 €');
      expect(container.querySelector('[data-vente="51"] [data-nego-reverse]')!.className).toContain('trx-rouge');
      expect(container.querySelector('[data-vente="51"] [data-nego-ligne="sortie"] [data-nego-reste]')).toBeNull();
      // les cadres de la fiche : honoraires d'entrée = com négo (calculée au taux) + reste ; les deux honoraires = la commission (sans apporteur)
      expect(montant('[data-vente="51"] [data-nego-ligne="entree"] [data-nego-com]') + montant('[data-vente="51"] [data-nego-ligne="entree"] [data-nego-reste]'))
        .toBe(montant('[data-vente="51"] [data-nego-ligne="entree"] [data-nego-honoraires]'));
      expect([...container.querySelectorAll('[data-vente="51"] [data-nego-honoraires]')].reduce((t, x) => t + centimes(x.textContent!), 0)).toBe(montant('[data-vente="51"] [data-carte="commission-ht"]'));
    } finally { fin(); }
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    fin = await ouvrirSur([venteDansSociete(ic, 'macj')!], 'macj');
    try {
      expect(container.querySelectorAll('[data-bloc="ventes-mois"] [data-cartes-ventes] > li').length).toBe(1);
      expect(container.querySelector('[data-vente="51"] [data-carte-miroir]')).not.toBeNull();
      expect(texte('[data-vente="51"] [data-carte="inter-cabinet"]')).toBe('inter-cabinet reçu');
      expect([...container.querySelectorAll('[data-vente="51"] [data-nego-nom]')].map((x) => x.textContent)).toEqual(['Pierre THEVENIN']);
    } finally { fin(); }
  });

  it('le sélecteur « HT | TTC » : à droite de « Compter » sur « Le mois », dans les filtres de « L’année » ; partagé avec l’onglet Compromis et les deux sociétés', async () => {
    let fin = await ouvrirSur([donnees.ventes[0], ...donnees.ventes.slice(1)], 'macj');
    try {
      const filtres = container.querySelector('form.tdb-filtres')!;
      const enfants = [...filtres.children];
      const iMode = enfants.findIndex((x) => x.querySelector('[data-filtre="mode"]') !== null);
      const iUnite = enfants.findIndex((x) => x.querySelector('[data-affichage-montants]') !== null);
      expect([iMode >= 0, iUnite]).toEqual([true, iMode + 1]);
      expect(container.querySelector('[data-affichage-montants]')!.getAttribute('data-affichage-montants')).toBe('ht');
      await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
      expect(window.localStorage.getItem('trx-affichage-montants')).toBe('ttc');
      // L'année : le même choix, au même endroit (dernier filtre)
      await cliquer('[data-vue="annee"]');
      const f2 = [...container.querySelector('form.tdb-filtres')!.children];
      expect(f2.at(-1)!.querySelector('[data-affichage-montants="ttc"]')).not.toBeNull();
      // Compromis : son sélecteur dit TTC ; y choisir HT, revenir sur « Le mois » : HT
      await cliquer('[data-vue="compromis"]');
      expect(container.querySelector('[data-affichage-montants]')?.getAttribute('data-affichage-montants')).toBe('ttc');
      await cliquer('[data-affichage-montants] [data-afficher="ht"]');
      await cliquer('[data-vue="mois"]');
      expect(container.querySelector('[data-affichage-montants]')!.getAttribute('data-affichage-montants')).toBe('ht');
      await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
    } finally { fin(); }
    // CRITERIMMO : le choix fait sur MACJ
    fin = await ouvrirSur([deux], 'criterimmo');
    try {
      expect(container.querySelector('[data-affichage-montants]')!.getAttribute('data-affichage-montants')).toBe('ttc');
      expect(texte('[data-tuile="ca-mois"] .tdb-tuile-mot')).toBe('CA TTC — janvier');
    } finally { fin(); }
  });

  it('les totaux, tuiles, graphique et « Résultat de l’agence » sont les mêmes dans chaque unité (TTC = HT × 1,2) ; les mots suivent ; L’année aussi', async () => {
    const fin = await ouvrirSur([...donnees.ventes], 'macj');
    try {
      const lire = () => ({ tuile: montant('[data-tuile="ca-mois"] .tdb-tuile-valeur'), cumul: montant('[data-tuile="cumul"] .tdb-tuile-valeur'), reste: montant('[data-reste-agence]'),
        paye: montant('[data-paye-deduite]'), barre: Number(container.querySelector('[data-barre-mois="1"] [data-valeur]')!.getAttribute('data-valeur')),
        bulle: [...container.querySelectorAll('[data-histo-detail] [data-bulle-bloc="courant"] .tdb-bulle-ligne')].map((p) => p.textContent!.replace(/\s/g, ' ')) });
      await act(async () => { container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="1"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); // 🔴 LOT CV : l'encadré au repos montre le mois en cours ; janvier se survole
      const ht = lire();
      expect(texte('[data-bloc="resultat-mois"] dl')).toContain('= Reste à l’agence (HT)');
      await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
      const ttc = lire();
      for (const k of ['tuile', 'cumul', 'reste', 'paye'] as const) expect([k, Math.abs(ttc[k] - ht[k] * 1.2) <= 1]).toEqual([k, true]);
      expect(ttc.barre).toBeCloseTo(ht.barre * 1.2, 6);
      expect(ttc.bulle[0]).toBe('CA TTC11 025,00 € (9 187,50 € HT)');
      expect(texte('[data-bloc="resultat-mois"] dl')).toContain('= Reste à l’agence (TTC)');
      expect(texte('[data-tuile="ca-mois"] [data-montant-autre]')).toBe('(9 187,50 € HT)');
      expect(texte('[data-bloc="ventes-mois"] [data-vente="1"] [data-nego-reste]')).toBe('7 810 €');
      await cliquer('[data-vue="annee"]');
      expect(texte('[data-tuile="ca-annee"] .tdb-tuile-mot')).toContain('CA TTC'); // 🔴 LOT DG : la tuile « CA [année] »
      expect(texte('[data-annee-histoire="2025"] [data-mot="CA TTC"]')).toBe('33 300 € TTC (27 750 € HT)');
      const resteTtc = montant('[data-reste-agence-periode]');
      await cliquer('[data-affichage-montants] [data-afficher="ht"]');
      expect(Math.abs(resteTtc - montant('[data-reste-agence-periode]') * 1.2) <= 1).toBe(true);
    } finally { fin(); }
  });
  it('🔴 LOT CA — les trois écrans, UNE carte (même composant) : en-têtes « titre (N) » à gauche ; ventes simples et à deux négociateurs ; HT et TTC', async () => {
    const fin = await ouvrirSur([deux, donnees.ventes[0]], 'criterimmo');
    try {
      // l'en-tête de la liste : « Les ventes du mois — janvier 2025 » puis « (2) », ensemble à gauche
      expect([...container.querySelector('[data-bloc="ventes-mois"] .trx-entete-gauche')!.children].map((x) => x.textContent).slice(0, 2)).toEqual(['Les ventes du mois — janvier 2025', '(2)']);
      expect(container.querySelector('[data-bloc="ventes-mois"] .trx-entete-gauche')!.children[2].hasAttribute('data-tri-liste')).toBe(true); // 🔴 LOT DJ : le tri, après le compteur
      // la même carte que l'onglet Compromis : même classe, même structure (titre, ligne d'infos, montants à droite, triangle rouge)
      const carte = container.querySelector('[data-vente="50"] .trx-carte')!;
      expect(carte.className).toContain('trx-carte-affaire');
      for (const sel of ['[data-carte="titre"]', '[data-carte-ligne="infos"]', '[data-carte="montants"]', 'svg[data-triangle]']) expect([sel, carte.querySelector(sel) !== null]).toEqual([sel, true]);
      expect(texte('[data-vente="50"] [data-carte-ligne="infos"]')).toBe('adresse à renseigner · acte signé le 15/01/2025'); // LOT CC : le prix est dans la fiche
      // TTC : le grand et le petit s'inversent ; la ligne grise suit
      await act(async () => { (container.querySelector('[data-affichage-montants] [data-afficher="ttc"]') as HTMLElement).click(); }); await calmer();
      expect([texte('[data-vente="1"] [data-montant-grand]'), texte('[data-vente="1"] [data-montant-petit]')]).toEqual(['11 025 € TTC', '(9 187,50 € HT)']);
      expect(texte('[data-vente="1"] [data-carte-negos]')).toContain('honoraires nets 11 025 €');
      const src = (await import('node:fs')).readFileSync('app/(admin)/admin/(protected)/transaction/OngletCompromis.tsx', 'utf8');
      expect(src).toContain('<CarteAffaire v={v} aujourdhui={d.aujourdhui} etiquetteActe ouvertInitial={venteVisee === v.id} vue={vue} statutDuLibelle={statutDuLibelle}>');
      const ecr = (await import('node:fs')).readFileSync('app/(admin)/admin/(protected)/transaction/EcransTransaction.tsx', 'utf8');
      expect(ecr).toContain('<CarteAffaire v={v} aujourdhui={fiches.hote.d.aujourdhui} section="vente"');
    } finally { fin(); }
  });

  it('🔴 LOT BZ — la fiche dépliée garde « Modifier », et reçoit les étiquettes et la source d’import que la ligne ne montre plus ; les totaux ne changent pas', async () => {
    const fin = await ouvrirSur([deux, donnees.ventes[0]], 'criterimmo');
    try {
      const reste = texte('[data-reste-agence]');
      await act(async () => { (container.querySelector('[data-vente="50"] .tdb-replie-ligne') as HTMLElement).click(); }); await calmer();
      expect(container.querySelector('[data-vente="50"] [data-contenu-replie] [data-modifier-compromis="50"]')).not.toBeNull();
      expect(container.querySelector('[data-vente="50"] [data-contenu-replie] [data-etiquette-fiche="repartie"]')).not.toBeNull();
      await act(async () => { (container.querySelector('[data-vente="1"] .tdb-replie-ligne') as HTMLElement).click(); }); await calmer();
      expect(texte('[data-vente="1"] [data-contenu-replie] [data-source-fiche]')).toBe('TABLEAU DE BORD MACJ 2025.xlsx › MYLENE › ligne 1');
      expect(texte('[data-vente="1"] [data-contenu-replie] [data-informations-communes] h4')).toContain('import');
      expect(texte('[data-reste-agence]')).toBe(reste);
      // l'onglet Compromis (la même fiche) n'a ni ces étiquettes ni cette ligne : ajoutées depuis « Le mois » seulement
      const src = (await import('node:fs')).readFileSync('app/(admin)/admin/(protected)/transaction/OngletCompromis.tsx', 'utf8');
      expect(src).toContain('<DetailAffaire v={v} hote={hote} />');
    } finally { fin(); }
  });
  it('🔴 LOT CD — les lignes d’une carte en colonnes (nom · côté · honoraires nets · com négo · reste), la même structure que l’onglet Compromis ; la rétro du mois quitte la ligne, la fiche la dit', async () => {
    const retro = { id: 77, societe: 'criterimmo' as const, annee: 2025, mois: 1, negociateur: 'Jean-Baptiste PONS', montantTtc: 600, apporteur: 'M. Durand', venteId: 50, libelle: null, origine: 'saisie' as const, sourceOnglet: null, sourceCellule: null , interne: true };
    const fin = await ouvrirSur([deux], 'criterimmo', '/?vue=mois&annee=2025&mois=1', [retro]);
    try {
      const colonnes = (l: Element) => [...l.children].map((x) => x.className.split(' ')[0]);
      for (const l of container.querySelectorAll('[data-vente="50"] [data-nego-ligne]')) expect(colonnes(l)).toEqual(['trx-nego-nom', 'trx-nego-cote', 'trx-nego-col', 'trx-nego-col', 'trx-nego-col', 'trx-nego-extra']);
      expect(texte('[data-vente="50"] [data-carte-negos]')).not.toContain('rétro');
      await cliquer('[data-vente="50"] .tdb-replie-ligne');
      expect(texte('[data-vente="50"] [data-retro-fiche="77"]')).toBe('Rétrocession saisie au mois (janvier 2025, Jean-Baptiste PONS → M. Durand) : 500 € HT');
      const { CSS_TRANSACTION } = await import('./commun');
      expect(CSS_TRANSACTION.replace(/\s+/g, ' ')).toContain('.trx-carte-negos{display:grid;grid-template-columns:var(--trx-nego-c1,max-content) var(--trx-nego-c2,max-content)');
      const src = (await import('node:fs')).readFileSync('app/(admin)/admin/(protected)/transaction/OngletCompromis.tsx', 'utf8');
      expect(src.match(/<LignesNegociateurs /g)?.length).toBe(2); // CarteAffaire (Compromis, Le mois) et CarteMiroir : un seul rendu
    } finally { fin(); }
  });
  it('🔴 LOT CE — « honoraires nets » : le LIBELLÉ rouge (apporteur, ou rétrocession du mois rattachée), le montant gris ; sans déduction, gris', async () => {
    // une vente importée avec une rétrocession saisie au mois et rattachée (le cas ZEMMOR BERKER), et une vente sans déduction
    const zemmor = vente(60, { societe: 'criterimmo', libelle: 'ZEMMOR BERKER', honorairesTtc: 40000, sourceOnglet: 'CEDRIC' });
    const sci = vente(61, { societe: 'criterimmo', libelle: 'SCI LES TILLEULS/BLANCO', honorairesTtc: 7000, sourceOnglet: 'CEDRIC' });
    const retro = { id: 78, societe: 'criterimmo' as const, annee: 2025, mois: 1, negociateur: 'CEDRIC', montantTtc: 3333, apporteur: null, venteId: 60, libelle: null, origine: 'import' as const, sourceOnglet: 'CEDRIC', sourceCellule: 'J3' , interne: true };
    const fin = await ouvrirSur([deux, zemmor, sci], 'criterimmo', '/?vue=mois&annee=2025&mois=1', [retro]);
    try {
      const nets = (id: number) => container.querySelector(`[data-vente="${id}"] [data-nego-nets]`)!;
      expect([nets(50).className.includes('trx-rouge'), nets(60).className.includes('trx-rouge'), nets(61).className.includes('trx-rouge')]).toEqual([true, true, false]);
      // le montant n'est jamais rouge (il est dans son propre élément, gris)
      for (const id of [50, 60, 61]) expect(container.querySelector(`[data-vente="${id}"] [data-nego-honoraires]`)!.closest('.trx-rouge')).toBeNull();
      expect(texte('[data-vente="60"] [data-nego-reste]')).toBe('30 555,83 €');
    } finally { fin(); }
  });

  it('🔴 LOT CE — colonnes COMMUNES à la page : chaque colonne prend la largeur de la plus large de toutes les cartes (ventes et compromis)', async () => {
    // jsdom ne calcule pas de mise en page : la largeur d'une cellule simulée = 7 px par caractère
    const vraie = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) { return { width: (this.textContent ?? '').length * 7, height: 10, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect; };
    const comp = { ...deux, id: 52, statut: 'compromis' as const, mois: null, dateCompromis: '2025-01-12' };
    const sci = vente(61, { societe: 'criterimmo', libelle: 'SCI', honorairesTtc: 7000, sourceOnglet: 'CEDRIC' });
    const fin = await ouvrirSur([deux, sci, comp], 'criterimmo', '/?vue=mois&annee=2025&mois=1&mode=tous');
    try {
      const cont = container.querySelector('.trx-listes-mois') as HTMLElement;
      const cellules = [...cont.querySelectorAll('[data-carte-negos] [data-col]')];
      for (let k = 1; k <= 5; k++) {
        const max = Math.max(...cellules.filter((c) => c.getAttribute('data-col') === String(k)).map((c) => (c.textContent ?? '').length * 7));
        expect([k, cont.style.getPropertyValue(`--trx-nego-c${k}`)]).toEqual([k, `${max}px`]);
      }
      // deux listes (ventes, compromis du mois), un seul conteneur de mesure
      expect([cont.querySelector('[data-bloc="ventes-mois"]') !== null, cont.querySelector('[data-bloc="compromis-du-mois"]') !== null]).toEqual([true, true]);
    } finally { fin(); Element.prototype.getBoundingClientRect = vraie; }
  });
  it('🔴 LOT CG — « Résultat de l’agence » : les chiffres des rétrocessions et des commissions en ROUGE (grand et petit) ; les libellés inchangés', async () => {
    const fin = await ouvrirSur([deux], 'criterimmo');
    try {
      for (const sel of ['[data-retro-resultat]', '[data-paye-deduite]']) {
        const mt = container.querySelector(sel)!.closest('.trx-mt-liste')!;
        expect([sel, mt.className.includes('trx-rouge'), mt.querySelector('[data-montant-autre]')!.closest('.trx-rouge') !== null]).toEqual([sel, true, true]);
        expect(container.querySelector(sel)!.closest('dd')!.previousElementSibling!.className).not.toContain('trx-rouge');
      }
      expect(container.querySelector('[data-reste-agence]')!.closest('.trx-rouge')).toBeNull();
      await cliquer('[data-vue="annee"]');
      expect(container.querySelector('[data-paye-deduite-periode]')!.closest('.trx-mt-liste')!.className).toContain('trx-rouge');
    } finally { fin(); }
  });

  it('🔴 LOT CG — « Prénom NOM » partout : cartes, espace par négociateur, filtre ; la table du serveur fait foi (une mise à jour se répercute) ; aucun montant ne change', async () => {
    const avant = donnees.nomsNegociateurs;
    donnees.nomsNegociateurs = { MYLENE: 'Mylène EBERLIN', CEDRIC: 'Cédric JULLIEN', 'Jean-Baptiste PONS': 'Jean-Baptiste PONS', 'Cédric JULLIEN': 'Cédric JULLIEN' };
    try {
      const fin = await ouvrirSur([donnees.ventes[0]], 'macj');
      const reste = texte('[data-reste-agence]');
      try {
        expect(texte('[data-vente="1"] [data-nego-nom]')).toBe('Mylène EBERLIN, Cédric JULLIEN');
        await cliquer('[data-bloc="negociateurs-mois"] button');
        expect([...container.querySelectorAll('[data-table-negociateurs] tbody th')].map((x) => x.textContent).sort()).toEqual(['Cédric JULLIEN', 'Mylène EBERLIN']);
        expect(texte('[data-reste-agence]')).toBe(reste);
      } finally { fin(); }
      donnees.nomsNegociateurs = { MYLENE: 'Mylène DURAND', CEDRIC: 'Cédric JULLIEN' };
      const fin2 = await ouvrirSur([donnees.ventes[0]], 'macj');
      try { expect(texte('[data-vente="1"] [data-nego-nom]')).toBe('Mylène DURAND, Cédric JULLIEN'); } finally { fin2(); }
    } finally { donnees.nomsNegociateurs = avant; }
  });
  it('🔴 LOT CH — le Résultat = la somme des cartes : rétrocessions RATTACHÉES aux ventes affichées (même saisies un autre mois) ; « à répartir » à part, en orange ; HT et TTC au centime', async () => {
    const zemmor = vente(60, { societe: 'criterimmo', libelle: 'ZEMMOR BERKER', honorairesTtc: 40000, sourceOnglet: 'CEDRIC' });
    const basu = vente(61, { societe: 'criterimmo', libelle: 'BASUYEAUX', honorairesTtc: 11000, sourceOnglet: 'ARNAUD' });
    const r = (id: number, venteId: number | null, montantTtc: number, annee: number, mois: number) => ({ id, societe: 'criterimmo' as const, annee, mois, negociateur: 'CEDRIC', montantTtc,
      apporteur: null, venteId, libelle: null, origine: 'import' as const, sourceOnglet: 'CEDRIC', sourceCellule: 'L3', interne: true });
    // 3 333 rattachée à ZEMMOR (saisie ce mois), 500 rattachée à BASUYEAUX mais saisie en décembre 2024, 833 « à répartir » saisie ce mois
    const fin = await ouvrirSur([zemmor, basu], 'criterimmo', '/?vue=mois&annee=2025&mois=1', [r(1, 60, 3333, 2025, 1), r(2, 61, 500, 2024, 12), r(124, null, 833, 2025, 1)]);
    try {
      for (const u of ['ht', 'ttc'] as const) {
        if (u === 'ttc') await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
        const cartes = (k: string) => [...container.querySelectorAll(`[data-cartes-ventes] [data-nego-${k}]`)].reduce((t, x) => t + centimes(x.textContent!), 0);
        expect(montant('[data-reste-agence]')).toBe(cartes('reste'));
        expect(montant('[data-retro-resultat]')).toBe(u === 'ttc' ? 383300 : Math.round(3333 / 1.2 * 100) + Math.round(500 / 1.2 * 100));
      }
      expect(texte('[data-total-hors-resultat]')).toBe('833 € TTC (694,17 € HT)');
      expect(texte('[data-retros-hors-resultat]')).toContain('Non déduites ci-dessus — à rattacher à leur vente.');
      await cliquer('[data-ouvrir-hors-resultat]');
      expect(texte('[data-retro-hors="124"]')).toContain('à répartir');
      expect(texte('[data-retro-hors="124"]')).toContain('CEDRIC › L3');
      expect(container.textContent).not.toContain('Les rétrocessions comptent sur le mois où elles sont saisies');
    } finally { fin(); }
  });

  it('🔴 LOT CH — un mois sans rétrocession hors vente : pas de ligne orange ; compromis (apporteur de répartition) et « Vendu + compromis » : Résultat = cartes', async () => {
    const comp = { ...deux, id: 52, statut: 'compromis' as const, mois: null, dateCompromis: '2025-01-12' };
    for (const mode of ['compromis', 'tous'] as const) {
      const fin = await ouvrirSur([deux, comp], 'criterimmo', `/?vue=mois&annee=2025&mois=1&mode=${mode}`);
      try {
        expect(container.querySelector('[data-retros-hors-resultat]')).toBeNull();
        const cartes = [...container.querySelectorAll('.trx-listes-mois [data-nego-reste]')].reduce((t, x) => t + centimes(x.textContent!), 0);
        expect([mode, montant('[data-reste-agence]')]).toEqual([mode, cartes]);
      } finally { fin(); }
    }
  });
  it('🔴 LOT CL — Espace par négociateur, juillet 2026 : CA net = CA généré − Com comptabilisée − Rétrocessions = la somme de ses cartes ; total = Reste à l’agence (HT et TTC)', async () => {
    const r = (id: number, venteId: number, negociateur: string, montantTtc: number) => ({ id, societe: 'criterimmo' as const, annee: 2025, mois: 1, negociateur, montantTtc,
      apporteur: null, venteId, libelle: null, origine: 'import' as const, sourceOnglet: negociateur, sourceCellule: 'J3', interne: true });
    const lc = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'negociateur', montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const zemmor = vente(60, { societe: 'criterimmo', libelle: 'ZEMMOR BERKER', honorairesTtc: 40000, lignes: [{ ...lc('CEDRIC', 0), role: 'part', montantTtc: 40000 }] });
    const millecamps = vente(61, { societe: 'criterimmo', libelle: 'MILLECAMPS', honorairesTtc: 29423, lignes: [lc('MYLENE', 23538)] /* une indépendante (le jeu d'essai), comme Catherine TARRISSE */ });
    const basu = vente(62, { societe: 'criterimmo', libelle: 'BASUYEAUX', honorairesTtc: 11000, lignes: [{ ...lc('ARNAUD', 0), role: 'part', montantTtc: 11000 }] });
    const fin = await ouvrirSur([zemmor, millecamps, basu, deux], 'criterimmo', '/?vue=mois&annee=2025&mois=1', [r(1, 60, 'CEDRIC', 3333), r(2, 62, 'ARNAUD', 500)]);
    try {
      await cliquer('[data-bloc="negociateurs-mois"] button');
      expect([...container.querySelectorAll('[data-table-negociateurs] thead th')].map((x) => x.textContent)).toEqual(['Négociateur', 'Statut', 'Ventes', 'CA HT généré▲▼', 'Com HT', 'Rétrocessions HT', 'CA net HT▲▼']);
      await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
      expect([texte('[data-ca-net="CEDRIC"]'), texte('[data-ca-net="MYLENE"]'), texte('[data-ca-net="ARNAUD"]')]).toEqual(['36 667 €', '5 885 €', '10 500 €']);
      expect(container.querySelector('[data-com-espace="MYLENE"]')!.closest('.trx-rouge')).not.toBeNull(); // comptabilisée (indépendante)
      expect(container.querySelector('[data-com-espace="CEDRIC"]')!.closest('.trx-rouge')).toBeNull();
      // la vente à deux négociateurs : une ligne chacun (JB, Cédric JULLIEN)
      expect([...container.querySelectorAll('[data-table-negociateurs] tbody tr')].map((x) => x.getAttribute('data-negociateur'))).toEqual(expect.arrayContaining(['Jean-Baptiste PONS', 'Cédric JULLIEN']));
      for (const u of ['ttc', 'ht'] as const) {
        if (u === 'ht') await cliquer('[data-affichage-montants] [data-afficher="ht"]');
        expect(montant('[data-total-ca-net]')).toBe(montant('[data-reste-agence]'));
        const nets = [...container.querySelectorAll('[data-table-negociateurs] tbody [data-ca-net]')].reduce((t, x) => t + centimes(x.textContent!), 0);
        expect(nets).toBe(montant('[data-total-ca-net]'));
      }
    } finally { fin(); }
  });

  it('🔴 LOT CL — un mois sans vente : « Aucune vente sur la période. »', async () => {
    const fin = await ouvrirSur([], 'criterimmo');
    try {
      await cliquer('[data-bloc="negociateurs-mois"] button');
      expect(texte('[data-bloc="negociateurs-mois"]')).toContain('Aucune vente sur la période.');
      expect(container.querySelector('[data-bloc="negociateurs-mois"] [data-tri]')).toBeNull(); // 🔴 LOT CO : rien à trier
    } finally { fin(); }
  });

  describe('🔴 LOT CO — tri de l’Espace par négociateur sur « CA généré » et « CA net »', () => {
    const lcp = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = () => [
      vente(60, { societe: 'criterimmo', libelle: 'ZEMMOR BERKER', honorairesTtc: 40000, lignes: [lcp('CEDRIC', 40000)] }),
      vente(61, { societe: 'criterimmo', libelle: 'MILLECAMPS', honorairesTtc: 29423, lignes: [{ ...lcp('MYLENE', 23538), role: 'negociateur' }] }),
      vente(62, { societe: 'criterimmo', libelle: 'BASUYEAUX', honorairesTtc: 11000, lignes: [lcp('ARNAUD', 11000)] }), deux];
    const corps = () => [...container.querySelectorAll('[data-table-negociateurs] tbody tr')];
    const colonne = (attr: string) => corps().map((tr) => centimes(tr.querySelector(`[${attr}]`)!.textContent!));
    const verts = () => [...container.querySelectorAll('[data-table-negociateurs] thead .trx-tri-on')].map((x) => `${x.closest('[data-tri]')!.getAttribute('data-tri')}:${x.getAttribute('data-fleche')}`);
    const aria = () => [...container.querySelectorAll('[data-table-negociateurs] thead [data-entete-tri]')].map((x) => x.getAttribute('aria-sort'));
    const decroissant = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] >= x);
    const croissant = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] <= x);
    beforeEach(async () => { const { oublierTriEspace } = await import('./EcransTransaction'); oublierTriEspace(); });

    it('par défaut : ordre actuel, flèches grises, aria-sort none ; CA généré : décroissant puis croissant ; CA net : décroissant d’abord ; une seule flèche verte ; Total en bas ; HT et TTC', async () => {
      const fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=1', []);
      try {
        await cliquer('[data-bloc="negociateurs-mois"] button');
        const defaut = corps().map((tr) => tr.getAttribute('data-negociateur'));
        expect([verts(), aria()]).toEqual([[], ['none', 'none']]);
        for (const u of ['ht', 'ttc'] as const) {
          if (u === 'ttc') await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
          await cliquer('[data-table-negociateurs] thead [data-tri="ca"]');
          if (u === 'ttc') await cliquer('[data-table-negociateurs] thead [data-tri="ca"]'); // repartir en décroissant (le tri était resté sur CA, croissant)
          expect([u, decroissant(colonne('data-ca-genere')), verts(), aria()]).toEqual([u, true, ['ca:desc'], ['descending', 'none']]);
          await cliquer('[data-table-negociateurs] thead [data-tri="ca"]');
          expect([u, croissant(colonne('data-ca-genere')), verts(), aria()]).toEqual([u, true, ['ca:asc'], ['ascending', 'none']]);
          await cliquer('[data-table-negociateurs] thead [data-tri="net"]');
          expect([u, decroissant(colonne('data-ca-net')), verts(), aria()]).toEqual([u, true, ['net:desc'], ['none', 'descending']]);
          await cliquer('[data-table-negociateurs] thead [data-tri="net"]');
          expect([u, croissant(colonne('data-ca-net')), verts(), aria()]).toEqual([u, true, ['net:asc'], ['none', 'ascending']]);
          await cliquer('[data-table-negociateurs] thead [data-tri="ca"]'); // l'autre colonne : décroissant d'abord
          expect(verts()).toEqual(['ca:desc']);
          // la ligne Total reste en bas, hors tri ; la barre du téléphone dit la même chose
          expect(container.querySelector('[data-table-negociateurs] tbody [data-total-espace]')).toBeNull();
          expect(container.querySelector('[data-table-negociateurs] tfoot tr')!.hasAttribute('data-total-espace')).toBe(true);
          expect([...container.querySelectorAll('.trx-tri-mobile .trx-tri-on')].map((x) => x.getAttribute('data-fleche'))).toEqual(['desc']);
          expect(container.querySelector('.trx-tri-mobile [data-tri-mobile="ca"]')!.getAttribute('aria-pressed')).toBe('true');
        }
        expect(new Set(corps().map((tr) => tr.getAttribute('data-negociateur')))).toEqual(new Set(defaut)); // même lignes, autre ordre
      } finally { fin(); }
    });

    it('égalités → ordre alphabétique du nom (décroissant comme croissant) ; la barre du téléphone trie aussi', async () => {
      const fin = await ouvrirSur([vente(70, { societe: 'criterimmo', libelle: 'B', honorairesTtc: 5000, lignes: [lcp('ZOE', 5000)] }),
        vente(71, { societe: 'criterimmo', libelle: 'A', honorairesTtc: 5000, lignes: [lcp('ALAIN', 5000)] })], 'criterimmo', '/?vue=mois&annee=2025&mois=1', []);
      try {
        await cliquer('[data-bloc="negociateurs-mois"] button');
        await cliquer('.trx-tri-mobile [data-tri-mobile="ca"]');
        expect(corps().map((tr) => tr.getAttribute('data-negociateur'))).toEqual(['ALAIN', 'ZOE']);
        expect(verts()).toEqual(['ca:desc']);
        await cliquer('.trx-tri-mobile [data-tri-mobile="ca"]');
        expect(corps().map((tr) => tr.getAttribute('data-negociateur'))).toEqual(['ALAIN', 'ZOE']);
        expect(verts()).toEqual(['ca:asc']);
      } finally { fin(); }
    });

    it('le choix est retenu en changeant de mois / de mode (l’écran remonté), et perdu au rechargement', async () => {
      let fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=1', []);
      try {
        await cliquer('[data-bloc="negociateurs-mois"] button');
        await cliquer('[data-table-negociateurs] thead [data-tri="net"]');
      } finally { fin(); }
      fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=1&mode=tous', []);
      try {
        await cliquer('[data-bloc="negociateurs-mois"] button');
        expect([verts(), decroissant(colonne('data-ca-net'))]).toEqual([['net:desc'], true]);
        const boutons = container.querySelectorAll('[data-table-negociateurs] thead button[data-tri]');
        expect([...boutons].map((b) => b.getAttribute('type'))).toEqual(['button', 'button']); // vrais boutons : Entrée / Espace au clavier
      } finally { fin(); }
      const { oublierTriEspace } = await import('./EcransTransaction');
      oublierTriEspace(); // = rechargement de la page
      fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=1', []);
      try {
        await cliquer('[data-bloc="negociateurs-mois"] button');
        expect([verts(), aria()]).toEqual([[], ['none', 'none']]);
      } finally { fin(); }
    });
  });
  describe('🔴 LOT CP — « Mensuel | Période » : plusieurs mois choisis, cumulés (la somme exacte des mois)', () => {
    const lp = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = () => [
      vente(60, { societe: 'criterimmo', libelle: 'JUILLET', honorairesTtc: 10000.01, annee: 2025, mois: 7, lignes: [lp('MYLENE', 'negociateur', 2000.33)] }),
      vente(61, { societe: 'criterimmo', libelle: 'SEPTEMBRE', honorairesTtc: 16275.07, annee: 2025, mois: 9, lignes: [lp('CEDRIC', 'part', 16275.07)] }),
      vente(62, { societe: 'criterimmo', libelle: 'AOUT', honorairesTtc: 5000, annee: 2025, mois: 8 }),
      vente(63, { societe: 'criterimmo', libelle: 'N-1 JUILLET', honorairesTtc: 7000.03, annee: 2024, mois: 7 }),
      vente(64, { societe: 'criterimmo', libelle: 'N-1 SEPTEMBRE', honorairesTtc: 4000, annee: 2024, mois: 9 }),
      vente(65, { societe: 'criterimmo', libelle: 'COMPROMIS JUILLET', honorairesTtc: 9000.05, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-07-10', lignes: [lp('MYLENE', 'negociateur', 1500)] }),
      vente(66, { societe: 'criterimmo', libelle: 'COMPROMIS SEPTEMBRE', honorairesTtc: 3000, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-09-03' }),
    ];
    const r = (id: number, mois: number, venteId: number | null, montantTtc: number) => ({ id, societe: 'criterimmo' as const, annee: 2025, mois, negociateur: 'MYLENE', montantTtc,
      apporteur: null, venteId, libelle: null, origine: 'import' as const, sourceOnglet: 'MYLENE', sourceCellule: 'J3', interne: true });
    const retros = () => [r(1, 7, 60, 500.01), r(2, 9, null, 250)];
    const choisis = () => [...container.querySelectorAll('.trx-onglets-periode [aria-pressed="true"]')].map((x) => Number(x.getAttribute('data-onglet-mois')));
    const adresse = () => new URLSearchParams(window.location.search).get('periode');

    it('bascule Mensuel ↔ Période ; sélection / désélection ; mois contigus et non contigus ; le dernier ne se retire pas ; retour au dernier mois cliqué', async () => {
      const fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=7', retros());
      try {
        expect([texte('[data-choix-periode] [aria-pressed="true"]'), container.querySelector('.trx-rangee-mois [role="tablist"] [aria-selected="true"]')!.getAttribute('data-onglet-mois')]).toEqual(['Mois', '7']);
        expect([container.querySelector('[data-periode-libelle]'), adresse()]).toEqual([null, null]);
        await cliquer('[data-decouper="periode"]');
        expect([choisis(), texte('[data-bloc="ventes-mois"] h3'), adresse()]).toEqual([[7], 'Les ventes de la période — juillet 2025', '2025-07']); // le mois en cours reste choisi
        await cliquer('[data-onglet-mois="9"]');
        expect([choisis(), texte('[data-bloc="ventes-mois"] h3'), adresse()]).toEqual([[7, 9], 'Les ventes de la période — 2 mois de 2025', '2025-07,2025-09']);
        await cliquer('[data-onglet-mois="8"]');
        expect([choisis(), texte('[data-bloc="ventes-mois"] h3')]).toEqual([[7, 8, 9], 'Les ventes de la période — juil. → sept. 2025']);
        await cliquer('[data-onglet-mois="8"]');
        await cliquer('[data-onglet-mois="7"]');
        expect([choisis(), container.querySelector('[data-periode-refus]')]).toEqual([[9], null]);
        await cliquer('[data-onglet-mois="9"]'); // le dernier : refusé, un petit message
        expect([choisis(), texte('[data-periode-refus]')]).toEqual([[9], 'Au moins un mois reste choisi.']);
        await cliquer('[data-onglet-mois="7"]');
        expect([choisis(), container.querySelector('[data-periode-refus]')]).toEqual([[7, 9], null]);
        // titres et graphique
        expect(texte('[data-bloc="apporteurs-mois"] h3')).toContain('Apporteurs de la période — 2 mois de 2025');
        expect(texte('[data-bloc="ventes-mois"] h3')).toBe('Les ventes de la période — 2 mois de 2025');
        expect(texte('[data-bloc="resultat-mois"] h3')).toBe('Résultat de l’agence — Période : 2 mois de 2025');
        expect(container.querySelector('[data-bloc="histogramme-mois"]')!.getAttribute('data-periode-graphe')).toBe('7,9');
        expect([...container.querySelectorAll('[data-bloc="ventes-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['61', '60']); // 🔴 LOT DJ : la date la plus récente d'abord
        // téléphone : le bouton est dans la ligne des mois, après les mois (la feuille le passe au-dessus, à droite)
        const rangee = container.querySelector('.trx-rangee-mois')!;
        expect([...rangee.children].map((x) => x.className)).toEqual(['tdb-onglets trx-onglets-periode', 'trx-unites trx-choix-periode']);
        const { CSS_TRANSACTION } = await import('./commun');
        expect(CSS_TRANSACTION.replace(/\s+/g, ' ')).toContain('@media (max-width:720px){ .trx-rangee-mois{flex-direction:column-reverse');
        await cliquer('[data-decouper="mois"]'); // 🔴 LOT CT : « Mois » (l'ancien « Mensuel »)
        expect([container.querySelector('.trx-rangee-mois [role="tablist"] [aria-selected="true"]')!.getAttribute('data-onglet-mois'), adresse(), container.querySelector('[data-periode-libelle]')])
          .toEqual(['7', null, null]); // le dernier mois cliqué
      } finally { fin(); }
    });

    it('le lien partagé (&periode=…) rouvre la période ; la sélection est retenue en changeant d’onglet', async () => {
      const fin = await ouvrirSur(jeu(), 'criterimmo', '/?periode=2025-09,2025-07', retros());
      try {
        expect([choisis(), texte('[data-bloc="ventes-mois"] h3'), container.querySelector('[data-vue="mois"]')!.getAttribute('aria-selected')]).toEqual([[7, 9], 'Les ventes de la période — 2 mois de 2025', 'true']);
        await cliquer('[data-vue="annee"]');
        expect(adresse()).toBeNull();
        await cliquer('[data-vue="mois"]');
        expect([choisis(), adresse()]).toEqual([[7, 9], '2025-07,2025-09']);
      } finally { fin(); }
    });

    it('chaque total de la période = la somme des mois pris un par un, au centime (HT et TTC, trois modes) ; N−1 sur les mêmes mois', async () => {
      const lire = async (q: string, u: 'ht' | 'ttc') => {
        window.localStorage.setItem('trx-affichage-montants', u);
        const fin = await ouvrirSur(jeu(), 'criterimmo', q, retros());
        try {
          if (container.querySelector('[data-total-ca-net]') === null) await cliquer('[data-bloc="negociateurs-mois"] button');
          const n1 = texte('[data-tuile-n1="ca"]');
          return { ca: montant('[data-tuile="ca-mois"] .tdb-tuile-valeur'), nb: Number(texte('[data-tuile="ventes-mois"] .tdb-tuile-valeur')), reste: montant('[data-reste-agence]'),
            caNet: montant('[data-total-ca-net]'), caGenere: montant('[data-total-ca-genere]'), horsResultat: container.querySelector('[data-total-hors-resultat]') === null ? 0 : centimes(texte('[data-total-hors-resultat]').split('(')[0]),
            // sans N−1 (« 2024 : aucun compromis daté ») : le message, tel quel
            n1: n1.includes(' : ') ? n1 : centimes(n1.split(/ en | sur /)[0]), cartes: container.querySelectorAll('.trx-listes-mois [data-vente]').length };
        } finally { fin(); }
      };
      for (const mode of ['vendu', 'compromis', 'tous'] as const) {
        for (const u of ['ht', 'ttc'] as const) {
          const [a, b, p] = [await lire(`/?vue=mois&annee=2025&mois=7&mode=${mode}`, u), await lire(`/?vue=mois&annee=2025&mois=9&mode=${mode}`, u),
            await lire(`/?vue=mois&annee=2025&mois=9&mode=${mode}&periode=2025-07,2025-09`, u)];
          const somme = Object.fromEntries(Object.keys(a).map((k) => { const [x, y] = [a[k as keyof typeof a], b[k as keyof typeof b]];
            return [k, typeof x === 'string' ? (x === y ? x : `${x} ≠ ${y}`) : x + (y as number)]; }));
          expect(Number.isNaN(p.horsResultat)).toBe(false);
          expect([mode, u, p]).toEqual([mode, u, somme]);
        }
      }
    });
    describe('🔴 LOT CT — « Mois | Période | Année »', () => {
      const pressee = () => texte('[data-choix-periode] [aria-pressed="true"]');
      const vueMois = () => new URLSearchParams(window.location.search).get('vue-mois');
      it('trois positions (Mois par défaut) ; « Année » : les mois écoulés soulignés (2025 en cours : janvier → octobre), « Année 2025 », N−1 sur 2024 entière ; changer d’année ; un clic sur un mois → Période sans lui ; retour au Mois', async () => {
        const fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=7', retros());
        try {
          expect([[...container.querySelectorAll('[data-choix-periode] button')].map((x) => x.textContent), pressee(), vueMois()]).toEqual([['Mois', 'Période', 'Année'], 'Mois', 'mois']);
          await cliquer('[data-decouper="annee"]');
          expect([pressee(), choisis(), vueMois(), adresse()]).toEqual(['Année', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'annee', null]);
          expect(texte('[data-bloc="resultat-mois"] h3')).toBe('Résultat de l’agence — Année 2025');
          expect(texte('[data-bloc="ventes-mois"] h3')).toBe('Les ventes de l’année — 2025');
          expect(texte('[data-bloc="apporteurs-mois"] h3')).toContain('Apporteurs de l’année — 2025');
          expect(texte('[data-tuile="ca-mois"] .tdb-tuile-mot')).toBe('CA HT — année');
          expect(texte('[data-tuile-n1="ca"]')).toMatch(/ en 2024 \(/);
          expect(container.querySelector('[data-bloc="histogramme-mois"]')!.getAttribute('data-periode-graphe')).toBe('1,2,3,4,5,6,7,8,9,10'); // Arno (01/11/2026) — en rouge : les mois soulignés (écoulés), plus les 12
          // changer d'année : les 12 mois de la nouvelle
          await cliquer('[data-filtre="annee"]');
          const o = [...document.querySelectorAll('[role="option"]')].find((x) => (x.textContent ?? '').replace('✓', '') === '2024') as HTMLElement;
          await act(async () => { o.click(); }); await calmer();
          expect([pressee(), choisis().length, texte('[data-bloc="resultat-mois"] h3')]).toEqual(['Année', 12, 'Résultat de l’agence — Année 2024']);
          // un clic sur un mois : Période, ce mois retiré (11 mois)
          await cliquer('[data-onglet-mois="3"]');
          expect([pressee(), choisis(), vueMois(), adresse()]).toEqual(['Période', [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'periode', '2024-01,2024-02,2024-04,2024-05,2024-06,2024-07,2024-08,2024-09,2024-10,2024-11,2024-12']);
          await cliquer('[data-decouper="annee"]');
          await cliquer('[data-decouper="mois"]');
          expect([pressee(), container.querySelector('.trx-rangee-mois [role="tablist"] [aria-selected="true"]')!.getAttribute('data-onglet-mois'), vueMois()]).toEqual(['Mois', '7', 'mois']);
        } finally { fin(); }
      });
      it('les liens : &vue-mois=annee ; les anciens (« &periode=… » sans vue-mois → Période ; sans rien → Mois)', async () => {
        let fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=7&vue-mois=annee', retros());
        try { expect([pressee(), choisis().length]).toEqual(['Année', 10]); } finally { fin(); }
        fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=9&periode=2025-07,2025-09', retros());
        try { expect([pressee(), choisis(), vueMois()]).toEqual(['Période', [7, 9], 'periode']); } finally { fin(); }
        fin = await ouvrirSur(jeu(), 'criterimmo', '/?annee=2025&mois=7', retros());
        try { expect([pressee(), vueMois()]).toEqual(['Mois', 'mois']); } finally { fin(); }
      });
      it('en Année, chaque total = la somme des 12 mois pris un par un, au centime (HT et TTC, trois modes)', async () => {
        const lire = async (q: string, u: 'ht' | 'ttc') => {
          window.localStorage.setItem('trx-affichage-montants', u);
          const fin = await ouvrirSur(jeu(), 'criterimmo', q, retros());
          try {
            if (container.querySelector('[data-total-ca-net]') === null) await cliquer('[data-bloc="negociateurs-mois"] button');
            return [montant('[data-tuile="ca-mois"] .tdb-tuile-valeur'), Number(texte('[data-tuile="ventes-mois"] .tdb-tuile-valeur')), montant('[data-reste-agence]'), montant('[data-total-ca-net]')];
          } finally { fin(); }
        };
        for (const mode of ['vendu', 'compromis', 'tous'] as const) for (const u of ['ht', 'ttc'] as const) {
          const an = await lire(`/?vue=mois&annee=2025&mois=7&mode=${mode}&vue-mois=annee`, u);
          const somme = [0, 0, 0, 0];
          for (let m = 1; m <= 12; m++) (await lire(`/?vue=mois&annee=2025&mois=${m}&mode=${mode}&vue-mois=mois`, u)).forEach((x, i) => { somme[i] += x; });
          expect([mode, u, an]).toEqual([mode, u, somme]);
        }
      }, 30_000); // 🔴 LOT DM : test lourd (des dizaines d'écrans) — délai long, docs/FLAKES_CONNUS.md
    });
  });

  describe('🔴 LOT CQ — un négociateur n’apparaît jamais deux fois ; plus de ligne « Période : … » ; le bouton « Mensuel | Période » centré', () => {
    const lq = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    // « ARNAUD » (libellé d'import) et « Arnaud Jorel » (libellé du compte) : une seule personne, « Arnaud JOREL » (lot CG)
    const jeu = () => [
      vente(80, { societe: 'criterimmo', libelle: 'BASUYEAUX', honorairesTtc: 11000, annee: 2025, mois: 1, lignes: [lq('ARNAUD', 'part', 11000)] }),
      vente(81, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, annee: 2025, mois: 1, lignes: [lq('Arnaud Jorel', 'part', 4000)] }),
      vente(82, { societe: 'criterimmo', libelle: 'ZEMMOR', honorairesTtc: 40000, annee: 2025, mois: 1, lignes: [lq('CEDRIC', 'part', 40000)] }),
      vente(83, { societe: 'criterimmo', libelle: 'MILLECAMPS', honorairesTtc: 29423, annee: 2025, mois: 1, lignes: [lq('Cédric JULLIEN', 'negociateur', 2000)] }),
    ];
    const noms = { ARNAUD: 'Arnaud JOREL', 'Arnaud Jorel': 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN', 'Cédric JULLIEN': 'Cédric JULLIEN' };
    const ouvrirNoms = async (q: string) => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = noms;
      const fin = await ouvrirSur(jeu(), 'criterimmo', q);
      return () => { fin(); donnees.nomsNegociateurs = avant; };
    };
    const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => (o.textContent ?? '').replace('✓', '')); // ✓ : l'entrée choisie
    /** 🔴 L'épreuve anti-doublon : deux entrées qui affichent le même nom font échouer. */
    const sansDoublon = (quoi: string, xs: readonly string[]) => expect([quoi, xs.filter((x, i) => xs.indexOf(x) !== i)]).toEqual([quoi, []]);

    it('la ligne « Période : … » n’existe plus (Mensuel et Période) ; les titres des blocs disent la période', async () => {
      const fin = await ouvrirNoms('/?vue=mois&annee=2025&mois=1');
      try {
        const sous = () => container.querySelector('.trx-rangee-mois')!.nextElementSibling!;
        expect([container.querySelector('[data-periode-libelle]'), sous().classList.contains('tdb-tuiles')]).toEqual([null, true]); // 🔴 LOT DB : + trx-tuiles-alignees
        await cliquer('[data-decouper="periode"]');
        await cliquer('[data-onglet-mois="3"]');
        expect([container.querySelector('[data-periode-libelle]'), sous().classList.contains('tdb-tuiles')]).toEqual([null, true]); // 🔴 LOT DB : + trx-tuiles-alignees
        expect(texte('[data-bloc="ventes-mois"] h3')).toBe('Les ventes de la période — 2 mois de 2025');
        expect(texte('[data-bloc="resultat-mois"] h3')).toBe('Résultat de l’agence — Période : 2 mois de 2025');
        // 🔴 LOT LO12 — la liste complète des mois en infobulle
        expect(container.querySelector('[data-bloc="resultat-mois"] h3')!.getAttribute('title')).toBe('janvier, mars 2025');
      } finally { fin(); }
    });

    it('le filtre : un seul « Arnaud JOREL », qui choisit ses ventes ARNAUD + compte ensemble ; dans l’adresse ; un ancien lien (libellé) ouvre la même personne', async () => {
      let fin = await ouvrirNoms('/?vue=mois&annee=2025&mois=1');
      try {
        const tousCa = montant('[data-tuile="ca-mois"] .tdb-tuile-valeur');
        await cliquer('[data-filtre="negociateur"]');
        expect(options().filter((x) => x === 'Arnaud JOREL')).toHaveLength(1);
        sansDoublon('filtre Négociateur', options());
        expect(options()).toEqual(['Tous', 'Arnaud JOREL', 'Cédric JULLIEN']);
        const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'Arnaud JOREL') as HTMLElement;
        await act(async () => { option.click(); }); await calmer();
        expect([texte('[data-tuile="ventes-mois"] .tdb-tuile-valeur'), [...container.querySelectorAll('[data-bloc="ventes-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))])
          .toEqual(['2', ['80', '81']]);
        expect(montant('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe(Math.round((11000 + 4000) / 1.2 * 100)); // en HT : ses deux ventes
        expect(new URLSearchParams(window.location.search).get('negociateur')).toBe('Arnaud JOREL');
        expect(tousCa).toBe(Math.round((11000 + 4000 + 40000 + 29423) / 1.2 * 100)); // sans filtre : rien ne change
      } finally { fin(); }
      fin = await ouvrirNoms('/?vue=mois&annee=2025&mois=1&negociateur=ARNAUD');
      try {
        expect(texte('[data-tuile="ventes-mois"] .tdb-tuile-valeur')).toBe('2');
        expect(texte('[data-filtre="negociateur"]')).toContain('Arnaud JOREL');
      } finally { fin(); }
    });

    it('anti-doublon : l’Espace par négociateur (Le mois, L’année) et son compteur, les lignes des Apporteurs — un nom, une entrée', async () => {
      const fin = await ouvrirNoms('/?vue=mois&annee=2025&mois=1');
      try {
        await cliquer('[data-bloc="negociateurs-mois"] button');
        const lignes = [...container.querySelectorAll('[data-table-negociateurs] tbody th')].map((x) => x.textContent ?? '');
        sansDoublon('Espace par négociateur (Le mois)', lignes);
        expect(lignes.sort()).toEqual(['Arnaud JOREL', 'Cédric JULLIEN']);
        expect(texte('[data-bloc="negociateurs-mois"]')).toContain('2 négociateur(s)');
        await cliquer('[data-vue="annee"]');
        if (container.querySelector('[data-bloc="negociateurs-periode"] [data-table-negociateurs]') === null) await cliquer('[data-bloc="negociateurs-periode"] button');
        const an = [...container.querySelectorAll('[data-bloc="negociateurs-periode"] [data-table-negociateurs] tbody th')].map((x) => x.textContent ?? '');
        sansDoublon('Les négociateurs (L’année)', an);
        expect(texte('[data-bloc="negociateurs-periode"]')).toContain('2 négociateur(s)');
      } finally { fin(); }
    });

    it('le bouton « Mensuel | Période » : centré dans la ligne des mois, même marge en haut et en bas (sans toucher le trait), hauteur des onglets ; téléphone au-dessus, à droite', async () => {
      const { CSS_TRANSACTION } = await import('./commun');
      const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
      expect(css).toContain('.trx-rangee-mois .trx-choix-periode{flex:0 0 auto;align-self:center;margin:6px 0}');
      expect(css).toContain('.trx-rangee-mois .trx-choix-periode .trx-unite{min-height:42px}');
      expect(css).toContain('@media (max-width:720px){ .trx-rangee-mois{flex-direction:column-reverse;align-items:stretch;gap:0} .trx-rangee-mois .trx-choix-periode{align-self:flex-end} }');
    });
  });

  describe('🔴 LOT CU — « Négociateur » à choix multiple ; de 2 à 5 : une série par négociateur, tuiles cumulées sans N−1', () => {
    const lu = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    // six personnes ; « ARNAUD » et « Arnaud Jorel » = Arnaud JOREL ; la vente 107 est PARTAGÉE (CEDRIC + ANTOINE)
    const jeu = () => [
      vente(101, { societe: 'criterimmo', libelle: 'A1', honorairesTtc: 11000, annee: 2025, mois: 1, lignes: [lu('ARNAUD', 11000)] }),
      vente(102, { societe: 'criterimmo', libelle: 'A2', honorairesTtc: 4000.01, annee: 2025, mois: 3, lignes: [lu('Arnaud Jorel', 4000.01)] }),
      vente(103, { societe: 'criterimmo', libelle: 'C1', honorairesTtc: 40000, annee: 2025, mois: 1, lignes: [lu('CEDRIC', 40000)] }),
      vente(104, { societe: 'criterimmo', libelle: 'M1', honorairesTtc: 5000, annee: 2025, mois: 1, lignes: [lu('MYLENE', 5000)] }),
      vente(105, { societe: 'criterimmo', libelle: 'AN1', honorairesTtc: 6000, annee: 2025, mois: 2, lignes: [lu('ANTOINE', 6000)] }),
      vente(106, { societe: 'criterimmo', libelle: 'H1', honorairesTtc: 7000, annee: 2025, mois: 3, lignes: [lu('HELENE', 7000)] }),
      vente(107, { societe: 'criterimmo', libelle: 'PARTAGEE', honorairesTtc: 10000, annee: 2025, mois: 2, lignes: [lu('CEDRIC', 5000), lu('ANTOINE', 5000)] }),
      vente(108, { societe: 'criterimmo', libelle: 'J1', honorairesTtc: 3000, annee: 2025, mois: 1, lignes: [lu('JULIEN', 3000)] }),
      vente(109, { societe: 'criterimmo', libelle: 'N-1', honorairesTtc: 2000, annee: 2024, mois: 1, lignes: [lu('CEDRIC', 2000)] }),
    ];
    const noms = { ARNAUD: 'Arnaud JOREL', 'Arnaud Jorel': 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN', ANTOINE: 'Antoine', HELENE: 'Helene', JULIEN: 'Julien', MYLENE: 'Mylene' };
    const ouvrirN = async (q: string) => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = noms;
      const fin = await ouvrirSur(jeu(), 'criterimmo', q);
      return () => { fin(); donnees.nomsNegociateurs = avant; };
    };
    const champ = () => texte('[data-filtre="negociateur"]');
    const option = (nom: string) => [...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent ?? '').replace('✓', '') === nom) as HTMLElement;
    const cocher = async (nom: string) => { await act(async () => { option(nom).click(); }); await calmer(); };
    const url = () => new URLSearchParams(window.location.search).getAll('negociateur');
    const caTuile = () => montant('[data-tuile="ca-mois"] .tdb-tuile-valeur');
    const serieMois = (couleur: number, mois: number) => Number(container.querySelector(`[data-barre-mois="${mois}"] [data-barre-serie="${couleur}"]`)!.getAttribute('data-valeur'));

    it('1, 2, 5 négociateurs ; le 6e refusé (« 5 au maximum ») ; « Tous » vide la sélection ; le champ fermé ; l’adresse', async () => {
      const fin = await ouvrirN('/?vue=mois&annee=2025&mois=1');
      try {
        expect(champ()).toBe('Tous');
        await cliquer('[data-filtre="negociateur"]');
        expect(document.querySelector('[role="listbox"]')!.getAttribute('aria-multiselectable')).toBe('true');
        expect([...document.querySelectorAll('[role="option"]')].map((o) => (o.textContent ?? '').replace('✓', ''))).toEqual(['Tous', 'Antoine', 'Arnaud JOREL', 'Cédric JULLIEN', 'Helene', 'Julien', 'Mylene']);
        await cocher('Antoine');
        expect([champ(), url()]).toEqual(['Antoine', ['Antoine']]);
        expect(container.querySelector('[data-courbe="negociateurs"]')).toBeNull(); // un seul : l'écran d'avant (N−1)
        expect(texte('[data-tuile-n1="ca"]')).not.toContain('choisir un seul');
        await cocher('Cédric JULLIEN');
        expect([champ(), url()]).toEqual(['Antoine, Cédric JULLIEN', ['Antoine', 'Cédric JULLIEN']]);
        await cocher('Arnaud JOREL'); await cocher('Helene'); await cocher('Julien');
        expect(champ()).toBe('5 négociateurs');
        expect([option('Mylene').getAttribute('aria-disabled'), texte('[data-negociateurs-max]')]).toEqual(['true', '5 au maximum : décochez-en un pour en choisir un autre.']);
        await cocher('Mylene');
        expect(url()).toEqual(['Antoine', 'Cédric JULLIEN', 'Arnaud JOREL', 'Helene', 'Julien']);
        await cocher('Julien');
        expect([champ(), option('Mylene').getAttribute('aria-disabled')]).toEqual(['4 négociateurs', null]);
        await cocher('Tous');
        expect([champ(), url()]).toEqual(['Tous', []]);
      } finally { fin(); }
    });

    it('de 2 à 5 : une série par négociateur (couleur dans l’ordre de sélection, légende) ; tuiles cumulées sans N−1 ; une série = ce négociateur seul ; l’ensemble = la page (HT et TTC)', async () => {
      const seul = async (nom: string, u: 'ht' | 'ttc') => {
        window.localStorage.setItem('trx-affichage-montants', u);
        const f = await ouvrirN(`/?vue=mois&annee=2025&mois=2&negociateur=${encodeURIComponent(nom)}`);
        try { return caTuile(); } finally { f(); }
      };
      for (const u of ['ht', 'ttc'] as const) {
        const [antoine, cedric] = [await seul('Antoine', u), await seul('Cédric JULLIEN', u)];
        window.localStorage.setItem('trx-affichage-montants', u);
        const fin = await ouvrirN('/?vue=mois&annee=2025&mois=2&negociateur=Antoine&negociateur=C%C3%A9dric%20JULLIEN&negociateur=Arnaud%20JOREL');
        try {
          expect(container.querySelector('[data-bloc="histogramme-mois"] [data-courbe="negociateurs"]')!.getAttribute('data-series')).toBe('3');
          expect([...container.querySelectorAll('[data-legende-serie]')].map((x) => [x.getAttribute('data-legende-serie'), x.textContent])).toEqual([['1', 'Antoine'], ['2', 'Cédric JULLIEN'], ['3', 'Arnaud JOREL']]);
          // 🔴 LOT DC — la comparaison N−1 de la sélection (la mention « choisir un seul négociateur » est retirée)
          for (const t of ['ca', 'nombre', 'cumul']) expect([t, texte(`[data-tuile-n1="${t}"]`).includes('choisir un seul'), texte(`[data-tuile-n1="${t}"]`).includes(' en 2024')]).toEqual([t, false, true]);
          // une série = ce négociateur seul (février : Antoine 6 000 + la partagée 10 000 ; Cédric : la partagée)
          expect([u, Math.round(serieMois(1, 2) * 100), Math.round(serieMois(2, 2) * 100)]).toEqual([u, antoine, cedric]);
          // la page cumule la sélection, chaque affaire une fois : la partagée n'y compte qu'une fois
          const partagee = Math.round((u === 'ht' ? 10000 / 1.2 : 10000) * 100);
          expect(caTuile()).toBe(antoine + cedric - partagee);
          await act(async () => { container.querySelector('[data-barre-mois="2"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer();
          expect(centimes(texte('[data-detail-ensemble] .tdb-bulle-montant').split('·')[0])).toBe(caTuile());
          // 🔴 LOT CG12 — l'encadré : seulement les lignes non nulles (février : le 3e négociateur à 0)
          expect([...container.querySelectorAll('[data-detail-serie]')].map((x) => x.getAttribute('data-detail-serie'))).toEqual(['1', '2']);
          // janvier (aucune affaire partagée) : la somme des séries = les totaux de la page
          await cliquer('[data-onglet-mois="1"]');
          expect([1, 2, 3].reduce((t, c) => t + Math.round(serieMois(c, 1) * 100), 0)).toBe(caTuile());
        } finally { fin(); }
      }
    });

    it('Cumul : une courbe par négociateur, mêmes couleurs ; « Nombre » ; Période ; le téléphone (légende sur plusieurs lignes)', async () => {
      const fin = await ouvrirN('/?vue=mois&annee=2025&mois=3&negociateur=Antoine&negociateur=Arnaud%20JOREL');
      try {
        await cliquer('[data-cumul-bouton]');
        expect(container.querySelector('[data-courbe="negociateurs-cumul"]')).not.toBeNull();
        expect([...container.querySelectorAll('[data-trait-serie]')].map((x) => x.getAttribute('data-trait-serie'))).toEqual(['1', '2']);
        expect([...container.querySelectorAll('[data-legende-serie]')].map((x) => x.textContent)).toEqual(['Antoine', 'Arnaud JOREL']);
        // le cumul d'Arnaud à fin mars : 11 000 (janv.) + 4 000,01 (mars), en HT
        expect(Number(container.querySelector('[data-barre-mois="3"] [data-point-serie="2"]')!.getAttribute('data-valeur'))).toBeCloseTo((11000 + 4000.01) / 1.2, 6);
        await cliquer('[data-cumul-bouton]');
        await cliquer('[data-mesure-bouton="nombre"]');
        expect(serieMois(2, 1)).toBe(1);
        await cliquer('[data-decouper="annee"]');
        expect(container.querySelector('[data-courbe="negociateurs"]')).not.toBeNull();
        const { CSS_TRANSACTION } = await import('./commun');
        expect(CSS_TRANSACTION).toContain('.trx-legende-series{display:flex;flex-wrap:wrap;gap:6px 16px}');
      } finally { fin(); }
    });

    it('anciens liens à une valeur (nom ou libellé) ; l’axe vide : des graduations distinctes', async () => {
      let fin = await ouvrirN('/?vue=mois&annee=2025&mois=1&negociateur=ARNAUD');
      try { expect([champ(), texte('[data-tuile="ventes-mois"] .tdb-tuile-valeur')]).toEqual(['Arnaud JOREL', '1']); } finally { fin(); }
      // juin 2025 : aucune vente pour Helene et Julien — l'axe ne répète pas « 1 € »
      fin = await ouvrirN('/?vue=mois&annee=2025&mois=6&negociateur=Mylene&negociateur=Julien');
      try {
        const g = () => [...container.querySelectorAll('[data-bloc="histogramme-mois"] svg text.tdb-axe')].filter((x) => x.getAttribute('text-anchor') === 'end').map((x) => x.textContent);
        expect(new Set(g()).size).toBe(5);
      } finally { fin(); }
      const { Histogramme } = await import('../location/TableauBordSuivi');
      const zero = Array.from({ length: 3 }, (_, i) => ({ cle: i + 1, libelle: `m${i + 1}`, valeur: 0, info: { titre: 'x', courant: { libelle: '2026', ca: 0, nb: 0 }, precedent: null } }));
      // 🔴 LOT CG12 (Arno) — plus aucune série n'a de valeur : le message, à la place du graphique (montant et nombre)
      await act(async () => { root.render(createElement(Histogramme, { barres: zero, courante: 1, onChoisir: () => undefined, attribut: 'data-barre-mois', aria: 'CA' })); });
      expect([container.querySelector('svg'), texte('[data-aucune-donnee]')]).toEqual([null, 'Aucune donnée pour ces filtres']);
      await act(async () => { root.render(createElement(Histogramme, { barres: zero, courante: 1, onChoisir: () => undefined, attribut: 'data-barre-mois', aria: 'Nombre', entier: true })); });
      expect([container.querySelector('svg'), texte('[data-aucune-donnee]')]).toEqual([null, 'Aucune donnée pour ces filtres']);
    });
  });

  describe('🔴 LOT CV — l’encadré du graphique (au repos, au survol) ; les titres citent l’année du filtre', () => {
    // aujourd'hui : 27/10/2025
    const lv = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = () => [
      vente(120, { societe: 'criterimmo', libelle: 'MARS 25', honorairesTtc: 12000, annee: 2025, mois: 3, lignes: [lv('CEDRIC', 12000)] }),
      vente(121, { societe: 'criterimmo', libelle: 'JUIL 25', honorairesTtc: 6000, annee: 2025, mois: 7, lignes: [lv('ARNAUD', 6000)] }),
      vente(122, { societe: 'criterimmo', libelle: 'MARS 24', honorairesTtc: 4800, annee: 2024, mois: 3, lignes: [lv('CEDRIC', 4800)] }),
      vente(123, { societe: 'criterimmo', libelle: 'DEC 24', honorairesTtc: 2400, annee: 2024, mois: 12, lignes: [lv('ARNAUD', 2400)] }),
      vente(124, { societe: 'criterimmo', libelle: 'MARS 23', honorairesTtc: 1200, annee: 2023, mois: 3, lignes: [lv('CEDRIC', 1200)] }),
    ];
    const ouvrirV = (q: string) => ouvrirSur(jeu(), 'criterimmo', q);
    const titre = () => texte('[data-bloc="histogramme-mois"] [data-histo-detail] .tdb-bulle-titre');
    const courant = () => texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]');
    const survoler = async (sel: string) => { await act(async () => { container.querySelector(`[data-bloc="histogramme-mois"] ${sel}`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); };

    it('au repos : année en cours (Mensuel « Octobre 2025 — en cours », Cumul « jusqu’à aujourd’hui »), passée (décembre, « année complète »), future (« aucune vente », 0) ; HT et TTC', async () => {
      let fin = await ouvrirV('/?vue=mois&annee=2025&mois=3&vue-mois=annee'); // 🔴 LOT DE : en « Mois », le repos = le mois choisi ; le lot CV vaut en Année / Période
      try {
        expect([titre(), courant()]).toEqual(['Octobre 2025 — en cours (HT)', '2025CA HT0,00 € (0,00 € TTC)Ventes0']);
        await cliquer('[data-cumul-bouton]');
        expect([titre(), courant()]).toEqual(['Cumul 2025 jusqu’à aujourd’hui (HT)', '2025CA HT15 000,00 € (18 000,00 € TTC)Ventes2']); // 10 000 + 5 000 HT, 2 ventes
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="n1"]')).toBe('2024CA HT4 000,00 € (4 800,00 € TTC)Ventes1'); // même période : à fin octobre 2024
        await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
        expect(courant()).toBe('2025CA TTC18 000,00 € (15 000,00 € HT)Ventes2');
      } finally { fin(); }
      window.localStorage.setItem('trx-affichage-montants', 'ht');
      fin = await ouvrirV('/?vue=mois&annee=2024&mois=3&vue-mois=annee');
      try {
        expect([titre(), courant()]).toEqual(['Décembre 2024 (HT)', '2024CA HT2 000,00 € (2 400,00 € TTC)Ventes1']);
        await cliquer('[data-cumul-bouton]');
        expect([titre(), courant()]).toEqual(['Cumul 2024 — année complète (HT)', '2024CA HT6 000,00 € (7 200,00 € TTC)Ventes2']);
      } finally { fin(); }
      fin = await ouvrirV('/?vue=mois&annee=2026&mois=3&vue-mois=annee');
      try {
        expect([titre(), courant()]).toEqual(['Janvier 2026 — aucune vente (HT)', '2026CA HT0,00 € (0,00 € TTC)Ventes0']);
        await cliquer('[data-cumul-bouton]');
        expect([titre(), courant()]).toEqual(['Cumul 2026 — aucune vente (HT)', '2026CA HT0,00 € (0,00 € TTC)Ventes0']);
      } finally { fin(); }
    });

    it('au survol : « Mars 2025 », « Cumul 2025 à fin mars » ; un mois futur « Novembre 2025 — à venir », à 0 ; un clic garde le mois', async () => {
      const fin = await ouvrirV('/?vue=mois&annee=2025&mois=7');
      try {
        await survoler('[data-barre-mois="3"]');
        expect([titre(), courant()]).toEqual(['Mars 2025 (HT)', '2025CA HT10 000,00 € (12 000,00 € TTC)Ventes1']);
        await survoler('[data-barre-mois="11"]');
        expect([titre(), courant()]).toEqual(['Novembre 2025 — à venir (HT)', '2025CA HT0,00 € (0,00 € TTC)Ventes0']);
        await cliquer('[data-cumul-bouton]');
        await survoler('[data-mois-cumul="3"]');
        expect(titre()).toBe('Cumul 2025 à fin mars (HT)');
        await survoler('[data-mois-cumul="12"]');
        expect([titre(), courant()]).toEqual(['Cumul 2025 à fin décembre — à venir (HT)', '2025CA HT0,00 € (0,00 € TTC)Ventes0']);
      } finally { fin(); }
    });

    it('plusieurs négociateurs : au repos « Octobre 2025 — en cours » / « Cumul 2025 jusqu’à aujourd’hui » (une ligne chacun + l’ensemble) ; un mois futur à 0', async () => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { CEDRIC: 'Cédric JULLIEN', ARNAUD: 'Arnaud JOREL' };
      const fin = await ouvrirV('/?vue=mois&annee=2025&mois=3&vue-mois=annee&negociateur=C%C3%A9dric%20JULLIEN&negociateur=Arnaud%20JOREL');
      try {
        const t = () => texte('[data-titre-detail]');
        expect(t()).toBe('Octobre 2025 — en cours (HT)');
        await cliquer('[data-cumul-bouton]');
        expect(t()).toBe('Cumul 2025 jusqu’à aujourd’hui (HT)');
        expect([...container.querySelectorAll('[data-detail-serie] .tdb-bulle-montant')].map((x) => (x.textContent ?? '').replace(/\s/g, ' '))).toEqual(['10 000,00 € · 1', '5 000,00 € · 1']);
        expect(texte('[data-detail-ensemble] .tdb-bulle-montant')).toBe('15 000,00 € · 2');
        await cliquer('[data-cumul-bouton]');
        await survoler('[data-barre-mois="12"]');
        expect([t(), texte('[data-detail-ensemble] .tdb-bulle-montant')]).toEqual(['Décembre 2025 — à venir (HT)', '0,00 € · 0']);
      } finally { fin(); donnees.nomsNegociateurs = avant; }
    });

    it('les titres : une période d’une autre année (lien, ou gardée d’avant) est reportée sur l’année du filtre ; changer l’année la reporte (Période et Année)', async () => {
      const tous = () => [...container.querySelectorAll('h3, .tdb-tuile-mot')].map((x) => x.textContent ?? '').join(' | ');
      const annees = () => [...new Set(tous().match(/20\d\d/g) ?? [])];
      const p = Array.from({ length: 12 }, (_, i) => `2023-${String(i + 1).padStart(2, '0')}`).join(',');
      const fin = await ouvrirV(`/?vue=mois&annee=2025&mois=7&vue-mois=periode&periode=${p}`);
      try {
        expect(texte('[data-bloc="ventes-mois"] h3')).toBe('Les ventes de la période — 2025'); // 🔴 LOT LO12 — l'année entière
        expect(annees()).toEqual(['2025']);
        expect(new URLSearchParams(window.location.search).get('periode')).toBe(p.replaceAll('2023', '2025'));
        await cliquer('[data-onglet-mois="3"]'); // retirer mars
        await cliquer('[data-filtre="annee"]');
        const o = [...document.querySelectorAll('[role="option"]')].find((x) => (x.textContent ?? '').replace('✓', '') === '2024') as HTMLElement;
        await act(async () => { o.click(); }); await calmer();
        expect(texte('[data-bloc="ventes-mois"] h3')).toBe('Les ventes de la période — 11 mois de 2024');
        expect(annees()).toEqual(['2024']);
        await cliquer('[data-decouper="annee"]');
        expect(annees()).toEqual(['2024']);
      } finally { fin(); }
    });
  });

  describe('🔴 LOT CW — l’onglet « CA net » du graphique', () => {
    const lw = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    // mars 2025 : 12 000 TTC, MYLENE (indépendante) 2 400, SALARIE (statut non indépendant : sa paye n'est pas déduite du reste) 1 200 ; juillet : 6 000 (ARNAUD) ; mars 2024 : 4 800
    const jeu = () => [
      vente(140, { societe: 'criterimmo', libelle: 'MARS', honorairesTtc: 12000, annee: 2025, mois: 3, lignes: [lw('MYLENE', 'negociateur', 2400), lw('SALARIE', 'negociateur', 1200)] }),
      vente(141, { societe: 'criterimmo', libelle: 'JUILLET', honorairesTtc: 6000, annee: 2025, mois: 7, lignes: [lw('ARNAUD', 'part', 6000)] }),
      vente(142, { societe: 'criterimmo', libelle: 'MARS N-1', honorairesTtc: 4800, annee: 2024, mois: 3, lignes: [lw('ARNAUD', 'part', 4800)] }),
    ];
    const barre = (k: number) => Number(container.querySelector(`[data-bloc="histogramme-mois"] [data-barre-mois="${k}"] .tdb-barre`)!.getAttribute('data-valeur'));
    const survoler = async (sel: string) => { await act(async () => { container.querySelector(`[data-bloc="histogramme-mois"] ${sel}`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); };

    it('« CA | CA net | Nombre » ; le CA net retire toutes les commissions (salariés compris) ; N−1 ; l’encadré « CA net » ; la note ; HT et TTC ; l’adresse', async () => {
      const fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=3');
      try {
        await cliquer('[data-mesure-bouton="net"]');
        expect(new URLSearchParams(window.location.search).get('mesure')).toBe('net');
        expect(texte('[data-note-ca-net]')).toBe('CA net : honoraires moins commissions des négociateurs (salariés compris), rétrocessions d’apporteurs et reversé inter-cabinet.');
        expect([barre(3), barre(7)]).toEqual([7000, 5000]); // (12 000 − 2 400 − 1 200) ÷ 1,2 ; 6 000 ÷ 1,2
        await survoler('[data-barre-mois="3"]');
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]')).toBe('2025CA net HT7 000,00 € (8 400,00 € TTC)Ventes1');
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="n1"]')).toBe('2024CA net HT4 000,00 € (4 800,00 € TTC)Ventes1');
        await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
        expect(barre(3)).toBe(8400);
        // le CA (onglet « CA ») n'a pas bougé
        await cliquer('[data-mesure-bouton="ca"]');
        expect(barre(3)).toBe(12000);
      } finally { fin(); }
    });

    it('Cumul : la somme des mois ; au repos « Cumul 2025 à fin octobre » (le mois choisi, lot DE) ; plusieurs négociateurs : la série d’un négociateur = le CA net de SES ventes', async () => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL', MYLENE: 'Mylène' };
      let fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=10&mesure=net');
      try {
        await cliquer('[data-cumul-bouton]');
        const points = [...container.querySelectorAll('[data-bloc="histogramme-mois"] [data-point-cumul]')].map((x) => Number(x.getAttribute('data-valeur')));
        expect(points.at(-1)).toBe(12000); // 7 000 + 5 000
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] .tdb-bulle-titre')).toBe('Cumul 2025 à fin octobre (HT)');
        // le mois choisi, comme au survol : le CA cumulé, le nombre du MOIS (aucune vente en octobre — la règle de l'encart, inchangée)
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] [data-bulle-bloc="courant"]')).toBe('2025CA net HT12 000,00 € (14 400,00 € TTC)Ventes0');
      } finally { fin(); }
      fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=3&mesure=net&negociateur=Myl%C3%A8ne&negociateur=Arnaud%20JOREL');
      try {
        const v = (c: number, k: number) => Number(container.querySelector(`[data-barre-mois="${k}"] [data-barre-serie="${c}"]`)!.getAttribute('data-valeur'));
        expect([v(1, 3), v(2, 7), v(2, 3)]).toEqual([7000, 5000, 0]);
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] .trx-serie-entete')).toBe('CA net HT · Ventes');
      } finally { fin(); donnees.nomsNegociateurs = avant; }
    });
  });

  it('🔴 LOT CY — « Compromis en cours » : le même chiffre au centime (HT et TTC) dans Le mois, L’année (tuile, Résumé), l’onglet Compromis « En cours » et le CA global ; sans date et toutes années comptés ; inter-cabinet ; filtre négociateur', async () => {
    const { compromisEnCours, totalCompromisEnCours } = await import('../../../../lib/transaction/compromisEnCours');
    const lc = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = (): Vente[] => [
      vente(150, { societe: 'criterimmo', libelle: 'DATE 2025', statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-10-02', honorairesTtc: 6000.01, lignes: [lc('ARNAUD', 6000.01)] }),
      vente(151, { societe: 'criterimmo', libelle: 'IMPORT 2019 SANS DATE', statut: 'compromis', annee: 2019, mois: null, dateCompromis: null, honorairesTtc: 3000, lignes: [lc('CEDRIC', 3000)] }),
      vente(152, { societe: 'criterimmo', libelle: 'ACTE EN 2027', statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2025-09-20', honorairesTtc: 7500, lignes: [lc('ARNAUD', 7500)] }),
      { ...ic, id: 153, statut: 'compromis', annee: 2019, mois: null, dateCompromis: null }, // inter-cabinet CRITERIMMO → MACJ
      vente(154, { societe: 'criterimmo', libelle: 'VENDUE', annee: 2025, mois: 3, honorairesTtc: 9000 }),
    ];
    const t = totalCompromisEnCours(jeu(), 'criterimmo');
    expect(t.nb).toBe(4);
    const lire = (sel: string) => montant(sel);
    for (const u of ['ht', 'ttc'] as const) {
      const attendu = u === 'ht' ? t.htC : t.ttcC;
      window.localStorage.setItem('trx-affichage-montants', u);
      let fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=10&mode=compromis'); // 🔴 LOT DA : la tuile du mode « Compromis »
      try {
        expect([u, lire('[data-tuile="compromis"] [data-compromis-en-cours]'), texte('[data-tuile="compromis"] .tdb-tuile-n1'), texte('[data-tuile="compromis"] .tdb-tuile-mot')])
          .toEqual([u, attendu, '4 compromis — le prévisionnel', `Compromis en cours (${u.toUpperCase()})`]);
      } finally { fin(); }
      fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=annee&mode=compromis'); // 🔴 LOT DG : la 4ᵉ tuile suit « Compter », comme « Le mois »
      try {
        expect([lire('[data-tuile="compromis"] [data-compromis-en-cours]'), lire('[data-compromis-en-cours-resume]')]).toEqual([attendu, attendu]);
      } finally { fin(); }
      // l'onglet « Compromis », vue « En cours » : la liste de la route (la même règle), sa tuile « Chiffre d'affaires »
      const lu = globalThis.fetch;
      globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => (String(url).includes('vue=compromis') && init?.method !== 'POST'
        ? { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, aujourdhui: '2025-10-27', societe: 'criterimmo', compromis: compromisEnCours(jeu(), 'criterimmo'),
          actesDuMois: [], annules: [], lotD: true, negociateurs: [], apporteurs: [], personnes: [] } }) }
        : lu(url, init))) as unknown as typeof fetch;
      try {
        window.localStorage.setItem('trx-compromis-vue', 'encours');
        fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=compromis');
        try { expect([u, lire(`[data-tuile="ca"] [data-ca-${u}]`), texte('[data-nb-compromis]')]).toEqual([u, attendu, '4']); } finally { fin(); }
      } finally { globalThis.fetch = lu; }
    }
    // le filtre « Négociateur » : seulement ses compromis, dit en petit
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    const fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=10&negociateur=CEDRIC&mode=compromis');
    try {
      expect([lire('[data-tuile="compromis"] [data-compromis-en-cours]'), texte('[data-tuile="compromis"] [data-tuile-filtre]')]).toEqual([300000, ' — Négociateur : CEDRIC']);
    } finally { fin(); }
    // le CA global : la tuile « Prévisionnel » et la synthèse, sur les totaux de la route (la même fonction)
    const tousV = jeu();
    donneesGlobal.ventes = tousV.map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois, honorairesTtc: v.honorairesTtc, libelle: v.libelle, repartition: v.repartition ?? null }));
    (donneesGlobal as unknown as { compromisEnCours: unknown }).compromisEnCours = { tous: totalCompromisEnCours(tousV, null), criterimmo: t, macj: totalCompromisEnCours(tousV, 'macj') };
    try {
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', '/?annee=2025');
      await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); await deplierGlobal();
      // 🔴 LOT CG1 — le CA global suit « HT | TTC » (le choix retenu) : les totaux de la route, dans l'unité
      const k = window.localStorage.getItem('trx-affichage-montants') === 'ttc' ? 'ttcC' : 'htC';
      expect(lire('[data-tuile="previsionnel"] .tdb-tuile-valeur')).toBe(totalCompromisEnCours(tousV, null)[k]);
      expect([lire('[data-synthese="criterimmo"] [data-mot="Prévisionnel"]'), lire('[data-synthese="global"] [data-mot="Prévisionnel"]')]).toEqual([t[k], totalCompromisEnCours(tousV, null)[k]]);
    } finally { delete (donneesGlobal as unknown as { compromisEnCours?: unknown }).compromisEnCours; }
  });

  describe('🔴 LOT DA — la 4ᵉ tuile suit « Compter » : CA net cumulé / compromis en cours / prévisionnel', () => {
    const ld = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = (societe: 'criterimmo' | 'macj' = 'criterimmo'): Vente[] => [
      vente(160, { societe, libelle: 'MARS', honorairesTtc: 12000, annee: 2025, mois: 3, lignes: [ld('MYLENE', 'negociateur', 2400)] }),
      vente(161, { societe, libelle: 'MAI', honorairesTtc: 6000, annee: 2025, mois: 5, lignes: [ld('ARNAUD', 'part', 6000)] }),
      vente(162, { societe, libelle: 'AOUT', honorairesTtc: 9000, annee: 2025, mois: 8, lignes: [ld('ARNAUD', 'part', 9000)] }),
      vente(163, { societe, libelle: 'N-1', honorairesTtc: 4800, annee: 2024, mois: 4, lignes: [ld('ARNAUD', 'part', 4800)] }),
      vente(164, { societe, libelle: 'COMPROMIS', statut: 'compromis', honorairesTtc: 3000, annee: 2025, mois: null, dateCompromis: '2025-09-01', lignes: [ld('ARNAUD', 'part', 3000)] }),
      vente(165, { societe, libelle: 'COMPROMIS 2019', statut: 'compromis', honorairesTtc: 1200, annee: 2019, mois: null, dateCompromis: null, lignes: [ld('CEDRIC', 'part', 1200)] }),
    ];
    const t4 = (sel: string) => montant(`.tdb-tuiles ${sel}`);
    const ouvrir6 = (q = '', societe: 'criterimmo' | 'macj' = 'criterimmo') => ouvrirSur(jeu(societe), societe, `/?vue=mois&annee=2025&mois=6${q}`);

    it('« Vendu » : le CA net cumulé à fin juin (commissions, rétrocessions, reversé déduits), N−1 sur les mêmes mois ; = la somme des CA nets du graphique (HT et TTC)', async () => {
      const fin = await ouvrir6();
      try {
        // 🔴 LOT DU — « — après commissions, rétrocessions et reversé » est remplacée par la ligne d'explication (éprouvée au lot DU)
        expect(texte('[data-tuile="ca-net-cumul"] .tdb-tuile-mot')).toBe('CA net HT cumulé 2025 (à fin juin)');
        expect([t4('[data-ca-net-cumul]'), texte('[data-tuile-n1="ca-net"]')]).toEqual([1300000, '4 000 € en 2024 (+225 %)']); // (12 000 − 2 400) ÷ 1,2 + 6 000 ÷ 1,2
        await cliquer('[data-mesure-bouton="net"]');
        const barres = [1, 2, 3, 4, 5, 6].reduce((t, k) => t + Math.round(Number(container.querySelector(`[data-bloc="histogramme-mois"] [data-barre-mois="${k}"] .tdb-barre`)?.getAttribute('data-valeur') ?? 0) * 100), 0);
        expect(barres).toBe(t4('[data-ca-net-cumul]'));
        await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
        expect(t4('[data-ca-net-cumul]')).toBe(1560000);
      } finally { fin(); }
    });

    // 🔴 LOT DR (Arno) — « Vendu + compromis » : la 3ᵉ tuile s'appelle « Prévisionnel CA 2025 (vendu + compromis) » (montant et ligne du bas
    // inchangés) ; la 4ᵉ = le CA net de la tuile du mode Vendu + le CA net des compromis en cours comptés (164 en septembre, 165 sans date au mois en cours).
    it('« Compromis » : la tuile d’avant ; « Vendu + compromis » : 3ᵉ tuile « Prévisionnel CA » (montant inchangé), 4ᵉ = CA net du mode Vendu + CA net des compromis en cours, au centime (HT et TTC)', async () => {
      for (const u of ['ht', 'ttc'] as const) {
        window.localStorage.setItem('trx-affichage-montants', u);
        const fin = await ouvrir6();
        try {
          const netVendu = t4('[data-ca-net-cumul]');
          await cliquer('[data-mode-mois="compromis"]');
          expect(texte('[data-tuile="compromis"] .tdb-tuile-n1')).toBe('2 compromis — le prévisionnel');
          await cliquer('[data-mode-mois="tous"]');
          expect(texte('[data-tuile="cumul"] .tdb-tuile-mot')).toBe('Prévisionnel CA 2025 (vendu + compromis) (à fin juin)');
          const netComp = u === 'ht' ? 350000 : 420000; // (3 000 + 1 200) TTC, des parts sans commission
          expect([u, t4('[data-previsionnel-net]')]).toEqual([u, netVendu + netComp]);
          expect(texte('[data-tuile="previsionnel-net-mois"] .tdb-tuile-mot')).toBe(`Prévisionnel du CA net 2025 ((vendu + compromis) − commissions versées ; vendu à fin juin, ${u.toUpperCase()})`);
          expect(texte('[data-previsionnel-detail]')).toBe(u === 'ht' ? 'dont 13 000 € vendus · 3 500 € en compromis (2)' : 'dont 15 600 € vendus · 4 200 € en compromis (2)');
          expect(texte('[data-tuile-n1="previsionnel-net"]')).toBe(u === 'ht' ? '4 000 € en 2024 (+312,5 %)' : '4 800 € en 2024 (+312,5 %)');
        } finally { fin(); window.localStorage.removeItem('trx-mois-mode'); }
      }
    });

    it('filtre Négociateur ; Période et Année (la période de la 3ᵉ tuile) ; plusieurs négociateurs (sans N−1) ; MACJ', async () => {
      let fin = await ouvrir6('&negociateur=ARNAUD');
      try {
        expect(t4('[data-ca-net-cumul]')).toBe(500000);
        await cliquer('[data-mode-mois="tous"]');
        expect(texte('[data-previsionnel-detail]')).toBe('dont 5 000 € vendus · 2 500 € en compromis (1)');
      } finally { fin(); window.localStorage.removeItem('trx-mois-mode'); }
      // 🔴 LOT DN (Arno) — la borne unique : « Année » (2025, l'année en cours au 27/10) → jusqu'au mois en cours (octobre), plus le mois de
      // l'adresse (juin) ; « Période » (mars, juin) → le dernier mois coché (juin).
      for (const [q, attendu, mot] of [['&vue-mois=annee', 2050000, 'à fin octobre'], ['&vue-mois=periode&periode=2025-03,2025-06', 1300000, 'à fin juin']] as const) {
        fin = await ouvrir6(q);
        try { expect([q, t4('[data-ca-net-cumul]'), texte('[data-tuile="ca-net-cumul"] .tdb-tuile-mot').includes(`(${mot})`)]).toEqual([q, attendu, true]); } finally { fin(); }
      }
      fin = await ouvrir6('&negociateur=ARNAUD&negociateur=MYLENE');
      try { expect([t4('[data-ca-net-cumul]'), texte('[data-tuile-n1="ca-net"]')]).toEqual([1300000, '4 000 € en 2024 (+225 %)']); } finally { fin(); } // 🔴 LOT DC : N−1 de la sélection (ARNAUD + MYLENE)
      fin = await ouvrir6('', 'macj');
      try { expect(t4('[data-ca-net-cumul]')).toBe(1300000); } finally { fin(); }
    });
  });

  it('🔴 LOT DB — les rangées de tuiles alignées (subgrid) : Le mois (trois modes, HT et TTC), L’année, l’onglet Compromis ; chaque partie d’une tuile a sa rangée', async () => {
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
    for (const r of ['.trx-tuiles-alignees>li{display:grid;grid-row:span 5;grid-template-rows:subgrid;', '.trx-tuiles-alignees>li>.tdb-tuile{grid-row:1 / -1;display:grid;grid-template-rows:subgrid;',
      '.tdb-tuile>.tdb-tuile-mot{grid-row:1;align-self:end;', '.tdb-tuile>.tdb-tuile-valeur{grid-row:2;', '.tdb-tuile>.trx-tuile-montants{grid-row:2 / span 2}', '.tdb-tuile>.trx-tuile-autre{grid-row:3;',
      '.tdb-tuile>.tdb-tuile-n1{grid-row:4;', '.tdb-tuile>.tdb-tuile-n1~.tdb-tuile-n1{grid-row:5;']) expect([r, css.includes(r)]).toEqual([r, true]);
    // chaque enfant d'une tuile est rangé (titre, chiffre, montant entre parenthèses, ligne du bas) : aucun ne tombe hors de sa rangée
    const ranges = ['tdb-tuile-mot', 'tdb-tuile-valeur', 'trx-tuile-autre', 'trx-tuile-montants', 'tdb-tuile-n1'];
    const verifier = (ou: string) => {
      const uls = [...container.querySelectorAll('ul.tdb-tuiles')];
      expect([ou, uls.length > 0, uls.every((u) => u.classList.contains('trx-tuiles-alignees'))]).toEqual([ou, true, true]);
      for (const t of container.querySelectorAll('ul.tdb-tuiles > li > .tdb-tuile')) {
        for (const e of t.children) expect([ou, t.getAttribute('data-tuile'), e.className, ranges.some((c) => e.classList.contains(c))]).toEqual([ou, t.getAttribute('data-tuile'), e.className, true]);
      }
    };
    for (const u of ['ht', 'ttc'] as const) {
      window.localStorage.setItem('trx-affichage-montants', u);
      for (const m of ['vendu', 'compromis', 'tous']) {
        const fin = await ouvrirSur([deux], 'criterimmo', `/?vue=mois&annee=2025&mois=1&mode=${m}`);
        try { verifier(`mois ${m} ${u}`); } finally { fin(); }
      }
    }
    let fin = await ouvrirSur([deux], 'criterimmo', '/?vue=annee');
    try { verifier('annee'); } finally { fin(); }
    fin = await ouvrirSur([deux], 'criterimmo', '/?vue=compromis');
    try { verifier('onglet compromis'); } finally { fin(); window.localStorage.removeItem('trx-mois-mode'); }
  });

  describe('🔴 LOT DC — la comparaison N−1 avec 2 à 5 négociateurs : la même sélection l’année précédente', () => {
    const lx = (negociateur: string, montantTtc: number, role: LigneVente['role'] = 'part'): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    // mars 2025 et mars 2024 ; une affaire PARTAGÉE (ARNAUD + CEDRIC) chaque année ; JULIEN et HELENE sans activité en 2024
    const jeu = (): Vente[] => [
      vente(170, { societe: 'criterimmo', libelle: 'A25', honorairesTtc: 10000, annee: 2025, mois: 3, lignes: [lx('ARNAUD', 10000)] }),
      vente(171, { societe: 'criterimmo', libelle: 'PARTAGEE 25', honorairesTtc: 6000, annee: 2025, mois: 3, lignes: [lx('ARNAUD', 3000), lx('CEDRIC', 3000)] }),
      vente(172, { societe: 'criterimmo', libelle: 'C25', honorairesTtc: 4000, annee: 2025, mois: 3, lignes: [lx('CEDRIC', 4000)] }),
      vente(173, { societe: 'criterimmo', libelle: 'M25', honorairesTtc: 2400, annee: 2025, mois: 3, lignes: [lx('MYLENE', 600, 'negociateur')] }),
      vente(174, { societe: 'criterimmo', libelle: 'J25', honorairesTtc: 1200, annee: 2025, mois: 3, lignes: [lx('JULIEN', 1200)] }),
      vente(175, { societe: 'criterimmo', libelle: 'H25', honorairesTtc: 1200, annee: 2025, mois: 3, lignes: [lx('HELENE', 1200)] }),
      vente(176, { societe: 'criterimmo', libelle: 'A24', honorairesTtc: 5000, annee: 2024, mois: 3, lignes: [lx('ARNAUD', 5000)] }),
      vente(177, { societe: 'criterimmo', libelle: 'PARTAGEE 24', honorairesTtc: 3000, annee: 2024, mois: 3, lignes: [lx('ARNAUD', 1500), lx('CEDRIC', 1500)] }),
      vente(178, { societe: 'criterimmo', libelle: 'M24', honorairesTtc: 1200, annee: 2024, mois: 3, lignes: [lx('MYLENE', 300, 'negociateur')] }),
    ];
    const q = (...noms: string[]) => noms.map((n) => `&negociateur=${n}`).join('');
    const n1 = (t: string) => texte(`[data-tuile-n1="${t}"]`);

    it('1 négociateur : comme avant ; 2 : la sélection N−1, l’affaire partagée une fois en N et en N−1 ; 5 : une personne sans 2024 compte 0 ; HT et TTC', async () => {
      let fin = await ouvrirSur(jeu(), 'criterimmo', `/?vue=mois&annee=2025&mois=3${q('ARNAUD')}`);
      try { expect([texte('[data-tuile="ca-mois"] .tdb-tuile-valeur'), n1('ca'), n1('nombre')]).toEqual(['13 333,33 €', '6 666,67 € en 2024 (+100 %)', '2 en 2024']); } finally { fin(); }
      fin = await ouvrirSur(jeu(), 'criterimmo', `/?vue=mois&annee=2025&mois=3${q('ARNAUD', 'CEDRIC')}`);
      try {
        // N : 10 000 + 6 000 (partagée, une fois) + 4 000 = 20 000 TTC ; N−1 : 5 000 + 3 000 (partagée, une fois) = 8 000 TTC
        expect([texte('[data-tuile="ca-mois"] .tdb-tuile-valeur'), n1('ca'), texte('[data-tuile="ventes-mois"] .tdb-tuile-valeur'), n1('nombre')]).toEqual(['16 666,66 €', '6 666,67 € en 2024 (+150 %)', '3', '2 en 2024']); // la tuile : la somme des cartes, au centime
        expect(n1('cumul')).toBe('6 666,67 € en 2024 (+150 %)');
        await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
        expect([texte('[data-tuile="ca-mois"] .tdb-tuile-valeur'), n1('ca')]).toEqual(['20 000 €', '8 000 € en 2024 (+150 %)']);
        // l'encadré : sous l'ensemble, la même sélection en 2024 et l'écart
        await act(async () => { container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="3"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        expect([texte('[data-detail-ensemble] .tdb-bulle-montant'), texte('[data-detail-ensemble-n1]'), texte('[data-detail-ensemble-ecart]')])
          .toEqual(['20 000,00 € · 3', '20248 000,00 € · 2', 'Écart+12 000,00 € (+150 %)']);
      } finally { fin(); window.localStorage.setItem('trx-affichage-montants', 'ht'); }
      fin = await ouvrirSur(jeu(), 'criterimmo', `/?vue=mois&annee=2025&mois=3${q('ARNAUD', 'CEDRIC', 'MYLENE', 'JULIEN', 'HELENE')}`);
      try {
        // N : 20 000 + 2 400 + 1 200 + 1 200 = 24 800 TTC ; N−1 : 8 000 + 1 200 = 9 200 TTC (JULIEN et HELENE : 0)
        expect([n1('ca'), n1('nombre')]).toEqual(['7 666,67 € en 2024 (+169,6 %)', '3 en 2024']);
      } finally { fin(); }
    });

    it('Période, Année ; les trois options « Compter » (CA net, compromis, prévisionnel) ; aucune mention « choisir un seul négociateur »', async () => {
      for (const v of ['&vue-mois=periode&periode=2025-03,2025-04', '&vue-mois=annee']) {
        const fin = await ouvrirSur(jeu(), 'criterimmo', `/?vue=mois&annee=2025&mois=3${v}${q('ARNAUD', 'CEDRIC')}`);
        try { expect([v, n1('ca')]).toEqual([v, '6 666,67 € en 2024 (+150 %)']); } finally { fin(); }
      }
      const fin = await ouvrirSur(jeu(), 'criterimmo', `/?vue=mois&annee=2025&mois=3${q('ARNAUD', 'CEDRIC')}`);
      try {
        expect(n1('ca-net')).toBe('6 666,67 € en 2024 (+150 %)'); // aucune commission sur ces ventes : CA net = CA
        for (const m of ['compromis', 'tous'] as const) {
          await cliquer(`[data-mode-mois="${m}"]`);
          expect([m, texte('.tdb-tuiles').includes('choisir un seul')]).toEqual([m, false]);
        }
      } finally { fin(); window.localStorage.removeItem('trx-mois-mode'); }
    });
  });

  describe('🔴 LOT DG — « L’année » : les mécaniques de « Le mois » à l’échelle de l’année', () => {
    // aujourd'hui : 27/10/2025
    const lg = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = (): Vente[] => [
      vente(200, { societe: 'criterimmo', libelle: 'A JANV 25', honorairesTtc: 6000, annee: 2025, mois: 1, lignes: [lg('ARNAUD', 6000)] }),
      vente(201, { societe: 'criterimmo', libelle: 'B MARS 25', honorairesTtc: 3000.01, annee: 2025, mois: 3, lignes: [lg('CEDRIC', 3000.01)] }),
      vente(202, { societe: 'criterimmo', libelle: 'C COMPROMIS', honorairesTtc: 4800, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-07-10', lignes: [lg('ARNAUD', 4800)] }),
      vente(203, { societe: 'criterimmo', libelle: 'D A CONFIRMER', honorairesTtc: 2400, annee: 2025, mois: null, lignes: [lg('CEDRIC', 2400)] }),
      vente(204, { societe: 'criterimmo', libelle: 'E SEPT 25', honorairesTtc: 1200, annee: 2025, mois: 9, dateCompromis: '2025-05-02', lignes: [lg('ARNAUD', 1200)] }),
      vente(205, { societe: 'criterimmo', libelle: 'F MARS 24', honorairesTtc: 3600, annee: 2024, mois: 3, lignes: [lg('ARNAUD', 3600)] }),
      vente(206, { societe: 'criterimmo', libelle: 'G NOV 24', honorairesTtc: 1200, annee: 2024, mois: 11, lignes: [lg('CEDRIC', 1200)] }),
      vente(207, { societe: 'criterimmo', libelle: 'H FEV 23', honorairesTtc: 2400, annee: 2023, mois: 2, lignes: [lg('JULIEN', 2400)] }),
    ];
    const ouvrirG = async (q: string) => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN', JULIEN: 'Julien' };
      const fin = await ouvrirSur(jeu(), 'criterimmo', q);
      return () => { fin(); donnees.nomsNegociateurs = avant; };
    };
    const adresse = () => new URLSearchParams(window.location.search);
    const presses = () => [...container.querySelectorAll('[data-onglet-annee]')].filter((b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true').map((b) => b.getAttribute('data-onglet-annee'));
    const caTuile = (t = 'ca-annee') => montant(`[data-tuile="${t}"] .tdb-tuile-valeur`);

    it('la ligne des années (de la plus ancienne à la plus récente) ; Année | Période | Tout ; l’adresse ; les anciens liens Début / Fin ; plus de filtre Début / Fin', async () => {
      let fin = await ouvrirG('/?vue=annee');
      try {
        expect([...container.querySelectorAll('[data-onglet-annee]')].map((b) => b.textContent)).toEqual(['2023', '2024', '2025']);
        expect([presses(), adresse().get('annee'), container.querySelector('[data-filtre="debut"]'), container.querySelector('[data-filtre="fin"]')]).toEqual([['2025'], '2025', null, null]);
        expect(container.querySelector('.trx-rangee-annees')!.classList.contains('trx-rangee-mois')).toBe(true); // la ligne des mois : mêmes règles au téléphone
        await cliquer('[data-onglet-annee="2024"]');
        expect([presses(), texte('[data-tuile="ca-annee"] .tdb-tuile-mot')]).toEqual([['2024'], 'CA HT — 2024']);
        await cliquer('[data-decouper-annees="periode"]');
        await cliquer('[data-onglet-annee="2025"]');
        expect([presses(), adresse().get('vue-annee'), adresse().get('annees'), texte('[data-tuile="ca-annee"] .tdb-tuile-mot')]).toEqual([['2024', '2025'], 'periode', '2024,2025', 'CA HT — 2024 → 2025']);
        await cliquer('[data-onglet-annee="2024"]');
        await cliquer('[data-onglet-annee="2025"]'); // la dernière ne se retire pas
        expect([presses(), texte('[data-periode-refus]')]).toEqual([['2025'], 'Au moins une année reste choisie.']);
        await cliquer('[data-decouper-annees="tout"]');
        expect([presses(), adresse().get('vue-annee'), texte('[data-tuile="ca-annee"] .tdb-tuile-mot')]).toEqual([['2023', '2024', '2025'], 'tout', 'CA HT — toutes les années']); // 🔴 LOT DH
        await cliquer('[data-decouper-annees="annee"]');
        expect([presses(), adresse().get('vue-annee')]).toEqual([['2025'], null]);
      } finally { fin(); }
      // les anciens liens « Début / Fin »
      fin = await ouvrirG('/?vue=annee&debut=2024&fin=2025');
      try { expect([presses(), texte('[data-tuile="ca-annee"] .tdb-tuile-mot')]).toEqual([['2024', '2025'], 'CA HT — 2024 → 2025']); } finally { fin(); }
      fin = await ouvrirG('/?vue=annee&debut=2023&fin=2023');
      try { expect([presses(), adresse().get('debut'), adresse().get('annee')]).toEqual([['2023'], null, '2023']); } finally { fin(); }
    });

    it('contrôle 6 : le CA de l’année = la somme de ses 12 mois de « Le mois » + ses « mois à confirmer », au centime, HT et TTC, les trois modes ; l’écart est dit dans le Résultat', async () => {
      for (const u of ['ht', 'ttc'] as const) for (const mode of ['vendu', 'compromis', 'tous'] as const) {
        window.localStorage.setItem('trx-affichage-montants', u);
        let fin = await ouvrirG(`/?vue=annee&annee=2025&mode=${mode}`);
        let annee = 0; let aConfirmer = 0;
        try {
          annee = caTuile();
          aConfirmer = mode === 'compromis' ? 0 : centimes(texte('[data-mois-a-confirmer-resultat]').split('(')[0]);
        } finally { fin(); }
        let mois = 0;
        for (let k = 1; k <= 12; k++) {
          fin = await ouvrirG(`/?vue=mois&annee=2025&mois=${k}&mode=${mode}`);
          try { mois += montant('[data-tuile="ca-mois"] .tdb-tuile-valeur'); } finally { fin(); }
        }
        // l'écart = EXACTEMENT les ventes « mois à confirmer » (D : 2 400 TTC, 2 000 HT ; aucune en mode « Compromis »)
        expect([u, mode, annee - mois, aConfirmer]).toEqual([u, mode, mode === 'compromis' ? 0 : (u === 'ht' ? 200000 : 240000), mode === 'compromis' ? 0 : (u === 'ht' ? 200000 : 240000)]);
      }
      window.localStorage.setItem('trx-affichage-montants', 'ht');
      window.localStorage.removeItem('trx-mois-mode');
    }, 30_000); // 🔴 LOT DM : test lourd (des dizaines d'écrans) — délai long, docs/FLAKES_CONNUS.md

    it('Période = la somme des années ; Tout = le total historique ; Ventes ; « à date » (année en cours / passée) ; N−1 ; la 4ᵉ tuile suit « Compter »', async () => {
      const deUnAn = async (a: number) => { const f = await ouvrirG(`/?vue=annee&annee=${a}`); try { return caTuile(); } finally { f(); } };
      const [a23, a24, a25] = [await deUnAn(2023), await deUnAn(2024), await deUnAn(2025)];
      expect([a23, a24, a25]).toEqual([200000, 400000, Math.round((6000 + 3000.01 + 2400 + 1200) / 1.2 * 100)]);
      let fin = await ouvrirG('/?vue=annee&vue-annee=periode&annees=2024,2025');
      try { expect(caTuile()).toBe(a24 + a25); } finally { fin(); }
      fin = await ouvrirG('/?vue=annee&vue-annee=tout');
      try {
        expect([caTuile(), texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur')]).toEqual([a23 + a24 + a25, '7']);
        expect(texte('[data-tuile-n1="ca"]')).toBe('Toutes les années (2023 → 2025)'); // 🔴 LOT DH : pas d'année précédente en « Tout »
      } finally { fin(); }
      fin = await ouvrirG('/?vue=annee&annee=2025');
      try {
        expect([texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur'), texte('[data-tuile-n1="nombre"]')]).toEqual(['4', '2 en 2024']);
        // à date (fin octobre) : janvier → octobre, sans « mois à confirmer » ; 2024 aux mêmes mois : mars seulement (novembre exclu)
        expect(texte('[data-tuile="ca-a-date"] .tdb-tuile-mot')).toBe('CA HT — 2025 à date (à fin octobre)');
        expect(caTuile('ca-a-date')).toBe(Math.round((6000 + 3000.01 + 1200) / 1.2 * 100));
        expect(texte('[data-tuile-n1="a-date"]')).toContain('3 000 € en 2024 à la même date');
        expect(texte('[data-tuile-n1="ca"]')).toContain('en 2024 (');
        expect(container.querySelector('[data-tuile="ca-net-annee"]')).not.toBeNull();
        await cliquer('[data-mode-mois="compromis"]');
        expect([container.querySelector('[data-tuile="compromis"]') !== null, texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur')]).toEqual([true, '2']);
        await cliquer('[data-mode-mois="tous"]');
        // 🔴 LOT DR — le prévisionnel du CA net : vendu (6 000 + 3 000,01 + 2 400 + 1 200) + compromis en cours (4 800), en HT (des parts : net = CA)
        expect([texte('[data-regle-mode]') !== '', caTuile('previsionnel-net-annee')]).toEqual([true, Math.round((6000 + 3000.01 + 2400 + 1200) / 1.2 * 100) + 400000]);
      } finally { fin(); window.localStorage.removeItem('trx-mois-mode'); }
      fin = await ouvrirG('/?vue=annee&annee=2024');
      try { expect([texte('[data-tuile="ca-a-date"] .tdb-tuile-mot'), caTuile('ca-a-date')]).toEqual(['CA HT — 2024 à date (année complète)', a24]); } finally { fin(); }
    }, 30_000); // 🔴 LOT DM : test lourd (des dizaines d'écrans) — délai long, docs/FLAKES_CONNUS.md

    it('le graphique « Année par année » (Annuel, Cumul, CA | CA net | Nombre ; l’année choisie en rouge, les autres pleines ; Période atténuée) et « Mois par mois » (celui de « Le mois ») ; 3 négociateurs', async () => {
      let fin = await ouvrirG('/?vue=annee&annee=2024');
      try {
        const G = '[data-bloc="graphe-annees"]';
        expect([...container.querySelectorAll(`${G} [data-barre-annee]`)].map((g) => g.getAttribute('data-barre-annee'))).toEqual(['2023', '2024', '2025']);
        expect([container.querySelectorAll(`${G} .tdb-barre--courante`).length, container.querySelector(`${G} [data-barre-annee="2024"] .tdb-barre--courante`) !== null, container.querySelectorAll(`${G} .tdb-barre-annee--pale`).length]).toEqual([1, true, 0]);
        expect(Number(container.querySelector(`${G} [data-barre-annee="2024"] .tdb-barre`)!.getAttribute('data-valeur'))).toBeCloseTo(4000, 6);
        // l'encadré au repos : l'année choisie ; au survol, une autre
        expect(texte(`${G} [data-histo-detail] .tdb-bulle-titre`)).toBe('2024 (HT)');
        await act(async () => { container.querySelector(`${G} [data-barre-annee="2025"]`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        expect(texte(`${G} [data-histo-detail] .tdb-bulle-titre`)).toBe('2025 — en cours (HT)');
        // un clic sur une barre choisit l'année
        await act(async () => { container.querySelector(`${G} [data-barre-annee="2023"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer();
        expect(presses()).toEqual(['2023']);
        await cliquer('[data-mesure-bouton="nombre"]');
        expect(Number(container.querySelector(`${G} [data-barre-annee="2025"] .tdb-barre`)!.getAttribute('data-valeur'))).toBe(4);
        await cliquer('[data-cumul-bouton]');
        expect([...container.querySelectorAll(`${G} [data-point-cumul]`)].map((p) => p.getAttribute('data-valeur'))).toEqual(['1', '3', '7']);
        // « Mois par mois » de l'année montrée : le graphique de « Le mois »
        await cliquer('[data-echelle="mois"]');
        expect([container.querySelector('[data-bloc="graphe-annees"]'), adresse().get('graphe'), texte('[data-bloc="histogramme-mois"] h3')]).toEqual([null, 'mois', 'Mois par mois — 2023 (nombre de ventes ; un mois s’ouvre d’un clic)']); // la mesure suit (l'adresse) ; il s'ouvre en Mensuel
      } finally { fin(); }
      fin = await ouvrirG('/?vue=annee&vue-annee=periode&annees=2023,2025');
      try { expect(texte('[data-bloc="graphe-annees"] style')).toContain('[data-periode-annees] g[data-barre-annee]{opacity:.35}'); } finally { fin(); }
      // trois négociateurs : une série chacun, les autres années pâles, l'encadré trié
      fin = await ouvrirG('/?vue=annee&annee=2025&negociateur=Arnaud%20JOREL&negociateur=C%C3%A9dric%20JULLIEN&negociateur=Julien');
      try {
        const G = '[data-bloc="graphe-annees"]';
        expect(container.querySelector(`${G} [data-courbe="negociateurs"]`)!.getAttribute('data-series')).toBe('3');
        expect([...container.querySelectorAll(`${G} g[data-barre-annee]`)].filter((g) => !g.classList.contains('tdb-barre-annee--pale')).map((g) => g.getAttribute('data-barre-annee'))).toEqual(['2025']);
        expect(texte(`${G} [data-titre-detail]`)).toBe('2025 (HT)');
        // 2025 : Arnaud 6 000 + 1 200, Cédric 3 000,01 + 2 400, Julien 0 (🔴 LOT CG12 : à 0, hors de l'encadré)
        expect([...container.querySelectorAll(`${G} [data-detail-serie]`)].map((x) => x.getAttribute('data-detail-serie'))).toEqual(['1', '2']);
        expect(texte(`${G} [data-detail-ensemble-n1]`)).toContain('2024');
        expect(texte('[data-tuile-n1="ca"]')).toContain('en 2024');
      } finally { fin(); }
    });

    it('les blocs de « Le mois » sur l’année : cartes des ventes et des compromis, Résultat (dont mois à confirmer), Espace par négociateur, Toute l’histoire en dessous, apporteurs (tableau puis liste), mois à confirmer', async () => {
      const fin = await ouvrirG('/?vue=annee&annee=2025&mode=tous');
      try {
        const blocs = [...container.querySelectorAll('[data-bloc]')].map((b) => b.getAttribute('data-bloc')).filter((b) => ['ventes-annee', 'compromis-annee', 'resume-periode', 'negociateurs-periode', 'toute-histoire', 'apporteurs-periode', 'compromis', 'mois-a-confirmer'].includes(b!));
        expect(blocs).toEqual(['ventes-annee', 'compromis-annee', 'resume-periode', 'negociateurs-periode', 'toute-histoire', 'apporteurs-periode', 'compromis', 'mois-a-confirmer']);
        expect([...container.querySelectorAll('[data-bloc="ventes-annee"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['204', '201', '200', '203']); // 🔴 LOT DJ : la plus récente d'abord, « mois à confirmer » en fin
        expect([...container.querySelectorAll('[data-bloc="compromis-annee"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['202']);
        expect(texte('[data-bloc="resume-periode"] h3')).toBe('Résultat de l’agence — 2025 (vendu + compromis)');
        expect(texte('[data-mois-a-confirmer-resultat]')).toBe('2 000 € (1)');
        expect(texte('[data-bloc="apporteurs-periode"] h3')).toContain('Apporteurs de l’année — 2025');
        expect(container.querySelector('[data-bloc="apporteurs-periode"] [data-saisir-retro]')).not.toBeNull(); // la liste de « Le mois » (et sa saisie)
        expect(texte('[data-bloc="toute-histoire"] h3')).toBe('Toute l’histoire — 2023 → 2025');
        // Ventes à attribuer : toujours en dernier
        const tous = [...container.querySelectorAll('[data-bloc]')].map((b) => b.getAttribute('data-bloc'));
        expect(tous.indexOf('a-attribuer') === -1 || tous.at(-1) === 'a-attribuer').toBe(true);
      } finally { fin(); window.localStorage.removeItem('trx-mois-mode'); }
    });

    describe('🔴 LOT DH — « Tout » : toutes les années, sans année précédente ; une année sans donnée comptée n’est pas montrée', () => {
      const avecButoir = (): Vente[] => [...jeu(), vente(208, { societe: 'criterimmo', libelle: 'BUTOIR 2026', honorairesTtc: 9000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2025-08-01', lignes: [lg('ARNAUD', 9000)] })];
      const ouvrirH = async (q: string) => {
        const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN', JULIEN: 'Julien' };
        const fin = await ouvrirSur(avecButoir(), 'criterimmo', q);
        return () => { fin(); donnees.nomsNegociateurs = avant; };
      };
      const lignesN1 = () => [...container.querySelectorAll('[data-tuile-n1]')].map((x) => x.textContent);

      it('Tout en Vendu, Compromis, Vendu + compromis (HT et TTC) : « toutes les années », la ligne grise à la place de N−1, l’encadré sans N−1 ni écart', async () => {
        for (const u of ['ht', 'ttc'] as const) for (const mode of ['vendu', 'compromis', 'tous'] as const) {
          window.localStorage.setItem('trx-affichage-montants', u);
          const fin = await ouvrirH(`/?vue=annee&vue-annee=tout&mode=${mode}`);
          try {
            const U = u.toUpperCase();
            const ca = mode === 'vendu' ? `CA ${U}` : mode === 'compromis' ? `CA ${U} des compromis` : `CA ${U} vendu + compromis`;
            expect([u, mode, texte('[data-tuile="ca-annee"] .tdb-tuile-mot'), texte('[data-tuile="ca-a-date"] .tdb-tuile-mot')])
              .toEqual([u, mode, mode === 'compromis' ? 'CA brut des compromis — toutes les années' : `${ca} — toutes les années`, // 🔴 LOT DS
                mode === 'tous' ? 'Prévisionnel CA toutes les années (vendu + compromis) (à date)' : mode === 'compromis' ? '' : `${ca} — à date (toutes les années)`]); // 🔴 LOT DR / DS
            expect(texte('[data-tuile="ventes-annee"] .tdb-tuile-mot')).toContain('— toutes les années');
            // en compromis, 2023 n'a aucun compromis daté : la ligne et l'axe commencent en 2024 ; la date butoir 2026 n'ajoute pas d'année
            const plage = mode === 'compromis' ? '2025 → 2025' : '2023 → 2025';
            expect([u, mode, new Set(lignesN1()).size, lignesN1()[0]]).toEqual([u, mode, 1, `Toutes les années (${plage})`]);
            if (mode !== 'compromis') expect(texte('[data-bloc="ventes-annee"] h3')).toBe(`Les ventes — toutes les années (${plage})`);
            if (mode !== 'vendu') expect(texte('[data-bloc="compromis-annee"] h3')).toBe(mode === 'tous' ? 'Les compromis en cours — toutes les années' : 'Les compromis — toutes les années');
            // l'encadré : ni bloc N−1, ni écart
            const G = '[data-bloc="graphe-annees"] [data-histo-detail]';
            expect([container.querySelector(`${G} [data-bulle-bloc="n1"]`), texte(`${G} [data-bulle-pied]`)]).toEqual([null, `Toutes les années (${plage})`]);
          } finally { fin(); }
        }
        window.localStorage.setItem('trx-affichage-montants', 'ht');
        window.localStorage.removeItem('trx-mois-mode');
      }, 30_000); // 🔴 LOT DM : test lourd (des dizaines d'écrans) — délai long, docs/FLAKES_CONNUS.md

      it('Tout avec 3 négociateurs : l’encadré n’a ni année précédente ni écart', async () => {
        const fin = await ouvrirH('/?vue=annee&vue-annee=tout&negociateur=Arnaud%20JOREL&negociateur=C%C3%A9dric%20JULLIEN&negociateur=Julien');
        try { expect([container.querySelector('[data-detail-ensemble-n1]'), container.querySelector('[data-detail-ensemble-ecart]'), container.querySelector('[data-detail-ensemble]') !== null]).toEqual([null, null, true]); } finally { fin(); }
      });

      it('une année présente seulement par la date butoir d’un compromis (2026) : ni dans la ligne, ni sur l’axe ; « Toute l’histoire » la garde ; Année et Période inchangées', async () => {
        let fin = await ouvrirH('/?vue=annee');
        try {
          expect([...container.querySelectorAll('[data-onglet-annee]')].map((b) => b.textContent)).toEqual(['2023', '2024', '2025']);
          expect([...container.querySelectorAll('[data-bloc="graphe-annees"] [data-barre-annee]')].map((g) => g.getAttribute('data-barre-annee'))).toEqual(['2023', '2024', '2025']);
          expect([...container.querySelectorAll('[data-annee-histoire]')].map((x) => x.getAttribute('data-annee-histoire'))).toEqual(['2023', '2024', '2025', '2026']);
          // Année : la comparaison N−1, comme avant
          expect(texte('[data-tuile-n1="ca"]')).toContain('en 2024 (');
          await cliquer('[data-mode-mois="compromis"]');
          expect([...container.querySelectorAll('[data-onglet-annee]')].map((b) => b.textContent)).toEqual(['2025']);
        } finally { fin(); window.localStorage.removeItem('trx-mois-mode'); }
        fin = await ouvrirH('/?vue=annee&vue-annee=periode&annees=2024,2025');
        try { expect([texte('[data-tuile="ca-annee"] .tdb-tuile-mot'), texte('[data-tuile-n1="ca"]')]).toEqual(['CA HT — 2024 → 2025', expect.stringContaining('un an plus tôt')]); } finally { fin(); }
      });
    });
  });

  describe('🔴 LOT DJ — les listes de cartes de « Le mois » et « L’année » : tri et recherche', () => {
    const lj = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const doss = (o: Partial<NonNullable<Vente['dossier']>>): NonNullable<Vente['dossier']> => ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree: null, sortie: null, apporteurId: null, personnes: [], ...o });
    // 2025 : 10 ventes signées (dont une « mois à confirmer »), une le 20 mars à 7 500 TTC, un vendeur au téléphone et à l'e-mail connus
    const jeu = (n = 10): Vente[] => Array.from({ length: n }, (_, i) => vente(400 + i, { societe: 'criterimmo', libelle: `AFFAIRE ${String.fromCharCode(65 + i)}`, honorairesTtc: 1000 * (i + 1),
      annee: 2025, mois: i === 9 ? null : (i % 9) + 1, lignes: [lj('ARNAUD', 1000 * (i + 1))] })).map((v) => (v.id !== 404 ? v : {
      ...v, libelle: 'DUPONT/MARTIN', honorairesTtc: 7500, mois: 3, lignes: [lj('ARNAUD', 7500)],
      dossier: doss({ dateActe: '2025-03-20', adresseBien: '12 rue de l’Église, Asnières', personnes: [
        { id: 1, role: 'vendeur', nom: 'DUPONT', prenom: 'Élodie', telephone: '06 12 34 56 78', email: 'e.dupont@exemple.fr', adresse: null }] }) }));
    const ouvrirJ = async (q: string, n = 10) => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL' };
      const fin = await ouvrirSur(jeu(n), 'criterimmo', q);
      return () => { fin(); donnees.nomsNegociateurs = avant; };
    };
    const L = '[data-bloc="ventes-annee"]';
    const cartes = (b = L) => [...container.querySelectorAll(`${b} [data-cartes-ventes] > [data-vente]`)].map((x) => x.getAttribute('data-vente'));
    const choisir = async (libelle: string, b = L) => {
      await cliquer(`${b} [data-choix-tri-liste]`);
      const o = [...document.querySelectorAll('[role="option"]')].find((x) => (x.textContent ?? '').replace('✓', '') === libelle) as HTMLElement;
      await act(async () => { o.click(); }); await calmer();
    };
    const taper = async (x: string, b = L) => {
      const el = container.querySelector(`${b} [data-recherche-liste]`) as HTMLInputElement;
      const regler = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => { regler.call(el, x); el.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer();
    };
    afterEach(() => { window.localStorage.removeItem('trx-liste-tri'); });

    it('les quatre tris (« Trier : » après le compteur) ; « mois à confirmer » en fin ; égalité alphabétique ; retenu et partagé avec « Le mois » ; les tuiles ne bougent pas', async () => {
      let fin = await ouvrirJ('/?vue=annee&annee=2025');
      try {
        const tuile = texte('[data-tuile="ca-annee"] .tdb-tuile-valeur');
        expect([texte(`${L} [data-tri-liste] .trx-tri-mot`), texte(`${L} [data-choix-tri-liste]`)]).toEqual(['Trier :', 'Date : la plus récente d’abord']);
        // défaut : la plus récente d'abord (le mois de l'acte ; DUPONT : 20 mars), la « mois à confirmer » (409) en dernier
        expect(cartes()).toEqual(['408', '407', '406', '405', '403', '404', '402', '401', '400', '409']);
        await choisir('Date : la plus ancienne d’abord');
        expect(cartes()).toEqual(['400', '401', '402', '404', '403', '405', '406', '407', '408', '409']);
        await choisir('CA : du plus gros au plus petit');
        expect(cartes()).toEqual(['409', '408', '407', '404', '406', '405', '403', '402', '401', '400']);
        await choisir('CA : du plus petit au plus gros');
        expect([cartes()[0], cartes().at(-1), texte('[data-tuile="ca-annee"] .tdb-tuile-valeur')]).toEqual(['400', '409', tuile]);
        expect(window.localStorage.getItem('trx-liste-tri')).toBe('ca-asc');
      } finally { fin(); }
      // le choix retenu : « Le mois », mars 2025 (deux ventes : 1 000… 7 500) — du plus petit au plus gros
      fin = await ouvrirJ('/?vue=mois&annee=2025&mois=3');
      try { expect([texte('[data-bloc="ventes-mois"] [data-choix-tri-liste]'), cartes('[data-bloc="ventes-mois"]')]).toEqual(['CA : du plus petit au plus gros', ['402', '404']]); } finally { fin(); }
    });

    it('la recherche (à partir de 10 cartes) : nom, adresse, téléphone autrement écrit, e-mail, montant de trois façons ; « (N sur M) » ; aucune ; effacer ; HT et TTC', async () => {
      for (const u of ['ht', 'ttc'] as const) {
        window.localStorage.setItem('trx-affichage-montants', u);
        const fin = await ouvrirJ('/?vue=annee&annee=2025');
        try {
          expect(container.querySelector(`${L} [data-recherche-liste]`)!.getAttribute('placeholder')).toBe('Rechercher…');
          for (const q of ['dupont', 'ELODIE', 'eglise', 'asnieres', '0612', '06 12 34', 'e.dupont@', '7500', '7 500', '7500,00', 'arnaud jorel']) {
            await taper(q);
            // « 7 500 » : DUPONT (7 500 TTC) et l'affaire I (9 000 TTC = 7 500 HT) — un montant se cherche en HT comme en TTC
            const attendu = q === 'arnaud jorel' ? 10 : ['7500', '7 500', '7500,00'].includes(q) ? 2 : 1;
            expect([u, q, cartes().length, texte(`${L} [data-compteur-liste]`)]).toEqual([u, q, attendu, `(${attendu} sur 10)`]);
          }
          await taper('durand');
          expect([cartes(), texte(`${L} [data-aucun-resultat]`), texte(`${L} [data-compteur-liste]`)]).toEqual([[], 'Aucune vente ne correspond.', '(0 sur 10)']);
          await cliquer(`${L} [data-effacer-recherche]`);
          expect([cartes().length, texte(`${L} [data-compteur-liste]`), container.querySelector(`${L} [data-effacer-recherche]`)]).toEqual([10, '(10)', null]);
          expect(texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur')).toBe('10');
        } finally { fin(); }
      }
      window.localStorage.setItem('trx-affichage-montants', 'ht');
    });

    it('sous 10 cartes : pas de champ ; au téléphone : sous le titre, pleine largeur ; le même composant dans « Le mois »', async () => {
      let fin = await ouvrirJ('/?vue=annee&annee=2025', 9);
      try { expect([container.querySelector(`${L} [data-recherche-liste]`), container.querySelector(`${L} [data-tri-liste]`) !== null]).toEqual([null, true]); } finally { fin(); }
      fin = await ouvrirJ('/?vue=mois&annee=2025&mois=3');
      try { expect([container.querySelector('[data-bloc="ventes-mois"] [data-tri-liste]') !== null, container.querySelector('[data-bloc="ventes-mois"] [data-recherche-liste]')]).toEqual([true, null]); } finally { fin(); }
      const { CSS_TRANSACTION } = await import('./commun');
      expect(CSS_TRANSACTION).toContain('@media (max-width:720px){ .trx-recherche-liste{flex-basis:100%;margin-left:0} .trx-recherche-champ{width:100%} }');
    });
  });

  describe('🔴 LOT DK — CRITERIMMO et MACJ : la même page (mêmes composants), seule la société change', () => {
    const lk = (negociateur: string, montantTtc: number, role: LigneVente['role'] = 'part'): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    /** Le même jeu pour chaque société : ventes, mois à confirmer, compromis, deux négociateurs, l'année précédente. */
    const jeuPour = (s: 'criterimmo' | 'macj'): Vente[] => [
      vente(500, { societe: s, libelle: 'UN', honorairesTtc: 6000, annee: 2025, mois: 1, lignes: [lk('ARNAUD', 6000), lk('ARNAUD', 1200, 'negociateur')] }),
      vente(501, { societe: s, libelle: 'DEUX', honorairesTtc: 3000.01, annee: 2025, mois: 3, lignes: [lk('ARNAUD', 1500), lk('CEDRIC', 1500.01)] }),
      vente(502, { societe: s, libelle: 'TROIS', honorairesTtc: 2400, annee: 2025, mois: null, lignes: [lk('CEDRIC', 2400)] }),
      vente(503, { societe: s, libelle: 'QUATRE', honorairesTtc: 4800, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-07-10', lignes: [lk('ARNAUD', 4800)] }),
      vente(504, { societe: s, libelle: 'CINQ', honorairesTtc: 1200, annee: 2024, mois: 3, lignes: [lk('CEDRIC', 1200)] }),
    ];
    /** La structure rendue : chaque attribut data-*, les titres, les boutons et les onglets ; le nom de la société remplacé par « S ». */
    const structure = (): string[] => {
      const s = (x: string) => x.replace(/criterimmo|macj/gi, 'S');
      const racine = container.querySelector('[data-transaction]')!;
      return [...racine.querySelectorAll('*')].flatMap((el) => [
        ...[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${el.tagName}[${a.name}=${s(a.value)}]`),
        ...(['H3', 'BUTTON', 'TH'].includes(el.tagName) ? [`${el.tagName}:${s(el.textContent ?? '')}`] : []),
      ]);
    };
    const ouvrirK = async (s: 'criterimmo' | 'macj', q: string) => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN' };
      const fin = await ouvrirSur(jeuPour(s), s, q);
      return () => { fin(); donnees.nomsNegociateurs = avant; };
    };
    const ECRANS = ['/', '/?vue=compromis', '/?vue=mois&annee=2025&mois=3', '/?vue=mois&annee=2025&mois=3&vue-mois=periode&periode=2025-01,2025-03', '/?vue=mois&annee=2025&mois=3&vue-mois=annee',
      '/?vue=mois&annee=2025&mois=7&mode=compromis', '/?vue=mois&annee=2025&mois=7&mode=tous', '/?vue=mois&annee=2025&mois=3&negociateur=Arnaud%20JOREL&negociateur=C%C3%A9dric%20JULLIEN',
      '/?vue=annee&annee=2025', '/?vue=annee&vue-annee=periode&annees=2024,2025', '/?vue=annee&vue-annee=tout', '/?vue=annee&annee=2025&mode=tous', '/?vue=annee&annee=2025&graphe=mois',
      '/?vue=annee&annee=2025&negociateur=Arnaud%20JOREL&negociateur=C%C3%A9dric%20JULLIEN'];

    it('chaque écran (Compromis, Le mois — Mois, Période, Année, les trois modes, 2 négociateurs —, L’année — Année, Période, Tout, Mois par mois) : la même structure pour les deux sociétés, HT et TTC', async () => {
      for (const u of ['ht', 'ttc'] as const) for (const q of ECRANS) {
        window.localStorage.setItem('trx-affichage-montants', u);
        let fin = await ouvrirK('criterimmo', q);
        let c: string[] = [];
        try { c = structure(); } finally { fin(); }
        fin = await ouvrirK('macj', q);
        let m: string[] = [];
        try { m = structure(); } finally { fin(); }
        expect([u, q, c.length > 20]).toEqual([u, q, true]);
        expect([u, q, m]).toEqual([u, q, c]);
      }
      window.localStorage.setItem('trx-affichage-montants', 'ht');
      window.localStorage.removeItem('trx-mois-mode');
    }, 30_000); // 🔴 LOT DM : test lourd (des dizaines d'écrans) — délai long, docs/FLAKES_CONNUS.md

    // aujourd'hui (dans ces tests) : 27/10/2025 — l'année en cours de MACJ n'a encore aucune vente (comme MACJ 2026 en recette)
    it('MACJ, année en cours sans données (fichier pas encore importé) : Le mois et L’année s’affichent proprement (« Aucune vente »), sans erreur', async () => {
      for (const q of ['/?vue=mois&annee=2025&mois=3', '/?vue=annee&annee=2025', '/?vue=annee&annee=2025&graphe=mois']) {
        const fin = await ouvrirSur([vente(600, { societe: 'macj', annee: 2024, mois: 2 })], 'macj', q);
        try {
          expect([q, container.querySelector('[role="alert"]'), container.querySelector('[data-transaction="macj"]') !== null]).toEqual([q, null, true]);
          // le champ « Négociateur » porte son style (aucune autre liste à l'écran sur une année sans vente : il était nu)
          expect([q, container.querySelector('.trx-filtre-negos > style')?.textContent?.includes('.lch-champ')]).toEqual([q, true]);
          const vide = texte('[data-bloc="ventes-mois"], [data-bloc="ventes-annee"]');
          expect([q, /Aucune vente/.test(vide)]).toEqual([q, true]);
        } finally { fin(); }
      }
    });
  });

  describe('🔴 LOT DN — la borne de fin du cumul : une seule fonction (Mois → le mois choisi, Période → le dernier mois choisi, Année → l’année complète)', () => {
    const lm = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = (): Vente[] => [
      vente(800, { societe: 'macj', libelle: 'MARS', honorairesTtc: 6000, annee: 2024, mois: 3, lignes: [lm('ARNAUD', 6000)] }),
      vente(801, { societe: 'macj', libelle: 'SEPT', honorairesTtc: 3000, annee: 2024, mois: 9, lignes: [lm('ARNAUD', 3000)] }),
      vente(802, { societe: 'macj', libelle: 'N1MARS', honorairesTtc: 1200, annee: 2023, mois: 3, lignes: [lm('ARNAUD', 1200)] }),
      vente(803, { societe: 'macj', libelle: 'N1OCT', honorairesTtc: 2400, annee: 2023, mois: 10, lignes: [lm('ARNAUD', 2400)] }),
    ];
    const ouvrirN = async (q: string) => {
      const avant = donnees.ventes;
      donnees.ventes = jeu();
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', q);
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
      return () => { donnees.ventes = avant; };
    };
    const tuile = () => [texte('[data-tuile="cumul"] .tdb-tuile-mot'), texte('[data-tuile="cumul"] .tdb-tuile-valeur'), texte('[data-tuile-n1="cumul"]')];

    it('2024 (terminée), adresse &mois=8 : Mois → à fin août ; Année → l’année complète = la tuile CA de l’année, au centime ; Période → le dernier mois coché ; N−1 sur la même borne', async () => {
      window.localStorage.setItem('trx-affichage-montants', 'ttc');
      const fin = await ouvrirN('/?vue=mois&annee=2024&mois=8');
      try {
        expect(tuile()).toEqual(['CA TTC cumulé 2024 (à fin août)', '6 000 €', '1 200 € en 2023 (+400 %)']);
        await cliquer('[data-decouper="annee"]');
        expect(tuile()).toEqual(['CA TTC cumulé 2024 (année complète)', '9 000 €', '3 600 € en 2023 (+150 %)']);
        expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('9 000 €'); // = le CA de l'année
        expect(texte('[data-tuile="ca-net-cumul"] .tdb-tuile-mot')).toContain('cumulé 2024 (année complète)');
        await cliquer('[data-decouper="mois"]');
        await cliquer('[data-onglet-mois="8"]');
        await cliquer('[data-decouper="periode"]');
        await cliquer('[data-onglet-mois="3"]');
        expect(tuile()[0]).toBe('CA TTC cumulé 2024 (à fin août)');
        await cliquer('[data-onglet-mois="10"]');
        expect(tuile()).toEqual(['CA TTC cumulé 2024 (à fin octobre)', '9 000 €', '3 600 € en 2023 (+150 %)']);
        // l'encadré du Cumul au repos : la même borne
        await cliquer('[data-cumul-bouton]');
        expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail] .tdb-bulle-titre')).toBe('Cumul 2024 à fin octobre (TTC)');
      } finally { fin(); window.localStorage.setItem('trx-affichage-montants', 'ht'); }
    });

    it('l’année en cours (2025, au 27/10) en Année : jusqu’au mois en cours — « à fin octobre » ; Prévisionnel sur la même borne', async () => {
      const fin = await ouvrirN('/?vue=mois&annee=2025&mois=2&mode=tous');
      try {
        await cliquer('[data-decouper="annee"]');
        expect(tuile()[0]).toBe('Prévisionnel CA 2025 (vendu + compromis) (à fin octobre)'); // 🔴 LOT DR
        expect(texte('[data-tuile="previsionnel-net-mois"] .tdb-tuile-mot')).toContain('vendu à fin octobre');
      } finally { fin(); }
    });
  });

  describe('🔴 LOT DM — la FUSION VENTES CRITERIMMO & MACJ : le même écran, les deux sociétés, chaque vente une fois', () => {
    const lm = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const partie = (sorte: 'entree' | 'sortie', compteId: number, negociateur: string, societe: 'criterimmo' | 'macj', pourcentage: number) =>
      ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: 'independant' as const, commissionne: false });
    // mars 2025 : une vente CRITERIMMO, une vente MACJ, et une vente PARTAGÉE (CRITERIMMO porteuse, 50 % MACJ, apporteur 1 000 TTC), comme HEIDIDON
    const jeu = (): Vente[] => [
      vente(700, { societe: 'criterimmo', libelle: 'CRIT', honorairesTtc: 6000, annee: 2025, mois: 3, lignes: [lm('ARNAUD', 6000)] }),
      vente(701, { societe: 'macj', libelle: 'MAC', honorairesTtc: 3000, annee: 2025, mois: 3, lignes: [lm('PIERRE', 3000)] }),
      vente(702, { societe: 'criterimmo', libelle: 'PARTAGEE', honorairesTtc: 4000, annee: 2025, mois: 3, lignes: [],
        dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] },
        repartition: { retroApporteurTtc: 1000, apporteurInterne: true, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] } } as Partial<Vente>),
    ];
    const ouvrirF = async (q: string) => {
      const avant = { ventes: donnees.ventes, societe: donnees.societe, retros: donnees.retrocessions };
      donnees.ventes = jeu(); (donnees as { societe: string | null }).societe = null; donnees.retrocessions = [];
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', q);
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'tous' })); }); await calmer();
      return () => { donnees.ventes = avant.ventes; donnees.societe = avant.societe; donnees.retrocessions = avant.retros; };
    };

    it('Le mois : la vente partagée comptée UNE fois (ses honoraires totaux) ; pas de ligne miroir ; étiquettes CRITERIMMO / MACJ / CRITERIMMO + MACJ ; l’inter-cabinet ni coût ni CA ; HT et TTC', async () => {
      window.localStorage.setItem('trx-affichage-montants', 'ttc');
      const fin = await ouvrirF('/?vue=mois&annee=2025&mois=3');
      try {
        expect(container.querySelector('[data-transaction="tous"]')).not.toBeNull();
        expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('13 000 €'); // 6 000 + 3 000 + 4 000 (une fois)
        const cartes = [...container.querySelectorAll('[data-bloc="ventes-mois"] [data-cartes-ventes] > [data-vente]')];
        // 🔴 LOT DP — l'étiquette de société à côté du nom est retirée (accord d'Arno) : la société est sur chaque ligne de négociateur ; la vente
        // partagée porte l'étiquette rouge « Inter-cabinet CRITERIMMO – MACJ » (la porteuse d'abord)
        expect(container.querySelector('[data-etiquette-societe]')).toBeNull();
        expect(cartes.map((c) => [c.getAttribute('data-vente'), [...c.querySelectorAll('[data-nego-societe]')].map((x) => x.textContent).join(' / '),
          c.querySelector('[data-etiquette-inter-cabinet]')?.textContent ?? null])).toEqual(
          expect.arrayContaining([['700', 'CRITERIMMO', null], ['701', 'MACJ', null], ['702', 'CRITERIMMO / MACJ', 'Inter-cabinet CRITERIMMO – MACJ']]));
        expect(cartes.length).toBe(3);
        expect(texte('[data-bloc="ventes-mois"] [data-vente="702"]')).not.toContain('reversé à');
        // le Résultat : le CA total, l'apporteur déduit, AUCUNE ligne d'inter-cabinet entre nos sociétés
        expect([texte('[data-ca-mois]'), container.querySelector('[data-inter-cabinet-mois]'), texte('[data-retro-resultat]')]).toEqual(['13 000 €', null, '1 000 €']);
        await act(async () => { (container.querySelector('[data-affichage-montants] [data-afficher="ht"]') as HTMLElement).click(); }); await calmer();
        expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('10 833,33 €');
      } finally { fin(); window.localStorage.setItem('trx-affichage-montants', 'ht'); }
    });

    it('L’année : la même règle ; l’Espace par négociateur des deux sociétés, une ligne par personne', async () => {
      const fin = await ouvrirF('/?vue=annee&annee=2025');
      try {
        expect([texte('[data-tuile="ca-annee"] .tdb-tuile-valeur'), texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur')]).toEqual(['10 833,33 €', '3']);
        expect(container.querySelector('[data-bloc="negociateurs-periode"]')).not.toBeNull();
      } finally { fin(); }
    });

    it('Compromis : « + Nouveau compromis » demande d’abord la société porteuse, puis le formulaire habituel ; l’observateur ne peut pas écrire', async () => {
      const fin = await ouvrirF('/?vue=compromis');
      try {
        await act(async () => { (container.querySelector('[data-nouveau-compromis]') as HTMLElement).click(); }); await calmer();
        expect([container.querySelector('[data-formulaire-dossier]'), [...container.querySelectorAll('[data-societe-nouveau]')].map((b) => b.textContent)]).toEqual([null, ['CRITERIMMO', 'MACJ']]);
        await act(async () => { (container.querySelector('[data-societe-nouveau="macj"]') as HTMLElement).click(); }); await calmer();
        expect(container.querySelector('[data-formulaire-dossier="nouveau"]')!.getAttribute('aria-label')).toBe('Nouveau compromis — MACJ');
      } finally { fin(); }
      const { ecritureRefuseeObservateur } = await import('../../../../lib/admin/observateur');
      expect(ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/transaction')).toBe(true);
    });
  });

  it('🔴 LOT DI — « Montants » (HT | TTC) à droite de la ligne des filtres (dernière colonne, libellé à droite) ; au téléphone, sur sa ligne, à droite ; Le mois et L’année', async () => {
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_TRANSACTION).toContain('.trx-champ-unite{display:flex;flex-direction:column;align-items:flex-end;text-align:right;gap:4px;min-width:max-content;grid-column:-2/-1;justify-self:end}');
    expect(CSS_TRANSACTION).toContain('@media (max-width:760px){ .trx-champ-mode{grid-column:1/-1} .trx-champ-unite{grid-column:1/-1} }');
    for (const q of ['/?vue=mois&annee=2025&mois=1', '/?vue=annee']) {
      const fin = await ouvrirSur([vente(300, { societe: 'criterimmo', annee: 2025, mois: 1 })], 'criterimmo', q);
      try {
        const champs = [...container.querySelectorAll('.tdb-filtres > *')];
        expect([q, champs.at(-1)!.classList.contains('trx-champ-unite'), texte('.trx-champ-unite #trx-unite-mot')]).toEqual([q, true, 'Montants']);
      } finally { fin(); }
    }
  });

  describe('🔴 LOT DF — le graphique de base (Tous ou un négociateur) : aucun mois pâle ; l’année affichée nettement devant N−1', () => {
    const lf = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = (): Vente[] => [
      vente(195, { societe: 'criterimmo', libelle: 'MARS', honorairesTtc: 3000, annee: 2025, mois: 3, lignes: [lf('ARNAUD', 3000)] }),
      vente(196, { societe: 'criterimmo', libelle: 'JUIL', honorairesTtc: 6000, annee: 2025, mois: 7, lignes: [lf('ARNAUD', 6000)] }),
      vente(197, { societe: 'criterimmo', libelle: 'MARS 24', honorairesTtc: 2400, annee: 2024, mois: 3, lignes: [lf('ARNAUD', 2400)] }),
    ];
    const pales = () => container.querySelectorAll('.tdb-barre-annee--pale, .tdb-point--pale').length;

    it('à l’ouverture de « Le mois » (Mensuel, Cumul) et de « L’année » : aucun mois pâle, le mois choisi en rouge ; Période et plusieurs négociateurs : l’atténuation reste', async () => {
      let fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=7');
      try {
        expect([pales(), container.querySelectorAll('[data-bloc="histogramme-mois"] .tdb-barre--courante').length]).toEqual([0, 1]);
        await cliquer('[data-cumul-bouton]');
        expect(pales()).toBe(0);
      } finally { fin(); }
      // 🔴 LOT DG — « L'année » : ses deux échelles
      fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=annee&annee=2025');
      try {
        expect(container.querySelector('[data-bloc="graphe-annees"] [data-barre-annee="2025"] .tdb-barre--courante')).not.toBeNull();
        expect(pales()).toBe(0);
        await cliquer('[data-echelle="mois"]');
        expect([container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois]') !== null, pales()]).toEqual([true, 0]);
      } finally { fin(); }
      fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=7&vue-mois=periode&periode=2025-03,2025-07');
      try { expect(texte('[data-bloc="histogramme-mois"] style')).toContain('[data-periode-graphe] g[data-barre-mois]{opacity:.35}'); } finally { fin(); }
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN' };
      fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=7&negociateur=Arnaud%20JOREL&negociateur=C%C3%A9dric%20JULLIEN');
      try { expect(pales()).toBe(11); } finally { fin(); donnees.nomsNegociateurs = avant; }
    });

    it('les couleurs : année pleine ardoise (rouge au mois choisi), N−1 hachurée plus claire et plus fine ; Cumul : courbe de l’année épaisse rouge, N−1 en pointillés gris clair ; la légende ; contraste AA en clair et en sombre', async () => {
      const { CSS_TABLEAU_BORD } = await import('../location/TableauBordSuivi');
      for (const r of ['.tdb-barre{fill:var(--tdb-annee)}', '.tdb-barre--courante{fill:var(--color-svv-red)}', '.tdb-barre-n1-trait{stroke:var(--tdb-n1);stroke-width:1}',
        '.tdb-barre-n1{stroke:var(--tdb-n1);stroke-width:.75}', '.tdb-trait{fill:none;stroke:var(--color-svv-red);stroke-width:3}',
        '.tdb-trait-n1{fill:none;stroke:var(--tdb-n1-courbe);stroke-width:1.75;stroke-dasharray:6 5}', '.tdb-legende--barre{background:var(--tdb-annee);',
        '.tdb-legende--barre-n1{background:repeating-linear-gradient(45deg,var(--tdb-n1) 0 1px,', '.tdb-legende--n1{background:repeating-linear-gradient(90deg,var(--tdb-n1-courbe)']) expect(CSS_TABLEAU_BORD).toContain(r);
      // les teintes : l'encre du thème mêlée à la surface (elles suivent Clair / Sombre / Système)
      const part = (nom: string) => Number(new RegExp(`--${nom}:color-mix\\(in srgb, var\\(--color-svv-ink\\) (\\d+)%, var\\(--color-svv-surface\\)\\)`).exec(CSS_TABLEAU_BORD)![1]) / 100;
      const [pA, pN1] = [part('tdb-annee'), part('tdb-n1')];
      const globals = readFileSync('app/globals.css', 'utf8');
      const jeton = (nom: string, i: number) => [...globals.matchAll(new RegExp(`--color-svv-${nom}:\\s*(#[0-9a-fA-F]{6})`, 'g'))][i][1];
      const rgb = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
      const melange = (a: number[], b: number[], p: number) => a.map((x, k) => x * p + b[k] * (1 - p));
      const lum = (c: number[]) => { const l = c.map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
      const contraste = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((u, v) => v - u); return (x + 0.05) / (y + 0.05); };
      for (const [theme, i] of [['clair', 0], ['sombre', 1]] as const) {
        const [encre, surface] = [rgb(jeton('ink', i)), rgb(jeton('surface', i))];
        const [annee, n1] = [melange(encre, surface, pA), melange(encre, surface, pN1)];
        // AA entre les deux années ; l'année plus visible que N−1 sur la surface
        expect([theme, contraste(annee, n1) >= 4.5, contraste(annee, surface) > contraste(n1, surface)]).toEqual([theme, true, true]);
      }
    });
  });

  describe('🔴 LOT DE — mode « Mois » (2 à 5 négociateurs) : le mois choisi plein, les autres pâles ; l’encadré au repos = le mois choisi', () => {
    // aujourd'hui : 27/10/2025 ; mars (Cédric), mai (Arnaud), juillet (Julien) 2025, et mai 2024 (N−1)
    const le = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'part', montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = (): Vente[] => [
      vente(190, { societe: 'criterimmo', libelle: 'C MARS', honorairesTtc: 3000, annee: 2025, mois: 3, lignes: [le('CEDRIC', 3000)] }),
      vente(191, { societe: 'criterimmo', libelle: 'A MAI', honorairesTtc: 6000, annee: 2025, mois: 5, lignes: [le('ARNAUD', 6000)] }),
      vente(192, { societe: 'criterimmo', libelle: 'J JUIL', honorairesTtc: 1200, annee: 2025, mois: 7, lignes: [le('JULIEN', 1200)] }),
      vente(193, { societe: 'criterimmo', libelle: 'A MAI 24', honorairesTtc: 2400, annee: 2024, mois: 5, lignes: [le('ARNAUD', 2400)] }),
    ];
    const TROIS = '&negociateur=Arnaud%20JOREL&negociateur=C%C3%A9dric%20JULLIEN&negociateur=Julien';
    const ouvrirE = async (q: string) => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN', JULIEN: 'Julien' };
      const fin = await ouvrirSur(jeu(), 'criterimmo', q);
      return () => { fin(); donnees.nomsNegociateurs = avant; };
    };
    const G = '[data-bloc="histogramme-mois"]';
    /** Les mois pleins (non pâles) du graphique. */
    const pleins = () => [...container.querySelectorAll(`${G} g[data-barre-mois]`)].filter((g) => !g.classList.contains('tdb-barre-annee--pale')).map((g) => g.getAttribute('data-barre-mois'));
    const pales = () => container.querySelectorAll(`${G} g[data-barre-mois].tdb-barre-annee--pale`).length;
    const titre = () => texte(`${G} [data-histo-detail] .tdb-bulle-titre`);
    // la zone d'un mois : la barre (histogramme, séries) ou la zone du point (courbe du cumul d'un seul négociateur)
    const survoler = async (k: number) => { await act(async () => { container.querySelector(`${G} [data-barre-mois="${k}"], ${G} [data-mois-cumul="${k}"]`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); };
    const sortir = async () => { await act(async () => { container.querySelector(`${G} .tdb-histo-zone`)!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); }); };

    it('🔴 LOT DF — un seul tracé (Tous, ou un négociateur) : aucun mois pâle ; le mois choisi en rouge ; changer de mois (ligne des mois, clic sur une barre)', async () => {
      for (const q of ['', '&negociateur=Arnaud%20JOREL']) {
        const fin = await ouvrirE(`/?vue=mois&annee=2025&mois=5${q}`);
        try {
          expect([q, pleins().length, pales()]).toEqual([q, 12, 0]);
          const mai = container.querySelector(`${G} g[data-barre-mois="5"]`)!;
          expect([mai.querySelector('.tdb-barre--courante') !== null, mai.querySelector('[data-barre-n1]') !== null]).toEqual([true, true]);
          await cliquer('[data-onglet-mois="7"]');
          expect([pales(), container.querySelector(`${G} g[data-barre-mois="7"] .tdb-barre--courante`) !== null]).toEqual([0, true]);
          await act(async () => { container.querySelector(`${G} [data-barre-mois="3"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer();
          expect([pales(), container.querySelector(`${G} g[data-barre-mois="3"] .tdb-barre--courante`) !== null]).toEqual([0, true]);
        } finally { fin(); }
      }
    });

    it('trois négociateurs : les barres de mai pleines (chaque couleur), les autres mois pâles ; la légende pleine ; changer de mois', async () => {
      const fin = await ouvrirE(`/?vue=mois&annee=2025&mois=5${TROIS}`);
      try {
        expect(container.querySelector(`${G} [data-courbe="negociateurs"]`)).not.toBeNull();
        expect([pleins(), pales()]).toEqual([['5'], 11]);
        expect([...container.querySelectorAll(`${G} g[data-barre-mois="5"] [data-barre-serie]`)].map((x) => x.getAttribute('data-barre-serie'))).toEqual(['1', '2', '3']);
        expect(container.querySelectorAll(`${G} [data-legende-serie] .tdb-barre-annee--pale, ${G} [data-legende-series].tdb-barre-annee--pale`).length).toBe(0);
        await cliquer('[data-onglet-mois="3"]');
        expect(pleins()).toEqual(['3']);
      } finally { fin(); }
    });

    it('Cumul : le point du mois choisi plus gros ; trois négociateurs : les autres points plus discrets, les courbes pleines ; un seul tracé : rien de pâle (lot DF)', async () => {
      let fin = await ouvrirE('/?vue=mois&annee=2025&mois=5');
      try {
        await cliquer('[data-cumul-bouton]');
        // 🔴 LOT DF — un seul tracé : aucun point pâle ; le point du mois choisi plus gros
        const points = [...container.querySelectorAll(`${G} [data-point-cumul]`)];
        expect(points.filter((p) => p.getAttribute('r') === '5').map((p) => p.getAttribute('data-point-cumul'))).toEqual(['5']);
        expect([points.length, container.querySelectorAll(`${G} .tdb-point--pale, ${G} .tdb-barre-annee--pale`).length]).toEqual([10, 0]);
      } finally { fin(); }
      fin = await ouvrirE(`/?vue=mois&annee=2025&mois=5${TROIS}`);
      try {
        await cliquer('[data-cumul-bouton]');
        expect([pleins(), pales()]).toEqual([['5'], 11]);
        expect([...container.querySelectorAll(`${G} g[data-barre-mois="5"] [data-point-serie]`)].map((p) => p.getAttribute('r'))).toEqual(['4.5', '4.5', '4.5']);
        // les traits des courbes : hors des mois, jamais pâles
        expect([...container.querySelectorAll(`${G} [data-trait-serie]`)].every((t) => t.closest('.tdb-barre-annee--pale') === null)).toBe(true);
      } finally { fin(); }
    });

    it('l’encadré au repos = le mois choisi (« Mai 2025 », « Cumul 2025 à fin mai ») ; au survol, le mois survolé ; en quittant, le mois choisi (un et trois négociateurs)', async () => {
      for (const q of ['', TROIS]) {
        const fin = await ouvrirE(`/?vue=mois&annee=2025&mois=5${q}`);
        try {
          expect([q, titre()]).toEqual([q, 'Mai 2025 (HT)']);
          await survoler(11);
          expect(titre()).toBe('Novembre 2025 — à venir (HT)');
          await sortir();
          expect(titre()).toBe('Mai 2025 (HT)');
          await cliquer('[data-cumul-bouton]');
          expect(titre()).toBe('Cumul 2025 à fin mai (HT)');
          await survoler(3);
          expect(titre()).toBe('Cumul 2025 à fin mars (HT)');
          await sortir();
          expect(titre()).toBe('Cumul 2025 à fin mai (HT)');
          await cliquer('[data-onglet-mois="7"]');
          expect(titre()).toBe('Cumul 2025 à fin juillet (HT)');
        } finally { fin(); }
      }
    });

    it('Période et Année : inchangés (aucun mois pâle par le lot DE ; l’encadré au repos du lot CV) ; la règle pâle vaut en clair et en sombre', async () => {
      let fin = await ouvrirE('/?vue=mois&annee=2025&mois=5&vue-mois=periode&periode=2025-03,2025-05');
      try {
        expect([pales(), titre()]).toEqual([0, 'Octobre 2025 — en cours (HT)']);
        expect(texte(`${G} style`)).toContain('[data-periode-graphe] g[data-barre-mois]{opacity:.35}');
      } finally { fin(); }
      fin = await ouvrirE(`/?vue=mois&annee=2025&mois=5&vue-mois=annee${TROIS}`);
      try { expect([pales(), titre()]).toEqual([0, 'Octobre 2025 — en cours (HT)']); } finally { fin(); }
      // la même atténuation qu'en Période (opacité .35), sans couleur propre : la couleur pleine du thème, claire ou sombre, pâlie
      const { CSS_TABLEAU_BORD } = await import('../location/TableauBordSuivi');
      expect(CSS_TABLEAU_BORD).toContain('.tdb-barre-annee--pale{opacity:.35}');
    });
  });

  describe('🔴 LOT DD — l’encadré de 2 à 5 négociateurs : les lignes par valeur décroissante de la mesure affichée', () => {
    // aujourd'hui : 27/10/2025 ; sélection : Arnaud (couleur 1), Cédric (2), Julien (3)
    const ld = (negociateur: string, montantTtc: number, role: LigneVente['role'] = 'part'): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const jeu = (): Vente[] => [
      vente(180, { societe: 'criterimmo', libelle: 'A JANV', honorairesTtc: 6000, annee: 2025, mois: 1, lignes: [ld('ARNAUD', 6000)] }),
      vente(181, { societe: 'criterimmo', libelle: 'C MARS 1', honorairesTtc: 3000, annee: 2025, mois: 3, lignes: [ld('CEDRIC', 3000)] }),
      vente(182, { societe: 'criterimmo', libelle: 'C MARS 2', honorairesTtc: 1200, annee: 2025, mois: 3, lignes: [ld('CEDRIC', 1200)] }),
      // CA 9 000, CA net 4 000 (sa commission de 5 000 retirée)
      vente(183, { societe: 'criterimmo', libelle: 'J JUIL', honorairesTtc: 9000, annee: 2025, mois: 7, lignes: [ld('JULIEN', 5000, 'negociateur')] }),
    ];
    const ordre = () => [...container.querySelectorAll('[data-histo-detail] [data-detail-serie]')].map((x) => x.getAttribute('data-detail-serie'));
    const legende = () => [...container.querySelectorAll('[data-legende-serie]')].map((x) => x.getAttribute('data-legende-serie'));
    const survoler = async (k: number) => { await act(async () => { container.querySelector(`[data-bloc="histogramme-mois"] [data-barre-mois="${k}"]`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); };
    const ouvrirD = async () => {
      const avant = donnees.nomsNegociateurs; donnees.nomsNegociateurs = { ARNAUD: 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN', JULIEN: 'Julien' };
      const fin = await ouvrirSur(jeu(), 'criterimmo', '/?vue=mois&annee=2025&mois=10&negociateur=Arnaud%20JOREL&negociateur=C%C3%A9dric%20JULLIEN&negociateur=Julien'); // octobre choisi (lot DE : le repos)
      return () => { fin(); donnees.nomsNegociateurs = avant; };
    };

    it('au repos (Cumul) et au survol d’un mois où l’ordre change ; les trois onglets ; égalité : ordre alphabétique ; HT et TTC', async () => {
      for (const u of ['ht', 'ttc'] as const) {
        window.localStorage.setItem('trx-affichage-montants', u);
        const fin = await ouvrirD();
        try {
          await cliquer('[data-cumul-bouton]');
          // CA cumulé à fin octobre : Julien 9 000, Arnaud 6 000, Cédric 4 200
          expect([u, ordre()]).toEqual([u, ['3', '1', '2']]);
          expect([...container.querySelectorAll('[data-detail-serie] .tdb-bulle-montant')].map((x) => (x.textContent ?? '').replace(/\s/g, ' ')))
            .toEqual(u === 'ttc' ? ['9 000,00 € · 1', '6 000,00 € · 1', '4 200,00 € · 2'] : ['7 500,00 € · 1', '5 000,00 € · 1', '3 500,00 € · 2']);
          // au survol de mars (cumul) : Arnaud 6 000, Cédric 4 200, Julien 0 — l'ordre change (🔴 LOT CG12 : Julien, à 0, sort de l'encadré)
          await survoler(3);
          expect(ordre()).toEqual(['1', '2']);
          await act(async () => { container.querySelector('[data-bloc="histogramme-mois"] .tdb-histo-zone')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
          expect(texte('[data-titre-detail]')).toBe(`Cumul 2025 à fin octobre (${u.toUpperCase()})`); // 🔴 LOT DE : en quittant, le mois choisi
          // CA net cumulé : Arnaud 6 000, Cédric 4 200, Julien 4 000
          await cliquer('[data-mesure-bouton="net"]');
          expect(ordre()).toEqual(['1', '2', '3']);
          // Nombre : Cédric 2 ; Arnaud et Julien 1 chacun — égalité : ordre alphabétique
          await cliquer('[data-mesure-bouton="nombre"]');
          expect(ordre()).toEqual(['2', '1', '3']);
          // la légende et les couleurs : l'ordre de sélection, inchangé
          expect(legende()).toEqual(['1', '2', '3']);
        } finally { fin(); }
      }
      window.localStorage.setItem('trx-affichage-montants', 'ht');
    });

    it('Mensuel : la valeur du mois (repos à 0 : alphabétique ; mars : Cédric en tête ; juillet : Julien) ; l’ensemble, l’année précédente et la note restent en dessous ; chaque ligne garde sa couleur', async () => {
      const fin = await ouvrirD();
      try {
        // 🔴 LOT CG12 — l'encadré : seulement les lignes non nulles au point montré
        expect(ordre()).toEqual([]); // octobre : tous à 0
        await survoler(3);
        expect(ordre()).toEqual(['2']); // Cédric 4 200 ; Arnaud et Julien 0
        await survoler(7);
        expect(ordre()).toEqual(['3']);
        await cliquer('[data-mesure-bouton="net"]');
        await survoler(7);
        expect(ordre()).toEqual(['3']); // Julien : 4 000 net
        // chaque ligne : la pastille de sa couleur
        expect([...container.querySelectorAll('[data-histo-detail] [data-detail-serie]')].map((x) => [x.getAttribute('data-detail-serie'), x.querySelector('.trx-pastille-serie')!.classList.contains(`trx-serie--${x.getAttribute('data-detail-serie')}`), x.textContent!.split(/\d/)[0]]))
          .toEqual([['3', true, 'Julien']]);
        // sous les lignes : l'ensemble, puis la note
        const bulle = [...container.querySelector('[data-histo-detail] .tdb-bulle')!.children];
        const rang = (sel: string) => bulle.findIndex((x) => x.matches(sel));
        expect(rang('[data-detail-ensemble]')).toBeGreaterThan(Math.max(...bulle.map((x, i) => (x.matches('[data-detail-serie]') ? i : -1))));
        expect(rang('.trx-serie-note')).toBe(bulle.length - 1);
        expect(legende()).toEqual(['1', '2', '3']);
      } finally { fin(); }
    });

    it('ordreEncadre : décroissant ; égalité au centime affiché : alphabétique ; Nombre', async () => {
      const { ordreEncadre } = await import('./GrapheNegociateurs');
      const l = [{ nom: 'Zoé', ca: 100.001, nb: 1 }, { nom: 'Élise', ca: 100, nb: 3 }, { nom: 'Bruno', ca: 250, nb: 1 }];
      expect(ordreEncadre(l, false).map((x) => x.nom)).toEqual(['Bruno', 'Élise', 'Zoé']);
      expect(ordreEncadre(l, true).map((x) => x.nom)).toEqual(['Élise', 'Bruno', 'Zoé']);
      expect(l.map((x) => x.nom)).toEqual(['Zoé', 'Élise', 'Bruno']); // l'entrée n'est pas modifiée
    });
  });

  it('🔴 LOT CR — « Mois par mois » : l’axe en abrégé (HT et TTC, Mensuel et Cumul) ; l’encart garde le montant complet', async () => {
    const grosse = vente(90, { societe: 'criterimmo', libelle: 'GROSSE', honorairesTtc: 300000, annee: 2025, mois: 1 });
    const fin = await ouvrirSur([grosse], 'criterimmo');
    try {
      const graduations = () => [...container.querySelectorAll('[data-bloc="histogramme-mois"] svg text.tdb-axe')].filter((x) => x.getAttribute('text-anchor') === 'end').map((x) => x.textContent);
      expect(graduations()).toEqual(['0 €', '62,5 k€', '125 k€', '187,5 k€', '250 k€']); // HT : 300 000 ÷ 1,2
      await act(async () => { container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="1"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); // 🔴 LOT CV : l'encadré au repos montre le mois en cours ; janvier se survole
      expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail]')).toContain('250 000,00 €');
      await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
      expect(graduations()).toEqual(['0 €', '75 k€', '150 k€', '225 k€', '300 k€']);
      expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail]')).toContain('300 000,00 €');
      await cliquer('[data-cumul-bouton]');
      expect(graduations().at(-1)).toBe('300 k€');
    } finally { fin(); }
  });

  it('🔴 LOT CM — un coût nul en GRIS (le grand et le petit), un coût non nul en rouge : Espace par négociateur, son total, Résultat de l’agence ; HT et TTC', async () => {
    const { classeSens, montantNul } = await import('./commun');
    expect([classeSens('verse', 0, 0), classeSens('verse', 0.004, 0.004), classeSens('verse', 1, 1.2), classeSens('recu', 0, 0)]).toEqual(['trx-cout-nul', 'trx-cout-nul', 'trx-rouge', 'trx-vert']);
    expect(montantNul(0, 0.01)).toBe(false);
    const mylene = vente(61, { societe: 'criterimmo', libelle: 'MILLECAMPS', honorairesTtc: 29423, lignes: [{ id: 9, negociateur: 'MYLENE', role: 'negociateur', montantTtc: 23538, nature: 'vente', compte: true,
      origine: 'import', sourceFichier: null, sourceOnglet: 'MYLENE', sourceLigne: 1, note: null }] });
    const fin = await ouvrirSur([mylene], 'criterimmo');
    try {
      await cliquer('[data-bloc="negociateurs-mois"] button');
      for (const u of ['ht', 'ttc'] as const) {
        if (u === 'ttc') await cliquer('[data-affichage-montants] [data-afficher="ttc"]');
        const cout = (sel: string) => container.querySelector(sel)!.closest('.trx-mt-liste')!.className;
        // rétrocessions 0 : gris (ligne, total, Résultat) ; commission 23 538 : rouge
        for (const sel of ['[data-retro-espace="MYLENE"]', '[data-total-retro]', '[data-retro-resultat]']) expect([u, sel, cout(sel)]).toEqual([u, sel, 'trx-mt-liste trx-cout-nul']);
        for (const sel of ['[data-com-espace="MYLENE"]', '[data-total-com]', '[data-paye-deduite]']) expect([u, sel, cout(sel)]).toEqual([u, sel, 'trx-mt-liste trx-rouge']);
        // la carte : com négo comptabilisée non nulle en rouge
        expect(container.querySelector('[data-vente="61"] [data-nego-com]')!.closest('.trx-rouge')).not.toBeNull();
      }
      const { CSS_TRANSACTION } = await import('./commun');
      expect(CSS_TRANSACTION).toContain('.trx-cout-nul,.trx-cout-nul .trx-mt-petit,.trx-cout-nul .trx-montant-autre{color:var(--color-svv-muted)}');
    } finally { fin(); }
  });
  it('🔴 LOT CN — « Apporteurs du mois » : Apporteur en premier (nommé en gras, sinon « Apporteur non nommé » gris italique), Négociateur et sa source dessous ; rattacher et Historique fonctionnent', async () => {
    const r = (id: number, venteId: number | null, apporteur: string | null) => ({ id, societe: 'criterimmo' as const, annee: 2025, mois: 1, negociateur: 'CEDRIC', montantTtc: 500,
      apporteur, venteId, libelle: 'montant saisi', origine: 'import' as const, sourceOnglet: 'CEDRIC', sourceCellule: 'J3', interne: true });
    const avant = donnees.nomsNegociateurs;
    donnees.nomsNegociateurs = { CEDRIC: 'Cédric JULLIEN' };
    const fin = await ouvrirSur([deux], 'criterimmo', '/?vue=mois&annee=2025&mois=1', [r(71, null, 'Gardien Dacquet'), r(72, null, null)]);
    try {
      const table = container.querySelector('[data-table-retrocessions]')!;
      expect([...table.querySelectorAll('thead th')].map((x) => x.textContent)).toEqual(['Apporteur', 'Négociateur', 'Montant TTC', 'Vente', 'Historique']);
      expect(texte('[data-apporteur-retro="71"]')).toBe('Gardien Dacquet');
      expect(container.querySelector('[data-apporteur-retro="71"]')!.tagName).toBe('TH');
      expect(container.querySelector('[data-apporteur-retro="72"] .trx-apporteur-non-nomme')!.textContent).toBe('Apporteur non nommé');
      expect(texte('[data-negociateur-retro="71"]')).toBe('Cédric JULLIENCEDRIC › J3 · montant saisi');
      expect(container.querySelector('[data-rattacher="71"]')).not.toBeNull();
      await cliquer('[data-retrocession="71"] [data-mot="Historique"] button');
      expect(texte('[data-retrocession="71"] [data-mot="Historique"] button')).toBe('Masquer');
      expect(container.querySelector('[data-saisir-retro]')).not.toBeNull();
    } finally { fin(); donnees.nomsNegociateurs = avant; }
  });
});

/**
 * 🔴 LOT DO (Arno) — LE CA CONSOLIDÉ : CRITERIMMO porte un mandat à 10 000 € HT d'honoraires (12 000 € TTC), un négociateur MACJ vend et partage
 * 5 000 € ; CRITERIMMO compte 10 000 €, MACJ 5 000 € reçus, les DEUX sociétés ensemble 10 000 € (jamais 15 000 €). Idem dans l'autre sens. Le
 * reversé entre nos sociétés n'est ni un coût ni une somme à verser : seules les com négo (ici 1 000 € et 2 000 € HT) sortent du groupe.
 */
describe('🔴 LOT DO — FUSION : le CA consolidé (10 000 / 5 000, dans les deux sens) et les intitulés « consolidés »', () => {
  const autre = (s: 'criterimmo' | 'macj') => (s === 'criterimmo' ? 'macj' as const : 'criterimmo' as const);
  const lc = (negociateur: string, cote: 'entree' | 'sortie', ht: number): LigneVente => ({ id: Math.random(), negociateur, role: 'negociateur', montantTtc: ht * 1.2, montantHt: ht, cote,
    nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, mode: 'manuelle' } as LigneVente);
  const partie = (sorte: 'entree' | 'sortie', compteId: number, negociateur: string, societe: 'criterimmo' | 'macj') =>
    ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const, commissionne: true });
  /** Le mandat : la porteuse rentre (com négo 1 000 € HT), l'autre société vend (com négo 2 000 € HT) ; partage 50 / 50. */
  const cas = (porteuse: 'criterimmo' | 'macj', id: number, statut: 'vendue' | 'compromis'): Vente => vente(id, { societe: porteuse, libelle: `MANDAT ${id}`, honorairesTtc: 12000, statut,
    annee: 2025, mois: statut === 'vendue' ? 9 : null, dateCompromis: statut === 'vendue' ? '2025-08-01' : '2025-09-20', origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null,
    lignes: [lc('Mandat', 'entree', 1000), lc('Vendeur', 'sortie', 2000)],
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: statut === 'vendue' ? '2025-09-15' : null, entree: { id: 1, nom: 'Mandat' }, sortie: { id: 2, nom: 'Vendeur' }, apporteurId: null, personnes: [] },
    repartition: { retroApporteurTtc: 0, apporteurInterne: true, parties: [partie('entree', 1, 'Mandat', porteuse), partie('sortie', 2, 'Vendeur', autre(porteuse))] } } as Partial<Vente>);
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const montant = (sel: string): number => centimes(texte(sel));
  /** La page d'une société (ou FUSION) telle que la route la lit : la porteuse, la ligne miroir chez l'autre, chaque vente une fois pour les deux. */
  const ouvrirCas = async (porteuse: 'criterimmo' | 'macj', page: 'criterimmo' | 'macj' | 'tous', q: string) => {
    const brutes = [cas(porteuse, 90, 'vendue'), cas(porteuse, 91, 'compromis')];
    const ventes = page === 'tous' ? brutes : brutes.map((v) => venteDansSociete(v, page)).filter((v): v is Vente => v !== null);
    const vue = page === 'tous' ? null : page;
    const avant = { ventes: donnees.ventes, societe: donnees.societe, retros: donnees.retrocessions, statuts: donnees.statutsNegociateurs, fetch: globalThis.fetch };
    donnees.ventes = ventes; (donnees as { societe: string | null }).societe = vue; donnees.retrocessions = []; donnees.statutsNegociateurs = { Mandat: 'independant', Vendeur: 'independant' };
    const compromis = { disponible: true, aujourdhui: '2025-10-27', societe: page, compromis: compromisEnCours(ventes, vue), actesDuMois: [], annules: [], lotD: true, negociateurs: [], apporteurs: [], personnes: [],
      statutsNegociateurs: donnees.statutsNegociateurs };
    const precedent = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => (String(url).includes('vue=compromis')
      ? { ok: true, status: 200, json: async () => ({ etat: 'ok', data: compromis }) } : precedent(url, init))) as unknown as typeof fetch;
    act(() => { root.unmount(); }); root = createRoot(container);
    window.history.replaceState(null, '', q);
    await act(async () => { root.render(createElement(EcranSociete, { societe: page })); }); await calmer();
    return () => { donnees.ventes = avant.ventes; donnees.societe = avant.societe; donnees.retrocessions = avant.retros; donnees.statutsNegociateurs = avant.statuts; globalThis.fetch = avant.fetch; };
  };
  const cliquer = async (sel: string) => { await act(async () => { container.querySelector<HTMLElement>(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
  const jamais15000 = () => { const t = container.textContent ?? ''; expect([t.includes('15 000'), t.includes('18 000')]).toEqual([false, false]); };
  // [CA, commissions versées, solde net] en centimes, HT puis TTC
  const ATTENDU = { porteuse: { ht: [1000000, 600000, 400000], ttc: [1200000, 720000, 480000] }, autre: { ht: [500000, 200000, 300000], ttc: [600000, 240000, 360000] },
    tous: { ht: [1000000, 300000, 700000], ttc: [1200000, 360000, 840000] } };

  for (const porteuse of ['criterimmo', 'macj'] as const) {
    for (const u of ['ht', 'ttc'] as const) {
      it(`${porteuse.toUpperCase()} porteuse, ${u.toUpperCase()} — onglet Compromis : CA, commissions versées, solde net (porteuse, autre société, FUSION consolidée) ; la synthèse`, async () => {
        window.localStorage.setItem('trx-affichage-montants', u);
        for (const [page, cle] of [[porteuse, 'porteuse'], [autre(porteuse), 'autre'], ['tous', 'tous']] as const) {
          const fin = await ouvrirCas(porteuse, page, '/?vue=compromis');
          try {
            expect([page, montant(`[data-ca-${u}]`), montant(`[data-commissions-${u}]`), montant(`[data-solde-${u}]`)]).toEqual([page, ...ATTENDU[cle][u]]);
            if (page === 'tous') {
              // la synthèse « Ce que l'on doit » : seules les com négo sortent du groupe ; l'inter-cabinet : « interne au groupe — 0 »
              expect(texte('[data-total-entete-du]')).toContain(u === 'ht' ? '3 000' : '3 600');
              await cliquer('[data-ouvrir-du]');
              expect([texte('[data-total-du]').includes(u === 'ht' ? '3 000' : '3 600'), texte('.trx-du-contenu').includes('interne au groupe — 0')]).toEqual([true, true]);
              expect([texte('[data-tuile="ca"] .tdb-tuile-mot'), texte('[data-tuile="solde"] .tdb-tuile-mot')]).toEqual(['Chiffre d’affaires consolidé', 'Solde net consolidé']);
              jamais15000();
            } else expect([texte('[data-tuile="ca"] .tdb-tuile-mot'), texte('[data-tuile="solde"] .tdb-tuile-mot')]).toEqual(['Chiffre d’affaires', 'Solde net']);
          } finally { fin(); }
        }
      });

      it(`${porteuse.toUpperCase()} porteuse, ${u.toUpperCase()} — Le mois (septembre 2025) et L’année : tuiles, graphique, encadré, Résultat, Espace — 10 000 € consolidés`, async () => {
        window.localStorage.setItem('trx-affichage-montants', u);
        const [dix, cinq, reste] = u === 'ht' ? [1000000, 500000, 700000] : [1200000, 600000, 840000];
        for (const [page, ca] of [[porteuse, dix], [autre(porteuse), cinq], ['tous', dix]] as const) {
          let fin = await ouvrirCas(porteuse, page, '/?vue=mois&annee=2025&mois=9&mode=vendu');
          try {
            expect([page, montant('[data-tuile="ca-mois"] .tdb-tuile-valeur'), montant('[data-ca-mois]')]).toEqual([page, ca, ca]);
            if (page === 'tous') {
              expect([montant('[data-tuile="cumul"] .tdb-tuile-valeur'), Math.round(Number(container.querySelector('[data-bloc="histogramme-mois"] [data-barre-mois="9"] .tdb-barre')?.getAttribute('data-valeur')) * 100)]).toEqual([dix, dix]);
              expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail]')).toContain(u === 'ht' ? '10 000,00' : '12 000,00'); // l'encadré
              expect([container.querySelector('[data-inter-cabinet-mois]'), montant('[data-tuile="ca-net-cumul"] [data-ca-net-cumul]')]).toEqual([null, reste]);
              expect(texte('[data-bloc="resultat-mois"]')).toContain('= Reste consolidé du groupe');
              expect(texte('[data-tuile="ca-mois"] .tdb-tuile-mot')).toBe(`CA consolidé ${u.toUpperCase()} — septembre`);
              expect([...container.querySelectorAll('[data-bloc="histogramme-mois"] [data-mesure-bouton]')].map((x) => x.textContent)).toEqual(['CA consolidé', 'CA net consolidé', 'Nombre de ventes']);
              await cliquer('[data-cumul-bouton]');
              expect(texte('[data-bloc="histogramme-mois"] [data-histo-detail]')).toContain(`CA consolidé ${u.toUpperCase()}`);
              // l'Espace par négociateur : Mandat 5 000 + Vendeur 5 000 = 10 000 € HT générés ; CA net = le Reste consolidé du groupe
              await cliquer('[data-deplier="negociateurs"]');
              expect([montant('[data-total-ca-genere]'), montant('[data-total-ca-net]')]).toEqual([dix, reste]);
              jamais15000();
            } else expect([texte('[data-tuile="ca-mois"] .tdb-tuile-mot'), texte('[data-bloc="resultat-mois"]').includes('= Reste à l’agence')]).toEqual([`CA ${u.toUpperCase()} — septembre`, true]);
          } finally { fin(); }
          fin = await ouvrirCas(porteuse, page, '/?vue=annee&annee=2025&mode=vendu');
          try {
            // L'année : la tuile CA, « à date », le Résultat de l'agence
            expect([page, montant('[data-tuile="ca-annee"] .tdb-tuile-valeur'), montant('[data-tuile="ca-a-date"] .tdb-tuile-valeur'), montant('[data-ca-periode]')]).toEqual([page, ca, ca, ca]);
            if (page === 'tous') {
              expect([montant('[data-tuile="ca-net-annee"] .tdb-tuile-valeur'), texte('[data-tuile="ca-annee"] .tdb-tuile-mot').startsWith(`CA consolidé ${u.toUpperCase()}`),
                texte('[data-tuile="ca-net-annee"] .tdb-tuile-mot').startsWith(`CA net consolidé ${u.toUpperCase()}`), texte('[data-bloc="resume-periode"]').includes('= Reste consolidé du groupe')]).toEqual([reste, true, true, true]);
              jamais15000();
            }
          } finally { fin(); }
        }
      }, 30_000);
    }
  }

  // ══ 🔴 LOT DP (Arno) — les étiquettes des cartes : rouge « Inter-cabinet [porteuse] – [l'autre] » sur les trois pages (miroir compris) ; la
  // société de chaque négociateur dans sa colonne, sur FUSION seulement ; l'ancienne étiquette à côté du nom retirée (accord d'Arno).
  describe('🔴 LOT DP — étiquettes inter-cabinet et société par négociateur', () => {
    for (const porteuse of ['criterimmo', 'macj'] as const) {
      const rouge = porteuse === 'criterimmo' ? 'Inter-cabinet CRITERIMMO – MACJ' : 'Inter-cabinet MACJ – CRITERIMMO';
      it(`${porteuse.toUpperCase()} porteuse : l’étiquette rouge « ${rouge} » sur les trois pages ; FUSION : CRITERIMMO / MACJ sur les lignes, une colonne commune`, async () => {
        for (const page of ['criterimmo', 'macj', 'tous'] as const) {
          const fin = await ouvrirCas(porteuse, page, '/?vue=compromis');
          try {
            const carte = container.querySelector('[data-compromis="91"]')!;
            expect([page, carte.querySelector('[data-etiquette-inter-cabinet]')?.textContent, container.querySelector('[data-etiquette-societe]')]).toEqual([page, rouge, null]);
            expect(carte.querySelector('[data-carte="titre"]')!.textContent!.indexOf(rouge)).toBeGreaterThan(0); // juste après le nom
            const lignes = [...carte.querySelectorAll('[data-nego-ligne]')];
            if (page === 'tous') {
              // la société à la vente de chaque négociateur : l'entrée chez la porteuse, la sortie chez l'autre ; une colonne (data-col 6) par ligne
              expect(lignes.map((l) => [l.getAttribute('data-nego-ligne'), l.querySelector('[data-nego-societe]')?.textContent, l.querySelectorAll('[data-col="6"]').length]))
                .toEqual([['entree', porteuse.toUpperCase(), 1], ['sortie', autre(porteuse).toUpperCase(), 1]]);
              expect(carte.querySelector('[data-carte-negos]')!.classList.contains('trx-carte-negos--societes')).toBe(true);
              // la colonne se place entre le nom et « entrée / sortie »
              const ordre = [...lignes[0].children].map((x) => x.getAttribute('data-col')).filter(Boolean);
              expect(ordre.slice(0, 3)).toEqual(['1', '6', '2']);
            } else expect([carte.querySelector('[data-nego-societe]'), carte.querySelector('[data-carte-negos]')!.classList.contains('trx-carte-negos--societes')]).toEqual([null, false]);
          } finally { fin(); }
        }
      });
    }

    it('une vente d’une seule société : pas d’étiquette rouge ; FUSION : un ou deux négociateurs, chaque ligne a sa colonne société (vide si inconnue)', async () => {
      const simple = vente(95, { societe: 'macj', libelle: 'SIMPLE', honorairesTtc: 6000, annee: 2025, mois: 9, lignes: [] });
      const sansSociete = vente(96, { societe: 'criterimmo', libelle: 'INCONNUE', honorairesTtc: 6000, annee: 2025, mois: 9, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [],
        dossier: { adresseBien: null, dateActePrevue: null, dateActe: '2025-09-02', entree: { id: 1, nom: 'Mandat' }, sortie: { id: 2, nom: 'Vendeur' }, apporteurId: null, personnes: [] },
        repartition: { retroApporteurTtc: 0, apporteurInterne: true, parties: [{ ...partie('entree', 1, 'Mandat', 'criterimmo'), societe: null }, { ...partie('sortie', 2, 'Vendeur', 'criterimmo'), societe: null }] } } as unknown as Partial<Vente>);
      const avant = { ventes: donnees.ventes, societe: donnees.societe };
      donnees.ventes = [simple, sansSociete, cas('criterimmo', 90, 'vendue')]; (donnees as { societe: string | null }).societe = null;
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=9&mode=vendu');
      try {
        await act(async () => { root.render(createElement(EcranSociete, { societe: 'tous' })); }); await calmer();
        const ligne = (id: number) => [...container.querySelectorAll(`[data-bloc="ventes-mois"] [data-vente="${id}"] [data-nego-ligne]`)].map((l) => [l.querySelectorAll('[data-col="6"]').length, l.querySelector('[data-nego-societe]')!.textContent]);
        expect(container.querySelector('[data-vente="95"] [data-etiquette-inter-cabinet]')).toBeNull();
        expect(ligne(95)).toEqual([[1, 'MACJ']]); // un négociateur (vente importée) : la société de la vente
        expect(ligne(96)).toEqual([[1, ''], [1, '']]); // société inconnue : la colonne est là, vide
        expect(ligne(90)).toEqual([[1, 'CRITERIMMO'], [1, 'MACJ']]);
      } finally { donnees.ventes = avant.ventes; donnees.societe = avant.societe; }
    });
  });
});

describe('🔴 LOT DQ — « Vendu + compromis » : tous les compromis en cours comptés dans l’année en cours, une fois', () => {
  const v = (id: number, o: Partial<Vente>) => vente(id, { societe: 'macj', ...o });
  // au 27/10/2025 : 2 ventes signées en 2025 ; 4 compromis en cours — daté de mars 2025, sans date, daté de 2023, daté de 2024 ; un annulé
  const ventes = [
    v(31, { libelle: 'SIGNÉE MARS', honorairesTtc: 12000, statut: 'vendue', annee: 2025, mois: 3 }),
    v(32, { libelle: 'SIGNÉE SEPT', honorairesTtc: 6000, statut: 'vendue', annee: 2025, mois: 9 }),
    v(33, { libelle: 'EN COURS MARS', honorairesTtc: 2400, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-03-10' }),
    v(34, { libelle: 'EN COURS SANS DATE', honorairesTtc: 3600, statut: 'compromis', annee: 2019, mois: null, dateCompromis: null }),
    v(35, { libelle: 'EN COURS 2023', honorairesTtc: 1200, statut: 'compromis', annee: 2023, mois: null, dateCompromis: '2023-05-02' }),
    v(36, { libelle: 'EN COURS 2024', honorairesTtc: 4800, statut: 'compromis', annee: 2024, mois: null, dateCompromis: '2024-11-20' }),
    v(37, { libelle: 'ANNULÉ', honorairesTtc: 9000, statut: 'annulee', annee: 2025, mois: null, dateCompromis: '2025-02-01' }),
    v(38, { libelle: 'SIGNÉE 2024', honorairesTtc: 2400, statut: 'vendue', annee: 2024, mois: 6 }),
  ];
  it('la règle (pur) : daté de l’année → son mois ; sans date ou antérieur → le mois en cours (mention) ; une année passée n’en compte plus', async () => {
    const M = await import('../../../../lib/transaction/modele');
    expect(ventes.filter((x) => x.statut === 'compromis').map((x) => M.moisCompteEnCours(x, JOUR_DQ))).toEqual([
      { annee: 2025, mois: 3, reporte: false }, { annee: 2025, mois: 10, reporte: true }, { annee: 2025, mois: 10, reporte: true }, { annee: 2025, mois: 10, reporte: true }]);
    expect(M.compromisDuMode(ventes, 2025, null, 'tous', JOUR_DQ).map((x) => x.id).sort()).toEqual([33, 34, 35, 36]);
    expect([M.compromisDuMode(ventes, 2024, null, 'tous', JOUR_DQ), M.compromisDuMode(ventes, 2023, null, 'tous', JOUR_DQ)]).toEqual([[], []]);
    expect([M.mentionReportes(0), M.mentionReportes(1), M.mentionReportes(3)]).toEqual([null, '1 compromis non daté ou antérieur, compté au mois en cours',
      '3 compromis non datés ou antérieurs, comptés au mois en cours']);
    // 🔴 LOT DR — le mode « Compromis » : la même règle pour les compromis en cours (2024 ne compte plus le 36, compté en octobre 2025) ;
    // un compromis passé en acte reste au mois de la date de son compromis
    expect(M.compromisDuMode(ventes, 2024, null, 'compromis', JOUR_DQ)).toEqual([]);
    expect(M.compromisDuMode(ventes, 2025, null, 'compromis', JOUR_DQ).map((x) => x.id).sort()).toEqual([33, 34, 35, 36]);
    expect(M.compromisDuMode(ventes, 2025, 10, 'compromis', JOUR_DQ).map((x) => x.id).sort()).toEqual([34, 35, 36]);
  });
  for (const u of ['ht', 'ttc'] as const) {
    it(`L’année 2025 (${u.toUpperCase()}) : tuile 1 = Vendu + TOUS les compromis en cours = le Prévisionnel ; « à date » idem ; 2024 inchangée (vendu seul)`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      const avant = donnees.ventes; donnees.ventes = ventes;
      try {
        window.history.replaceState(null, '', '/?vue=annee&annee=2025&mode=tous');
        await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
        const val = (sel: string) => texte(`${sel} .tdb-tuile-valeur`) || texte(sel);
        // vendu 12 000 + 6 000 + compromis en cours 2 400 + 3 600 + 1 200 + 4 800 = 30 000 € TTC (25 000 € HT) ; 6 affaires
        const total = (12000 + 6000 + 2400 + 3600 + 1200 + 4800) / (u === 'ht' ? 1.2 : 1);
        const eurFr = (x: number) => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/\u202f/g, ' ')} €`;
        expect([val('[data-tuile="ca-annee"]').replace(/\s/g, ' '), texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur')]).toEqual([eurFr(total).replace(/\s/g, ' '), '6']);
        expect(val('[data-tuile="ca-a-date"]').replace(/\s/g, ' ')).toBe(eurFr(total).replace(/\s/g, ' '));
        // 🔴 LOT DR — la 4ᵉ tuile : le prévisionnel du CA net (des ventes sans ligne : rien à déduire, net = CA)
        expect(val('[data-tuile="previsionnel-net-annee"]').replace(/\s/g, ' ')).toBe(eurFr(total).replace(/\s/g, ' '));
        expect(texte('[data-bloc="compromis-annee"] [data-mention-reportes]')).toBe(' — 3 compromis non datés ou antérieurs, comptés au mois en cours');
      } finally { donnees.ventes = avant; }
    });
  }
  it('Le mois : octobre 2025 (le mois en cours) porte les 3 reportés, la mention dans la liste et dans l’encadré ; mars porte le compromis daté', async () => {
    const avant = donnees.ventes; donnees.ventes = ventes;
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=10&mode=tous');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
      expect([...container.querySelectorAll('[data-bloc="compromis-du-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente')).sort()).toEqual(['34', '35', '36']);
      expect(texte('[data-bloc="histogramme-mois"] [data-bulle-note]')).toBe('3 compromis non datés ou antérieurs, comptés au mois en cours');
      expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('8 000 €'); // (3 600 + 1 200 + 4 800) ÷ 1,2
      await act(async () => { (container.querySelector('[data-onglet-mois="3"]') as HTMLElement).click(); }); await calmer();
      expect([...container.querySelectorAll('[data-bloc="compromis-du-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['33']);
      expect(container.querySelector('[data-bloc="compromis-du-mois"] [data-mention-reportes]')).toBeNull();
    } finally { donnees.ventes = avant; }
  });
});


describe('🔴 LOT DR — « Compromis » : les compromis en cours comptés comme en « Vendu + compromis » ; les deux tuiles de droite de « Vendu + compromis »', () => {
  const ld = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
    origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
  const v = (id: number, o: Partial<Vente>) => vente(id, { societe: 'macj', ...o });
  // au 27/10/2025 : une vente signée en mars (compromis daté de février 2025), une signée en 2025 sans date de compromis ; 3 compromis en cours — daté
  // de juin 2025 (commission du négociateur 1 200 TTC), sans date, daté de 2024 ; un annulé ; une vente 2024 au compromis daté de 2024.
  const ventes = [
    v(41, { libelle: 'SIGNÉE MARS', honorairesTtc: 12000, statut: 'vendue', annee: 2025, mois: 3, dateCompromis: '2025-02-03', lignes: [ld('MYLENE', 'negociateur', 2400)] }),
    v(42, { libelle: 'SIGNÉE SANS DATE', honorairesTtc: 6000, statut: 'vendue', annee: 2025, mois: 9 }),
    v(43, { libelle: 'EN COURS JUIN', honorairesTtc: 6000, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-06-10', lignes: [ld('MYLENE', 'negociateur', 1200)] }),
    v(44, { libelle: 'EN COURS SANS DATE', honorairesTtc: 3600, statut: 'compromis', annee: 2019, mois: null, dateCompromis: null }),
    v(45, { libelle: 'EN COURS 2024', honorairesTtc: 2400, statut: 'compromis', annee: 2024, mois: null, dateCompromis: '2024-11-20' }),
    v(46, { libelle: 'ANNULÉ', honorairesTtc: 9000, statut: 'annulee', annee: 2025, mois: null, dateCompromis: '2025-02-01' }),
    v(47, { libelle: 'SIGNÉE 2024', honorairesTtc: 4800, statut: 'vendue', annee: 2024, mois: 6, dateCompromis: '2024-04-01' }),
  ];
  const ouvrir = async (q: string, u: 'ht' | 'ttc' = 'ht') => {
    window.localStorage.setItem('trx-affichage-montants', u);
    const avant = { ventes: donnees.ventes, statuts: donnees.statutsNegociateurs };
    donnees.ventes = ventes; donnees.statutsNegociateurs = { MYLENE: 'independant' };
    window.history.replaceState(null, '', q);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    return () => { donnees.ventes = avant.ventes; donnees.statutsNegociateurs = avant.statuts; window.localStorage.removeItem('trx-mois-mode'); window.localStorage.setItem('trx-affichage-montants', 'ht'); };
  };
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const val = (sel: string) => centimesDe(texte(`[data-tuile="${sel}"] .tdb-tuile-valeur`));
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };

  it('la règle (pur) : un compromis signé depuis → au mois de son compromis ; un en cours → la règle du lot DQ ; jamais un annulé ; 2024 ne compte plus le compromis en cours', async () => {
    const M = await import('../../../../lib/transaction/modele');
    expect(M.compromisDuMode(ventes, 2025, null, 'compromis', JOUR_DQ).map((x) => x.id).sort()).toEqual([41, 43, 44, 45]);
    expect(M.compromisDuMode(ventes, 2025, 2, 'compromis', JOUR_DQ).map((x) => x.id)).toEqual([41]);
    expect(M.compromisDuMode(ventes, 2025, 6, 'compromis', JOUR_DQ).map((x) => x.id)).toEqual([43]);
    expect(M.compromisDuMode(ventes, 2025, 10, 'compromis', JOUR_DQ).map((x) => x.id).sort()).toEqual([44, 45]);
    expect(M.compromisDuMode(ventes, 2024, null, 'compromis', JOUR_DQ).map((x) => x.id)).toEqual([47]);
    // les compromis en cours du mode « Compromis » = ceux de « Vendu + compromis » = l'onglet « En cours »
    expect(M.compromisDuMode(ventes, 2025, null, 'compromis', JOUR_DQ).filter(M.estCompromis).map((x) => x.id).sort())
      .toEqual(M.compromisDuMode(ventes, 2025, null, 'tous', JOUR_DQ).map((x) => x.id).sort());
  });

  for (const u of ['ht', 'ttc'] as const) {
    it(`L’année 2025, « Compromis » (${u.toUpperCase()}) : les 3 compromis en cours + le signé de février ; la mention ; 2024 : le seul compromis signé`, async () => {
      const fin = await ouvrir('/?vue=annee&annee=2025&mode=compromis', u);
      try {
        const f = u === 'ht' ? 1 / 1.2 : 1;
        expect([val('ca-annee'), texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur')]).toEqual([Math.round((12000 + 6000 + 3600 + 2400) * f * 100), '4']);
        expect(texte('[data-bloc="compromis-annee"] [data-mention-reportes]')).toBe(' — 2 compromis non datés ou antérieurs, comptés au mois en cours');
        expect(texte('[data-tuile="compromis"] .tdb-tuile-n1')).toBe('3 compromis — le prévisionnel');
        await cliquer('[data-onglet-annee="2024"]');
        expect([val('ca-annee'), texte('[data-tuile="ventes-annee"] .tdb-tuile-valeur')]).toEqual([Math.round(4800 * f * 100), '1']);
      } finally { fin(); }
    });
  }

  it('Le mois octobre 2025, « Compromis » : les 2 reportés, la mention dans la liste et dans l’encadré du graphique', async () => {
    const fin = await ouvrir('/?vue=mois&annee=2025&mois=10&mode=compromis');
    try {
      expect(texte('[data-tuile="ventes-mois"] .tdb-tuile-valeur')).toBe('2');
      expect(texte('[data-bloc="compromis-du-mois"] [data-mention-reportes]')).toBe(' — 2 compromis non datés ou antérieurs, comptés au mois en cours');
      expect(texte('[data-bloc="histogramme-mois"] [data-bulle-note]')).toBe('2 compromis non datés ou antérieurs, comptés au mois en cours');
    } finally { fin(); }
  });

  for (const u of ['ht', 'ttc'] as const) for (const vue of ['annee', 'mois'] as const) {
    it(`« Vendu + compromis », ${vue === 'annee' ? 'L’année' : 'Le mois (Année)'} (${u.toUpperCase()}) : 3ᵉ tuile « Prévisionnel CA 2025 (vendu + compromis) », montant inchangé ; 4ᵉ = CA net du mode Vendu + CA net des compromis en cours, au centime`, async () => {
      {
        const q = vue === 'annee' ? '/?vue=annee&annee=2025' : '/?vue=mois&annee=2025&mois=10&vue-mois=annee';
        const fin = await ouvrir(`${q}&mode=vendu`, u);
        try {
          const netVendu = val(vue === 'annee' ? 'ca-net-annee' : 'ca-net-cumul');
          await cliquer('[data-mode-mois="tous"]');
          const t3 = vue === 'annee' ? 'ca-a-date' : 'cumul';
          expect([vue, texte(`[data-tuile="${t3}"] .tdb-tuile-mot`)]).toEqual([vue, 'Prévisionnel CA 2025 (vendu + compromis) (à fin octobre)']);
          // vendu 12 000 + 6 000 + compromis en cours 6 000 + 3 600 + 2 400 = 30 000 € TTC — le montant d'avant
          expect([vue, val(t3)]).toEqual([vue, Math.round(30000 * (u === 'ht' ? 1 / 1.2 : 1) * 100)]);
          // CA net des compromis en cours : (6 000 − 1 200) + 3 600 + 2 400 = 10 800 € TTC (9 000 € HT)
          const netComp = u === 'ht' ? 900000 : 1080000;
          const t4 = vue === 'annee' ? 'previsionnel-net-annee' : 'previsionnel-net-mois';
          expect([vue, val(t4)]).toEqual([vue, netVendu + netComp]);
          expect(texte(`[data-tuile="${t4}"] .tdb-tuile-mot`)).toMatch(/^Prévisionnel du CA net 2025 \(\(vendu \+ compromis\) − commissions versées/);
          expect(texte(`[data-tuile="${t4}"] [data-previsionnel-detail]`)).toBe(u === 'ht' ? 'dont 13 000 € vendus · 9 000 € en compromis (3)' : 'dont 15 600 € vendus · 10 800 € en compromis (3)');
          // N−1 sur la même définition : 2024 = la vente signée (4 800 TTC), aucun compromis en cours compté en 2024
          expect(texte(`[data-tuile="${t4}"] [data-tuile-n1="previsionnel-net"]`)).toMatch(u === 'ht' ? /^4 000 € en 2024 \(\+450 %\)$/ : /^4 800 € en 2024 \(\+450 %\)$/);
        } finally { fin(); }
      }
    });
  }
});

describe('🔴 LOT DS — « L’année », mode « Compromis » : CA brut, CA net des compromis (CA − commissions versées), nombre, compromis en cours', () => {
  const ld = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
    origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
  const v = (id: number, o: Partial<Vente>) => vente(id, { societe: 'macj', ...o });
  // au 27/10/2025 : 3 compromis en cours (6 000 TTC avec 1 200 de commission ; 3 600 sans date ; 2 400 daté de 2024) ; 2024 : un compromis signé depuis
  const ventes = [
    v(51, { libelle: 'EN COURS JUIN', honorairesTtc: 6000, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-06-10', lignes: [ld('MYLENE', 'negociateur', 1200)] }),
    v(52, { libelle: 'EN COURS SANS DATE', honorairesTtc: 3600, statut: 'compromis', annee: 2019, mois: null, dateCompromis: null }),
    v(53, { libelle: 'EN COURS 2024', honorairesTtc: 2400, statut: 'compromis', annee: 2024, mois: null, dateCompromis: '2024-11-20' }),
    v(54, { libelle: 'SIGNÉE 2024', honorairesTtc: 4800, statut: 'vendue', annee: 2024, mois: 6, dateCompromis: '2024-04-01', lignes: [ld('MYLENE', 'negociateur', 1200)] }),
  ];
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  for (const u of ['ht', 'ttc'] as const) {
    it(`les 4 tuiles (${u.toUpperCase()}) : tuile 2 = tuile 1 − commissions versées, en vert ; N−1 même définition ; plus de tuile « à date » ; les autres modes inchangés`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      const avant = { ventes: donnees.ventes, statuts: donnees.statutsNegociateurs };
      donnees.ventes = ventes; donnees.statutsNegociateurs = { MYLENE: 'independant' };
      try {
        window.history.replaceState(null, '', '/?vue=annee&annee=2025&mode=compromis');
        await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
        const tuiles = [...container.querySelectorAll('.tdb-tuiles > li > .tdb-tuile')];
        // 🔴 LOT DT — l'ordre : CA brut, nombre, compromis en cours, puis le CA net tout à droite
        expect(tuiles.map((t) => t.getAttribute('data-tuile'))).toEqual(['ca-annee', 'ventes-annee', 'compromis', 'ca-net-compromis-annee']);
        expect(tuiles.map((t) => sansExplication(t.querySelector('.tdb-tuile-mot')!))).toEqual(['CA brut des compromis — 2025', 'Compromis — 2025', `Compromis en cours (${u.toUpperCase()})`,
          'CA net des compromis — 2025']); // 🔴 LOT DU : « (CA − commissions versées) » devient la ligne d'explication
        const f = u === 'ht' ? 1 / 1.2 : 1;
        const brut = centimesDe(texte('[data-tuile="ca-annee"] .tdb-tuile-valeur')); const net = centimesDe(texte('[data-ca-net-compromis]'));
        expect([brut, net, brut - net]).toEqual([Math.round(12000 * f * 100), Math.round(10800 * f * 100), Math.round(1200 * f * 100)]);
        expect(container.querySelector('[data-ca-net-compromis]')!.classList.contains('trx-vert')).toBe(true);
        // N−1 (2024, même définition) : le compromis signé depuis (4 800 − 1 200 de commission)
        expect(texte('[data-tuile-n1="ca-net-compromis"]')).toBe(u === 'ht' ? '3 000 € en 2024 (+200 %)' : '3 600 € en 2024 (+200 %)');
        expect(container.querySelector('[data-tuile="ca-a-date"]')).toBeNull();
        for (const mode of ['vendu', 'tous'] as const) {
          await act(async () => { (container.querySelector(`[data-mode-mois="${mode}"]`) as HTMLElement).click(); }); await calmer();
          expect([mode, container.querySelector('[data-tuile="ca-a-date"]') !== null, container.querySelector('[data-tuile="ca-net-compromis-annee"]')]).toEqual([mode, true, null]);
        }
      } finally { donnees.ventes = avant.ventes; donnees.statutsNegociateurs = avant.statuts; window.localStorage.removeItem('trx-mois-mode'); window.localStorage.setItem('trx-affichage-montants', 'ht'); }
    });
  }
});

describe('🔴 LOT DU — la ligne d’explication sous le titre des tuiles de CA et de CA net (« Le mois », « L’année », tous modes)', () => {
  const ld = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
    origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
  const ventes = [
    vente(61, { societe: 'macj', libelle: 'SIGNÉE', honorairesTtc: 12000, statut: 'vendue', annee: 2025, mois: 10, lignes: [ld('MYLENE', 'negociateur', 2400)] }),
    vente(62, { societe: 'macj', libelle: 'EN COURS', honorairesTtc: 6000, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-10-10' }),
  ];
  // les tuiles de CA et de CA net de chaque écran et de chaque mode (les tuiles de nombre et « Compromis en cours » n'en ont pas)
  const attendu: Record<string, Record<string, 'ca' | 'net' | null>> = {
    'mois-vendu': { 'ca-mois': 'ca', 'ventes-mois': null, cumul: 'ca', 'ca-net-cumul': 'net' },
    'mois-compromis': { 'ca-mois': 'ca', 'ventes-mois': null, compromis: 'ca', 'ca-net-compromis-mois': 'net' }, // 🔴 LOT DV : « Compromis en cours » — FUSION seulement (filtré plus bas) ; LOT DZ : la rangée de « L'année »
    'mois-tous': { 'ca-mois': 'ca', 'ventes-mois': null, cumul: 'ca', 'previsionnel-net-mois': 'net' },
    'annee-vendu': { 'ca-annee': 'ca', 'ventes-annee': null, 'ca-a-date': 'ca', 'ca-net-annee': 'net' },
    'annee-compromis': { 'ca-annee': 'ca', 'ventes-annee': null, compromis: 'ca', 'ca-net-compromis-annee': 'net' },
    'annee-tous': { 'ca-annee': 'ca', 'ventes-annee': null, 'ca-a-date': 'ca', 'previsionnel-net-annee': 'net' },
  };
  for (const societe of ['macj', 'tous'] as const) for (const vue of ['mois', 'annee'] as const) for (const mode of ['vendu', 'compromis', 'tous'] as const) {
    it(`${societe === 'tous' ? 'FUSION' : 'MACJ'}, ${vue === 'mois' ? 'Le mois' : 'L’année'}, ${mode}`, async () => {
      const avant = { ventes: donnees.ventes, statuts: donnees.statutsNegociateurs, societe: donnees.societe };
      donnees.ventes = ventes; donnees.statutsNegociateurs = { MYLENE: 'independant' }; donnees.societe = societe === 'tous' ? null : societe;
      try {
        window.history.replaceState(null, '', vue === 'mois' ? `/?vue=mois&annee=2025&mois=10&mode=${mode}` : `/?vue=annee&annee=2025&mode=${mode}`);
        await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
        const M = await import('./EcransTransaction');
        const mots = M.EXPLICATIONS_TUILES[societe === 'tous' ? 'fusion' : 'societe'];
        const lu = Object.fromEntries([...container.querySelectorAll('.tdb-tuiles > li > .tdb-tuile')].map((t) => {
          const x = t.querySelector('.tdb-tuile-mot > [data-tuile-explication]');
          return [t.getAttribute('data-tuile'), x === null ? null : [x.getAttribute('data-tuile-explication'), x.textContent]];
        }));
        const voulu = Object.fromEntries(Object.entries(attendu[`${vue}-${mode}`]).map(([k, s]) => [k, s === null || (k === 'compromis' && societe !== 'tous') ? null : [s, mots[s]]]));
        expect(lu).toEqual(voulu);
        // l'ancienne mention n'est plus nulle part dans les tuiles
        expect(container.querySelector('.tdb-tuiles')!.textContent).not.toContain('après commissions, rétrocessions et reversé');
        if (vue === 'annee' && mode === 'compromis') expect(texte('[data-tuile="ca-net-compromis-annee"] .tdb-tuile-mot')).toBe(societe === 'tous' ? 'CA net consolidé des compromis — 2025' : 'CA net des compromis — 2025');
        // 🔴 LOT DV — FUSION : « CA consolidé des compromis » et « Compromis en cours consolidés » ; une société : « CA brut des compromis », « Compromis en cours »
        if (vue === 'annee' && mode === 'compromis') expect(texte('[data-tuile="ca-annee"] .tdb-tuile-mot')).toBe(societe === 'tous' ? 'CA consolidé des compromis — 2025' : 'CA brut des compromis — 2025');
        if (mode === 'compromis') expect(texte('[data-tuile="compromis"] .tdb-tuile-mot')).toBe(societe === 'tous' ? 'Compromis en cours consolidés (HT)' : 'Compromis en cours (HT)');
        if (societe === 'tous') expect([...container.querySelectorAll('.tdb-tuile-mot, h2, h3, th')].filter((x) => /\bbrut/i.test(x.textContent ?? '')).map((x) => x.textContent)).toEqual([]);
      } finally { donnees.ventes = avant.ventes; donnees.statutsNegociateurs = avant.statuts; donnees.societe = avant.societe; window.localStorage.removeItem('trx-mois-mode'); }
    });
  }
  it('les mots d’Arno, à la lettre ; la ligne est dans la rangée du titre (les montants restent alignés, lot DB)', async () => {
    const M = await import('./EcransTransaction');
    expect(M.EXPLICATIONS_TUILES).toEqual({
      fusion: { ca: 'CRITERIMMO + MACJ, sans doublon d’inter-cabinet', net: 'CA consolidé − commissions et rétrocessions versées' },
      societe: { ca: 'honoraires encaissés par la société', net: 'CA − commissions, rétrocessions et reversé inter-cabinet' } });
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_TRANSACTION.replace(/\s+/g, ' ')).toContain('.tdb-tuile-mot>.trx-tuile-explication{display:block;');
  });
});

describe('🔴 LOT DX — « Location & Gestion » : la Gestion inchangée, ses anciens liens, les pages en construction', () => {
  const T = 'app/(admin)/admin/(protected)/transaction';
  it('la page Gestion garde son adresse et son écran (EcranGestion, les paramètres de l’adresse) ; seuls son fil d’Ariane et son « ← Retour » montent d’un niveau', () => {
    const src = readFileSync(`${T}/gestion/page.tsx`, 'utf8');
    expect([existsSync(`${T}/gestion/page.tsx`), src.includes('<EcranGestion />'), src.includes('ARIANE.gestion'), src.includes('accesTransaction()')]).toEqual([true, true, true, true]);
    // les liens vers la Gestion (CA global : « ?annee= ») ne changent pas
    expect(readFileSync(`${T}/EcransTransaction.tsx`, 'utf8')).toContain("gestion: '/admin/transaction/gestion'");
  });
  it('Location et FUSION Location & Gestion : construites, sous le même droit que la Gestion ; l’encadré « En construction » reste disponible', async () => {
    // 🔴 LOT LO1 — la Location est construite (EcranLocationCA) ; 🔴 LOT LG1 — la FUSION Location & Gestion aussi (EcranFusionLocationGestion)
    for (const f of ['location-gestion/fusion/page.tsx']) {
      const src = readFileSync(`${T}/${f}`, 'utf8');
      expect([f, src.includes('<EcranFusionLocationGestion />'), src.includes('<EnConstruction />'), src.includes('accesTransaction()'), src.includes('REFUS_TRANSACTION'), src.includes('ARIANE.fusionLocationGestion')])
        .toEqual([f, true, false, true, true, true]);
    }
    const { EnConstruction } = await import('./EnConstruction');
    await act(async () => { root.render(createElement(EnConstruction)); });
    expect(texte('[data-en-construction]')).toBe('En construction — cette page sera construite au prochain lot.');
    expect(container.querySelector('[data-en-construction]')!.textContent).not.toMatch(/\d/);
  });
});

describe('🔴 LOT DZ — « Le mois », mode « Compromis » : CA brut (cumul en ligne du bas), nombre, compromis en cours, CA net des compromis', () => {
  const ld = (negociateur: string, role: LigneVente['role'], montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: true,
    origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
  const v = (id: number, o: Partial<Vente>) => vente(id, { societe: 'macj', ...o });
  // au 27/10/2025 : 3 compromis en cours — juin (6 000, commission 1 200), sans date et 2024 (reportés en octobre) ; 2024 : un compromis d'octobre signé depuis
  const ventes = [
    v(71, { libelle: 'EN COURS JUIN', honorairesTtc: 6000, statut: 'compromis', annee: 2025, mois: null, dateCompromis: '2025-06-10', lignes: [ld('MYLENE', 'negociateur', 1200)] }),
    v(72, { libelle: 'EN COURS SANS DATE', honorairesTtc: 3600, statut: 'compromis', annee: 2019, mois: null, dateCompromis: null }),
    v(73, { libelle: 'EN COURS 2024', honorairesTtc: 2400, statut: 'compromis', annee: 2024, mois: null, dateCompromis: '2024-11-20' }),
    v(74, { libelle: 'SIGNÉE 2024', honorairesTtc: 4800, statut: 'vendue', annee: 2024, mois: 12, dateCompromis: '2024-10-01', lignes: [ld('MYLENE', 'negociateur', 1200)] }),
  ];
  const centimesDe = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);
  for (const u of ['ht', 'ttc'] as const) for (const vue of ['mois', 'annee'] as const) {
    it(`${vue === 'mois' ? 'Mois (octobre 2025)' : 'Année 2025'} (${u.toUpperCase()}) : l’ordre, tuile 4 = tuile 1 − commissions versées (vert), la ligne « cumul » = l’ancienne tuile cumulé`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      const avant = { ventes: donnees.ventes, statuts: donnees.statutsNegociateurs };
      donnees.ventes = ventes; donnees.statutsNegociateurs = { MYLENE: 'independant' };
      try {
        const q = `/?vue=mois&annee=2025&mois=10${vue === 'annee' ? '&vue-mois=annee' : ''}`;
        // l'ancienne tuile « cumulé » : le cumul du mode Compromis, janvier → octobre (la fonction de l'écran)
        const M = await import('../../../../lib/transaction/modele');
        const ancienCumul = M.caHtParMoisMode(ventes, 2025, 'macj', 'compromis', JOUR_DQ).slice(0, 10).reduce((a, b) => a + b, 0) * (u === 'ht' ? 1 : 1.2);
        window.history.replaceState(null, '', `${q}&mode=compromis`);
        await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
        const tuiles = [...container.querySelectorAll('.tdb-tuiles > li > .tdb-tuile')];
        expect(tuiles.map((t) => t.getAttribute('data-tuile'))).toEqual(['ca-mois', 'ventes-mois', 'compromis', 'ca-net-compromis-mois']);
        const mot = vue === 'mois' ? 'octobre' : 'année';
        expect(tuiles.map((t) => sansExplication(t.querySelector('.tdb-tuile-mot')!))).toEqual([`CA brut des compromis — ${mot}`, `Compromis — ${mot}`, `Compromis en cours (${u.toUpperCase()})`, `CA net des compromis — ${mot}`]);
        const f = u === 'ht' ? 1 / 1.2 : 1;
        // octobre : les deux reportés (3 600 + 2 400) ; l'année : + juin (6 000, dont 1 200 de commission)
        const [brutT, netT] = vue === 'mois' ? [6000, 6000] : [12000, 10800];
        const brut = centimesDe(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')); const net = centimesDe(texte('[data-ca-net-compromis]'));
        expect([brut, net]).toEqual([Math.round(brutT * f * 100), Math.round(netT * f * 100)]);
        expect(container.querySelector('[data-ca-net-compromis]')!.classList.contains('trx-vert')).toBe(true);
        expect(texte('[data-tuile="ca-mois"] [data-tuile-cumul]')).toBe(`cumul 2025 à fin octobre : ${texte('[data-tuile="ca-mois"] [data-tuile-cumul]').split(' : ')[1]}`);
        expect(centimesDe(texte('[data-tuile="ca-mois"] [data-tuile-cumul]').split(' : ')[1])).toBe(Math.round(ancienCumul * 100));
        expect(container.querySelector('[data-tuile="cumul"]')).toBeNull();
        // N−1 : octobre 2024 = le compromis signé depuis (4 800 − 1 200) ; l'année 2024 : le même
        expect(texte('[data-tuile-n1="ca-net-compromis"]')).toMatch(u === 'ht' ? /^3 000 € en 2024 / : /^3 600 € en 2024 /);
        // les autres modes gardent la tuile « cumulé »
        for (const mode of ['vendu', 'tous'] as const) {
          await act(async () => { (container.querySelector(`[data-mode-mois="${mode}"]`) as HTMLElement).click(); }); await calmer();
          expect([mode, container.querySelector('[data-tuile="cumul"]') !== null, container.querySelector('[data-tuile-cumul]'), container.querySelector('[data-tuile="ca-net-compromis-mois"]')]).toEqual([mode, true, null, null]);
        }
      } finally { donnees.ventes = avant.ventes; donnees.statutsNegociateurs = avant.statuts; window.localStorage.removeItem('trx-mois-mode'); window.localStorage.setItem('trx-affichage-montants', 'ht'); }
    });
  }
});

/**
 * 🔴 LOT UI1 — le composant partagé des tuiles alignées (vente : Le mois, L'année, Compromis ; CA global ; Location ; Gestion ; FUSION) : le
 * montant converti collé sous le montant (2 px), le montant posé au bas de sa rangée, moins de marge en haut et en bas ; les tailles de texte
 * ne changent pas. (Hauteurs et alignement au pixel : mesurés dans Chrome, rapport du lot.)
 */
describe('🔴 LOT UI1 — tuiles compactes, montant converti collé', () => {
  it('les règles du composant partagé', async () => {
    const { CSS_TRANSACTION } = await import('./commun');
    for (const r of ['.trx-tuiles-alignees>li>.tdb-tuile{padding:12px 20px}', '@media (max-width:640px){ .trx-tuiles-alignees>li>.tdb-tuile{padding:11px 16px} }',
      '.trx-tuiles-alignees .tdb-tuile>.tdb-tuile-valeur{grid-row:2;align-self:end;line-height:1.1}', '.trx-tuiles-alignees .tdb-tuile>.trx-tuile-autre{grid-row:3;padding-top:2px}',
      '.trx-tuiles-alignees .tdb-tuile>.tdb-tuile-mot{grid-row:1;align-self:end;padding-bottom:5px}', '.trx-tuiles-alignees .tdb-tuile>.tdb-tuile-n1{grid-row:4;padding-top:5px}'])
      expect(CSS_TRANSACTION).toContain(r);
    // aucune taille de texte des tuiles alignées n'est touchée
    expect(CSS_TRANSACTION.split('\n').filter((l) => l.includes('trx-tuiles-alignees') && /font-size/.test(l))).toEqual([]);
  });
});

describe('Arno (01/11/2026) — « Année » : seuls les mois écoulés sont soulignés', () => {
  const douze = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const rendre = async (annee: number, jour: string, decoupage: 'mois' | 'periode' | 'annee' = 'annee', moisChoisis: number[] | null = douze) => {
    const clics: number[] = [];
    await act(async () => { root.render(createElement(LigneDesMois, { annee, mois: 3, jour, decoupage, moisChoisis, onMois: (m: number) => { clics.push(m); }, onDecoupage: () => {} })); });
    return clics;
  };
  const soulignes = () => [...container.querySelectorAll('[data-onglet-mois][aria-pressed="true"]')].map((b) => Number(b.getAttribute('data-onglet-mois')));
  it('année en cours (novembre) : janvier → novembre ; passée : 12 ; future : aucun ; janvier : janvier seul ; décembre : 12', async () => {
    for (const [annee, jour, attendu] of [[2026, '2026-11-01', douze.slice(0, 11)], [2025, '2026-11-01', douze], [2027, '2026-11-01', []],
      [2027, '2027-01-15', [1]], [2026, '2026-12-01', douze]] as const) {
      await rendre(annee, jour);
      expect([annee, jour, soulignes()]).toEqual([annee, jour, attendu]);
      // les 12 mois restent là, et le choix « Année » aussi
      expect([container.querySelectorAll('[data-onglet-mois]').length, container.querySelector('[data-decouper="annee"]')!.getAttribute('aria-pressed')]).toEqual([12, 'true']);
    }
  });
  it('un mois à venir reste cliquable (non souligné n’est pas désactivé) ; « Mois » et « Période » inchangés', async () => {
    const clics = await rendre(2026, '2026-11-01');
    const dec = container.querySelector('[data-onglet-mois="12"]') as HTMLButtonElement;
    expect([dec.disabled, dec.getAttribute('aria-disabled')]).toEqual([false, null]);
    await act(async () => { dec.click(); });
    expect(clics).toEqual([12]);
    // Période : les mois choisis, futurs compris, restent soulignés
    await rendre(2026, '2026-11-01', 'periode', [10, 12]);
    expect(soulignes()).toEqual([10, 12]);
    // Mois : l'onglet du mois, comme avant
    await rendre(2026, '2026-11-01', 'mois', null);
    expect(container.querySelector('[data-onglet-mois][aria-selected="true"]')!.getAttribute('data-onglet-mois')).toBe('3');
  });
});

describe('Arno (01/11/2026) — CRITERIMMO, MACJ, FUSION VENTES : le graphique « mois par mois » en rouge = exactement les mois soulignés', () => {
  // ⚠️ jsdom garde en cache le style calculé d'une feuille retirée avec son ancêtre : on lit les règles du <style> du graphique lui-même.
  const regles = (): CSSStyleRule[] => [...container.querySelectorAll('[data-bloc="histogramme-mois"] style')]
    .flatMap((x) => [...((x as HTMLStyleElement).sheet?.cssRules ?? [])]).filter((r): r is CSSStyleRule => 'selectorText' in r);
  const barres = (): Element[] => [...container.querySelectorAll('[data-bloc="histogramme-mois"] g[data-barre-mois]')];
  const rouges = (): number[] => barres().filter((g) => [...g.querySelectorAll('rect.tdb-barre')]
    .some((r) => r.classList.contains('tdb-barre--courante') || regles().some((x) => x.style.fill.includes('svv-red') && r.matches(x.selectorText))))
    .map((g) => Number(g.getAttribute('data-barre-mois')));
  const avecBarre = (): number[] => barres().filter((g) => g.querySelector('rect.tdb-barre') !== null).map((g) => Number(g.getAttribute('data-barre-mois')));
  const estompes = (): number[] => barres().filter((g) => regles().filter((x) => x.style.opacity !== '' && g.matches(x.selectorText)).at(-1)?.style.opacity === '0.35')
    .map((g) => Number(g.getAttribute('data-barre-mois')));
  const soulignes = (): number[] => [...container.querySelectorAll('.trx-rangee-mois [data-onglet-mois]')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true').map((b) => Number(b.getAttribute('data-onglet-mois')));
  const tous = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // le 15/11/2026 (date injectée) : l'année en cours s'arrête à novembre
  const cas = [['Mois', '/?vue=mois&annee=2026&mois=9&vue-mois=mois', [9]], ['Période', '/?vue=mois&annee=2026&mois=5&vue-mois=periode&periode=2026-03,2026-05', [3, 5]],
    ['Année en cours', '/?vue=mois&annee=2026&mois=9&vue-mois=annee', tous.slice(0, 11)], ['Année passée', '/?vue=mois&annee=2025&mois=9&vue-mois=annee', tous],
    ['Année future', '/?vue=mois&annee=2027&mois=9&vue-mois=annee', []]] as const;
  for (const societe of ['criterimmo', 'macj', 'tous'] as const) for (const [mode, q, attendu] of cas) {
    it(`${societe} — ${mode}`, async () => {
      vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
      window.history.replaceState(null, '', q);
      await act(async () => { root.render(createElement(EcranSociete, { societe })); });
      await calmer();
      expect(soulignes()).toEqual(attendu);
      expect(rouges()).toEqual(soulignes().filter((k) => avecBarre().includes(k)));
      // hors sélection : estompés (libellés compris) en Période / Année ; « Mois » : jamais estompé (lots DE / DF)
      expect(estompes()).toEqual(mode === 'Mois' ? [] : barres().map((g) => Number(g.getAttribute('data-barre-mois'))).filter((k) => !(attendu as readonly number[]).includes(k)));
    });
  }
});

describe('Arno (01/11/2026) — onglet « Année(s) » : CRITERIMMO, MACJ, FUSION VENTES, CA global — en rouge, exactement les années soulignées', () => {
  // ⚠️ jsdom garde en cache le style calculé d'une feuille retirée avec son ancêtre : on lit les règles du <style> du graphique lui-même.
  const regles = (bloc: string): CSSStyleRule[] => [...container.querySelectorAll(`[data-bloc="${bloc}"] style`)]
    .flatMap((x) => [...((x as HTMLStyleElement).sheet?.cssRules ?? [])]).filter((r): r is CSSStyleRule => 'selectorText' in r);
  const groupes = (bloc: string, attr: string): Element[] => [...container.querySelectorAll(`[data-bloc="${bloc}"] g[${attr}]`)];
  const rouges = (bloc: string, attr: string): number[] => groupes(bloc, attr).filter((g) => [...g.querySelectorAll('rect.tdb-barre')]
    .some((r) => r.classList.contains('tdb-barre--courante') || regles(bloc).some((x) => x.style.fill.includes('svv-red') && r.matches(x.selectorText))))
    .map((g) => Number(g.getAttribute(attr)));
  const avecBarre = (bloc: string, attr: string): number[] => groupes(bloc, attr).filter((g) => g.querySelector('rect.tdb-barre') !== null).map((g) => Number(g.getAttribute(attr)));
  const estompes = (bloc: string, attr: string): number[] => groupes(bloc, attr)
    .filter((g) => regles(bloc).filter((x) => x.style.opacity !== '' && g.matches(x.selectorText)).at(-1)?.style.opacity === '0.35').map((g) => Number(g.getAttribute(attr)));
  const soulignees = (): number[] => [...container.querySelectorAll('.trx-rangee-annees [data-onglet-annee]')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true').map((b) => Number(b.getAttribute('data-onglet-annee')));
  const rangee = (): number[] => [...container.querySelectorAll('.trx-rangee-annees [data-onglet-annee]')].map((b) => Number(b.getAttribute('data-onglet-annee')));
  const ouvrirA = async (q: string, el: () => ReturnType<typeof createElement>) => {
    act(() => { root.unmount(); }); root = createRoot(container);
    window.history.replaceState(null, '', q);
    await act(async () => { root.render(el()); }); await calmer();
  };
  const modes = [['Année', '/?vue=annee&annee=2025', 'annee'], ['Période', '/?vue=annee&annee=2025&vue-annee=periode&annees=2024,2025', 'periode'],
    ['Tout', '/?vue=annee&annee=2025&vue-annee=tout', 'tout']] as const;
  for (const societe of ['criterimmo', 'macj', 'tous'] as const) for (const [mode, q] of modes) {
    it(`${societe} — « Année par année », ${mode}`, async () => {
      await ouvrirA(q, () => createElement(EcranSociete, { societe }));
      expect(soulignees()).toEqual(mode === 'Année' ? [2025] : mode === 'Période' ? [2024, 2025] : rangee());
      expect(rouges('graphe-annees', 'data-barre-annee')).toEqual(soulignees().filter((a) => avecBarre('graphe-annees', 'data-barre-annee').includes(a)));
      expect(rouges('graphe-annees', 'data-barre-annee').length).toBeGreaterThan(0);
      expect(estompes('graphe-annees', 'data-barre-annee')).toEqual(mode === 'Année' ? []
        : groupes('graphe-annees', 'data-barre-annee').map((g) => Number(g.getAttribute('data-barre-annee'))).filter((a) => !soulignees().includes(a)));
    });
  }
  for (const [mode, q] of modes) {
    it(`CA global — ${mode} : années (Période, Tout) ou mois écoulés de l’année (Année)`, async () => {
      await ouvrirA(q.replace('?vue=annee&', '?'), () => createElement(EcranGlobal));
      const parAnnees = mode !== 'Année';
      const attr = parAnnees ? 'data-barre-annee-global' : 'data-barre-mois-global';
      // « Année » : les mois écoulés de 2025 (le 27/10/2025 : janvier → octobre), « Mois à confirmer » (13) avec eux s'il est là
      const attendu = parAnnees ? soulignees() : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13];
      expect(rouges('global-graphe', attr)).toEqual(attendu.filter((k) => avecBarre('global-graphe', attr).includes(k)));
      expect(rouges('global-graphe', attr).length).toBeGreaterThan(0);
      expect(estompes('global-graphe', attr)).toEqual(groupes('global-graphe', attr).map((g) => Number(g.getAttribute(attr))).filter((k) => !attendu.includes(k)));
    });
  }
  it('« Mois par mois — AAAA » (CRITERIMMO) : 2025 en cours soulignée (le 15/11/2025) → janvier → novembre ; 2024 passée soulignée → 12 mois', async () => {
    vi.setSystemTime(new Date('2025-11-15T10:00:00Z'));
    for (const [q, attendu] of [['/?vue=annee&annee=2025&graphe=mois', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]], ['/?vue=annee&annee=2024&graphe=mois', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]] as const) {
      await ouvrirA(q, () => createElement(EcranSociete, { societe: 'criterimmo' }));
      expect([q, rouges('histogramme-mois', 'data-barre-mois')]).toEqual([q, attendu.filter((k) => avecBarre('histogramme-mois', 'data-barre-mois').includes(k))]);
      expect([q, estompes('histogramme-mois', 'data-barre-mois')]).toEqual([q, groupes('histogramme-mois', 'data-barre-mois').map((g) => Number(g.getAttribute('data-barre-mois')))
        .filter((k) => !(attendu as readonly number[]).includes(k))]);
    }
  });
  it('« Mois par mois — AAAA », AAAA hors des années soulignées : aucun mois en rouge (la règle unique)', () => {
    expect(moisRougesDeLAnnee(2026, [2024, 2025], '2026-11-15')).toBeNull();
    expect(moisRougesDeLAnnee(2026, [2025, 2026], '2026-11-15')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(moisRougesDeLAnnee(2025, [2025], '2026-11-15')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(moisRougesDeLAnnee(2027, [2027], '2026-11-15')).toEqual([]);
  });
});

/**
 * 🔴 D25 (Arno, 03/11/2026) — LES FILTRES DU GRAPHIQUE PAR FAMILLE : la ligne « Famille » (inclusion + nom + compteur), une seule liste de coûts
 * ouverte à la fois, « Tout / Aucun » par famille ; le même état qu'avant (`activites`, `familles`) : pour une même sélection, le graphique est
 * identique au centime à celui obtenu par l'ancienne voie (l'adresse).
 */
describe('🔴 D25 — filtres du graphique classés par famille', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const graphe = () => container.querySelector('[data-bloc="global-graphe"]')!;
  const barres = () => [...graphe().querySelectorAll('[data-barre-serie]')].map((x) => `${x.closest('[data-point-global]')!.getAttribute('data-point-global')}:${x.getAttribute('data-barre-serie')}:${Math.round(Number(x.getAttribute('data-valeur')) * 100)}`);
  const ouvrirG = async (q: string) => { await act(async () => { root.render(createElement('div')); }); window.history.replaceState(null, '', q); await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); };
  it('par défaut : aucune liste ; trois familles avec leur compteur ; ouvrir Vente → ses seuls coûts ; ouvrir Location → Vente se ferme ; re-clic : fermé', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    await ouvrirG('/?annee=2025&g-mesure=couts');
    expect(graphe().querySelector('[data-liste-couts]')).toBeNull();
    expect(['vente', 'location', 'gestion'].map((f) => texte(`[data-compteur-famille="${f}"]`))).toEqual(['5/5', '7/7', '4/4']);
    await cliquer('[data-ouvrir-famille="vente"]');
    expect([...graphe().querySelectorAll('[data-liste-couts="vente"] [data-case-graphe]')].map((x) => x.getAttribute('data-case-graphe')))
      .toEqual(['commissions', 'apporteursVente', 'exterieures', 'salairesVente', 'autresVente']);
    expect(new URLSearchParams(window.location.search).get('g-ouverte')).toBe('vente');
    await cliquer('[data-ouvrir-famille="location"]');
    expect(graphe().querySelector('[data-liste-couts="vente"]')).toBeNull();
    expect([...graphe().querySelectorAll('[data-liste-couts="location"] [data-case-graphe]')].map((x) => x.getAttribute('data-case-graphe')))
      .toEqual(['apporteursLocation', 'primes', 'variable', 'salairesLocation', 'partGestion', 'collegues', 'autresLocation']);
    await cliquer('[data-ouvrir-famille="location"]');
    expect(graphe().querySelector('[data-liste-couts]')).toBeNull();
    await cliquer('[data-ouvrir-famille="gestion"]');
    expect([...graphe().querySelectorAll('[data-liste-couts="gestion"] [data-case-graphe]')].map((x) => x.getAttribute('data-case-graphe'))).toEqual(['salairesGestion', 'adhoc', 'monga', 'autresGestion']);
  });
  it('décocher un coût, exclure une famille : le graphique = celui de l’ancienne voie (l’adresse) pour la même sélection, au centime', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    await ouvrirG('/?annee=2025&g-mesure=couts&g-comparer=familles');
    await cliquer('[data-ouvrir-famille="gestion"]'); await cliquer('[data-liste-couts="gestion"] [data-case-graphe="salairesGestion"]');
    await cliquer('[data-case-graphe="vente"]'); // exclure la vente
    expect(texte('[data-compteur-famille="gestion"]')).toBe('3/4');
    const nouvelle = barres();
    const p = new URLSearchParams(window.location.search);
    expect([p.get('g-activites'), p.get('g-familles')?.split(',').includes('salairesGestion')]).toEqual(['location,gestion', false]);
    await ouvrirG(`/?annee=2025&g-mesure=couts&g-comparer=familles&g-activites=location,gestion&g-familles=${p.get('g-familles')}`);
    expect(barres()).toEqual(nouvelle);
    expect(nouvelle.length).toBeGreaterThan(0);
  });
  it('« Tout / Aucun » d’une famille ne touche qu’elle ; « Réinitialiser » rend tout', async () => {
    await ouvrirG('/?annee=2025&g-mesure=couts');
    await cliquer('[data-ouvrir-famille="location"]'); await cliquer('[data-familles-aucun="location"]');
    expect(['vente', 'location', 'gestion'].map((f) => texte(`[data-compteur-famille="${f}"]`))).toEqual(['5/5', '0/7', '4/4']);
    await cliquer('[data-familles-tout="location"]');
    expect(texte('[data-compteur-famille="location"]')).toBe('7/7');
    await cliquer('[data-familles-aucun="location"]'); await cliquer('[data-case-graphe="vente"]');
    await cliquer('[data-reinitialiser-filtres]');
    expect(['g-familles', 'g-activites', 'g-mesure'].map((k) => new URLSearchParams(window.location.search).get(k))).toEqual([null, null, null]);
    expect((graphe().querySelector('[data-case-graphe="vente"]') as HTMLInputElement).checked).toBe(true);
    await cliquer('[data-filtre-graphe="Mesure"] [data-choix-graphe="couts"]');
    expect(['vente', 'location', 'gestion'].map((f) => texte(`[data-compteur-famille="${f}"]`))).toEqual(['5/5', '7/7', '4/4']);
  });
  it('hors « Coûts » (CA, Résultat net) : les familles restent incluables, sans liste ni compteur', async () => {
    await ouvrirG('/?annee=2025');
    expect(graphe().querySelector('[data-ouvrir-famille]')).toBeNull();
    expect([...graphe().querySelectorAll('[data-filtre-graphe="Activité"] [data-case-graphe]')].map((x) => x.getAttribute('data-case-graphe'))).toEqual(['vente', 'location', 'gestion']);
  });
});

describe('🔴 D33 (Arno, 03/11/2026) — graphique « Mois par mois » : « Activité », « CA net (CA − coûts) », les collaborateurs dans les boutons d’activité', () => {
  const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const graphe = () => container.querySelector('[data-bloc="global-graphe"]')!;
  const ouvrirG = async (q: string) => { await act(async () => { root.render(createElement('div')); }); window.history.replaceState(null, '', q); await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer(); };
  const COLLABS = { comptes: [{ id: 2, libelle: 'Arnaud Jorel', fonctions: ['vente'], societes: ['criterimmo'] }, { id: 8, libelle: 'Pierre Thevenin', fonctions: ['vente'], societes: ['macj'] },
    { id: 9, libelle: 'Cédric JULLIEN', fonctions: ['vente'], societes: ['criterimmo', 'macj'] }, { id: 5, libelle: 'Jean-Baptiste PONS', fonctions: ['location', 'vente'], societes: ['criterimmo'] }],
    libelles: { CEDRIC: 9 } };
  beforeEach(() => { (donneesGlobal as Record<string, unknown>).collaborateursGraphe = COLLABS; });
  afterEach(() => { delete (donneesGlobal as Record<string, unknown>).collaborateursGraphe; });
  it('les libellés : la ligne « Activité » ; la mesure « CA net (CA − coûts) »', async () => {
    await ouvrirG('/?annee=2025');
    expect(texte('[data-famille-filtre="famille"] .trx-gf-titre')).toBe('Activité');
    expect([...graphe().querySelectorAll('[data-filtre-graphe="Mesure"] button')].map((b) => b.textContent)).toEqual(['CA brut', 'Coûts', 'CA net (CA − coûts)']);
    await cliquer('[data-choix-graphe="net"]');
    expect(texte('#trx-g-graphe')).toMatch(/\(CA net HT/);
  });
  it('« CA brut » : le nom d’une activité ouvre SES collaborateurs (+ « Non attribué »), une seule à la fois ; compteur ; l’adresse ; la liste suit les structures', async () => {
    await ouvrirG('/?annee=2025');
    expect(['vente', 'location', 'gestion'].map((a) => texte(`[data-compteur-famille="${a}"]`))).toEqual(['5/5', '2/2', '1/1']);
    await cliquer('[data-ouvrir-famille="vente"]');
    const noms = () => [...graphe().querySelectorAll('[data-liste-collaborateurs] label')].map((l) => l.textContent);
    expect(noms()).toEqual(['Arnaud Jorel', 'Cédric JULLIEN', 'Jean-Baptiste PONS', 'Pierre Thevenin', 'Non attribué']);
    await cliquer('[data-case-collaborateur="8"]');
    expect(texte('[data-compteur-famille="vente"]')).toBe('4/5');
    expect(new URLSearchParams(window.location.search).get('g-exclus')).toBe('vente:8');
    // MACJ décochée : Pierre (MACJ seule) n'est plus proposé
    await cliquer('[data-filtre-graphe="Structure"] [data-case-graphe="macj"]');
    expect(noms()).toEqual(['Arnaud Jorel', 'Cédric JULLIEN', 'Jean-Baptiste PONS', 'Non attribué']);
    // une seule activité ouverte ; la gestion : « Non attribué » seul, et la mention
    await cliquer('[data-ouvrir-famille="gestion"]');
    expect(graphe().querySelector('[data-liste-collaborateurs="vente"]')).toBeNull();
    expect(noms()).toEqual(['Non attribué']);
    expect(graphe().querySelector('[data-gestion-non-attribuee]')).not.toBeNull();
  });
  it('« Aucun » / « Tout » d’une activité ; « CA net » filtré : la mention des coûts généraux ; « Réinitialiser » recoche tout', async () => {
    await ouvrirG('/?annee=2025&g-mesure=net');
    expect(graphe().querySelector('[data-note-couts-generaux]')).toBeNull();
    await cliquer('[data-ouvrir-famille="location"]');
    await cliquer('[data-collaborateurs-aucun="location"]');
    expect(texte('[data-compteur-famille="location"]')).toBe('0/2');
    expect(texte('[data-note-couts-generaux]')).toMatch(/non déduits pour Location/);
    await cliquer('[data-collaborateurs-tout="location"]');
    expect(texte('[data-compteur-famille="location"]')).toBe('2/2');
    await cliquer('[data-collaborateurs-aucun="location"]');
    await cliquer('[data-reinitialiser-filtres]');
    expect(['vente', 'location', 'gestion'].map((a) => texte(`[data-compteur-famille="${a}"]`))).toEqual(['5/5', '2/2', '1/1']);
    expect(new URLSearchParams(window.location.search).get('g-exclus')).toBeNull();
  });
  it('« Coûts » : la liste des coûts (D25) reste dans les boutons d’activité', async () => {
    await ouvrirG('/?annee=2025&g-mesure=couts');
    expect(['vente', 'location', 'gestion'].map((a) => texte(`[data-compteur-famille="${a}"]`))).toEqual(['5/5', '7/7', '4/4']);
    await cliquer('[data-ouvrir-famille="vente"]');
    expect(graphe().querySelector('[data-liste-couts="vente"]')).not.toBeNull();
    expect(graphe().querySelector('[data-liste-collaborateurs]')).toBeNull();
  });
});
