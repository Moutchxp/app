// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';

/**
 * LOT 5-FUSION — L'ÉCRAN FUSIONNÉ, MONTÉ POUR DE VRAI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE. Le lot retire les deux onglets — le SEUL retrait autorisé, décidé par Arno. Tout le
 * reste doit survivre EXACTEMENT, et « survivre » ne se prouve pas en lisant le code : il faut monter l'écran et
 * chercher les commandes à l'endroit où quelqu'un ira les chercher. C'est ce que fait ce fichier, écran par écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Et trois défauts propres à ce lot, chacun invisible à la relecture :
 *   ① l'adresse ne suit pas l'écran → recharger la page ramène au début, et « Précédent » quitte le module ;
 *   ② entrer en plein écran n'arrive pas sur « À classer » → on tombe dans la réserve au lieu du travail du jour ;
 *   ③ le poste de tri est RECOPIÉ dans le plein écran au lieu d'y être rendu → deux files qui divergeront.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ECHANGE = (filId: number, objet: string) => ({
  filId, objet, interlocuteur: 'Mme M.', dernierLe: '2026-09-20T12:00:00Z', nbMessages: 2, nbPieces: 1, attend: true,
});
const CARTE = (id: number, nbFils: number) => ({
  evenementId: id, reference: `GES-2026-${String(id).padStart(6, '0')}`, objet: `Dossier ${id}`,
  demandeur: 'Mme M.', adresseLibre: null, etat: 'a_traiter', ouvertLe: '2026-09-01T10:00:00Z',
  dernierEchangeLe: '2026-09-20T12:00:00Z', nbFils, nbMailsDeplaces: 0, attend: false,
});
const ECRAN = {
  file: [ECHANGE(101, 'Préavis de départ')], filsTotal: 442, fenetreJours: 30, filsTropAnciens: 12,
  sansSuite: [{ filId: 55, objet: 'Pub', motif: null, classeLe: '2026-09-01T10:00:00Z', classePar: 'Arno' }],
  sansSuiteTotal: 7,
  evenements: [CARTE(12, 3), CARTE(13, 0)], evenementsTotal: 2,
  messagesCaptures: 56000, messagesExclus: 40000, derniereReleveLe: '2026-09-24T10:00:00Z',
};
const COMPTES = { lisibles: 4944, automatiques: 12262, envoyes: 3311 };
const PAGE_BOITE = { lignes: [], suivant: null, total: null, comptes: COMPTES };

let container: HTMLDivElement;
let root: Root;
let urlsBoite: string[];

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urlsBoite = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => COMPTES } as unknown as Response;
    if (u.includes('/boite')) { urlsBoite.push(u); return { ok: true, json: async () => PAGE_BOITE } as unknown as Response; }
    if (u.includes('/messages')) return { ok: true, json: async () => ({ messages: [], partis: [] }) } as unknown as Response;
    if (u.includes('/evenements/')) return { ok: true, json: async () => ({ ...CARTE(12, 3), fils: [], mailsDeplaces: [], traiteLe: null, traitePar: null, demandeurNom: 'Mme M.', demandeurEmail: null, ouvertPar: 'Arno' }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const monter = async () => { await act(async () => { root.render(createElement(GestionVue)); }); await calmer(); };
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (motif: RegExp) => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: HTMLElement | undefined) => { await act(async () => { b?.click(); }); await calmer(); };
const texte = () => container.textContent ?? '';
const url = () => window.location.pathname + window.location.search;

describe('🔴 les deux onglets sont partis, et rien d’autre', () => {
  it('aucun onglet « Poste de tri » / « Boîte mail » à l’écran', async () => {
    await monter();
    expect(boutonPar(/^Poste de tri$/)).toBeUndefined();
    expect(container.querySelector('.gst-modes')).toBeNull();
  });

  it('l’écran partagé est le point d’entrée : la file À GAUCHE, les événements À DROITE', async () => {
    await monter();
    expect(container.querySelector('.gst-deux')).not.toBeNull();
    expect(texte()).toContain('À classer');
    expect(texte()).toContain('Événements');
    // L'ordre du DOM reste celui du mobile : la file d'abord.
    const html = container.innerHTML;
    expect(html.indexOf('gst-titre-file')).toBeLessThan(html.indexOf('gst-titre-ev'));
  });

  it('CHAQUE colonne a son bouton « Plein écran » — un pour la boîte, un pour les événements', async () => {
    await monter();
    expect(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))).toHaveLength(2);
  });
});

describe('🔴 ① l’adresse suit l’écran, et l’écran suit l’adresse', () => {
  it('l’adresse nue reste nue : l’écran partagé n’écrit rien', async () => {
    await monter();
    expect(url()).toBe('/admin/gestion');
  });

  it('entrer en plein écran l’écrit dans l’adresse, et « Précédent » ramène à l’écran partagé', async () => {
    await monter();
    await cliquer(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))[0]);
    expect(url()).toBe('/admin/gestion?ecran=boite');

    // ⚠️ On ne se sert PAS de `history.back()` : jsdom le traite de façon asynchrone, hors des tours de `act`, et la
    //   navigation retomberait au milieu d'un AUTRE test. Ce qui est éprouvé ici est exactement ce que le lot ajoute :
    //   l'écran ÉCOUTE `popstate` et se relit depuis l'adresse. Le navigateur, lui, sait faire le reste.
    window.history.replaceState(null, '', '/admin/gestion');
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await calmer();
    expect(container.querySelector('.gst-deux')).not.toBeNull();
  });

  it('🔴 une adresse collée ouvre DIRECTEMENT le bon écran — c’est tout l’intérêt de l’écrire', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=evenements');
    await monter();
    expect(boutonPar(/Écran partagé/)).toBeDefined();
    expect(container.querySelector('.gst-deux')).toBeNull();
  });

  it('choisir une étiquette l’écrit, et la liste la DEMANDE au serveur', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite');
    await monter();
    await cliquer(boutonPar(/^Envoyés/));
    expect(url()).toBe('/admin/gestion?ecran=boite&etiquette=envoyes');
    expect(urlsBoite.some((u) => u.includes('etiquette=envoyes'))).toBe(true);
  });
});

describe('🔴 ② on entre en plein écran sur « À classer », pas dans la réserve', () => {
  it('le bouton de la colonne de gauche arrive sur le travail du jour', async () => {
    await monter();
    await cliquer(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))[0]);
    const active = container.querySelector('.cm-entree--active');
    expect(active?.textContent).toContain('À classer');
  });

  it('les cinq étiquettes fixes sont là, avec leurs nombres, et les cartes NON VIDES ensuite', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite');
    await monter();
    const etiqs = [...container.querySelectorAll('.cm-entree')].map((e) => e.textContent ?? '');
    expect(etiqs.some((t) => t.includes('À classer') && t.includes('442'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Réception') && t.includes('4944'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Envoyés') && t.includes('3311'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Sans suite') && t.includes('7'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Courrier automatique') && t.includes('12262'))).toBe(true);
    // La carte à 3 échanges est listée avec sa référence ; celle à 0 échange ne prend pas de place.
    expect(etiqs.some((t) => t.includes('GES-2026-000012'))).toBe(true);
    expect(etiqs.some((t) => t.includes('GES-2026-000013'))).toBe(false);
  });
});

describe('🔴 ③ sous « À classer », c’est le POSTE DE TRI lui-même — avec ses gestes', () => {
  it('la ligne de file, son échange, ses gestes et son panneau sont là', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite');
    await monter();
    expect(texte()).toContain('Préavis de départ');
    expect(texte()).toContain('attend une réponse');
    expect(boutonPar(/^Classer sans suite$/)).toBeDefined();
    // « Affecter » a été remplacé par « Classer dans une carte » : même bouton, même route, seul le mot change.
    expect(boutonPar(/^Classer dans une carte$/)).toBeDefined();
  });

  it('🔴 …et l’écran PARTAGÉ dit le MÊME mot : un seul geste, un seul mot (lot 5-FUSION-B)', async () => {
    await monter();
    expect(boutonPar(/^Classer dans une carte$/)).toBeDefined();
    expect(boutonPar(/Affecter/)).toBeUndefined();
  });
});

describe('CE QUI DOIT SURVIVRE — l’inventaire, vérifié à l’écran', () => {
  // Un `it` par écran, et non une boucle qui démonte puis remonte dans la même racine : deux racines successives dans
  //   un même test laissent derrière elles un montage à moitié défait, et ce sont les tests SUIVANTS qui rougissent.
  for (const [nom, adresse] of [
    ['partagé', '/admin/gestion'], ['boîte en plein écran', '/admin/gestion?ecran=boite'],
    ['événements en plein écran', '/admin/gestion?ecran=evenements'],
  ] as const) {
    it(`« Relever maintenant » et « Rafraîchir » sont présents dans l’écran ${nom}`, async () => {
      window.history.replaceState(null, '', adresse);
      await monter();
      expect(boutonPar(/^Relever maintenant$/)).toBeDefined();
      expect(boutonPar(/^Rafraîchir$/)).toBeDefined();
    });
  }

  it('le compteur « N échanges plus anciens » et sa sortie vers la boîte sont intacts', async () => {
    await monter();
    expect(texte()).toContain('12 échanges plus anciens que 30 jours');
    expect(texte()).toContain('Rien n’est supprimé');
    const sortie = boutonPar(/Les voir dans la boîte mail/);
    expect(sortie).toBeDefined();
    // …et elle mène à « Réception », c'est-à-dire à ce que montrait l'onglet supprimé : tout le courrier.
    await cliquer(sortie);
    expect(url()).toBe('/admin/gestion?ecran=boite&etiquette=reception');
  });

  it('« Classés sans suite » et son bouton « Rouvrir » restent dans l’écran partagé', async () => {
    await monter();
    expect(texte()).toContain('Classés sans suite');
    expect(boutonPar(/^Rouvrir$/)).toBeDefined();
  });

  it('les cartes gardent toutes leurs fonctions en plein écran : c’est la MÊME carte, pas une copie', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=evenements');
    await monter();
    expect(texte()).toContain('GES-2026-000012');
    expect(texte()).toContain('Dossier 12');
    expect(texte()).toContain('3 échanges'); // le libellé de la carte, tel quel
    expect(boutonPar(/Écran partagé/)).toBeDefined();
  });

  it('la recherche de la boîte et ses filtres sont là, sous chaque étiquette', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite&etiquette=reception');
    await monter();
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    expect(boutonPar(/Filtres \(période, expéditeur\)/)).toBeDefined();
    expect(boutonPar(/^Chercher$/)).toBeDefined();
  });

  it('l’interrupteur du courrier automatique reste là où il a toujours été : sur la boîte entière', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite&etiquette=reception');
    await monter();
    expect(boutonPar(/Afficher aussi le courrier automatique/)).toBeDefined();
    expect(texte()).toContain('12262 échanges ne contiennent que du courrier automatique');
  });

  it('…et là où l’étiquette décide à sa place, on le DIT, avec la sortie', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite');
    await monter();
    expect(texte()).toContain('Le poste de tri n’a jamais montré le courrier automatique');
    expect(boutonPar(/Voir l’étiquette « Courrier automatique »/)).toBeDefined();
    // …et la sortie mène bien à l'étiquette qui les rassemble, sans rien masquer au passage.
    await cliquer(boutonPar(/Voir l’étiquette « Courrier automatique »/));
    expect(url()).toBe('/admin/gestion?ecran=boite&etiquette=automatique');
  });

  it('ouvrir un échange mène à la vue conversation UNIQUE du module, et l’adresse le retient', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite');
    await monter();
    await cliquer(container.querySelector('.gst-objet-bouton') as HTMLElement);
    expect(url()).toBe('/admin/gestion?ecran=boite&fil=101');
    expect(container.querySelector('.cnv')).not.toBeNull();       // la vue conversation du lot 5b, pas une autre
    expect(boutonPar(/← Retour/)).toBeDefined();
  });
});
