// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableauTaches } from './TableauTaches';
import { figerDefilement, hauteurRetenue, MOT_AUCUNE_TACHE_FILTRE } from './defilementFige';
import { jourParisDe, type Tache } from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT FILTRE-ECRAN-FIXE (Arno, 13/10/2026) — L'ÉCRAN RESTE FIXE AU CHANGEMENT DE FILTRE ══════════════════════
 * Position de défilement rétablie, zone qui garde sa plus grande hauteur, message centré pour un filtre vide.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('🔴 les deux gestes, purs', () => {
  it('figerDefilement note les ancêtres qui défilent et les rétablit', () => {
    const haut = document.createElement('div');
    const milieu = document.createElement('div');
    const cible = document.createElement('div');
    haut.appendChild(milieu); milieu.appendChild(cible); document.body.appendChild(haut);
    haut.scrollTop = 640;
    const retablir = figerDefilement(cible);
    haut.scrollTop = 0; // ce qu'un navigateur fait quand la page raccourcit
    retablir();
    expect(haut.scrollTop).toBe(640);
    haut.remove();
  });
  it('la hauteur retenue ne descend jamais', () => {
    expect(hauteurRetenue(0, 320.4)).toBe(321);
    expect(hauteurRetenue(321, 80)).toBe(321);
    expect(hauteurRetenue(321, 500)).toBe(500);
  });
});

const AUJ = jourParisDe(new Date());
const t = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 27, lotCle: '26', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'x', note: null, jour: AUJ,
  heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Arnaud Jorel', creeLe: '', creeParLibelle: '',
  majLe: '2026-10-01T08:00:00.000Z', faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, ...p,
});
let container: HTMLDivElement;
let root: Root;
let hauteurs: number[];
beforeEach(() => {
  const taches = [t({ id: 1, objet: 'A' }), t({ id: 2, objet: 'B' })];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => (String(u).includes('reglage')
    ? Response.json({ etat: 'ok', envoiMail: false, modifiable: false })
    : Response.json({ etat: 'ok', taches, moi: 2, tronque: false }))));
  // jsdom ne met rien en page : la hauteur du contenu de la liste est servie par le test, rendu après rendu.
  hauteurs = [];
  const avant = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.parentElement?.hasAttribute('data-zone-liste')) {
      const h = this.querySelectorAll('.tch-ligne').length * 70;
      hauteurs.push(h);
      return { height: h, width: 800, top: 0, left: 0, right: 800, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    return avant.call(this);
  });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };

describe('🔴 le récapitulatif', () => {
  it('filtre sans résultat : la zone garde sa plus grande hauteur ; message centré « Aucune tâche pour ce filtre »', async () => {
    await act(async () => { root.render(createElement(TableauTaches, { onOuvrirBien: () => {} })); });
    await calmer();
    const zone = container.querySelector('[data-zone-liste]') as HTMLElement;
    expect(zone.style.minHeight).toBe('140px');
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-filtre-statut="refusee"]')!.click(); });
    await calmer();
    expect(zone.style.minHeight).toBe('140px'); // la page ne se rétracte pas
    const vide = zone.querySelector('.tch-vide-filtre');
    expect(vide?.textContent).toBe(MOT_AUCUNE_TACHE_FILTRE);
    // Retour à « Toutes » : la hauteur reste au maximum atteint, la liste revient.
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-filtre-statut="toutes"]')!.click(); });
    await calmer();
    expect(zone.querySelectorAll('.tch-ligne')).toHaveLength(2);
    expect(zone.style.minHeight).toBe('140px');
  });
  it('🔴 le défilement d’un conteneur ne bouge pas au changement de filtre', async () => {
    const cadre = document.createElement('div');
    container.appendChild(cadre);
    await act(async () => { createRoot(cadre).render(createElement(TableauTaches, { onOuvrirBien: () => {} })); });
    await calmer();
    container.scrollTop = 900;
    // Un navigateur ramènerait le défilement quand la page raccourcit : on le simule au rendu du filtre.
    const original = cadre.querySelector<HTMLButtonElement>('[data-filtre-qui="collaborateurs"]')!;
    await act(async () => { original.click(); container.scrollTop = 0; });
    await calmer();
    expect(container.scrollTop).toBe(900);
  });
});
