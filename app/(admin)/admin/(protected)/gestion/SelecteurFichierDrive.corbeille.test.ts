// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { phraseCorbeille } from '../../../../lib/gestion/driveCorbeille';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « SUPPRIMER » À L'ÉCRAN ══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026), qui lève pour ce seul cas la règle « l'appli ne supprime jamais rien du Drive » :
 * une entrée « Supprimer » au clic droit sur une ligne de FICHIER, qui met à la CORBEILLE du Drive — récupérable
 * trente jours, et tout de suite par « Annuler ».
 *
 * CE QUE CE FICHIER TIENT, ET QUE LE SERVEUR NE PEUT PAS TENIR À LA PLACE DE L'ÉCRAN :
 *   ① l'entrée n'existe PAS sur un dossier, PAS tant que la sonde n'a pas répondu, PAS sous l'archive ;
 *   ② le clic du menu N'AGIT PAS : il ouvre la confirmation, et rien ne part avant qu'on y réponde ;
 *   ③ la phrase de la confirmation est celle du module PUR, au mot près — avec le nom ET le chemin ;
 *   ④ Échap = Annuler, et rien ne part ;
 *   ⑤ « Annuler » appelle la route de la CORBEILLE, pas celle du déplacement.
 *
 * ⚠️ LE DROIT N'EST PAS ÉPROUVÉ ICI : il l'est dans `drive/corbeille/route.test.ts`, qui prouve que le serveur
 * refuse même appelé directement. Ceci n'éprouve que ce que l'écran PROPOSE.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; corps: unknown }[];
