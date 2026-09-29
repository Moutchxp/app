// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';

/**
 * LOT DRIVE-RETOUCHES-1 — LES CINQ RETOUCHES, MONTÉES POUR DE VRAI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ① le bloc de recherche n'est plus mangé par celui du dessous ;
 * ② l'œil « Visualiser » sur une pièce à ranger — y compris une pièce dont les octets locaux ont été vidés ;
 * ③ « Récents » en section repliable, avec état mémorisé ;
 * ④ la ligne de dossier en édition (Entrée, Échap, vide, doublon) — éprouvée surtout dans `SelecteurFichierDrive.test` ;
 * ⑤ le clic droit dans le vide, qui remplace celui de Chrome.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let journalPret: boolean;

const PIECES = [
  { pieceId: 11, nom: 'devis.pdf', tailleOctets: 258_000, typeMime: 'application/pdf' },
  { pieceId: 12, nom: '._devis.pdf', tailleOctets: 4_096, typeMime: 'application/pdf' },
  { pieceId: 13, nom: 'export.xml', tailleOctets: 900, typeMime: 'application/xml' },
  // ⚠️ UNE IMAGE, exprès : son aperçu rend une balise <img>, donc une adresse OBSERVABLE. Un PDF passe par
  //    PDF.js, qui tire l'adresse dans son propre monde et ne prouverait rien dans jsdom.
  { pieceId: 14, nom: 'photo.jpg', tailleOctets: 40_000, typeMime: 'image/jpeg' },
];

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  journalPret = true;
  try { globalThis.localStorage?.clear(); } catch { /* pas de stockage : les défauts s'appliquent */ }
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (url.includes('/drive/deplacer')) {
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ etat: 'ok', disponible: journalPret, motif: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ etat: 'ok', faits: [], refuses: [], mouvements: [] }), { status: 200 });
    }
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({
        etat: 'ok', mode: 'accueil',
        dernier: { id: 'D_DERNIER', nom: 'CHARPENTIER', chemin: 'GESTION LOCATIVE › 1 Propriétaires', dernierDepot: '2026-09-28T10:00:00Z' },
        recents: [{ id: 'D_REC', nom: 'Travaux', chemin: 'GESTION LOCATIVE › Travaux', dernierDepot: '2026-09-20T09:00:00Z' }],
      }), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
      fichiers: [fichier('d1', 'Artisans', true), fichier('f1', 'bail.pdf')],
    }), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      onChoisir: () => {}, onFermer: () => {}, ...props,
    } as never));
  });
  await calmer();
};
const monterRanger = () => monter({ mode: 'ranger', messageId: 900, filId: 42, pieces: PIECES });
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const pieceDe = (nom: string) => [...container.querySelectorAll('.sfd-piece')]
  .find((x) => (x.querySelector('.sfd-piece-nom')?.textContent ?? '') === nom);
