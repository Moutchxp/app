// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴 Arno (06/11/2026) — LA CARTE DE « MON ESPACE » d'une affaire tenue des DEUX côtés : une seule présentation (côté vendeurs), aucun montant négatif,
 * les montants recoupent la ligne de synthèse ; les affaires à UN côté, PARTAGÉES avec un collègue, et la tuile Suivi CA : EXACTEMENT comme avant
 * (le même HTML que sans la présentation commune). Routes simulées : rien n'est écrit. Données fictives.
 */
let sansFusion = false;
vi.mock('../../../../lib/transaction/deuxCotes', async (orig) => {
  const m = await orig<typeof import('../../../../lib/transaction/deuxCotes')>();
  return { ...m, fusionDeuxCotes: (...a: Parameters<typeof m.fusionDeuxCotes>) => (sansFusion ? null : m.fusionDeuxCotes(...a)) };
});
const { MesCompteurs } = await import('./MesCompteurs');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const vide = { nb: 0, ids: [] as number[], ca: { htC: 0, ttcC: 0 } };
const P = (sorte: string, compteId: number, negociateur: string, pourcentage: number) => ({ sorte, compteId, negociateur, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage, montantHt: null });
const L = (cote: string, negociateur: string, montantTtc: number, mode = 'calculee') => ({ id: cote === 'entree' ? 1 : 2, negociateur, role: 'negociateur', cote, montantTtc, montantHt: null, taux: 50, mode,
  nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
const LEA = { id: 5, nom: 'Léa MARTIN' };
const MARC = { id: 7, nom: 'Marc DURAND' };
const affaire = (id: number, parties: unknown[], lignes: unknown[], entree: typeof LEA | null, sortie: typeof LEA | null, mesCotes: string[]) => ({
  id, societe: 'criterimmo', libelle: `AFFAIRE ${id}`, honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-11-06', apporteur: null, note: null,
  origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, numeroMandat: `M-${id}`, prixVente: 300000,
  repartition: { retroApporteurTtc: 0, parties }, lignes,
  dossier: { adresseBien: '4 rue Fictive', dateActePrevue: null, dateActe: null, entree, sortie, apporteurId: null,
    personnes: [{ id: 1, role: 'vendeur', nom: 'DUPONT', telephone: '06', email: null, adresse: null }, { id: 2, role: 'acquereur', nom: 'MARTIN', telephone: null, email: 'p@x.fr', adresse: null }] },
  mesCotes, commissionsRetirees: false });
let ventes: unknown[] = [];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); sansFusion = false;
  try { window.localStorage.setItem('trx-affichage-montants', 'ttc'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, aujourdhui: '2026-11-06',
    titulaire: { id: 5, prenom: 'Léa', administrateur: false }, ventes, schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true },
    compteurs: { compromis: { nb: ventes.length, ids: (ventes as { id: number }[]).map((v) => v.id), ca: { htC: 0, ttcC: 0 } }, actees: { ...vide, annee: 2026 }, parAnnee: [] } } }) })) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const deplier = async (id: number) => {
  const b = container.querySelector(`[data-ma-vente="${id}"] summary, [data-ma-vente="${id}"] button`) as HTMLElement;
  await act(async () => { b.click(); }); await calmer();
};
const rendre = async (id: number) => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await deplier(id); };
const carte = (id: number) => container.querySelector(`[data-ma-vente="${id}"]`)!;
const texte = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** Le HTML de la carte dépliée, avec puis sans la présentation commune. */
const htmlAvecEtSans = async (id: number): Promise<[string, string]> => {
  await rendre(id); const avec = carte(id).innerHTML;
  act(() => { root.unmount(); }); root = createRoot(container); sansFusion = true;
  await rendre(id); const sans = carte(id).innerHTML;
  return [avec, sans];
};

