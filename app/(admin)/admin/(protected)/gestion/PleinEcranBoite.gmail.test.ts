// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { GestionVue } from './GestionVue';

/**
 * LOT 5-GMAIL — LA NAVIGATION DE LA BOÎTE, ÉPROUVÉE À L'ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE. Arno a comparé avec Gmail : la liste occupe toute la largeur, un clic ouvre l'échange
 * EN PLEINE PAGE, et classer se fait dans un partage qui s'ouvre à côté. Quatre défauts guettent, tous invisibles à
 * la relecture :
 *   ① la liste est DÉMONTÉE quand on ouvre un échange → le retour repart de la première page, et les trois pages
 *      qu'on venait de charger sont perdues. Ça ne se voit qu'après avoir fait défiler ;
 *   ② l'adresse ne suit pas → « Précédent » quitte le module au lieu de revenir à la liste ;
 *   ③ le partage « classer » reste ouvert quand on change d'échange → on classe le MAUVAIS (même piège que le
 *      panneau d'affectation du lot 4c) ;
 *   ④ des boutons d'envoi apparaissent alors que l'envoi n'existe pas — un bouton qui ment coûte plus qu'une absence.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIGNE = (filId: number, objet: string) => ({
  filId, objet, interlocuteur: 'Mme Martin', dernierSens: 'recu' as const, dernierLe: '2026-09-20T12:00:00Z',
  extrait: 'Bonjour, le robinet fuit toujours.', nbMessages: 3, nbLisibles: 3, aPiece: true,
  // LOT LECTURE-HTML-FIL-TROMBONE — le trombone lit OÙ sont les pièces, plus seulement s'il y en a. Ici : sur le
  //   message affiché, donc trombone NOIR.
  piecesDuMessage: 1, piecesAilleurs: 0,
  reference: null as string | null, sansSuite: false,
});
const COMPTES = { lisibles: 4944, automatiques: 12262, envoyes: 3311 };
const ECRAN = {
  file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0,
  evenements: [], evenementsTotal: 0, messagesCaptures: 10, messagesExclus: 0, derniereReleveLe: '2026-09-24T10:00:00Z',
};
const MESSAGE = {
  messageId: 900, de: 'martin@orange.fr', deNom: 'Mme Martin', sens: 'recu', recuLe: '2026-09-20T12:00:00Z',
  extrait: 'Bonjour', corps: 'Bonjour, le robinet fuit toujours.', horsFile: false, pieces: [],
  destinataires: 'gestion@criterimmo.fr', destA: null, destCc: null, destCci: null, destReplyTo: null,
};

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];
let filRattache: boolean;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FLECHES-RETOUR — UN HISTORIQUE QUI RECULE VRAIMENT, parce que jsdom n'en a pas
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   MESURÉ : dans jsdom, `history.back()` NE FAIT RIEN — ni changement d'adresse, ni `popstate`. Ce n'est pas un
   détail d'outillage ici : depuis ce lot, la flèche de retour RECULE dans l'historique (c'est ce qui rend la
   position de défilement et la recherche de la liste), et sans traversée il n'y aurait plus rien à éprouver.

   🔴 ON NE SIMULE DONC PAS LE RÉSULTAT, ON DONNE UN HISTORIQUE AU NAVIGATEUR D'ESSAI : une pile d'entrées
   (adresse + état), un curseur, et `back()` qui restaure l'entrée précédente puis émet `popstate` — exactement ce
   que fait un vrai navigateur, et ce que l'écran écoute déjà. Les assertions, elles, portent sur l'écran. */