let contenu: Record<string, unknown>;
let corbeilleDisponible: boolean;
let reponseCorbeille: unknown;

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide */ }
  appels = [];
  corbeilleDisponible = true;
  reponseCorbeille = {
    etat: 'ok', action: 'corbeille', faits: [{ id: 'f1', nom: 'bail.pdf' }], refuses: [], mouvements: [77],
  };
  contenu = {
    etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: false, motifCreation: null,
    fichiers: [fichier('d1', 'Artisans', true), fichier('f1', 'bail.pdf')],
  };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    let corps: unknown = null;
    try { corps = init?.body === undefined ? null : JSON.parse(String(init.body)); } catch { corps = null; }
    appels.push({ url, corps });
    if (url.includes('/drive/corbeille')) {
      if (init?.method === 'POST') return new Response(JSON.stringify(reponseCorbeille), { status: 200 });
      return new Response(JSON.stringify({ etat: 'ok', disponible: corbeilleDisponible, motif: null }), { status: 200 });
    }
    if (url.includes('/drive/deplacer')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
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
const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
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
const dialogue = () => container.querySelector('[role="alertdialog"]');
const bouton = (mot: string) =>
  [...(dialogue()?.querySelectorAll('button') ?? [])].find((b) => (b.textContent ?? '').includes(mot));
const postsCorbeille = () => appels.filter((a) => a.url.includes('/drive/corbeille') && a.corps !== null);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① OÙ L'ENTRÉE EXISTE, ET OÙ ELLE N'EXISTE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’entrée « Supprimer »', () => {
  it('🔴 elle existe sur une ligne de FICHIER', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    expect(entreeMenu('Supprimer')).toBeDefined();
  });

  /** 🔴🔴 JAMAIS SUR UN DOSSIER : il emporterait tout ce qu'il contient, sans qu'on voie quoi. */
  it('🔴🔴 elle n’existe PAS sur un dossier', async () => {
    await monter();
    await souris('Artisans', 'contextmenu');
    expect(entreeMenu('Supprimer')).toBeUndefined();
    expect((container.querySelector('.sfd-menu')?.textContent ?? '').toLowerCase()).not.toContain('supprimer');
  });

  /**
   * 🔴🔴 ET PAS DU TOUT SOUS « DOCUMENTS CLIENTS SCANNÉS ». Arno demande qu'elle n'APPARAISSE PAS là-bas : une
   * entrée grisée annoncerait que le geste existe et qu'il suffirait d'un droit de plus. On ne montre pas la porte
   * d'un endroit où l'on ne doit jamais entrer.
   */
  it('🔴🔴 elle n’apparaît pas là où la lecture est refusée (l’archive)', async () => {
    contenu = {
      ...contenu, joindreAutorise: false,
      motifRefus: '« Documents clients scannés » : la lecture du contenu est refusée.',
    };
    await monter();
    await souris('bail.pdf', 'contextmenu');
    expect(entreeMenu('Supprimer')).toBeUndefined();
  });

  /** ⚠️ ÉTEINTE AVEC SON MOTIF quand la base n'est pas prête : la fonction existe et attend quelque chose. */
  it('⚠️ sans la migration 295, elle est éteinte et DIT pourquoi', async () => {
    corbeilleDisponible = false;
    await monter();
    await souris('bail.pdf', 'contextmenu');
    const e = entreeMenu('Supprimer');
    expect(e).toBeDefined();
    expect((e as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.sfd-menu')?.textContent).toContain('295');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE CLIC DEMANDE, IL N'AGIT PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la confirmation', () => {
  it('🔴🔴 le clic du menu n’envoie RIEN : il ouvre la confirmation', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    expect(dialogue()).not.toBeNull();
    expect(postsCorbeille()).toHaveLength(0);
  });

  /** 🔴 LA PHRASE EST CELLE DU MODULE PUR, au mot près — avec le nom ET le chemin. */
  it('🔴 elle dit le nom, le chemin, et la récupération sur 30 jours', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    const texte = dialogue()?.textContent ?? '';
    expect(texte).toContain('Mettre à la corbeille du Drive : bail.pdf');
    expect(texte).toContain('Récupérable 30 jours');
    /**
     * ⚠️ LA PHRASE EXACTE DU MODULE PUR : l'écran ne la réécrit pas de son côté — c'est ce qui empêche qu'elle
     * s'allège au fil d'une retouche de mise en page.
     *
     * ⚠️ LE CHEMIN EST VIDE ICI, et c'est le cas de départ du sélecteur (on est à sa racine, pas dans un dossier) :
     * le module PUR écrit alors « dans ce dossier », son repli. Le chemin réel est éprouvé dans son test à lui,
     * avec « Test / _MESURE dossier instantane ».
     */
    expect(texte).toContain(phraseCorbeille('bail.pdf', ''));
    expect(texte).toContain('dans ce dossier ?');
  });

  it('les deux boutons sont « Annuler » et « Mettre à la corbeille »', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    expect(bouton('Annuler')).toBeDefined();
    expect(bouton('Mettre à la corbeille')).toBeDefined();
  });

  it('⚠️ « Annuler » referme sans rien envoyer', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    await cliquer(bouton('Annuler'));
    expect(dialogue()).toBeNull();
    expect(postsCorbeille()).toHaveLength(0);
  });

  /** 🔴 « Échap = Annuler » (Arno, mot pour mot) : on renonce sans fermer la fenêtre. */
  it('🔴 Échap annule, et n’envoie rien', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    await act(async () => {
      container.querySelector('.sfd')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await calmer();
    expect(dialogue()).toBeNull();
    expect(postsCorbeille()).toHaveLength(0);
    // ⚠️ ET LA FENÊTRE EST TOUJOURS LÀ : Échap a renoncé au geste, pas à l'écran.
    expect(container.querySelector('.sfd')).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE GESTE, ET SON RETOUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le geste', () => {
  it('🔴🔴 confirmer envoie l’action « corbeille » pour CE fichier, et pour lui seul', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    await cliquer(bouton('Mettre à la corbeille'));
    const posts = postsCorbeille();
    expect(posts).toHaveLength(1);
    expect(posts[0].corps).toEqual({ action: 'corbeille', elements: [{ id: 'f1', nom: 'bail.pdf' }] });
  });

  /** 🔴 LE BANDEAU DIT « RÉCUPÉRABLE », JAMAIS « SUPPRIMÉ » — on ne fait pas renoncer à chercher un document. */
  it('🔴 le bandeau annonce la récupération, et propose « Annuler »', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    await cliquer(bouton('Mettre à la corbeille'));
    const b = container.querySelector('.sfd-bandeau');
    expect(b?.textContent).toContain('corbeille du Drive');
    expect(b?.textContent).toContain('Récupérable 30 jours');
    expect(b?.textContent?.toLowerCase()).not.toContain('supprim');
    expect(b?.querySelector('.sfd-bandeau-annuler')).not.toBeNull();
  });

  /**
   * 🔴🔴 « Annuler » APPELLE LA ROUTE DE LA CORBEILLE, pas celle du déplacement. Sans cela, le bouton aurait
   * demandé un déplacement pour défaire une corbeille — et l'annulation aurait échoué en silence juste au moment
   * où l'on en a le plus besoin.
   */
  it('🔴🔴 « Annuler » restaure par la route de la corbeille', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    await cliquer(bouton('Mettre à la corbeille'));
    reponseCorbeille = { etat: 'ok', action: 'restaurer', remis: ['f1'], refuses: [] };
    await cliquer(container.querySelector('.sfd-bandeau-annuler'));
    const posts = postsCorbeille();
    expect(posts).toHaveLength(2);
    expect(posts[1].corps).toEqual({ action: 'restaurer', mouvements: [77] });
    // ⚠️ ET AUCUN APPEL N'EST PARTI VERS LA ROUTE DE DÉPLACEMENT.
    expect(appels.filter((a) => a.url.includes('/drive/deplacer') && a.corps !== null)).toHaveLength(0);
  });

  /**
   * 🔴 LE BOUTON DU PIED SAIT AUSSI LE FAIRE, et son infobulle annonce une SORTIE de corbeille — pas un
   * déplacement. Arno : « “Annuler le dernier déplacement” sait aussi annuler une mise à la corbeille. »
   */
  it('🔴 « Annuler le dernier déplacement » annonce la sortie de corbeille', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    await cliquer(bouton('Mettre à la corbeille'));
    const pied = [...container.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes('Annuler le dernier déplacement'));
    expect(pied?.getAttribute('title')).toBe('Sortir « bail.pdf » de la corbeille du Drive');

    reponseCorbeille = { etat: 'ok', action: 'restaurer', remis: ['f1'], refuses: [] };
    await cliquer(pied);
    expect(postsCorbeille()[1].corps).toEqual({ action: 'restaurer', mouvements: [77] });
  });

  /** ⚠️ UN REFUS DU SERVEUR S'AFFICHE, et le bandeau ne promet rien. */
  it('⚠️ un refus du serveur est écrit à l’écran', async () => {
    reponseCorbeille = {
      etat: 'ok', action: 'corbeille', faits: [], mouvements: [],
      refuses: [{ nom: 'bail.pdf', motif: 'Google refuse : droits insuffisants sur ce fichier.' }],
    };
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer(entreeMenu('Supprimer'));
    await cliquer(bouton('Mettre à la corbeille'));
    expect(container.textContent).toContain('droits insuffisants');
    expect(container.querySelector('.sfd-bandeau')).toBeNull();
  });
});
