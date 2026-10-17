// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement } from './FriseAvancement';
import { PointsTachesFrise } from './PointTacheFrise';
import type { TacheFrise } from '../../../../lib/gestion/tacheFrise';

/**
 * ══ 🔴 LOT GESTION-TACHES-EVENEMENTS — LE POINT ROUGE DANS LA FRISE, LA BULLE, LE CLIC (vrais composants) ══════════
 * Le point à la date de la mission, entre les carrés qui l'encadrent, sans rien déplacer ; gris si annulée ; au survol
 * et au focus, la bulle du récapitulatif (1 élément = 1 ligne) ; au clic, la tâche s'ouvre.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tache = (p: Partial<TacheFrise>): TacheFrise => ({
  id: 41, objet: '_TEST visite', jour: '2026-10-21', heure: '14:30', dureeMinutes: 90, etat: 'a_faire', expediteur: 'Arnaud Jorel',
  adresse: '71 Rue de la République, Puteaux',
  invites: [{ libelle: 'Jean-Baptiste PONS', statut: 'acceptee' }, { libelle: 'Cédric JULLIEN', statut: 'refusee' }],
  contacts: [{ nom: '_TEST M. Martin', role: 'Locataire en place', coordonnees: ['06 00 00 00 01'] }],
  pieces: ['_TEST plan.pdf'], ...p,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('le point et sa bulle', () => {
  it('rouge ; au survol, la bulle : titre, date, envoyé par, un invité par ligne avec son état, adresse, contacts, pièces', async () => {
    const ouverts: number[] = [];
    await act(async () => { root.render(createElement(PointsTachesFrise, { taches: [tache({})], onOuvrir: (id: number) => ouverts.push(id) })); });
    const point = container.querySelector('[data-tache-frise="41"]') as HTMLButtonElement;
    expect(point.dataset.grise).toBe('non');
    expect(point.getAttribute('aria-label')).toContain('Mercredi 21 octobre 2026 · 14 h 30 (1 h 30)');
    await act(async () => { point.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    const bulle = document.querySelector('[data-bulle-tache="41"]') as HTMLElement;
    expect(bulle.classList.contains('cbm-bulle')).toBe(true);
    const lignes = [...bulle.querySelectorAll('li')].map((li) => li.textContent);
    expect(lignes).toEqual([
      'Mercredi 21 octobre 2026 · 14 h 30 (1 h 30)', 'Arnaud Jorel', 'Jean-Baptiste PONS✓ Acceptée', 'Cédric JULLIEN✗ Refusée',
      '71 Rue de la République, Puteaux', '_TEST M. MartinLocataire en place · 06 00 00 00 01', '_TEST plan.pdf',
    ]);
    expect(bulle.textContent).toContain('Tâche · _TEST visite');
    await act(async () => { point.click(); });
    expect(ouverts).toEqual([41]);
  });
  it('au focus clavier aussi ; gris quand la tâche est annulée', async () => {
    await act(async () => { root.render(createElement(PointsTachesFrise, { taches: [tache({ etat: 'annulee' })], onOuvrir: () => {} })); });
    const point = container.querySelector('[data-tache-frise="41"]') as HTMLButtonElement;
    expect(point.dataset.grise).toBe('oui');
    expect(point.className).toContain('fav-point-tache--gris');
    await act(async () => { point.focus(); });
    expect(document.querySelector('[data-bulle-tache="41"]')?.textContent).toContain('Tâche annulée');
  });
});

describe('dans la vraie frise', () => {
  it('le point se glisse entre les carrés qui encadrent la mission ; les carrés gardent leur ordre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      etat: 'ok', ouvert: true, ouvertLe: '2026-10-01 10:00:00', typesAjoutables: [], passagesEnFiableProposes: [],
      etapes: [{
        id: 7, reference: null, type: 'devis_recu', survenuLe: '2026-10-30 10:00:00', heureConnue: false, jourConnu: true, heureFin: null,
        numero: null, rang: null, montantCents: null, texte: null, auteur: null, source: 'manuelle', certitude: 'confirmee', statut: 'vif',
        messageId: null, messageCle: null, filId: null, pieceNom: null, creeParLibelle: 'Arnaud', creeLe: '2026-10-30 10:00:00',
        titre: null, rangPose: 2, poseChoisie: false, rangDevis: null,
      }],
      taches: [tache({})],
    })));
    await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 3 })); });
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    const elements = [...container.querySelectorAll('.fav-piste > li')].map((li) => li.className.replace('fav-el fav-el--', ''));
    const iTache = elements.indexOf('taches');
    expect(iTache).toBeGreaterThan(0);
    // Ouverture (01/10) … point (21/10) … le carré du 30/10 : il tombe ENTRE les deux carrés.
    expect(elements.slice(0, iTache).filter((x) => x === 'carre')).toHaveLength(1);
    expect(elements.slice(iTache).filter((x) => x === 'carre')).toHaveLength(1);
    expect(container.querySelector('[data-tache-frise="41"]')).not.toBeNull();
  });
});