function brancherHistorique(): () => void {
  const pile: { url: string; etat: unknown }[] = [
    { url: '/admin/gestion?ecran=boite&etiquette=reception', etat: null },
  ];
  let i = 0;
  const poser = (): void => {
    window.history.replaceState(pile[i].etat, '', pile[i].url);
  };
  const vrai = {
    push: window.history.pushState.bind(window.history),
    remplace: window.history.replaceState.bind(window.history),
    back: window.history.back.bind(window.history),
  };
  window.history.pushState = ((etat: unknown, _t: string, url: string) => {
    pile.length = i + 1;
    pile.push({ url, etat });
    i += 1;
    vrai.push(etat, _t, url);
  }) as typeof window.history.pushState;
  window.history.replaceState = ((etat: unknown, _t: string, url: string) => {
    pile[i] = { url, etat };
    vrai.remplace(etat, _t, url);
  }) as typeof window.history.replaceState;
  window.history.back = (() => {
    if (i === 0) return;
    i -= 1;
    poser();
    window.dispatchEvent(new PopStateEvent('popstate', { state: pile[i].etat }));
  }) as typeof window.history.back;
  return () => {
    window.history.pushState = vrai.push;
    window.history.replaceState = vrai.remplace;
    window.history.back = vrai.back;
  };
}
let debrancherHistorique: () => void = () => {};

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion?ecran=boite&etiquette=reception');
  debrancherHistorique = brancherHistorique();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  filRattache = false;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    appels.push({ url: u, methode });
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => COMPTES } as unknown as Response;
    if (u.includes('/boite')) {
      return { ok: true, json: async () => ({ lignes: [LIGNE(101, 'Fuite salle de bain'), LIGNE(102, 'Dates travaux')], suivant: null, total: 2, comptes: COMPTES }) } as unknown as Response;
    }
    if (u.includes('/messages')) {
      return { ok: true, json: async () => ({
        fil: { filId: 101, objet: 'Fuite salle de bain', etat: 'a_classer', reference: filRattache ? 'GES-2026-000007' : null, evenementId: filRattache ? 7 : null },
        messages: [MESSAGE], partis: [],
      }) } as unknown as Response;
    }
    if (u.includes('/affectation') && methode === 'GET') {
      return { ok: true, json: async () => ({ propositions: { objet: 'Fuite salle de bain', demandeurNom: 'Mme Martin', demandeurEmail: null, adresseLibre: '3 rue Bleue' } }) } as unknown as Response;
    }
    if (u.includes('/affectation') && methode === 'POST') {
      filRattache = true;
      return { ok: true, json: async () => ({ ok: true, evenementId: 7, reference: 'GES-2026-000007' }) } as unknown as Response;
    }
    if (u.includes('/evenements')) return { ok: true, json: async () => ({ evenements: [], max: 30 }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  debrancherHistorique();
  vi.restoreAllMocks();
});

// `setTimeout(0)` et non seulement des microtâches : la recherche d'événement est TEMPORISÉE (elle part sur un
//   minuteur, même à zéro pour une saisie vide). Sans ce tour de boucle, on conclurait à tort qu'elle n'interroge rien.
const calmer = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
};
const monter = async () => { await act(async () => { root.render(createElement(GestionVue)); }); await calmer(); };
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (motif: RegExp) => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: Element | null | undefined) => { await act(async () => { (b as HTMLElement | undefined)?.click(); }); await calmer(); };
const liste = () => container.querySelector('.pe-liste') as HTMLElement | null;
const ligneDe = (objet: string) => [...container.querySelectorAll('.bte-ligne')]
  .find((b) => (b.textContent ?? '').includes(objet));
const retour = () => container.querySelector('button[aria-label="Retour à la liste"]');
const url = () => window.location.pathname + window.location.search;
/**
 * LOT 5-STATUT — les trois gestes de classement ont QUITTÉ la barre pour le cartouche de statut, à gauche de la date
 * de chaque message. On y passe donc par son déclencheur (« Classer » / « Modifier »), puis par le geste voulu.
 */
const ouvrirStatut = async () => cliquer(container.querySelector('.cnv-statut-bouton'));

