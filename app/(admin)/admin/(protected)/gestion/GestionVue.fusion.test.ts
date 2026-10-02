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
// 🔴🔴 LOT DOSSIER-A-CLASSER — `aClasser` est le septième nombre de la lecture de la boîte : il alimente la
//   nouvelle entrée « À classer » de la colonne.
const COMPTES = { lisibles: 4944, automatiques: 12262, envoyes: 3311, aClasser: 1234 };
const PAGE_BOITE = { lignes: [], suivant: null, total: null, comptes: COMPTES };

let container: HTMLDivElement;
let root: Root;
let urlsBoite: string[];

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion?ecran=partage');
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
// 🔴 LOT ERGO-BOITE — ces tests éprouvent le passage écran partagé → plein écran : ils doivent donc PARTIR de
  //   l'écran partagé, que l'adresse nue ne désigne plus (le défaut est la boîte).
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
    expect(texte()).toContain('Sans événement');
    expect(texte()).toContain('Événements');
    // L'ordre du DOM reste celui du mobile : la file d'abord.
    const html = container.innerHTML;
    expect(html.indexOf('gst-titre-file')).toBeLessThan(html.indexOf('gst-titre-ev'));
  });

  /**
   * 🔴 LOT STATUT-HORS-GESTION — TROIS BOUTONS, et le premier est celui qui manquait. Arno avait constaté que la
   * colonne de gauche avait PERDU son « Plein écran » quand elle est devenue la boîte de réception : il revient à
   * la même place que celui des événements. La file des échanges sans événement, repliée en dessous, garde le sien.
   */
  it('CHAQUE colonne a son bouton « Plein écran » — réception, échanges sans événement, événements', async () => {
    await monter();
    expect(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))).toHaveLength(3);
  });
});

describe('🔴 ① l’adresse suit l’écran, et l’écran suit l’adresse', () => {
  it('l’adresse nue ouvre la BOÎTE, et reste nue', async () => {
    // LOT ERGO-BOITE — le défaut est la boîte sur « Réception » : l'adresse nue la désigne, donc n'écrit rien.
    window.history.replaceState(null, '', '/admin/gestion');
    await monter();
    expect(url()).toBe('/admin/gestion');
    expect(container.querySelector('.cm-entree')).not.toBeNull();   // la colonne de la boîte est là
    expect(container.querySelector('.gst-deux')).toBeNull();        // …et pas l'écran partagé
  });

  it('entrer en plein écran l’écrit dans l’adresse, et « Précédent » ramène à l’écran partagé', async () => {
    await monter();
    await cliquer(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))[0]);
    /**
     * 🔴 LOT STATUT-HORS-GESTION — LE PREMIER « Plein écran » EST CELUI DE LA BOÎTE DE RÉCEPTION, et il ouvre
     * TOUJOURS « Réception » (demande d'Arno). La boîte sur Réception étant le défaut du module, l'adresse nue la
     * désigne : il n'y a donc rien à écrire. Avant ce lot, ce bouton ouvrait « À classer » — la file des échanges
     * sans événement, qui garde le sien, plus bas dans la colonne.
     */
    expect(url()).toBe('/admin/gestion');

    // ⚠️ On ne se sert PAS de `history.back()` : jsdom le traite de façon asynchrone, hors des tours de `act`, et la
    //   navigation retomberait au milieu d'un AUTRE test. Ce qui est éprouvé ici est exactement ce que le lot ajoute :
    //   l'écran ÉCOUTE `popstate` et se relit depuis l'adresse. Le navigateur, lui, sait faire le reste.
    window.history.replaceState(null, '', '/admin/gestion?ecran=partage');
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
    window.history.replaceState(null, '', '/admin/gestion');
    await monter();
    await cliquer(boutonPar(/^Envoyés/));
    expect(url()).toBe('/admin/gestion?etiquette=envoyes');
    expect(urlsBoite.some((u) => u.includes('etiquette=envoyes'))).toBe(true);
  });
});

