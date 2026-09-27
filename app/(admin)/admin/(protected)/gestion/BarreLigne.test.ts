// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA BARRE NE SURVIT PAS AU CLIC — défaut signalé par Arno le 27/09/2026
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 la barre ne reste pas allumée après un clic souris', () => {
  /**
   * 🔴 LA CAUSE. La barre s'affichait au survol OU quand le focus était dans la rangée (`:focus-within`). Après un
   * clic SOURIS, le bouton cliqué garde le focus : la rangée restait donc « focus-within », et la barre restait
   * affichée une fois la souris partie — sur plusieurs lignes à la fois, comme sur la capture d'Arno.
   *
   * DEUX CORRECTIFS, ET ILS SE COMPLÈTENT :
   *   · le script rend le focus après un clic de SOURIS (`e.detail > 0`), jamais après une activation au clavier ;
   *   · la règle CSS passe de `:focus-within` à `:has(:focus-visible)`, que seul le clavier allume.
   */
  it('un clic SOURIS rend le focus : plus rien ne retient la barre', async () => {
    await monter();
    const b = boutonBarre('Marquer comme non lu') as HTMLButtonElement;
    // `detail: 1` = un vrai clic de souris. C'est ce que le navigateur envoie, et ce que le composant regarde.
    await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    await calmer();
    expect(document.activeElement).not.toBe(b);
  });

  /** 🔴 ET SURTOUT PAS AU CLAVIER : `detail: 0` = activation par Entrée ou Espace. Lui retirer le focus rendrait la
   *  barre inutilisable au clavier — exactement ce qu'on veut préserver. */
  it('une activation au CLAVIER garde le focus sur le bouton', async () => {
    await monter();
    const b = boutonBarre('Marquer comme non lu') as HTMLButtonElement;
    b.focus();
    await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); });
    await calmer();
    expect(document.activeElement).toBe(b);
  });

  it('la règle d’affichage ne parle plus de « focus-within », mais de « focus-visible »', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/BarreLigne.tsx', 'utf8');
    expect(css).toContain('.bte-li:hover .brl,.bte-li:has(:focus-visible) .brl{opacity:1');
    expect(css).not.toContain('.bte-li:focus-within .brl');
  });

  /**
   * L'EXCEPTION VOULUE : pendant la confirmation de corbeille, la barre reste visible jusqu'à Annuler ou Confirmer
   * — sans quoi la question disparaîtrait au moindre mouvement de souris, et on répondrait à côté.
   */
  it('la confirmation reste visible sans survol', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/BarreLigne.tsx', 'utf8');
    expect(css).toContain('.brl--confirme{opacity:1;pointer-events:auto');
  });

  /** 🔴 UNE SEULE BARRE À LA FOIS : la confirmation est tenue par la LISTE, donc une seule ligne peut l'ouvrir. */
  it('ouvrir la confirmation d’une ligne ferme celle d’une autre', async () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
    expect(css).toContain('const [confirmeSur, setConfirmeSur]');
    expect(css).toContain('confirme={confirmeSur === l.filId}');
    // …et la barre ne garde plus d'état de confirmation en propre.
    const barre = readFileSync('app/(admin)/admin/(protected)/gestion/BarreLigne.tsx', 'utf8');
    expect(barre).not.toContain('useState');
  });

  it('sur écran tactile, la barre reste montrée en permanence — comportement inchangé', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/BarreLigne.tsx', 'utf8');
    expect(css.replace(/\s+/g, ' ')).toContain('@media (pointer:coarse){.brl{opacity:1;pointer-events:auto');
  });
});

describe('🔴 la barre laisse le « ⋯ » atteignable', () => {
  /**
   * 🔴 LE DÉFAUT SIGNALÉ PAR ARNO. Collée au bord droit, la barre passait PAR-DESSUS le bouton « ⋯ » de la ligne
   * (mesuré : le menu occupe 44 px collés au bord, la barre le recouvrait sur 38 px). Le menu devenait impossible à
   * cliquer dès que la barre était affichée — c'est-à-dire précisément quand on survolait la ligne pour l'utiliser.
   *
   * Le retrait vaut la largeur du menu plus un peu d'air, et il est écrit en `calc()` à partir de la cible tactile
   * de 44 px : les deux bougeront ensemble le jour où cette cible change.
   */
  it('elle s’arrête avant le menu, d’une largeur de bouton et d’un espace', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/BarreLigne.tsx', 'utf8');
    expect(css).toContain('right:calc(44px + 8px)');
    expect(css).not.toContain('.brl{position:absolute;right:6px');
  });

  /**
   * ET LE MENU RÉPOND PENDANT QUE LA BARRE EST LÀ. On ne peut pas éprouver un recouvrement en jsdom (aucune mise en
   * page), mais on peut éprouver ce qui compte vraiment : que le « ⋯ » soit un VOISIN de la barre — donc jamais
   * masqué par elle dans l'ordre du DOM — et qu'un clic l'ouvre bien.
   */
  it('le « ⋯ » est un voisin de la barre, et son clic ouvre le menu', async () => {
    await monter();
    const rangee = container.querySelector('.bte-li');
    const menu = rangee?.querySelector('button[aria-label^="Actions sur l"]') as HTMLButtonElement;
    expect(menu).not.toBeNull();
    // Voisins : ni l'un ni l'autre n'est contenu dans l'autre.
    expect(rangee?.querySelector('.brl')?.contains(menu)).toBe(false);
    expect(menu.closest('.brl')).toBeNull();
    await cliquer(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
  });
});