describe('① LA LISTE — pleine largeur par défaut, et jamais démontée', () => {
  it('à l’arrivée : la liste est là, aucune conversation ouverte', async () => {
    await monter();
    expect(liste()?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('.pe-lecture')).toBeNull();
    expect(container.textContent).toContain('Fuite salle de bain');
  });

  it('🔴 ① ouvrir un échange MASQUE la liste, sans la démonter — ses pages et sa recherche survivent', async () => {
    await monter();
    const lectures = appels.filter((a) => a.url.includes('/boite?') || a.url.includes('/boite&') || /\/boite$/.test(a.url)).length;
    await cliquer(ligneDe('Fuite salle de bain'));
    expect(liste()?.hasAttribute('hidden')).toBe(true);   // masquée…
    expect(liste()).not.toBeNull();                        // …mais toujours montée
    await cliquer(retour());
    expect(liste()?.hasAttribute('hidden')).toBe(false);
    // Aucune relecture de la boîte au retour : c'est la MÊME liste, avec ce qu'elle avait chargé.
    expect(appels.filter((a) => a.url.includes('/boite') && !a.url.includes('comptes')).length).toBe(lectures);
  });

  it('la présentation DENSE est demandée : une ligne par échange sur ordinateur', async () => {
    await monter();
    expect(container.querySelector('.bte-liste--dense')).not.toBeNull();
    // …et la ligne porte toujours TOUT : correspondant, objet, aperçu, marques, date.
    const l = ligneDe('Fuite salle de bain')?.textContent ?? '';
    expect(l).toContain('Mme Martin');
    expect(l).toContain('robinet fuit');
    /**
     * LOT LISTE-GMAIL — DEUX MARQUES ONT CHANGÉ DE FORME, aucune n'a disparu :
     *   · « pièce jointe » devient un trombone portant le NOMBRE, qui dit ce que le mot ne disait pas ;
     *   · « 3 messages » quitte le bas de la ligne pour la BARRE D'ACTIONS, tout à droite, comme dans Gmail.
     *
     * ⚠️ LOT LISTE-PAGINATION — le trombone est un TRACÉ, plus un emoji (celui-ci ignorait `color` et restait
     * argenté à côté d'un chiffre noir ou gris). On cherche donc la MARQUE, pas un caractère : `textContent` ne
     * voit pas un tracé.
     */
    expect(container.querySelector('.bte-marque--pieces')).not.toBeNull();
    expect(container.querySelector('.bte-marque--pieces')?.textContent).toContain('1');
    expect(container.querySelector('.brl-compte')?.textContent).toBe('3');
  });
});

describe('② L’OUVERTURE EN PLEINE PAGE, et le retour', () => {
  it('un clic ouvre la conversation en pleine page, et l’adresse le retient', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    expect(container.querySelector('.cnv')).not.toBeNull();
    // LOT ERGO-BOITE — la boîte sur « Réception » EST l'adresse nue : seul le fil ouvert s'y écrit.
    expect(url()).toBe('/admin/gestion?fil=101');
  });

  it('la flèche de retour REMPLACE « ← Retour » : même geste, libellé accessible, cible d’au moins 44 px', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    expect(retour()).not.toBeNull();
    expect(boutonPar(/^← Retour$/)).toBeUndefined();
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(css).toContain('.cnv-retour{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px');
  });

  it('elle ramène à la liste, et l’adresse revient avec elle', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    expect(url()).toBe('/admin/gestion?fil=101');
    await cliquer(retour());
    expect(container.querySelector('.cnv')).toBeNull();
    expect(liste()?.hasAttribute('hidden')).toBe(false);
    /**
     * 🔴 LOT FLECHES-RETOUR — L'ADRESSE REVIENT TELLE QU'ELLE ÉTAIT, et non réécrite sous sa forme la plus courte.
     * La flèche RECULE maintenant dans l'historique : le navigateur restaure l'entrée précédente à l'identique —
     * c'est précisément ce qui rend aussi la position de défilement et la page de liste. Les deux écritures
     * désignent le même écran (`lireEtatUrl` les ramène au même état) ; ce qui compte est qu'aucun fil n'y reste.
     */
    expect(url()).toContain('/admin/gestion');
    expect(url()).not.toContain('fil=');
  });

  it('🔴 ② « Précédent » du navigateur ramène AUSSI à la liste', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    // jsdom traite `history.back()` hors des tours de `act` : on rejoue ce que le navigateur produit — l'adresse
    //   précédente, puis l'événement `popstate`. C'est exactement ce que l'écran doit savoir écouter.
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite&etiquette=reception');
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await calmer();
    expect(container.querySelector('.cnv')).toBeNull();
    expect(liste()?.hasAttribute('hidden')).toBe(false);
  });
});

