// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cumulApporteur, totauxApporteurs, type ActiviteCalcul } from '../../../../lib/location/suivi/tableauBord';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — LA CARTE D'APPORTEUR : la ligne de totaux (« Dû à l'apporteur HT » ; « Dû au collègue HT » seulement s'il n'est
 * pas nul ; « Net agence HT » toujours, en dernier, = la ligne « Depuis le début » du Cumul au centime) ; une carte = un bloc délimité ;
 * les 4 boutons centrés. Les chiffres viennent des VRAIES fonctions de calcul, sur des données fictives ; routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const n = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const JOUR = '2026-10-24';
const dossier = (o: Partial<ActiviteCalcul>): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2025-06-10', libelleProprietaire: 'MARTIN Paul', libelleLocataire: 'DURAND Léa', honoProprietaireHt: 600, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: false, categoriePrime: 'logement', apporteurId: 4, apporteurNom: null, apporteurTaux: null, commissionSaisie: null,
  negociateurId: 3, negociateurLibelle: 'Paul Collègue', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', ...o,
});
const COLLEGUE = [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }];
// Externe dont le collègue est RÉMUNÉRÉ (récurrent sur la gestion : des montants qui ne tombent pas rond, sur plusieurs années).
const REMUNERE: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa',
  baremes: [{ depuis: '2020-01-01', taux: 1 / 3, mode: 'recurrent', tauxGestion: 0.17, dureeAnnees: 2, ordre: 1 }], collegues: COLLEGUE,
  remunerations: [{ depuis: '2020-01-01', remunere: true, mode: 'recurrent', taux: 0.07, tauxGestion: 0.03, dureeAnnees: null }] };
// Externe dont le collègue n'est PAS rémunéré ; un « à rattacher ».
const SANS: Apporteur = { id: 6, nom: 'Hugo Exemple', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Exemple', prenom: 'Hugo',
  baremes: [{ depuis: '2020-01-01', taux: 0.1, mode: 'one_shot', tauxGestion: 0, ordre: 2 }], collegues: COLLEGUE, remunerations: [] };
const ORPHELIN: Apporteur = { id: 7, nom: 'Zoé Orpheline', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Orpheline', prenom: 'Zoé',
  baremes: [{ depuis: '2020-01-01', taux: 0.2, mode: 'one_shot', tauxGestion: 0, ordre: 3 }], collegues: [], remunerations: [] };
const APPORTEURS = [REMUNERE, SANS, ORPHELIN];
const DOSSIERS = [
  dossier({ id: 1, dateSignature: '2024-02-17', honoProprietaireHt: 777.77, honoLocataireHt: 333.33, avecGestion: true, loyerHc: 1234.57, charges: 98.76, tauxGestionBien: 6.85 }),
  dossier({ id: 2, dateSignature: '2025-09-03', honoProprietaireHt: 512.49, honoLocataireHt: 0.01, avecGestion: true, loyerHc: 987.65, charges: 43.21, tauxGestionBien: 7.13 }),
  dossier({ id: 3, apporteurId: 6, dateSignature: '2025-05-02', honoProprietaireHt: 1000, honoLocataireHt: 0 }),
  dossier({ id: 4, apporteurId: 7, dateSignature: '2025-05-02', honoProprietaireHt: 500, honoLocataireHt: 0 }),
];

describe('🔴 le calcul : le Cumul porte le dû au collègue, comme la carte', () => {
  it('cumulApporteur.total.collegue = totauxApporteurs.collegue ; somme des années = total', () => {
    const c = cumulApporteur(DOSSIERS, APPORTEURS, 4, JOUR);
    const t = totauxApporteurs(DOSSIERS, APPORTEURS, JOUR)[4];
    expect(t.collegue).toBeGreaterThan(0);
    expect(c.total.collegue).toBeCloseTo(t.collegue, 9);
    expect(c.parAnnee.reduce((s, y) => s + y.collegue, 0)).toBeCloseTo(t.collegue, 9);
  });
});

const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  const suivi = { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true, negociateurs: [], regles: [], retrocessions: [],
    collegues: [{ id: 5, libelle: 'Paul Collègue' }], apporteurs: APPORTEURS };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const id = Number(new URL(u, 'http://x').searchParams.get('id'));
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: JOUR, dossiers: DOSSIERS.filter((d) => d.apporteurId === id) } });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: cumulApporteur(DOSSIERS, APPORTEURS, id, JOUR) });
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: totauxApporteurs(DOSSIERS, APPORTEURS, JOUR) });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: JOUR, manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const annuaire = async () => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
};
const mots = (id: number) => [...container.querySelectorAll(`[data-totaux-ligne="${id}"] dt`)].map((x) => x.textContent);

