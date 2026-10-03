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

  /** 🔴 IDEMPOTENT : une seconde duplication ne pose pas une seconde vignette, et le menu le DIT. */
  it('🔴 dupliquer deux fois le même fichier ne pose qu’une vignette', async () => {
    await monter();
    await dupliquer();
    await souris('0851_001.pdf', 'contextmenu');
    const e = entreeMenu('Dupliquer en vignette');
    expect((e as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.sfd-menu')?.textContent).toContain('déjà');
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
   * 🔴🔴 LE COMPTEUR VERT : « Rangé N fois dans le Drive ». MASQUÉ À ZÉRO — un « 0 » vert se lirait comme une
   * bonne nouvelle alors qu'il dit le contraire.
   */
  it('🔴🔴 le compteur vert est MASQUÉ quand le document n’est rangé nulle part', async () => {
    comptePart = 0;
    await monter();
    await dupliquer();
    expect(container.querySelector('.sfd-piece-range')).toBeNull();
  });

  /** 🔴 ET IL PARAÎT, AVEC SON NOMBRE ET SA BULLE, dès que le registre connaît au moins un emplacement. */
  it('🔴🔴 le compteur vert annonce « Rangé N fois dans le Drive »', async () => {
    comptePart = 2;
    await monter();
    const vert = container.querySelector('.sfd-piece-range');
    expect(vert?.textContent).toBe('2');
    expect(vert?.getAttribute('title')).toBe('Rangé 2 fois dans le Drive');
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