describe('③ LA BARRE D’ACTIONS — tout est là, rien n’est inventé', () => {
  it('🔴 LOT 5-STATUT — la barre ne porte PLUS les trois boutons de classement : flèche et menu « ⋯ » seulement', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    const barre = container.querySelector('.cnv-bandeau--barre') as HTMLElement;
    const dansLaBarre = [...barre.querySelectorAll('button')].map((b) => b.textContent ?? '');
    for (const mot of ['Classer dans une carte', 'Créer un événement', 'Classer sans suite']) {
      expect(dansLaBarre.some((t) => t.trim() === mot)).toBe(false);
    }
    expect(barre.querySelector('button[aria-label="Retour à la liste"]')).not.toBeNull();
    expect(barre.querySelector('.gst-menu-bouton')).not.toBeNull();
  });

  /**
   * ⚠️ « DANS LE CARTOUCHE » EST DEVENU « DANS LA FENÊTRE » (lot CLASSER-PAR-LA-MODALE) — le bloc en ligne de
   * quatre boutons est supprimé par accord d'Arno, et ses fonctions sont passées dans la fenêtre « Bien(s)
   * rattaché(s) à ce mail » qu'ouvre désormais « Classer ».
   *
   * 🔴 CE QUE LE GARDE PROTÈGE EST INCHANGÉ : les trois gestes de classement ne sont PAS dans la barre du haut
   * (l'épreuve juste au-dessus), et ils sont tous ATTEIGNABLES depuis le mail. C'est leur adresse qui change,
   * pas leur existence — « Classer dans une carte » et « Classer sans suite » en pied de fenêtre, « Créer un
   * événement » dans sa ligne « Événement rattaché » (point 3), et « Annuler » celui de la fenêtre.
   */
  it('…et les trois se trouvent dans LA FENÊTRE, une fois « Classer » ouvert', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await ouvrirStatut();
    /* 🔴 C'EST BIEN LA FENÊTRE, et non un bloc en ligne : un dialogue, avec son titre. */
    expect(container.querySelector('.rdf[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('.cnv-statut-actions')).toBeNull();
    expect(boutonPar(/^Classer dans une carte$/)).toBeDefined();
    expect(boutonPar(/^Créer un événement$/)).toBeDefined();
    expect(boutonPar(/^Classer sans suite$/)).toBeDefined();
    expect(boutonPar(/^Annuler$/)).toBeDefined();
  });

  it('🔴 ④ AUCUN bouton d’envoi : « Répondre », « Répondre à tous », « Transférer » n’existent pas encore', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    for (const mot of [/Répondre/, /Transférer/, /Transferer/]) expect(boutonPar(mot)).toBeUndefined();
    // …et pas davantage désactivés : on ne promet pas une fonction absente.
    expect(container.textContent).not.toContain('Répondre');
  });
});

