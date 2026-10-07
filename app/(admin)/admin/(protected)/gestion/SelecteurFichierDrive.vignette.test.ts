// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « DUPLIQUER EN VIGNETTE » À L'ÉCRAN ══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « crée dans la colonne de gauche une vignette “pièce à ranger”, identique à celle
 * d'une pièce jointe qui vient d'arriver (miniature, nom, taille, œil, crayon ✎, case). Le fichier d'origine et
 * ses rangements existants ne changent JAMAIS. Ranger cette vignette = COPIER le fichier dans le dossier choisi,
 * autant de fois que voulu. »
 *
 * CE QUE CE FICHIER TIENT :
 *   ① le clic du menu N'ÉCRIT RIEN : il pose une vignette, et aucun appel ne part ;
 *   ② la vignette porte bien sa miniature, son nom, sa taille, son œil et son crayon ✎ ;
 *   ③ 🔴🔴 RANGER = COPIER, par la route de déplacement en mode « copier » — jamais un déplacement ;
 *   ④ 🔴🔴 DEUX RANGEMENTS = DEUX COPIES, et la vignette RESTE ;
 *   ⑤ l'entrée n'existe pas sous l'archive, ni sur un dossier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; corps: unknown }[];
let contenu: Record<string, unknown>;
/** Ce que le registre annonce pour le compteur vert. 0 = le document n'est rangé nulle part. */
let comptePart: number;

const PIECE = { pieceId: 7, nom: 'quittance.pdf', tailleOctets: 4096, typeMime: 'application/pdf' };

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide */ }
  appels = [];
  comptePart = 0;
  contenu = {
    etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
    fichiers: [fichier('d1', 'Test', true), fichier('f1', '0851_001.pdf')],
  };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    let corps: unknown = null;
    try { corps = init?.body === undefined ? null : JSON.parse(String(init.body)); } catch { corps = null; }
    appels.push({ url, corps });
    if (url.includes('/drive/deplacer')) {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          etat: 'ok', action: 'copier', cible: 'd1', nomCible: 'Test',
          faits: [{ id: 'f1', nom: '0851_001.pdf', copieId: 'copie-1' }], refuses: [], mouvements: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    /**
     * 🔴🔴 LOT ETOILE-SIGNATURES-PIECES, POINT 0 — LA ROUTE QUI RENOMME LE FICHIER SOURCE.
     * Elle fait le pont entre un identifiant Drive et la pièce dont il est une copie, puis renomme la pièce ET
     * toutes ses copies connues. Le double rend « ok » : ce qu'on éprouve ici, c'est que le geste y PART.
     */
    if (url.includes('/drive/renommer')) {
      return new Response(JSON.stringify({ etat: 'ok', nom: 'x', faits: ['f1'], refus: [], pieceId: 11 }),
        { status: 200 });
    }
    if (url.includes('/drive/corbeille')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    /* 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — le compteur VERT : combien d'emplacements le registre connaît-il ? */
    if (url.includes('/drive/localiser')) {
      return new Response(JSON.stringify({ etat: 'ok', nombre: comptePart, md5: null, occurrences: [] }), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    return new Response(JSON.stringify(contenu), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
/** 🔴 EN MODE « ranger » : c'est le seul mode où une colonne de gauche existe pour accueillir la vignette. */
const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'ranger', messageId: 42, pieces: [PIECE],
      onChoisir: () => {}, onFermer: () => {},
    } as never));
  });
  await calmer();
};
const ligneDe = (nom: string) =>
  [...container.querySelectorAll('.sfd-ligne')].find((x) => (x.textContent ?? '').includes(nom));
