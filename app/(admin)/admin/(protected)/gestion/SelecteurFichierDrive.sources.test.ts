// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { MOT_PAS_ENCORE_DANS_LE_DRIVE, titrePiecesSources } from '../../../../lib/gestion/vignetteDrive';
import { AIDE_LOUPE } from '../../../../lib/gestion/localisationDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — LA PIÈCE D'OÙ L'ON VIENT, EN HAUT DE LA COLONNE ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026, fil 36558) : un clic sur l'icône verte « Dans le Drive » d'une miniature
 * (IMG_4757.jpeg) ouvre l'écran du Drive — « mais la pièce ne figure nulle part en haut de la colonne de gauche :
 * on y voit seulement “Dossier du bien”, “Mon Drive”, “Drives partagés”, “Récents”. Seul le bandeau “CE DOCUMENT
 * EST ICI” en parle. »
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE : la colonne de gauche ne portait de vignettes QU'EN MODE « ranger » — les pièces
 * du message et les copies dupliquées. Le picto vert ouvre la fenêtre en mode « consulter », qui n'en a jamais eu.
 * Le document était donc là sans être nulle part.
 *
 * SA RÈGLE : « ces pièces s'affichent EN HAUT de la colonne de gauche, au-dessus de “Dossier du bien”, sous forme
 * de vignettes. Ce sont les MÊMES vignettes que celles déjà utilisées ailleurs dans l'écran du Drive pour un
 * document (même composant, pas une copie) […], en particulier la LOUPE. »
 *
 * 🔒 AUCUNE ÉCRITURE : ce fichier ne monte que des lectures, et compte ce qui part. Aucun dépôt, aucun
 * déplacement, aucun renommage.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ECRAN = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');

/** La pièce d'Arno, réduite à ce que la fenêtre en reçoit. */
const IMG = { pieceId: 4757, nom: 'IMG_4757.jpeg', tailleOctets: 182_400, typeMime: 'image/jpeg' };
const AUTRE = { pieceId: 4758, nom: 'bail-signe.pdf', tailleOctets: 98_000, typeMime: 'application/pdf' };

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];
/** Combien d'emplacements le registre annonce POUR CETTE PIÈCE. 0 = elle n'est rangée nulle part. */
let comptes: Map<number, number>;
/** Ce que la loupe a trouvé, quand on l'actionne. */
let occurrences: unknown[];

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide */ }
  appels = [];
  comptes = new Map([[IMG.pieceId, 1], [AUTRE.pieceId, 1]]);
  occurrences = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string }) => {
    const url = String(u);
    appels.push({ url, methode: (init?.method ?? 'GET').toUpperCase() });
    if (url.includes('/drive/localiser')) {
      const m = /piece=(\d+)/.exec(url);
      const n = m === null ? 0 : (comptes.get(Number(m[1])) ?? 0);
      return new Response(JSON.stringify({ etat: 'ok', nombre: n, md5: null, occurrences }), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
      fichiers: [fichier('d1', 'Test', true), fichier('f1', 'IMG_4757.jpeg')],
    }), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async (): Promise<void> => {
  await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); });
};

/** 🔴 LE MODE D'ARNO : « consulter », celui qu'ouvre le picto vert d'une miniature. */
const monter = async (piecesSources: readonly unknown[]): Promise<void> => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'consulter', piecesSources,
      documentEnEvidence: { driveFileId: 'f1' }, arrivee: 'arborescence',
      onChoisir: () => {}, onFermer: () => {},
    } as never));
  });
  await calmer();
};

