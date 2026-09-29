// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';

/**
 * LOT DRIVE-FACON-FINDER — LE NAVIGATEUR, MONTÉ POUR DE VRAI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER GARDE, ET QUI N'EXISTAIT PAS AVANT CE LOT :
 *   ① la CROIX de fermeture — « la fenêtre n'a pas de croix pour la fermer, il faut l'ajouter » (Arno) ;
 *   ② Échap ferme la fenêtre, SAUF si l'aperçu est ouvert : il ferme alors l'aperçu d'abord ;
 *   ③ le double-clic, la barre d'espace, les flèches, Entrée, Cmd+clic et Maj+clic ;
 *   ④ le menu contextuel, et ce qu'il n'a pas le droit de porter ;
 *   ⑤ 🔴🔴 LES CINQ VOIES DE REFUS sous « Documents clients scannés » : ligne, double-clic, barre d'espace, menu
 *      contextuel, sélection multiple — plus l'absence de tout préchargement de contenu.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fermetures: number;
let choisis: unknown[];
let appels: string[];
let contenu: Record<string, unknown>;

const fichier = (id: string, nom: string, dossier = false, typeMime = 'application/pdf') => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : typeMime,
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  fermetures = 0; choisis = []; appels = [];
  contenu = {
    etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: false, motifCreation: null,
    fichiers: [fichier('d1', 'Artisans', true), fichier('f1', 'bail.pdf'), fichier('f2', 'devis.pdf')],
  };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    appels.push(url);
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    if (url.includes('/drive/apercu')) {
      return new Response(JSON.stringify({ etat: 'ok', nom: 'x', sorte: 'pdf', typeMime: 'application/pdf' }), { status: 200 });
    }
    return new Response(JSON.stringify(contenu), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      onChoisir: (c: unknown) => { choisis.push(c); }, onFermer: () => { fermetures += 1; },
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const ligneDe = (nom: string) =>
  [...container.querySelectorAll('.sfd-ligne')].find((x) => (x.textContent ?? '').includes(nom));
const gestesDe = (nom: string) =>
  [...(ligneDe(nom)?.querySelectorAll('.sfd-geste') ?? [])].map((b) => b.getAttribute('title'));
const touche = async (key: string, cible: Element | null = container.querySelector('.sfd')) => {
  await act(async () => {
    cible?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  await calmer();
};
const souris = async (nom: string, type: string, init: MouseEventInit = {}) => {
  await act(async () => {
    ligneDe(nom)?.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  });
  await calmer();
};
/**
 * ⚠️ LE SURVOL SE SIMULE PAR `mouseover`, PAS PAR `mouseenter`. React construit `onMouseEnter` à partir de
 * `mouseover`/`mouseout` : dispatcher un `mouseenter` ne déclenche donc RIEN, et un test qui le ferait
 * « passerait » en ne prouvant rien du tout — ce qui est pire qu'un test absent.
 */
