// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { PictoDansLeDrive } from './PictoDansLeDrive';
import type { EmplacementPiece } from '../../../../lib/gestion/pieceDansLeDrive';

/**
 * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LE PICTO, MONTÉ POUR DE VRAI ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * TESTS DEMANDÉS PAR ARNO : « pièce dans le Drive → picto ; pièce absente → pas de picto ; 1 emplacement →
 * ouverture directe ; plusieurs → menu ; aucune écriture Drive. »
 *
 * 🔒 AUCUNE DONNÉE RÉELLE, AUCUN RÉSEAU : des emplacements inventés, et un composant qui ne fait que DEMANDER
 * l'ouverture. C'est l'écran parent qui monte la fenêtre Drive — et ce fichier éprouve aussi, en lisant les
 * sources, qu'il la monte en CONSULTATION et sans accorder le moindre droit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const emplacement = (p: Partial<EmplacementPiece> = {}): EmplacementPiece => ({
  driveFileId: 'F1', nom: 'facture.pdf', dossierId: 'D1', dossierNom: 'Quittances',
  chemin: [{ id: 'D1', nom: 'Quittances' }], voie: 'registre', ...p,
});

let container: HTMLDivElement;
let root: Root;
const onOuvrir = vi.fn();

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  onOuvrir.mockReset();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const monter = (emplacements: readonly EmplacementPiece[]) => {
  act(() => {
    root.render(createElement(PictoDansLeDrive, {
      emplacements, nomPiece: 'facture.pdf', classe: 'pj-action', onOuvrir,
    } as never));
  });
};
const cliquer = (e: Element) => { act(() => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const picto = () => container.querySelector('button.pj-action');
const entrees = () => [...container.querySelectorAll('.pdd-menu-item')];

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 IL N'APPARAÎT QUE SI LA PIÈCE Y EST
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① présent, ou pas du tout', () => {
  it('🔴🔴 pièce dans le Drive → le picto, avec sa bulle', () => {
    monter([emplacement()]);
    expect(picto()).not.toBeNull();
    expect(picto()?.getAttribute('title')).toBe('Pièce jointe dans le Drive');
    /* 🔴 LE LECTEUR D'ÉCRAN SAIT DE QUELLE PIÈCE ON PARLE : une rangée de dix pictos identiques ne dirait rien. */
    expect(picto()?.getAttribute('aria-label')).toBe('Pièce jointe dans le Drive — facture.pdf');
    /* 🔴 UN TRACÉ, PAS UN EMOJI : « 🗄 » resterait de la même teinte en Clair et en Sombre (leçon du trombone). */
    expect(container.querySelector('svg')).not.toBeNull();
  });

  /**
   * 🔴🔴 PIÈCE ABSENTE → RIEN DU TOUT. Pas un bouton éteint, pas une place réservée : un picto grisé se lit comme
   * « il devrait y être », alors que la réponse est « il n'y est pas », ce qui est normal.
   */
  it('🔴🔴 pièce absente du Drive → aucun picto', () => {
    monter([]);
    expect(picto()).toBeNull();
    expect(container.textContent).toBe('');
  });

  /** 🔴 LA BULLE COMPTE QUAND IL Y EN A PLUSIEURS (demande d'Arno). */
  it('🔴🔴 plusieurs emplacements → la bulle le dit', () => {
    monter([emplacement(), emplacement({ driveFileId: 'F2' }), emplacement({ driveFileId: 'F3' })]);
    expect(picto()?.getAttribute('title')).toBe('Pièce jointe dans le Drive (3 emplacements)');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 UN EMPLACEMENT : ON Y VA. PLUSIEURS : ON CHOISIT.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② ce que le clic fait', () => {
  /** 🔴 UN MENU D'UNE SEULE LIGNE EST UN CLIC DE TROP : avec un seul emplacement, on y va. */
  it('🔴🔴 un seul emplacement → ouverture directe, sans menu', () => {
    const e = emplacement();
    monter([e]);
    cliquer(picto() as Element);
    expect(onOuvrir.mock.calls).toEqual([[e]]);
    expect(container.querySelector('.pdd-menu')).toBeNull();
    /* ⚠️ ET LE BOUTON N'ANNONCE PAS DE MENU : attendre une liste qui ne vient pas est pire que pas d'indication. */
    expect(picto()?.getAttribute('aria-haspopup')).toBeNull();
  });

  /**
   * 🔴🔴 PLUSIEURS → UN PETIT MENU LISTANT LES CHEMINS (Arno), et chaque ligne porte le NOM DU FICHIER LÀ-BAS :
   * il n'est pas toujours celui de la pièce, et c'est le cas qui a fondé ce lot.
   */
  it('🔴🔴 plusieurs emplacements → un menu, un chemin par ligne', () => {
    const a = emplacement({ driveFileId: 'F1', nom: 'Recommandé M X.pdf' });
    const b = emplacement({
      driveFileId: 'F2', nom: 'LETTRE AR.pdf', dossierId: 'D2', dossierNom: 'Locataires',
      chemin: [{ id: 'D2', nom: 'Locataires' }, { id: 'D0', nom: 'Documents clients scannés' }],
    });
    monter([a, b]);
    cliquer(picto() as Element);
    expect(picto()?.getAttribute('aria-expanded')).toBe('true');
    expect(entrees().map((e) => e.textContent)).toEqual([
      'Quittances · Recommandé M X.pdf',
      'Documents clients scannés › Locataires · LETTRE AR.pdf',
    ]);
    /* 🔴 UN CLIC SUR UNE LIGNE OUVRE CELLE-LÀ, et le menu se referme. */
    cliquer(entrees()[1]);
    expect(onOuvrir.mock.calls).toEqual([[b]]);
    expect(container.querySelector('.pdd-menu')).toBeNull();
  });

  /**
   * ══ 🔴🔴 LE MENU EST POSÉ EN COORDONNÉES D'ÉCRAN, ET C'EST UNE RÉGRESSION DÉJÀ VUE ═════════════════════════
   *
   * DÉFAUT CONSTATÉ À L'ÉCRAN le 03/10/2026, sur les 9 emplacements d'Arno : le menu était rendu, avec ses neuf
   * lignes — et INVISIBLE. La carte d'une pièce porte `overflow:hidden` depuis le lot 5-PJ-A (pour que la
   * vignette ne déborde pas de son cadre), et un menu en `position:absolute` y est coupé net.
   *
   * ⚠️ ON NE TOUCHE PAS AU `overflow` DE LA CARTE : il protège la vignette, et le changer déplacerait le défaut
   * ailleurs. C'est le menu qui sort du flux, comme celui de la fenêtre Drive.
   */
  it('🔴🔴 le menu sort du flux : il n’est pas coupé par la carte', () => {
    monter([emplacement(), emplacement({ driveFileId: 'F2' })]);
    cliquer(picto() as Element);
    const menu = container.querySelector('.pdd-menu') as HTMLElement;
    expect(menu).not.toBeNull();
    /* 🔴 LA POSE EST ÉCRITE SUR L'ÉLÉMENT, mesurée sur le bouton : sans elle, `fixed` collerait en haut à gauche. */
    expect(menu.style.top).not.toBe('');
    expect(menu.style.right).not.toBe('');
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/PictoDansLeDrive.tsx', 'utf8');
    expect(css).toContain('.pdd-menu{position:fixed;');
  });

  /** ⚠️ LE MENU NE FAIT RIEN TANT QU'ON N'A PAS CHOISI : l'ouvrir n'ouvre aucune fenêtre Drive. */
  it('⚠️ ouvrir le menu n’ouvre rien d’autre', () => {
    monter([emplacement(), emplacement({ driveFileId: 'F2' })]);
    cliquer(picto() as Element);
    expect(onOuvrir).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔒 CE QUE LE CLIC OUVRE : NOTRE FENÊTRE, EN CONSULTATION, SANS AUCUN DROIT ACCORDÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 ③ aucune écriture Drive', () => {
  const code = (f: string): string => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
  const PICTO = code('app/(admin)/admin/(protected)/gestion/PictoDansLeDrive.tsx');
  const CARTES = code('app/(admin)/admin/(protected)/gestion/PiecesJointes.tsx');
  const CONV = code('app/(admin)/admin/(protected)/gestion/Conversation.tsx');

  /** 🔒 LE PICTO NE PARLE À PERSONNE : il DEMANDE, et c'est l'écran parent qui monte la fenêtre. */
  it('🔒 le picto lui-même n’appelle rien', () => {
    expect(PICTO).not.toContain('fetch(');
    expect(PICTO).not.toContain('SelecteurFichierDrive');
  });

  /**
   * 🔒 LES DEUX ÉCRANS OUVRENT LA MÊME FENÊTRE, EN MODE « consulter », ET NE LUI PASSENT AUCUNE PERMISSION. La
   * consultation seule sous « Documents clients scannés » reste le refus du SERVEUR (`verdictJoindre`,
   * `verdictCreer`, `verdictDeposer`) : un drapeau d'écran se contournerait, un refus serveur non.
   */
  it('🔒 la fenêtre s’ouvre en consultation, sur le dossier, avec le repère', () => {
    for (const [nom, src] of [['PiecesJointes', CARTES], ['Conversation', CONV]] as const) {
      const i = src.indexOf('mode="consulter"');
      expect(i, nom).toBeGreaterThan(0);
      const bloc = src.slice(src.lastIndexOf('<SelecteurFichierDrive', i), src.indexOf('/>', i) + 2);
      expect(bloc, nom).toContain('dossierDepart={dossierDeLEmplacement(');
      expect(bloc, nom).toContain('documentEnEvidence={{ driveFileId:');
      /* 🔒 AUCUN DROIT DONNÉ, ET AUCUNE PIÈCE EMPORTÉE : on vient regarder, pas prendre ni poser. */
      for (const interdit of ['joindreAutorise', 'creerAutorise', 'peutDeposer', 'onChoisir', 'pieces=']) {
        expect(bloc, `${nom} / ${interdit}`).not.toContain(interdit);
      }
    }
  });

  /**
   * 🔴 « MÊME REPÈRE QUE LA LOUPE » (Arno), pris au pied de la lettre : la fenêtre allume l'état de la loupe
   * existante. Un second dessin de mise en évidence aurait dû cohabiter avec le premier dans le même arbre.
   */
  it('🔴🔴 le repère est celui de la loupe, pas un second', () => {
    const SFD = code('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx');
    expect(SFD).toContain('documentEnEvidence = null,');
    expect(SFD).toContain('void basculerLoupe(`evidence:${id}`, id);');
    /* ⚠️ UNE SEULE FOIS : `basculerLoupe` est un interrupteur, le rappeler ÉTEINDRAIT le repère. */
    expect(SFD).toContain('if (id === \'\' || evidencePosee.current) return;');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-HABILLAGE, POINT 3 — L'ICÔNE SEULE EN VERT, LA CASE INCHANGÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (03/10/2026) : « l'icône seule en VERT (même vert que la pastille), la case qui l'entoure
   inchangée ».

   🔴 LES DEUX MOITIÉS COMPTENT AUTANT. Teindre le bouton aurait été plus court d'une ligne — et aurait teint du
   même coup son survol et son liseré de focus, c'est-à-dire la case qu'Arno demande explicitement de ne pas
   toucher.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑥ l’icône est verte, la case ne bouge pas', () => {
  it('🔴🔴 le tracé est enrobé d’un élément vert', () => {
    monter([emplacement()]);
    const icone = container.querySelector('.pdd-icone');
    expect(icone).not.toBeNull();
    // 🔴 L'ENROBAGE PORTE LE SVG, et le SVG suit `currentColor` : rien n'est passé à l'icône.
    expect(icone?.querySelector('svg')).not.toBeNull();
  });

  /**
   * ══ 🔴🔴 RÉÉCRIT PAR LE LOT PICTO-VERT-FRANC — L'ENCRE NE CONVIENT PAS À UN TRAIT ═══════════════════════════
   *
   * CE QUI ÉTAIT EXIGÉ ICI : `--color-svv-green-ink`, « le jeton de la pastille », au nom de « deux verts voisins
   * mais différents feraient douter qu'il s'agisse du même état ».
   *
   * 🔴 L'ÉCRAN A TRANCHÉ. Arno, après l'avoir vue sur le message 57428 : « l'icône cylindre apparaît NOIRE.
   * `--color-svv-green-ink` est trop foncé pour se distinguer du noir. Mets l'icône dans le vert FRANC de la
   * pastille (même couleur de remplissage que la pastille verte, pas la teinte d'encre). »
   *
   * 🔴 ET L'INTENTION D'ORIGINE EST RESPECTÉE, PAS ABANDONNÉE : une ENCRE est faite pour porter du TEXTE sur un
   * fond pâle — c'est son emploi dans `.sfd-piece-range`, où elle écrit un chiffre sur `green-soft`. Sur un tracé
   * de 1,8 px, elle se lit noire : un trait fin n'a pas la surface d'une lettre. Le vert de REMPLISSAGE
   * (`--color-svv-green`) est celui qui dit « vert » à cette taille.
   *
   * ⚠️ LES DEUX RESTENT DE LA MÊME FAMILLE DE CHARTE, et c'est ce qui tient la promesse « même état » : le dépôt
   * nomme `--color-svv-green` « VERT franc » là où il sert à remplir (`CarteRail`).
   */
  it('🔴🔴 c’est le vert FRANC de la charte, jamais l’encre', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/PictoDansLeDrive.tsx', 'utf8');
    expect(css).toContain('.pdd-icone{');
    expect(css).toContain('color:var(--color-svv-green)}');
    // 🔴 EN NÉGATIF : l'encre ne doit plus teinter le tracé, c'est tout le propos de ce lot.
    expect(css).not.toContain('.pdd-icone{display:inline-flex;align-items:center;justify-content:center;color:var(--color-svv-green-ink)}');
    /* 🔴 LA PASTILLE DU COMPTEUR, ELLE, GARDE SON COUPLE encre + fond pâle : elle porte un CHIFFRE, pas un
       tracé. Lu dans sa source — si quelqu'un l'aligne par erreur sur le vert franc, ce test tombe. */
    const fenetre = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');
    expect(fenetre).toContain('color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)');
    // ⚠️ AUCUNE COULEUR EN DUR : le picto bascule seul en Clair et en Sombre.
    expect(css).not.toMatch(/\.pdd-icone\{[^}]*#[0-9a-f]{3}/i);
  });

  /**
   * 🔴🔴 LA CASE EST INCHANGÉE : le bouton ne porte AUCUNE couleur propre. Sa classe vient de l'appelant
   * (`pj-action` sur les deux écrans), et c'est elle qui tient le fond, la bordure, le survol et la cible de
   * 44 px — exactement comme l'œil, le téléchargement et le Drive ▲ à sa gauche.
   */
  it('🔴🔴 le bouton ne reçoit aucune teinte', () => {
    monter([emplacement()]);
    const b = picto() as HTMLElement;
    expect(b.style.color).toBe('');
    expect(b.className).toBe('pj-action');
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/PictoDansLeDrive.tsx', 'utf8');
    // 🔴 EN NÉGATIF : aucune règle ne teinte `.pj-action` depuis ce fichier.
    expect(css).not.toContain('.pj-action{');
    expect(css).not.toContain('.pj-action ');
  });

  /** ⚠️ ET LE VERT NE DÉPEND PAS DU NOMBRE D'EMPLACEMENTS : un seul ou neuf, c'est le même état. */
  it('⚠️ le vert vaut pour un emplacement comme pour neuf', () => {
    monter([emplacement(), emplacement({ driveFileId: 'F2' })]);
    expect(container.querySelector('.pdd-icone')).not.toBeNull();
  });
});
