// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DigicodesCopropriete, ModifierDigicodesLus, saisieDigicodesInitiale } from './DigicodesCopropriete';
import type { BatimentConnu } from '../../../../lib/gestion/batimentsCopropriete';

/**
 * 🔴🔴 Arno (17/11/2026) — « sous chaque digicode DÉJÀ ENREGISTRÉ (copropriété et chaque bâtiment), une mention discrète « Enregistré le JJ/MM/AAAA à HH:MM
 * par Prénom NOM » […] Si un changement daté est prévu, une seconde ligne : « Nouveau code prévu le … — saisi le … par Prénom NOM ». Un code en cours de saisie
 * garde « nouveau — enregistré avec le bien / la copropriété ». […] Même mention dans la fenêtre « Modifier » à côté du code actuel. »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; });
const $ = (s: string) => container.querySelector(s) as HTMLElement | null;
const saisir = async (el: Element, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };

const A: BatimentConnu = { cle: 'a', libelle: 'A', sorte: 'lettre' };
const B: BatimentConnu = { cle: 'b', libelle: 'B', sorte: 'lettre' };
const ETAT = (o: Record<string, unknown> = {}) => ({ connu: false, valeur: null, depuis: null, source: null, aVenir: [], aArbitrer: [], historique: [], ...o });
const COMMUN = ETAT({ connu: true, valeur: { digicode: true, code: 'C1' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z',
  enregistre: 'Corrigé le 03/11/2026 à 09:15 par Arnaud JOREL' });
const BAT_A = ETAT({ connu: true, valeur: { digicode: true, code: 'A1' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z',
  enregistre: 'Enregistré le 01/11/2026 à 11:00 par Arnaud JOREL',
  aVenir: [{ id: 9, digicode: true, code: 'A2', appliqueLe: '2026-11-20T08:00:00.000Z', prevu: 'Nouveau code prévu le 20/11/2026 à 09:00 — saisi le 16/11/2026 par Arnaud JOREL' }] });
const fiche = () => saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [{ cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières',
  commun: { digicode: true, code: 'C1', etat: COMMUN }, batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', etat: BAT_A }] }] } as never);
function Hote({ modeBien, variante }: { modeBien: boolean; variante?: 'location' }) {
  const [s, setS] = useState(fiche);
  return createElement(DigicodesCopropriete, { s, onChange: setS, connus: [A, B], nomenclature: 'lettres', desactive: false, modeBien, variante,
    onPlanifier: async () => null, onCorriger: async () => null });
}

describe('🔴 « Enregistré le … par … » sous chaque code enregistré', () => {
  for (const [nom, props] of [['fiche Copropriété', { modeBien: false }], ['fiche du bien (Location)', { modeBien: true, variante: 'location' as const }]] as const) {
    it(`${nom} : la copropriété (« Corrigé … ») et le bâtiment A (« Enregistré … » puis le changement prévu) ; B en saisie garde « nouveau — … »`, async () => {
      await act(async () => { root.render(createElement(Hote, props)); });
      expect($('[data-dcp-commun] [data-dcp-enregistre]')?.textContent).toBe('Corrigé le 03/11/2026 à 09:15 par Arnaud JOREL');
      const a = $('[data-dcp-batiment="A"]')!;
      expect(a.querySelector('[data-dcp-enregistre]')?.textContent).toBe('Enregistré le 01/11/2026 à 11:00 par Arnaud JOREL');
      expect([...a.querySelectorAll('[data-dcp-prevu-mention]')].map((x) => x.textContent)).toEqual(['Nouveau code prévu le 20/11/2026 à 09:00 — saisi le 16/11/2026 par Arnaud JOREL']);
      // rien d'autre n'a bougé : la valeur, le changement prévu et « Modifier » sont toujours là
      expect(a.querySelector('[data-dcp-lue-valeur]')?.textContent).toContain('A1');
      expect(a.querySelector('[data-dcp-a-venir]')).not.toBeNull();
      expect(a.querySelector('[data-dcp-modifier]')).not.toBeNull();
      // l'ordre : la valeur, puis la mention, puis la ligne du changement prévu
      const ordre = [...a.querySelectorAll('[data-dcp-lue-valeur],[data-dcp-enregistre],[data-dcp-prevu-mention]')].map((x) => x.hasAttribute('data-dcp-lue-valeur') ? 'v' : x.hasAttribute('data-dcp-enregistre') ? 'e' : 'p');
      expect(ordre).toEqual(['v', 'e', 'p']);
      const b = $('[data-dcp-batiment="B"]')!;
      expect(b.querySelector('[data-dcp-enregistre]')).toBeNull();
      await saisir(b.querySelector('[data-dcp-code-batiment]')!, 'B7');
      expect(b.querySelector('[data-dcp-nouveau]')?.textContent).toBe(`nouveau — enregistré avec ${props.modeBien ? 'le bien' : 'la copropriété'}`);
      expect(b.querySelector('[data-dcp-enregistre]')).toBeNull();
    });
  }
  it('la fenêtre « Modifier » : la même mention à côté de chaque code actuel', async () => {
    await act(async () => { root.render(createElement(Hote, { modeBien: false })); });
    await act(async () => { ($('[data-dcp-batiment="A"] [data-dcp-modifier]') as HTMLElement).click(); });
    const f = document.querySelector('[data-dcp-fenetre-modifier]')!;
    expect(f.querySelector('[data-dcp-modifier-place="commun"] [data-dcp-modifier-enregistre]')?.textContent).toBe('Corrigé le 03/11/2026 à 09:15 par Arnaud JOREL');
    expect(f.querySelector('[data-dcp-modifier-place="A"] [data-dcp-modifier-enregistre]')?.textContent).toBe('Enregistré le 01/11/2026 à 11:00 par Arnaud JOREL');
  });
  it('la fiche du bien côté Gestion, hors édition : la mention sous chaque code affiché (copropriété, son bâtiment), avec son « Modifier »', async () => {
    await act(async () => { root.render(createElement(ModifierDigicodesLus, { donnees: { adresseCle: '7 rue x' } as never, s: fiche()[0], batiment: 'A', onPlanifier: async () => null })); });
    expect([...container.querySelectorAll('[data-dcp-lu-place]')].map((p) => [p.getAttribute('data-dcp-lu-place'), p.querySelector('[data-dcp-modifier-lu]') !== null,
      p.querySelector('[data-dcp-enregistre]')?.textContent, [...p.querySelectorAll('[data-dcp-prevu-mention]')].map((x) => x.textContent)])).toEqual([
      ['commun', true, 'Corrigé le 03/11/2026 à 09:15 par Arnaud JOREL', []],
      ['A', true, 'Enregistré le 01/11/2026 à 11:00 par Arnaud JOREL', ['Nouveau code prévu le 20/11/2026 à 09:00 — saisi le 16/11/2026 par Arnaud JOREL']]]);
  });
});
