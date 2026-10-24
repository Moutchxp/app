// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormulaireCarte, type FicheAEditer } from './CartesPersonnes';
import { ContexteEditionTracee } from './editionTracee';

/**
 * 🔴 Arno (24/10/2026, 417) — la carte d'un locataire modifiée depuis « Suivi du mois » (contexte tracé) : « Enregistrer » inactif tant
 * que rien n'a changé, puis le RÉCAPITULATIF des seuls champs modifiés (« Confirmer » / « Revenir ») avant d'enregistrer. Hors
 * contexte (tous les autres écrans) : la carte d'avant, qui enregistre directement. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement;
let root: Root;
beforeEach(() => { hote = document.createElement('div'); hote.className = 'svv-adm-root'; document.body.appendChild(hote); root = createRoot(hote); });
afterEach(() => { act(() => { root.unmount(); }); hote.remove(); document.body.innerHTML = ''; });

const p: FicheAEditer = {
  civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '3 rue des Essais', codePostal: '92400', commune: 'Courbevoie', note: null,
  contacts: [{ id: 1, sorte: 'telephone', affichage: '06 00 00 00 01', libelle: 'Mobile' }, { id: 2, sorte: 'email', affichage: 'lea@exemple.fr', libelle: null }],
};
const monter = async (onEnregistrer: (c: unknown) => Promise<void>, trace: boolean) => {
  const formulaire = createElement(FormulaireCarte, { p, onEnregistrer, onAnnuler: () => {}, refus: null });
  await act(async () => {
    root.render(trace ? createElement(ContexteEditionTracee.Provider, { value: { ecran: 'Suivi du mois', depuisJournalId: 10 } }, formulaire) : formulaire);
  });
};
const champ = (mot: string) => [...hote.querySelectorAll('label')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === mot)?.querySelector('input') as HTMLInputElement;
const taper = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const enregistrer = () => hote.querySelector('[data-enregistrer-carte]') as HTMLButtonElement;
const fenetre = () => document.querySelector('[data-fenetre-carte]');
const bouton = (mot: string) => [...document.querySelectorAll('[data-fenetre-carte] button')].find((b) => b.textContent === mot) as HTMLButtonElement;

describe('🔴 la carte dans le contexte « Suivi du mois »', () => {
  it('rien n’a changé : « Enregistrer » inactif (et le dit)', async () => {
    await monter(vi.fn(async () => {}), true);
    expect(enregistrer().disabled).toBe(true);
    expect(enregistrer().title).toBe('Aucune modification à enregistrer.');
  });

  it('un champ changé : le récapitulatif des SEULS champs modifiés, puis « Confirmer » enregistre', async () => {
    const onEnregistrer = vi.fn(async () => {});
    await monter(onEnregistrer, true);
    await taper(champ('Commune'), 'Puteaux');
    expect(enregistrer().disabled).toBe(false);
    await act(async () => { enregistrer().click(); });
    expect(fenetre()?.querySelector('.cpf-titre')?.textContent).toBe('Enregistrer ces modifications ?');
    expect([...fenetre()!.querySelectorAll('.cpf-liste li')].map((l) => l.textContent)).toEqual(['Commune : COURBEVOIE → PUTEAUX']);
    expect(onEnregistrer).not.toHaveBeenCalled();
    await act(async () => { bouton('Confirmer').click(); });
    expect(onEnregistrer).toHaveBeenCalledTimes(1);
    expect(onEnregistrer).toHaveBeenCalledWith({ commune: 'PUTEAUX' });
  });

  it('« Revenir » ferme le récapitulatif sans rien enregistrer', async () => {
    const onEnregistrer = vi.fn(async () => {});
    await monter(onEnregistrer, true);
    await taper(champ('Commune'), 'Puteaux');
    await act(async () => { enregistrer().click(); });
    await act(async () => { bouton('Revenir').click(); });
    expect(fenetre()).toBeNull();
    expect(onEnregistrer).not.toHaveBeenCalled();
  });

  it('hors contexte (les autres écrans) : la carte d’avant — pas de récapitulatif, enregistrement direct', async () => {
    const onEnregistrer = vi.fn(async () => {});
    await monter(onEnregistrer, false);
    expect(enregistrer().disabled).toBe(false);
    await taper(champ('Commune'), 'Puteaux');
    await act(async () => { enregistrer().click(); });
    expect(fenetre()).toBeNull();
    expect(onEnregistrer).toHaveBeenCalledTimes(1);
  });
});