describe('🔴 une affaire tenue des DEUX côtés (moi à l’entrée et à la sortie)', () => {
  it('forme enregistrée (100 % / 0) : l’affaire entière côté vendeurs, une mention côté acquéreurs ; montants = synthèse ; aucun négatif', async () => {
    ventes = [affaire(40, [P('entree', 5, LEA.nom, 100)], [L('entree', LEA.nom, 6000), L('sortie', LEA.nom, 0)], LEA, LEA, ['entree', 'sortie'])];
    await rendre(40);
    const c = carte(40);
    expect(texte(c.querySelector('[data-deux-cotes="principal"] [data-honoraires-cote]'))).toContain('Honoraires nets de l’affaire (vendeurs et acquéreurs)');
    expect(texte(c.querySelector('[data-deux-cotes="principal"] [data-honoraires-cote]'))).toContain('12 000');
    expect(texte(c.querySelector('[data-part-agence]'))).toContain('6 000');
    expect(texte(c.querySelector('[data-commission-deux-cotes]'))).toContain('6 000');
    expect(c.querySelector('[data-deux-cotes="secondaire"] [data-mention-deux-cotes]')).not.toBeNull();
    expect(c.querySelectorAll('[data-ventilation="sortie"], [data-commission-negociateur]')).toHaveLength(0);
    // Un montant négatif s'écrit « -1 500 € » (le signe collé) ; « − » entouré d'espaces est l'opération, « M-40 » le n° de mandat.
    expect(c.textContent).not.toMatch(/(?<![A-Z])-\s?\d/);
  });
  it('une commission saisie à la main du côté à 0 % : comptée une fois, part de l’agence 4 500 (et non −1 500), la com négo de la synthèse', async () => {
    ventes = [affaire(41, [P('entree', 5, LEA.nom, 100)], [L('entree', LEA.nom, 6000), L('sortie', LEA.nom, 1500, 'manuelle')], LEA, LEA, ['entree', 'sortie'])];
    await rendre(41);
    const c = carte(41);
    expect(texte(c.querySelector('[data-part-agence]'))).toContain('4 500');
    expect(texte(c.querySelector('[data-commission-deux-cotes]'))).toContain('7 500');
    expect(texte(c)).toContain('com négo 7 500');
    expect(c.textContent).not.toMatch(/(?<![A-Z])-\s?\d/);
  });
});

describe('🔴 les autres affaires : EXACTEMENT comme avant (le même HTML)', () => {
  it('un seul côté (moi à l’entrée, sortie à pourvoir)', async () => {
    ventes = [affaire(50, [P('entree', 5, LEA.nom, 100)], [L('entree', LEA.nom, 6000)], LEA, null, ['entree'])];
    const [avec, sans] = await htmlAvecEtSans(50);
    expect(avec).toBe(sans);
    expect(avec).not.toContain('data-deux-cotes');
  });
  it('partagée avec un collègue (moi à l’entrée, Marc à la sortie)', async () => {
    ventes = [affaire(51, [P('entree', 5, LEA.nom, 50), P('sortie', 7, MARC.nom, 50)], [L('entree', LEA.nom, 3000)], LEA, MARC, ['entree'])];
    const [avec, sans] = await htmlAvecEtSans(51);
    expect(avec).toBe(sans);
    expect(avec).not.toContain('data-deux-cotes');
  });
});

describe('🔴 avant ce lot : le montant négatif constaté (la carte sans la présentation commune)', () => {
  it('commission saisie à la main du côté à 0 % : « Part de l’agence » à -1 500 € — ce que la présentation commune supprime', async () => {
    ventes = [affaire(42, [P('entree', 5, LEA.nom, 100)], [L('entree', LEA.nom, 6000), L('sortie', LEA.nom, 1500, 'manuelle')], LEA, LEA, ['entree', 'sortie'])];
    sansFusion = true;
    await rendre(42);
    expect(carte(42).textContent).toMatch(/(?<![A-Z])-\s?1\s?500/);
  });
});