describe('🔴 ② le plein écran de la colonne de gauche ouvre la RÉCEPTION', () => {
  /**
   * 🔴 LOT STATUT-HORS-GESTION — DEMANDE D'ARNO, MOT POUR MOT : « la boîte mail s'ouvre en plein écran
   * OBLIGATOIREMENT sur la liste "Réception" (entrée sélectionnée à gauche), quel que soit l'état précédent ».
   * La file des échanges sans événement garde son propre bouton, plus bas dans la même colonne.
   */
  it('le bouton de la colonne de gauche arrive sur « Réception », entrée sélectionnée', async () => {
    await monter();
    await cliquer(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))[0]);
    const active = container.querySelector('.cm-entree--active');
    expect(active?.textContent).toContain('Réception');
  });

  it('…et il y arrive MÊME si l’on regardait une autre étiquette juste avant', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=partage&etiquette=envoyes');
    await monter();
    await cliquer(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))[0]);
    expect(container.querySelector('.cm-entree--active')?.textContent).toContain('Réception');
  });

  /**
   * ══ 🔴🔴 LOT DOSSIER-A-CLASSER — CE QUE LE RETRAIT DE LA COLONNE CHANGE POUR CE BOUTON ════════════════════════
   *
   * Le panneau « Sans événement » de l'écran PARTAGÉ n'est pas touché : il garde son titre, son compteur et son
   * bouton « Plein écran », qui ouvre toujours le poste de tri (étiquette `a_classer`). C'est la demande d'Arno —
   * « Retrait de “Sans événement” de la COLONNE uniquement ».
   *
   * 🔴 LA CONSÉQUENCE, ÉPROUVÉE ICI PLUTÔT QUE DÉCOUVERTE PLUS TARD : cette étiquette n'ayant plus d'entrée dans
   * la colonne, aucune entrée ne s'y allume quand on arrive par ce bouton. La liste, elle, est bien celle du poste
   * de tri. À signaler à Arno : s'il veut que la colonne nomme encore cet endroit, c'est une décision à prendre,
   * pas un défaut à corriger en douce.
   */
  it('la file sans événement garde SON bouton — mais la colonne n’a plus d’entrée à allumer', async () => {
    await monter();
    const pleins = boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''));
    await cliquer(pleins[1]);
    expect(container.querySelector('.cm-entree--active')).toBeNull();
    // …et « Sans événement » n'est nulle part dans la colonne.
    const etiqs = [...container.querySelectorAll('.cm-entree')].map((e) => e.textContent ?? '');
    expect(etiqs.some((t) => t.includes('Sans événement'))).toBe(false);
  });

  /**
   * 🔴 LOT ERGO-BOITE — L'ORDRE DES ENTRÉES EST CELUI D'ARNO, et les CARTES ont quitté la colonne.
   * L'ordre n'est pas décoratif : il va du plus lu au moins lu, et c'est la seule justification qui vaille pour une
   * colonne de navigation. Les cartes d'événement, elles, ne sont pas des dossiers de courrier — elles restent sur
   * l'écran partagé, avec leur propre colonne.
   */
  it('les entrées sont dans l’ordre demandé, avec leurs nombres, et SANS carte d’événement', async () => {
    window.history.replaceState(null, '', '/admin/gestion');
    await monter();
    const etiqs = [...container.querySelectorAll('.cm-entree')].map((e) => e.textContent ?? '');
    const rang = (mot: string) => etiqs.findIndex((t) => t.includes(mot));
    expect(rang('Réception')).toBeLessThan(rang('Envoyés'));
    expect(rang('Envoyés')).toBeLessThan(rang('Courrier automatique'));
    // 🔴🔴 LOT DOSSIER-A-CLASSER — « À classer » occupe EXACTEMENT la place de « Sans événement » : entre
    //   « Courrier automatique » et « Brouillons ». C'est le « à la même place » d'Arno, éprouvé.
    expect(rang('Courrier automatique')).toBeLessThan(rang('À classer'));
    expect(rang('À classer')).toBeLessThan(rang('Brouillons'));
    expect(etiqs.some((t) => t.includes('Sans événement'))).toBe(false);
    // …et les nombres sont bien ceux du serveur. Celui d'« À classer » vient de la boîte, pas du poste de tri.
    expect(etiqs.some((t) => t.includes('À classer') && t.includes('1234'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Réception') && t.includes('4944'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Envoyés') && t.includes('3311'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Sans suite') && t.includes('7'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Courrier automatique') && t.includes('12262'))).toBe(true);
    // 🔴 AUCUNE CARTE dans la colonne — ni celle à 3 échanges, ni aucune autre.
    expect(etiqs.some((t) => t.includes('GES-2026-'))).toBe(false);
  });

  /**
   * 🔴 LOT ERGO-BOITE — L'ÉTAT ORDINAIRE N'EST QU'À UN SEUL ENDROIT. Première version : les lignes descendaient dans
   * la colonne SANS être retirées du haut de page — elles s'affichaient donc DEUX FOIS, ce qui est exactement le
   * défaut qu'on voulait corriger (des pavés gris permanents à force desquels on ne lit plus rien). Constaté à
   * l'écran avant livraison.
   */
  it('🔴 dans la boîte, l’état ordinaire est dans la colonne et NULLE PART ailleurs', async () => {
    window.history.replaceState(null, '', '/admin/gestion');
    await monter();
    expect(container.querySelector('.cm-etat')?.textContent).toContain('Dernière relève');
    /**
     * …et plus aucune ligne ORDINAIRE en haut de page. On ne compte pas TOUS les `.gst-veille` : une ALERTE en est
     * un aussi, et elle doit rester en haut — c'est même tout l'intérêt du déplacement. On compte donc ceux qui ne
     * portent PAS `--alerte`.
     */
    const ordinaires = [...container.querySelectorAll('.gst-veille')]
      .filter((p) => !p.classList.contains('gst-veille--alerte'));
    expect(ordinaires).toHaveLength(0);
    /**
     * LOT ERGO-BOITE-3 — le bloc gris n'existe PLUS du tout dans la boîte : l'assertion « il ne contient pas la
     * ligne » n'a plus d'objet, et `?.textContent` rendait `undefined`, ce que `not.toContain` refuse. On affirme
     * donc la chose plus forte, qui est aussi celle qu'Arno a demandée : il n'y a pas d'en-tête ici.
     */
    expect(container.querySelector('.gst-bandeau')).toBeNull();
  });

  it('🔴 « À rattacher » et « Annuaire » sont sous les entrées de la boîte', async () => {
    window.history.replaceState(null, '', '/admin/gestion');
    await monter();
    const etiqs = [...container.querySelectorAll('.cm-entree')].map((e) => e.textContent ?? '');
    expect(etiqs.some((t) => t.includes('À rattacher'))).toBe(true);
    expect(etiqs.some((t) => t.includes('Annuaire'))).toBe(true);
    // Ils viennent APRÈS « Brouillons » : ce sont des gestes, pas des dossiers de courrier.
    expect(etiqs.findIndex((t) => t.includes('Brouillons')))
      .toBeLessThan(etiqs.findIndex((t) => t.includes('À rattacher')));
  });
});

