// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, trierMesCompromis, trierMesVentes, URL_MES_AFFAIRES } from './MesCompteurs';
import { CarteAffaire, DetailAffaire, type HoteDetail } from '../transaction/OngletCompromis';
import { FournisseurAffichage } from '../transaction/commun';
import type { LigneVente, Vente } from '../../../../lib/transaction/modele';
import type { VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';

/**
 * 🔴 MON ESPACE, LOTS 3 et 4 — l'accueil de l'espace, route simulée (rien n'est écrit) :
 *   · les deux compteurs (nombre — mon CA), cliquables : ils ouvrent leur onglet ; bascule « HT | TTC » ;
 *   · « Mes compromis en cours » / « Mes ventes » : EXACTEMENT les ventes comptées par le serveur, avec la carte et la fiche de la tuile Suivi CA ;
 *     la fiche dépliée sans la commission de l'autre collègue et sans aucun geste ; sélecteur d'année et total ;
 *   · NON-RÉGRESSION : les mêmes composants SANS l'option (la tuile Suivi CA) montrent toujours les commissions des deux côtés et leurs gestes ;
 *   · compte sans vente : zéro et des listes vides avec un message ; lecture impossible : un message.
 * Données fictives : Léa (compte 5, entrée) et Marc (compte 7, sortie) ; la réponse est celle que Léa reçoit (commission de Marc retirée).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ligne = (o: Partial<LigneVente> & Pick<LigneVente, 'negociateur' | 'role'>): LigneVente => ({ id: 1, montantTtc: null, nature: 'vente', compte: true, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const partagee = (o: Partial<Vente> = {}): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'DUPONT / MARTIN', honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null,
  dateCompromis: '2026-10-01', apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, numeroMandat: 'M-1',
  repartition: { retroApporteurTtc: 0, parties: [
    { sorte: 'entree', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' },
    { sorte: 'sortie', compteId: 7, negociateur: 'Marc DURAND', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] },
  dossier: { adresseBien: '1 rue A', dateActePrevue: '2027-01-15', dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 7, nom: 'Marc DURAND' }, apporteurId: null,
    personnes: [{ id: 3, role: 'vendeur', nom: 'DUPONT', telephone: null, email: null, adresse: null }] },
  lignes: [ligne({ negociateur: 'Léa MARTIN', role: 'negociateur', cote: 'entree', montantTtc: 1500, taux: 30 }),
    ligne({ negociateur: 'Marc DURAND', role: 'negociateur', cote: 'sortie', montantTtc: 2000, taux: 40 })], ...o });
// Ce que Léa reçoit : la ligne de Marc RETIRÉE par le serveur.
const pourLea = (v: Vente): VenteMonEspace => ({ ...v, lignes: v.lignes.filter((l) => l.negociateur !== 'Marc DURAND'), mesCotes: ['entree'], commissionsRetirees: true });
const c1 = pourLea(partagee());
const c2 = pourLea(partagee({ id: 2, libelle: 'PLUS RÉCENT', dateCompromis: '2026-10-20' }));
const vendue25 = pourLea(partagee({ id: 3, libelle: 'VENDUE 2025', statut: 'vendue', annee: 2025, mois: 6, dossier: { ...partagee().dossier!, dateActe: '2025-06-12' } }));
const vendue26 = pourLea(partagee({ id: 4, libelle: 'VENDUE 2026', statut: 'vendue', annee: 2026, mois: 3, dossier: { ...partagee().dossier!, dateActe: '2026-03-05' } }));
// Une vente reçue mais PAS comptée pour Léa (un administrateur reçoit tout) : jamais dans ses listes.
const pasAMoi: VenteMonEspace = { ...partagee({ id: 9, libelle: 'PAS À MOI' }), mesCotes: [], commissionsRetirees: false };
const compteur = (ids: number[], ht: number, annee?: number) => ({ nb: ids.length, ids, ca: { htC: ht, ttcC: ht * 1.2 }, ...(annee !== undefined ? { annee } : {}) });
const reponseLea = () => ({ etat: 'ok', data: { disponible: true, aujourdhui: '2026-11-02', titulaire: { id: 5, prenom: 'Léa', administrateur: false },
  ventes: [c1, c2, vendue25, vendue26, pasAMoi], schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true },
  nomsNegociateurs: {}, statutsNegociateurs: {},
  compteurs: { compromis: compteur([1, 2], 1000000), actees: compteur([4], 500000, 2026), parAnnee: [compteur([4], 500000, 2026), compteur([3], 500000, 2025)] } } });

let reponse: { status: number; corps: unknown };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); // l'adresse (?vue=…) que l'écran écrit, comme la Transaction : chaque épreuve repart de zéro
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    expect(url).toBe(URL_MES_AFFAIRES);
    return { ok: reponse.status === 200, status: reponse.status, json: async () => reponse.corps };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const rendre = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const listees = (): string[] => [...container.querySelectorAll('[data-liste-mon-espace] [data-ma-vente]')].map((x) => x.getAttribute('data-ma-vente')!);

describe('🔴 les compteurs de « Mon espace » (retirés, décision 8 d’Arno : les tuiles de « Mois » les remplacent)', () => {
  it('plus de compteur ; « Mois » : « Mes compromis en cours » (2 — 10 000 € HT) ; la bascule TTC montre les montants TTC', async () => {
    reponse = { status: 200, corps: reponseLea() };
    await rendre();
    expect(container.querySelector('[data-compteur]')).toBeNull();
    await cliquer('[data-vue="mois"]');
    expect(texte('[data-tuile-nb-compromis]')).toBe('2 compromis');
    expect(texte('[data-valeur-tuile="previsionnel"]')).toBe('10 000 €');
    await cliquer('[data-afficher="ttc"]');
    expect(texte('[data-valeur-tuile="previsionnel"]')).toBe('12 000 €');
  });
  it('lecture refusée ou impossible : un message, pas de compteur', async () => {
    reponse = { status: 403, corps: { erreur: 'ACCES_REVOQUE' } };
    await rendre();
    expect(texte('[data-mon-espace-erreur]')).toBe('Vos affaires n’ont pas pu être lues. Rechargez la page.');
    expect(container.querySelector('[data-compteur]')).toBeNull();
  });
});

describe('🔴 « Mes compromis en cours » : la liste de la tuile Suivi CA, en vue personnelle', () => {
  it('EXACTEMENT les ventes comptées par le serveur (jamais une vente reçue mais pas à moi), la plus récente en haut', async () => {
    reponse = { status: 200, corps: reponseLea() };
    await rendre();
    // l'onglet « Compromis » du Suivi CA, ouvert par défaut (comme la Transaction) : la même liste que « Mes compromis en cours »
    expect(container.querySelector('[data-vue="compromis"]')!.getAttribute('aria-selected')).toBe('true');
    expect(listees()).toEqual(['2', '1']);
    await cliquer('[data-onglet-mon-espace="compromis"]');
    expect(container.querySelector('[data-vue="compromis"]')!.getAttribute('aria-selected')).toBe('false');
    expect(listees()).toEqual(['2', '1']);
    expect(container.textContent).not.toContain('PAS À MOI');
  });
  it('carte repliée : le côté de l’autre n’affiche ni com négo ni reste ; le mien, oui', async () => {
    reponse = { status: 200, corps: reponseLea() };
    await rendre();
    const carte = '[data-ma-vente="1"]';
    expect(container.querySelector(`${carte} [data-nego-ligne="entree"] [data-nego-com]`)).not.toBeNull();
    expect(container.querySelector(`${carte} [data-nego-ligne="sortie"] [data-nego-honoraires]`)).not.toBeNull();
    expect(container.querySelector(`${carte} [data-nego-ligne="sortie"] [data-nego-com]`)).toBeNull();
    expect(container.querySelector(`${carte} [data-nego-ligne="sortie"] [data-nego-reste]`)).toBeNull();
  });
  it('fiche dépliée : ma commission et mon taux ; ni la commission ni le taux de l’autre (pas de « 0 € », pas de calcul) ; aucun geste de la tuile', async () => {
    reponse = { status: 200, corps: reponseLea() };
    await rendre();
    await cliquer('[data-ma-vente="1"] button[data-deplier]');
    const f = '[data-ma-vente="1"]';
    expect(texte(`${f} [data-negociateur-carte="entree"]`)).toBe('Négociateur : Léa MARTIN · 30 %');
    expect(container.querySelector(`${f} [data-commission-negociateur="entree"]`)).not.toBeNull();
    expect(texte(`${f} [data-negociateur-carte="sortie"]`)).toBe('Négociateur : Marc DURAND');
    expect(container.querySelector(`${f} [data-commission-negociateur="sortie"]`)).toBeNull();
    expect(container.querySelector(`${f} [data-part-agence="sortie"]`)).toBeNull();
    expect(texte(`${f} [data-commission-autre="sortie"]`)).toBe('La commission de ce côté n’est visible que de son négociateur.');
    expect(container.querySelector(f)!.textContent).not.toMatch(/40\s?%/);
    // toute la vente reste : le n° de mandat, les deux côtés et leurs parts
    expect(texte(`${f} [data-info="mandat"] dd`)).toBe('M-1');
    expect([texte(`${f} [data-societe-cote="entree"]`), texte(`${f} [data-societe-cote="sortie"]`)]).toEqual(['CRITERIMMO · 50 %', 'CRITERIMMO · 50 %']);
    // aucun geste : ni barre d'actions, ni réglage, ni bouton de négociateur, ni ajout, ni « Appliquer le calcul »
    for (const sel of ['[data-modifier-compromis]', '[data-acte-signe]', '[data-annulation-compromis]', 'button[data-negociateur-carte]', 'button[data-societe-cote]',
      '[data-ajouter-personne-carte]', '[data-appliquer-calcul-carte]']) expect(container.querySelector(`${f} ${sel}`), sel).toBeNull();
    // 🔴 LOT 6 — à la place, sous la fiche : « Modifier » (le formulaire de « Mon espace ») et l'historique en lecture — jamais « Annuler ce geste »
    expect(container.querySelector(`${f} [data-modifier-mon-espace="1"]`)).not.toBeNull();
    expect(container.querySelector(`${f} [data-historique-bouton="1"]`)).not.toBeNull();
    expect(container.querySelector(`${f} [data-annuler-geste]`)).toBeNull();
  });
});

describe('🔴 « Mes ventes » : toutes années, sélecteur d’année, total de l’année', () => {
  it('la tuile « Ventes » de « Mois » ouvre l’onglet sur son année (comme le compteur retiré) ; une autre année se choisit, avec son total', async () => {
    reponse = { status: 200, corps: reponseLea() };
    await rendre();
    await cliquer('[data-vue="mois"]');
    await cliquer('[data-tuile="ventes-mois"]');
    expect(container.querySelector('[data-onglet-mon-espace="ventes"]')!.getAttribute('aria-selected')).toBe('true');
    expect([...container.querySelectorAll<HTMLOptionElement>('[data-annee-mes-ventes] option')].map((o) => o.value)).toEqual(['2026', '2025']);
    expect(listees()).toEqual(['4']);
    expect(texte('[data-total-mes-ventes]')).toBe('1 vente en 2026 — 5 000 € HT');
    const select = container.querySelector('[data-annee-mes-ventes]') as HTMLSelectElement;
    await act(async () => { select.value = '2025'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(listees()).toEqual(['3']);
    expect(texte('[data-total-mes-ventes]')).toBe('1 vente en 2025 — 5 000 € HT');
  });
  it('tri : compromis par date du compromis, ventes par date de l’acte (plus récent en haut)', () => {
    expect(trierMesCompromis([c1, c2]).map((v) => v.id)).toEqual([2, 1]);
    expect(trierMesVentes([vendue25, vendue26]).map((v) => v.id)).toEqual([4, 3]);
  });
});

describe('compte sans aucune vente', () => {
  it('zéro partout, listes vides avec un message clair, aucune erreur', async () => {
    const vide = { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } };
    reponse = { status: 200, corps: { etat: 'ok', data: { disponible: true, aujourdhui: '2026-11-02', ventes: [], titulaire: { id: 9, prenom: null, administrateur: false },
      compteurs: { compromis: vide, actees: { ...vide, annee: 2026 }, parAnnee: [] } } } };
    await rendre();
    expect(texte('[data-liste-vide="compromis"]')).toBe('Aucun compromis en cours à votre nom.');
    await cliquer('[data-vue="mois"]');
    expect([texte('[data-tuile-nb-compromis]'), texte('[data-valeur-tuile="nombre"]'), texte('[data-valeur-tuile="ca"]')]).toEqual(['0 compromis', '0', '0 €']);
    await cliquer('[data-onglet-mon-espace="ventes"]');
    expect(texte('[data-liste-vide="ventes"]')).toBe('Aucune vente actée à votre nom en 2026.');
    expect(container.querySelector('[data-mon-espace-erreur]')).toBeNull();
  });
});

describe('🔴 NON-RÉGRESSION : sans l’option « vue personnelle » (la tuile Suivi CA), les mêmes composants montrent tout', () => {
  it('les commissions et les taux des DEUX côtés, et les gestes', async () => {
    const v = partagee();
    const hote: HoteDetail = { d: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, negociateurs: [], apporteurs: [], personnes: [], disponible: true,
      aujourdhui: '2026-11-02', annulation: true }, vue: null, societe: 'tous', statutDuLibelle: undefined, relire: () => {}, signalerPorteuse: () => {},
      enregistrerApporteur: async () => null, ouvrirEdition: () => {}, ouvrirPersonnes: () => {}, acte: null, setActe: () => {}, signer: async () => {},
      historique: null, setHistorique: () => {}, ouvrirAnnulation: () => {} };
    await act(async () => { root.render(<FournisseurAffichage value="ht"><CarteAffaire v={v} aujourdhui="2026-11-02" vue={null} ouvertInitial><DetailAffaire v={v} hote={hote} /></CarteAffaire></FournisseurAffichage>); });
    await calmer();
    expect(texte('[data-negociateur-carte="sortie"]')).toBe('Négociateur : Marc DURAND · 40 %');
    for (const sel of ['[data-commission-negociateur="entree"]', '[data-commission-negociateur="sortie"]', '[data-nego-ligne="sortie"] [data-nego-com]',
      '[data-modifier-compromis]', '[data-acte-signe]', 'button[data-negociateur-carte="sortie"]', 'button[data-societe-cote="entree"]']) {
      expect(container.querySelector(sel), sel).not.toBeNull();
    }
    expect(container.querySelector('[data-commission-autre]')).toBeNull();
  });
});
