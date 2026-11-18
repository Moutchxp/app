// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatutDuBien } from './StatutDuBien';
import { gestesPour, type StatutBien } from '../../../../lib/gestion/statutBien';

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien ») — le geste de statut de la fiche : le n° de mandat proposé est contrôlé par le serveur ; déjà utilisé pour
 * un autre bien du même propriétaire → « Le mandat n° X est déjà utilisé pour … de ce propriétaire. L'utiliser aussi pour ce bien ? » (Confirmer /
 * Corriger), dans la fenêtre du geste ; rien n'est écrit avant « Confirmer ». Le vrai composant, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
let lu: { statut: StatutBien; suitLot?: { id: number; adresse: string; commune: string } | null; disponible?: boolean };
let posts: Record<string, unknown>[];
let repondre: Record<string, unknown>;
let hote: HTMLDivElement;
let racine: Root;
let changes: number;
let drive: Record<string, unknown> | null;
beforeEach(() => {
  // La racine du thème : la modale s'y rend (portail).
  const adm = document.createElement('div'); adm.className = 'svv-adm-root'; document.body.appendChild(adm);
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); posts = []; changes = 0; drive = null;
  lu = { statut: 'en_gestion' };
  repondre = { etat: 'ok', data: { avant: 'en_gestion', apres: 'location_seule', lots: [10, 11], avertissement: null }, mail: { envoye: true, ignore: false, motif: null } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      if (corps.action === 'dossier-drive-bien') { drive = { ...drive, etat: { etat: 'ok' } }; return reponse({ etat: 'ok', data: { driveId: 'N5', geste: 'cree' } }); }
      return reponse(repondre);
    }
    if (u.includes('?statut=')) {
      const disponible = lu.disponible ?? true;
      const suitLot = lu.suitLot ?? null;
      return reponse({ etat: 'ok', data: { disponible, lotId: 10, statut: lu.statut, depuis: '2026-09-01', suitLot, archiveLe: (lu as Record<string, unknown>).archiveLe,
        gestes: disponible && suitLot === null ? gestesPour(lu.statut) : [] } });
    }
    if (u.includes('?driveBien=')) return reponse({ etat: 'ok', data: drive });
    if (u.includes('?transitions=')) {
      return reponse({ etat: 'ok', data: [
        { id: 2, avant: 'en_gestion', apres: 'location_seule', effetLe: '2026-10-20', source: 'geste', viaLotId: null, motif: 'mandat résilié', mandat: null, par: 'Arno', quand: '2026-10-21 10:00:00+02' },
        { id: 1, avant: null, apres: 'en_gestion', effetLe: '2025-08-05', source: 'reprise', viaLotId: null, motif: null, mandat: null, par: 'reprise (migration 403)', quand: '2026-10-21 09:00:00+02' },
      ] });
    }
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }); };
const monter = async (modifiable = true) => {
  await act(async () => { racine.render(createElement(StatutDuBien, { lotId: 10, modifiable, onChange: () => { changes += 1; } })); });
  await calmer();
};
const gestes = () => [...hote.querySelectorAll('[data-geste-statut]')].map((b) => b.textContent);
const clic = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const modale = () => document.querySelector('[data-modale-issue]');
const bouton = (repere: string) => document.querySelector(`[data-${repere}]`);
const saisir = async (el: Element | null, v: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el!.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const PHRASE = 'Le mandat n° MG 41 est déjà utilisé pour 4 rue _TEST MANDAT de ce propriétaire. L’utiliser aussi pour ce bien ?';
describe('🔴 le n° de mandat du geste, déjà utilisé', () => {
  it('« à confirmer » : la question dans la fenêtre du geste ; « Corriger » la referme sans rien renvoyer ; « Confirmer » renvoie avec la confirmation', async () => {
    lu = { statut: 'location_seule' };
    repondre = { etat: 'mandat_a_confirmer', motif: PHRASE };
    await monter();
    await clic(hote.querySelector('[data-geste-statut="passer-en-gestion"]'));
    await saisir(document.querySelector('[data-mandat-propose] input'), 'MG 41');
    await clic(bouton('statut-confirmer'));
    expect(posts[0]).not.toHaveProperty('confirmeMandat');
    expect(document.querySelector('[data-mandat-a-confirmer]')?.textContent).toContain(PHRASE);
    expect(changes).toBe(0);
    await clic(document.querySelector('[data-mandat-corriger]'));
    expect(document.querySelector('[data-mandat-a-confirmer]')).toBeNull();
    expect(posts).toHaveLength(1);
    await clic(bouton('statut-confirmer'));
    repondre = { etat: 'ok', data: { avant: 'location_seule', apres: 'en_gestion', lots: [10], avertissement: null } };
    await clic(document.querySelector('[data-mandat-confirmer]'));
    expect(posts.at(-1)).toMatchObject({ action: 'statut-bien', vers: 'en_gestion', confirmeMandat: true, mandat: { sorte: 'gestion', numero: 'MG 41' } });
    expect(changes).toBe(1);
  });
});
