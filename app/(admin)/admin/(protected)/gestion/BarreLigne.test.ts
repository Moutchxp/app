// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoiteMail } from './BoiteMail';

/**
 * LOT LISTE-GMAIL — LA BARRE D'ACTIONS D'UNE LIGNE, MONTÉE POUR DE VRAI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE, et qu'aucune relecture ne montre :
 *   ① un clic dans la barre N'OUVRE PAS le mail — sans quoi mettre un échange à la corbeille l'ouvrirait en même
 *      temps, et on lirait ce qu'on venait de ranger ;
 *   ② la corbeille DEMANDE CONFIRMATION, et « Annuler » n'écrit rien ;
 *   ③ l'étoile POSÉE se voit au début de la ligne ; une étoile éteinte ne s'affiche nulle part hors survol ;
 *   ④ le compteur de messages a bien CHANGÉ DE PLACE — il n'est pas affiché deux fois ;
 *   ⑤ sans la migration 264, l'étoile est désactivée et le DIT, au lieu de promettre un geste impossible.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIGNE = (o: Record<string, unknown> = {}) => ({
  filId: 7, objet: 'Fuite salle de bain', interlocuteur: 'Mme Martin', interlocuteurAdresse: 'martin@orange.fr',
  dernierSens: 'recu', dernierLe: '2026-09-20T12:00:00Z', extrait: 'Le robinet fuit.',
  nbMessages: 3, nbLisibles: 3, aPiece: true, nbPieces: 2, reference: null, sansSuite: false,
  nonRemise: null, etoilee: false, ...o,
});
const COMPTES = { lisibles: 10, automatiques: 2, envoyes: 3, reception: 10, corbeille: 0, etoileDisponible: true };

let container: HTMLDivElement;
let root: Root;
let ecritures: { url: string; methode: string; corps: unknown }[];
let ouverts: number[];
let actions: { filId: number; action: string }[];
let ligneCourante: Record<string, unknown>;
let comptes: Record<string, unknown>;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = []; ouverts = []; actions = [];
  ligneCourante = LIGNE();
  comptes = COMPTES;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    if (methode !== 'GET') {
      ecritures.push({ url: u, methode, corps: JSON.parse(String(init?.body ?? 'null')) });
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => comptes } as unknown as Response;
    return {
      ok: true,
      json: async () => ({ lignes: [ligneCourante], suivant: null, total: 1, comptes, nonLus: [], nonLusTotal: 0 }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(BoiteMail, {
      onOuvrir: (id: number) => ouverts.push(id),
      onActionLigne: (filId: number, action: string) => actions.push({ filId, action }),
      corbeille: true, dense: true, ...props,
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => { await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer(); };
const barre = () => container.querySelector('.brl');
const boutonBarre = (nom: string) => container.querySelector(`.brl [aria-label="${nom}"]`) as HTMLButtonElement | null;
const boutonTexte = (motif: RegExp) =>
  [...container.querySelectorAll('.brl button')].find((b) => motif.test(b.textContent ?? ''));

describe('🔴 ① un clic dans la barre n’ouvre PAS le mail', () => {
  it('l’étoile, l’enveloppe, la corbeille et « Classer » laissent la liste en place', async () => {
    await monter();
    await cliquer(boutonBarre('Mettre une étoile'));
    await cliquer(boutonBarre('Marquer comme non lu'));
    await cliquer(boutonBarre('Mettre à la corbeille'));
    await cliquer(boutonTexte(/^Annuler$/));
    await cliquer(boutonTexte(/^Classer$/));
    expect(ouverts).toEqual([]); // aucun mail ouvert par tous ces gestes
  });

  it('un clic sur la ligne, lui, ouvre bien le mail', async () => {
    await monter();
    await cliquer(container.querySelector('.bte-ligne'));
    expect(ouverts).toEqual([7]);
  });
});

describe('🔴 ② la corbeille demande confirmation', () => {
  it('le premier clic ne fait qu’ouvrir la question', async () => {
    await monter();
    await cliquer(boutonBarre('Mettre à la corbeille'));
    expect(barre()?.textContent).toContain('Mettre cet échange à la corbeille ?');
    expect(actions).toEqual([]); // rien n'a encore été demandé
  });

  it('🔴 « Annuler » n’écrit RIEN, et la barre revient', async () => {
    await monter();
    await cliquer(boutonBarre('Mettre à la corbeille'));
    await cliquer(boutonTexte(/^Annuler$/));
    expect(actions).toEqual([]);
    expect(ecritures).toEqual([]);
    expect(boutonBarre('Mettre à la corbeille')).not.toBeNull();
  });

  it('« Confirmer » demande le geste, une seule fois', async () => {
    await monter();
    await cliquer(boutonBarre('Mettre à la corbeille'));
    await cliquer(boutonTexte(/^Confirmer$/));
    expect(actions).toEqual([{ filId: 7, action: 'corbeille' }]);
  });
});

describe('🔴 ③ l’étoile : posée elle se voit, éteinte elle ne s’affiche nulle part', () => {
  it('une étoile ÉTEINTE n’apparaît pas au début de la ligne', async () => {
    await monter();
    expect(container.querySelector('.bte-etoile')).toBeNull();
  });

  it('une étoile POSÉE apparaît au début de la ligne, en permanence', async () => {
    ligneCourante = LIGNE({ etoilee: true });
    await monter();
    expect(container.querySelector('.bte-etoile')).not.toBeNull();
  });

  /**
   * 🔴 L'ÉTAT DEMANDÉ EST ENVOYÉ, jamais « l'inverse de ce qui est là » : deux clics partis en même temps de deux
   * postes ne peuvent donc pas se croiser. Et il est posé à l'écran AVANT la réponse — une étoile qui met une
   * seconde à apparaître donne l'impression que le clic n'a pas porté.
   */
  it('cliquer l’étoile l’écrit, et l’allume aussitôt', async () => {
    await monter();
    await cliquer(boutonBarre('Mettre une étoile'));
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].methode).toBe('POST');
    expect(ecritures[0].url).toContain('/fils/7/etoile');
    expect(ecritures[0].corps).toEqual({ etoilee: true });
    expect(container.querySelector('.bte-etoile')).not.toBeNull();
  });

  it('un refus du serveur DÉFAIT l’étoile : on ne laisse pas un mensonge allumé', async () => {
    await monter();
    (global.fetch as unknown as { mockImplementationOnce: (f: unknown) => void }).mockImplementationOnce(
      async () => ({ ok: false, json: async () => ({ erreur: 'refus' }) }) as unknown as Response);
    await cliquer(boutonBarre('Mettre une étoile'));
    expect(container.querySelector('.bte-etoile')).toBeNull();
  });
});

