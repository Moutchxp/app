// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccueilTransaction, AccueilVentes, EcranGestion, EcranGlobal, EcranSociete, syntheseGlobal, vueInitiale } from './EcransTransaction';
import { celluleGlobal, previsionnel } from '../../../../lib/transaction/modele';
import { existsSync, readFileSync } from 'node:fs';
import { ARIANE } from './FilAriane';
import type { DonneesSociete, LigneVente, Vente } from '../../../../lib/transaction/modele';

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
    sourceOnglet: 'MYLENE', sourceCellule: 'D3' }],
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
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';

describe('l’accueil de la tuile', () => {
  it('LOT L — trois cases : « Transaction », « Gestion », « CA global »', async () => {
    await act(async () => { root.render(createElement(AccueilTransaction)); });
    expect([...container.querySelectorAll('[data-tuile-transaction]')].map((a) => [a.querySelector('.loc-case-titre')!.textContent, a.getAttribute('href')]))
      .toEqual([['Transaction', '/admin/transaction/ventes'], ['Gestion', '/admin/transaction/gestion'], ['CA global', '/admin/transaction/global']]);
  });
  it('LOT L — « Transaction » : deux cases, « CRITERIMMO » et « MACJ », vers les écrans de toujours', async () => {
    await act(async () => { root.render(createElement(AccueilVentes)); });
    expect([...container.querySelectorAll('[data-tuile-transaction]')].map((a) => [a.querySelector('.loc-case-titre')!.textContent, a.getAttribute('href')]))
      .toEqual([['CRITERIMMO', '/admin/transaction/criterimmo'], ['MACJ', '/admin/transaction/macj']]);
  });
  it('LOT M — les deux cases se partagent toute la largeur (deux colonnes) ; l’accueil garde ses trois colonnes', async () => {
    await act(async () => { root.render(createElement(AccueilVentes)); });
    expect(container.querySelector('ul.loc-cases')!.className).toBe('loc-cases loc-cases--accueil loc-cases--deux');
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(AccueilTransaction)); });
    expect(container.querySelector('ul.loc-cases')!.className).toBe('loc-cases loc-cases--accueil');
  });
});

