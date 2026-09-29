// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue, etiquettesDeLEcran } from './GestionVue';
import { motConfirmation, motToutSelectionner, MENTION_30_JOURS } from './EnteteCorbeille';

/**
 * LOT BOITE-INTERNE-CORBEILLE — LA CORBEILLE À L'ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LES QUATRE POINTS DEMANDÉS PAR ARNO, éprouvés à l'écran MONTÉ plutôt qu'en lisant le code :
 *   ① une entrée « Corbeille » JUSTE SOUS « Spam », avec son compteur ;
 *   ② « Réintégrer » : pas de confirmation, un bandeau « Annuler » ;
 *   ③ « Supprimer définitivement » : confirmation OBLIGATOIRE, qui annonce le nombre de MAILS et le mot
 *      « irréversible », avec « Supprimer » et « Annuler » ;
 *   ④ « tout sélectionner » : la page d'abord, puis le lien qui prend toute la Corbeille.
 *
 * 🔴 ET LE POINT QUI N'EST PAS DANS LA LISTE MAIS QUI COMPTE AUTANT : tant que le droit Google d'effacer n'est pas
 * accordé, le bouton de suppression est DÉSACTIVÉ et DIT pourquoi. Ni caché (on ne devinerait pas que la fonction
 * existe), ni menteur (rien n'est effacé « chez nous seulement »). C'est l'état RÉEL au 29/09/2026 — vérifié sur le
 * vrai compte : `DELETE /messages/…` répond 403 « insufficient authentication scopes ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ECRAN = {
  file: [], filsTotal: 478, fenetreJours: 30, filsTropAnciens: 0,
  sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0,
  messagesCaptures: 57198, messagesExclus: 30851, derniereReleveLe: '2026-09-29T15:00:00Z',
};
const REDACTION = {
  adresseGestion: 'gestion@criterimmo.fr', signature: null, peutEnvoyer: true, schemaPret: true,
  piecesDisponibles: false, brouillons: 3,
};
/** La migration 275 est appliquée dans ce jeu d'essai : `corbeille` porte un NOMBRE, pas `null`. */
const COMPTES: Record<string, unknown> = {
  lisibles: 8529, automatiques: 26059, envoyes: 6613, reception: 8529, spam: 250, corbeille: 3,
  etoileDisponible: true,
};

/** Trois lignes de corbeille. La deuxième porte DEUX mails supprimés : c'est elle qui éprouve le compte annoncé. */
const LIGNES = [
  { filId: 101, nbCorbeille: 1 }, { filId: 102, nbCorbeille: 2 }, { filId: 103, nbCorbeille: 1 },
].map((x) => ({
  ...x,
  messageAffiche: x.filId * 10,
  objet: `Échange ${x.filId}`,
  interlocuteur: 'Mme Martin', interlocuteurAdresse: 'martin@orange.fr',
  dernierSens: 'recu', dernierLe: '2026-09-28T10:00:00Z', extrait: 'bonjour',
  nbMessages: 2, nbLisibles: 2, aPiece: false, nbPieces: 0, etoilee: false,
  classement: null, reference: null, sansSuite: false, nonRemise: null,
}));

const PAGE_CORBEILLE = { lignes: LIGNES, suivant: null, total: 3, comptes: COMPTES, nonLus: [], nonLusTotal: 0 };
/** Ce que rend la route de la corbeille : 3 échanges affichés sur 5 au total, 7 mails, droit d'effacer REFUSÉ. */
const ETAT_CORBEILLE = {
  etat: 'ok', ids: [101, 102, 103, 104, 105], total: 5, mails: 7, borne: 1000,
  suppressionPossible: false,
  motSuppressionImpossible: 'La suppression définitive demande un droit Google supplémentaire, qui n’est pas '
    + 'encore accordé à gestion@criterimmo.fr.',
};

