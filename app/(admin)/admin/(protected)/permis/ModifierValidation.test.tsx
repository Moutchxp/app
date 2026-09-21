// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BandeauModificationValidation, LigneStatutValidation, PopUpConfirmerModification, PopUpConfirmerRevalidation, PopUpConfirmerRestauration } from './ModifierValidation';

/**
 * RATT-EDIT (lot B2) — composants PURS du verrou d'édition (montés réellement en jsdom ; aucun réseau) :
 *   · le bouton « Modifier » n'existe QU'AVEC la capacité ; sinon la bannière DIT lecture seule sans jargon ;
 *   · déverrouillé, le bandeau suit le MARQUEUR : NEUTRE « mode modification ouvert » (rien modifié) ou ROUGE « modifié — à revalider », + « Terminer la modification » (ne revalide pas) ;
 *   · LigneStatutValidation — statut PERMANENT « Validé … » (vert) / « Modifié … — à revalider » (rouge), dates/auteurs seulement si disponibles ;
 *   · pop-up 1 : « Modifier » → onConfirmer, « Annuler »/Échap → onAnnuler ; date/auteur affichés SI fournis, jamais « null/undefined ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hote: HTMLDivElement | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; hote?.remove(); hote = null; });

function monter(node: React.ReactElement): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root!.render(node));
  return hote;
}
const boutons = (c: HTMLElement) => [...c.querySelectorAll('button')];
const boutonTexte = (c: HTMLElement, re: RegExp) => boutons(c).find((b) => re.test(b.textContent ?? '')) ?? null;
const cliquer = (b: HTMLButtonElement) => act(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('BandeauModificationValidation — verrou par défaut, bouton gaté par la capacité', () => {
  it('SANS la capacité : aucun bouton « Modifier », message « lecture seule »', () => {
    const c = monter(createElement(BandeauModificationValidation, { modifOuverte: false, peutModifier: false, onDemander: () => {}, onVerrouiller: () => {} }));
    expect(boutonTexte(c, /Modifier/)).toBeNull();
    expect(c.textContent).toMatch(/lecture seule/i);
    expect(c.textContent).toMatch(/pas le droit/i);
  });

  it('AVEC la capacité : bouton « Modifier » présent → onDemander au clic (ouvre la pop-up 1)', () => {
    const onDemander = vi.fn();
    const c = monter(createElement(BandeauModificationValidation, { modifOuverte: false, peutModifier: true, onDemander, onVerrouiller: () => {} }));
    const b = boutonTexte(c, /^Modifier$/);
    expect(b).not.toBeNull();
    cliquer(b as HTMLButtonElement);
    expect(onDemander).toHaveBeenCalledTimes(1);
  });

  it('DÉVERROUILLÉ, RIEN modifié (marqueur éteint) : bandeau NEUTRE « Mode modification ouvert » + « Terminer la modification », aucun ROUGE « à revalider »', () => {
    const onVerrouiller = vi.fn();
    const c = monter(createElement(BandeauModificationValidation, { modifOuverte: true, modifie: false, peutModifier: true, onDemander: () => {}, onVerrouiller }));
    expect(c.textContent).toMatch(/mode modification ouvert/i);
    expect(c.textContent).toMatch(/reste « Validé »/i);      // dit clairement que rien n'a changé
    expect(c.textContent).not.toMatch(/à revalider/i);       // JAMAIS de rouge tant que rien n'est modifié
    expect(boutonTexte(c, /^Modifier$/)).toBeNull();
    const t = boutonTexte(c, /Terminer la modification/);
    expect(t).not.toBeNull();
    expect(boutonTexte(c, /Verrouiller/)).toBeNull();        // renommé
    cliquer(t as HTMLButtonElement);
    expect(onVerrouiller).toHaveBeenCalledTimes(1);
  });

  it('DÉVERROUILLÉ, une modification RÉELLE enregistrée (marqueur allumé) : bandeau ROUGE « Modifié — à revalider » + « Terminer la modification »', () => {
    const onVerrouiller = vi.fn();
    const c = monter(createElement(BandeauModificationValidation, { modifOuverte: true, modifie: true, peutModifier: true, onDemander: () => {}, onVerrouiller }));
    expect(c.textContent).toMatch(/modifié — à revalider/i);
    expect(c.textContent).toMatch(/restera « à revalider »/i); // ③ dit ce qui se passe si on termine sans revalider
    const t = boutonTexte(c, /Terminer la modification/);
    expect(t).not.toBeNull();
    cliquer(t as HTMLButtonElement);
    expect(onVerrouiller).toHaveBeenCalledTimes(1);
  });
});

describe('LigneStatutValidation — statut permanent « Validé » / « Modifié — à revalider » (jamais un « le null »)', () => {
  it('marqueur ÉTEINT → VERT « Validé le … par … » quand date/auteur fournis', () => {
    const c = monter(createElement(LigneStatutValidation, { modifie: false, validationLe: '2026-09-07T10:00:00Z', validationParNom: 'A. Jorel' }));
    expect(c.textContent).toMatch(/Validé le 7 septembre 2026 par A\. Jorel/);
    expect(c.textContent).not.toMatch(/à revalider/i);
  });
  it('marqueur ÉTEINT sans date ni auteur (permis validé avant B1) → « Validé » NU, jamais « null »/« undefined »', () => {
    const c = monter(createElement(LigneStatutValidation, { modifie: false, validationLe: null, validationParNom: null }));
    expect(c.textContent).toMatch(/Validé\./);       // « Validé. » NU (pas de « le … » ni « par … »)
    expect(c.textContent).not.toMatch(/Validé le|Validé par/);
    expect(c.textContent).not.toMatch(/null|undefined|NaN|Invalid/);
  });
  it('marqueur ALLUMÉ → ROUGE « Modifié par … le … — à revalider » (trace B3)', () => {
    const c = monter(createElement(LigneStatutValidation, { modifie: true, modifieLe: '2026-09-20T20:22:00Z', modifieParNom: 'Arnaud Jorel' }));
    expect(c.textContent).toMatch(/Modifié par Arnaud Jorel le 20 septembre 2026.*à revalider/);
  });
  it('marqueur ALLUMÉ sans trace (emprise seule) → « Modifié — à revalider » sans qui/quand inventés', () => {
    const c = monter(createElement(LigneStatutValidation, { modifie: true, modifieLe: null, modifieParNom: null }));
    expect(c.textContent).toMatch(/Modifié — à revalider/);
    expect(c.textContent).not.toMatch(/null|undefined|NaN|Invalid/);
  });
});

describe('PopUpConfirmerModification — pop-up 1', () => {
  it('confirmer → onConfirmer ; annuler → onAnnuler', () => {
    const onConfirmer = vi.fn(), onAnnuler = vi.fn();
    const c = monter(createElement(PopUpConfirmerModification, { onConfirmer, onAnnuler }));
    expect(c.querySelector('[role="dialog"]')).not.toBeNull();
    cliquer(boutonTexte(c, /^Modifier$/) as HTMLButtonElement);
    expect(onConfirmer).toHaveBeenCalledTimes(1);
    cliquer(boutonTexte(c, /^Annuler$/) as HTMLButtonElement);
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });

  it('Échap → onAnnuler (issue non destructive)', () => {
    const onAnnuler = vi.fn();
    monter(createElement(PopUpConfirmerModification, { onConfirmer: () => {}, onAnnuler }));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });

  it('date + auteur AFFICHÉS si fournis', () => {
    const c = monter(createElement(PopUpConfirmerModification, { validationDate: '2026-03-15T10:00:00Z', validationAuteur: 'A. Jorel', onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(c.textContent).toMatch(/mars 2026/);
    expect(c.textContent).toMatch(/A\. Jorel/);
  });

  it('date/auteur ABSENTS → message générique, jamais « null » ni « undefined »', () => {
    const c = monter(createElement(PopUpConfirmerModification, { onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(c.textContent).toMatch(/déjà été/i);
    expect(c.textContent).not.toMatch(/null|undefined|NaN|Invalid/);
  });
});

describe('PopUpConfirmerRevalidation — pop-up 2', () => {
  it('dit ce qui sera enregistré (nouvelle référence) + précédente conservée ; revalider → onConfirmer, annuler → onAnnuler', () => {
    const onConfirmer = vi.fn(), onAnnuler = vi.fn();
    const c = monter(createElement(PopUpConfirmerRevalidation, { onConfirmer, onAnnuler }));
    expect(c.querySelector('[role="dialog"]')).not.toBeNull();
    expect(c.textContent).toMatch(/nouvelle validation de référence/i);
    expect(c.textContent).toMatch(/précédente est conservée/i);
    cliquer(boutonTexte(c, /^Revalider$/) as HTMLButtonElement);
    expect(onConfirmer).toHaveBeenCalledTimes(1);
    cliquer(boutonTexte(c, /^Annuler$/) as HTMLButtonElement);
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });

  it('affiche la trace (auteur + date) de la dernière modification si fournie ; jamais « null »', () => {
    const c = monter(createElement(PopUpConfirmerRevalidation, { modifieParNom: 'Arnaud Jorel', modifieLe: '2026-09-20T20:22:00Z', onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(c.textContent).toMatch(/Arnaud Jorel/);
    expect(c.textContent).toMatch(/septembre 2026/);
    expect(c.textContent).not.toMatch(/null|undefined|NaN|Invalid/);
  });

  it('enCours → bouton « Revalidation… » désactivé (anti double-clic) ; Échap bloqué', () => {
    const onConfirmer = vi.fn(), onAnnuler = vi.fn();
    const c = monter(createElement(PopUpConfirmerRevalidation, { enCours: true, onConfirmer, onAnnuler }));
    const b = boutonTexte(c, /Revalidation…/) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onAnnuler).not.toHaveBeenCalled(); // Échap ignoré pendant l'envoi
  });
});

describe('PopUpConfirmerRestauration — pop-up 3', () => {
  it('dit ce qui est remplacé (version), que les supprimés sont recréés, rien effacé, « à revalider » ; restaurer/annuler câblés', () => {
    const onConfirmer = vi.fn(), onAnnuler = vi.fn();
    const c = monter(createElement(PopUpConfirmerRestauration, { versionLabel: 'Validation d’origine du 7 septembre 2026', onConfirmer, onAnnuler }));
    expect(c.querySelector('[role="dialog"]')).not.toBeNull();
    expect(c.textContent).toMatch(/Validation d’origine du 7 septembre 2026/);
    expect(c.textContent).toMatch(/recréés/i);
    expect(c.textContent).toMatch(/rien n’est effacé/i);
    expect(c.textContent).toMatch(/à revalider/i);
    cliquer(boutonTexte(c, /^Restaurer$/) as HTMLButtonElement);
    expect(onConfirmer).toHaveBeenCalledTimes(1);
    cliquer(boutonTexte(c, /^Annuler$/) as HTMLButtonElement);
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });
  it('enCours → « Restauration… » désactivé, Échap bloqué', () => {
    const onAnnuler = vi.fn();
    const c = monter(createElement(PopUpConfirmerRestauration, { versionLabel: 'X', enCours: true, onConfirmer: () => {}, onAnnuler }));
    expect((boutonTexte(c, /Restauration…/) as HTMLButtonElement).disabled).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onAnnuler).not.toHaveBeenCalled();
  });
});