describe('une société — le mois', () => {
  it('le CA HT du mois, ses ventes, le résultat de l’agence ; le compromis et le « mois à confirmer » hors du mois', async () => {
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('9 187,50 €');
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-n1')).toContain('5 000 € en 2024');
    expect([...container.querySelectorAll('[data-bloc="ventes-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['1']);
    // 11 025 − 1 200 (rétrocession du mois) − 3 215 (paye de Mylène), ÷ 1,2.
    expect(texte('[data-reste-agence]')).toBe('5 508,33 €');
    expect(texte('[data-tuile="compromis"] .tdb-tuile-valeur')).toBe('20 833,33 €');
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
    await calmer();
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
  it('le CA global la compte une fois (le plus bas), dans aucune société', async () => {
    donneesGlobal.ventes = [...donneesGlobal.ventes, ...[dhibMacj, dhibCrit].map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois,
      honorairesTtc: v.honorairesTtc, libelle: v.libelle, double: v.double }))];
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer();
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
      ['gestion/page.tsx', '/admin/transaction', 'gestion'], ['global/page.tsx', '/admin/transaction', 'global']];
    for (const [f, retour, ariane] of pages) {
      const src = readFileSync(`${T}/${f}`, 'utf8');
      if (retour !== '') expect(src).toContain(`retour="${retour}"`);
      expect(src).toContain(`ARIANE.${ariane}`);
      expect(src).toContain('accesTransaction()');
    }
    expect(readFileSync('proxy.ts', 'utf8')).toContain("['/admin/transaction', 'transaction']");
    expect(ARIANE.criterimmo.map((e) => e.libelle)).toEqual(['Transaction', 'Transaction (ventes)', 'CRITERIMMO']);
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
    expect(texte('[data-annee-gestion="2025"] [data-mot="Honoraires"]')).toBe('14 127 €');
    await act(async () => { (container.querySelector('[data-saisir-gestion="2"]') as HTMLElement).click(); });
    expect(container.querySelector('[data-saisie-gestion]')).not.toBeNull();
    await act(async () => { (container.querySelector('[data-enregistrer-gestion]') as HTMLElement).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'gestion-enregistrer', annee: 2025, mois: 2 });
  });
  it('le CA global garde la gestion dans ses montants (même cellule), et renvoie vers « Gestion » pour la saisie', async () => {
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer();
    expect(texte('[data-mois-global="1"] [data-mot="Gestion"]')).toBe('14 127 €');
    expect(container.querySelector('[data-lien-gestion] a')!.getAttribute('href')).toBe('/admin/transaction/gestion?annee=2025');
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
    await calmer();
    expect([...container.querySelectorAll('[data-synthese]')].map((x) => x.getAttribute('data-synthese'))).toEqual(['criterimmo', 'macj', 'global']);
    expect(texte('[data-synthese="criterimmo"] [data-synthese-total]')).toBe('23 423,05 €');
    expect(texte('[data-synthese="global"] [data-synthese-total]')).toBe(texte('[data-total-annee] [data-mot="Total"]'));
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
      expect(texte('[data-reste-agence]')).toBe('8 187,50 €');
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
  const heididon = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, repartition: { retroApporteurTtc: 0, parties },
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: '2025-01-15', entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] },
    lignes: [{ ...ligne('Pierre Thevenin', 'negociateur', 1000), cote: 'sortie', origine: 'saisie' }] });

  it('CA global : CRITERIMMO 3 333,33 + MACJ 1 666,67 − 1 666,67 neutralisé = 3 333,33 HT, une seule fois ; la ligne « Inter-cabinet entre nos sociétés »', () => {
    const e = { ventes: [heididon], location: null, gestion: [] };
    const lignes = syntheseGlobal(e, 2025);
    expect(lignes.map((l) => l.cle)).toEqual(['criterimmo', 'macj', 'inter_cabinet', 'global']);
    const de = (cle: string) => lignes.find((l) => l.cle === cle)!;
    expect(de('inter_cabinet').libelle.replace(/\s/g, ' ')).toBe('Inter-cabinet entre nos sociétés : 1 666,67 € (neutralisé)');
    expect(de('criterimmo').totalHt).toBeCloseTo(4000 / 1.2, 9);
    expect(de('macj').totalHt).toBeCloseTo(2000 / 1.2, 9);
    expect(de('global').totalHt).toBeCloseTo(4000 / 1.2, 9);
    expect(de('global').venteHt).toBeCloseTo(4000 / 1.2, 9);
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
      expect(texte('[data-reste-agence]')).toBe('833,33 €');
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
      expect(texte('[data-vente="38"] [data-contenu-replie]')).toContain('CA de CRITERIMMO (société porteuse)');
      expect(texte('[data-inter-cabinet-mois]')).toBe('1 666,67 €');
      // Reste : 3 333,33 − 1 666,67 ; Pierre (MACJ) n'est pas déduit chez CRITERIMMO
      expect(texte('[data-reste-agence]')).toBe('1 666,67 €');
      expect(texte('[data-paye-deduite]')).toBe('0 €');
    } finally { donnees.ventes = avant; donnees.societe = avantS; donnees.retrocessions = retros; }
  });
});