let container: HTMLDivElement;
let root: Root;
let postsCorbeille: { corps: Record<string, unknown> }[];
let reponsePost: Record<string, unknown>;

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion?etiquette=corbeille');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  postsCorbeille = [];
  reponsePost = { etat: 'ok', faits: 1, refuses: [], droitManquant: false, message: '1 mail réintégré.' };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/gestion/corbeille')) {
      if ((init?.method ?? 'GET') === 'POST') {
        postsCorbeille.push({ corps: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
        return { ok: true, json: async () => reponsePost } as unknown as Response;
      }
      return { ok: true, json: async () => ETAT_CORBEILLE } as unknown as Response;
    }
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => COMPTES } as unknown as Response;
    if (u.includes('/boite')) return { ok: true, json: async () => PAGE_CORBEILLE } as unknown as Response;
    if (u.includes('/redaction')) return { ok: true, json: async () => REDACTION } as unknown as Response;
    if (u.includes('/brouillons')) return { ok: true, json: async () => ({ liste: [] }) } as unknown as Response;
    if (u.includes('/messages')) return { ok: true, json: async () => ({ messages: [], partis: [] }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async () => { await act(async () => { root.render(createElement(GestionVue)); }); await calmer(); };
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement)?.click(); }); await calmer();
};
const entrees = () => [...container.querySelectorAll('.cm-liste .cm-entree')].map((b) => b.textContent ?? '');
const boutonPar = (motif: RegExp) => [...container.querySelectorAll('button')]
  .find((b) => motif.test(b.textContent ?? ''));
