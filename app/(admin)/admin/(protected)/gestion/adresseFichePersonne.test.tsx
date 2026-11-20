// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormulaireCarte, type FicheAEditer } from './CartesPersonnes';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses uniformisées », lot 2) — L'ADRESSE DANS LA FICHE D'UNE PERSONNE (propriétaire, locataire, garant,
 * contact) : choisie dans les suggestions de la Base Adresse Nationale (rue, code postal et commune ENSEMBLE, plus de saisie libre) ;
 * « Adresse absente de la liste ? » (confirmée, « hors liste — à vérifier ») ; « Adresse à l'étranger » (saisie libre, pays obligatoire) ;
 * une rue sans numéro : la fenêtre de confirmation ; une adresse non touchée part telle quelle. Base Adresse Nationale simulée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement;
let root: Root;
let propositions: { label: string; name: string; postcode: string; city: string }[];
beforeEach(() => {
  hote = document.createElement('div'); hote.className = 'svv-adm-root'; document.body.appendChild(hote); root = createRoot(hote);
  propositions = [{ label: '3 Rue des Lilas 75011 Paris', name: '3 Rue des Lilas', postcode: '75011', city: 'Paris' }];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ features: propositions.map((p) => ({ properties: p })) }))));
});
afterEach(() => { act(() => { root.unmount(); }); hote.remove(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

const P: FicheAEditer = {
  civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', codePostal: '92400', commune: 'Courbevoie', note: null,
  contacts: [{ id: 1, sorte: 'telephone', affichage: '06 00 00 00 01', libelle: 'Mobile' }, { id: 2, sorte: 'email', affichage: 'lea@exemple.fr', libelle: null }],
};
let envoye: Record<string, unknown> | null;
const monter = async (p: FicheAEditer = P) => {
  envoye = null;
  await act(async () => { root.render(createElement(FormulaireCarte, { p, onEnregistrer: async (c: unknown) => { envoye = c as Record<string, unknown>; }, onAnnuler: () => {}, refus: null })); });
};
const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const $ = (s: string) => hote.querySelector(s) as HTMLInputElement;
const taper = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const choisirSuggestion = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 320)); }); await calmer();
  await act(async () => { (hote.querySelector('.cab-prop') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await calmer();
};
const enregistrer = async () => { await act(async () => { (hote.querySelector('[data-enregistrer-carte]') as HTMLButtonElement).click(); }); await calmer(); };
const fenetre = () => document.querySelector('[data-fenetre-carte]');
const boutonFenetre = (mot: string) => [...document.querySelectorAll('[data-fenetre-carte] button')].find((b) => b.textContent === mot) as HTMLButtonElement;

describe('🔴 une adresse française se CHOISIT dans la liste', () => {
  it('code postal et commune ne se tapent plus : remplis ENSEMBLE par le choix ; la nature « liste » part avec l’adresse', async () => {
    await monter();
    expect([$('[data-adresse-cp]').readOnly, $('[data-adresse-commune]').readOnly]).toEqual([true, true]);
    await taper($('#cp-adresse'), '3 rue des Lil');
    await choisirSuggestion();
    expect([$('#cp-adresse').value, $('[data-adresse-cp]').value, $('[data-adresse-commune]').value]).toEqual(['3 rue des Lilas', '75011', 'Paris']); // 🔴 (lot 7a) le champ et le rappel de la commune : la fonction d'affichage unique (la valeur enregistrée reste celle de la BAN)
    await enregistrer();
    expect(envoye).toMatchObject({ adresse: '3 Rue des Lilas', codePostal: '75011', commune: 'PARIS', adresseSaisie: { nature: 'liste', pays: null } });
  });
  it('une adresse tapée sans être choisie : rien ne part, le formulaire le dit et propose « Adresse absente de la liste ? »', async () => {
    await monter();
    await taper($('#cp-adresse'), '12 impasse Inconnue');
    expect(hote.querySelector('[data-adresse-a-choisir]')?.textContent).toContain('Choisissez l’adresse dans la liste proposée.');
    await enregistrer();
    expect(envoye).toBeNull();
    expect(hote.textContent).toContain('Choisissez l’adresse dans la liste proposée (ou « Adresse absente de la liste ? », ou « Adresse à l’étranger »).');
  });
  it('🔴 une adresse NON TOUCHÉE part telle quelle, sans nature (jamais requalifiée)', async () => {
    await monter();
    await taper(hote.querySelector('.cp-champ input[value="Léa"]') as HTMLInputElement, 'Lou');
    await enregistrer();
    expect(envoye).toMatchObject({ prenom: 'Lou', adresse: '7 rue des Essais', codePostal: '92400' });
    expect(envoye).not.toHaveProperty('adresseSaisie');
  });
});

describe('les deux exceptions, marquées', () => {
  it('« Adresse absente de la liste ? » : CONFIRMÉE, puis saisie libre marquée « hors liste — à vérifier »', async () => {
    await monter();
    await taper($('#cp-adresse'), '12 impasse Inconnue');
    await act(async () => { (hote.querySelector('[data-adresse-hors-liste]') as HTMLButtonElement).click(); });
    expect(fenetre()?.textContent).toContain('marquée « hors liste — à vérifier », et regroupée dans la liste des adresses à contrôler');
    await act(async () => { boutonFenetre('Confirmer : adresse hors liste').click(); });
    expect(hote.querySelector('[data-adresse-marque]')?.textContent).toBe('hors liste — à vérifier');
    await taper($('[data-adresse-cp]'), '92400');
    await taper($('[data-adresse-commune]'), 'Courbevoie');
    await enregistrer();
    expect(envoye).toMatchObject({ adresse: '12 impasse Inconnue', codePostal: '92400', commune: 'COURBEVOIE', adresseSaisie: { nature: 'hors_liste', horsListeConfirme: true } });
  });
  it('« Adresse à l’étranger » : saisie libre, code postal tel quel, PAYS obligatoire', async () => {
    await monter();
    await act(async () => { $('[data-adresse-etranger]').click(); });
    await taper(hote.querySelector('[data-adresse-libre]') as HTMLInputElement, '10 Downing Street');
    await taper($('[data-adresse-cp]'), 'SW1A 2AA');
    await taper($('[data-adresse-commune]'), 'London');
    await enregistrer();
    expect(envoye).toBeNull();
    expect(hote.textContent).toContain('Indiquez le pays de cette adresse à l’étranger.');
    await taper($('[data-adresse-pays]'), 'Royaume-Uni');
    await enregistrer();
    expect(envoye).toMatchObject({ adresse: '10 Downing Street', codePostal: 'SW1A 2AA', adresseSaisie: { nature: 'etranger', pays: 'Royaume-Uni' } });
  });
});

describe('une rue sans numéro', () => {
  it('la fenêtre de confirmation (« Corriger » / « Confirmer ») ; « Confirmer » enregistre avec la confirmation', async () => {
    propositions = [{ label: 'Rue Pierre Lhomme 92400 Courbevoie', name: 'Rue Pierre Lhomme', postcode: '92400', city: 'Courbevoie' }];
    await monter();
    await taper($('#cp-adresse'), 'Rue Pierre Lh');
    await choisirSuggestion();
    await enregistrer();
    expect(envoye).toBeNull();
    expect(fenetre()?.textContent).toContain('Cette adresse n’a pas de numéro : Rue Pierre Lhomme, 92400 COURBEVOIE.');
    await act(async () => { boutonFenetre('Confirmer').click(); }); await calmer();
    expect(envoye).toMatchObject({ adresse: 'Rue Pierre Lhomme', adresseSaisie: { nature: 'liste', sansNumeroConfirme: true } });
  });
});
