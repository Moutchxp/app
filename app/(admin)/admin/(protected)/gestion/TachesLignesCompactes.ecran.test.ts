// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableauTaches } from './TableauTaches';
import { CSS_TACHES, MOT_ACTION } from './LigneTache';
import {
  ajouterJours, contactsQuiTiennent, phraseTrace, echeanceCompacte, prenomNom, jourParisDe, MOT_COMPTEUR, MOT_COULEUR, motCompteur, type Tache,
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
let gestes: Record<string, unknown>[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  taches = [
    t({ id: 1, objet: 'Relancer le plombier', jour: ajouterJours(AUJ, -3),
      contactsResume: [{ nom: 'ASHISH Sneh', famille: 'locataire' }, { nom: 'HARB Samer', famille: 'ancien_locataire' }],
      agendaCarte: { etat: 'dans_agenda', texte: '📅 Dans l’agenda Google de Arnaud Jorel', motif: null, peutReessayer: false } }),
    t({ id: 2, objet: 'Visite', heure: '09:30', dureeMinutes: 90 }),
  ];
  ouverts = [];
  gestes = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    const m = /\/taches\/(\d+)$/.exec(url);
    if (m && init?.method === 'PATCH') {
      gestes.push(JSON.parse(String(init.body)));
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
    // LOT TACHES-LIGNE-CONTACTS : plus de « 👤 n contacts » ; à gauche l'adresse et les contacts nommés, à droite confiée + agenda.
    const visible = (el: Element) => { const c = el.cloneNode(true) as Element; c.querySelectorAll('.tch-cts-mesure').forEach((m) => m.remove()); return c.textContent; };
    expect(visible(l.querySelector('.tch-l2-gauche')!)).toBe('7 avenue de l’Union, AsnièresSneh ASHISHSamer HARB');
    expect(l.querySelector('.tch-l2-droite')?.textContent).toBe('→ Arnaud Jorel📆 Dans l’agenda');
    expect(l.querySelector('.tch-l2')?.textContent).not.toContain('contacts');
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
      .toEqual([MOT_ACTION.realisee, MOT_ACTION.annulee, MOT_ACTION.decaler, MOT_ACTION.modifier]);
    await act(async () => { (ligne(1).querySelector('.tch-carte-objet') as HTMLElement).click(); });
    expect(ligne(1).getAttribute('data-depliee')).toBe('non');
  });
  it('🔴 LOT CARTE-BOUTONS — à gauche « Tâche réalisée » puis « Tâche annulée » ; à droite « Décaler » puis « Modifier »', async () => {
    await monter();
    await act(async () => { (ligne(1).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    const mots = (sel: string) => [...ligne(1).querySelectorAll(`${sel} button`)].map((b) => b.textContent);
    expect(mots('.tch-actions > .tch-actions-gauche')).toEqual([MOT_ACTION.realisee, MOT_ACTION.annulee]);
    expect(mots('.tch-actions > .tch-actions-droite')).toEqual([MOT_ACTION.decaler, MOT_ACTION.modifier]);
    expect(CSS_TACHES).toMatch(/\.tch-actions\{justify-content:space-between/);
    expect(CSS_TACHES).toMatch(/\.tch-actions-droite\{margin-left:auto/);
    // La confirmation d'annulation prend la place du bouton, dans le groupe de gauche.
    await act(async () => { (ligne(1).querySelector('[data-action="annuler"]') as HTMLElement).click(); });
    expect(ligne(1).querySelector('.tch-actions-gauche .tch-confirmer')).not.toBeNull();
  });
  it('🔴 LOT CARTE-REPLI-BANDEAU — un clic n’importe où sur le bandeau ramène EXACTEMENT la ligne compacte d’origine', async () => {
    await monter();
    const avant = ligne(1).outerHTML;
    await act(async () => { (ligne(1).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    // Sur le bandeau lui-même (hors du texte du titre) :
    await act(async () => { (ligne(1).querySelector('.tch-carte-titre') as HTMLElement).click(); });
    await calmer();
    expect(ligne(1).outerHTML).toBe(avant);
    // Par le titre (et donc au clavier : Entrée / Espace sur le bouton produisent ce clic) : un seul repli.
    await act(async () => { (ligne(1).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    await act(async () => { (ligne(1).querySelector('.tch-carte-objet') as HTMLElement).click(); });
    await calmer();
    expect(ligne(1).outerHTML).toBe(avant);
  });
  it('🔴 les boutons et liens intérieurs ne replient pas la carte', async () => {
    await monter();
    await act(async () => { (ligne(1).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    for (const sel of ['.tch-actions-droite button', '.tch-bas .tch-lien', '[data-action="annuler"]']) {
      const el = ligne(1).querySelector(sel) as HTMLElement | null;
      if (el === null) continue;
      await act(async () => { el.click(); });
      await calmer();
      expect(ligne(1).classList.contains('tch-carte')).toBe(true);
    }
  });
  it('🔴 LOT TACHES-LIGNE-CONTACTS — chaque contact « Prénom NOM » derrière la pastille de SA famille ; la droite à part', async () => {
    await monter();
    const cts = [...ligne(1).querySelectorAll('[data-contact-ligne]')];
    expect(cts.map((c) => c.textContent)).toEqual(['Sneh ASHISH', 'Samer HARB']);
    expect(cts.map((c) => c.querySelector('.tch-ct-pastille')?.className))
      .toEqual(['tch-ct-pastille tch-ct-pastille--vert', 'tch-ct-pastille tch-ct-pastille--violet']);
    // Les éléments de droite ne cèdent jamais la place ; la gauche (adresse, contacts) se contracte.
    expect(CSS_TACHES).toMatch(/\.tch-l2-droite\{[^}]*flex:0 0 auto !important;margin-left:auto/);
    expect(CSS_TACHES).toMatch(/\.tch-l2-gauche\{[^}]*flex:1 1 0 !important;min-width:0/);
  });
  it('la fonction des contacts qui tiennent : tout, ou ce qui tient AVEC la place de « … +n »', () => {
    expect(contactsQuiTiennent([80, 90], 200, 30)).toBe(2);
    expect(contactsQuiTiennent([80, 90, 70], 200, 30)).toBe(1); // 80 + 8 + 90 > 200 - 30 - 8
    expect(contactsQuiTiennent([300], 200, 30)).toBe(0);
    expect(prenomNom('ASHISH Sneh')).toBe('Sneh ASHISH');
    expect(prenomNom('JULLIEN - GARRIDO Cédric')).toBe('Cédric JULLIEN - GARRIDO');
    expect(prenomNom('SCI DU PARC')).toBe('SCI DU PARC');
    expect(prenomNom('Cabinet Exemple')).toBe('Cabinet Exemple');
    expect(prenomNom('arnaud.jorel@gmail.com')).toBe('arnaud.jorel@gmail.com');
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

describe('🔴 LOT DECALER-DUREE — la durée dans « Décaler »', () => {
  const ouvrirDecaler = async (id: number) => {
    await act(async () => { (ligne(id).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    const b = [...ligne(id).querySelectorAll('button')].find((x) => x.textContent === MOT_ACTION.decaler)!;
    await act(async () => { b.click(); });
  };
  it('rendez-vous : « Durée » entre « Heure » et « Valider », pré-remplie avec la durée de la tâche ; envoyée à « Valider »', async () => {
    await monter();
    await ouvrirDecaler(2);
    const panneau = ligne(2).querySelector('.tch-decaler') as HTMLElement;
    const champs = [...panneau.querySelectorAll('.tch-decaler-choix > *')].map((e) => e.querySelector('.tch-etiquette')?.textContent ?? e.textContent);
    expect(champs).toEqual(['Date', 'Heure (facultative)', 'Durée', 'Valider']);
    const sel = panneau.querySelector('[data-champ-duree-decaler]') as HTMLSelectElement;
    expect(sel.value).toBe('90');
    expect([...sel.options].map((o) => o.textContent)).toContain('1 h (par défaut)');
    await act(async () => {
      const poser = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      poser?.call(sel, '120'); sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const valider = [...panneau.querySelectorAll('button')].find((x) => x.textContent === 'Valider')!;
    await act(async () => { valider.click(); });
    await calmer();
    expect(gestes.at(-1)).toEqual({ geste: 'decaler', jour: AUJ, heure: '09:30', dureeMinutes: 120 });
  });
  it('sans heure : pas de « Durée » ; les raccourcis n’envoient que le raccourci (heure et durée gardées)', async () => {
    await monter();
    await ouvrirDecaler(1);
    expect(ligne(1).querySelector('[data-champ-duree-decaler]')).toBeNull();
    await act(async () => { [...ligne(1).querySelectorAll('button')].find((x) => x.textContent === '+1 jour')!.click(); });
    await calmer();
    expect(gestes.at(-1)).toEqual({ geste: 'decaler', raccourci: '+1j' });
  });
  it('la trace dit l’ancienne et la nouvelle durée quand elle change', () => {
    expect(phraseTrace({ action: 'decalage', avant: { jour: '2026-10-14', heure: '09:30', dureeMinutes: 90 },
      apres: { jour: '2026-10-15', heure: '09:30', dureeMinutes: 120 }, survenuLe: '2026-10-13T10:00:00Z', auteurLibelle: 'Arnaud Jorel' }))
      .toBe('Décalée par Arnaud Jorel le 13/10/2026 à 12:00 (mer. 14/10/2026 à 09:30 → jeu. 15/10/2026 à 09:30, durée 1 h 30 → 2 h)');
    expect(phraseTrace({ action: 'decalage', avant: { jour: '2026-10-14', heure: null }, apres: { jour: '2026-10-15', heure: null },
      survenuLe: '2026-10-13T10:00:00Z', auteurLibelle: 'A' })).not.toContain('durée');
  });
});