describe('④ CLASSER — le partage s’ouvre, et se referme une fois l’échange classé', () => {
  it('« Classer dans une carte » ouvre le partage sur la RECHERCHE d’événements', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await ouvrirStatut();
    await cliquer(boutonPar(/^Classer dans une carte$/));
    expect(container.querySelector('.pe-classer')).not.toBeNull();
    expect(container.querySelector('.pe-grille--classer')).not.toBeNull();
    // La recherche d'événement EXISTANTE, celle de partout ailleurs, avec son champ AU-DESSUS de la liste.
    expect(container.querySelector('.gst-choix input[type="search"]')).not.toBeNull();
    expect(appels.some((a) => a.url.startsWith('/api/admin/gestion/evenements?q='))).toBe(true);
  });

  /**
   * ⚠️ LE CHEMIN A CHANGÉ AU LOT CLASSER-PAR-LA-MODALE, et le voici écrit — c'est le seul changement de ces
   * deux épreuves.
   *
   * Avant : le cartouche « Classer » révélait un bloc en ligne de quatre boutons, dont « Créer un événement »
   * qui ouvrait ce panneau sur son formulaire. Ce bloc est SUPPRIMÉ (accord d'Arno, point 1) et ses fonctions
   * sont passées dans la fenêtre « Bien(s) rattaché(s) à ce mail ».
   *
   * 🔴 CE QUE CES DEUX ÉPREUVES PROTÈGENT N'A PAS BOUGÉ D'UN POUCE : que le panneau de classement s'ouvre sur
   * SON formulaire, prérempli d'après le mail, que les DEUX voies y restent offertes, et que « Rattacher »
   * appelle la route existante. On y arrive par « Classer dans une carte » (en pied de fenêtre), puis par la
   * voie « Nouvel événement » du panneau — qui est, et qui était déjà, la porte de ce formulaire.
   */
  it('« Créer un événement » ouvre le MÊME panneau, sur le formulaire — et les deux voies restent offertes', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await ouvrirStatut();
    await cliquer(boutonPar(/^Classer dans une carte$/));
    await cliquer(boutonPar(/^Nouvel événement$/));
    expect(container.textContent).toContain('Qui demande');
    expect(container.textContent).toContain('Adresse (texte libre)');
    // Le pré-remplissage vient du MAIL, jamais d'une déduction — et il reste modifiable.
    expect((container.querySelector('.gst-saisie') as HTMLInputElement).value).toBe('Fuite salle de bain');
    expect(boutonPar(/^Événement existant$/)).toBeDefined();
  });

  it('🔴 classer appelle la route EXISTANTE, referme le partage, et la barre affiche la GES-…', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await ouvrirStatut();
    await cliquer(boutonPar(/^Classer dans une carte$/));
    await cliquer(boutonPar(/^Nouvel événement$/));
    await cliquer(boutonPar(/^Rattacher$/));
    const post = appels.find((a) => a.methode === 'POST' && a.url.includes('/affectation'));
    expect(post?.url).toContain('/api/admin/gestion/fils/101/affectation');
    expect(container.querySelector('.pe-classer')).toBeNull();          // le partage s'est refermé
    // …et le CARTOUCHE dit maintenant la carte, en toutes lettres et pas seulement en vert.
    const cartouche = container.querySelector('.cnv-cartouche') as HTMLElement;
    expect(cartouche.textContent).toContain('GES-2026-000007');
    expect(cartouche.className).toContain('cnv-cartouche--succes');
  });

  it('« Fermer » referme le partage SANS rien faire', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await ouvrirStatut();
    await cliquer(boutonPar(/^Classer dans une carte$/));
    await cliquer(boutonPar(/^Fermer$/));
    expect(container.querySelector('.pe-classer')).toBeNull();
    // « SANS RIEN FAIRE » vise les GESTES sur l'échange. LOT 5-BOITE : ouvrir une conversation la marque lue pour
    //   le collaborateur — un POST parti tout seul, qui ne classe rien et n'a pas à compter ici.
    expect(appels.some((a) => a.methode === 'POST' && !a.url.endsWith('/lecture'))).toBe(false);
    expect(container.querySelector('.cnv')).not.toBeNull(); // on est resté sur l'échange
  });

  it('🔴 ③ changer d’échange REFERME le partage — sans quoi on classerait le mauvais', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await ouvrirStatut();
    await cliquer(boutonPar(/^Classer dans une carte$/));
    expect(container.querySelector('.pe-classer')).not.toBeNull();
    await cliquer(retour());
    await cliquer(ligneDe('Dates travaux'));
    expect(container.querySelector('.pe-classer')).toBeNull();
  });
});

