// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { MOTIF_DEJA_RANGEE } from '../../../../lib/gestion/renommagePiece';

/**
 * LOT RENOMMER-AVANT-RANGER — RENOMMER UNE PIÈCE, PUIS LA RANGER SOUS CE NOM.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER PROTÈGE, et ce qu'aucune relecture ne prouve :
 *   ① le champ est pré-rempli SANS l'extension, et l'extension est affichée à côté, non modifiable ;
 *   ② le nom donné part VRAIMENT au Drive — par le glisser comme par « Déposer ici » ;
 *   ③ la pièce d'origine n'est jamais renommée : la demande ne porte QUE le nom de la copie ;
 *   ④ une pièce déjà rangée ne se renomme plus, et l'écran dit pourquoi.
 *
 * ⚠️ ON REJOUE LES GESTES, on ne relit pas des intentions : le stylo se clique, le champ se remplit, « Valider »
 * se presse, et l'on regarde ce qui part sur le réseau. C'est la seule façon de prouver qu'un nom choisi dans une
 * fenêtre atteint le Drive à l'autre bout.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Ce qui est parti aux routes de dépôt : le seul endroit où un geste devient une copie dans le Drive. */
let depots: { pieceId: string; corps: Record<string, unknown> }[];

const PIECES = [
  { pieceId: 11, nom: '0836_001.pdf', tailleOctets: 84_213, typeMime: 'application/pdf' },
  { pieceId: 12, nom: 'IMG_4757.jpeg', tailleOctets: 12_004, typeMime: 'image/jpeg' },
];

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); globalThis.localStorage?.clear(); } catch { /* sans stockage, tout part neuf */ }
  depots = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    const m = /\/api\/admin\/gestion\/pieces\/(\d+)\/drive/.exec(url);
    if (m !== null && (init?.method ?? 'GET') === 'POST') {
      depots.push({ pieceId: m[1], corps: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
      return new Response(JSON.stringify({
        etat: 'ok', resultats: [{ pieceId: Number(m[1]), etat: 'depose', lien: 'https://drive/x' }],
      }), { status: 200 });
    }
    if (url.includes('/drive/deplacer')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({ etat: 'ok', mode: 'accueil', dernier: null, recents: [] }), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    // L'aperçu d'une PIÈCE ne demande ni `info` ni vignette : son type est déjà connu de l'écran.
    return new Response(JSON.stringify({
      etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
      fichiers: [fichier('d1', 'Artisans', true)], chaine: [],
    }), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (pieces = PIECES) => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'ranger', messageId: 900, filId: 42, pieces, onRangement: () => {}, onFermer: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const pieceDe = (nom: string) => [...container.querySelectorAll('.sfd-piece')]
  .find((x) => (x.querySelector('.sfd-piece-nom')?.textContent ?? '') === nom);
const stylo = (nom: string) => pieceDe(nom)?.querySelector('.sfd-piece-stylo') as HTMLButtonElement | undefined;
const champ = () => container.querySelector('.apd-champ-nom') as HTMLInputElement | null;
const extension = () => container.querySelector('.apd-extension')?.textContent ?? null;
const boutonDe = (m: RegExp) => [...container.querySelectorAll('button')]
  .find((b) => m.test(b.textContent ?? ''));

/** Saisir dans un champ contrôlé par React : on passe par le setter natif, sinon React ignore la valeur. */
const taper = async (valeur: string) => {
  const c = champ();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(c, valeur);
  await act(async () => { c?.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const touche = async (key: string) => {
  await act(async () => {
    champ()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
  await calmer();
};
const ligneDe = (nom: string) => [...container.querySelectorAll('.sfd-ligne')]
  .find((x) => (x.querySelector('.sfd-nom')?.textContent ?? '') === nom);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE STYLO, ET LE CHAMP
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① le stylo ouvre l’aperçu sur le champ', () => {
  it('chaque pièce porte un stylo, à côté de l’œil', async () => {
    await monter();
    expect(stylo('0836_001.pdf')).toBeDefined();
    expect(stylo('0836_001.pdf')?.title).toBe('Renommer avant de ranger');
    // ⚠️ Le stylo suit l'œil dans la même ligne : c'est ce qui les garde de même taille et alignés.
    expect(pieceDe('0836_001.pdf')?.querySelector('.sfd-piece-ligne .sfd-piece-stylo')).not.toBeNull();
  });

  /**
   * 🔴🔴 LA GARANTIE CENTRALE DU CHAMP : l'extension n'y est PAS. Un « .pdf » devenu « .pdff » est un fichier
   * que rien n'ouvre, et la faute ne se découvre qu'au moment où l'on en a besoin.
   */
  it('🔴 le champ est pré-rempli SANS l’extension, qui s’affiche à côté', async () => {
    await monter();
    await cliquer(stylo('0836_001.pdf'));
    expect(champ()?.value).toBe('0836_001');
    expect(extension()).toBe('.pdf');
    // Et l'extension n'est pas un champ : on ne peut pas la taper.
    expect(container.querySelector('.apd-extension')?.tagName).toBe('SPAN');
  });

  /** 🔴 L'ŒIL OUVRE LA MÊME FENÊTRE SANS LE CHAMP : le nom, et un stylo qui le fait apparaître SUR PLACE. */
  it('🔴 l’œil ouvre le bandeau en lecture, et son stylo ouvre le champ', async () => {
    await monter();
    await cliquer(pieceDe('0836_001.pdf')?.querySelector('.sfd-piece-oeil'));
    expect(champ()).toBeNull();
    expect(container.querySelector('.apd-nommage-nom')?.textContent).toBe('0836_001.pdf');
    await cliquer(container.querySelector('.apd-stylo'));
    expect(champ()?.value).toBe('0836_001');
  });

  /** 🔴 ÉCHAP ANNULE LE RENOMMAGE, PAS L'APERÇU (demande d'Arno). */
  it('🔴 Échap ferme le champ et laisse l’aperçu ouvert', async () => {
    await monter();
    await cliquer(stylo('0836_001.pdf'));
    await taper('Quittance');
    await touche('Escape');
    expect(champ()).toBeNull();
    expect(container.querySelector('.apd')).not.toBeNull();
    // Rien n'a été retenu : la carte porte toujours le nom reçu.
    expect(pieceDe('0836_001.pdf')).toBeDefined();
  });

  it('un nom vide grise « Valider » et dit pourquoi', async () => {
    await monter();
    await cliquer(stylo('0836_001.pdf'));
    await taper('   ');
    expect((boutonDe(/^Valider$/) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.apd-nommage-refus')?.textContent).toContain('ne peut pas être vide');
  });

  it('🔴 les caractères interdits sont retirés, et la remarque les nomme', async () => {
    await monter();
    await cliquer(stylo('0836_001.pdf'));
    await taper('Facture 12/2025');
    expect(container.querySelector('.apd-nommage-remarque')?.textContent).toContain('/');
    await cliquer(boutonDe(/^Valider$/));
    expect(pieceDe('Facture 122025.pdf')).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE NOM DONNÉ PART AU DRIVE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② le nom donné est celui qui part', () => {
  const renommer = async (nomPiece: string, nouveau: string) => {
    await cliquer(stylo(nomPiece));
    await taper(nouveau);
    await cliquer(boutonDe(/^Valider$/));
    await cliquer(container.querySelector('.apd-croix'));
  };

  /** 🔴 LA CARTE MONTRE LE NOUVEAU NOM, et le nom reçu juste dessous. */
  it('🔴 la carte affiche le nouveau nom et « reçue sous : … »', async () => {
    await monter();
    await renommer('0836_001.pdf', 'Quittance septembre 2026');
    const carte = pieceDe('Quittance septembre 2026.pdf');
    expect(carte).toBeDefined();
    expect(carte?.querySelector('.sfd-piece-origine')?.textContent).toBe('reçue sous : 0836_001.pdf');
  });

  /**
   * 🔴🔴 L'ÉPREUVE QUI COMPTE : le nom atteint la ROUTE DE DÉPÔT. Tout le reste ne serait qu'un affichage.
   */
  it('🔴 « Déposer ici » envoie le nom choisi, et lui seul', async () => {
    await monter();
    await renommer('0836_001.pdf', 'Quittance septembre 2026');
    // On entre dans un dossier, puis on dépose : c'est le chemin du bouton.
    await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    await cliquer(boutonDe(/^Déposer ici/));
    const pose = depots.find((d) => d.pieceId === '11');
    expect(pose?.corps.nom).toBe('Quittance septembre 2026.pdf');
    expect(pose?.corps.dossierId).toBe('d1');
    /* 🔴 ET LA PIÈCE NON RENOMMÉE N'ENVOIE AUCUN NOM : la route retombe alors sur le nom d'origine, et la
       requête est mot pour mot celle d'avant ce lot. C'est ce qui garantit qu'on n'a rien changé pour les
       milliers de dépôts ordinaires. */
    const autre = depots.find((d) => d.pieceId === '12');
    expect(autre?.corps.nom).toBeUndefined();
  });

  /**
   * 🔴🔴 LA PIÈCE D'ORIGINE N'EST JAMAIS RENOMMÉE. Aucune demande ne part vers une route d'écriture de la pièce :
   * le seul appel est le DÉPÔT, et il ne nomme que la copie.
   */
  it('🔴 rien n’écrit sur la pièce reçue : aucune route de renommage n’est appelée', async () => {
    await monter();
    await renommer('0836_001.pdf', 'Quittance');
    const appels = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0]));
    expect(appels.some((u) => /\/pieces\/\d+\/(renommer|nom)/.test(u))).toBe(false);
    // Le seul POST vers les pièces est le dépôt lui-même — et il n'a lieu qu'au rangement.
    expect(depots).toHaveLength(0);
  });

  /** ⚠️ LE NOM SURVIT À LA FERMETURE DE L'APERÇU, tant que la fenêtre « Ranger » reste ouverte. */
  it('🔴 le nom choisi est conservé après plusieurs ouvertures de l’aperçu', async () => {
    await monter();
    await renommer('0836_001.pdf', 'Quittance');
    await cliquer(pieceDe('Quittance.pdf')?.querySelector('.sfd-piece-oeil'));
    expect(container.querySelector('.apd-nommage-nom')?.textContent).toBe('Quittance.pdf');
    await cliquer(container.querySelector('.apd-croix'));
    expect(pieceDe('Quittance.pdf')).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE CHAMP SUIT LA PIÈCE AFFICHÉE — DÉFAUT TROUVÉ À L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 « Précédent / Suivant » : le bandeau suit la pièce affichée', () => {
  /**
   * 🔴🔴 DÉFAUT TROUVÉ À L'ÉCRAN LE 30/09/2026, en faisant l'essai réel. Le renommage était passé à l'aperçu
   * comme un OBJET, calculé sur la pièce qu'on avait CLIQUÉE. Or « Précédent / Suivant » change la pièce DANS
   * la fenêtre, sans que le parent en sache rien : après un clic sur « Précédent », le bandeau disparaissait et
   * la barre de titre annonçait le nom d'ORIGINE d'une pièce pourtant renommée.
   *
   * Arno demandait l'inverse, mot pour mot : « Précédent / Suivant dans l'aperçu : le champ suit la pièce
   * affichée ». Le renommage est donc devenu une FONCTION de l'identifiant affiché.
   */
  it('🔴 après « Suivant », le bandeau parle de la pièce qu’on voit', async () => {
    await monter();
    // On renomme la SECONDE pièce, puis on ouvre l'aperçu sur la PREMIÈRE.
    await cliquer(stylo('IMG_4757.jpeg'));
    await taper('Photo compteur');
    await cliquer(boutonDe(/^Valider$/));
    await cliquer(container.querySelector('.apd-croix'));
    await cliquer(pieceDe('0836_001.pdf')?.querySelector('.sfd-piece-oeil'));
    expect(container.querySelector('.apd-nommage-nom')?.textContent).toBe('0836_001.pdf');

    // « Suivant » amène la pièce renommée : le bandeau doit la suivre, mention d'origine comprise.
    await cliquer(boutonDe(/Suivant/));
    expect(container.querySelector('.apd-nommage-nom')?.textContent).toBe('Photo compteur.jpeg');
    expect(container.querySelector('.apd-nommage-origine')?.textContent).toBe('reçue sous : IMG_4757.jpeg');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ CE QU'ON NE RENOMME PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ une pièce déjà rangée ne se renomme plus', () => {
  /**
   * 🔴 ON NE RENOMME JAMAIS UN FICHIER EXISTANT DU DRIVE (demande d'Arno). L'application déplace et copie
   * là-bas, elle n'y renomme rien : laisser le champ ouvert donnerait un nom qui ne partirait nulle part.
   */
  it('🔴 le stylo est grisé, avec son motif', async () => {
    await monter();
    // On range la première pièce : elle passe à « ✓ Rangée ».
    await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    await cliquer(boutonDe(/^Déposer ici/));
    expect(depots.length).toBeGreaterThan(0);

    const s = stylo('0836_001.pdf');
    expect(s?.disabled).toBe(true);
    expect(s?.title).toBe(MOTIF_DEJA_RANGEE);
    expect(MOTIF_DEJA_RANGEE).toContain('renommez-la dans le Drive');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LOT RENOMMAGE-UN-SEUL-NOM — L'EXTENSION NE SE PERD JAMAIS, ET NE DOUBLE JAMAIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LE CAS RÉEL D'ARNO (03/10/2026) ════════════════════════════════════════════════════════════════════════
 *
 * « J'ai renommé « _MESURE 1790804662784 0836_001.pdf [octets] » en « reco renomage » : le nouveau nom
 * s'enregistre SANS « .pdf ». La règle : l'extension d'origine est TOUJOURS conservée. »
 *
 * Ce nom-là finit par « [octets] » : aucune extension à la fin, donc le champ portait le nom ENTIER et ce qu'on
 * tapait par-dessus partait nu. C'est le TYPE du document qui dit que c'est un PDF — et il voyage désormais
 * jusqu'au bandeau.
 */
describe('🔴🔴 ④ l’extension d’origine est toujours conservée', () => {
  /** Une pièce dont le nom porte « .pdf » AU MILIEU, exactement comme celle d'Arno. */
  const AU_MILIEU = [{
    pieceId: 21, nom: '_MESURE 1790804662784 0836_001.pdf [octets]',
    tailleOctets: 133_157, typeMime: 'application/pdf',
  }];

  it('🔴🔴 un nom qui ne finit pas par son extension : le type la redonne, à côté du champ', async () => {
    await monter(AU_MILIEU);
    await cliquer(stylo('_MESURE 1790804662784 0836_001.pdf [octets]'));
    // Le nom ENTIER reste dans le champ : on ne retire rien de ce qui était écrit…
    expect(champ()?.value).toBe('_MESURE 1790804662784 0836_001.pdf [octets]');
    // … et l'extension repêchée s'affiche à côté, non modifiable.
    expect(extension()).toBe('.pdf');
  });

  /** 🔴🔴 L'ÉPREUVE QUI RÉPOND À ARNO : « reco renomage » devient « reco renomage.pdf », et pas autre chose. */
  it('🔴🔴 « reco renomage » part avec son « .pdf »', async () => {
    await monter(AU_MILIEU);
    await cliquer(stylo('_MESURE 1790804662784 0836_001.pdf [octets]'));
    await taper('reco renomage');
    await cliquer(boutonDe(/^Valider$/));
    expect(pieceDe('reco renomage.pdf')).toBeDefined();
  });

  /** 🔴🔴 ET LE NOM ARRIVE AINSI À LA ROUTE DE DÉPÔT — le reste ne serait qu'un affichage. */
  it('🔴🔴 le dépôt reçoit « reco renomage.pdf »', async () => {
    await monter(AU_MILIEU);
    await cliquer(stylo('_MESURE 1790804662784 0836_001.pdf [octets]'));
    await taper('reco renomage');
    await cliquer(boutonDe(/^Valider$/));
    await cliquer(container.querySelector('.apd-croix'));
    await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    await cliquer(boutonDe(/^Déposer ici/));
    expect(depots.length).toBe(1);
    expect(depots[0].corps.nom).toBe('reco renomage.pdf');
  });

  /** 🔴🔴 JAMAIS « x.pdf.pdf » (règle d'Arno) : l'extension retapée dans le champ ne compte qu'une fois. */
  it('🔴🔴 retaper l’extension ne la double pas', async () => {
    await monter();
    await cliquer(stylo('0836_001.pdf'));
    await taper('Quittance.pdf');
    await cliquer(boutonDe(/^Valider$/));
    expect(pieceDe('Quittance.pdf')).toBeDefined();
    expect(pieceDe('Quittance.pdf.pdf')).toBeUndefined();
  });

  /** ⚠️ ET LA CASSE NE FAIT PAS UNE SECONDE EXTENSION : « .PDF » tapé sur un « .pdf » est la même. */
  it('« .PDF » tapé sur un « .pdf » ne double pas non plus', async () => {
    await monter();
    await cliquer(stylo('0836_001.pdf'));
    await taper('Quittance.PDF');
    await cliquer(boutonDe(/^Valider$/));
    expect(pieceDe('Quittance.pdf')).toBeDefined();
  });

  /**
   * 🔴🔴 ON NE RETIRE QUE L'EXTENSION ATTENDUE. Couper « la dernière chose qui ressemble à une extension »
   * effaçait le « .03 » de « Bail 2026.03 » en silence — une partie du nom perdue sans le dire.
   */
  it('🔴🔴 un autre point en queue n’est pas pris pour l’extension', async () => {
    await monter();
    await cliquer(stylo('0836_001.pdf'));
    await taper('Bail 2026.03');
    await cliquer(boutonDe(/^Valider$/));
    expect(pieceDe('Bail 2026.03.pdf')).toBeDefined();
  });

  /** ⚠️ UNE IMAGE GARDE SON « .jpeg » TEL QUEL : le nom passe avant le type, on ne normalise pas en « .jpg ». */
  it('le nom passe avant le type : « .jpeg » reste « .jpeg »', async () => {
    await monter();
    await cliquer(stylo('IMG_4757.jpeg'));
    expect(extension()).toBe('.jpeg');
    await taper('Photo du compteur');
    await cliquer(boutonDe(/^Valider$/));
    expect(pieceDe('Photo du compteur.jpeg')).toBeDefined();
  });
});
