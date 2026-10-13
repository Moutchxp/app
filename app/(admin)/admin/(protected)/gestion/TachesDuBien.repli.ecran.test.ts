// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonTache, RecapTachesDuBien } from './TachesDuBien';
import {
  ajouterJours, compterEnAttenteBien, jourParisDe, motEnAttenteBouton, phraseEnAttenteBien, type Tache,
} from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT FICHE-TACHES-EN-ATTENTE — « + Tâche » ROUGE AVEC SON COMPTEUR, ET LE BLOC REPLIÉ PAR DÉFAUT ═════════
 * Demande d'Arno (13/10/2026), sur la fiche du 7 avenue de l'Union. Le VRAI bouton et le VRAI bloc, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AUJ = jourParisDe(new Date());
const t = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 27, lotCle: '26', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'x', note: null,
  jour: AUJ, heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Arnaud Jorel',
  creeLe: '', creeParLibelle: '', majLe: '2026-10-01T08:00:00.000Z', faiteLe: null, faiteParLibelle: null,
  annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, ...p,
});
const acc = (statut: 'en_attente' | 'refusee') => ({
  statut, automatique: false, destinataireId: 3, destinataireLibelle: 'Claire', demandeurId: 2, demandeurLibelle: 'Arnaud',
  demandeLe: '2026-10-01T08:00:00Z', reponduLe: null, reponduParLibelle: null, motif: statut === 'refusee' ? 'Congé' : null,
  mailEtat: 'desactive' as const, mailLe: null,
});

describe('🔴 une seule fonction compte les tâches en attente', () => {
  it('faites et annulées exclues ; en attente d’acceptation et refusées incluses', () => {
    const l = [
      t({ id: 1, jour: ajouterJours(AUJ, -2) }),
      t({ id: 2, acceptation: acc('en_attente') }),
      t({ id: 3, acceptation: acc('refusee'), jour: ajouterJours(AUJ, 9) }),
      t({ id: 4, etat: 'faite', faiteLe: '2026-10-01T09:00:00Z' }),
      t({ id: 5, etat: 'annulee', annuleeLe: '2026-10-01T09:00:00Z' }),
    ];
    expect(compterEnAttenteBien(l)).toBe(3);
    expect(compterEnAttenteBien([])).toBe(0);
  });
  it('singulier / pluriel', () => {
    expect(motEnAttenteBouton(1)).toBe('1 en attente');
    expect(motEnAttenteBouton(2)).toBe('2 en attente');
    expect(phraseEnAttenteBien(1)).toBe('1 tâche en attente sur ce bien');
    expect(phraseEnAttenteBien(2)).toBe('2 tâches en attente sur ce bien');
  });
});

let taches: Tache[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  taches = [
    t({ id: 1, objet: 'Relancer le plombier', jour: ajouterJours(AUJ, -1) }),
    t({ id: 2, objet: 'Visite', acceptation: acc('en_attente') }),
    t({ id: 4, objet: 'Ancienne', etat: 'faite', faiteLe: '2026-10-01T09:00:00Z', faiteParLibelle: 'Arnaud' }),
  ];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const m = /\/taches\/(\d+)$/.exec(String(u));
    if (m && init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body)) as { geste: string };
      taches = taches.map((x) => (x.id === Number(m[1]) && corps.geste === 'faite'
        ? { ...x, etat: 'faite', faiteLe: new Date().toISOString(), faiteParLibelle: 'Arnaud' } : x));
      return Response.json({ etat: 'ok', id: Number(m[1]), message: 'Tâche faite.' });
    }
    return Response.json({ etat: 'ok', taches, moi: 2, tronque: false });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
/** 🔴 LOT TACHES-LIGNES-COMPACTES — les lignes sont repliées par défaut : on les déplie d'un clic, comme Arno. */
const deplierLignes = async (portee: string) => {
  for (const l of [...container.querySelectorAll<HTMLElement>(`${portee} [data-depliee="non"] .tch-l1`)]) {
    await act(async () => { l.click(); });
  }
  await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); });
};
const monter = async (lotId = 27) => {
  await act(async () => {
    root.render(createElement(Fragment, null,
      createElement('div', { id: 'actions' }, createElement(BoutonTache, { lotId, lotCle: '26', adresse: '7 avenue de l’Union' })),
      createElement('div', { id: 'bloc' }, createElement(RecapTachesDuBien, { key: lotId, lotId }))));
  });
  await calmer();
};
const boutonTache = () => container.querySelector<HTMLButtonElement>('#actions button')!;
const repli = () => container.querySelector<HTMLButtonElement>('[data-repli-taches]');
const lignes = () => [...container.querySelectorAll('#bloc .tch-liste:not(details .tch-liste) > .tch-ligne')].map((l) => l.getAttribute('data-tache'));

