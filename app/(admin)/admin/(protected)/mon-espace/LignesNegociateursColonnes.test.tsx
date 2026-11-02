// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteAffaire, type VuePersonnelle } from '../transaction/OngletCompromis';
import { FournisseurAffichage, FournisseurConsolide } from '../transaction/commun';
import type { LigneVente, Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 CORRECTIF (Arno, 02/11/2026) — LIGNES DE NÉGOCIATEUR : CHAQUE CÔTÉ SUR SA LIGNE, COLONNES ALIGNÉES, MÊME QUAND LA COMMISSION D'UN CÔTÉ EST
 * MASQUÉE (décision 2). Les lignes sont en `display:contents` dans une grille : chaque côté doit apporter LE MÊME NOMBRE de cellules, sinon les
 * cellules du côté suivant remontent sur sa ligne. Le côté masqué garde « com négo » et « reste » VIDES : aucun montant dans le HTML.
 * Cas : entrée masquée, sortie masquée, aucune masquée, les deux côtés à la même personne, inter-cabinet ; la tuile Suivi CA (sans vue
 * personnelle) : les mêmes cellules qu'avant. Données fictives (montants impairs, introuvables ailleurs dans la carte).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ligne = (o: Partial<LigneVente> & Pick<LigneVente, 'negociateur' | 'role'>): LigneVente => ({ id: 1, montantTtc: null, nature: 'vente', compte: true, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
type Partie = NonNullable<Vente['repartition']>['parties'][number];
const partie = (sorte: Partie['sorte'], compteId: number, negociateur: string, societe: 'criterimmo' | 'macj', pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: 'independant' } as Partie);
const vente = (parties: Partie[], lignes: LigneVente[]): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'TEST TRANSACTION', honorairesTtc: 12000, statut: 'compromis', annee: 2027,
  mois: null, dateCompromis: '2026-10-01', apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null,
  repartition: { retroApporteurTtc: 0, parties }, lignes,
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 7, nom: 'Cédric JULLIEN' }, sortie: { id: 5, nom: 'Arnaud JOREL' }, apporteurId: null, personnes: [] } });
const CEDRIC = ligne({ negociateur: 'Cédric JULLIEN', role: 'negociateur', cote: 'entree', montantTtc: 2345.67, taux: 41 });
const ARNO = ligne({ negociateur: 'Arnaud JOREL', role: 'negociateur', cote: 'sortie', montantTtc: 1111.11, taux: 23 });
const DEUX = [partie('entree', 7, 'Cédric JULLIEN', 'criterimmo', 50), partie('sortie', 5, 'Arnaud JOREL', 'criterimmo', 50)];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const rendre = (v: Vente, personnel?: VuePersonnelle) => act(() => {
  root.render(createElement(FournisseurAffichage, { value: 'ht' }, createElement(FournisseurConsolide, { value: true },
    createElement(CarteAffaire, { v, aujourdhui: '2026-11-02', vue: null, personnel, section: 'compromis' } as unknown as Parameters<typeof CarteAffaire>[0]))));
});
/** Le nombre de cellules de grille d'une ligne (une cellule « reversé à … » en couvre deux) ; et la suite des colonnes. */
const cellules = (l: Element) => [...l.children].reduce((t, c) => t + (c.classList.contains('trx-nego-col--double') ? 2 : 1), 0);
const lignes = () => [...container.querySelectorAll('[data-nego-ligne]')];