const sources = (): Element[] => [...container.querySelectorAll('.sfd-piece--source')];
const sectionSources = (): Element | null => container.querySelector('.sfd-sources');
const cliquer = async (e: Element | null | undefined): Promise<void> => {
  await act(async () => { (e as HTMLElement | null | undefined)?.click(); });
  await calmer();
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA VIGNETTE EST LÀ, EN HAUT, AVEC CE QU'IL FAUT DESSUS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① ouvert depuis une pièce : la vignette en haut à gauche', () => {
  it('🔴🔴 la pièce paraît en vignette, avec son aperçu, son nom et sa taille', async () => {
    await monter([IMG]);
    expect(sources()).toHaveLength(1);
    const v = sources()[0];
    expect(v.querySelector('.sfd-piece-nom')?.textContent).toBe('IMG_4757.jpeg');
    /* 🔴 L'APERÇU EST SERVI PAR L'APPLICATION, jamais par une adresse de stockage. */
    expect(v.querySelector('img.sfd-piece-vignette')?.getAttribute('src'))
      .toBe('/api/admin/gestion/pieces/4757/miniature');
    expect(v.querySelector('.sfd-piece-taille')?.textContent).not.toBe('');
    /* 🔴 ET LE TITRE DISCRET, mot pour mot celui du module pur. */
    expect(sectionSources()?.querySelector('.sfd-ranger-titre')?.textContent)
      .toBe(titrePiecesSources(1));
  });

  /**
   * 🔴🔴 « EN HAUT DE LA COLONNE DE GAUCHE, AU-DESSUS DE “Dossier du bien” » (Arno). On éprouve l'ORDRE du
   * document : jsdom ne fait pas de mise en page, mais c'est l'ordre qui décide où la section se pose.
   */
  it('🔴🔴 elle est AU-DESSUS de la liste des emplacements', async () => {
    await monter([IMG]);
    const section = sectionSources();
    const emplacements = container.querySelector('.sfd-cote-liste');
    expect(section).not.toBeNull();
    expect(emplacements).not.toBeNull();
    const apres = (section as Node).compareDocumentPosition(emplacements as Node)
      & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(apres).toBeGreaterThan(0);
  });

  it('🔴🔴 plusieurs pièces → plusieurs vignettes, et le titre les compte', async () => {
    await monter([IMG, AUTRE]);
    expect(sources()).toHaveLength(2);
    expect(sources().map((v) => v.querySelector('.sfd-piece-nom')?.textContent))
      .toEqual(['IMG_4757.jpeg', 'bail-signe.pdf']);
    expect(sectionSources()?.querySelector('.sfd-ranger-titre')?.textContent)
      .toBe(titrePiecesSources(2));
  });

  /** 🔴 « Ouvert sans pièce source (ex. bouton Drive du haut) : rien ne change » (Arno). */
  it('🔴🔴 sans pièce source, la colonne est celle d’avant ce lot', async () => {
    await monter([]);
    expect(sectionSources()).toBeNull();
    expect(sources()).toHaveLength(0);
    /* 🔴 ET LES EMPLACEMENTS SONT TOUJOURS LÀ : on n'a rien retiré. */
    expect(container.querySelector('.sfd-cote-liste')).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LA LOUPE — CELLE QUI MÈNE À L'EMPLACEMENT RÉEL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② la loupe de la vignette source', () => {
  /**
   * 🔴🔴 C'EST LE MÊME BOUTON QUE PARTOUT AILLEURS — le composant `BoutonLoupe`, et c'est tout l'objet de la
   * demande d'Arno (« même composant, pas une copie »). On éprouve donc ce qui le prouve : son libellé vient du
   * module pur, et le geste part par `basculerLoupe`, la fonction qui déplie et surligne l'arborescence.
   */
  it('🔴🔴 elle porte le libellé du module pur, et elle localise la PIÈCE', async () => {
    await monter([IMG]);
    const loupe = [...sources()[0].querySelectorAll('button')]
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith(AIDE_LOUPE));
    expect(loupe, 'la loupe est sur la vignette').toBeDefined();
    appels = [];
    await cliquer(loupe);
    /* 🔴 LA DEMANDE PART SUR LA PIÈCE, par la route de localisation — celle qui sert déjà les autres vignettes. */
    expect(appels.some((a) => a.url.includes('/drive/localiser') && a.url.includes('piece=4757'))).toBe(true);
    expect(loupe?.getAttribute('aria-pressed')).toBe('true');
  });

  /**
   * 🔴🔴 « Une pièce qui n'est pas encore dans le Drive apparaît aussi en vignette, avec son état (“pas encore
   * dans le Drive”), et la loupe ne s'affiche pas pour elle » (Arno).
   */
  it('🔴🔴 pièce absente du Drive : l’état est écrit, et il n’y a pas de loupe', async () => {
    comptes = new Map([[IMG.pieceId, 0]]);
    await monter([IMG]);
    const v = sources()[0];
    expect(v.textContent).toContain(MOT_PAS_ENCORE_DANS_LE_DRIVE);
    expect([...v.querySelectorAll('button')]
      .some((b) => (b.getAttribute('aria-label') ?? '').startsWith(AIDE_LOUPE))).toBe(false);
    /* 🔴 ET AUCUNE PASTILLE VERTE : un « 0 » vert se lirait comme une bonne nouvelle. */
    expect(v.querySelector('.sfd-piece-range')).toBeNull();
  });

  /**
   * ⚠️ TROIS ÉTATS, ET NON DEUX. Tant que le compteur n'a pas répondu, on ne dit RIEN — ni loupe, ni phrase.
   * Annoncer « pas encore dans le Drive » avant d'avoir cherché serait une affirmation inventée, et c'est elle
   * qu'on retiendrait.
   */
  it('⚠️ tant que le compteur n’a pas répondu, aucune phrase n’est avancée', () => {
    expect(ECRAN).toContain('const repondu = comptesRanges.has(cle);');
    expect(ECRAN).toContain('{repondu && combien === 0 && (');
  });

  /** 🔴 ET LE COMPTEUR EST DEMANDÉ MÊME HORS DU MODE « ranger » : c'est lui qui décide si la loupe paraît. */
  it('🔴 les pièces sources font demander leur compteur dans tous les modes', async () => {
    await monter([IMG]);
    expect(appels.some((a) => a.url.includes('/drive/localiser') && a.url.includes('compte=1'))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔒 UN SEUL COMPOSANT DE VIGNETTE, ET AUCUNE ÉCRITURE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 ③ le même composant, et rien d’écrit', () => {
  /**
   * 🔴🔴 « LES MÊMES VIGNETTES […] (MÊME COMPOSANT, PAS UNE COPIE) » (Arno). Elles étaient DÉJÀ deux copies —
   * la pièce du message et la vignette dupliquée —, et ce lot en aurait fait trois. Le squelette et la loupe
   * vivent maintenant dans un composant chacun, et les trois listes les appellent.
   */
  it('🔴🔴 les trois listes montent `VignetteDocument`, et la loupe est `BoutonLoupe`', () => {
    expect(ECRAN).toContain('function VignetteDocument({');
    expect(ECRAN).toContain('function BoutonLoupe({');
    /* Trois montages : les pièces sources, les pièces du message, les copies dupliquées. */
    expect((ECRAN.match(/<VignetteDocument /g) ?? []).length).toBe(3);
    /* Et le BOUTON loupe n'est plus dessiné qu'une fois : ailleurs, on l'appelle.
       ⚠️ LE PICTO 🔎 PARAÎT AILLEURS AUSSI — le REPÈRE posé sur une ligne de l'arborescence (`sfd-repere`), qui
       n'est pas un bouton mais une marque. On compte donc les boutons, pas les emojis. */
    expect((ECRAN.match(/<BoutonLoupe /g) ?? []).length).toBe(3);
    expect((ECRAN.match(/className=\{`sfd-piece-oeil\$\{actif/g) ?? []).length).toBe(1);
  });

  /**
   * 🔒 AUCUNE ÉCRITURE DANS LE DRIVE POUR CE LOT (interdiction d'Arno). La vignette source ne porte ni case à
   * cocher, ni glisser : on ne la range pas, on la regarde. On le vérifie à l'écran ET par ce qui part.
   */
  it('🔒 la vignette source ne se range pas, et rien n’est écrit', async () => {
    await monter([IMG]);
    const v = sources()[0];
    expect(v.querySelector('.sfd-piece-case'), 'pas de case à cocher').toBeNull();
    expect(v.getAttribute('draggable'), 'pas glissable').toBeNull();
    /* 🔒 ET AUCUNE REQUÊTE D'ÉCRITURE N'EST PARTIE : seules des lectures.
       ⚠️ ON JUGE SUR LE VERBE, pas sur l'adresse : `/drive/deplacer` est AUSSI interrogée en GET au montage, pour
       savoir si le déplacement est seulement disponible. Une sonde n'est pas une écriture. */
    for (const a of appels.filter((x) => x.methode !== 'GET')) {
      expect(a.url, `${a.methode} ${a.url}`).not.toMatch(/\/drive\/(deplacer|renommer|corbeille|creer)/);
      expect(a.url, `${a.methode} ${a.url}`).not.toMatch(/\/pieces\/\d+\/drive/);
    }
  });

  /** 🔴 LE BANDEAU « CE DOCUMENT EST ICI » RESTE TEL QUEL (Arno) : ce lot n'y touche pas. */
  it('🔴 le bandeau « CE DOCUMENT EST ICI » n’est pas touché', () => {
    const bandeau = readFileSync('app/lib/admin/driveBandeau.ts', 'utf8');
    expect(bandeau).toContain('Drives partagés');
    /* L'écran le monte toujours par la même porte, et ce lot n'a rien changé à sa condition. */
    expect(ECRAN).toContain('documentEnEvidence');
  });
});
