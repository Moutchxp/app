// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableauTaches } from './TableauTaches';
import { CSS_TACHES, MOT_ACTION } from './LigneTache';
import {
  ajouterJours, contactsQuiTiennent, phraseTrace, termineesRecentes, TITRE_TERMINEES, echeanceCompacte, prenomNom, jourParisDe, MOT_COMPTEUR, MOT_COULEUR, motCompteur, type Tache,
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
let ecrits: string[] = [];
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
    if (m) return Response.json({ etat: 'ok', tache: taches.find((x) => x.id === Number(m[1])), traces: [], pieces: [],
      contacts: Number(m[1]) === 1 ? [{ cle: 'locataire:7', famille: 'locataire', nom: 'ASHISH Sneh', qualite: null, organisation: null,
        adresse: null, copieLe: '2026-10-13T08:00:00Z', coordonnees: [{ sorte: 'telephone', libelle: 'Portable', valeur: '0611223344', affichage: '06 11 22 33 44' },
          { sorte: 'email', libelle: null, valeur: 'sneh@exemple.test', affichage: null }] }] : [] });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    if (url.includes('reglage')) return Response.json({ etat: 'ok', envoiMail: false, modifiable: false });
    return Response.json({ etat: 'ok', taches, moi: 2, tronque: false });
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { root.render(createElement(TableauTaches, { onOuvrirBien: (id: number) => { ouverts.push(id); }, onEcrire: (e: string) => { ecrits.push(e); } })); });
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
      .toBe('Décalée du mer. 14/10/2026 à 09:30 au jeu. 15/10/2026 à 09:30, durée 1 h 30 → 2 h par Arnaud Jorel le 13/10/2026 à 12:00'); // LOT GESTION-DECALER-TACHE
    expect(phraseTrace({ action: 'decalage', avant: { jour: '2026-10-14', heure: null }, apres: { jour: '2026-10-15', heure: null },
      survenuLe: '2026-10-13T10:00:00Z', auteurLibelle: 'A' })).not.toContain('durée');
  });
});

describe('🔴 LOT CARTE-CONTACTS-PARTOUT — les contacts de la carte dépliée du récapitulatif', () => {
  it('même encadré que la fiche : liseré de famille, téléphone tel:, e-mail vers le composeur, feuille montée', async () => {
    ecrits = [];
    await monter();
    await act(async () => { (ligne(1).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    const encadre = ligne(1).querySelector('.tchc-encadre') as HTMLElement;
    expect(encadre.className).toBe('tchc-encadre tchc-groupe--vert');
    expect(encadre.querySelector('.tchc-nom')?.textContent).toBe('ASHISH Sneh · Locataire en place');
    expect(encadre.querySelector<HTMLAnchorElement>('a[href^="tel:"]')?.textContent).toBe('06 11 22 33 44');
    await act(async () => { (encadre.querySelector('.tchc-lien-bouton') as HTMLElement).click(); });
    expect(ecrits).toEqual(['sneh@exemple.test']);
    expect([...ligne(1).querySelectorAll('style')].some((st) => (st.textContent ?? '').includes('.tchc-groupe--vert{border-left-color'))).toBe(true);
  });
});

describe('🔴 LOT PASTILLES-FILTRES — les pastilles du récapitulatif filtrent', () => {
  const pastille = (p: string) => container.querySelector<HTMLButtonElement>(`[data-pastille="${p}"]`)!;
  const visibles = () => [...container.querySelectorAll('.tch-zone-liste .tch-liste:not(details .tch-liste) > .tch-ligne')].map((l) => l.getAttribute('data-tache'));
  it('un clic : seulement cette catégorie, pastille en rouge ; re-clic : toutes ; une seule active', async () => {
    await monter();
    expect(visibles()).toEqual(['1', '2']);
    await act(async () => { pastille('retard').click(); });
    expect(visibles()).toEqual(['1']);
    expect(pastille('retard').getAttribute('aria-pressed')).toBe('true');
    expect(pastille('retard').className).toContain('tch-compteur--actif');
    await act(async () => { pastille('jour').click(); });
    expect(visibles()).toEqual(['2']);
    expect(container.querySelectorAll('.tch-compteur--actif')).toHaveLength(1);
    await act(async () => { pastille('jour').click(); });
    expect(visibles()).toEqual(['1', '2']);
    expect(container.querySelectorAll('.tch-compteur--actif')).toHaveLength(0);
  });
  it('se combine avec « qui » ; les compteurs suivent « qui » (pas la pastille) ; vide → message', async () => {
    await monter();
    await act(async () => { pastille('retard').click(); });
    expect(pastille('jour').textContent).toBe('aujourd’hui / demain (1)'); // le compteur ne dépend pas de la pastille
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-filtre-qui="collaborateurs"]')!.click(); });
    expect(visibles()).toEqual([]);
    expect(pastille('retard').textContent).toBe('en retard (0)');
    expect(container.querySelector('.tch-vide-filtre')?.textContent).toBe('Aucune tâche pour ce filtre');
    expect(CSS_TACHES).toMatch(/button\.tch-compteur\.tch-compteur--actif\{background:var\(--tch-rouge-plein\)[^}]*color:#ffffff/);
  });
});

describe('🔴 LOT TERMINEES-7-JOURS — « Faites ou annulées » : les 7 derniers jours, affichage seulement', () => {
  const MAINT = new Date('2026-10-14T10:00:00Z');
  const fin = (jours: number) => new Date(MAINT.getTime() - jours * 86_400_000).toISOString();
  it('6 jours : affichée ; 7 jours : affichée ; 8 jours : masquée ; à faire : jamais dans la section', () => {
    const l = [
      t({ id: 1, etat: 'faite', faiteLe: fin(6) }), t({ id: 2, etat: 'annulee', annuleeLe: fin(7) }),
      t({ id: 3, etat: 'faite', faiteLe: fin(8) }), t({ id: 4 }),
    ];
    expect(termineesRecentes(l, MAINT).map((x) => x.id)).toEqual([1, 2]);
    expect(TITRE_TERMINEES).toBe('Faites ou annulées — 7 derniers jours');
  });
  it('dans le récapitulatif : titre et compte des 7 jours ; la tâche ancienne est masquée, sans aucune écriture', async () => {
    const ecritures: string[] = [];
    const ancienne = t({ id: 30, objet: 'Ancienne', etat: 'faite', faiteLe: '2026-09-01T09:00:00Z', faiteParLibelle: 'A' });
    const recente = t({ id: 31, objet: 'Récente', etat: 'faite', faiteLe: new Date().toISOString(), faiteParLibelle: 'A' });
    vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') !== 'GET') ecritures.push(String(u));
      return String(u).includes('reglage') ? Response.json({ etat: 'ok', envoiMail: false, modifiable: false })
        : Response.json({ etat: 'ok', taches: [t({ id: 32 }), ancienne, recente], moi: 2, tronque: false });
    }));
    await monter();
    expect(container.querySelector('details.tch-terminees summary')?.textContent).toBe('Faites ou annulées — 7 derniers jours (1)');
    expect(container.querySelector('[data-tache="31"]')).not.toBeNull();
    expect(container.querySelector('[data-tache="30"]')).toBeNull();
    expect(ecritures).toEqual([]);
  });
});

