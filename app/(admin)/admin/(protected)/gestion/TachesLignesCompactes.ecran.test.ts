// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableauTaches } from './TableauTaches';
import { CSS_TACHES, MOT_ACTION } from './LigneTache';
import {
  ajouterJours, echeanceCompacte, jourParisDe, MOT_COMPTEUR, MOT_COULEUR, motCompteur, type Tache,
} from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT TACHES-LIGNES-COMPACTES (Arno, 13/10/2026) ═══════════════════════════════════════════════════════════
 * Compteurs « libellé (n) » ; « Dans 2 jours » ; pas de date pour aujourd'hui / demain / 2 jours, la date pour plus tard
 * et en retard ; ligne repliée de deux lignes sans boutons ; un clic déplie la carte (tous les boutons), un autre la
 * replie ; l'adresse ouvre la fiche sans déplier ; après une action, la carte reste dépliée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-10-13T13:00:00Z'); // 15 h à Paris
describe('🔴 libellés, compteurs, échéance', () => {
  it('compteurs entre parenthèses ; « Dans 2 jours » partout', () => {
    expect(motCompteur('jour', 1)).toBe('aujourd’hui / demain (1)');
    expect(motCompteur('proche', 1)).toBe('dans 2 jours (1)');
    expect(motCompteur('plus_tard', 3)).toBe('plus tard (3)');
    expect(motCompteur('retard', 2)).toBe('en retard (2)');
    expect(MOT_COMPTEUR.proche).toBe('dans 2 jours');
    expect(MOT_COULEUR.proche).toBe('Dans 2 jours');
  });
  it('aujourd’hui, demain, 2 jours : le libellé (et l’heure), sans date ; plus tard et en retard : la date', () => {
    const e = (jour: string, heure: string | null = null) => echeanceCompacte({ jour, heure, etat: 'a_faire' }, MAINTENANT);
    expect(e('2026-10-13', '09:30')).toBe('Aujourd’hui · 9 h 30');
    expect(e('2026-10-14')).toBe('Demain');
    expect(e('2026-10-15', '16:00')).toBe('Dans 2 jours · 16 h');
    expect(e('2026-10-16', '16:30')).toBe('ven. 16 oct. · 16 h 30');
    expect(e('2026-10-10')).toBe('sam. 10 oct. · journée');
  });
});

const AUJ = jourParisDe(new Date());
const t = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 27, lotCle: '26', adresseBien: '7 avenue de l’Union, Asnières', evenement: null, objet: 'x', note: null,
  jour: AUJ, heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Arnaud Jorel', creeLe: '', creeParLibelle: '',
  majLe: '2026-10-01T08:00:00.000Z', faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 2, ...p,
});
let taches: Tache[];
let ouverts: number[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  taches = [
    t({ id: 1, objet: 'Relancer le plombier', jour: ajouterJours(AUJ, -3),
      agendaCarte: { etat: 'dans_agenda', texte: '📅 Dans l’agenda Google de Arnaud Jorel', motif: null, peutReessayer: false } }),
    t({ id: 2, objet: 'Visite', heure: '09:30' }),
  ];
  ouverts = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    const m = /\/taches\/(\d+)$/.exec(url);
    if (m && init?.method === 'PATCH') {
      taches = taches.map((x) => (x.id === Number(m[1]) ? { ...x, etat: 'faite', faiteLe: new Date().toISOString(), faiteParLibelle: 'Arnaud' } : x));
      return Response.json({ etat: 'ok', id: Number(m[1]), message: 'Tâche faite.' });
    }
    if (m) return Response.json({ etat: 'ok', tache: taches.find((x) => x.id === Number(m[1])), traces: [], contacts: [], pieces: [] });
    if (url.includes('reglage')) return Response.json({ etat: 'ok', envoiMail: false, modifiable: false });
    return Response.json({ etat: 'ok', taches, moi: 2, tronque: false });
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { root.render(createElement(TableauTaches, { onOuvrirBien: (id: number) => { ouverts.push(id); } })); });
  await calmer();
};
const ligne = (id: number) => container.querySelector(`[data-tache="${id}"]`) as HTMLElement;

describe('🔴 la ligne repliée', () => {
  it('compteurs « libellé (n) » en tête du récapitulatif', async () => {
    await monter();
    expect(container.querySelector('.tch-compteurs')?.textContent).toContain('en retard (1)aujourd’hui / demain (1)');
  });
  it('deux lignes, aucun bouton d’action ; ligne 1 = libellé/date + titre ; ligne 2 = adresse · confiée · contacts · agenda', async () => {
    await monter();
    const l = ligne(1);
    expect(l.getAttribute('data-depliee')).toBe('non');
    expect([...l.children].map((c) => c.className)).toEqual(['tch-l1', 'tch-l2']);
    expect(l.querySelector('.tch-l1 b.tch-date')?.textContent).toMatch(/^[a-z]{3}\. \d+ [a-zé]+\.? · journée$/); // en retard : la date
    expect(l.querySelector('.tch-l1-titre')?.textContent).toBe('Relancer le plombier');
    expect(l.querySelector('.tch-l2')?.textContent).toBe('7 avenue de l’Union, Asnières→ Arnaud Jorel👤 2 contacts📆 Dans l’agenda');
    expect(l.querySelector('.tch-actions')).toBeNull();
    expect(ligne(2).querySelector('.tch-l1 b.tch-date')?.textContent).toBe('Aujourd’hui · 9 h 30');
    // Deux lignes AU PLUS : rien ne passe à la ligne, l'excès s'efface (« … »).
    expect(CSS_TACHES).toMatch(/\.tch-l1,\.tch-l2\{[^}]*white-space:nowrap;overflow:hidden/);
  });
  it('un clic déplie la carte (tous les boutons) ; un clic sur son bandeau la replie', async () => {
    await monter();
    await act(async () => { (ligne(1).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    expect(ligne(1).classList.contains('tch-carte')).toBe(true);
    expect([...ligne(1).querySelectorAll('.tch-actions button')].map((b) => b.textContent))
      .toEqual([MOT_ACTION.realisee, MOT_ACTION.decaler, MOT_ACTION.modifier, MOT_ACTION.annulee]);
    await act(async () => { (ligne(1).querySelector('.tch-carte-objet') as HTMLElement).click(); });
    expect(ligne(1).getAttribute('data-depliee')).toBe('non');
  });
  it('le clic sur l’adresse ouvre la fiche, sans déplier', async () => {
    await monter();
    await act(async () => { (ligne(2).querySelector('[data-action="ouvrir-bien"]') as HTMLElement).click(); });
    expect(ouverts).toEqual([27]);
    expect(ligne(2).getAttribute('data-depliee')).toBe('non');
  });
  it('après « Tâche réalisée », la carte reste dépliée (dans « Faites ou annulées », ouvert)', async () => {
    await monter();
    await act(async () => { (ligne(2).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    const b = [...ligne(2).querySelectorAll('button')].find((x) => x.textContent === MOT_ACTION.realisee)!;
    await act(async () => { b.click(); });
    await calmer();
    expect(ligne(2).classList.contains('tch-carte')).toBe(true);
    expect((ligne(2).closest('details') as HTMLDetailsElement).open).toBe(true);
  });
});