describe('🔴 ④ le compteur de messages a changé de place, il n’est pas doublé', () => {
  it('il est dans la barre, et plus dans le bas de la ligne', async () => {
    await monter();
    expect(container.querySelector('.brl-compte')?.textContent).toBe('3');
    expect(container.querySelector('.bte-bas')?.textContent).not.toContain('3 message');
  });

  it('un échange d’UN seul message n’affiche aucun compteur', async () => {
    ligneCourante = LIGNE({ nbMessages: 1 });
    await monter();
    expect(container.querySelector('.brl-compte')).toBeNull();
  });

  /** ③ du lot : le trombone porte le NOMBRE, sans le mot. */
  it('les pièces jointes se disent « 📎 2 », sans le mot', async () => {
    await monter();
    const bas = container.querySelector('.bte-bas')?.textContent ?? '';
    expect(bas).toContain('📎');
    expect(bas).toContain('2');
    expect(bas).not.toContain('pièce jointe');
  });
});

describe('🔴 ⑤ sans la migration 264, l’étoile le DIT', () => {
  it('le bouton est désactivé et son info-bulle explique pourquoi', async () => {
    comptes = { ...COMPTES, etoileDisponible: false };
    await monter();
    const b = boutonBarre('Mettre une étoile');
    expect(b?.disabled).toBe(true);
    expect(b?.getAttribute('title')).toContain('migration 264');
    await cliquer(b);
    expect(ecritures).toEqual([]);
  });
});

describe('la bascule lu / non lu', () => {
  it('l’enveloppe montre l’action possible et la demande au parent', async () => {
    await monter();
    // Le jeu d'essai ne rend aucun non-lu : l'échange est lu, l'action proposée est « marquer comme non lu ».
    expect(boutonBarre('Marquer comme non lu')).not.toBeNull();
    await cliquer(boutonBarre('Marquer comme non lu'));
    expect(actions).toEqual([{ filId: 7, action: 'non_lu' }]);
  });
});
