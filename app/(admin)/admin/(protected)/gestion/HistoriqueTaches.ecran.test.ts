// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HistoriqueTaches } from './HistoriqueTaches';

/**
 * ══ 🔴 LOT GESTION-HISTORIQUE-TACHES — « HISTORIQUE DES TÂCHES (N) » (vrai composant, route simulée) ════════════════
 * Absent sans tâche validée ; repliée ; dépliée : une ligne par tâche validée, la plus récente en haut (date de mission,
 * titre, acceptants, état) ; survol : la bulle du récapitulatif ; clic : la tâche s'ouvre.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tache = (id: number, jour: string, statut: string, etat = 'a_faire', heure: string | null = null) => ({
  id, lotId: 3, lotCle: 'L3', adresseBien: '71 Rue de la République, Puteaux', evenement: null, objet: `Tâche ${id}`, note: null, jour, heure,
  rappels: [], etat, confieeA: 5, confieeALibelle: 'Jean-Baptiste PONS', creeLe: '', creeParLibelle: 'Arnaud Jorel', majLe: '',
  faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0,
  invites: [{ inviteId: id, collaborateurId: 5, libelle: 'Jean-Baptiste PONS', principal: true, statut, automatique: false, motif: null,
    reponduLe: null, demandeLe: null, mailEtat: 'envoye', dernierRenvoiLe: null }],
  contacts: [], pieces: [],
});
let liste: unknown[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    if (url.includes('/api/admin/gestion/taches?bien=3')) return Response.json({ etat: 'ok', taches: liste, moi: 2, tronque: false });
    return Response.json({});
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
const monter = async () => {
  await act(async () => { root.render(createElement(HistoriqueTaches, { lotId: 3 })); });
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
};

describe('« Historique des tâches (N) »', () => {
  it('aucune tâche validée (en attente, refusée, annulée) : la ligne n’apparaît pas', async () => {
    liste = [tache(1, '2026-10-21', 'en_attente'), tache(2, '2026-10-22', 'refusee'), tache(3, '2026-10-23', 'acceptee', 'annulee')];
    await monter();
    expect(container.querySelector('[data-historique-taches]')).toBeNull();
  });
  it('3 validées : repliée avec le compte ; dépliée, la plus récente en haut ; bulle au survol ; clic → la tâche', async () => {
    liste = [tache(1, '2026-09-10', 'acceptee'), tache(2, '2026-11-05', 'acceptee', 'faite', '15:00'), tache(3, '2026-10-01', 'acceptee'),
      tache(4, '2026-12-01', 'en_attente')];
    await monter();
    const s = container.querySelector('[data-historique-taches]') as HTMLElement;
    expect(s.querySelector('.hdb-replier')?.textContent).toBe('▶Historique des tâches3');
    expect(s.querySelector('.hdt-liste')).toBeNull();
    await act(async () => { (s.querySelector('.hdb-replier') as HTMLButtonElement).click(); });
    const lignes = [...s.querySelectorAll('[data-tache-historique]')] as HTMLElement[];
    expect(lignes.map((l) => l.dataset.tacheHistorique)).toEqual(['2', '3', '1']);
    expect(lignes[0].textContent).toBe('Jeudi 5 novembre 2026 · 15 h 00 (1 h)Tâche 2Jean-Baptiste PONSRéalisée');
    expect(lignes[1].textContent).toContain('Acceptée');
    await act(async () => { lignes[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(document.querySelector('[data-bulle-tache="2"]')?.textContent).toContain('Tâche · Tâche 2');
    await act(async () => { lignes[0].click(); });
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(document.querySelector('.tchf[role="dialog"]')).not.toBeNull();
  });
});