describe('🔴 ③ sous « À classer », c’est le POSTE DE TRI lui-même — avec ses gestes', () => {
  it('la ligne de file, son échange, ses gestes et son panneau sont là', async () => {
    // LOT ERGO-BOITE — « À classer » n'est plus l'étiquette d'arrivée de la boîte : on la DÉSIGNE.
    window.history.replaceState(null, '', '/admin/gestion?etiquette=a_classer');
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
    ['partagé', '/admin/gestion?ecran=partage'], ['boîte en plein écran', '/admin/gestion'],
    ['événements en plein écran', '/admin/gestion?ecran=evenements'],
  ] as const) {
    /**
     * 🔴 LOT ERGO-BOITE — DEUX BOUTONS DEVENUS UNE ICÔNE, mais SEULEMENT dans la boîte. Ils faisaient deux choses
     * qu'on veut toujours ensemble : aller chercher le courrier, puis montrer ce qu'on a trouvé. Sur l'écran
     * partagé, qui n'a pas de colonne de gestion ni de titre de liste où poser l'icône, ils restent tels quels :
     * les y retirer aurait supprimé une fonction, ce qui n'a pas été demandé.
     */
    it(`le geste « relever puis actualiser » est atteignable dans l’écran ${nom}`, async () => {
      window.history.replaceState(null, '', adresse);
      await monter();
      if (nom !== 'boîte en plein écran') {
        expect(boutonPar(/^Relever maintenant$/)).toBeDefined();
        expect(boutonPar(/^Rafraîchir$/)).toBeDefined();
      } else {
        const icone = container.querySelector('.bte-relever');
        expect(icone).not.toBeNull();
        // 🔴 UNE ICÔNE SANS NOM N'EXISTE PAS pour un lecteur d'écran, et ne s'apprend pas au survol sur téléphone.
        expect(icone?.getAttribute('aria-label')).toBe('Relever et actualiser');
        expect(icone?.getAttribute('title')).toBe('Relever et actualiser');
      }
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
    // LOT ERGO-BOITE — « Réception » dans la boîte EST l'adresse nue.
    expect(url()).toBe('/admin/gestion');
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

  it('la recherche de la boîte et sa recherche avancée sont là, sous chaque étiquette', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite&etiquette=reception');
    await monter();
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    /**
     * LOT RECHERCHE-AVANCEE — le lien « Filtres (période, expéditeur) » est devenu une ICÔNE d'engrenage dans le
     * champ. La FONCTION est la même et ce test la garde : on la désigne par son nom accessible, qui est ce
     * qu'une personne — ou un lecteur d'écran — cherche réellement. Viser le libellé visible d'hier reviendrait à
     * figer une forme ; viser le nom accessible, c'est exiger qu'elle reste trouvable.
     */
    expect(container.querySelector('button[aria-label="Recherche avancée"]')).not.toBeNull();
    expect(boutonPar(/^Chercher$/)).toBeDefined();
  });

  it('l’interrupteur du courrier automatique reste là où il a toujours été : sur la boîte entière', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=boite&etiquette=reception');
    await monter();
    expect(boutonPar(/Afficher aussi le courrier automatique/)).toBeDefined();
    expect(texte()).toContain('12262 échanges ne contiennent que du courrier automatique');
  });

  it('…et là où l’étiquette décide à sa place, on le DIT, avec la sortie', async () => {
    // LOT ERGO-BOITE — cette phrase appartient au POSTE DE TRI, donc à l'étiquette « À classer », qu'on désigne.
    window.history.replaceState(null, '', '/admin/gestion?etiquette=a_classer');
    await monter();
    expect(texte()).toContain('Cette liste n’a jamais montré le courrier automatique');
    expect(boutonPar(/Voir l’étiquette « Courrier automatique »/)).toBeDefined();
    // …et la sortie mène bien à l'étiquette qui les rassemble, sans rien masquer au passage.
    await cliquer(boutonPar(/Voir l’étiquette « Courrier automatique »/));
    expect(url()).toBe('/admin/gestion?etiquette=automatique');
  });

  it('ouvrir un échange mène à la vue conversation UNIQUE du module, et l’adresse le retient', async () => {
    // LOT ERGO-BOITE — le poste de tri, qui porte les lignes cliquables `.gst-objet-bouton`, vit sous « À classer ».
    window.history.replaceState(null, '', '/admin/gestion?etiquette=a_classer');
    await monter();
    await cliquer(container.querySelector('.gst-objet-bouton') as HTMLElement);
    expect(url()).toBe('/admin/gestion?etiquette=a_classer&fil=101');
    expect(container.querySelector('.cnv')).not.toBeNull();       // la vue conversation du lot 5b, pas une autre
    // LOT 5-GMAIL — « ← Retour » est devenu la FLÈCHE de la barre d'actions : même geste, libellé accessible écrit.
    const retour = container.querySelector('button[aria-label="Retour à la liste"]') as HTMLButtonElement;
    expect(retour).not.toBeNull();
    expect(retour.getBoundingClientRect).toBeDefined();
    // …et la liste est MASQUÉE, pas démontée : elle garde ses pages et sa recherche pour le retour.
    expect(container.querySelector('.pe-liste')?.hasAttribute('hidden')).toBe(true);
  });
});
