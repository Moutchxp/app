// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { HistoriqueStatut, StatutDuBien } from './StatutDuBien';
import { gestesPour, type StatutBien } from '../../../../lib/gestion/statutBien';

/**
 * 🔴 Arno (21/10/2026, 403) — LE STATUT DU BIEN SUR SA FICHE (Gestion ET Location : la même fiche) :
 *   · la pastille (vert / bleu / gris) et sa date ; les gestes du statut, et seulement eux ; aucun geste sans le droit d'écrire ;
 *   · chaque geste passe par une CONFIRMATION : la sortie de gestion EXIGE une destination ; date d'effet, motif, mandat proposé ;
 *   · une annexe rattachée : « elle suit son bien principal », aucun geste ;
 *   · l'Historique dit les transitions.
 * Le vrai composant, routes simulées : rien n'est écrit.
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

describe('🔴 le statut du bien sur sa fiche', () => {
  it('la pastille et sa teinte, la date ; chaque statut offre SES gestes', async () => {
    await monter();
    expect(hote.querySelector('.sdb-ligne [data-statut-bien]')?.className).toContain('sdb-pastille--vert');
    expect(hote.querySelector('.sdb-ligne')?.textContent).toContain('En gestiondepuis le 01/09/2026');
    expect(gestes()).toEqual(['Sortie de gestion']);
    act(() => racine.unmount()); racine = createRoot(hote);
    lu = { statut: 'location_seule' };
    await monter();
    expect(hote.querySelector('.sdb-ligne [data-statut-bien]')?.className).toContain('sdb-pastille--bleu');
    expect(gestes()).toEqual(['Passer en gestion']);
    act(() => racine.unmount()); racine = createRoot(hote);
    lu = { statut: 'ancienne_gestion' };
    await monter();
    expect(hote.querySelector('.sdb-ligne [data-statut-bien]')?.className).toContain('sdb-pastille--gris');
    expect(gestes()).toEqual(['Reprendre en gestion', 'Remettre en location seule']);
  });

  it('sans le droit d’écrire, ou sans la 403 : la pastille seule, aucun geste', async () => {
    await monter(false);
    expect(hote.querySelector('[data-statut-du-bien]')).not.toBeNull();
    expect(gestes()).toEqual([]);
    act(() => racine.unmount()); racine = createRoot(hote);
    lu = { statut: 'en_gestion', disponible: false };
    await monter(true);
    expect(gestes()).toEqual([]);
  });

  it('une annexe RATTACHÉE suit son bien principal : elle le dit, sans geste', async () => {
    lu = { statut: 'en_gestion', suitLot: { id: 436, adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS' } };
    await monter();
    expect(hote.querySelector('[data-statut-suit="436"]')?.textContent).toContain('elle suit le statut de son bien principal');
    expect(gestes()).toEqual([]);
  });

  it('SORTIE DE GESTION : confirmation, destination OBLIGATOIRE (rien ne part sans elle), mandat de transaction proposé pour la location seule', async () => {
    await monter();
    await clic(hote.querySelector('[data-geste-statut="sortie-de-gestion"]'));
    expect(modale()?.querySelector('h2')?.textContent).toBe('⚠ Sortie de gestion ?');
    expect([...document.querySelectorAll('[data-destination]')].map((r) => (r as HTMLInputElement).value)).toEqual(['ancienne_gestion', 'location_seule']);
    expect([...document.querySelectorAll('[data-destination]')].some((r) => (r as HTMLInputElement).checked)).toBe(false);
    // Le focus va sur « Annuler » : jamais sur le geste qui écrit.
    expect(document.activeElement?.hasAttribute('data-statut-annuler')).toBe(true);
    await clic(bouton('statut-confirmer'));
    expect(posts).toEqual([]);
    expect(document.querySelector('[data-refus-statut]')?.textContent).toBe('Choisissez la destination du bien.');
    await clic(document.querySelector('[data-destination="location_seule"]'));
    expect(document.querySelector('[data-mandat-propose]')?.getAttribute('data-mandat-propose')).toBe('transaction');
    await saisir(document.querySelector('[data-motif-statut]'), 'mandat de gestion résilié');
    await clic(bouton('statut-confirmer'));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'statut-bien', id: 10, vers: 'location_seule', motif: 'mandat de gestion résilié', mandat: null });
    expect(posts[0].effetLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(modale()).toBeNull();
    expect(hote.querySelector('.sdb-notes')?.textContent).toContain('le bien est désormais « Location seule »');
    expect(hote.querySelector('.sdb-notes')?.textContent).toContain('Son annexe rattachée a suivi.');
    expect(changes).toBe(1);
  });

  it('« Ancienne gestion » : aucun mandat proposé ; « Annuler » ne poste rien', async () => {
    await monter();
    await clic(hote.querySelector('[data-geste-statut="sortie-de-gestion"]'));
    await clic(document.querySelector('[data-destination="ancienne_gestion"]'));
    expect(document.querySelector('[data-mandat-propose]')).toBeNull();
    await clic(bouton('statut-annuler'));
    expect(modale()).toBeNull();
    expect(posts).toEqual([]);
  });

  it('PASSER EN GESTION : destination unique, mandat de gestion proposé et envoyé s’il est saisi ; un refus du serveur reste dans la modale', async () => {
    lu = { statut: 'location_seule' };
    repondre = { etat: 'refus', motif: 'La date d’effet ne peut pas être dans le futur : le statut change aujourd’hui.' };
    await monter();
    await clic(hote.querySelector('[data-geste-statut="passer-en-gestion"]'));
    expect(document.querySelectorAll('[data-destination]')).toHaveLength(0);
    expect(document.querySelector('[data-mandat-propose]')?.getAttribute('data-mandat-propose')).toBe('gestion');
    await saisir(document.querySelector('[data-mandat-propose] input'), 'MG 2026-050');
    await clic(bouton('statut-confirmer'));
    expect(posts[0]).toMatchObject({ vers: 'en_gestion', mandat: { sorte: 'gestion', numero: 'MG 2026-050', signeLe: null } });
    expect(modale()).not.toBeNull();
    expect(document.querySelector('[data-refus-statut]')?.textContent).toBe('La date d’effet ne peut pas être dans le futur : le statut change aujourd’hui.');
    expect(changes).toBe(0);
  });

  it('l’Historique : les transitions, du plus récent', async () => {
    await act(async () => { racine.render(createElement(HistoriqueStatut, { lotId: 10 })); });
    await calmer();
    expect(hote.querySelector('[data-historique-statut] .gst-compte')?.textContent).toBe('2');
    await clic(hote.querySelector('[data-historique-statut] .hdb-replier'));
    const lignes = [...hote.querySelectorAll('[data-transition-statut]')].map((l) => l.textContent);
    expect(lignes[0]).toContain('au 20/10/2026');
    expect(lignes[0]).toContain('En gestion → Location seule');
    expect(lignes[0]).toContain('mandat résilié');
    expect(lignes[1]).toContain('reprise');
  });

  it('posé sur la fiche du bien (la même pour la Gestion et la Location), et dans son Historique', () => {
    const annuaire = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(annuaire).toMatch(/<StatutDuBien lotId=\{Number\(f\.id\)\} modifiable=\{gestes\.modifiable\}/);
    const histo = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
    expect(histo).toMatch(/<HistoriqueStatut lotId=\{lotId\} \/>/);
  });

  it('🔴 404 — le dossier Drive : « à créer » + « Créer le dossier » ; « à déplacer » + « Déplacer maintenant » ; à sa place : dit sobrement', async () => {
    drive = { etat: { etat: 'a_creer' }, libelleAttendu: 'Base de données location seule', libelleActuel: null };
    await monter();
    expect(hote.querySelector('[data-drive-etat="a_creer"]')?.textContent).toContain('Dossier Drive à créer — dans « Base de données location seule »');
    await clic(hote.querySelector('[data-drive-geste="creer"]'));
    expect(posts.at(-1)).toEqual({ action: 'dossier-drive-bien', id: 10, geste: 'creer' });
    expect(hote.querySelector('[data-drive-etat="ok"]')?.textContent).toBe('Dossier Drive : Base de données location seule');
    act(() => racine.unmount()); racine = createRoot(hote);
    drive = { etat: { etat: 'a_deplacer' }, libelleAttendu: 'Base de données location seule', libelleActuel: 'Base de données locative › Actifs' };
    await monter();
    expect(hote.querySelector('[data-drive-etat="a_deplacer"]')?.textContent).toContain('de « Base de données locative › Actifs » vers « Base de données location seule »');
    await clic(hote.querySelector('[data-drive-geste="deplacer"]'));
    expect(posts.at(-1)).toEqual({ action: 'dossier-drive-bien', id: 10, geste: 'deplacer' });
    // Sans le droit d'écrire : l'état est dit, sans bouton.
    act(() => racine.unmount()); racine = createRoot(hote);
    drive = { etat: { etat: 'a_deplacer' }, libelleAttendu: 'X', libelleActuel: 'Y' };
    await monter(false);
    expect(hote.querySelector('[data-drive-etat="a_deplacer"]')).not.toBeNull();
    expect(hote.querySelector('[data-drive-geste]')).toBeNull();
  });

  it('🔴 404 — une transition dont le déplacement Drive échoue : le statut est enregistré, la note le dit', async () => {
    repondre = { ...repondre, drive: { ok: false, motif: 'RECETTE — écriture dans le Drive non effectuée' } };
    await monter();
    await clic(hote.querySelector('[data-geste-statut="sortie-de-gestion"]'));
    await clic(document.querySelector('[data-destination="ancienne_gestion"]'));
    await clic(bouton('statut-confirmer'));
    expect(hote.querySelector('.sdb-notes')?.textContent).toContain('Statut enregistré, mais le dossier Drive n’a pas été déplacé : RECETTE — écriture dans le Drive non effectuée.');
  });

  it('🔴 405 — ancienne gestion : « Gestion terminée » tant qu’elle n’est pas archivée ; archivée : « Ancienne gestion · archivé le … » ; mêmes gestes', async () => {
    lu = { statut: 'ancienne_gestion' };
    (lu as Record<string, unknown>).archiveLe = null;
    await monter();
    expect(hote.querySelector('.sdb-ligne [data-statut-bien]')?.textContent).toBe('Gestion terminée');
    expect(gestes()).toEqual(['Reprendre en gestion', 'Remettre en location seule']);
    act(() => racine.unmount()); racine = createRoot(hote);
    (lu as Record<string, unknown>).archiveLe = '2028-10-21 05:15:00+02';
    await monter();
    expect(hote.querySelector('.sdb-ligne [data-statut-bien]')?.textContent).toBe('Ancienne gestion');
    expect(hote.querySelector('.sdb-ligne')?.textContent).toContain('· archivé le 21/10/2028');
    expect(gestes()).toEqual(['Reprendre en gestion', 'Remettre en location seule']);
  });
});