const souris = async (nom: string, type: string) => {
  await act(async () => { ligneDe(nom)?.dispatchEvent(new MouseEvent(type, { bubbles: true })); });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const entreeMenu = (mot: string) =>
  [...container.querySelectorAll('.sfd-menu [role="menuitem"]')].find((b) => b.textContent === mot);
const vignettes = () => [...container.querySelectorAll('.sfd-piece--copie')];
const postsDrive = () => appels.filter((a) => a.url.includes('/drive/deplacer') && a.corps !== null);
const dupliquer = async () => {
  await souris('0851_001.pdf', 'contextmenu');
  await cliquer(entreeMenu('Dupliquer en vignette'));
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE CLIC POSE UNE VIGNETTE, ET N'ÉCRIT RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 dupliquer', () => {
  it('🔴🔴 le clic pose une vignette et n’envoie RIEN', async () => {
    await monter();
    expect(vignettes()).toHaveLength(0);
    await dupliquer();
    expect(vignettes()).toHaveLength(1);
    // 🔴 LA PREUVE QUI COMPTE : aucune écriture n'est partie. Le fichier d'origine n'a pas été touché.
    expect(postsDrive()).toHaveLength(0);
  });

  /** 🔴 « identique à celle d'une pièce jointe » (Arno) : miniature, nom, taille, œil, crayon ✎. */
  it('🔴 la vignette porte miniature, nom, taille, œil et crayon', async () => {
    await monter();
    await dupliquer();
    const v = vignettes()[0];
    expect(v.querySelector('img.sfd-piece-vignette')?.getAttribute('src'))
      .toContain('/api/admin/gestion/drive/apercu?fichier=f1&vignette=1');
    expect(v.querySelector('.sfd-piece-nom')?.textContent).toBe('0851_001.pdf');
    expect(v.querySelector('.sfd-piece-taille')?.textContent).not.toBe('');
    expect(v.querySelector('.sfd-piece-oeil')).not.toBeNull();
    expect(v.querySelector('.sfd-piece-stylo')).not.toBeNull();
    // 🔴 ELLE EST GLISSABLE, comme une pièce : c'est le geste principal de ce mode.
    expect(v.getAttribute('draggable')).toBe('true');
  });

  /** ⚠️ ELLE DIT CE QU'ELLE EST : une copie, et l'original ne bouge pas. */
  it('⚠️ son infobulle annonce une copie, jamais un déplacement', async () => {
    await monter();
    await dupliquer();
    const titre = vignettes()[0].getAttribute('title') ?? '';
    expect(titre).toContain('Copie de « 0851_001.pdf »');
    expect(titre.toLowerCase()).not.toContain('déplac');
  });

  /**
   * 🔴🔴 L'ENTRÉE DISPARAÎT QUAND LE DOCUMENT EST DÉJÀ EN VIGNETTE.
   *
   * ⚠️ RÉÉCRIT LE 03/10/2026 (lot DRIVE-LOUPE-MENU-VITESSE) : elle était ÉTEINTE avec le motif « déjà dans la
   * colonne ». Arno demande qu'elle soit ABSENTE — il n'y a rien à expliquer, la vignette est sous les yeux, à
   * gauche, et une entrée grisée de plus allongerait le menu sans rien apprendre.
   */
  it('🔴🔴 l’entrée disparaît quand ce document est déjà en vignette', async () => {
    await monter();
    await dupliquer();
    await souris('0851_001.pdf', 'contextmenu');
    expect(entreeMenu('Dupliquer en vignette')).toBeUndefined();
    expect(vignettes()).toHaveLength(1);
  });

  /** 🔴🔴 JAMAIS SUR UN DOSSIER. */
  it('🔴🔴 l’entrée n’existe pas sur un dossier', async () => {
    await monter();
    await souris('Test', 'contextmenu');
    expect(entreeMenu('Dupliquer en vignette')).toBeUndefined();
  });

  /** 🔴🔴 NI SOUS « DOCUMENTS CLIENTS SCANNÉS » : la vignette n'existe que pour être copiée, et rien n'en sort. */
  it('🔴🔴 l’entrée n’existe pas là où la lecture est refusée', async () => {
    contenu = {
      ...contenu, joindreAutorise: false,
      motifRefus: '« Documents clients scannés » : la lecture du contenu est refusée.',
    };
    await monter();
    await souris('0851_001.pdf', 'contextmenu');
    expect(entreeMenu('Dupliquer en vignette')).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② RANGER = COPIER, AUTANT DE FOIS QUE VOULU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ranger une vignette', () => {
  /** On lâche la vignette sur le dossier « Test » : c'est le geste principal. */
  const lacherSur = async (nomDossier: string) => {
    const v = vignettes()[0];
    const transfert = {
      data: new Map<string, string>(),
      setData(t: string, d: string) { this.data.set(t, d); },
      getData(t: string) { return this.data.get(t) ?? ''; },
      effectAllowed: '', dropEffect: '', setDragImage: () => {},
    };
    await act(async () => {
      const start = new Event('dragstart', { bubbles: true });
      Object.defineProperty(start, 'dataTransfer', { value: transfert });
      v.dispatchEvent(start);
    });
    await calmer();
    await act(async () => {
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: transfert });
      ligneDe(nomDossier)?.dispatchEvent(drop);
    });
    await calmer();
  };

  /**
   * 🔴🔴 LE RANGEMENT EST UNE **COPIE**, par la route de déplacement en mode « copier » — la même que le
   * « Copier / Coller » du navigateur de fichiers, donc le même `files.copy`, le même verdict d'archive et le
   * même journal. Un `action: 'deplacer'` ici aurait SORTI le fichier de son dossier.
   */
  it('🔴🔴 lâcher la vignette sur un dossier COPIE le fichier source', async () => {
    await monter();
    await dupliquer();
    await lacherSur('Test');
    const posts = postsDrive();
    expect(posts).toHaveLength(1);
    expect(posts[0].corps).toEqual({
      action: 'copier', cible: 'd1', elements: [{ id: 'f1', nom: '0851_001.pdf', dossier: false }],
    });
  });

  /**
   * 🔴🔴 « AUTANT DE FOIS QUE VOULU » (Arno). La vignette RESTE après un rangement, et un second lâcher envoie
   * une SECONDE copie. Si elle disparaissait, il faudrait la redupliquer à chaque fois.
   */
  it('🔴🔴 deux rangements = deux copies, et la vignette reste', async () => {
    await monter();
    await dupliquer();
    await lacherSur('Test');
    expect(vignettes()).toHaveLength(1);
    await lacherSur('Test');
    expect(postsDrive()).toHaveLength(2);
    expect(vignettes()).toHaveLength(1);
    // ⚠️ ET LA LIGNE COMPTE : « ✓ Copiée dans « Test » (2 copies) ».
    expect(vignettes()[0].textContent).toContain('2 copies');
  });

  /** 🔴 LE COMPTE RENDU DIT QUE L'ORIGINAL N'A PAS BOUGÉ — c'est ce qui distingue copier de déplacer. */
  it('🔴 le bandeau annonce une copie et rassure sur l’original', async () => {
    await monter();
    await dupliquer();
    await lacherSur('Test');
    const b = container.querySelector('.sfd-bandeau');
    expect(b?.textContent).toContain('copié dans « Test »');
    expect(b?.textContent).toContain('L’original n’a pas bougé');
  });

  /** ⚠️ UN REFUS DU SERVEUR S'AFFICHE, et rien n'est annoncé comme rangé. */
  it('⚠️ un refus du serveur est écrit à l’écran', async () => {
    await monter();
    await dupliquer();
    vi.mocked(globalThis.fetch).mockImplementation((async (u: unknown, init?: RequestInit) => {
      const url = String(u);
      if (url.includes('/drive/deplacer') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          etat: 'ok', action: 'copier', faits: [], mouvements: [],
          refuses: [{ nom: '0851_001.pdf', motif: 'Refusé : cet élément est dans « Documents clients scannés ».' }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify(contenu), { status: 200 });
    }) as typeof fetch);
    await lacherSur('Test');
    expect(container.textContent).toContain('Documents clients scannés');
    expect(container.querySelector('.sfd-bandeau')).toBeNull();
  });

  /** 🔴 ON PEUT RETIRER LA VIGNETTE : c'est un objet d'écran. Rien n'est supprimé du Drive pour autant. */
  it('🔴 retirer la vignette n’envoie rien', async () => {
    await monter();
    await dupliquer();
    const croix = [...vignettes()[0].querySelectorAll('button')]
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Retirer'));
    await cliquer(croix);
    expect(vignettes()).toHaveLength(0);
    expect(postsDrive()).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LA LIGNE DES PICTOS, LE COMPTEUR VERT, ET « DÉPOSER ICI »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la vignette, après le lot DRIVE-LOUPE-MENU-VITESSE', () => {
  /**
   * 🔴 LES TROIS PICTOS SUR UNE SEULE LIGNE, COLLÉS À DROITE (Arno). Avant ce lot ils flottaient dans le texte :
   * le crayon passait à la ligne dès que le nom était long, et la vignette changeait de hauteur.
   */
  it('🔴 les pictos sont groupés dans une seule rangée', async () => {
    await monter();
    await dupliquer();
    const gestes = vignettes()[0].querySelector('.sfd-piece-gestes');
    expect(gestes).not.toBeNull();
    // L'œil, le crayon, la croix de retrait et la loupe y sont — et nulle part ailleurs dans la ligne.
    expect(gestes?.querySelectorAll('button').length).toBeGreaterThanOrEqual(3);
    expect(vignettes()[0].querySelector('.sfd-piece-ligne > .sfd-piece-oeil')).toBeNull();
  });

  /**
   * 🔴🔴 LE COMPTEUR VERT : « Déjà dans le Drive (N) » (libellé décidé par Arno le 07/10/2026 — il dit un ÉTAT,
   * pas un geste répété). MASQUÉ À ZÉRO — un « 0 » vert se lirait comme une bonne nouvelle alors qu'il dit le
   * contraire.
   */
  it('🔴🔴 le compteur vert est MASQUÉ quand le document n’est rangé nulle part', async () => {
    comptePart = 0;
    await monter();
    await dupliquer();
    expect(container.querySelector('.sfd-piece-range')).toBeNull();
  });

  /** 🔴 ET IL PARAÎT, AVEC SON NOMBRE ET SA BULLE, dès que le registre connaît au moins un emplacement. */
  it('🔴🔴 le compteur vert annonce « Déjà dans le Drive (N) »', async () => {
    comptePart = 2;
    await monter();
    const vert = container.querySelector('.sfd-piece-range');
    expect(vert?.textContent).toBe('2');
    expect(vert?.getAttribute('title')).toBe('Déjà dans le Drive (2)');
    /* 🔴 LE MÊME MOT POUR LE LECTEUR D'ÉCRAN : une pastille verte ne dit pas d'elle-même ce qu'elle compte. */
    expect(vert?.getAttribute('aria-label')).toBe('Déjà dans le Drive (2)');
  });

  /**
   * 🔴 UN SEUL EMPLACEMENT SE DIT DE LA MÊME FAÇON. L'ancien libellé avait une branche singulier/pluriel
   * (« Rangé 1 fois » / « Rangé N fois ») : le nombre entre parenthèses la supprime, et avec elle le risque que
   * les deux formes divergent.
   */
  it('🔴 un seul emplacement : « Déjà dans le Drive (1) », même forme', async () => {
    comptePart = 1;
    await monter();
    expect(container.querySelector('.sfd-piece-range')?.getAttribute('title'))
      .toBe('Déjà dans le Drive (1)');
  });

  /** ⚠️ ET IL EST DEMANDÉ PAR LE MODE RAPIDE, celui qui ne fait aucun appel Google. */
  it('⚠️ le compteur passe par `compte=1`', async () => {
    await monter();
    expect(appels.some((a) => a.url.includes('/drive/localiser') && a.url.includes('compte=1'))).toBe(true);
  });

  /**
   * 🔴🔴 « DÉPOSER ICI » RANGE AUSSI LES VIGNETTES (Arno). Deux chemins qui ne font pas la même chose sont un
   * piège tendu à qui apprend le geste par l'un des deux.
   */
  it('🔴🔴 « Déposer ici » copie aussi les vignettes dupliquées', async () => {
    await monter();
    await dupliquer();
    /* ⚠️ IL FAUT ÊTRE DANS UN DOSSIER : à la racine du sélecteur, « Déposer ici » est éteint — « Google Drive »
       et ses regroupements ne sont pas des dossiers, et Google refuserait le dépôt après coup. */
    await souris('Test', 'dblclick');
    const bouton = [...container.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').startsWith('Déposer ici'));
    // ⚠️ LE COMPTE ANNONCE CE QUI PARTIRA : la pièce du message ET la copie.
    expect(bouton?.textContent).toContain('(2)');
    expect((bouton as HTMLButtonElement).disabled).toBe(false);
    await cliquer(bouton);
    const posts = postsDrive();
    expect(posts).toHaveLength(1);
    expect(posts[0].corps).toMatchObject({ action: 'copier', elements: [{ id: 'f1' }] });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE MENU À L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le menu contextuel', () => {
  /** 🔴🔴 L'ORDRE D'ARNO, lu dans le DOM : Visualiser, Dupliquer, … et « Supprimer » en dernier, séparé. */
  it('🔴🔴 l’ordre est celui d’Arno, et « Supprimer » porte le filet', async () => {
    await monter();
    await souris('0851_001.pdf', 'contextmenu');
    const mots = [...container.querySelectorAll('.sfd-menu [role="menuitem"]')].map((b) => b.textContent);
    expect(mots[0]).toBe('Visualiser');
    expect(mots[1]).toBe('Dupliquer en vignette');
    expect(mots[mots.length - 1]).toBe('Supprimer');
    const dernier = [...container.querySelectorAll('.sfd-menu li')].at(-1);
    expect(dernier?.className).toContain('sfd-menu-li--separe');
  });

  /**
   * 🔴🔴 EN MODE « RANGER » (un mail REÇU), « Joindre au message » et « Insérer un lien » n'existent pas : elles
   * appellent le rappel qui écrit dans le message qu'on rédige, et il n'y a pas de message en cours.
   */
  it('🔴🔴 « Joindre » et « Insérer un lien » sont absents en rangement', async () => {
    await monter();
    await souris('0851_001.pdf', 'contextmenu');
    const mots = [...container.querySelectorAll('.sfd-menu [role="menuitem"]')].map((b) => b.textContent);
    expect(mots).not.toContain('Joindre au message');
    expect(mots).not.toContain('Insérer un lien');
  });

  /** 🔴 ET ELLES SONT LÀ EN ÉCRITURE : c'est le mode « joindre », celui de l'éditeur de message. */
  it('🔴 elles sont présentes quand la fenêtre est ouverte depuis un message en écriture', async () => {
    await act(async () => {
      root.render(createElement(SelecteurFichierDrive, {
        mode: 'joindre', onChoisir: () => {}, onFermer: () => {},
      } as never));
    });
    await calmer();
    await souris('0851_001.pdf', 'contextmenu');
    const mots = [...container.querySelectorAll('.sfd-menu [role="menuitem"]')].map((b) => b.textContent);
    expect(mots).toContain('Joindre au message');
    expect(mots).toContain('Insérer un lien');
    // ⚠️ ET « Dupliquer en vignette » N'Y EST PAS : hors du mode « ranger », il n'y a pas de colonne où la poser.
    expect(mots).not.toContain('Dupliquer en vignette');
  });

  /** 🔴 LE MENU EST RECADRÉ APRÈS MESURE : il porte une position, et il est visible. */
  it('🔴 le menu est posé après mesure, et devient visible', async () => {
    await monter();
    await souris('0851_001.pdf', 'contextmenu');
    const menu = container.querySelector('.sfd-menu') as HTMLElement | null;
    expect(menu).not.toBeNull();
    // jsdom rend des tailles nulles : le recadrage pose alors la marge, et le menu n'est plus masqué.
    expect(menu?.style.visibility).not.toBe('hidden');
    expect(Number.parseFloat(menu?.style.top ?? '-1')).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(menu?.style.left ?? '-1')).toBeGreaterThanOrEqual(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LOT ETOILE-SIGNATURES-PIECES, POINT 0 — LE CRAYON D'UNE VIGNETTE RENOMME AUSSI LA SOURCE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 DÉCISION D'ARNO DU 03/10/2026, QUI TRANCHE UNE QUESTION LAISSÉE OUVERTE ════════════════════════════════
 *
 * « UN DOCUMENT = UN SEUL NOM gagne. Le crayon ✎ d'une vignette dupliquée renomme AUSSI le fichier source et
 * toutes les copies connues (même mécanisme files.update, jamais de copie). »
 *
 * AVANT, le crayon d'une vignette ne retenait, DANS LE NAVIGATEUR, que le nom sous lequel la future copie
 * naîtrait. Le fichier source gardait le sien, et le nom choisi se perdait si l'on ne rangeait pas — c'est
 * exactement ce qu'Arno a vécu : « reco renomage » n'existait nulle part.
 *
 * ⚠️ CE QUI NE CHANGE PAS : dupliquer n'écrit toujours RIEN, et ranger crée toujours une COPIE de plus. Ce qui
 * bouge désormais est le NOM, et lui seul.
 */
describe('🔴🔴 ⑤ le crayon de la vignette renomme la source', () => {
  const stylo = () => vignettes()[0]?.querySelector('.sfd-piece-stylo') as HTMLButtonElement | undefined;
  const champ = () => container.querySelector('.apd-champ-nom') as HTMLInputElement | null;
  const boutonDe = (m: RegExp) => [...container.querySelectorAll('button')].find((b) => m.test(b.textContent ?? ''));
  const taper = async (valeur: string) => {
    const c = champ();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(c, valeur);
    await act(async () => { c?.dispatchEvent(new Event('input', { bubbles: true })); });
    await calmer();
  };
  const renommages = () => appels.filter((a) => a.url.includes('/drive/renommer'));

  it('🔴🔴 valider un nouveau nom appelle la route de renommage, avec l’identifiant Drive de la SOURCE', async () => {
    await monter();
    await dupliquer();
    await cliquer(stylo());
    await taper('Recommandé M KHARRAT');
    await cliquer(boutonDe(/^Valider$/));
    const r = renommages();
    expect(r).toHaveLength(1);
    expect((r[0].corps as { driveFileId?: string }).driveFileId).toBe('f1');
    // 🔴 L'EXTENSION EST CONSERVÉE (lot précédent) : le nom part complet, pas nu.
    expect((r[0].corps as { nom?: string }).nom).toBe('Recommandé M KHARRAT.pdf');
  });

  /** ⚠️ ET LE NOM RESTE AFFICHÉ SUR LA VIGNETTE : l'écran ne doit pas attendre le réseau pour suivre le geste. */
  it('⚠️ la vignette porte aussitôt le nouveau nom', async () => {
    await monter();
    await dupliquer();
    await cliquer(stylo());
    await taper('Recommandé M KHARRAT');
    await cliquer(boutonDe(/^Valider$/));
    expect(vignettes()[0].querySelector('.sfd-piece-nom')?.textContent).toBe('Recommandé M KHARRAT.pdf');
  });

  /**
   * 🔴 RENDRE SON NOM ACTUEL N'ENVOIE RIEN : ce n'est pas un renommage, c'est un abandon. Partir quand même
   * écrirait une ligne de journal pour un geste qui n'a rien changé.
   */
  it('🔴 revenir au nom d’origine n’appelle aucune route', async () => {
    await monter();
    await dupliquer();
    await cliquer(stylo());
    await taper('0851_001');
    await cliquer(boutonDe(/^Valider$/));
    expect(renommages()).toHaveLength(0);
  });

  /**
   * ══ 🔴🔴 DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE, LE 03/10/2026 — L'ALLER-RETOUR ═════════════════════════════════
   *
   * Après avoir renommé la source, REMETTRE le nom d'avant ne partait plus : la garde « ne rien envoyer si le
   * nom n'a pas changé » comparait au nom que la vignette portait À SA CRÉATION. Le second geste paraissait
   * être un non-geste, et il se perdait en silence — exactement ce que ce lot répare ailleurs.
   *
   * 🔴 LA VIGNETTE PORTE DÉSORMAIS LE NOM DU FICHIER, pas celui d'un instant passé.
   */
  it('🔴🔴 renommer puis REVENIR en arrière part bien deux fois', async () => {
    await monter();
    await dupliquer();
    await cliquer(stylo());
    await taper('epreuve vignette source');
    await cliquer(boutonDe(/^Valider$/));
    await cliquer(container.querySelector('.apd-croix'));

    await cliquer(stylo());
    expect(champ()?.value).toBe('epreuve vignette source');
    await taper('0851_001');
    await cliquer(boutonDe(/^Valider$/));
    const r = renommages();
    expect(r).toHaveLength(2);
    expect((r[1].corps as { nom?: string }).nom).toBe('0851_001.pdf');
  });

  /** 🔒 ET AUCUNE COPIE N'EST FAITE AU PASSAGE : renommer n'est pas ranger. */
  it('🔒 renommer n’écrit rien dans /drive/deplacer', async () => {
    await monter();
    await dupliquer();
    await cliquer(stylo());
    await taper('Recommandé M KHARRAT');
    await cliquer(boutonDe(/^Valider$/));
    expect(postsDrive()).toHaveLength(0);
  });
});
