// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';

/**
 * ══ 🔴🔴 LOT COMPOSEUR-CC-CCI-REFERMABLES-ET-SUGGESTIONS — DANS LES TROIS SORTES DE COMPOSEUR ══════════════════════════
 * Tous les composeurs de la gestion rendent `Redaction` (fenêtre flottante : Nouveau message, Écrire depuis gestion@,
 * brouillon rouvert ; réponse dans la conversation ; réponse depuis l'historique du bien). On rejoue les MÊMES gestes
 * sur trois brouillons : un Nouveau message, une Réponse, et un « Écrire depuis gestion@ » ouvert depuis une fiche bien
 * (avec ses adresses proposées).
 *   ① « Cc » / « Cci » : ouverte vide puis re-clic ⇒ fermée ; ouverte vide puis clic ailleurs ⇒ fermée ; avec une
 *      adresse ⇒ reste ouverte ; dernière adresse retirée puis clic ailleurs ⇒ fermée.
 *   ② la liste de suggestions : fermée par un clic dans le vide, par un clic sur « Cc », par Échap — adresses
 *      conservées ; une seule liste ouverte à la fois.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
};
const BASE = { id: null, cc: [], cci: [], citation: null, destinatairesApproximatifs: false, filId: null };
const COMPOSEURS: Array<[string, BrouillonEcran]> = [
  ['Nouveau message', { ...BASE, voie: 'nouveau', a: [], objet: '', corps: '\n\nService Gestion', repondALeMessageId: null } as BrouillonEcran],
  ['Répondre', { ...BASE, voie: 'repondre', a: ['client@exemple.fr'], objet: 'Re: Quittance', corps: '\n\nService Gestion',
    filId: 10, repondALeMessageId: 77 } as BrouillonEcran],
  ['Écrire depuis gestion@', { ...BASE, voie: 'nouveau', a: ['gardienne@x.fr'], objet: 'XXXXXXXX / Cabinet Criterimmo', corps: 'Bonjour,\n\n\n',
    repondALeMessageId: null, depuisLeBien: true,
    suggestionsBien: rangerSuggestions({
      clients: [{ adresse: 'jean@x.fr', nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: 'M.', nomFamille: 'DUPONT' }],
      immeuble: [{ adresse: 'syndic@x.fr', nom: 'Cabinet', role: 'Syndic — e-mail général', ton: 'syndic', propre: true, civilite: null, nomFamille: null }],
    }) } as BrouillonEcran],
];

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => new Response(JSON.stringify(String(u).includes('correspondants')
    ? { correspondants: [{ adresse: 'artisan@exemple.fr', nom: 'Artisan' }, { adresse: 'agence@exemple.fr', nom: null }] }
    : { ok: true }), { status: 200 })));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (b: BrouillonEcran) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};
const ligne = (libelle: string) => container.querySelector(`[data-champ="${libelle}"]`) as HTMLElement | null;
const champ = (libelle: string) => ligne(libelle)?.querySelector('input.red-saisie') as HTMLInputElement;
const bascule = (quoi: 'Cc' | 'Cci') => container.querySelector(`[data-bascule="${quoi}"]`) as HTMLButtonElement;
/** Un vrai clic : mousedown (capturé par le composeur) puis click — comme la souris. */
const cliquer = async (el: Element) => {
  await act(async () => {
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    el.dispatchEvent(md);
    if (!md.defaultPrevented && document.activeElement instanceof HTMLElement && !el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    (el as HTMLElement).click();
  });
  await calmer();
};
/** Un clic « dans le vide » : une zone sans fonction de la fenêtre (le libellé « Message »). */
const clicAilleurs = async () => { await cliquer(container.querySelector('#red-corps-label') as Element); };
const taper = async (input: HTMLInputElement, texte: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(input, texte);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await calmer();
};
const touche = async (input: HTMLInputElement, key: string) => {
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  await calmer();
};
const listeOuverte = (libelle: string) => !!ligne(libelle)?.querySelector('[role="listbox"]');
/** Ouvre la liste du champ : un clic dedans (adresses du bien), ou deux lettres tapées (correspondants). */
const ouvrirListe = async (libelle: string, b: BrouillonEcran) => {
  await cliquer(champ(libelle));
  if (!b.suggestionsBien) await taper(champ(libelle), 'ar');
  await act(async () => { vi.advanceTimersByTime(400); });
  await calmer();
};

describe.each(COMPOSEURS)('composeur « %s »', (_nom, depart) => {
  for (const quoi of ['Cc', 'Cci'] as const) {
    describe(`① la ligne ${quoi}`, () => {
      it(`ouverte VIDE puis re-clic sur « ${quoi} » : refermée, libellé compris ; le bouton reste actif`, async () => {
        await monter(depart);
        expect(ligne(quoi)).toBeNull();
        await cliquer(bascule(quoi));
        expect(ligne(quoi)).not.toBeNull();
        expect(document.activeElement).toBe(champ(quoi));            // le curseur y est, elle ne se referme pas
        expect(bascule(quoi).getAttribute('aria-expanded')).toBe('true');
        expect(bascule(quoi).disabled).toBe(false);
        await cliquer(bascule(quoi));
        expect(ligne(quoi)).toBeNull();
        expect(bascule(quoi).getAttribute('aria-expanded')).toBe('false');
      });
      it('ouverte VIDE puis clic ailleurs : refermée d’elle-même', async () => {
        await monter(depart);
        await cliquer(bascule(quoi));
        expect(ligne(quoi)).not.toBeNull();
        await clicAilleurs();
        expect(ligne(quoi)).toBeNull();
      });
      it('avec une adresse : reste ouverte ; dernière adresse retirée puis clic ailleurs : refermée', async () => {
        await monter(depart);
        await cliquer(bascule(quoi));
        await taper(champ(quoi), 'copie@exemple.fr');
        await touche(champ(quoi), 'Enter');
        expect(quoi === 'Cc' ? courant.cc : courant.cci).toEqual(['copie@exemple.fr']);
        await clicAilleurs();
        await cliquer(bascule(quoi));                                // un clic sur une ligne remplie : elle reste
        expect(ligne(quoi)).not.toBeNull();
        await cliquer(ligne(quoi)?.querySelector('button[aria-label="Retirer copie@exemple.fr"]') as Element);
        expect(quoi === 'Cc' ? courant.cc : courant.cci).toEqual([]);
        await clicAilleurs();
        expect(ligne(quoi)).toBeNull();
      });
    });
  }

  describe('② la liste de suggestions', () => {
    it('ouverte au clic (ou à la frappe) ; fermée par un clic dans le vide — les adresses déjà ajoutées restent', async () => {
      await monter(depart);
      const avant = [...courant.a];
      await ouvrirListe('À', depart);
      expect(listeOuverte('À')).toBe(true);
      await clicAilleurs();
      expect(listeOuverte('À')).toBe(false);
      // aucune adresse déjà ajoutée ne disparaît (le texte tapé, lui, est validé en sortant du champ : règle d'avant)
      expect(courant.a).toEqual(expect.arrayContaining(avant));
    });
    it('fermée par un clic sur « Cc », puis par Échap ; rouverte au clic dans le champ', async () => {
      await monter(depart);
      await ouvrirListe('À', depart);
      expect(listeOuverte('À')).toBe(true);
      await cliquer(bascule('Cc'));
      expect(listeOuverte('À')).toBe(false);
      await ouvrirListe('À', depart);
      expect(listeOuverte('À')).toBe(true);
      await touche(champ('À'), 'Escape');
      expect(listeOuverte('À')).toBe(false);
      await cliquer(champ('À'));
      if (depart.suggestionsBien) expect(listeOuverte('À')).toBe(true);
    });
    it('🔴 une seule liste ouverte à la fois (À puis Cc)', async () => {
      await monter(depart);
      await ouvrirListe('À', depart);
      expect(listeOuverte('À')).toBe(true);
      await cliquer(bascule('Cc'));
      await ouvrirListe('Cc', depart);
      expect(listeOuverte('Cc')).toBe(true);
      expect(listeOuverte('À')).toBe(false);
    });
    it('une adresse choisie referme la liste ; elle est ajoutée, rien d’autre ne bouge', async () => {
      await monter(depart);
      await ouvrirListe('À', depart);
      const option = ligne('À')?.querySelector('[role="option"]') as HTMLElement;
      const nb = courant.a.length;
      await act(async () => { option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
      await calmer();
      expect(courant.a.length).toBe(nb + 1);
      expect(listeOuverte('À')).toBe(false);
    });
  });
});
