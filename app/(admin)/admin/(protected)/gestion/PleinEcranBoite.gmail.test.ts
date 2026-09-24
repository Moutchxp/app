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

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion?ecran=boite&etiquette=reception');
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
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

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
    expect(l).toContain('pièce jointe');
    expect(l).toContain('3 messages');
  });
});

describe('② L’OUVERTURE EN PLEINE PAGE, et le retour', () => {
  it('un clic ouvre la conversation en pleine page, et l’adresse le retient', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    expect(container.querySelector('.cnv')).not.toBeNull();
    expect(url()).toBe('/admin/gestion?ecran=boite&etiquette=reception&fil=101');
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
    await cliquer(retour());
    expect(container.querySelector('.cnv')).toBeNull();
    expect(url()).toBe('/admin/gestion?ecran=boite&etiquette=reception');
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
  it('échange NON classé : classer, créer, classer sans suite, et le menu « ⋯ »', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    expect(boutonPar(/^Classer dans une carte$/)).toBeDefined();
    expect(boutonPar(/^Créer un événement$/)).toBeDefined();
    expect(boutonPar(/^Classer sans suite$/)).toBeDefined();
    expect(container.querySelector('.gst-menu-bouton')).not.toBeNull();
    // Pas encore rattaché → ni « Déplacer », ni « Détacher ».
    expect(boutonPar(/^Déplacer$/)).toBeUndefined();
    expect(boutonPar(/^Détacher$/)).toBeUndefined();
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
    await cliquer(boutonPar(/^Classer dans une carte$/));
    expect(container.querySelector('.pe-classer')).not.toBeNull();
    expect(container.querySelector('.pe-grille--classer')).not.toBeNull();
    // La recherche d'événement EXISTANTE, celle de partout ailleurs, avec son champ AU-DESSUS de la liste.
    expect(container.querySelector('.gst-choix input[type="search"]')).not.toBeNull();
    expect(appels.some((a) => a.url.startsWith('/api/admin/gestion/evenements?q='))).toBe(true);
  });

  it('« Créer un événement » ouvre le MÊME panneau, sur le formulaire — et les deux voies restent offertes', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await cliquer(boutonPar(/^Créer un événement$/));
    expect(container.textContent).toContain('Qui demande');
    expect(container.textContent).toContain('Adresse (texte libre)');
    // Le pré-remplissage vient du MAIL, jamais d'une déduction — et il reste modifiable.
    expect((container.querySelector('.gst-saisie') as HTMLInputElement).value).toBe('Fuite salle de bain');
    expect(boutonPar(/^Événement existant$/)).toBeDefined();
  });

  it('🔴 classer appelle la route EXISTANTE, referme le partage, et la barre affiche la GES-…', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await cliquer(boutonPar(/^Créer un événement$/));
    await cliquer(boutonPar(/^Rattacher$/));
    const post = appels.find((a) => a.methode === 'POST' && a.url.includes('/affectation'));
    expect(post?.url).toContain('/api/admin/gestion/fils/101/affectation');
    expect(container.querySelector('.pe-classer')).toBeNull();          // le partage s'est refermé
    expect(container.querySelector('.cnv-ref')?.textContent).toBe('GES-2026-000007');
    // …et la barre propose désormais les gestes de l'état RATTACHÉ.
    expect(boutonPar(/^Déplacer$/)).toBeDefined();
    expect(boutonPar(/^Détacher$/)).toBeDefined();
  });

  it('« Fermer » referme le partage SANS rien faire', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await cliquer(boutonPar(/^Classer dans une carte$/));
    await cliquer(boutonPar(/^Fermer$/));
    expect(container.querySelector('.pe-classer')).toBeNull();
    expect(appels.some((a) => a.methode === 'POST')).toBe(false);
    expect(container.querySelector('.cnv')).not.toBeNull(); // on est resté sur l'échange
  });

  it('🔴 ③ changer d’échange REFERME le partage — sans quoi on classerait le mauvais', async () => {
    await monter();
    await cliquer(ligneDe('Fuite salle de bain'));
    await cliquer(boutonPar(/^Classer dans une carte$/));
    expect(container.querySelector('.pe-classer')).not.toBeNull();
    await cliquer(retour());
    await cliquer(ligneDe('Dates travaux'));
    expect(container.querySelector('.pe-classer')).toBeNull();
  });
});

describe('⑤ L’EN-TÊTE COMPACT, et l’écran partagé qui ne bouge pas', () => {
  it('en plein écran : le titre, la phrase en info-bulle CLIQUABLE, l’heure de relève et les deux boutons', async () => {
    await monter();
    expect(container.querySelector('.gst-bandeau--compact')).not.toBeNull();
    expect(container.querySelector('.gst-bandeau-titre')?.textContent).toContain('Gestion');
    expect(boutonPar(/^Relever maintenant$/)).toBeDefined();
    expect(boutonPar(/^Rafraîchir$/)).toBeDefined();
    expect(container.textContent).toContain('Dernière relève');
  });

  it('…et l’en-tête de page est REPLIÉ par une règle, jamais supprimé du document', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(css).toContain(':root[data-gst-plein="1"] .svv-page-head{display:none}');
    expect(css).toContain(':root[data-gst-plein="1"] .gst-page{max-width:none}');
  });

  it('🔴 L’ÉCRAN PARTAGÉ N’A PAS BOUGÉ : deux colonnes, bandeau ordinaire, aucun partage « classer »', async () => {
    window.history.replaceState(null, '', '/admin/gestion');
    await monter();
    expect(container.querySelector('.gst-deux')).not.toBeNull();
    expect(container.querySelector('.gst-bandeau--compact')).toBeNull();
    expect(container.querySelector('.pe-classer')).toBeNull();
    expect(container.querySelector('.bte-liste--dense')).toBeNull();
  });
});