const oeilDe = (nom: string) => pieceDe(nom)?.querySelector('.sfd-piece-oeil') as HTMLButtonElement | undefined;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE BLOC DE RECHERCHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① le bloc de recherche n’est plus mangé', () => {
  /**
   * ⚠️ jsdom NE CALCULE AUCUNE MISE EN PAGE : toutes les boîtes y font zéro. Mesurer un chevauchement ici
   * « passerait » sans rien prouver — ce qui est pire qu'un test absent. Le chevauchement lui-même a été mesuré
   * dans Chrome, avant et après : le champ finissait à 178 et le corps commençait à 178 (collés), il y a
   * maintenant 11 px et une bordure entre les deux.
   *
   * 🔴 CE QUI EST VÉRIFIABLE ICI, ET QUI SUFFIT À ATTRAPER LA RÉGRESSION : la règle CSS qui manquait. Le bloc
   * avait `padding: 8px 12px 0` — aucune place sous le champ, donc sa bordure arrondie collée à l'en-tête, qui
   * la mangeait. Quiconque la remettrait à zéro referait le défaut.
   */
  it('🔴 le bloc de recherche réserve une place sous le champ, et se sépare de la liste', async () => {
    await monter();
    const feuille = container.querySelector('style')?.textContent ?? '';
    const regle = /\.sfd-champ\{([^}]*)\}/.exec(feuille)?.[1] ?? '';
    expect(regle).not.toBe('');
    // Une hauteur complète : un padding bas non nul.
    const padding = /padding:([^;]+)/.exec(regle)?.[1]?.trim() ?? '';
    expect(padding).not.toMatch(/\s0$/);
    // Et une séparation franche, pour que l'en-tête ne vienne pas lécher la bordure du champ.
    expect(regle).toContain('border-bottom');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② L'ŒIL SUR LES PIÈCES À RANGER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② l’œil « Visualiser » sur une pièce à ranger', () => {
  it('chaque pièce porte son œil, sur la ligne du poids', async () => {
    await monterRanger();
    const ligne = pieceDe('devis.pdf')?.querySelector('.sfd-piece-ligne');
    expect(ligne?.textContent).toContain('258 Ko');
    expect(ligne?.querySelector('.sfd-piece-oeil')).not.toBeNull();
    expect(oeilDe('devis.pdf')?.getAttribute('title')).toBe('Visualiser');
  });

  /**
   * 🔴 IL OUVRE L'APERÇU HABITUEL, PAR-DESSUS LA FENÊTRE — et la fenêtre reste dessous, entière : la fermeture
   * ramène exactement au même endroit, parce qu'on n'en est jamais parti.
   */
  it('🔴 un clic ouvre l’aperçu, et la fenêtre reste dessous', async () => {
    await monterRanger();
    await cliquer(oeilDe('devis.pdf'));
    expect(container.querySelector('.apd')).not.toBeNull();
    expect(container.querySelector('.sfd')).not.toBeNull();
    expect(container.querySelector('.sfd-ranger')).not.toBeNull();
  });

  /**
   * 🔴🔴 LES OCTETS VIENNENT DE LA ROUTE DES PIÈCES, et c'est elle qui sait déjà lire une pièce VIDÉE : depuis le
   * lot du vidage, elle bascule d'elle-même sur la copie Drive quand le stockage local a été libéré. L'aperçu
   * d'une pièce vidée marche donc sans qu'une ligne de plus soit écrite — et c'est ce que cette adresse prouve.
   */
  it('🔴🔴 l’aperçu lit la pièce par SA route — celle qui bascule sur la copie Drive', async () => {
    await monterRanger();
    await cliquer(oeilDe('photo.jpg'));
    const vus = [...container.querySelectorAll('.apd [src]')].map((e) => e.getAttribute('src') ?? '');
    /* 🔴 C'EST CETTE ADRESSE QUI FAIT TOUT : la route des pièces bascule d'elle-même sur la copie Drive quand
       les octets locaux ont été libérés. L'aperçu d'une pièce vidée marche donc sans une ligne de plus ici. */
    expect(vus.some((u) => u.includes('/api/admin/gestion/pieces/14'))).toBe(true);
    // ⚠️ ET JAMAIS PAR LA ROUTE DU DRIVE : une pièce reçue n'est pas un fichier du Drive.
    expect(vus.every((u) => !u.includes('/drive/apercu'))).toBe(true);
  });

  /** ⚠️ LE TOUR « Précédent / Suivant » EST CELUI DES PIÈCES DU MAIL, et il exclut ce qui n'a pas d'aperçu. */
  it('🔴 Précédent / Suivant parcourent les pièces du mail, et elles seules', async () => {
    await monterRanger();
    await cliquer(oeilDe('photo.jpg'));
    const compteur = container.querySelector('.apd')?.textContent ?? '';
    // Deux pièces visualisables sur quatre : le PDF et l'image (le « ._ » et le XML sont écartés du tour).
    expect(compteur).toContain('2 / 2');
  });

  /** ⚠️ UN « ._ » DE macOS NE CONTIENT PAS LE DOCUMENT : l'œil est éteint, avec son motif. */
  it('🔴 œil éteint sur un « ._ », avec le motif qui renvoie au vrai fichier', async () => {
    await monterRanger();
    expect(oeilDe('._devis.pdf')?.disabled).toBe(true);
    expect(oeilDe('._devis.pdf')?.getAttribute('title')).toContain('devis.pdf');
    await cliquer(oeilDe('._devis.pdf'));
    expect(container.querySelector('.apd')).toBeNull();
  });

  /** ⚠️ ET UN TYPE SANS APERÇU : éteint aussi, avec un motif qui parle du FORMAT, pas du fichier. */
  it('🔴 œil éteint sur un type sans aperçu', async () => {
    await monterRanger();
    expect(oeilDe('export.xml')?.disabled).toBe(true);
    expect(oeilDe('export.xml')?.getAttribute('title')).not.toBe('Visualiser');
    await cliquer(oeilDe('export.xml'));
    expect(container.querySelector('.apd')).toBeNull();
  });

  /** ⚠️ AUCUN « Joindre » DANS L'APERÇU D'UNE PIÈCE : en mode « ranger », il n'y a pas de message à remplir. */
  it('l’aperçu d’une pièce ne propose pas de la joindre', async () => {
    await monterRanger();
    await cliquer(oeilDe('devis.pdf'));
    const boutons = [...container.querySelectorAll('.apd button')].map((b) => b.textContent ?? '');
    expect(boutons.some((t) => /joindre/i.test(t))).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ « RÉCENTS » REPLIABLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ « Récents » en section repliable', () => {
  const section = () => [...container.querySelectorAll('.sfd-cote-section')][0] as HTMLButtonElement | undefined;
  const raccourcis = () => [...container.querySelectorAll('.sfd-cote-liste--indentee .sfd-cote-item')]
    .map((b) => b.textContent ?? '');

  it('trois emplacements, puis la section, dépliée par défaut', async () => {
    await monter();
    const emplacements = [...container.querySelectorAll('.sfd-cote-liste:not(.sfd-cote-liste--indentee) .sfd-cote-item')]
      .map((b) => b.textContent ?? '');
    expect(emplacements.some((t) => t.includes('Mon Drive'))).toBe(true);
    expect(emplacements.some((t) => t.includes('Drives partagés'))).toBe(true);
    expect(section()?.textContent).toContain('Récents');
    expect(section()?.getAttribute('aria-expanded')).toBe('true');
    // 🔴 LE DERNIER DOSSIER DE L'ÉCHANGE EST EN TÊTE DES RACCOURCIS, avec son icône propre.
    expect(raccourcis()[0]).toContain('CHARPENTIER');
    expect(raccourcis()[0]).toContain('Dernier dossier utilisé');
    expect(raccourcis().some((t) => t.includes('Travaux'))).toBe(true);
  });

  it('🔴 un clic replie, un autre déplie', async () => {
    await monter();
    await cliquer(section());
    expect(raccourcis()).toHaveLength(0);
    expect(section()?.getAttribute('aria-expanded')).toBe('false');
    await cliquer(section());
    expect(raccourcis().length).toBeGreaterThan(0);
  });

  /** 🔴 L'ÉTAT EST MÉMORISÉ : qui replie cette section ne veut pas la voir se rouvrir au message suivant. */
  it('🔴 l’état survit à la réouverture de la fenêtre', async () => {
    await monter();
    await cliquer(section());
    expect(globalThis.localStorage.getItem('svv.gestion.selecteurDrive.recents')).toBe('0');

    await act(async () => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await monter();
    expect(section()?.getAttribute('aria-expanded')).toBe('false');
    expect(raccourcis()).toHaveLength(0);
  });

  /** ⚠️ LES RACCOURCIS RESTENT DES CIBLES DE DÉPÔT : c'est leur raison d'être. */
  it('un raccourci déplié reste une cible de dépôt', async () => {
    await monterRanger();
    const cible = [...container.querySelectorAll('.sfd-cote-liste--indentee .sfd-cote-item')]
      .find((b) => (b.textContent ?? '').includes('CHARPENTIER'));
    const e = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { getData: () => '', setData: () => {}, dropEffect: '' } });
    // On tient une pièce : sans quoi rien n'accepte un dépôt.
    const d = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(d, 'dataTransfer', { value: { getData: () => '', setData: () => {}, setDragImage: () => {}, effectAllowed: '' } });
    await act(async () => { pieceDe('devis.pdf')?.dispatchEvent(d); });
    await act(async () => { cible?.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LE CLIC DROIT DANS LE VIDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑤ le clic droit dans le vide', () => {
  const clicDroitVide = async () => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 });
    await act(async () => { container.querySelector('.sfd-lignes')?.dispatchEvent(e); });
    await calmer();
    return e;
  };
  const entrees = () => [...container.querySelectorAll('.sfd-menu [role="menuitem"]')].map((b) => ({
    mot: (b.textContent ?? '').trim(), eteint: (b as HTMLButtonElement).disabled,
  }));

  /**
   * 🔴 LE MENU DE CHROME EST EMPÊCHÉ, et c'est le cœur du geste : il proposait « Recharger », c'est-à-dire
   * recharger toute l'application — fenêtre fermée, sélection perdue, brouillon emporté.
   */
  it('🔴 notre menu s’ouvre, et celui de Chrome est empêché', async () => {
    await monter();
    const e = await clicDroitVide();
    expect(e.defaultPrevented).toBe(true);
    // ⚠️ « Coller ici » est ABSENT : la mémoire tampon est vide, et un menu ouvert sur rien n'a rien à décrire.
    expect(entrees().map((x) => x.mot)).toEqual(['Nouveau dossier', 'Actualiser ce dossier']);
  });

  it('« Coller ici » apparaît dès que la mémoire tampon porte quelque chose', async () => {
    await monter();
    // On coupe une ligne : ⌘X sur la sélection.
    await act(async () => {
      [...container.querySelectorAll('.sfd-ligne')][1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('.sfd')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', metaKey: true, bubbles: true }));
    });
    await calmer();
    await clicDroitVide();
    expect(entrees().some((x) => x.mot.startsWith('Coller'))).toBe(true);
  });

  /**
   * ⚠️ ON ENTRE D'ABORD DANS UN DOSSIER. La racine de la fenêtre (« Google Drive ») n'est pas un endroit du
   * Drive : on n'y crée rien, et la ligne ne s'y ouvre pas — c'est voulu, et c'est ce que vérifie le test
   * suivant.
   */
  it('« Nouveau dossier » y ouvre la ligne en édition, dans le dossier affiché', async () => {
    await monter();
    await act(async () => {
      [...container.querySelectorAll('.sfd-ligne')][0]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await calmer();
    await clicDroitVide();
    await cliquer([...container.querySelectorAll('.sfd-menu [role="menuitem"]')]
      .find((b) => b.textContent === 'Nouveau dossier'));
    expect(container.querySelector('.sfd-ligne--neuve')).not.toBeNull();
    expect((container.querySelector('.sfd-neuve-champ') as HTMLInputElement).value).toBe('Nouveau dossier');
  });

  it('🔴 à la RACINE de la fenêtre, la ligne ne s’ouvre pas : ce n’est pas un endroit du Drive', async () => {
    await monter();
    await clicDroitVide();
    await cliquer([...container.querySelectorAll('.sfd-menu [role="menuitem"]')]
      .find((b) => b.textContent === 'Nouveau dossier'));
    expect(container.querySelector('.sfd-ligne--neuve')).toBeNull();
  });

  /** 🔴🔴 ET LES MÊMES INTERDITS : sous l'archive, « Nouveau dossier » y est éteint, avec son motif. */
  it('🔴🔴 sous « Documents clients scannés », « Nouveau dossier » du menu du vide est éteint', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
      const url = String(u);
      if (url.includes('/drive/deplacer')) {
        return new Response(JSON.stringify({ etat: 'ok', disponible: true }), { status: 200 });
      }
      if (url.includes('/drive/dossiers') || url.includes('/pieces-recentes') || url.includes('/dossier-du-bien')) {
        return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [], biens: [], dossiers: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        etat: 'ok', joindreAutorise: false,
        motifRefus: 'Ce dossier est dans « Documents clients scannés ».',
        creerAutorise: false,
        motifCreation: '« Documents clients scannés » est l’archive du cabinet : l’application n’y crée aucun dossier.',
        fichiers: [fichier('f1', 'avis.pdf')],
      }), { status: 200 });
    }));
    await monter();
    await clicDroitVide();
    const creer = entrees().find((x) => x.mot === 'Nouveau dossier');
    expect(creer?.eteint).toBe(true);
    expect(container.querySelector('.sfd-menu')?.textContent).toContain('Documents clients scannés');
  });

  /** ⚠️ UN CLIC DROIT SUR UNE LIGNE garde le menu de la ligne : le vide ne le mange pas. */
  it('un clic droit sur une LIGNE ouvre le menu de la ligne, pas celui du vide', async () => {
    await monter();
    await act(async () => {
      [...container.querySelectorAll('.sfd-ligne')][0]?.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await calmer();
    expect(entrees().some((x) => x.mot === 'Ouvrir')).toBe(true);
    expect(entrees().some((x) => x.mot === 'Actualiser ce dossier')).toBe(false);
  });
});
