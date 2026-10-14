// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import type { BienClient } from '../../../../lib/gestion/contexteClients';
import type { FamilleAdresse } from '../../../../lib/gestion/familleAdresse';

/**
 * ══ 🔴🔴 LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — DANS LE COMPOSEUR, DE BOUT EN BOUT ══════════════════
 * INCOHÉRENCE D'ARNO : « Arnaud JOREL » (contact et e-mail général du syndic TEST ARNAUD) à trame pleine rose, aucun bien
 * rattaché, bouton « Rattacher / à un logement » immobile. RÈGLE, POUR TOUTES LES FAMILLES : trame pleine ⇔ un bien lié
 * à l'adresse est rattaché ; liée à des biens dont aucun n'est rattaché ⇒ contour + pulsation ; liée à aucun bien ⇒
 * l'aspect d'avant, sans pulsation ; inconnue ⇒ pointillé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, classementDisponible: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
} as ContexteRedactionEcran;
const bien = (cle: string, role: BienClient['role'], nom: string | null): BienClient => ({
  lotId: Number(cle), cle, libelle: `${cle} rue des Tests, 75000 PARIS — lot ${cle}`, categorie: 'logement', role, nom,
});
const BIENS: Record<string, BienClient[]> = {
  // Le cas d'Arno : contact du syndic (2 copropriétés, 3 lots) ET e-mail général (une 3e copropriété, 1 lot).
  'arnaud.jorel@gmail.com': [bien('373', 'syndic_contact', 'JOREL Arnaud'), bien('406', 'syndic_contact', 'JOREL Arnaud'),
    bien('219', 'syndic_contact', 'JOREL Arnaud'), bien('58', 'syndic', 'TEST ARNAUD')],
  'contact.seul@syndic.fr': [bien('219', 'syndic_contact', 'BERCIER Mathis')],
  'general@syndic.fr': [bien('373', 'syndic', 'CABINET'), bien('406', 'syndic', 'CABINET')],
  'gardien@x.fr': [bien('500', 'immeuble', 'MARTIN Paul')],
  'ancien@x.fr': [bien('701', 'ancien_locataire', 'HIRSCH Thibaut'), bien('702', 'ancien_locataire', 'HIRSCH Thibaut')],
  'assistante@x.fr': [bien('800', 'rattache', null)],
  'a.jorel@sansvisavis.com': [],
};
const FAMILLES: Record<string, FamilleAdresse | null> = {
  'arnaud.jorel@gmail.com': { ton: 'syndic', propre: true, nom: null, role: 'Contact du syndic · TEST ARNAUD' },
  'contact.seul@syndic.fr': { ton: 'syndic', propre: true, nom: null, role: 'Contact du syndic · TEST' },
  'general@syndic.fr': { ton: 'syndic', propre: true, nom: null, role: 'Syndic — e-mail général · CABINET' },
  'gardien@x.fr': { ton: 'immeuble', propre: true, nom: null, role: 'Contact de l’immeuble · 74 rue de Normandie' },
  'ancien@x.fr': { ton: 'ancien_locataire', propre: true, nom: 'HIRSCH Thibaut', role: 'Ancien locataire' },
  'assistante@x.fr': { ton: 'proprietaire', propre: false, nom: null, role: 'Contact du propriétaire' },
  'a.jorel@sansvisavis.com': { ton: 'neutre', propre: true, nom: null, role: 'Adresse de l’agence' },
};

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
let ecritures: string[];
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    const q = new URL(`http://x${url}`).searchParams.getAll('a');
    if ((init?.method ?? 'GET') !== 'GET' && !url.includes('/gestion/classement')) ecritures.push(url);
    if (url.includes('/adresses/biens')) return new Response(JSON.stringify({ etat: 'ok', biens: Object.fromEntries(q.map((a) => [a, BIENS[a] ?? []])) }));
    if (url.includes('/adresses/familles')) return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(q.map((a) => [a, FAMILLES[a] ?? null])) }));
    if (url.includes('/gestion/classement') && init?.method === 'POST') {
      // Le moteur ne propose rien pour un contact d'immeuble : aucune partie ne porte son e-mail.
      return new Response(JSON.stringify({ etat: 'ok', contexte: { biens: [], examen: { issue: 'sans_candidat', motif: '' }, proprietaire: null, interneDabord: false, disponible: true } }));
    }
    const lot = /lotCle=(\d+)/.exec(url);
    if (lot) {
      return new Response(JSON.stringify({ etat: 'ok', data: { adresse: `${lot[1]} rue des Tests`, commune: 'PARIS', nature: 'Appartement', typeBien: 'Type 2',
        proprietaires: [{ nom: 'DUPONT', prenom: 'Jean' }], occupants: [] } }));
    }
    if (/\/biens\/\d+\/ecrire/.test(url)) return new Response(JSON.stringify({ etat: 'ok', cible: {}, groupes: [] }));
    return new Response(JSON.stringify({ ok: true, correspondants: [] }));
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const laisser = async () => { for (let i = 0; i < 3; i++) { await act(async () => { vi.advanceTimersByTime(300); }); await calmer(); } };
const NOUVEAU = { id: null, voie: 'nouveau', a: [], cc: [], cci: [], objet: '', corps: '\n\nService Gestion', citation: null,
  destinatairesApproximatifs: false, filId: null, repondALeMessageId: null } as unknown as BrouillonEcran;
const monter = async (b: BrouillonEcran, lotFiche: number | null = null) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    brouillon: courant, contexte: CONTEXTE, lotFiche,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await laisser();
};
const saisie = (l: string) => container.querySelector(`[data-champ="${l}"] input.red-saisie`) as HTMLInputElement;
const taper = async (adresse: string, champ = 'À') => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(saisie(champ), adresse);
    saisie(champ).dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { saisie(champ).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
  await laisser();
};
const cliquer = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click();
  });
  await laisser();
};
const puce = (a: string) => [...container.querySelectorAll('.red-pastille')].find((p) => p.querySelector(`button[aria-label="Retirer ${a}"]`)) as HTMLElement | undefined;
const retirer = async (a: string) => { await cliquer(puce(a)?.querySelector(`button[aria-label="Retirer ${a}"]`) as Element); };
const origines = () => ((courant.cibles ?? []) as Array<{ cle: string; origine?: string }>).map((c) => `${c.cle}:${c.origine ?? 'base'}`).sort();
const pulse = () => container.querySelector('.ccl-case--pulse');
const mention = () => container.querySelector('.ccl-case--pulse .ccl-case-detail--une-ligne')?.textContent ?? null;
const ouvrirModale = async () => { await cliquer(container.querySelector('.ccl-case--rouge, .ccl-case--verte') as Element); };
const carte = (cle: string) => [...container.querySelectorAll('.rec-bien')].find((l) => (l.textContent ?? '').includes(`${cle} rue des Tests`));
const valider = async () => { await cliquer([...container.querySelectorAll('button')].find((b) => /^Valider/.test(b.textContent?.trim() ?? '')) as Element); };
const PLEINE = (ton: string, suffixe = '') => `red-pastille red-pastille--famille red-pastille--${ton}${suffixe}`;
const CONTOUR = (ton: string) => `red-pastille red-pastille--famille red-pastille--${ton} red-pastille--a-choisir`;

describe('🔴 contact du syndic qui suit plusieurs copropriétés (arnaud.jorel@gmail.com)', () => {
  it('contour rose, pulsation « 4 propositions en attente », propositions = les biens de ses copropriétés ; choix ⇒ trame pleine', async () => {
    await monter(NOUVEAU);
    await taper('arnaud.jorel@gmail.com');
    expect(puce('arnaud.jorel@gmail.com')?.className).toBe(CONTOUR('syndic'));
    expect(courant.cibles ?? []).toEqual([]);
    expect(pulse()).not.toBeNull();
    expect(mention()).toBe('4 propositions en attente');
    expect(pulse()?.getAttribute('title')).toBe('Biens à choisir pour Arnaud JOREL (4) — cliquer pour choisir');
    await ouvrirModale();
    expect(['373', '406', '219', '58'].map((k) => carte(k) !== undefined)).toEqual([true, true, true, true]);
    const li = carte('219') as Element;
    expect((li.querySelector('input') as HTMLInputElement).checked).toBe(false);
    expect(li.querySelector('.rec-motif')?.textContent).toBe('contact du syndic, suit la copropriété de ce bien — Arnaud JOREL');
    expect(carte('58')?.querySelector('.rec-motif')?.textContent).toBe('e-mail général du syndic de la copropriété de ce bien — TEST ARNAUD');
    // Les deux lignes propriétaire / locataire, lues sur la fiche du bien.
    // 🔴 LOT COMPOSEUR-BLOC-VERT — comme dans « Modifier le rattachement » : « Locataire (à la date du mail) ».
    expect((li.textContent ?? '').replace(/\s+/g, ' ')).toMatch(/PROPRIÉTAIRE\s*DUPONT Jean.*LOCATAIRE\s*(\(à la date du mail\)\s*)?Vacant/i);
    await cliquer(li.querySelector('input') as Element);
    await valider();
    expect(origines()).toEqual(['219:client']);
    expect(puce('arnaud.jorel@gmail.com')?.className).toBe(PLEINE('syndic'));
    expect(pulse()).toBeNull();
  });
  it('retirer l’adresse retire le bien choisi', async () => {
    await monter(NOUVEAU);
    await taper('arnaud.jorel@gmail.com');
    await ouvrirModale();
    await cliquer(carte('373')?.querySelector('input') as Element);
    await valider();
    expect(origines()).toEqual(['373:client']);
    await retirer('arnaud.jorel@gmail.com');
    expect(origines()).toEqual([]);
  });
});

describe('un seul bien : rattaché d’office (origine « client »), trame pleine', () => {
  it.each([
    ['contact.seul@syndic.fr', 'syndic', '219', ''],
    ['gardien@x.fr', 'immeuble', '500', ''],
    ['assistante@x.fr', 'proprietaire', '800', ' red-pastille--rattache'],
  ])('%s', async (adresse, ton, cle, suffixe) => {
    await monter(NOUVEAU);
    await taper(adresse);
    expect(origines()).toEqual([`${cle}:client`]);
    expect(puce(adresse)?.className).toBe(PLEINE(ton, suffixe));
    expect(pulse()).toBeNull();
    await retirer(adresse);                                     // le bien suit l'adresse
    expect(origines()).toEqual([]);
  });
  it('décoché dans la modale : contour, et le bouton ne repulse pas', async () => {
    await monter(NOUVEAU);
    await taper('gardien@x.fr');
    await ouvrirModale();
    await cliquer(carte('500')?.querySelector('input') as Element);
    await valider();
    expect(origines()).toEqual([]);
    expect(puce('gardien@x.fr')?.className).toBe(CONTOUR('immeuble'));
    expect(pulse()).toBeNull();
  });
});

describe('plusieurs biens, autres familles : contour et pulsation', () => {
  it('e-mail général du syndic', async () => {
    await monter(NOUVEAU);
    await taper('general@syndic.fr');
    expect(puce('general@syndic.fr')?.className).toBe(CONTOUR('syndic'));
    expect(mention()).toBe('2 propositions en attente');
  });
  it('ancien locataire : contour violet ; choix ⇒ trame pleine', async () => {
    await monter(NOUVEAU);
    await taper('ancien@x.fr');
    expect(puce('ancien@x.fr')?.className).toBe(CONTOUR('ancien_locataire'));
    await ouvrirModale();
    expect(carte('702')?.querySelector('.rec-motif')?.textContent).toBe('ancien locataire de ce bien — Thibaut HIRSCH');
    await cliquer(carte('702')?.querySelector('input') as Element);
    await valider();
    expect(puce('ancien@x.fr')?.className).toBe(PLEINE('ancien_locataire'));
  });
});

describe('liée à aucun bien, ou inconnue : inchangé, sans pulsation', () => {
  it('l’adresse de l’agence reste grise ; une inconnue reste en pointillé', async () => {
    await monter({ ...NOUVEAU, cc: ['z@ailleurs.fr'] } as BrouillonEcran);
    await taper('a.jorel@sansvisavis.com');
    expect(puce('a.jorel@sansvisavis.com')?.className).toBe(PLEINE('neutre'));
    expect(puce('z@ailleurs.fr')?.className).toBe('red-pastille red-pastille--inconnue');
    expect(pulse()).toBeNull();
  });
});

describe('🔴 INVARIANT — aucune trame pleine sans bien rattaché, pour toutes les familles, dans À, Cc et Cci', () => {
  it('depuis la fiche d’un AUTRE bien (rien d’office) : toutes les adresses liées à des biens sont en contour', async () => {
    const liees = Object.keys(BIENS).filter((a) => BIENS[a].length > 0);
    const champ = (k: number) => liees.filter((_a, i) => i % 3 === k);
    await monter({ ...NOUVEAU, depuisLeBien: true, a: champ(0), cc: champ(1), cci: champ(2) } as BrouillonEcran, 999);
    for (const a of liees) expect(puce(a)?.className, a).toContain('red-pastille--a-choisir');
    expect(pulse()).not.toBeNull();
  });
  it('en « Nouveau message », chaque adresse seule : trame pleine SEULEMENT si un de ses biens est dans les cibles', async () => {
    for (const a of Object.keys(BIENS)) {
      await monter(NOUVEAU);
      await taper(a);
      const lies = BIENS[a].map((b) => b.cle);
      const rattache = (courant.cibles ?? []).some((c) => lies.includes((c as { cle: string }).cle));
      const classe = puce(a)?.className ?? '';
      if (lies.length > 0 && !rattache) expect(classe, a).toContain('red-pastille--a-choisir');
      if (classe.includes('red-pastille--famille') && !classe.includes('a-choisir') && lies.length > 0) expect(rattache, a).toBe(true);
      act(() => { root.unmount(); }); root = createRoot(container);
    }
  });
});

it('LECTURE SEULE : les biens et les familles sont LUS (GET) ; aucune écriture hors la sauvegarde ordinaire du brouillon', async () => {
  await monter(NOUVEAU);
  await taper('arnaud.jorel@gmail.com');
  await ouvrirModale();
  await cliquer(carte('219')?.querySelector('input') as Element);
  await valider();
  expect(ecritures.filter((u) => !u.endsWith('/api/admin/gestion/brouillons'))).toEqual([]);
});
