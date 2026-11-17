// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CSS_DIGICODES_COPRO, DigicodesCopropriete, LARGEUR_ETROITE_DCP, saisieDigicodesInitiale } from './DigicodesCopropriete';
import type { BatimentConnu } from '../../../../lib/gestion/batimentsCopropriete';

/**
 * 🔴🔴 Arno (17/11/2026) — « LISIBILITÉ : chaque digicode (copropriété et chaque bâtiment) a son propre encadré, nettement séparé des autres (bordure ou fond
 * distinct, espacement régulier). Dans chaque encadré, la même disposition partout : intitulé, code avec « en vigueur depuis… », puis sur une même ligne
 * « Modifier » et « Corriger une erreur », puis les mentions (« Enregistré le … par … », « Commun aux N biens… »), avec le « − » / « + » aligné en colonne.
 * Les bâtiments gardent leur retrait sous la copropriété. Même rendu dans la fiche Copropriété (Gestion), « Nouveau bien », « Modifier le bien » et la fiche du
 * bien Gestion ; téléphone 390 px, clair et sombre, rien ne déborde. » — jsdom ne calcule pas la mise en page : ici l'ORDRE et l'APPARTENANCE à l'encadré,
 * et la feuille ; les mesures (colonne, une ligne, débordement) sont prises au Chrome du Mac.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root; let largeur = 600;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  largeur = 600;
  vi.stubGlobal('ResizeObserver', class { cb: () => void; constructor(cb: () => void) { this.cb = cb; } observe() { this.cb(); } disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: largeur, height: 0, top: 0, left: 0, right: largeur, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const A: BatimentConnu = { cle: 'a', libelle: 'A', sorte: 'lettre' };
const B: BatimentConnu = { cle: 'b', libelle: 'B', sorte: 'lettre' };
const ETAT = (code: string, enregistre: string) => ({ connu: true, valeur: { digicode: true, code }, depuis: '2026-11-01T10:00:00.000Z', source: 'unifie', aVenir: [], aArbitrer: [], historique: [], enregistre });
const fiche = () => saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [{ cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières',
  commun: { digicode: true, code: 'C1', etat: ETAT('C1', 'Enregistré le 01/11/2026 à 11:00 par Arnaud JOREL'), nbBiens: 4 },
  batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', etat: ETAT('A1', 'Corrigé le 03/11/2026 à 09:15 par Arnaud JOREL'), nbBiens: 2 }] }] } as never);
function Hote({ variante, modeBien = false }: { variante?: 'location'; modeBien?: boolean }) {
  const [s, setS] = useState(fiche);
  return createElement(DigicodesCopropriete, { s, onChange: setS, connus: [A, B], nomenclature: 'lettres', desactive: false, modeBien, variante,
    onPlanifier: async () => null, onCorriger: async () => null, onRetirer: async () => null, onRetirerBatiment: async () => null });
}
/** Ce qu'un encadré contient, dans l'ordre (les repères qui comptent pour Arno). */
const ordre = (boite: Element): string[] => [...boite.querySelectorAll('.dcp-lue-titre, [data-dcp-lue-valeur], .dcp-gestes, [data-dcp-enregistre], .dcp-mention:not([data-dcp-enregistre]), .dcp-plus')]
  .map((e) => (e.matches('.dcp-lue-titre') ? 'intitulé' : e.matches('[data-dcp-lue-valeur]') ? 'code' : e.matches('.dcp-gestes') ? 'Modifier + Corriger'
    : e.matches('[data-dcp-enregistre]') ? 'Enregistré' : e.matches('.dcp-plus') ? (e.hasAttribute('data-dcp-moins') ? '−' : '+') : 'Commun aux N biens'));

describe('🔴 un encadré par digicode, la même disposition partout', () => {
  for (const [nom, props] of [['fiche Copropriété (Gestion)', {}], ['fiche du bien (Location : « Nouveau bien », « Modifier le bien »)', { variante: 'location' as const }]] as const) {
    it(`${nom} : copropriété et bâtiment, chacun son encadré ; intitulé, code, « Modifier » et « Corriger une erreur » ensemble, puis les mentions — le « + » / « − » DANS l'encadré`, async () => {
      await act(async () => { root.render(createElement(Hote, props)); });
      const copro = container.querySelector('[data-dcp-commun]')!;
      const a = container.querySelector('[data-dcp-batiment="A"]')!;
      for (const boite of [copro, a]) expect(boite.classList.contains('dcp-ligne--lue')).toBe(true);
      expect(ordre(copro)).toEqual(['intitulé', 'code', 'Modifier + Corriger', 'Enregistré', '+', 'Commun aux N biens'].filter((x) => x !== '+' || copro.querySelector('.dcp-plus') !== null));
      expect(ordre(a)).toEqual(['intitulé', 'code', 'Modifier + Corriger', 'Enregistré', '−', 'Commun aux N biens']);
      // « Commun aux 4 biens… » est DANS l'encadré de la copropriété (il était dessous, hors de lui)
      expect(copro.querySelector('[data-dcp-mention-commun]')?.textContent).toContain('4 biens');
      expect(container.querySelectorAll('[data-dcp-mention-commun]')).toHaveLength(1);
      // « Modifier » et « Corriger une erreur » : le même groupe
      expect([...copro.querySelector('.dcp-gestes')!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Modifier', 'Corriger une erreur']);
      // le bâtiment garde son retrait
      expect(a.classList.contains('dcp-ligne--batiment')).toBe(true);
    });
  }
  it('la feuille : bordure et fond pour chaque encadré, retrait des bâtiments, « − » / « + » dans la colonne de droite, « Modifier » et « Corriger » sur une ligne', () => {
    const css = CSS_DIGICODES_COPRO.replace(/\s+/g, ' ');
    expect(css).toContain('.dcp .dcp-ligne{box-sizing:border-box;padding:12px;border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface)');
    expect(css).toContain('.dcp .dcp-ligne.dcp-ligne--batiment{margin-left:var(--dcp-retrait)');
    expect(css).toContain('.dcp .dcp-ligne--lue > .dcp-plus{grid-column:2;grid-row:1 / span 2;align-self:center;justify-self:end}');
    expect(css).toContain('.dcp .dcp-ligne--lue .dcp-gestes{display:flex;flex-wrap:wrap;align-items:center');
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i); // les jetons du thème seulement (clair et sombre)
  });
  it(`l'encadré étroit (moins de ${LARGEUR_ETROITE_DCP} px, mesuré sur le composant) : la disposition étroite ; large : non`, async () => {
    largeur = 258;
    await act(async () => { root.render(createElement(Hote, { variante: 'location' })); });
    expect(container.querySelector('[data-digicodes-copro]')?.classList.contains('dcp--etroit')).toBe(true);
    await act(async () => { root.unmount(); }); root = createRoot(container);
    largeur = 700;
    await act(async () => { root.render(createElement(Hote, { variante: 'location' })); });
    expect(container.querySelector('[data-digicodes-copro]')?.classList.contains('dcp--etroit')).toBe(false);
  });
});