describe('🔴 LOT AY — « Espace par négociateur » : la colonne « CA généré HT » (commissions + part de l’agence rattachée)', () => {
  // HEIDIDON signée en janvier 2025 : CRITERIMMO (Arnaud, associé non commissionné, entrée — comme en recette) porte 4 000 TTC ; MACJ (Pierre,
  // indépendant) reçoit 50 % et touche 1 000 TTC.
  const parties = [
    { sorte: 'entree' as const, compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' as const, commissionne: false },
    { sorte: 'sortie' as const, compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const }];
  const heididon = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, repartition: { retroApporteurTtc: 0, parties },
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: '2025-01-15', entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] },
    lignes: [{ ...ligne('Pierre Thevenin', 'negociateur', 1000), cote: 'sortie', origine: 'saisie' }] });
  const ouvrirEspace = async () => { await act(async () => { (container.querySelector('[data-bloc="negociateurs-mois"] button') as HTMLElement).click(); }); };

  it('CRITERIMMO : Arnaud (associé) — la part de l’agence de sa carte, 1 666,66 € HT (centimes du lot AH), rattachée à son CA ; le reste à l’agence ne change pas', async () => {
    const [avant, avantS, retros] = [donnees.ventes, donnees.societe, donnees.retrocessions];
    donnees.ventes = [heididon]; donnees.societe = 'criterimmo'; donnees.retrocessions = [];
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); });
      await calmer(); await ouvrirEspace();
      expect([...container.querySelectorAll('[data-table-negociateurs] thead th')].map((x) => x.textContent))
        .toEqual(['Négociateur', 'Statut', 'Ventes', 'CA HT porté', 'Paye HT', 'CA généré HT', 'Rétrocessions HT']);
      expect(texte('[data-ca-genere="Arnaud Jorel"]')).toBe('1 666,66 €'); // LOT BA : la part de l'entrée au centime du lot AH (celle de la Répartition)
      expect(texte('[data-ca-genere="Pierre Thevenin"]')).toBe('0 €');
      expect(texte('[data-reste-agence]')).toBe('1 666,67 €');
    } finally { donnees.ventes = avant; donnees.societe = avantS; donnees.retrocessions = retros; }
  });

  it('MACJ (ligne miroir) : Pierre (indépendant) — sa commission seule (833,33 € HT) ; aucune part rattachée', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const [avant, retros] = [donnees.ventes, donnees.retrocessions];
    donnees.ventes = [venteDansSociete(heididon, 'macj')!]; donnees.retrocessions = [];
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=1');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
      await calmer(); await ouvrirEspace();
      expect(texte('[data-ca-genere="Pierre Thevenin"]')).toBe('833,33 €');
      expect(texte('[data-reste-agence]')).toBe('833,33 €');
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
    const vendu = M.caHtParMois(v, 2025, 'macj'); const comp = M.caHtCompromisParMois(v, 2025, 'macj'); const tous = M.caHtParMoisMode(v, 2025, 'macj', 'tous');
    expect(M.caHtParMoisMode(v, 2025, 'macj', 'vendu')).toEqual(vendu);
    // 🔴 LOT BT — « tous » = vendu + compromis EN COURS seulement (la 12, passée en acte en mars, n'y compte qu'en mars, dans le vendu).
    const enCours = Array.from({ length: 12 }, (_, i) => M.compromisEnCoursDuMois(v, 2025, i + 1).reduce((t, x) => t + M.caHt(x, 'macj'), 0));
    for (let i = 0; i < 12; i++) expect(tous[i]).toBe(vendu[i] + enCours[i]);
    expect([comp[0], enCours[0], vendu[0], vendu[2]]).toEqual([9600 / 1.2, 6000 / 1.2, 11025 / 1.2, 3600 / 1.2]);
    expect(M.nombreParMoisMode(v, 2025, 'tous').slice(0, 3)).toEqual([2, 1, 1]);
    const d = { ...donnees, ventes: v };
    const T = M.totauxMoisMode(d, 2025, 1, 'tous'); const Tv = M.totauxMois(d, 2025, 1);
    const Tc = M.totaux(M.compromisEnCoursDuMois(v, 2025, 1), [], 'macj', undefined);
    expect([T.caHt, T.nbVentes, T.resteHt]).toEqual([Tv.caHt + Tc.caHt, Tv.nbVentes + Tc.nbVentes, Tv.resteHt + Tc.resteHt]);
    expect(M.totauxMoisMode(d, 2025, 1, 'vendu')).toEqual(Tv);
  });

  it('par défaut « Vendu » : l’écran d’avant au centime ; le sélecteur à trois positions dans la barre des filtres', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('[data-filtre="mode"] [data-mode-mois]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]))
      .toEqual([['Vendu', 'true'], ['Compromis', 'false'], ['Vendu + compromis', 'false']]);
    expect(container.querySelector('[data-filtre="mode"]')!.closest('form.tdb-filtres')).not.toBeNull();
    expect(tuile('ca-mois')).toEqual(['CA HT — janvier', '9 187,50 €', '5 000 € en 2024 (+83,8 %)']);
    expect(tuile('ventes-mois')).toEqual(['Ventes — janvier', '1', '1 en 2024']);
    expect(texte('[data-reste-agence]')).toBe('5 508,33 €');
    expect(container.querySelector('[data-compromis-sans-date]')).toBeNull();
    expect(container.querySelector('[data-bloc="compromis-du-mois"]')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('mode')).toBe('vendu');
  });

  it('« Compromis » : à la date du compromis, annulé exclu ; N−1 dans le même mode ; « N compromis sans date — non placés dans un mois » ; la liste du mois', async () => {
    await ouvrir();
    await cliquer('[data-mode-mois="compromis"]');
    expect(tuile('ca-mois')).toEqual(['CA HT des compromis — janvier', '8 000 €', '1 000 € en 2024 (+700 %)']);
    expect(tuile('ventes-mois')).toEqual(['Compromis — janvier', '2', '1 en 2024']);
    expect(tuile('cumul')[0]).toBe('CA des compromis cumulé 2025 (à fin janvier)');
    expect(texte('[data-compromis-sans-date]')).toBe('2 compromis sans date — non placés dans un mois (22 833,33 € HT)');
    expect([...container.querySelectorAll('[data-bloc="compromis-du-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['11', '12']);
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
    expect([...container.querySelectorAll('[data-histo-detail] [data-bulle-bloc="courant"] .tdb-bulle-ligne')].map((p) => p.textContent!.replace(/\s/g, ' ')))
      .toEqual(['Vendu9 187,50 €', 'Compromis5 000,00 €', 'Total HT14 187,50 € (17 025,00 € TTC)', 'Ventes + compromis2']);
    expect(container.querySelector('[data-legende-empile]')).not.toBeNull();
  });

  it('les onglets « CA | Nombre de ventes » (Compromis : « Nombre de compromis » ; combiné : « Nombre ») et le bouton « ⇄ Mensuel » de la Location ; en nombre : l’axe entier et l’encart en nombre', async () => {
    await ouvrir();
    const onglets = () => [...container.querySelectorAll('[data-bloc="histogramme-mois"] [data-mesure-bouton]')].map((b) => b.textContent);
    expect(onglets()).toEqual(['CA', 'Nombre de ventes']);
    expect(container.querySelector('[data-bloc="histogramme-mois"] [data-cumul-bouton]')!.textContent).toBe('⇄Mensuel');
    await cliquer('[data-mode-mois="compromis"]');
    expect(onglets()).toEqual(['CA', 'Nombre de compromis']);
    await cliquer('[data-mesure-bouton="nombre"]');
    expect(texte('[data-histo-detail] [data-bulle-bloc="courant"]')).toBe('2025Compromis2');
    expect(texte('[data-histo-detail] [data-bulle-bloc="n1"]')).toBe('2024Compromis1');
    expect(new URLSearchParams(window.location.search).get('mesure')).toBe('nombre');
    await cliquer('[data-mode-mois="tous"]');
    expect(onglets()).toEqual(['CA', 'Nombre']);
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
    const h = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, statut: 'compromis', mois: null, dateCompromis: '2025-01-12', repartition: { retroApporteurTtc: 0, parties },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] } });
    const M = await import('../../../../lib/transaction/modele');
    expect(M.caHtParMoisMode([h], 2025, 'criterimmo', 'compromis')[0]).toBeCloseTo(4000 / 1.2, 9);
    expect(M.caHtParMoisMode([venteDansSociete(h, 'macj')!], 2025, 'macj', 'compromis')[0]).toBeCloseTo(2000 / 1.2, 9);
  });

  it('le CA global n’a pas d’écran « Le mois » : pas de sélecteur de mode (ses tableaux ne changent pas)', async () => {
    window.history.replaceState(null, '', '/?annee=2025');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    expect(container.querySelector('[data-filtre="mode"]')).toBeNull();
    expect(container.querySelector('[data-table-global]')).not.toBeNull();
  });

  it('la Location ne change pas : sans `mesures`, l’en-tête garde CA · Baux · Gestion ; sans `empile`, une barre simple', async () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx', 'utf8');
    expect(src).toContain("(mesures ?? (MESURES_MOIS as unknown as readonly { cle: M; mot: string }[]))");
    expect(src).toContain('{b.valeur !== null && (b.empile !== undefined');
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
    const tous = M.caHtParMoisMode(ventes, 2025, 'macj', 'tous');
    expect([tous[9], tous[11]]).toEqual([6000 / 1.2, 12000 / 1.2]);
    expect(M.nombreParMoisMode(ventes, 2025, 'tous').reduce((a, b) => a + b, 0)).toBe(2);
    const n1 = M.caHtParMoisMode(ventes, 2024, 'macj', 'tous');
    expect([n1[9], n1[11]]).toEqual([1200 / 1.2, 2400 / 1.2]);
    const ids = Array.from({ length: 12 }, (_, i) => [...M.ventesDuMois(ventes, 2025, i + 1), ...M.compromisDuMode(ventes, 2025, i + 1, 'tous')].map((x) => x.id)).flat();
    expect(ids.sort()).toEqual([21, 22]);
  });
  it('le mode « Compromis » ne change pas (l’affaire signée compte au mois de son compromis) ; le mode « Vendu » non plus, au centime', async () => {
    const M = await import('../../../../lib/transaction/modele');
    expect(M.caHtParMoisMode(ventes, 2025, 'macj', 'compromis')[9]).toBe(18000 / 1.2);
    expect(M.compromisDuMode(ventes, 2025, 10, 'compromis').map((x) => x.id)).toEqual([21, 22]);
    expect(M.caHtParMoisMode(ventes, 2025, 'macj', 'vendu')).toEqual(M.caHtParMois(ventes, 2025, 'macj'));
    const d = { ...donnees, ventes, retrocessions: [] };
    expect(M.totauxMoisMode(d, 2025, 12, 'vendu')).toEqual(M.totauxMois(d, 2025, 12));
  });
  it('l’écran : la règle dite sous le sélecteur ; « Les compromis en cours du mois » en mode combiné', async () => {
    const avant = donnees.ventes; donnees.ventes = ventes;
    try {
      window.history.replaceState(null, '', '/?vue=mois&annee=2025&mois=10&mode=tous');
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
      expect(texte('[data-regle-mode]')).toBe('Vendu + compromis : chaque affaire n’est comptée qu’une fois — à la date de l’acte si elle est signée, sinon à la date du compromis.');
      expect(texte('#trx-compromis-mois')).toContain('Les compromis en cours du mois — octobre 2025');
      expect([...container.querySelectorAll('[data-bloc="compromis-du-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['22']);
      expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('5 000 €');
    } finally { donnees.ventes = avant; }
  });
});

describe('🔴 LOT BU — « Le mois » : chaque vente se déplie sur LA fiche de l’onglet Compromis ; colonne « Négociateur » (entrée)', () => {
  const parties = [
    { sorte: 'entree' as const, compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' as const },
    { sorte: 'sortie' as const, compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const }];
  const complete = vente(38, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null,
    repartition: { retroApporteurTtc: 0, parties }, prixVente: 160000, dateCompromis: '2024-12-10',
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
    expect(texte('[data-reste-agence]')).toBe('5 508,33 €');
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
    repartition: { retroApporteurTtc: 333.33, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 33), partie('sortie', 9, 'Cédric JULLIEN', 'criterimmo', 67)] },
    dossier: dossier([5, 'Jean-Baptiste PONS'], [9, 'Cédric JULLIEN']) });
  // Inter-cabinet : l'entrée chez CRITERIMMO (porteuse), la sortie chez MACJ.
  const ic = vente(51, { societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null,
    repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 8, 'Pierre THEVENIN', 'macj', 50)] },
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
      expect(texte('[data-tuile="ca-periode"] .tdb-tuile-mot')).toContain('CA TTC');
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
      expect([...container.querySelector('[data-bloc="ventes-mois"] .trx-entete-gauche')!.children].map((x) => x.textContent)).toEqual(['Les ventes du mois — janvier 2025', '(2)']);
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
    const retro = { id: 77, societe: 'criterimmo' as const, annee: 2025, mois: 1, negociateur: 'Jean-Baptiste PONS', montantTtc: 600, apporteur: 'M. Durand', venteId: 50, libelle: null, origine: 'saisie' as const, sourceOnglet: null, sourceCellule: null };
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
    const retro = { id: 78, societe: 'criterimmo' as const, annee: 2025, mois: 1, negociateur: 'CEDRIC', montantTtc: 3333, apporteur: null, venteId: 60, libelle: null, origine: 'import' as const, sourceOnglet: 'CEDRIC', sourceCellule: 'J3' };
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
});