describe('🔴 le bouton « + Tâche »', () => {
  it('≥ 1 en attente : rouge, « + Tâche » puis « 2 en attente » en petit dessous', async () => {
    await monter();
    expect(boutonTache().classList.contains('tch-btn-attente')).toBe(true);
    expect(boutonTache().querySelector('.tch-btn-attente-mots > span')?.textContent).toBe('+ Tâche');
    expect(boutonTache().querySelector('small')?.textContent).toBe('2 en attente');
  });
  it('0 en attente : inchangé (classes et texte d’avant)', async () => {
    taches = [t({ id: 4, etat: 'faite', faiteLe: '2026-10-01T09:00:00Z' })];
    await monter();
    expect(boutonTache().className).toBe('svv-btn svv-btn-outline gst-btn');
    expect(boutonTache().textContent).toBe('+ Tâche');
    expect(repli()).toBeNull();
    expect(container.querySelector('#bloc')?.innerHTML).toBe('');
  });
  it('le clic ouvre toujours la fenêtre de création', async () => {
    await monter();
    await act(async () => { boutonTache().click(); });
    await calmer();
    expect(container.querySelector('.tchf-titre')?.textContent).toContain('Nouvelle tâche');
  });
});

describe('🔴 le bloc « Tâches de ce bien »', () => {
  it('replié par défaut : une ligne rouge, la phrase, les pastilles, ▸ ; aucune tâche visible', async () => {
    await monter();
    expect(repli()?.getAttribute('aria-expanded')).toBe('false');
    expect(repli()?.querySelector('.tch-repli-phrase')?.textContent).toBe('2 tâches en attente sur ce bien');
    expect(repli()?.querySelectorAll('.tch-pastille')).toHaveLength(2);
    expect(repli()?.querySelector('.tch-repli-fleche')?.textContent).toBe('▸');
    expect(lignes()).toEqual([]);
  });
  it('un clic déplie le bloc tel qu’avant (tâches, Faite, Décaler, « Faites ou annulées ») ; un autre le replie', async () => {
    await monter();
    await act(async () => { repli()!.click(); });
    expect(repli()?.getAttribute('aria-expanded')).toBe('true');
    expect(lignes()).toEqual(['1', '2']);
    await deplierLignes('#bloc');
    // LOT FICHE-CARTE-TACHE, point 8 : plus de seconde ligne « Tâches de ce bien » (doublon de la ligne rouge).
    expect(container.querySelector('#bloc .tch-bloc-titre')).toBeNull();
    expect(container.querySelector('#bloc [data-tache="1"]')?.textContent).toContain('Tâche réalisée');
    expect(container.querySelector('#bloc [data-tache="1"]')?.textContent).toContain('Décaler');
    expect(container.querySelector('#bloc details summary')?.textContent).toBe('Faites ou annulées (1)');
    await act(async () => { repli()!.click(); });
    expect(lignes()).toEqual([]);
  });
  it('reste déplié après « Faite » depuis la fiche ; bouton et bloc recomptés aussitôt', async () => {
    await monter();
    await act(async () => { repli()!.click(); });
    await deplierLignes('#bloc');
    const faite = [...container.querySelectorAll<HTMLButtonElement>('#bloc [data-tache="1"] button')].find((b) => b.textContent?.includes('Tâche réalisée'))!;
    await act(async () => { faite.click(); });
    await calmer();
    expect(repli()?.getAttribute('aria-expanded')).toBe('true');
    expect(lignes()).toEqual(['2']);
    expect(repli()?.querySelector('.tch-repli-phrase')?.textContent).toBe('1 tâche en attente sur ce bien');
    expect(boutonTache().querySelector('small')?.textContent).toBe('1 en attente');
  });
  it('se replie de nouveau à l’ouverture d’une autre fiche', async () => {
    await monter(27);
    await act(async () => { repli()!.click(); });
    expect(lignes()).toEqual(['1', '2']);
    taches = taches.map((x) => ({ ...x, lotId: 28 }));
    await monter(28);
    expect(repli()?.getAttribute('aria-expanded')).toBe('false');
  });
});