const cases = () => [...container.querySelectorAll('input.bte-choix')] as HTMLInputElement[];
const caseTout = () => container.querySelector('.ecb-tout input') as HTMLInputElement | null;
const texte = () => container.textContent ?? '';

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① L'ENTRÉE ET SON COMPTEUR
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① « Corbeille » est dans la colonne, JUSTE SOUS « Spam »', () => {
  it('l’entrée existe, porte son compteur, et suit immédiatement « Spam »', async () => {
    await monter();
    const liste = entrees();
    const iSpam = liste.findIndex((t) => t.includes('Spam'));
    const iCorbeille = liste.findIndex((t) => t.includes('Corbeille'));
    expect(iSpam).toBeGreaterThan(-1);
    expect(iCorbeille).toBe(iSpam + 1);
    expect(liste[iCorbeille]).toContain('3');
  });

  /**
   * ══ 🔴 SANS LA MIGRATION 275, L'ENTRÉE N'EXISTE PAS DU TOUT — ET CE TEST A ATTRAPÉ LE CONTRAIRE ══════════════
   *
   * Première écriture : `compte: comptes?.corbeille ?? null`, en croyant que `etiquettesVisibles` écarterait
   * l'entrée « comme toute étiquette vide ». VU À L'ÉCRAN : la colonne affichait « Corbeille » SANS compteur,
   * menant à une liste vide par construction. La raison est dans le code de `etiquettesVisibles` :
   * `compte === null` veut dire « on ne sait pas ENCORE », un état d'attente pendant lequel l'entrée reste.
   *
   * On éprouve donc l'ABSENCE de l'entrée, pas la nullité de son compteur — c'est la question qu'on se pose
   * vraiment, et c'est la seule qui aurait vu le défaut.
   */
  it('🔴 sans compte de corbeille, l’entrée n’existe pas — pas même sans compteur', () => {
    const sans = etiquettesDeLEcran(
      { ...ECRAN, filsTotal: 0 } as unknown as Parameters<typeof etiquettesDeLEcran>[0],
      { lisibles: 1, automatiques: 1, envoyes: 1 }, null, null, false, null);
    expect(sans.find((e) => e.etiquette.sorte === 'corbeille')).toBeUndefined();
    // …et avec un compte, elle existe : le test ne passe pas « par construction ».
    const avec = etiquettesDeLEcran(
      { ...ECRAN, filsTotal: 0 } as unknown as Parameters<typeof etiquettesDeLEcran>[0],
      { lisibles: 1, automatiques: 1, envoyes: 1, corbeille: 3 }, null, null, false, null);
    expect(avec.find((e) => e.etiquette.sorte === 'corbeille')?.compte).toBe(3);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA MENTION, ET LES MOTS — PURS, DONC ÉPROUVÉS SANS ÉCRAN
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('les mots de la corbeille', () => {
  it('🔴 la mention des 30 jours est celle d’Arno, mot pour mot', () => {
    expect(MENTION_30_JOURS)
      .toBe('Les mails sont supprimés automatiquement par Gmail après 30 jours dans la corbeille.');
  });

  /** 🔴 LE NOMBRE, ET LE MOT « IRRÉVERSIBLE ». C'est le dernier texte lu avant un geste qui ne se défait pas. */
  it('🔴 la confirmation annonce le nombre et dit « irréversible »', () => {
    expect(motConfirmation(7)).toBe('7 mails seront supprimés définitivement de Gmail. Cette action est irréversible.');
    expect(motConfirmation(1)).toBe('1 mail sera supprimé définitivement de Gmail. Cette action est irréversible.');
  });

  it('le lien « tout sélectionner » s’accorde', () => {
    expect(motToutSelectionner(5)).toBe('Sélectionner les 5 échanges de la Corbeille');
    expect(motToutSelectionner(1)).toBe('Sélectionner les 1 échange de la Corbeille');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LA SÉLECTION
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ la sélection : une case par ligne, la page, puis toute la Corbeille', () => {
  it('la mention est affichée, et il y a une case par ligne', async () => {
    await monter();
    expect(texte()).toContain(MENTION_30_JOURS);
    expect(cases()).toHaveLength(3);
    expect(texte()).toContain('Aucune sélection');
  });

  /** ⚠️ LES CASES N'EXISTENT QUE SOUS LA CORBEILLE : ailleurs, la liste est celle d'avant ce lot. */
  it('🔴 aucune case sous « Réception »', async () => {
    window.history.replaceState(null, '', '/admin/gestion?etiquette=reception');
    await monter();
    expect(cases()).toHaveLength(0);
    expect(texte()).not.toContain(MENTION_30_JOURS);
  });

  it('« Tout sélectionner » coche les lignes de la page', async () => {
    await monter();
    await cliquer(caseTout());
    expect(cases().every((c) => c.checked)).toBe(true);
    // 🔴 LE COMPTE DES MAILS, pas celui des lignes : la 2e ligne en porte deux.
    expect(texte()).toContain('3 sélectionnés');
    expect(texte()).toContain('4 mails');
  });

  /**
   * 🔴 LE LIEN NE PARAÎT QUE QUAND IL AJOUTE QUELQUE CHOSE : la page entière cochée, et la corbeille plus grande
   * que la page (3 lignes affichées, 5 échanges en tout). Le montrer toujours ferait cliquer sans effet.
   */
  it('🔴 le lien « toute la Corbeille » n’apparaît qu’une fois la page cochée', async () => {
    await monter();
    expect(boutonPar(/Sélectionner les 5 échanges/)).toBeUndefined();
    await cliquer(caseTout());
    expect(boutonPar(/Sélectionner les 5 échanges/)).toBeDefined();
    await cliquer(boutonPar(/Sélectionner les 5 échanges/));
    expect(texte()).toContain('5 sélectionnés');
  });

  it('décocher « Tout sélectionner » vide la sélection', async () => {
    await monter();
    await cliquer(caseTout());
    await cliquer(caseTout());
    expect(texte()).toContain('Aucune sélection');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② RÉINTÉGRER  ·  ③ SUPPRIMER
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② « Réintégrer » : aucune confirmation, un bandeau « Annuler »', () => {
  it('les deux boutons sont INACTIFS tant que rien n’est sélectionné', async () => {
    await monter();
    expect((boutonPar(/^Réintégrer$/) as HTMLButtonElement).disabled).toBe(true);
    expect((boutonPar(/Supprimer définitivement/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('🔴 un clic réintègre SANS rien demander, et le geste part avec les échanges cochés', async () => {
    await monter();
    await cliquer(cases()[0]);
    expect((boutonPar(/^Réintégrer$/) as HTMLButtonElement).disabled).toBe(false);
    await cliquer(boutonPar(/^Réintégrer$/));
    const post = postsCorbeille.at(-1);
    expect(post?.corps).toEqual({ filIds: [101], action: 'reintegrer' });
    // Aucune fenêtre de confirmation n'a été montrée : le geste se défait, la question serait du bruit.
    expect(texte()).not.toContain('irréversible');
  });

  it('🔴 le bandeau « Annuler » paraît, et il REMET à la corbeille', async () => {
    await monter();
    await cliquer(cases()[0]);
    await cliquer(boutonPar(/^Réintégrer$/));
    expect(container.querySelector('.pe-corbeille')?.textContent ?? '').toContain('réintégré');
    await cliquer(container.querySelector('.pe-corbeille-annuler'));
    expect(postsCorbeille.at(-1)?.corps).toEqual({ filIds: [101], action: 'corbeille' });
  });
});

describe('🔴 ③ « Supprimer définitivement » : la confirmation est OBLIGATOIRE', () => {
  /**
   * ⚠️ DANS CE JEU D'ESSAI, LE DROIT EST REFUSÉ (c'est l'état réel au 29/09/2026) : le bouton est grisé et
   * s'explique. On le rouvre ci-dessous pour éprouver la confirmation elle-même — le chemin est câblé jusqu'au
   * bout, et il s'activera sans une ligne de code le jour où Arno accorde la portée.
   */
  it('🔴 sans le droit Google, le bouton est DÉSACTIVÉ et dit pourquoi', async () => {
    await monter();
    await cliquer(cases()[0]);
    const b = boutonPar(/Supprimer définitivement/) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(texte()).toContain('droit Google supplémentaire');
    // …et rien n'est parti : aucun geste de suppression n'a pu être demandé.
    expect(postsCorbeille).toHaveLength(0);
  });

  it('avec le droit, un clic OUVRE la confirmation — et n’efface rien', async () => {
    (ETAT_CORBEILLE as { suppressionPossible: boolean }).suppressionPossible = true;
    try {
      await monter();
      await cliquer(cases()[1]); // la ligne à DEUX mails supprimés
      await cliquer(boutonPar(/Supprimer définitivement/));
      // 🔴 LE NOMBRE ANNONCÉ EST CELUI DES MAILS (2), pas celui des lignes (1).
      expect(texte()).toContain(motConfirmation(2));
      expect(postsCorbeille).toHaveLength(0);
    } finally {
      (ETAT_CORBEILLE as { suppressionPossible: boolean }).suppressionPossible = false;
    }
  });

  it('🔴 « Annuler » referme la confirmation sans rien supprimer', async () => {
    (ETAT_CORBEILLE as { suppressionPossible: boolean }).suppressionPossible = true;
    try {
      await monter();
      await cliquer(cases()[0]);
      await cliquer(boutonPar(/Supprimer définitivement/));
      await cliquer([...container.querySelectorAll('.ecb-confirme-actions button')]
        .find((b) => /^Annuler$/.test(b.textContent ?? '')));
      expect(texte()).not.toContain('irréversible');
      expect(postsCorbeille).toHaveLength(0);
    } finally {
      (ETAT_CORBEILLE as { suppressionPossible: boolean }).suppressionPossible = false;
    }
  });

  it('« Supprimer » confirme, et c’est ALORS seulement que le geste part', async () => {
    (ETAT_CORBEILLE as { suppressionPossible: boolean }).suppressionPossible = true;
    try {
      await monter();
      await cliquer(cases()[0]);
      await cliquer(boutonPar(/Supprimer définitivement/));
      await cliquer([...container.querySelectorAll('.ecb-confirme-actions button')]
        .find((b) => /^Supprimer$/.test(b.textContent ?? '')));
      expect(postsCorbeille.at(-1)?.corps).toEqual({ filIds: [101], action: 'supprimer' });
      // 🔴 AUCUN BANDEAU « ANNULER » NE SUIT : il n'y a rien à annuler, et en proposer un serait mentir.
      expect(container.querySelector('.pe-corbeille')).toBeNull();
    } finally {
      (ETAT_CORBEILLE as { suppressionPossible: boolean }).suppressionPossible = false;
    }
  });
});
