// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { writeFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { FormulaireDossier, etatRepartitionDe, type References } from './FormulaireDossier';
import type { Vente } from '../../../../lib/transaction/modele';
import CHAMPS_AVANT from './__fixtures__/champsFormulaireDossierAvant.json';

/**
 * 🔴 D30 (Arno, 03/11/2026) — le formulaire « Vente — <nom> » / « Compromis — <nom> » (le MÊME composant dans le Suivi CA et dans Mon espace) :
 * chaque partie dans son bloc encadré et titré, dans l'ordre réel des champs ; chaque vendeur / acquéreur dans sa carte numérotée (bascule
 * Particulier / Société et « Enlever » dans l'en-tête), « + Un vendeur » sur sa ligne ; en-tête et pied collants. AUCUN champ perdu : la liste des
 * contrôles est comparée à celle d'avant (relevée sur la version précédente, `__fixtures__/champsFormulaireDossierAvant.json`) ; le corps
 * enregistré est identique. Données fictives ; rien n'est écrit (l'envoi est simulé).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JB = { id: 5, nom: 'Jean-Baptiste PONS', societe: 'criterimmo' as const };
const MY = { id: 7, nom: 'Mylène EBERLIN', societe: 'criterimmo' as const };
const references: References = { lotD: true, prixVente: true, annulation: true, uniteCommission: true, personneType: true, mandat: true, negociateurs: [JB, MY],
  apporteurs: [{ id: 4, nom: 'Julien Deblois' }], personnes: [{ id: 3, nom: 'DUPONT', telephone: null, email: null, adresse: null }], collegues: [] } as References;
const vente: Vente = { id: 196, societe: 'criterimmo', libelle: 'BASUYEAUX', honorairesTtc: 10500, statut: 'vendue', annee: 2026, mois: 7, dateCompromis: '2026-04-02', apporteur: 'Julien Deblois',
  note: 'Clés chez le notaire', origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [], prixVente: 350000, numeroMandat: 'M-2026-12', version: 3,
  retroApporteur: { montant: 500, unite: 'ttc' },
  repartition: { retroApporteurTtc: 500, parties: [{ sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null },
    { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] },
  dossier: { adresseBien: '3 rue des Lilas, 92800 Puteaux', dateActePrevue: '2026-07-10', dateActe: '2026-07-08', entree: { id: 5, nom: JB.nom }, sortie: { id: 7, nom: MY.nom }, apporteurId: 4,
    personnes: [{ id: 3, role: 'vendeur', nom: 'BASUYEAUX', telephone: '06 00 00 00 01', email: null, adresse: null, type: 'particulier', civilite: 'M.', prenom: 'Jean' },
      { id: 8, role: 'vendeur', nom: 'BASUYEAUX', telephone: null, email: null, adresse: null, type: 'particulier', civilite: 'Mme', prenom: 'Anne' },
      { id: 9, role: 'acquereur', nom: 'SCI DES LILAS', telephone: null, email: null, adresse: null, type: 'societe', civilite: null, prenom: null, representants: [] }] } } as unknown as Vente;

let container: HTMLDivElement;
let root: Root;
let envois: unknown[];
beforeEach(() => {
  envois = [];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: [] }) })) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const ouvrir = async () => {
  await act(async () => {
    root.render(createElement(FormulaireDossier, { societe: 'criterimmo', vente, references, repartitionInitiale: etatRepartitionDe(vente, references.negociateurs, true), onFermer: () => {}, onFait: () => {},
      envoyer: async (corps) => { envois.push(corps); return { motif: null, data: 196 }; } }));
  });
  await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
};
/** Les repères AJOUTÉS par D30 (rien d'autre ne change sur ces contrôles). */
const NOUVEAUX_REPERES = ['data-annuler-dossier', 'data-enlever-personne'];
/** Les contrôles du formulaire : chacun par son repère (data-champ, autre data-*, aria-label, type ou texte), dans l'ordre. Le bouton « Fermer »
 *  du pied s'appelle désormais « Annuler » (demande d'Arno, D30) : même geste, même repère. */