describe('🔴 la ligne de totaux de la carte', () => {
  it('« Dû au collègue HT » seulement s’il n’est pas nul ; « Dû à l’apporteur HT » ; « Net agence HT » toujours, en dernier', async () => {
    await annuaire();
    expect(mots(4)).toEqual(['Dossiers', 'Honoraires HT', 'Dû à l’apporteur HT', 'Dû au collègue HT', 'Net agence HT']);
    expect(mots(6)).toEqual(['Dossiers', 'Honoraires HT', 'Dû à l’apporteur HT', 'Net agence HT']);   // collègue non rémunéré : 0 → masqué
    expect(mots(7)).toEqual(['Dossiers', 'Honoraires HT', 'Dû à l’apporteur HT', 'Net agence HT']);   // à rattacher
    expect(container.querySelector('[data-net-agence="6"]')?.className).toBe('plo-total-net');
    expect(n(container.querySelector('[data-net-agence="6"] dd')?.textContent)).toBe('900,00 €');
  });
  it('Net agence HT de la carte = « Depuis le début » du Cumul (tableau et pavé), au centime — collègue rémunéré compris', async () => {
    await annuaire();
    const carte = n(container.querySelector('[data-net-agence="4"] dd')?.textContent);
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    await calmer();
    const ligne = n(container.querySelector('[data-cumul-ligne="total"] [data-mot="Net agence HT"]')?.textContent);
    const pave = n(container.querySelector('[data-total-apporteur="net"] strong')?.textContent);
    expect(carte).toMatch(/^\d[\d ]*,\d\d €$/);
    expect([ligne, pave]).toEqual([carte, carte]);
    // Et c'est bien honoraires − apporteur − collègue, chacun arrondi au centime.
    const t = totauxApporteurs(DOSSIERS, APPORTEURS, JOUR)[4];
    const c = (x: number) => Math.round(x * 100);
    expect(carte).toBe(`${((c(t.ca) - c(t.commission) - c(t.collegue)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }).replace(/[  ]/g, ' ')} €`);
  });
});

describe('🔴 la carte est un bloc ; les 4 boutons centrés', () => {
  it('les styles : bordure, fond, coins, ombre et 24 px entre cartes (liste des apporteurs SEULE) ; boutons centrés, retour à la ligne', async () => {
    await annuaire();
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('').replace(/\s+/g, '');
    expect(css).toMatch(/\.plo-versions\[data-liste-apporteurs\]\{gap:24px[;}]/);
    expect(css).toMatch(/\.plo-versions\[data-liste-apporteurs\]>li\{border:1pxsolidvar\(--color-svv-line-strong\);border-radius:16px;background:var\(--color-svv-field\)[^}]*box-shadow:/);
    expect(css).toMatch(/\.plo-boutons-carte\{display:flex;flex-wrap:wrap;gap:8px;[^}]*justify-content:center\}/);
    // Le panneau ouvert est DANS la carte.
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    expect(container.querySelector('[data-apporteur="4"] [data-panneau="cumul"]')).not.toBeNull();
    // « À rattacher » : fond ambré, même bordure.
    expect(container.querySelector('[data-apporteur="7"]')?.className).toBe('plo-a-rattacher');
    expect(css).toMatch(/\.plo-versions\[data-liste-apporteurs\]>li\.plo-a-rattacher\{border-color:var\(--color-svv-line-strong\)!important;background:var\(--color-svv-amber-soft\)\}/);
  });
});

describe('🔴 Cumul : la colonne « Dû au collègue HT »', () => {
  const centimes = (t: string | null | undefined): number => Math.round(Number(n(t).replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const lignes = () => [...container.querySelectorAll('[data-cumul-apporteur] tbody tr[data-cumul-ligne]')];
  const cellule = (tr: Element, mot: string) => tr.querySelector(`[data-mot="${mot}"]`)?.textContent;
  it('entre « Dû à l’apporteur HT » et « Net agence HT » ; ligne par ligne : honoraires − apporteur − collègue = net, au centime', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    await calmer();
    expect([...container.querySelectorAll('[data-cumul-apporteur] thead th')].map((x) => x.textContent))
      .toEqual(['Période', 'Dossiers', 'Honoraires HT', 'Honoraires TTC', 'Dû à l’apporteur HT', 'Dû au collègue HT', 'Net agence HT']);
    expect(lignes().length).toBeGreaterThanOrEqual(3);   // « Depuis le début » + les années
    for (const tr of lignes()) {
      expect(cellule(tr, 'Dû au collègue HT')).toMatch(/€$/);
      expect(centimes(cellule(tr, 'Honoraires HT')) - centimes(cellule(tr, 'Dû à l’apporteur HT')) - centimes(cellule(tr, 'Dû au collègue HT')), tr.getAttribute('data-cumul-ligne') ?? '')
        .toBe(centimes(cellule(tr, 'Net agence HT')));
    }
    expect(centimes(cellule(lignes()[0], 'Dû au collègue HT'))).toBeGreaterThan(0);
  });
  it('un apporteur sans rémunération de collègue : « — »', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="6"][data-panneau-bouton="cumul"]')!);
    await calmer();
    expect(lignes().map((tr) => cellule(tr, 'Dû au collègue HT'))).toEqual(['—', '—']);
    expect(lignes().map((tr) => n(cellule(tr, 'Net agence HT')))).toEqual(['900,00 €', '900,00 €']);
  });
});

