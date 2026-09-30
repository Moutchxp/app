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
  nbMessages: 3, nbLisibles: 3, aPiece: true, nbPieces: 2,
  /**
   * ⚠️ LOT LECTURE-HTML-FIL-TROMBONE — LE TROMBONE NE LIT PLUS `nbPieces`, qui comptait TOUT l'échange. Il lit
   * OÙ SONT les pièces : sur le message affiché (`piecesDuMessage`, trombone noir) ou ailleurs dans la
   * conversation (`piecesAilleurs`, trombone gris). `nbPieces` reste — il dit toujours le total de l'échange,
   * et d'autres écrans s'en servent — mais il ne décide plus de ce qu'on voit sur la ligne.
   */
  piecesDuMessage: 2, piecesAilleurs: 0,
  reference: null, sansSuite: false,
  // LOT MESSAGE-CLIQUE — le message que la ligne represente : c'est lui que le clic doit ouvrir.
  messageAffiche: 8123,
  nonRemise: null, etoilee: false, ...o,
});
const COMPTES = { lisibles: 10, automatiques: 2, envoyes: 3, reception: 10, corbeille: 0, etoileDisponible: true };

let container: HTMLDivElement;
let root: Root;
let ecritures: { url: string; methode: string; corps: unknown }[];
let ouverts: (number | null | undefined)[][];
let actions: { filId: number; action: string }[];
let ligneCourante: Record<string, unknown>;
/** Ce que la route des rattachements répond à `?fil=` (les liens bruts). Piloté par le test. */
let rattachements: Record<string, unknown>;
/**
 * 🔴 LOT FICHE-RATTACHEMENT — ce que la MÊME route répond à `?fiche=` : la fiche de l'échange, c'est-à-dire ses
 * BIENS et leurs personnes. Les deux questions vivent dans la même route, mais ne rendent pas la même chose : les
 * confondre dans le double ferait passer un tableau là où l'écran attend un objet.
 */