const survoler = async (nom: string) => {
  await act(async () => {
    ligneDe(nom)?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await calmer();
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① la fenêtre a enfin sa croix', () => {
  it('🔴 la croix est là, dans la barre de titre, et elle ferme', async () => {
    await monter();
    const croix = container.querySelector('.sfd-barre-titre .sfd-croix');
    expect(croix).not.toBeNull();
    expect(croix?.getAttribute('aria-label')).toBe('Fermer la fenêtre');
    await cliquer(croix);
    expect(fermetures).toBe(1);
  });

  it('le titre est le nom du DOSSIER COURANT, comme une fenêtre du Finder', async () => {
    await monter();
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Google Drive');
    await souris('Artisans', 'dblclick');
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Artisans');
  });

  it('🔴 Échap ferme la fenêtre', async () => {
    await monter();
    await touche('Escape');
    expect(fermetures).toBe(1);
  });

  /** 🔴 SAUF SI L'APERÇU EST OUVERT : il ferme alors l'aperçu d'abord (demande d'Arno). */
  it('🔴🔴 Échap ne ferme PAS la fenêtre quand l’aperçu est ouvert', async () => {
    await monter();
    await souris('bail.pdf', 'dblclick');
    expect(container.querySelector('.apd')).not.toBeNull();
    await touche('Escape');
    expect(fermetures).toBe(0);
  });
});

describe('🔴 ② la barre d’outils, façon Finder', () => {
  it('les flèches ‹ › sont éteintes au départ, et s’allument quand on descend', async () => {
    await monter();
    const arriere = () => container.querySelector('.sfd-outil[aria-label="Précédent"]') as HTMLButtonElement;
    const avant = () => container.querySelector('.sfd-outil[aria-label="Suivant"]') as HTMLButtonElement;
    expect(arriere().disabled).toBe(true);
    expect(avant().disabled).toBe(true);
    await souris('Artisans', 'dblclick');
    expect(arriere().disabled).toBe(false);
    await cliquer(arriere());
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Google Drive');
    expect(avant().disabled).toBe(false);
    await cliquer(avant());
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Artisans');
  });

  it('le fil d’Ariane est cliquable et ramène en arrière', async () => {
    await monter();
    await souris('Artisans', 'dblclick');
    const pas = [...container.querySelectorAll('.sfd-ariane-bouton')].map((b) => b.textContent);
    expect(pas).toEqual(['Google Drive', 'Artisans']);
    await cliquer(container.querySelector('.sfd-ariane-bouton'));
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Google Drive');
  });

  it('la loupe ouvre le champ de recherche, qui est celui d’avant', async () => {
    await monter();
    expect(container.querySelector('.sfd-saisie')).toBeNull();
    await cliquer(container.querySelector('.sfd-outil[aria-label="Rechercher"]'));
    expect(container.querySelector('.sfd-saisie')).not.toBeNull();
  });
});

describe('🔴 ③ la liste, façon Finder', () => {
  it('quatre colonnes, triables, avec leur flèche', async () => {
    await monter();
    const entetes = [...container.querySelectorAll('.sfd-entete')];
    expect(entetes.map((e) => e.textContent?.replace(/[▲▼]/g, ''))).toEqual(['Nom', 'Date de modification', 'Taille', 'Type']);
    expect(entetes[0].getAttribute('aria-sort')).toBe('ascending');
    await cliquer(entetes[0]);
    expect(container.querySelectorAll('.sfd-entete')[0].getAttribute('aria-sort')).toBe('descending');
  });

  it('🔴 les dossiers restent en tête, et chaque ligne porte son icône et son type', async () => {
    await monter();
    const noms = [...container.querySelectorAll('.sfd-ligne .sfd-nom')].map((x) => x.textContent);
    expect(noms[0]).toBe('Artisans');
    expect(ligneDe('Artisans')?.querySelector('.sfd-col-type')?.textContent).toBe('Dossier');
    expect(ligneDe('bail.pdf')?.querySelector('.sfd-col-type')?.textContent).toBe('Document PDF');
    expect(ligneDe('Artisans')?.querySelector('.sfd-col-taille')?.textContent).toBe('--');
  });

  it('🔴 double-clic : un dossier s’ouvre, un fichier se visualise', async () => {
    await monter();
    await souris('bail.pdf', 'dblclick');
    expect(container.querySelector('.apd')).not.toBeNull();
    await cliquer(container.querySelector('.apd-croix'));
    await souris('Artisans', 'dblclick');
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Artisans');
  });

  it('🔴 les flèches ↑ ↓ déplacent la sélection, Entrée ouvre', async () => {
    await monter();
    await touche('ArrowDown');
    expect(container.querySelector('.sfd-ligne--choisie .sfd-nom')?.textContent).toBe('Artisans');
    await touche('ArrowDown');
    expect(container.querySelector('.sfd-ligne--choisie .sfd-nom')?.textContent).toBe('bail.pdf');
    await touche('Enter');
    expect(container.querySelector('.apd')).not.toBeNull();
  });

  /** 🔴 LA BARRE D'ESPACE : le « Coup d'œil » du Finder. */
  it('🔴 la barre d’espace ouvre l’aperçu du fichier sélectionné', async () => {
    await monter();
    await souris('bail.pdf', 'click');
    await touche(' ');
    expect(container.querySelector('.apd')).not.toBeNull();
  });

  it('⚠️ la barre d’espace ne fait rien sur un dossier : il n’y a rien à voir', async () => {
    await monter();
    await souris('Artisans', 'click');
    await touche(' ');
    expect(container.querySelector('.apd')).toBeNull();
  });

  it('🔴 Cmd+clic et Maj+clic sélectionnent plusieurs lignes, et « Joindre la sélection » apparaît', async () => {
    await monter();
    await souris('bail.pdf', 'click');
    await souris('devis.pdf', 'click', { metaKey: true });
    expect(container.querySelectorAll('.sfd-ligne--choisie')).toHaveLength(2);
    const bouton = [...container.querySelectorAll('.sfd-pied button')]
      .find((b) => /Joindre la sélection/.test(b.textContent ?? ''));
    expect(bouton?.textContent).toContain('(2)');
    await cliquer(bouton);
    expect(choisis).toHaveLength(2);
  });

  it('🔴 le triangle ▸ déplie le dossier SUR PLACE, sans quitter la vue', async () => {
    await monter();
    const titreAvant = container.querySelector('.sfd-titre')?.textContent;
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    // On n'a pas changé de dossier…
    expect(container.querySelector('.sfd-titre')?.textContent).toBe(titreAvant);
    // …et le sous-niveau est arrivé, indenté sous lui.
    const indentees = [...container.querySelectorAll('.sfd-ligne')]
      .filter((l) => Number.parseInt((l as HTMLElement).style.paddingLeft || '0', 10) > 6);
    expect(indentees.length).toBeGreaterThan(0);
  });

  /** ⚠️ Les actions de ligne restent TOUTES là — elles ne sont plus trois liens rouges permanents. */
  it('🔴 les trois gestes sont en icônes, dans l’ordre, avec leur infobulle', async () => {
    await monter();
    expect(gestesDe('bail.pdf')).toEqual(['Visualiser', 'Joindre au message', 'Insérer un lien']);
  });
});

describe('🔴 ④ le menu contextuel', () => {
  it('sur un fichier : les quatre entrées permises, et rien d’autre', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    const mots = [...container.querySelectorAll('.sfd-menu [role="menuitem"]')].map((b) => b.textContent);
    expect(mots).toEqual(['Visualiser', 'Joindre au message', 'Insérer un lien', 'Ouvrir dans Google Drive']);
  });

  it('sur un dossier : Ouvrir, Nouveau dossier, Ouvrir dans Google Drive', async () => {
    await monter();
    await souris('Artisans', 'contextmenu');
    const mots = [...container.querySelectorAll('.sfd-menu [role="menuitem"]')].map((b) => b.textContent);
    expect(mots).toEqual(['Ouvrir', 'Nouveau dossier', 'Ouvrir dans Google Drive']);
  });

  /** 🔴🔴 JAMAIS : Renommer, Placer dans la corbeille, Supprimer, Déplacer, Partager, Dupliquer. */
  it('🔴🔴 aucune action destructrice, sur un fichier comme sur un dossier', async () => {
    await monter();
    for (const nom of ['bail.pdf', 'Artisans']) {
      await souris(nom, 'contextmenu');
      const texte = (container.querySelector('.sfd-menu')?.textContent ?? '').toLowerCase();
      for (const mot of ['renommer', 'corbeille', 'supprimer', 'déplacer', 'partager', 'dupliquer']) {
        expect(texte).not.toContain(mot);
      }
      await cliquer(container.querySelector('.sfd-menu-voile'));
    }
  });

  it('« Ouvrir » depuis le menu entre dans le dossier', async () => {
    await monter();
    await souris('Artisans', 'contextmenu');
    await cliquer([...container.querySelectorAll('.sfd-menu [role="menuitem"]')]
      .find((b) => b.textContent === 'Ouvrir'));
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Artisans');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 « DOCUMENTS CLIENTS SCANNÉS » — LES CINQ VOIES, UNE PAR UNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 sous « Documents clients scannés », la lecture du contenu est refusée par TOUTES les voies', () => {
  const MOTIF = 'Ce fichier est dans « Documents clients scannés » : son contenu n’est jamais lu.';
  const monterInterdit = async () => {
    contenu = { ...contenu, joindreAutorise: false, motifRefus: MOTIF };
    await monter();
  };

  it('le motif est écrit AVANT la liste, une fois pour toutes', async () => {
    await monterInterdit();
    expect(container.querySelector('.sfd-interdit')?.textContent).toContain('Documents clients scannés');
  });

  it('🔴 ① voie « ligne » : ni Visualiser ni Joindre — seul le lien reste', async () => {
    await monterInterdit();
    expect(gestesDe('bail.pdf')).toEqual(['Insérer un lien']);
  });

  it('🔴 ② voie « double-clic » : aucun aperçu ne s’ouvre', async () => {
    await monterInterdit();
    await souris('bail.pdf', 'dblclick');
    expect(container.querySelector('.apd')).toBeNull();
  });

  it('🔴 ③ voie « barre d’espace » : aucun aperçu ne s’ouvre', async () => {
    await monterInterdit();
    await souris('bail.pdf', 'click');
    await touche(' ');
    expect(container.querySelector('.apd')).toBeNull();
  });

  it('🔴 ③ bis — « Entrée » non plus', async () => {
    await monterInterdit();
    await souris('bail.pdf', 'click');
    await touche('Enter');
    expect(container.querySelector('.apd')).toBeNull();
  });

  it('🔴 ④ voie « menu contextuel » : Visualiser et Joindre ÉTEINTS, avec leur motif', async () => {
    await monterInterdit();
    await souris('bail.pdf', 'contextmenu');
    const entrees = [...container.querySelectorAll('.sfd-menu [role="menuitem"]')] as HTMLButtonElement[];
    const par = Object.fromEntries(entrees.map((b) => [b.textContent, b]));
    expect(par['Visualiser'].disabled).toBe(true);
    expect(par['Visualiser'].title).toContain('Documents clients scannés');
    expect(par['Joindre au message'].disabled).toBe(true);
    // ⚠️ « Insérer un lien » reste : il ne lit RIEN, il pose une adresse.
    expect(par['Insérer un lien'].disabled).toBe(false);
    // Et le motif est écrit sous les entrées éteintes : un refus se dit.
    expect(container.querySelector('.sfd-menu')?.textContent).toContain('Documents clients scannés');
  });

  it('🔴 ⑤ voie « sélection multiple » : aucun bouton « Joindre la sélection »', async () => {
    await monterInterdit();
    await souris('bail.pdf', 'click');
    await souris('devis.pdf', 'click', { metaKey: true });
    expect(container.querySelectorAll('.sfd-ligne--choisie')).toHaveLength(2);
    expect([...container.querySelectorAll('.sfd-pied button')]
      .find((b) => /Joindre la sélection/.test(b.textContent ?? ''))).toBeUndefined();
  });

  /**
   * 🔒 AUCUN PRÉCHARGEMENT DE CONTENU. Le survol d'une ligne amorce le verdict et les métadonnées de l'aperçu
   * (`?info=1`) — mais UNIQUEMENT là où la lecture est permise. Ici, pas un appel.
   */
  it('🔒 ⑥ aucun préchargement de contenu au survol', async () => {
    await monterInterdit();
    const avant = appels.length;
    await survoler('bail.pdf');
    expect(appels.slice(avant).filter((u) => u.includes('/drive/apercu'))).toHaveLength(0);
  });

  it('⚠️ mais le dossier reste PARCOURABLE : ses lignes, leurs noms, leurs types', async () => {
    await monterInterdit();
    expect(container.querySelectorAll('.sfd-ligne').length).toBeGreaterThan(0);
    expect(ligneDe('bail.pdf')).toBeDefined();
  });
});

describe('🔴 la réactivité', () => {
  /** 🔴 « Retour visuel immédiat à chaque clic » : un squelette, jamais un écran figé ni un vide. */
  it('🔴 un dossier qu’on ouvre montre un SQUELETTE, pas un écran vide', async () => {
    let debloquer: () => void = () => {};
    const attente = new Promise<void>((r) => { debloquer = r; });
    const vrai = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
      if (String(u).includes('dossier=d1')) await attente;
      return (vrai as typeof fetch)(u as string);
    }));
    await monter();
    await souris('Artisans', 'dblclick');
    expect(container.querySelectorAll('.sfd-ligne--squelette').length).toBeGreaterThan(0);
    debloquer();
    await calmer();
  });

  /** 🔴 « Cache des listings déjà vus (retour arrière instantané) ». */
  it('🔴 revenir sur un dossier déjà vu ne redemande RIEN avant de l’afficher', async () => {
    await monter();
    await souris('Artisans', 'dblclick');
    await cliquer(container.querySelector('.sfd-outil[aria-label="Précédent"]'));
    const avant = appels.length;
    await cliquer(container.querySelector('.sfd-outil[aria-label="Suivant"]'));
    // La liste est là TOUT DE SUITE, avant même que la requête de rafraîchissement ne soit revenue.
    expect(container.querySelectorAll('.sfd-ligne--squelette')).toHaveLength(0);
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Artisans');
    // (Une relecture silencieuse part quand même : on affiche ce qu'on sait, puis on vérifie.)
    expect(appels.length).toBeGreaterThanOrEqual(avant);
  });

  /** ⚠️ CONTRE-ÉPREUVE : là où la lecture EST permise, le survol d'un fichier amorce bien l'aperçu. Sans elle,
      le test « aucun préchargement » passerait même si le survol ne déclenchait rien du tout. */
  it('⚠️ là où c’est permis, survoler un fichier amorce son aperçu', async () => {
    await monter();
    const avant = appels.length;
    await survoler('bail.pdf');
    expect(appels.slice(avant).some((u) => u.includes('/drive/apercu'))).toBe(true);
  });

  /** 🔴 « Préchargement au survol d’un dossier ». */
  it('🔴 survoler un dossier précharge son contenu', async () => {
    await monter();
    const avant = appels.length;
    await survoler('Artisans');
    expect(appels.slice(avant).some((u) => u.includes('dossier=d1'))).toBe(true);
  });
});