describe('🔴 chaque côté sur sa ligne, les mêmes colonnes', () => {
  it.each([
    ['entrée masquée (Cédric : commission retirée par le serveur)', [ARNO], { mesCotes: ['sortie'], commissionsRetirees: true } as VuePersonnelle, 'entree'],
    ['sortie masquée', [CEDRIC], { mesCotes: ['entree'], commissionsRetirees: true } as VuePersonnelle, 'sortie'],
  ])('%s : deux lignes, autant de cellules l’une que l’autre ; le côté masqué : com négo et reste VIDES', (_, ls, personnel, masque) => {
    rendre(vente(DEUX, ls), personnel);
    expect(lignes().map((l) => l.getAttribute('data-nego-ligne'))).toEqual(['entree', 'sortie']);
    const [a, b] = lignes();
    expect(cellules(a)).toBe(cellules(b));
    expect([...a.children].map((c) => c.getAttribute('data-col'))).toEqual([...b.children].map((c) => c.getAttribute('data-col')));
    const m = container.querySelector(`[data-nego-ligne="${masque}"]`)!;
    expect([...m.querySelectorAll('[data-nego-masque]')].map((c) => [c.getAttribute('data-col'), c.textContent])).toEqual([['4', ''], ['5', '']]);
    expect(m.querySelector('[data-nego-com]')).toBeNull();
    expect(m.querySelector('[data-nego-reste]')).toBeNull();
  });
  it('aucun montant de la commission masquée dans le HTML (2 345,67 TTC = 1 954,73 HT)', () => {
    rendre(vente(DEUX, [ARNO]), { mesCotes: ['sortie'], commissionsRetirees: true });
    expect(container.innerHTML).not.toMatch(/954,73|345,67|2345/);
    expect(container.innerHTML).not.toMatch(/41\s?%/);
  });
  it('aucun côté masqué : les cellules de la tuile Suivi CA, des montants partout, aucune cellule vide réservée', () => {
    rendre(vente(DEUX, [CEDRIC, ARNO]), { mesCotes: ['entree', 'sortie'], commissionsRetirees: false });
    expect(lignes().map(cellules)).toEqual([7, 7]);
    expect(container.querySelectorAll('[data-nego-com]').length).toBe(2);
    expect(container.querySelector('[data-nego-masque]')).toBeNull();
  });
  it('la tuile Suivi CA (sans vue personnelle) : exactement les mêmes cellules qu’avant le correctif', () => {
    rendre(vente(DEUX, [CEDRIC, ARNO]));
    const l = lignes();
    expect(l.map(cellules)).toEqual([7, 7]);
    expect([...l[0].children].map((c) => c.getAttribute('data-col') ?? c.className)).toEqual(['1', '6', '2', '3', '4', '5', 'trx-nego-extra']);
    expect(container.querySelector('[data-nego-masque]')).toBeNull();
  });
  it('les deux côtés à la même personne : chaque ligne a ses colonnes', () => {
    rendre(vente([partie('entree_sortie', 5, 'Arnaud JOREL', 'criterimmo', 100)], [ARNO]), { mesCotes: ['entree', 'sortie'], commissionsRetirees: false });
    const l = lignes();
    expect(l.length).toBeGreaterThanOrEqual(1);
    expect(new Set(l.map(cellules)).size).toBe(1);
  });
  it('inter-cabinet (CRITERIMMO / MACJ), un côté masqué : autant de cellules sur chaque ligne (« reversé à … » en couvre deux)', () => {
    rendre(vente([partie('entree', 7, 'Cédric JULLIEN', 'criterimmo', 60), partie('sortie', 5, 'Arnaud JOREL', 'macj', 40)], [ARNO]), { mesCotes: ['sortie'], commissionsRetirees: true });
    const l = lignes();
    expect(l.length).toBe(2);
    expect(cellules(l[0])).toBe(cellules(l[1]));
    expect(container.innerHTML).not.toMatch(/954,73|345,67/);
  });
  it('l’étiquette de la société : une seule ligne (aucune coupure), par la règle de la grille', async () => {
    const { CSS_TRANSACTION } = await import('../transaction/commun');
    expect(CSS_TRANSACTION.replace(/\s+/g, ' ')).toContain('.trx-carte-negos .trx-pastille-societe{white-space:nowrap;overflow-wrap:normal}');
    rendre(vente(DEUX, [ARNO]), { mesCotes: ['sortie'], commissionsRetirees: true });
    expect([...container.querySelectorAll('.trx-pastille-societe')].map((e) => e.textContent)).toEqual(['CRITERIMMO', 'CRITERIMMO']);
  });
});
