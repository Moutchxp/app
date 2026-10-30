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
    expect(l2025.querySelector('[data-mot="CA HT"]')?.textContent?.replace(/\s/g, ' ')).toBe('27 750 €');
    expect(l2025.querySelector('[data-mot="dont mois à confirmer"]')?.textContent?.replace(/\s/g, ' ')).toBe('5 000 €');
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
      expect(texte('[data-paye-non-deduite="1"]')).toBe('dont 3 215 € non déduite (interne)');
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
      expect(texte(`${row} [data-mot="Honoraires TTC"]`)).toBe('2 000 €');
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
      .toEqual(['Vendu9 187,50 €', 'Compromis5 000,00 €', 'Total HT14 187,50 €', 'Ventes + compromis2']);
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
      expect([...container.querySelectorAll('[data-bloc="ventes-mois"] thead th')].map((x) => x.textContent)[1]).toBe('Négociateur');
      expect(texte('[data-vente="38"] [data-negociateur-entree]')).toBe('Arnaud Jorel');
      expect(texte('[data-vente="1"] [data-negociateur-entree]')).toBe('MYLENE, CEDRIC');
      const b = container.querySelector('[data-deplier-vente="38"]')!;
      expect([b.getAttribute('aria-expanded'), b.querySelector('svg[data-triangle]')?.getAttribute('data-triangle')]).toEqual(['false', 'replie']);
      const ca = texte('[data-tuile="ca-mois"] .tdb-tuile-valeur');
      await cliquer('[data-deplier-vente="38"]');
      expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe(ca);
    } finally { fin(); }
  });

  it('déplier (triangle ou ligne) / replier ; plusieurs à la fois ; la fiche est celle de l’onglet Compromis (Vendeurs | Acquéreurs, informations communes, répartition, actions)', async () => {
    const fin = await ouvrirMois([complete, donnees.ventes[0]]);
    try {
      await cliquer('[data-deplier-vente="38"]');
      const f = '[data-fiche-vente="38"]';
      expect(container.querySelector('[data-deplier-vente="38"]')!.getAttribute('aria-expanded')).toBe('true');
      expect([...container.querySelectorAll(`${f} [data-colonne]`)].map((x) => x.getAttribute('data-colonne'))).toEqual(['vendeur', 'acquereur']);
      for (const sel of ['[data-informations-communes]', '[data-repartition-compromis]', '[data-modifier-compromis="38"]', '[data-base-resultat="entree"]'])
        expect([sel, container.querySelector(`${f} ${sel}`) !== null]).toEqual([sel, true]);
      expect(texte(`${f} [data-honoraires-cote="entree"] .trx-calcul-mot`)).toBe('Honoraires nets partie vendeur');
      expect(texte(`${f} [data-info="prix"] dd`)).toBe('160 000 €');
      // vendue : ni « Acte signé » ni « Annulation »
      expect([container.querySelector(`${f} [data-acte-signe]`), container.querySelector(`${f} [data-annulation-compromis]`)]).toEqual([null, null]);
      // un clic sur la LIGNE (hors boutons) ouvre la seconde : deux à la fois
      await act(async () => { (container.querySelector('[data-vente="1"] [data-mot="Honoraires TTC"]') as HTMLElement).click(); }); await calmer();
      expect([...container.querySelectorAll('[data-fiche-vente]')].map((x) => x.getAttribute('data-fiche-vente'))).toEqual(['38', '1']);
      await cliquer('[data-deplier-vente="38"]');
      expect([...container.querySelectorAll('[data-fiche-vente]')].map((x) => x.getAttribute('data-fiche-vente'))).toEqual(['1']);
      const src = (await import('node:fs')).readFileSync('app/(admin)/admin/(protected)/transaction/OngletCompromis.tsx', 'utf8');
      expect(src).toContain('<DetailAffaire v={v} hote={hote} />');
    } finally { fin(); }
  });

  it('une vente importée incomplète : la fiche s’ouvre sans erreur, « à renseigner » ; l’étiquette « import » et la source restent sur la ligne', async () => {
    const fin = await ouvrirMois([donnees.ventes[0]]);
    try {
      await cliquer('[data-deplier-vente="1"]');
      expect(texte('[data-vente="1"] th')).toContain('import');
      expect(texte('[data-vente="1"] th')).toContain('TABLEAU DE BORD MACJ 2025.xlsx › MYLENE › ligne 1');
      expect(texte('[data-fiche-vente="1"]')).toContain('à renseigner');
      expect(container.querySelector('[data-fiche-vente="1"] [data-colonne="vendeur"]')).not.toBeNull();
    } finally { fin(); }
  });

  it('inter-cabinet : la ligne miroir de MACJ se déplie sur la fiche miroir (part reçue, vente d’origine)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const fin = await ouvrirMois([venteDansSociete(complete, 'macj')!], 'macj');
    try {
      expect(texte('[data-vente="38"] [data-negociateur-entree]')).toBe('Arnaud Jorel');
      await cliquer('[data-deplier-vente="38"]');
      expect(container.querySelector('[data-fiche-vente="38"] [data-miroir-bloc]')).not.toBeNull();
      expect(container.querySelector('[data-fiche-vente="38"] [data-voir-origine="38"]')!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=38');
    } finally { fin(); }
  });

  it('mode « Compromis » et « Vendu + compromis » : les compromis du mois se déplient aussi, avec « Acte signé »', async () => {
    const comp = { ...complete, id: 40, statut: 'compromis' as const, mois: null, dateCompromis: '2025-01-12' };
    const fin = await ouvrirMois([complete, comp], 'criterimmo', '/?vue=mois&annee=2025&mois=1&mode=tous');
    try {
      await cliquer('[data-bloc="compromis-du-mois"] [data-deplier-vente="40"]');
      expect(container.querySelector('[data-fiche-vente="40"] [data-acte-signe="40"]')).not.toBeNull();
      expect(texte('[data-bloc="compromis-du-mois"] thead')).toContain('Négociateur');
    } finally { fin(); }
  });

  it('HT et TTC : la fiche suit l’unité retenue (sélecteur de l’onglet Compromis)', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    const fin = await ouvrirMois([complete]);
    try {
      await cliquer('[data-deplier-vente="38"]');
      expect(texte('[data-fiche-vente="38"] [data-honoraires-cote="entree"]')).toContain('€ HT');
      expect(texte('[data-fiche-vente="38"] [data-honoraires-cote="entree"]').indexOf('HT')).toBeLessThan(texte('[data-fiche-vente="38"] [data-honoraires-cote="entree"]').indexOf('TTC'));
    } finally { fin(); }
  });

  it('une modification faite dans la fiche relit l’écran (ligne, tuiles, graphique, résultat) sans recharger', async () => {
    const fin = await ouvrirMois([complete]);
    try {
      await cliquer('[data-deplier-vente="38"]');
      await cliquer('[data-fiche-vente="38"] [data-modifier-compromis="38"]');
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
      await cliquer('[data-deplier-vente="38"]');
      expect((container.querySelector('[data-fiche-vente="38"] [data-modifier-compromis="38"]') as HTMLButtonElement).disabled).toBe(true);
      const { ecritureRefuseeObservateur } = await import('../../../../lib/admin/observateur');
      expect(ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/transaction')).toBe(true);
    } finally { fin(); }
  });
});