describe('⑤ L’EN-TÊTE COMPACT, et l’écran partagé qui ne bouge pas', () => {
  /**
   * 🔴 LOT ERGO-BOITE-3 — DANS LA BOÎTE, IL N'Y A PLUS D'EN-TÊTE DU TOUT. Le bloc gris « Gestion ⓘ » est supprimé
   * (retrait demandé par Arno le 27/09/2026) : il ne portait plus que le titre du module, au-dessus d'une boîte
   * mail qui dit déjà ce qu'elle est.
   *
   * 🔴 CE QUE CE TEST PROTÈGE MAINTENANT, et c'est le plus important : ce qui vivait dans ce bloc n'a pas disparu
   * de l'écran, il a CHANGÉ DE PLACE. L'heure de relève est dans la colonne, en petit ; le geste est devenu une
   * icône nommée à côté du titre de la liste. Pièce par pièce, comme avant.
   */
  it('en plein écran : aucun en-tête, l’état DANS LA COLONNE et l’icône de relève', async () => {
    await monter();
    // Le bloc gris n'existe plus dans la boîte — ni compact, ni entier.
    expect(container.querySelector('.gst-bandeau')).toBeNull();
    expect(container.querySelector('.gst-bandeau-titre')).toBeNull();
    // Les deux boutons ont quitté le bandeau…
    expect(boutonPar(/^Relever maintenant$/)).toBeUndefined();
    expect(boutonPar(/^Rafraîchir$/)).toBeUndefined();
    // …remplacés par une icône NOMMÉE, à côté du titre de la liste.
    expect(container.querySelector('.bte-relever')?.getAttribute('aria-label')).toBe('Relever et actualiser');
    // …et l'heure de relève est dans la colonne, en petit.
    expect(container.querySelector('.cm-etat')?.textContent).toContain('Dernière relève');
  });

  /**
   * ══ ⚠️ SECONDE ASSERTION RETIRÉE LE 07/10/2026 — LOT ADMIN-PLEINE-LARGEUR ═══════════════════════════════════
   *
   * ELLE EXIGEAIT `:root[data-gst-plein="1"] .gst-page{max-width:none}`, la levée du plafond du module en plein
   * écran. Le PLAFOND lui-même a disparu : toute l'administration va désormais jusqu'au bord droit, et une règle
   * qui lève un plafond inexistant ne lève rien. La garder aurait figé une mécanique devenue sans objet.
   *
   * 🔴 CE QUE LE CAS PROTÈGE — « l'en-tête est REPLIÉ par une règle, jamais supprimé du document » — n'a pas
   * bougé d'un pouce, et c'est la seule chose qu'il éprouvait vraiment. On vérifie en plus qu'aucun plafond
   * n'est revenu par la bande : le plein écran n'a plus rien à défaire.
   */
  it('…et l’en-tête de page est REPLIÉ par une règle, jamais supprimé du document', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(css).toContain(':root[data-gst-plein="1"] .svv-page-head{display:none}');
    /* 🔴 ET PLUS AUCUN PLAFOND À LEVER : ni la règle de base, ni sa levée.
       ⚠️ SANS LES COMMENTAIRES : l'encadré du retrait CITE la règle d'avant pour dire ce qu'elle faisait, et une
       lecture brute serait tombée sur la mémoire du lot au lieu du code. */
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('.gst-page{max-width:');
  });

  it('🔴 L’ÉCRAN PARTAGÉ N’A PAS BOUGÉ : deux colonnes, bandeau ordinaire, aucun partage « classer »', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=partage');
    await monter();
    expect(container.querySelector('.gst-deux')).not.toBeNull();
    expect(container.querySelector('.gst-bandeau--compact')).toBeNull();
    expect(container.querySelector('.pe-classer')).toBeNull();
    expect(container.querySelector('.bte-liste--dense')).toBeNull();
  });
});
