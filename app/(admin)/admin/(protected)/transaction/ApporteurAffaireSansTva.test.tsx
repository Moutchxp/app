// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApporteurAffaire } from './ApporteurAffaire';
import { BlocRepartition, ResumeBase, type EtatRepartition } from './Repartition';
import { FournisseurAffichage } from './commun';

/** 🔴 D29 (Arno, 03/11/2026) — l'apporteur d'une affaire (Informations communes, formulaire « Modifier ») : un externe, UN montant « sans TVA » ;
 *  un collaborateur (interne dans l'annuaire) : HT et TTC, comme avant. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const rendre = async (interne: boolean) => {
  await act(async () => {
    root.render(createElement(ApporteurAffaire, { affichage: true, modifiable: false, avecUnite: true, onValider: () => null, onRetirer: () => null,
      annuaire: [{ id: 16, nom: 'Gardien Dacquet', ...(interne ? { interne: true } : {}) }], actuel: { id: 16, nom: 'Gardien Dacquet', montant: { montant: 1000, unite: 'ttc' } } }));
  });
};

describe('🔴 D29 — l’apporteur de l’affaire', () => {
  it('externe : « 1 000 € sans TVA », aucun équivalent HT / TTC', async () => {
    await rendre(false);
    expect(container.querySelector('[data-apporteur-affiche]')?.textContent?.replace(/\s/g, ' ')).toBe('Gardien Dacquet1 000 € sans TVA');
  });
  it('collaborateur (interne) : HT et TTC, comme avant', async () => {
    await rendre(true);
    expect(container.querySelector('[data-apporteur-affiche]')?.textContent).toMatch(/TTC/);
  });
});

describe('🔴 D29 — la commission PROPOSÉE d’un négociateur : sur les honoraires nets après le coût de l’apporteur', () => {
  const etat = (): EtatRepartition => ({ entreeId: 5, sortieId: 7, apporteurId: 4, retroTexte: '500', retroUnite: 'ttc',
    commissions: { entree: { texte: '', unite: 'ttc', auto: true }, sortie: { texte: '', unite: 'ttc', auto: true } },
    parties: [{ sorte: 'entree', compteId: 5, negociateur: 'Jean-Baptiste PONS', societe: 'criterimmo', mode: 'pct', texte: '50' },
      { sorte: 'sortie', compteId: 7, negociateur: 'Mylène EBERLIN', societe: 'criterimmo', mode: 'pct', texte: '50' }] } as unknown as EtatRepartition);
  const rendreBloc = async (interne: boolean) => {
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    await act(async () => {
      root.render(createElement(BlocRepartition, { etat: etat(), onChange: () => {}, honorairesTtc: 10500, societeVente: 'criterimmo',
        negociateurs: [{ id: 5, nom: 'Jean-Baptiste PONS', societe: 'criterimmo' }, { id: 7, nom: 'Mylène EBERLIN', societe: 'criterimmo' }],
        apporteurs: [{ id: 4, nom: 'Julien Deblois', ...(interne ? { interne: true } : {}) }] } as Parameters<typeof BlocRepartition>[0]));
    });
  };
  it('externe (500 € sans TVA) : (10 500 − 500 − 100 de TVA) × 50 % = 4 950 € TTC ; un collaborateur : (10 500 − 500) × 50 % = 5 000 € TTC', async () => {
    await rendreBloc(false);
    expect(container.querySelector('[data-propose="commission-entree"]')?.textContent).toMatch(/de 4\u202f?\s?950/);
    await rendreBloc(true);
    expect(container.querySelector('[data-propose="commission-entree"]')?.textContent).toMatch(/de 5\u202f?\s?000/);
  });
});

describe('🔴 D38 (Arno, 04/11/2026) — la ligne « TVA sur la commission de l’apporteur (non récupérable) » : TTC seulement', () => {
  const rendreBase = async (unite: 'ht' | 'ttc', interne: boolean) => {
    await act(async () => { root.render(createElement(FournisseurAffichage, { value: unite },
      createElement(ResumeBase, { commissionTtc: 7500, apporteurs: [{ nom: 'Gardien Dacquet', ttc: 1000, ...(interne ? { interne: true } : {}) }] }))); });
  };
  const ligne = () => container.querySelector('[data-resume="tva-apporteur"] [data-tva-ttc-seulement]')?.textContent?.replace(/\s+/g, ' ');
  it('Particulier, vue HT : « — (200 € TTC) » au lieu de « 0 € HT » ; la ligne reste', async () => {
    await rendreBase('ht', false);
    expect(ligne()).toBe('— (200 € TTC)');
  });
  it('Particulier, vue TTC : « 200 € TTC (— HT) »', async () => {
    await rendreBase('ttc', false);
    expect(ligne()).toBe('200 € TTC (— HT)');
  });
  it('Professionnel (avec TVA, `interne` = la commission porte la TVA) : aucune ligne de TVA non récupérable, l’apporteur en HT / TTC', async () => {
    await rendreBase('ht', true);
    expect(container.querySelector('[data-resume="tva-apporteur"]')).toBeNull();
    expect(container.querySelector('[data-resume="apporteur"]')?.textContent).toMatch(/HT/);
  });
});
