// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA LOUPE « OÙ EST CE DOCUMENT ? » À L'ÉCRAN ═════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « Clic = active ou désactive la localisation pour cette vignette (une seule active
 * à la fois). Surlignage, à chaque niveau de l'arbre : chaque dossier qui contient (directement ou plus bas) une
 * occurrence du document est surligné […] jusqu'à la ligne du fichier, surlignée elle aussi. Plusieurs
 * emplacements → plusieurs chemins surlignés. Petit compteur “N emplacement(s)” près de la loupe. »
 *
 * CE QUE CE FICHIER TIENT :
 *   ① la loupe est un INTERRUPTEUR, et une seule est active à la fois ;
 *   ② 🔴🔴 LE CHEMIN EST SURLIGNÉ À CHAQUE NIVEAU, jusqu'au fichier ;
 *   ③ plusieurs emplacements ⇒ plusieurs branches surlignées ;
 *   ④ le compteur dit « connu », et son infobulle dit ce qui n'a PAS été cherché ;
 *   ⑤ 🔒 la couleur du surlignage est DISTINCTE de celle de la sélection.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let reponseLocaliser: unknown;

const PIECE = { pieceId: 7, nom: 'quittance.pdf', tailleOctets: 4096, typeMime: 'application/pdf' };

const fichier = (id: string, nom: string, dossier = false, md5: string | null = null) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1', md5,
});