describe('🔴 LOT SORTIR-DU-FILTRE — trois sorties du filtre de pastille', () => {
  const pastille = (p: string) => container.querySelector<HTMLButtonElement>(`[data-pastille="${p}"]`)!;
  const visibles = () => [...container.querySelectorAll('.tch-zone-liste .tch-liste:not(details .tch-liste) > .tch-ligne')].map((l) => l.getAttribute('data-tache'));
  const filtrer = async () => { await act(async () => { pastille('retard').click(); }); expect(visibles()).toEqual(['1']); };
  it('« Toutes » du groupe « qui » retire aussi la pastille', async () => {
    await monter(); await filtrer();
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-filtre-qui="toutes"]')!.click(); });
    expect(visibles()).toEqual(['1', '2']);
    expect(container.querySelector('.tch-compteur--actif')).toBeNull();
  });
  it('« Toutes » du groupe « statut » retire aussi la pastille', async () => {
    await monter(); await filtrer();
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-filtre-statut="toutes"]')!.click(); });
    expect(visibles()).toEqual(['1', '2']);
  });
  it('un clic dans une zone vide du bloc retire la pastille ; une ligne ou un bouton, non ; l’écran ne bouge pas', async () => {
    await monter(); await filtrer();
    // Une ligne : elle se déplie, le filtre reste.
    await act(async () => { (ligne(1).querySelector('.tch-l1') as HTMLElement).click(); });
    await calmer();
    expect(visibles()).toEqual(['1']);
    // Un bouton de la carte : le filtre reste.
    await act(async () => { [...ligne(1).querySelectorAll('button')].find((b) => b.textContent === 'Décaler')!.click(); });
    expect(visibles()).toEqual(['1']);
    // La zone vide (le bloc lui-même) : toutes les tâches, et le défilement d'un conteneur est rétabli.
    container.scrollTop = 700;
    await act(async () => { (container.querySelector('.tch-zone-liste') as HTMLElement).click(); container.scrollTop = 0; });
    await calmer();
    expect(visibles()).toEqual(['1', '2']);
    expect(container.scrollTop).toBe(700);
  });
  it('le re-clic sur la pastille active marche toujours', async () => {
    await monter(); await filtrer();
    await act(async () => { pastille('retard').click(); });
    expect(visibles()).toEqual(['1', '2']);
  });
});
