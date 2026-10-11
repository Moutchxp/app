// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';
import type { BienClient } from '../../../../lib/gestion/contexteClients';

/**
 * ══ 🔴🔴 LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — LE BIEN RETROUVÉ PAR LES CLIENTS TAPÉS ═══════════════════════
 * Composeur ouvert SANS fiche bien (Nouveau message, Répondre depuis la Réception) :
 *   a. client à UN bien ⇒ le bien entre d'office dans les cibles, puce à trame pleine, suggestions de ce bien ;
 *   b. client à PLUSIEURS biens ⇒ puce à contour plein, « Rattacher ce mail à : », cocher 1 puis 2 biens ;
 *   décocher, retirer l'adresse ; propriétaire et locataire ; client sous deux familles ; inconnue inchangée ;
 *   à l'envoi, les cibles partent avec le mail ; depuis une fiche bien, rien d'office.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, classementDisponible: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
} as ContexteRedactionEcran;
const bien = (lotId: number, cle: string, role: BienClient['role'], nom = 'DUPONT Jean'): BienClient => ({
  lotId, cle, libelle: `${cle} rue des Tests, 75000 PARIS — lot ${cle}`, categorie: 'logement', role, nom,
});
const BIENS: Record<string, BienClient[]> = {
  'un.bien@x.fr': [bien(501, '501', 'locataire', 'ROI Léa')],
  'trois.biens@x.fr': [bien(601, '601', 'proprietaire'), bien(602, '602', 'proprietaire'), bien(603, '603', 'proprietaire')],
  'deux.familles@x.fr': [bien(701, '701', 'locataire', 'MARTIN Paul'), bien(702, '702', 'proprietaire', 'MARTIN Paul')],
};
const listeDu = (id: number) => rangerSuggestions({
  clients: [{ adresse: `client.${id}@x.fr`, nom: `Client ${id}`, role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: null, nomFamille: null }],
  immeuble: [{ adresse: `syndic.${id}@x.fr`, nom: `Syndic ${id}`, role: 'Syndic — e-mail général', ton: 'syndic', propre: true, civilite: null, nomFamille: null }],
});

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
let appels: Array<{ url: string; methode: string; corps?: string }>;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    appels.push({ url, methode: init?.method ?? 'GET', corps: init?.body });
    const q = new URL(`http://x${url}`).searchParams.getAll('a');
    if (url.includes('/adresses/biens')) return new Response(JSON.stringify({ etat: 'ok', biens: Object.fromEntries(q.map((a) => [a, BIENS[a] ?? []])) }));
    if (url.includes('/adresses/familles')) return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(q.map((a) => [a, null])) }));
    const m = /\/biens\/(\d+)\/ecrire/.exec(url);
    if (m) return new Response(JSON.stringify({ etat: 'ok', cible: { cle: m[1], libelle: `${m[1]} rue des Tests, 75000 PARIS — lot ${m[1]}` }, groupes: listeDu(Number(m[1])) }));
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
const ligne = (l: string) => container.querySelector(`[data-champ="${l}"]`) as HTMLElement;
const saisie = (l: string) => ligne(l).querySelector('input.red-saisie') as HTMLInputElement;
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
const cibles = () => ((courant.cibles ?? []) as Array<{ cle: string | null; id: number | null }>).map((c) => c.cle);
const cases = () => [...container.querySelectorAll('.red-rattacher-bien')].map((l) => ({
  texte: l.textContent ?? '', coche: (l.querySelector('input') as HTMLInputElement).checked, el: l.querySelector('input') as HTMLInputElement }));
const titresListe = async (champ = 'À') => {
  await cliquer(saisie(champ));
  const t = [...ligne(champ).querySelectorAll('.red-sugg-titre, .red-sugg-sous-titre')].map((x) => `${x.className.includes('sous') ? '  ' : ''}${x.textContent}`);
  await cliquer(container.querySelector('#red-corps-label') as Element);
  return t;
};

describe('a. client lié à UN SEUL bien (locataire)', () => {
  it('🔴 le bien devient le contexte d’office ; trame pleine ; suggestions de ce bien au clic', async () => {
    await monter(NOUVEAU);
    await taper('un.bien@x.fr');
    expect(cibles()).toEqual(['501']);
    expect(puce('un.bien@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--locataire');
    expect(container.querySelector('.red-rattacher-clients')).toBeNull();          // rien à choisir
    expect(await titresListe()).toEqual(['Clients de l’agence', 'Immeuble']);
  });
  it('retirer l’adresse retire le bien qu’elle avait amené', async () => {
    await monter(NOUVEAU);
    await taper('un.bien@x.fr');
    await cliquer(container.querySelector('button[aria-label="Retirer un.bien@x.fr"]') as Element);
    expect(cibles()).toEqual([]);
  });
  it('décoché ailleurs (« Classer ce mail ») : il ne revient pas d’office', async () => {
    await monter(NOUVEAU);
    await taper('un.bien@x.fr');
    await act(async () => { courant = { ...courant, cibles: [] }; root.render(createElement(Redaction, {
      brouillon: courant, contexte: CONTEXTE, lotFiche: null, onChange: (n: BrouillonEcran) => { courant = n; },
      onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {} } as never)); });
    await laisser();
    expect(cibles()).toEqual([]);
  });
});

describe('b. client lié à PLUSIEURS biens (propriétaire)', () => {
  it('🔴 contour plein, info-bulle « lié à 3 biens », ligne « Rattacher ce mail à : », aucune suggestion de bien', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    expect(puce('trois.biens@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire red-pastille--a-choisir');
    expect(puce('trois.biens@x.fr')?.title).toBe('DUPONT Jean · Propriétaire — lié à 3 biens — choisissez le bien ci-dessous — trois.biens@x.fr');
    expect(container.querySelector('.red-rattacher-titre')?.textContent).toBe('Rattacher ce mail à :');
    expect(cases().map((c) => [c.texte, c.coche])).toEqual([
      ['601 rue des Tests, 75000 PARIS — lot 601', false], ['602 rue des Tests, 75000 PARIS — lot 602', false],
      ['603 rue des Tests, 75000 PARIS — lot 603', false]]);
    expect(cibles()).toEqual([]);
    expect(await titresListe()).toEqual([]);
  });
  it('🔴 cocher 1 bien : trame pleine, cible, suggestions de ce bien ; cocher un 2e : intertitre par bien', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    await cliquer(cases()[1].el);
    expect(cibles()).toEqual(['602']);
    expect(puce('trois.biens@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire');
    expect(await titresListe()).toEqual(['Clients de l’agence', 'Immeuble']);
    await cliquer(cases()[2].el);
    expect(cibles()).toEqual(['602', '603']);
    expect(await titresListe()).toEqual([
      'Clients de l’agence', '  602 rue des Tests, 75000 PARIS — lot 602', '  603 rue des Tests, 75000 PARIS — lot 603',
      'Immeuble', '  602 rue des Tests, 75000 PARIS — lot 602', '  603 rue des Tests, 75000 PARIS — lot 603']);
  });
  it('décocher : le bien sort du contexte ; plus aucun coché ⇒ contour', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    await cliquer(cases()[0].el);
    await cliquer(cases()[0].el);
    expect(cibles()).toEqual([]);
    expect(puce('trois.biens@x.fr')?.className).toContain('red-pastille--a-choisir');
  });
});

describe('un client sous DEUX familles (locataire d’un bien, propriétaire d’un autre)', () => {
  it('rien de coché : couleur propriétaire ; locataire coché : vert, trame pleine', async () => {
    await monter(NOUVEAU);
    await taper('deux.familles@x.fr');
    expect(puce('deux.familles@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire red-pastille--a-choisir');
    await cliquer(cases().find((c) => c.texte.includes('701'))?.el as Element);
    expect(puce('deux.familles@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--locataire');
  });
});

describe('ce qui ne change pas', () => {
  it('une adresse INCONNUE reste en pointillé, sans bien ni ligne', async () => {
    await monter(NOUVEAU);
    await taper('exterieur@ailleurs.fr');
    expect(puce('exterieur@ailleurs.fr')?.className).toBe('red-pastille red-pastille--inconnue');
    expect(cibles()).toEqual([]);
    expect(container.querySelector('.red-rattacher-clients')).toBeNull();
  });
  it('🔴 depuis une FICHE BIEN : rien d’office (le bien de la fiche reste le contexte), mais on peut cocher les biens d’un client', async () => {
    await monter({ ...NOUVEAU, voie: 'repondre', a: [], filId: 10, repondALeMessageId: 77, objet: 'Re: X',
      cibles: [{ sorte: 'lot', cle: '219', id: null, libelle: 'lot 219' }] } as unknown as BrouillonEcran, 176);
    await taper('un.bien@x.fr');
    expect(cibles()).toEqual(['219']);
    await taper('trois.biens@x.fr');
    await cliquer(cases()[0].el);
    expect(cibles()).toEqual(['219', '601']);
  });
  it('un mail classé « Interne » : aucun bien d’office', async () => {
    await monter({ ...NOUVEAU, interne: true } as BrouillonEcran);
    await taper('un.bien@x.fr');
    expect(cibles()).toEqual([]);
  });
});

describe('🔴 à l’envoi, les biens du contexte partent avec le mail (la porte des biens cochés)', () => {
  it('le POST /envois porte les cibles : le bien d’office et le bien coché', async () => {
    await monter({ ...NOUVEAU, objet: 'Essai' } as BrouillonEcran);
    await taper('un.bien@x.fr');
    await taper('trois.biens@x.fr');
    await cliquer(cases()[2].el);
    const envoyer = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Envoyer') as HTMLButtonElement;
    expect(envoyer.disabled).toBe(false);
    await act(async () => { envoyer.click(); });
    await act(async () => { vi.advanceTimersByTime(8000); });
    await calmer();
    const envoi = appels.find((x) => x.url.includes('/envois') && x.methode === 'POST');
    expect(envoi, 'POST /envois').toBeDefined();
    const corps = JSON.parse(String(envoi?.corps)) as { cibles: Array<{ sorte: string; cle: string; id: number }> };
    expect(corps.cibles.map((c) => [c.sorte, c.cle, c.id])).toEqual([['lot', '501', 501], ['lot', '603', 603]]);
  });
});
