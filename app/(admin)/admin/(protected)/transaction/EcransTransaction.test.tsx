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
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-n1')).toContain('5 000,00 € en 2024');
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
    expect(l2025.querySelector('[data-mot="CA HT"]')?.textContent?.replace(/\s/g, ' ')).toBe('27 750,00 €');
    expect(l2025.querySelector('[data-mot="dont mois à confirmer"]')?.textContent?.replace(/\s/g, ' ')).toBe('5 000,00 €');
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
    expect(cel('Gestion')).toBe('14 127,00 €');
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
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('0,00 €');
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
    expect(texte('[data-mois-global="3"] [data-mot="Vente MACJ"]')).toBe('0,00 €');
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
    expect(texte('[data-gestion-honoraires="1"]')).toBe('14 127,00 €');
    const janvier = container.querySelector('[data-mois-gestion="1"]')!;
    expect(janvier.querySelector('[data-mot="ADHOC"]')!.textContent!.replace(/\s/g, ' ')).toBe('6 437,00 €');
    expect(janvier.querySelector('[data-mot="Reste"]')!.textContent!.replace(/\s/g, ' ')).toBe('7 690,00 €');
    expect(texte('[data-annee-gestion="2025"] [data-mot="Honoraires"]')).toBe('14 127,00 €');
    await act(async () => { (container.querySelector('[data-saisir-gestion="2"]') as HTMLElement).click(); });
    expect(container.querySelector('[data-saisie-gestion]')).not.toBeNull();
    await act(async () => { (container.querySelector('[data-enregistrer-gestion]') as HTMLElement).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'gestion-enregistrer', annee: 2025, mois: 2 });
  });
  it('le CA global garde la gestion dans ses montants (même cellule), et renvoie vers « Gestion » pour la saisie', async () => {
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer();
    expect(texte('[data-mois-global="1"] [data-mot="Gestion"]')).toBe('14 127,00 €');
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
      expect(texte('[data-paye-deduite]')).toBe('0,00 €');
      expect(texte('[data-internes-non-deduits]')).toBe('2 679,17 €');
      expect(texte('[data-paye-non-deduite="1"]')).toBe('dont 3 215,00 € non déduite (interne)');
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
      const row = '[data-table-ventes] [data-vente="38"]';
      expect(texte(`${row} th`)).toContain('HEIDIDON — inter-cabinet reçu de CRITERIMMO');
      expect(texte(`${row} [data-mot="Honoraires TTC"]`)).toBe('2 000,00 €');
      expect(texte(row)).not.toContain('4 000');
      expect(container.querySelector(`${row} [data-modifier-vente]`)).toBeNull();
      expect(container.querySelector(`${row} [data-voir-origine="38"]`)!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=38');
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
      expect(texte('[data-table-ventes] [data-vente="38"] [data-part-vente]')).toBe('CA de la vente (CRITERIMMO) : 3 333,33 € · dont reversé en inter-cabinet : 1 666,67 €');
      expect(texte('[data-inter-cabinet-mois]')).toBe('1 666,67 €');
      // Reste : 3 333,33 − 1 666,67 ; Pierre (MACJ) n'est pas déduit chez CRITERIMMO
      expect(texte('[data-reste-agence]')).toBe('1 666,67 €');
      expect(texte('[data-paye-deduite]')).toBe('0,00 €');
    } finally { donnees.ventes = avant; donnees.societe = avantS; donnees.retrocessions = retros; }
  });
});