export function controles(racine: Element): string[] {
  return [...racine.querySelectorAll('form input, form textarea, form select, form button')].map((e) => {
    const data = [...e.attributes].filter((a) => a.name.startsWith('data-') && !NOUVEAUX_REPERES.includes(a.name)).map((a) => `${a.name}=${a.value}`).sort().join('&');
    const aria = e.getAttribute('aria-label') ?? '';
    const texte = e.tagName === 'BUTTON' ? (e.textContent ?? '').trim().replace(/^Annuler$/, 'Fermer') : '';
    return `${e.tagName.toLowerCase()}|${(e as HTMLInputElement).type ?? ''}|${data}|${aria}|${texte}`;
  });
}

describe('🔴 D30 — le formulaire de la vente : des blocs nets, aucun champ perdu', () => {
  it('aucun champ perdu : la liste des contrôles = celle d’avant (mêmes repères, mêmes types)', async () => {
    await ouvrir();
    const apres = controles(container);
    if (process.env.RELEVER_CHAMPS !== undefined) writeFileSync(`${process.env.RELEVER_CHAMPS}/champs.json`, JSON.stringify(apres));
    expect([...apres].sort()).toEqual([...(CHAMPS_AVANT as string[])].sort());
  });
  it('les blocs titrés, dans l’ordre réel des champs : Mandat · Vendeur(s) · Acquéreur(s) · Bien · Dates · Prix et honoraires · Libellé · Négociateurs, structures et apporteur · Notes', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('[data-bloc-dossier] > .trx-form-bloc-titre, [data-bloc-dossier] > legend')].map((t) => t.textContent?.trim()))
      .toEqual(['Mandat', 'Vendeur(s)', 'Acquéreur(s)', 'Bien', 'Dates', 'Prix et honoraires', 'Libellé', 'Négociateurs, structures et apporteur', 'Notes']);
    expect(container.querySelector('[data-bloc-dossier="bien"] [data-champ-adresse-bien]')).not.toBeNull();
    expect(container.querySelector('[data-bloc-dossier="dates"] [data-champ="date-acte"]')).not.toBeNull();
    expect(container.querySelector('[data-bloc-dossier="repartition"] [data-bloc-repartition]')).not.toBeNull();
  });
  it('chaque personne : sa carte numérotée (« Vendeur 1 », « Vendeur 2 », « Acquéreur 1 »), Particulier / Société et « Enlever » dans l’en-tête ; « + Un vendeur » sous les cartes', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('[data-fiche-tete] .trx-fiche-titre')].map((t) => t.textContent)).toEqual(['Vendeur 1', 'Vendeur 2', 'Acquéreur 1']);
    const tete = container.querySelector('[data-personne="0"] [data-fiche-tete]')!;
    expect(tete.querySelector('[data-choix-type="0-societe"]')).not.toBeNull();
    expect(tete.querySelector('[data-enlever-personne="0"]')?.textContent).toBe('Enlever');
    const bloc = container.querySelector('[data-personnes="vendeur"]')!;
    expect(bloc.lastElementChild?.querySelector('[data-ajouter-personne="vendeur"]')).not.toBeNull();
    // Enlever : la carte disparaît, les autres se renumérotent
    await act(async () => { (container.querySelector('[data-enlever-personne="0"]') as HTMLElement).click(); });
    expect([...container.querySelectorAll('[data-fiche-tete] .trx-fiche-titre')].map((t) => t.textContent)).toEqual(['Vendeur 1', 'Acquéreur 1']);
  });
  it('en-tête collant (titre, « Montants en HT | TTC », fermer) ; pied collant (« Enregistrer », « Annuler ») ; l’enregistrement envoie le même corps', async () => {
    await ouvrir();
    await act(async () => { (container.querySelector('[data-enregistrer-dossier]') as HTMLElement).click(); });
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    if (process.env.RELEVER_CHAMPS !== undefined) writeFileSync(`${process.env.RELEVER_CHAMPS}/corps.json`, JSON.stringify(envois));
    expect(envois).toHaveLength(1);
    expect(JSON.stringify(envois[0])).toBe(JSON.stringify((CORPS_AVANT as unknown[])[0]));
    const tete = container.querySelector('.tdb-fenetre-tete')!;
    expect(tete.querySelector('h3')?.textContent).toBe('Vente — BASUYEAUX');
    expect(tete.querySelector('[data-affichage-formulaire]')).not.toBeNull();
    expect(tete.querySelector('.tdb-x')).not.toBeNull();
    const pied = container.querySelector('[data-pied-dossier]')!;
    expect([...pied.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Enregistrer', 'Annuler']);
  });
});
import CORPS_AVANT from './__fixtures__/corpsFormulaireDossierAvant.json';