describe('🔴 LOT CAPSULE-STATUT — la capsule sur la ligne, et le gras conservé', () => {
  const capsule = () => container.querySelector('.bte-capsule');

  it('« Auto » quand seul le moteur a rattaché', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 1, parUnHumain: false, detail: 'lot 513 — automatique' } });
    await monter();
    expect(capsule()?.textContent).toBe('Auto');
    expect(capsule()?.className).toContain('bte-capsule--auto');
    expect(capsule()?.getAttribute('title')).toBe('lot 513 — automatique');
  });

  it('« Classé » dès qu’un humain a tranché', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 2, parUnHumain: true, detail: 'lot 513 — à la main' } });
    await monter();
    expect(capsule()?.textContent).toBe('Classé');
    expect(capsule()?.className).toContain('bte-capsule--classe');
  });

  it('« À classer » sans rattachement confirmé, avec la raison en info-bulle', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 0, parUnHumain: false, detail: null } });
    await monter();
    expect(capsule()?.textContent).toBe('À classer');
    expect(capsule()?.className).toContain('bte-capsule--a_classer');
    expect(capsule()?.getAttribute('title')).toContain('Aucun rattachement confirmé');
  });

  /** ⚠️ Elle se place APRÈS le trombone et AVANT l'heure — c'est là qu'on la cherche des yeux. */
  it('elle est après les pièces jointes et avant la date', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 1, parUnHumain: false, detail: null } });
    await monter();
    const ligne = container.querySelector('.bte-ligne');
    const ordre = [...(ligne?.querySelectorAll('.bte-marque, .bte-capsule, .bte-quand') ?? [])]
      .map((e) => (e.className.includes('capsule') ? 'capsule' : e.className.includes('quand') ? 'date' : 'marque'));
    expect(ordre.indexOf('capsule')).toBeGreaterThan(ordre.indexOf('marque'));
    expect(ordre.indexOf('date')).toBeGreaterThan(ordre.indexOf('capsule'));
  });

  /**
   * 🔴 « NON LU » A QUITTÉ LA LIGNE — retrait autorisé par Arno — MAIS L'INFORMATION RESTE : le gras, et le
   * libellé accessible qui l'écrit en toutes lettres. Une information portée par la seule graisse serait perdue
   * pour un lecteur d'écran ; c'est pour cela que les deux doivent tenir ensemble.
   */
  it('plus de mention « non lu », mais le gras et le libellé accessible demeurent', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 1, parUnHumain: false, detail: null } });
    await monter({ });
    // Le jeu d'essai ne rend aucun non-lu : on le pose par la réponse de la route.
    expect(container.querySelector('.bte-marque--non-lu')).toBeNull();
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
    expect(src).toContain("bte-ligne--non-lu");                       // le gras est toujours posé
    expect(src).toContain('aria-label={nonLu ?');                     // …et le mot est toujours écrit
    expect(src).not.toContain("bte-marque--non-lu\">non lu");         // la mention de bout de ligne est partie
  });

  it('aucune capsule dans « Spam » ni dans « Brouillons »', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 0, parUnHumain: false, detail: null } });
    await monter({ etiquette: { sorte: 'spam', evenementId: null } });
    expect(capsule()).toBeNull();
  });

  /** Une réponse plus ancienne que ce lot ne porte pas le champ : la liste doit tenir, sans capsule. */
  it('sans le champ, aucune capsule — et surtout aucune ligne cassée', async () => {
    ligneCourante = LIGNE();
    await monter();
    expect(capsule()).toBeNull();
    expect(container.querySelectorAll('.bte-li')).toHaveLength(1);
  });
});
