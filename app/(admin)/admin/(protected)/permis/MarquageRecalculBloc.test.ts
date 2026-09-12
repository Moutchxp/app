// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { BlocExistantsRepliable, libelleMentionMarquage, type PolygoneRepere } from './TraceEmpriseRendu';
import type { MarquageRecalcul } from './diffStatutsRecalcul';
import type { EtatStatutPolygone } from '../../../../lib/permis/polygoneStatut';

// Fixtures minimales : un bâtiment existant est STATUABLE dès qu'il a un cleabs et n'est pas « en projet ».
const poly = (cleabs: string, repere: string): PolygoneRepere => ({ cleabs, repere, anneau: [], etat: 'En service' });
const courant = (statut: EtatStatutPolygone['statut'], origine: EtatStatutPolygone['origine']): EtatStatutPolygone =>
  ({ statut, origine, etatBdtopoAuMoment: null, decidePar: null, decideLe: null, historique: [] });

// A : changement AUTO (mixte → détruit). B : DÉSACCORD (Arno a dit préservé, le recalcul proposerait détruit).
const marquage: MarquageRecalcul = {
  changementsParCleabs: new Map([['A', { cleabs: 'A', nature: 'statut', avant: 'mixte', apres: 'detruit' }]]),
  desaccordsParCleabs: new Map([['B', { cleabs: 'B', manuel: 'preserve', autoPropose: 'detruit' }]]),
};
const statuts = new Map<string, EtatStatutPolygone>([['A', courant('detruit', 'auto_recouvrement')], ['B', courant('preserve', 'saisie')]]);
const recouverts = [{ cleabs: 'A', tauxPct: 80 }, { cleabs: 'B', tauxPct: 90 }];
const props = { polygones: [poly('A', 'A'), poly('B', 'B')], recouverts, statuts };

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; });

describe('libelleMentionMarquage — mention écrite du titre replié (accord singulier/pluriel, vide si rien)', () => {
  it('changements seuls / désaccords seuls / les deux / rien', () => {
    expect(libelleMentionMarquage(1, 0)).toBe('↻ 1 changement après ajustement');
    expect(libelleMentionMarquage(0, 2)).toBe('↻ 2 désaccords après ajustement');
    expect(libelleMentionMarquage(2, 1)).toBe('↻ 2 changements, 1 désaccord après ajustement');
    expect(libelleMentionMarquage(0, 0)).toBe('');
  });
});

describe('BlocExistantsRepliable — MARQUAGE du recalcul (changement écrit, désaccord distinct + adopter, titre, acquit)', () => {
  it('titre replié : mention indigo des changements/désaccords non acquittés', () => {
    const html = renderToStaticMarkup(createElement(BlocExistantsRepliable, { ...props, onStatuer: () => {}, marquage, onAcquitter: () => {} }));
    expect(html).toContain('data-recalcul-titre="true"');
    expect(html).toContain('↻ 1 changement, 1 désaccord après ajustement');
    expect(html).toContain('#4338ca'); // accent indigo (jamais le rouge)
  });

  it('carte A : le CHANGEMENT est écrit en clair (même vocabulaire que les boutons)', () => {
    const html = renderToStaticMarkup(createElement(BlocExistantsRepliable, { ...props, onStatuer: () => {}, marquage, onAcquitter: () => {} }));
    expect(html).toContain('data-recalcul-change="true"');
    expect(html).toContain('Recalcul après ajustement : partiellement détruit → bâtiment détruit');
  });

  it('carte B : le DÉSACCORD est marqué DISTINCTEMENT + « adopter le recalcul » d’un geste (décision manuelle conservée)', () => {
    const html = renderToStaticMarkup(createElement(BlocExistantsRepliable, { ...props, onStatuer: () => {}, marquage, onAcquitter: () => {} }));
    expect(html).toContain('data-recalcul-desaccord="true"');
    expect(html).toContain('Le recalcul propose « bâtiment détruit »');
    expect(html).toContain('votre décision à la main (« bâtiment préservé ») est conservée');
    expect(html).toContain('data-adopter-recalcul="detruit"');
    expect(html).toContain('Adopter le recalcul : bâtiment détruit');
  });

  it('bouton d’acquittement DANS le bloc (partagé avec la notification)', () => {
    const html = renderToStaticMarkup(createElement(BlocExistantsRepliable, { ...props, onStatuer: () => {}, marquage, onAcquitter: () => {} }));
    expect(html).toContain('data-recalcul-acquit-bloc="true"');
    expect(html).toContain('J’ai vu');
  });

  it('AUCUN marquage → ni mention de titre, ni marquage sur les cartes, ni bouton d’acquit', () => {
    const html = renderToStaticMarkup(createElement(BlocExistantsRepliable, { ...props, onStatuer: () => {} }));
    expect(html).not.toContain('data-recalcul-titre');
    expect(html).not.toContain('data-recalcul-change');
    expect(html).not.toContain('data-recalcul-desaccord');
    expect(html).not.toContain('data-recalcul-acquit-bloc');
  });

  it('« Adopter le recalcul » APPELLE onStatuer(cleabs, statut proposé) — un seul geste', () => {
    const onStatuer = vi.fn();
    const div = document.createElement('div'); document.body.appendChild(div);
    root = createRoot(div);
    act(() => root!.render(createElement(BlocExistantsRepliable, { ...props, onStatuer, marquage, onAcquitter: () => {} })));
    const bouton = div.querySelector('[data-adopter-recalcul]') as HTMLButtonElement;
    act(() => bouton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onStatuer).toHaveBeenCalledWith('B', 'detruit');
    document.body.removeChild(div);
  });

  it('« J’ai vu » (dans le bloc) APPELLE onAcquitter — acquittement partagé', () => {
    const onAcquitter = vi.fn();
    const div = document.createElement('div'); document.body.appendChild(div);
    root = createRoot(div);
    act(() => root!.render(createElement(BlocExistantsRepliable, { ...props, onStatuer: () => {}, marquage, onAcquitter })));
    const zone = div.querySelector('[data-recalcul-acquit-bloc]')!;
    const bouton = zone.querySelector('button')!;
    act(() => bouton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onAcquitter).toHaveBeenCalledTimes(1);
    document.body.removeChild(div);
  });
});

describe('(garde de source) — l’ancien avertissement disparaît, le bloc reçoit le marquage partagé', () => {
  const RENDU = readFileSync('app/(admin)/admin/(protected)/permis/TraceEmpriseRendu.tsx', 'utf8').replace(/\s+/g, ' ');
  const BLOC = readFileSync('app/(admin)/admin/(protected)/permis/BlocTraceEmprise.tsx', 'utf8').replace(/\s+/g, ' ');
  it('la mention rendue « — affectation des voisins à vérifier » a été RETIRÉE de la ligne d’emprise', () => {
    expect(RENDU).not.toContain('affectation des voisins à vérifier</span>'); // la version RENDUE (le commentaire d’historique peut encore la citer)
  });
  it('le texte du panneau d’ajustement annonce le recalcul auto (plus « reste à vérifier à la main »)', () => {
    expect(RENDU).toContain('l’affectation des bâtiments existants recouverts est recalculée automatiquement');
    expect(RENDU).not.toContain('reste à vérifier à la main');
  });
  it('les DEUX blocs (normal + plein écran) reçoivent le marquage partagé et l’acquittement', () => {
    expect((BLOC.match(/marquage=\{marquage\} onAcquitter=\{onAcquitterRecalcul\}/g) ?? []).length).toBe(2);
    expect(BLOC).toContain('const marquage = useMemo(() => marquageRecalcul(recalculStatut, statutParCleabs)');
  });
});