/** Le dossier affiché : deux dossiers (dont l'un mène au document) et deux fichiers. */
const CONTENU = {
  etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
  fichiers: [
    fichier('bienA', 'Bien A', true),
    fichier('bienB', 'Bien B', true),
    fichier('f1', '0851_001.pdf', false, 'EMPREINTE'),
    fichier('autre', 'autre.pdf', false, 'AUTRE'),
  ],
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide */ }
  appels = [];
  /**
   * La route rend DEUX emplacements, dans deux branches différentes — c'est le cas « plusieurs emplacements »
   * d'Arno. Chacun porte sa chaîne COMPLÈTE de dossiers.
   */
  reponseLocaliser = {
    etat: 'ok', source: 'f1', md5: 'EMPREINTE', parRegistre: 2,
    occurrences: [
      { id: 'copie1', nom: '0851_001.pdf', voie: 'registre', chemin: [{ id: 'travaux', nom: 'Travaux' }, { id: 'bienA', nom: 'Bien A' }] },
      { id: 'copie2', nom: '0851_001.pdf', voie: 'registre', chemin: [{ id: 'quittances', nom: 'Quittances' }, { id: 'bienB', nom: 'Bien B' }] },
    ],
  };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    appels.push(url);
    if (url.includes('/drive/localiser')) {
      return new Response(JSON.stringify(reponseLocaliser), { status: 200 });
    }
    if (url.includes('/drive/deplacer') || url.includes('/drive/corbeille')) {
      if (init?.method === 'POST') return new Response(JSON.stringify({ etat: 'ok', faits: [], refuses: [] }), { status: 200 });
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    return new Response(JSON.stringify(CONTENU), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'ranger', messageId: 42, pieces: [PIECE], onChoisir: () => {}, onFermer: () => {},
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
const loupes = () => [...container.querySelectorAll('button[aria-label^="Localiser dans le Drive"]')];
/** La loupe de la vignette dupliquée : la dernière de la colonne (la pièce du message est au-dessus). */
const loupeVignette = () => loupes()[loupes().length - 1];
const dupliquer = async () => {
  await souris('0851_001.pdf', 'contextmenu');
  await cliquer(entreeMenu('Dupliquer en vignette'));
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① UN INTERRUPTEUR, UNE SEULE À LA FOIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 la loupe', () => {
  /** 🔴 « Sur CHAQUE vignette de la colonne de gauche (pièce jointe ou vignette dupliquée) » (Arno). */
  it('🔴 elle est sur la pièce du message ET sur la vignette dupliquée', async () => {
    await monter();
    expect(loupes()).toHaveLength(1);        // la pièce du message
    await dupliquer();
    expect(loupes()).toHaveLength(2);        // …et la vignette
    for (const l of loupes()) expect(l.getAttribute('aria-label')).toContain('Localiser dans le Drive');
  });

  /** 🔴 « Clic = active ou désactive » : recliquer éteint, et le surlignage disparaît. */
  it('🔴 c’est un interrupteur : recliquer éteint', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    expect(loupeVignette().getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('.sfd-ligne--chemin').length).toBeGreaterThan(0);
    await cliquer(loupeVignette());
    expect(loupeVignette().getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('.sfd-ligne--chemin')).toHaveLength(0);
  });

  /** 🔴 « UNE SEULE ACTIVE À LA FOIS » : allumer la seconde éteint la première. */
  it('🔴 une seule loupe active à la fois', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupes()[0]);
    expect(loupes()[0].getAttribute('aria-pressed')).toBe('true');
    await cliquer(loupes()[1]);
    expect(loupes()[0].getAttribute('aria-pressed')).toBe('false');
    expect(loupes()[1].getAttribute('aria-pressed')).toBe('true');
  });

  /** ⚠️ UNE PIÈCE DU MESSAGE PART PAR SON IDENTIFIANT DE PIÈCE, une vignette par son identifiant Drive. */
  it('⚠️ les deux portes d’entrée de la route', async () => {
    await monter();
    await cliquer(loupes()[0]);
    expect(appels.some((u) => u.includes('/drive/localiser?piece=7'))).toBe(true);
    await dupliquer();
    await cliquer(loupeVignette());
    expect(appels.some((u) => u.includes('/drive/localiser?source=f1'))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE SURLIGNAGE, À CHAQUE NIVEAU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le surlignage', () => {
  /**
   * 🔴🔴 « chaque dossier qui contient (directement ou plus bas) une occurrence du document est surligné »
   * (Arno). Les deux dossiers affichés mènent chacun à une copie : les deux portent la marque, et c'est ce qui
   * permet de savoir où descendre SANS avoir déjà ouvert la branche.
   */
  it('🔴🔴 les dossiers qui mènent au document sont surlignés', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    expect(ligneDe('Bien A')?.className).toContain('sfd-ligne--chemin');
    expect(ligneDe('Bien B')?.className).toContain('sfd-ligne--chemin');
  });

  /** 🔴 « plusieurs emplacements → plusieurs chemins surlignés » : les deux branches coexistent. */
  it('🔴 deux emplacements surlignent deux branches', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    expect(container.querySelectorAll('.sfd-ligne--chemin')).toHaveLength(2);
  });

  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — UN SEUL REPÈRE PAR CHEMIN, ET IL PORTE SON NOMBRE ═══════════════════
   *
   * Constat d'Arno : la première version allumait TOUS les ancêtres à la fois. Ici, « Bien A » et « Bien B » sont
   * le nœud visible le plus profond de leur chemin (leurs sous-dossiers sont repliés) : chacun porte UN repère,
   * et aucun ancêtre au-dessus n'en porte.
   */
  it('🔴🔴 le repère est une pastille, posée sur le nœud visible le plus profond', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    // Deux branches + le fichier reconnu par empreinte = trois repères, pas un de plus.
    expect(container.querySelectorAll('.sfd-ligne .sfd-repere')).toHaveLength(3);
    expect(ligneDe('Bien A')?.querySelector('.sfd-repere')?.getAttribute('title'))
      .toContain('quelque part dans ce dossier');
    // 🔴 LE DOCUMENT LUI-MÊME LE DIT AUTREMENT : « Ce document est ici ».
    expect(ligneDe('0851_001.pdf')?.querySelector('.sfd-repere')?.getAttribute('title'))
      .toBe('Ce document est ici');
  });

  /**
   * 🔴🔴 DEUX EMPLACEMENTS DERRIÈRE LE MÊME DOSSIER FERMÉ : UN SEUL REPÈRE, AVEC « 2 » — la demande d'Arno mot
   * pour mot. Ils se sépareront quand on ouvrira le dossier.
   */
  it('🔴🔴 deux emplacements derrière le même dossier : un repère avec son nombre', async () => {
    reponseLocaliser = {
      etat: 'ok', source: 'f1', md5: null, parRegistre: 2,
      occurrences: [
        { id: 'c1', nom: 'x.pdf', voie: 'registre', chemin: [{ id: 'sousA', nom: 'Sous A' }, { id: 'bienA', nom: 'Bien A' }] },
        { id: 'c2', nom: 'x.pdf', voie: 'registre', chemin: [{ id: 'sousB', nom: 'Sous B' }, { id: 'bienA', nom: 'Bien A' }] },
      ],
    };
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    const repere = ligneDe('Bien A')?.querySelector('.sfd-repere');
    expect(repere?.querySelector('.sfd-repere-nb')?.textContent).toBe('2');
    expect(repere?.getAttribute('title')).toContain('2 emplacements');
    // ⚠️ ET UN SEUL REPÈRE EN TOUT : les deux chemins passent par le même dossier fermé.
    expect(container.querySelectorAll('.sfd-ligne .sfd-repere')).toHaveLength(1);
  });

  /**
   * 🔴🔴 ET LA LIGNE DU FICHIER LUI-MÊME, quand il est sous les yeux. Ici, `0851_001.pdf` porte l'empreinte
   * « EMPREINTE », la même que le document cherché : il est donc reconnu SANS être dans le registre — c'est la
   * seconde voie, celle qui rattrape une copie faite à la main dans Google Drive.
   */
  it('🔴🔴 un fichier de même empreinte est reconnu, et sa ligne est surlignée', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    expect(ligneDe('0851_001.pdf')?.className).toContain('sfd-ligne--trouve');
    // ⚠️ ET PAS LES AUTRES : une empreinte différente n'est pas le même document.
    expect(ligneDe('autre.pdf')?.className).not.toContain('sfd-ligne--trouve');
  });

  /** ⚠️ SANS EMPREINTE RENDUE (document Google natif), aucune ligne n'est reconnue par ce chemin-là. */
  it('⚠️ sans empreinte, seule la voie du registre répond', async () => {
    reponseLocaliser = { ...(reponseLocaliser as object), md5: null };
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    expect(ligneDe('0851_001.pdf')?.className).not.toContain('sfd-ligne--trouve');
    // Les dossiers du registre, eux, restent surlignés.
    expect(container.querySelectorAll('.sfd-ligne--chemin')).toHaveLength(2);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE COMPTEUR ET SES LIMITES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le compteur', () => {
  /**
   * 🔴🔴 IL DIT « CONNU(S) », JAMAIS UN TOTAL. L'API Drive ne sait pas chercher par empreinte : une copie rangée
   * à la main dans un dossier qu'on n'a pas ouvert reste invisible. « 3 emplacements » ferait conclure « il n'est
   * nulle part ailleurs », d'un balayage qui n'a pas eu lieu.
   */
  it('🔴🔴 il annonce « N emplacements connus », près de la loupe', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    const compte = container.querySelector('.sfd-loupe-compte');
    // Deux copies du registre + le fichier reconnu par empreinte.
    expect(compte?.textContent).toContain('3 emplacements connus');
  });

  /** 🔴 ET SON INFOBULLE DIT CE QUI N'A PAS ÉTÉ CHERCHÉ — à côté du nombre, pas dans une aide à aller chercher. */
  it('🔴 l’infobulle dit la méthode ET sa limite', async () => {
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    const titre = container.querySelector('.sfd-loupe-compte')?.getAttribute('title') ?? '';
    expect(titre).toContain('par le registre des copies');
    expect(titre).toContain('par empreinte de contenu');
    expect(titre).toContain('le Drive n’est pas balayé');
  });

  /** ⚠️ AUCUN EMPLACEMENT : on le DIT, au lieu de laisser une loupe allumée sans rien à montrer. */
  it('⚠️ aucun emplacement connu se dit aussi', async () => {
    reponseLocaliser = { etat: 'ok', source: 'f1', md5: null, parRegistre: 0, occurrences: [] };
    await monter();
    await dupliquer();
    await cliquer(loupeVignette());
    expect(container.querySelector('.sfd-loupe-compte')?.textContent).toContain('Aucun emplacement connu');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔒 AUCUNE ÉCRITURE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 la loupe n’écrit rien', () => {
  /**
   * 🔒 ELLE NE FAIT QU'UN `GET`. Un `POST` parti d'ici voudrait dire qu'une recherche a modifié le Drive — ce qui
   * ne doit jamais arriver, et surtout pas quand une occurrence se trouve sous « Documents clients scannés ».
   */
  it('🔒 un seul GET, aucune écriture', async () => {
    await monter();
    await dupliquer();
    const avant = appels.length;
    await cliquer(loupeVignette());
    const nouveaux = appels.slice(avant);
    expect(nouveaux.filter((u) => u.includes('/drive/localiser'))).toHaveLength(1);
    expect(nouveaux.some((u) => u.includes('/drive/deplacer') || u.includes('/drive/corbeille'))).toBe(false);
  });
});