let ficheFil: Record<string, unknown>;
let comptes: Record<string, unknown>;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = []; ouverts = []; actions = [];
  ligneCourante = LIGNE();
  comptes = COMPTES;
  rattachements = { etat: 'ok', data: [] };
  ficheFil = {
    etat: 'ok',
    data: {
      filId: 7, objet: 'Fuite salle de bain', nbMailsDuFil: 3, biens: [], horsGestion: false,
      messageRecentId: 8123, disponible: true,
    },
  };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    if (methode !== 'GET') {
      ecritures.push({ url: u, methode, corps: JSON.parse(String(init?.body ?? 'null')) });
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => comptes } as unknown as Response;
    // LOT BARRE-STATUT — les rattachements de l'échange, tels que la fenêtre « Visualiser / Modifier » les demande.
    // LOT FICHE-RATTACHEMENT — `?fiche=` d'abord : `?fil=` serait sinon attrapé par la même condition.
    if (u.includes('/rattachements?fiche=')) return { ok: true, json: async () => ficheFil } as unknown as Response;
    if (u.includes('/rattachements')) return { ok: true, json: async () => rattachements } as unknown as Response;
    // Le raccourci vers le dossier Drive du bien : un CONFORT, doublé à vide ici.
    if (u.includes('/drive/dossier-du-bien')) {
      return { ok: true, json: async () => ({ etat: 'ok', dossiers: [] }) } as unknown as Response;
    }
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
      onOuvrir: (id: number, messageId?: number | null) => ouverts.push([id, messageId]),
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
    expect(ouverts).toEqual([[7, 8123]]);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 LOT MESSAGE-CLIQUÉ — LE CLIC EMPORTE LE MESSAGE DE LA LIGNE, pas seulement l'échange.
   *
   * Sans cela, la conversation s'ouvre sur le dernier message du fil : en Réception, cliquer sur une question reçue
   * à 12 h 37 ouvrait notre propre réponse de 15 h 58 (fil 354). C'est ICI que la chaîne commence — la ligne sait
   * quel message elle montre, et elle doit le DIRE à qui ouvre.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 le clic dit QUEL message ouvrir — celui que la ligne représente', async () => {
    ligneCourante = LIGNE({ messageAffiche: 8123 });
    await monter();
    await cliquer(container.querySelector('.bte-ligne'));
    expect(ouverts).toEqual([[7, 8123]]);
  });

  /** Une réponse plus ancienne que ce lot ne porte pas le champ : on ouvre l'échange, et le dernier message. */
  it('sans le champ, on ouvre l’échange sans rien prétendre du message', async () => {
    ligneCourante = LIGNE({ messageAffiche: undefined });
    await monter();
    await cliquer(container.querySelector('.bte-ligne'));
    expect(ouverts).toEqual([[7, null]]);
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

  /**
   * ③ du lot : le trombone porte le NOMBRE, sans le mot.
   *
   * ══ 🔴 RÉÉCRIT PAR LE LOT LISTE-PAGINATION — LE TROMBONE N'EST PLUS UN CARACTÈRE ══════════════════════════
   *
   * CE QUI ÉTAIT EXIGÉ ICI, ET QUI NE PEUT PLUS L'ÊTRE :
   *     expect(bas).toContain('\u{1F4CE}');
   * L'emoji a été remplacé par un TRACÉ (composant `Trombone`), parce qu'un emoji est rendu par une police EN
   * COULEUR qui IGNORE la propriété `color` : l'icône restait argentée pendant que son chiffre obéissait, gris ou
   * noir — le défaut exact signalé par Arno. Un tracé n'a pas de texte, donc `textContent` ne le voit pas.
   *
   * 🔒 CE QUE L'ÉPREUVE GARDE EST INCHANGÉ, et c'est ce qui compte : une MARQUE de pièces jointes est présente,
   * elle porte le NOMBRE, et surtout PAS le mot « pièce jointe » (c'est tout l'objet du lot d'origine).
   */
  it('les pièces jointes se disent « trombone 2 », sans le mot', async () => {
    await monter();
    const bas = container.querySelector('.bte-bas')?.textContent ?? '';
    const marque = container.querySelector('.bte-marque--pieces');
    expect(marque).not.toBeNull();
    // Le tracé est bien là, et il hérite de la couleur du texte : c'est ce que dit `stroke="currentColor"`.
    expect(marque?.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
    expect(marque?.textContent).toContain('2');
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
   * 🔴 RETOUCHE (demande d'Arno) — LE TROMBONE EST COLLÉ À LA CAPSULE, juste à sa gauche. Les deux repères qu'on
   * balaie du regard en parcourant la liste — « y a-t-il une pièce ? » et « est-ce rangé ? » — doivent tenir
   * ensemble, à la même place sur toutes les lignes. Le trombone était en TÊTE de la rangée : toute marque
   * variable (référence, « classé sans suite », provenance…) s'insérait entre lui et la capsule.
   */
  it('🔴 le trombone est le VOISIN IMMÉDIAT de la capsule, même avec des marques entre-deux', async () => {
    ligneCourante = LIGNE({
      classement: { nbActifs: 1, parUnHumain: false, detail: null },
      // Trois marques variables à la fois : ce sont elles qui s'intercalaient.
      reference: 'GES-2026-000012', sansSuite: true, nbLisibles: 0,
    });
    await monter();
    const bas = container.querySelector('.bte-bas');
    const pieces = bas?.querySelector('.bte-marque--pieces');
    expect(pieces).not.toBeNull();
    expect(pieces?.nextElementSibling).toBe(capsule());   // rien ne s'insère entre les deux
    expect(bas?.lastElementChild).toBe(capsule());        // et la capsule ferme toujours la rangée
    // Les marques variables sont bien là, et elles sont toutes AVANT le trombone.
    const rangee = [...(bas?.children ?? [])];
    expect(rangee.length).toBeGreaterThan(4);
    expect(rangee.indexOf(pieces as Element)).toBe(rangee.length - 2);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 RETOUCHE (demande d'Arno) — LA CAPSULE EST TOUJOURS LA DERNIÈRE MARQUE, SANS EXCEPTION.
   *
   * Ordre de bout de ligne : avertissement éventuel · trombone · CAPSULE · heure · « ⋯ ».
   *
   * CE QUE CE TEST ATTRAPE, et qu'aucune relecture ne montre : l'avertissement de non-remise était rendu APRÈS la
   * capsule, et s'intercalait donc entre elle et l'heure — sur les SEULES lignes qui en portent un. La capsule
   * changeait de place selon la ligne, et il fallait la chercher à deux endroits. L'assertion porte sur le DERNIER
   * enfant de la rangée de marques, pas sur le couple capsule/avertissement : c'est la seule forme qui vaut aussi
   * pour toute marque future — elles s'ajoutent toutes AU-DESSUS de la capsule.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const AVIS = {
    sorte: 'temporaire', destinataire: 'm.dupont@exemple.fr', avisMessageId: 42,
    phrase: 'remise retardée à m.dupont@exemple.fr : la boîte du destinataire est pleine',
  };

  it('🔴 l’avertissement de non-remise ne s’intercale plus entre la capsule et l’heure', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 0, parUnHumain: false, detail: null }, nonRemise: AVIS });
    await monter();
    const bas = container.querySelector('.bte-bas');
    const rangee = [...(bas?.children ?? [])];
    const avis = bas?.querySelector('.bte-marque--echec');
    expect(avis).not.toBeNull();                                        // l'avertissement reste VISIBLE
    expect(bas?.lastElementChild).toBe(capsule());                      // …et la capsule ferme la rangée
    expect(rangee.indexOf(avis as Element)).toBeLessThan(rangee.indexOf(capsule() as Element));
    // La date suit la rangée de marques, comme sur n'importe quelle autre ligne.
    const ligne = container.querySelector('.bte-ligne');
    const ordre = [...(ligne?.querySelectorAll('.bte-capsule, .bte-quand') ?? [])]
      .map((e) => (e.className.includes('capsule') ? 'capsule' : 'date'));
    expect(ordre).toEqual(['capsule', 'date']);
  });

  /** L'avertissement peut être tronqué à l'écran : son texte ENTIER doit rester lisible dans l'info-bulle. */
  it('l’avertissement tronqué dit tout son texte dans l’info-bulle', async () => {
    ligneCourante = LIGNE({ classement: { nbActifs: 1, parUnHumain: true, detail: null }, nonRemise: AVIS });
    await monter();
    const avis = container.querySelector('.bte-marque--echec');
    expect(avis?.getAttribute('title')).toBe(AVIS.phrase);
    expect(avis?.querySelector('.bte-echec-texte')?.textContent).toBe(AVIS.phrase);
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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT BARRE-STATUT — LE DERNIER BOUTON DE LA BARRE SUIT LA CAPSULE (demande d'Arno).
 *
 * CE QUE CE BLOC PROTÈGE :
 *   ① capsule ROUGE ⇒ « Classer », en rouge — le comportement d'avant ce lot, qui ne doit pas bouger ;
 *   ② capsule VERTE (« Classé » ou « Auto ») ⇒ « Visualiser / Modifier », en vert, qui OUVRE LA FENÊTRE des
 *      rattachements — et surtout N'OUVRE PAS l'échange : on ne perd pas sa place dans la liste pour une question
 *      à laquelle on répond en deux secondes ;
 *   ③ sans capsule (Brouillons, Spam, réponse de serveur plus ancienne que le lot CAPSULE-STATUT) ⇒ « Classer ».
 *      On ne devine pas un état qu'on n'a pas lu.
 *   ④ LA BARRE GARDE LE MÊME NOMBRE DE BOUTONS : seuls le mot et le ton changent, la cible ne se déplace pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT BARRE-STATUT — le bouton de fin de barre suit la capsule', () => {
  const boutonFin = () => [...container.querySelectorAll('.brl .brl-bouton')].at(-1) as HTMLButtonElement | undefined;
  const CLASSE = { nbActifs: 2, parUnHumain: true, detail: 'lot 513 — à la main' };
  const AUTO = { nbActifs: 1, parUnHumain: false, detail: 'lot 513 — automatique' };
  const A_CLASSER = { nbActifs: 0, parUnHumain: false, detail: null };

  it('① capsule ROUGE : « Classer », en rouge', async () => {
    ligneCourante = LIGNE({ classement: A_CLASSER });
    await monter();
    expect(boutonFin()?.textContent).toBe('Classer');
    expect(boutonFin()?.className).toContain('brl-bouton--rouge');
  });

  it('② capsule « Classé » : « Visualiser / Modifier », en vert', async () => {
    ligneCourante = LIGNE({ classement: CLASSE });
    await monter();
    expect(boutonFin()?.textContent).toBe('Visualiser / Modifier');
    expect(boutonFin()?.className).toContain('brl-bouton--vert');
  });

  it('② capsule « Auto » : le même bouton vert — rangé reste rangé', async () => {
    ligneCourante = LIGNE({ classement: AUTO });
    await monter();
    expect(boutonFin()?.textContent).toBe('Visualiser / Modifier');
    expect(boutonFin()?.className).toContain('brl-bouton--vert');
  });

  it('③ sans capsule : « Classer », comme avant ce lot', async () => {
    ligneCourante = LIGNE();                      // aucune réponse de classement
    await monter();
    expect(boutonFin()?.textContent).toBe('Classer');
  });

  it('③ dans « Spam », pas de capsule donc pas de bouton vert', async () => {
    ligneCourante = LIGNE({ classement: CLASSE });
    await monter({ etiquette: { sorte: 'spam', evenementId: null } });
    expect(boutonFin()?.textContent).toBe('Classer');
  });

  it('④ la barre garde exactement le même nombre de boutons', async () => {
    ligneCourante = LIGNE({ classement: A_CLASSER });
    await monter();
    const avant = container.querySelectorAll('.brl button').length;
    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    ligneCourante = LIGNE({ classement: CLASSE });
    await monter();
    expect(container.querySelectorAll('.brl button').length).toBe(avant);
  });

  /**
   * 🔴 LE CLIC OUVRE LA FENÊTRE, ET NE DEMANDE AUCUN GESTE SUR LA LIGNE. Si « Visualiser » passait par
   * `onActionLigne(filId, 'classer')`, il ouvrirait l'échange ET son panneau d'affectation — exactement ce qu'on
   * remplace. Le test le vérifie par l'ABSENCE d'action et l'ABSENCE d'ouverture.
   */
  it('🔴 « Visualiser / Modifier » ouvre la FENÊTRE, sans ouvrir l’échange ni demander de geste', async () => {
    ligneCourante = LIGNE({ classement: CLASSE });
    await monter();
    await cliquer(boutonFin());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('#rdf-titre')?.textContent).toBe('Bien(s) de cet échange');
    // 🔴 LOT FICHE-RATTACHEMENT — l'objet et le nombre de mails en tête (demande d'Arno).
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Fuite salle de bain');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('3 mails dans la conversation');
    expect(ouverts).toEqual([]);   // la liste reste en place
    expect(actions).toEqual([]);   // et aucun « classer » n'est demandé
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴🔴 LOT FICHE-RATTACHEMENT — CE TEST A ÉTÉ RÉÉCRIT, ET IL FAUT DIRE POURQUOI.
   *
   * Il figeait la fenêtre d'avant : une ligne par LIEN, dont l'une portait « M. Bentz » — un nom de personne
   * annoncé comme un rattachement. Cette fenêtre-là n'existe plus. Elle montre désormais un bloc par BIEN, avec
   * l'adresse, le lot, la nature, le type, la surface, le statut, puis les personnes du bien et leurs
   * coordonnées ; les liens bruts restent accessibles sous « Voir le détail par mail ».
   *
   * ⚠️ ON NE L'A PAS SUPPRIMÉ : ce qu'il protégeait — « plusieurs rattachements se listent TOUS, n'en montrer
   * qu'un ferait modifier le mauvais » — reste vrai et reste éprouvé, sur la forme nouvelle.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 la fenêtre montre UN BLOC PAR BIEN, avec ses personnes et leurs coordonnées', async () => {
    const lien = (id: number, messageId: number) => ({
      id, messageId, pieceId: null, cible: { sorte: 'lot', cle: `c${id}`, id },
      libelle: `lien ${id}`, origine: 'automatique', statut: 'confirme', confiance: null, regle: 'a',
      motif: null, adresses: [], parUnHumain: false, creeLe: null, creePar: null, statutLe: null, statutPar: null,
    });
    rattachements = { etat: 'ok', data: [lien(1, 901), lien(2, 902)] };
    ficheFil = {
      etat: 'ok',
      data: {
        filId: 7, objet: 'Fuite salle de bain', nbMailsDuFil: 3, horsGestion: false, messageRecentId: 8123,
        disponible: true,
        biens: [
          {
            cle: '513', adresseComplete: '12 rue des Lilas, 92400 COURBEVOIE', numeroLot: '513',
            nature: 'Appartement', typeBien: 'Type 2', surfaceM2: null, statut: 'classe',
            dateMail: '2026-09-20', nbMails: 1, dossierDriveId: null, lienIds: [1],
            personnes: [{
              role: 'proprietaire', cle: 'P1', id: 12, nom: 'BENTZ Marc', civilite: null,
              /* 🔴 LOT FICHES-RETOUCHES — la coordonnée porte DEUX formes : `valeur` (la canonique, comparée et
                 mise dans le lien `tel:`) et `affichage` (celle qu'on lit). Le bandeau rend la seconde. */
              telephones: [{ valeur: '+33611223344', affichage: '06 11 22 33 44', libelle: 'Mobile 1' }],
              emails: [{ valeur: 'bentz@fictif.fr', affichage: 'bentz@fictif.fr', libelle: 'Email 1' }],
              expediteur: true,
            }],
          },
          {
            cle: '514', adresseComplete: '14 rue des Lilas, 92400 COURBEVOIE', numeroLot: '514',
            nature: null, typeBien: null, surfaceM2: null, statut: 'a_trancher',
            dateMail: '2026-09-20', nbMails: 1, dossierDriveId: null, lienIds: [2], personnes: [],
          },
        ],
      },
    };
    ligneCourante = LIGNE({ classement: CLASSE });
    await monter();
    await cliquer(boutonFin());

    const items = [...container.querySelectorAll('.rdf-item')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('12 rue des Lilas, 92400 COURBEVOIE');
    expect(items[0].textContent).toContain('lot 513');
    expect(items[0].textContent).toContain('Classé');
    // 🔴 LA SURFACE ABSENTE EST DITE, jamais devinée d'après le type.
    expect(items[0].textContent).toContain('surface non renseignée');
    /* 🔴 LES PERSONNES, AVEC LE TYPE DE CHAQUE COORDONNÉE et un bouton Copier par coordonnée.
       ⚠️ RÉÉCRIT LE 30/09/2026 (lot CONTACT-LIGNES) : l'attente portait le libellé D'ORIGINE (« Mobile 1 »).
       Arno a tranché — le titre porte le TYPE, « MOBILE », et ne s'écrit qu'une fois par groupe. Ce que la
       règle protégeait n'a pas bougé : la coordonnée n'est jamais rendue sans qu'on sache ce qu'elle est. */
    expect(items[0].textContent).toContain('BENTZ Marc');
    expect(items[0].textContent).toContain('Mobile');
    expect(items[0].textContent).toContain('06 11 22 33 44');
    expect(items[0].querySelectorAll('.rdf-contact')).toHaveLength(2);
    // 🔴 L'EXPÉDITEUR est dit par un MOT, jamais par la seule couleur.
    expect(items[0].textContent).toContain('Expéditeur');
    // 🔴 « VACANT À CETTE DATE » est une RÉPONSE, pas un vide.
    expect(items[0].textContent).toContain('Vacant à cette date');
    expect(items[1].textContent).toContain('À trancher');

    // Le MAIL dont vient chaque lien reste dit, sous le détail : c'est lui qui est rattaché, jamais l'échange.
    expect(items[0].textContent).toContain('mail nº 901');
    expect(items.every((i) => /Modifier ce rattachement/.test(i.textContent ?? ''))).toBe(true);
  });

  /** 🔴 HORS GESTION OU AUCUN BIEN : on le DIT, et le geste pour en sortir est là. */
  it('🔴 un échange « Hors gestion » le dit, avec « Rattacher à un bien »', async () => {
    ficheFil = {
      etat: 'ok',
      data: {
        filId: 7, objet: 'Publicité', nbMailsDuFil: 1, biens: [], horsGestion: true,
        messageRecentId: 8123, disponible: true,
      },
    };
    ligneCourante = LIGNE({ classement: CLASSE });
    await monter();
    await cliquer(boutonFin());
    const boite = container.querySelector('[role="dialog"]');
    expect(boite?.textContent).toContain('Hors gestion');
    expect([...container.querySelectorAll('button')]
      .some((b) => /Rattacher à un bien/.test(b.textContent ?? ''))).toBe(true);
  });

  /** ⚠️ La migration 257 absente est un ÉTAT, pas une panne : on le DIT plutôt que de montrer une liste vide. */
  it('sans la migration 257, la fenêtre le dit — elle ne montre pas une liste vide', async () => {
    rattachements = { etat: 'sans_schema' };
    ligneCourante = LIGNE({ classement: CLASSE });
    await monter();
    await cliquer(boutonFin());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('pas encore installés');
  });

  it('la fenêtre demande les rattachements de L’ÉCHANGE, pas d’un message', async () => {
    ligneCourante = LIGNE({ classement: AUTO });
    await monter();
    await cliquer(boutonFin());
    const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(appels.some((u) => u.includes('/rattachements?fil=7'))).toBe(true);
    // LOT FICHE-RATTACHEMENT — et la FICHE du même échange, dans la même route.
    expect(appels.some((u) => u.includes('/rattachements?fiche=7'))).toBe(true);
  });
});
