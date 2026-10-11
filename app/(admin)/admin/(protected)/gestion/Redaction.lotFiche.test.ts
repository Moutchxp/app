// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';

/**
 * ══ 🔴🔴 LOT SUGGESTIONS-DANS-TOUS-COMPOSEURS-DEPUIS-BIEN ════════════════════════════════════════════════════════════
 * Depuis la FICHE D'UN BIEN, tous les composeurs proposent dans À / Cc / Cci les contacts de l'historique de ce bien,
 * avec les mécaniques d'« Écrire depuis gestion@ » : trois groupes dans l'ordre, filtre, fermeture, puces colorées.
 * Une seule implémentation : la propriété `lotFiche` de `Redaction`. Hors fiche (Réception…) : rien ne change.
 * Le contenu pré-rempli d'une réponse ou d'un transfert ne bouge pas.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
};
const GROUPES = rangerSuggestions({
  clients: [
    { adresse: 'proprio@x.fr', nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: 'M.', nomFamille: 'DUPONT' },
    { adresse: 'loc@x.fr', nom: 'ROI Léa', role: 'Locataire', ton: 'locataire', propre: true, civilite: 'Mme', nomFamille: 'ROI' },
  ],
  immeuble: [{ adresse: 'syndic@x.fr', nom: 'Cabinet', role: 'Syndic — e-mail général', ton: 'syndic', propre: true, civilite: null, nomFamille: null }],
  autres: [{ adresse: 'artisan@x.fr', nom: 'Plomberie', role: 'vue dans 2 mails du bien', ton: 'neutre', propre: true, civilite: null, nomFamille: null }],
});
const CITATION = 'Le 10/10/2026, Léa a écrit :\n> Humidité près des fenêtres';
const BASE = { id: null, cc: [] as string[], cci: [] as string[], destinatairesApproximatifs: false, filId: 10 };
const COMPOSEURS: Array<[string, BrouillonEcran]> = [
  ['Répondre', { ...BASE, voie: 'repondre', a: ['loc@x.fr'], objet: 'Re: Humidité près des fenêtres', corps: '\n\nService Gestion',
    citation: CITATION, repondALeMessageId: 77 } as BrouillonEcran],
  ['Répondre à tous', { ...BASE, voie: 'repondre_tous', a: ['loc@x.fr'], cc: ['syndic@x.fr', 'z@ailleurs.fr'],
    objet: 'Re: Humidité près des fenêtres', corps: '\n\nService Gestion', citation: CITATION, repondALeMessageId: 77 } as BrouillonEcran],
  ['Transférer', { ...BASE, voie: 'transferer', a: [], objet: 'Tr: Humidité près des fenêtres', corps: '\n\nService Gestion',
    citation: CITATION, repondALeMessageId: 77 } as BrouillonEcran],
  ['Nouveau message', { ...BASE, voie: 'nouveau', a: [], objet: '', corps: '\n\nService Gestion', citation: null, filId: null,
    repondALeMessageId: null } as BrouillonEcran],
];

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
let appels: string[];
let changements: number;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; changements = 0;
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    appels.push(url);
    if (url.includes('/biens/176/ecrire')) return new Response(JSON.stringify({ etat: 'ok', groupes: GROUPES }));
    if (url.includes('/adresses/familles')) {
      const voulues = new URL(`http://x${url}`).searchParams.getAll('a');
      return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(voulues.map((a) => [a, null])) }));
    }
    return new Response(JSON.stringify({ ok: true, correspondants: [] }));
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (b: BrouillonEcran, lotFiche: number | null) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    brouillon: courant, contexte: CONTEXTE, lotFiche,
    onChange: (n: BrouillonEcran) => { changements += 1; courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
  await act(async () => { vi.advanceTimersByTime(300); });
  await calmer();
};
const ligne = (l: string) => container.querySelector(`[data-champ="${l}"]`) as HTMLElement;
const saisie = (l: string) => ligne(l).querySelector('input.red-saisie') as HTMLInputElement;
const cliquer = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click();
  });
  await calmer();
};
const titres = (l: string) => [...ligne(l).querySelectorAll('.red-sugg-titre')].map((t) => t.textContent);
const options = (l: string) => [...ligne(l).querySelectorAll('[role="option"]')].map((o) => o.querySelector('.red-sugg-texte .red-sugg-adresse')?.textContent ?? o.textContent);
const ouvrirCc = async () => { if (ligne('Cc') === null) await cliquer(container.querySelector('[data-bascule="Cc"]') as Element); };

describe.each(COMPOSEURS)('depuis la fiche du bien — « %s »', (_nom, depart) => {
  it('🔴 un clic dans À, Cc ou Cci propose les 3 groupes, dans l’ordre ; une adresse déjà présente n’est plus proposée', async () => {
    await monter(depart, 176);
    expect(appels.filter((u) => u.includes('/biens/176/ecrire'))).toHaveLength(1);       // lue une fois, en lecture
    for (const champ of ['À', 'Cc', 'Cci']) {
      if (champ !== 'À' && ligne(champ) === null) await cliquer(container.querySelector(`[data-bascule="${champ}"]`) as Element);
      await cliquer(saisie(champ));
      // Les groupes, DANS L'ORDRE ; un groupe dont toutes les adresses sont déjà dans les champs disparaît (règle d'avant).
      const ordre = ['Clients de l’agence', 'Immeuble', 'Autres adresses liées au bien'];
      const vus = titres(champ);
      expect(vus.length, champ).toBeGreaterThanOrEqual(2);
      expect(vus, champ).toEqual(ordre.filter((t) => vus.includes(t)));
      const presentes = [...courant.a, ...courant.cc, ...courant.cci];
      for (const a of presentes) expect(options(champ).join(' ')).not.toContain(a);
      await cliquer(container.querySelector('#red-corps-label') as Element);                  // ⇒ fermée
      expect(ligne(champ)?.querySelector('[role="listbox"]') ?? null).toBeNull();
    }
  });

  it('les mêmes mécaniques : filtre sans accents, ajout au clic, une seule liste, Échap', async () => {
    await monter(depart, 176);
    await cliquer(saisie('À'));
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(saisie('À'), 'plomberie');
      saisie('À').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await calmer();
    expect(titres('À')).toEqual(['Autres adresses liées au bien']);
    const avant = courant.a.length;
    await act(async () => { (ligne('À').querySelector('[role="option"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await calmer();
    expect(courant.a.length).toBe(avant + 1);
    expect(courant.a).toContain('artisan@x.fr');
    await ouvrirCc();
    await cliquer(saisie('Cc'));
    expect([...container.querySelectorAll('[role="listbox"]')]).toHaveLength(1);
    await act(async () => { saisie('Cc').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    await calmer();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('🔴 le contenu pré-rempli ne bouge pas : objet, citation, corps, destinataires — et aucune formule d’appel', async () => {
    await monter(depart, 176);
    expect(changements).toBe(0);
    expect(courant).toBe(depart);
    expect(courant.corps).not.toMatch(/^Bonjour/);
  });
});

describe('puces pré-remplies (Répondre à tous) colorées par la liste du bien ; inconnue en pointillé', () => {
  it('loc@ en vert, syndic@ en rose, z@ailleurs.fr en pointillé', async () => {
    await monter(COMPOSEURS[1][1], 176);
    const puce = (a: string) => [...container.querySelectorAll('.red-pastille')].find((p) => p.querySelector(`button[aria-label="Retirer ${a}"]`))?.className;
    expect(puce('loc@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--locataire');
    expect(puce('syndic@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--syndic');
    expect(puce('z@ailleurs.fr')).toBe('red-pastille red-pastille--inconnue');
  });
});

describe('🔴 hors fiche bien (Réception, Envoyés…) : comportement inchangé', () => {
  it('aucune lecture de bien, aucune liste au clic (seuls les correspondants, à la frappe)', async () => {
    await monter(COMPOSEURS[0][1], null);
    await cliquer(saisie('À'));
    expect(appels.some((u) => u.includes('/biens/'))).toBe(false);
    expect(ligne('À').querySelector('[role="listbox"]')).toBeNull();
    expect(appels.filter((u) => u.includes('/adresses/familles')).every((u) => !u.includes('lot='))).toBe(true);
  });
  it('« Écrire depuis gestion@ » (liste déjà portée par le brouillon) : aucune seconde lecture', async () => {
    await monter({ ...COMPOSEURS[3][1], depuisLeBien: true, suggestionsBien: GROUPES } as BrouillonEcran, 176);
    expect(appels.some((u) => u.includes('/biens/176/ecrire'))).toBe(false);
    await cliquer(saisie('À'));
    expect(titres('À')).toEqual(['Clients de l’agence', 'Immeuble', 'Autres adresses liées au bien']);
  });
});

describe('le câblage : la fiche du bien transmet son identifiant à ses composeurs', () => {
  const lire = (f: string) => readFileSync(join(__dirname, f), 'utf8');
  it('Annuaire → HistoriqueDuBien (lotId = id de la fiche) → Redaction (lotFiche)', () => {
    expect(lire('Annuaire.tsx')).toContain('lotId={f.id}');
    expect(lire('HistoriqueDuBien.tsx')).toContain('<Redaction brouillon={reponse.brouillon} contexte={redaction} lotFiche={lotId}');
  });
});
