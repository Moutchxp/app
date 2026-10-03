// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RattachementsDuFil } from './RattachementsDuFil';
import {
  ENCADRE_EXCEPTION_CE_MAIL, MOT_CHANGER_REGLE_SUIVI, MOT_MODIFIER_BIENS_DU_MAIL,
} from '../../../../lib/gestion/ficheRattachement';

/**
 * ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 2 — LA FENÊTRE, MONTÉE POUR DE VRAI ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « depuis la LIGNE de la Réception (fil 3490), la fenêtre “Bien(s) de cet échange”
 * affiche encore tous les biens proposés pour l'expéditeur (lots 247, 282, 169, 491, 4 — “À trancher”). Ton lot
 * a7f5f968 n'a corrigé que la fenêtre ouverte depuis un mail. »
 *
 * 🔴 LA CAUSE TENAIT EN UNE CONDITION : la fenêtre avait DEUX comportements selon qu'on lui donnait un mail ou
 * non, et celui de la liste rendait la fiche telle quelle — propositions comprises. Ce fichier éprouve qu'il n'y
 * en a plus qu'un, en montant la MÊME fenêtre par les DEUX portes avec les MÊMES données.
 *
 * ═══ CE QU'IL PROTÈGE ════════════════════════════════════════════════════════════════════════════════════════════
 *   ① depuis la ligne de liste ET depuis un mail → les MÊMES biens, et aucune carte « À trancher » ;
 *   ② l'en-tête dit de quel mail on parle : expéditeur, date, objet ;
 *   ③ « Modifier les biens de ce mail » ouvre, DANS LA MÊME FENÊTRE, les propositions (décochées sauf les biens
 *      déjà rattachés), le moteur de recherche, et l'encadré d'exception ;
 *   ④ valider envoie UNE requête — l'exception « ce mail uniquement » — avec les ajouts ET les retraits ;
 *   ⑤ le lien « Changer plutôt la règle de suivi… » ouvre le bloc à DEUX options, avertissement compris.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : un fil inventé, des lots inventés, `fetch` simulé — rien ne sort, rien n'est écrit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Le mail dont la fenêtre parle — celui de la ligne comme celui qu'on a ouvert : c'est le même. */
const MAIL = 8123;

/**
 * 🔴🔴 LA FICHE, À LA FORME DU FIL 3490 : UN bien réellement rattaché (lien confirmé sur ce mail), et DEUX biens
 * que le moteur propose pour l'expéditeur (liens `propose`). C'est exactement ce qu'Arno voyait de trop.
 */
const FICHE = {
  filId: 7, objet: 'Fuite au plafond', nbMailsDuFil: 4, horsGestion: false, messageRecentId: MAIL,
  enTete: {
    messageId: MAIL, de: 'monsieur.invente@exemple.test', deNom: 'Monsieur Inventé',
    recuLe: '2026-10-01T10:46:00Z', objet: 'Devis de réparation',
  },
  disponible: true,
  biens: [
    {
      cle: 'L-484', adresseComplete: '2 rue Fictive, 92400 VILLE-TEST', numeroLot: '484',
      nature: 'Appartement', typeBien: 'Type 2', surfaceM2: null, statut: 'classe',
      dateMail: '2026-10-01', nbMails: 1, dossierDriveId: null, lienIds: [100], personnes: [],
    },
    {
      cle: 'L-247', adresseComplete: '7 rue Inventée, 92400 VILLE-TEST', numeroLot: '247',
      nature: null, typeBien: null, surfaceM2: null, statut: 'a_trancher',
      dateMail: '2026-10-01', nbMails: 1, dossierDriveId: null, lienIds: [200], personnes: [],
    },
    {
      cle: 'L-282', adresseComplete: '9 rue Inventée, 92400 VILLE-TEST', numeroLot: '282',
      nature: null, typeBien: null, surfaceM2: null, statut: 'a_trancher',
      dateMail: '2026-10-01', nbMails: 1, dossierDriveId: null, lienIds: [300], personnes: [],
    },
  ],
};
const lien = (id: number, statut: string) => ({
  id, messageId: MAIL, pieceId: null, cible: { sorte: 'lot', cle: `c${id}`, id },
  libelle: `lien ${id}`, origine: 'manuel', statut, confiance: null, regle: null,
  motif: null, adresses: [], parUnHumain: true, creeLe: null, creePar: null, statutLe: null, statutPar: null,
});
/** 🔴 UN SEUL CONFIRMÉ : les deux autres sont des PROPOSITIONS du moteur. */
const LIENS = [lien(100, 'confirme'), lien(200, 'propose'), lien(300, 'propose')];

const CONTEXTE = {
  messageId: MAIL, filId: 7, dateMail: '2026-10-01', nbMailsDuFil: 4, proprietaire: null,
  examen: { issue: 'a_trancher', motif: 'deux biens possibles' }, pieces: [], disponible: true,
  biens: [
    {
      cle: 'L-484', libelle: '2 rue Fictive — lot 484', adresse: '2 rue Fictive', commune: 'VILLE-TEST',
      typeBien: 'Type 2', nature: 'Appartement', caracteristiques: [],
      adresseComplete: '2 rue Fictive, 92400 VILLE-TEST', parties: [], recommande: true,
      motif: 'locataire en place', cas: 'a', certitude: 'quasi_certaine', replie: false, dejaRattache: true,
    },
    {
      cle: 'L-247', libelle: '7 rue Inventée — lot 247', adresse: '7 rue Inventée', commune: 'VILLE-TEST',
      typeBien: null, nature: null, caracteristiques: [],
      adresseComplete: '7 rue Inventée, 92400 VILLE-TEST', parties: [], recommande: true,
      motif: 'un des biens du propriétaire', cas: 'c', certitude: 'a_trancher', replie: false,
      dejaRattache: false,
    },
  ],
};
const SUIVI = { etat: 'ok', mails: [8120, 8121, 8122, MAIL], periodes: [], exceptions: [] };

let container: HTMLDivElement;
let root: Root;
/** Tout ce qui est ÉCRIT : c'est la moitié de ce que ce fichier protège. */
let ecritures: { url: string; corps: unknown }[];
let lectures: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = []; lectures = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET') !== 'GET') {
      ecritures.push({ url: u, corps: JSON.parse(String(init?.body ?? 'null')) });
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    lectures.push(u);
    if (u.includes('rattachements?fiche=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: FICHE }) } as unknown as Response;
    }
    if (u.includes('rattachements?fil=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: LIENS }) } as unknown as Response;
    }
    if (u.includes('/gestion/suivi')) return { ok: true, json: async () => SUIVI } as unknown as Response;
    if (u.includes('/gestion/classement')) {
      return { ok: true, json: async () => ({ etat: 'ok', contexte: CONTEXTE }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok' }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
/** `messageId` absent = la fenêtre ouverte depuis une LIGNE DE LISTE ; donné = depuis un mail. */
const monter = async (messageId: number | null = null) => {
  await act(async () => {
    root.render(createElement(RattachementsDuFil, {
      filId: 7, titre: 'Fuite au plafond', messageId, onFerme: () => {}, onGeste: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element) => {
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
};
/**
 * ⚠️ UNE CASE SE COCHE PAR `click()`, PAS PAR UN ÉVÉNEMENT FABRIQUÉ. React suit la valeur de chaque champ pour
 * savoir si elle a VRAIMENT changé ; poser `checked` à la main met ce suivi à jour avant l'événement, et React
 * conclut alors que rien n'a bougé — la case revient à son état d'avant au rendu suivant. `click()` exécute le
 * comportement du navigateur (bascule PUIS événements), qui est ce que React attend.
 */
const cocher = async (c: HTMLInputElement) => {
  await act(async () => { c.click(); });
  await calmer();
};
const bouton = (motif: RegExp) =>
  [...container.querySelectorAll('button')].find((b) => motif.test(b.textContent ?? ''));
const cartes = () => [...container.querySelectorAll('.rdf-item')].map((i) => i.textContent ?? '');
const dialogue = () => container.querySelector('[role="dialog"]')?.textContent ?? '';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LES DEUX POINTS D'ENTRÉE, LES MÊMES BIENS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① une seule fenêtre, quel que soit le point d’entrée', () => {
  it('🔴🔴 depuis la LIGNE DE LISTE : seul le bien rattaché, aucune carte « À trancher »', async () => {
    await monter(null);
    expect(cartes()).toHaveLength(1);
    expect(cartes()[0]).toContain('2 rue Fictive, 92400 VILLE-TEST');
    /* 🔴🔴 LE DÉFAUT D'ARNO, NOMMÉ : les lots proposés pour l'expéditeur ne sont plus là. */
    expect(dialogue()).not.toContain('7 rue Inventée');
    expect(dialogue()).not.toContain('9 rue Inventée');
    expect(dialogue()).not.toContain('À trancher');
  });

  it('🔴🔴 depuis un MAIL : exactement la même chose', async () => {
    await monter(MAIL);
    expect(cartes()).toHaveLength(1);
    expect(cartes()[0]).toContain('2 rue Fictive, 92400 VILLE-TEST');
    expect(dialogue()).not.toContain('À trancher');
  });

  /** 🔴 ET LE TITRE EST LE MÊME DES DEUX CÔTÉS : « Bien(s) de cet échange » n'existe plus. */
  it('🔴🔴 un seul titre, et il parle du mail', async () => {
    await monter(null);
    expect(container.querySelector('#rdf-titre')?.textContent).toBe('Bien(s) de ce mail');
  });

  /** 🔴 L'EN-TÊTE DIT DE QUEL MAIL ON PARLE : expéditeur, date, objet (demande d'Arno). */
  it('🔴🔴 en tête : expéditeur, date, objet du mail', async () => {
    await monter(null);
    const tete = container.querySelector('.rdf-entete')?.textContent ?? '';
    expect(tete).toContain('Monsieur Inventé');
    expect(tete).toContain('1 octobre 2026');
    expect(tete).toContain('Devis de réparation');
  });

  /** ⚠️ ET LA FENÊTRE DEMANDE BIEN LE MAIL AU SERVEUR, pour que l'en-tête soit celui-là et pas un autre. */
  it('⚠️ la lecture nomme le mail quand on le connaît', async () => {
    await monter(MAIL);
    expect(lectures.some((u) => u.includes(`rattachements?fiche=7&message=${MAIL}`))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 « MODIFIER LES BIENS DE CE MAIL »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② le grand bouton ouvre les deux zones, dans la même fenêtre', () => {
  const ouvrir = async () => {
    await monter(MAIL);
    const b = bouton(new RegExp(MOT_MODIFIER_BIENS_DU_MAIL));
    expect(b, 'le grand bouton doit être là').toBeDefined();
    await cliquer(b as Element);
  };

  it('🔴🔴 a) les propositions, b) la recherche, c) l’encadré — tout dans la même fenêtre', async () => {
    await ouvrir();
    /* ⚠️ TOUJOURS UNE SEULE BOÎTE DE DIALOGUE : deux fenêtres empilées sont injouables au clavier. */
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    // a) les propositions de l'automatisation
    expect(dialogue()).toContain('propositions de l’automatisation');
    // b) le moteur de recherche, sur TOUS les biens de la base
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    // c) l'encadré, mot pour mot celui d'Arno
    expect(container.querySelector('.rdf-encadre')?.textContent).toBe(ENCADRE_EXCEPTION_CE_MAIL);
  });

  /**
   * 🔴🔴 « DÉCOCHÉES, SAUF LES BIENS DÉJÀ RATTACHÉS, QUI SONT COCHÉS » (Arno).
   *
   * ⚠️ C'EST L'ÉTAT RÉEL DU MAIL QUI COMMANDE, PAS LA RECOMMANDATION DU MOTEUR : dans ce décor, le moteur
   * recommande les DEUX biens (`recommande: true` sur les deux) et un seul est rattaché. Sans cette règle, on
   * rouvrirait la fenêtre avec une case cochée qui ne correspond à rien de posé — et « Valider » l'écrirait.
   */
  it('🔴🔴 pré-coche : les biens DÉJÀ rattachés, et eux seuls', async () => {
    await ouvrir();
    const cases = [...container.querySelectorAll('.mrb input[type="checkbox"], .pdb-item input[type="checkbox"]')];
    const cochees = cases.filter((c) => (c as HTMLInputElement).checked);
    expect(cases.length).toBeGreaterThanOrEqual(2);
    expect(cochees).toHaveLength(1);
  });

  /**
   * ⚠️ ET AUCUN BOUTON QUI MENT : « Hors gestion, ou classer par pièce… » ouvre LA fenêtre de classement, qu'on
   * ne peut pas empiler sur celle-ci (deux boîtes de dialogue sont injouables au clavier). Il n'est donc pas
   * rendu ici — plutôt qu'un bouton qui se contenterait de refermer le panneau.
   */
  it('⚠️ pas de bouton qui ne mène nulle part', async () => {
    await ouvrir();
    expect(bouton(/Hors gestion, ou classer par pièce/)).toBeUndefined();
  });

  /** 🔴 RIEN N'EST ÉCRIT TANT QU'ON N'A PAS VALIDÉ : ouvrir le panneau est un geste de lecture. */
  it('🔴🔴 ouvrir le panneau n’écrit rien', async () => {
    await ouvrir();
    expect(ecritures).toEqual([]);
  });

  /**
   * 🔴🔴 ET VALIDER ENVOIE **UNE** REQUÊTE : l'exception « ce mail uniquement », avec la liste VOULUE.
   *
   * ⚠️ UNE SEULE REQUÊTE POUR LES AJOUTS ET LES RETRAITS. Un `POST` par ajout et un `PATCH` par retrait auraient
   * laissé, en cas d'échec au milieu, un mail à moitié reclassé — et personne pour dire lequel.
   */
  it('🔴🔴 valider pose une EXCEPTION sur ce seul mail, en une requête', async () => {
    await ouvrir();
    // on coche le second bien : la liste voulue devient { L-484, L-247 }
    const cases = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await cocher(cases.find((c) => !c.checked) as HTMLInputElement);
    const valider = bouton(/Valider les biens de ce mail/);
    expect(valider, 'le bouton de validation doit être là').toBeDefined();
    await cliquer(valider as Element);

    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].url).toContain('/api/admin/gestion/suivi');
    const corps = ecritures[0].corps as {
      filId: number; messageId: number; choix: string; classement: { sorte: string; biens: { cle: string }[] };
    };
    expect(corps.filId).toBe(7);
    expect(corps.messageId).toBe(MAIL);
    /* 🔴🔴 « Ce mail uniquement » — le MÊME mécanisme que l'option existante, et c'est lui qui garantit
       « aucune période créée, fermée ou modifiée ». */
    expect(corps.choix).toBe('mail');
    expect(corps.classement.sorte).toBe('biens');
    expect(corps.classement.biens.map((b) => b.cle).sort()).toEqual(['L-247', 'L-484']);
  });

  /**
   * 🔴🔴 LE RETOUR À LA CONFIGURATION DE DÉPART NE PROPOSE RIEN À ÉCRIRE, et la fenêtre le DIT.
   *
   * ⚠️ LA SUPPRESSION DE L'EXCEPTION, ELLE, EST LA RÈGLE DU SERVEUR (règle 2 du lot SUIVI-DERNIER-CHOIX) : elle
   * est éprouvée sur une vraie base dans `visualiserUnifie.itest.ts`. Ici on éprouve ce que l'ÉCRAN en dit.
   */
  it('🔴🔴 sans changement, la fenêtre annonce « Aucun changement » et ne valide pas', async () => {
    await ouvrir();
    expect(container.querySelector('.rdf-bilan')?.textContent).toBe('Aucun changement : rien ne sera écrit.');
    expect((bouton(/Valider les biens de ce mail/) as HTMLButtonElement).disabled).toBe(true);
  });

  /** 🔴 ET LA PHRASE COMPTE LES DEUX SENS : un retrait est un geste, au même titre qu'un ajout. */
  it('🔴 décocher le bien rattaché annonce un RETRAIT', async () => {
    await ouvrir();
    const cochee = ([...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])
      .find((c) => c.checked);
    await cocher(cochee as HTMLInputElement);
    expect(container.querySelector('.rdf-bilan')?.textContent).toBe('1 bien retiré sur ce mail.');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE LIEN « CHANGER PLUTÔT LA RÈGLE DE SUIVI »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ le bloc « Suivi dans la conversation », à deux options', () => {
  const ouvrirSuivi = async () => {
    await monter(MAIL);
    await cliquer(bouton(new RegExp(MOT_MODIFIER_BIENS_DU_MAIL)) as Element);
    await cliquer(bouton(new RegExp(MOT_CHANGER_REGLE_SUIVI)) as Element);
  };

  it('🔴🔴 DEUX options, dans la même fenêtre — et « Ce mail uniquement » n’y est plus', async () => {
    await ouvrirSuivi();
    const choix = [...container.querySelectorAll('.rdf-choix')].map((c) => c.textContent ?? '');
    expect(choix.some((c) => c.includes('Ce mail et la conversation à venir'))).toBe(true);
    expect(choix.some((c) => c.includes('Toute la conversation'))).toBe(true);
    /* ⚠️ PAS DE TROISIÈME OPTION : « Ce mail uniquement » est déjà ce que fait le grand bouton. Deux chemins
       pour un seul geste, c'est exactement ce que ce lot défait. */
    expect(choix.some((c) => c.startsWith('Ce mail uniquement'))).toBe(false);
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  /** 🔴🔴 L'AVERTISSEMENT DE « TOUTE LA CONVERSATION », et sa confirmation obligatoire — comportement existant. */
  it('🔴🔴 « Toute la conversation » avertit, et bloque tant qu’on n’a pas confirmé', async () => {
    await ouvrirSuivi();
    const radios = [...container.querySelectorAll('.rdf-suivi input[type="radio"]')] as HTMLInputElement[];
    await cocher(radios[1]);
    expect(container.querySelector('.rdf-alerte-texte')?.textContent)
      .toContain('mails de cette conversation seront reclassés');
    expect((bouton(/Valider le suivi/) as HTMLButtonElement).disabled).toBe(true);
    expect(dialogue()).toContain('Cochez la confirmation');
  });

  /** 🔴 UNE FOIS CONFIRMÉ, le geste part — et il part avec le choix de suivi, pas avec l'exception. */
  it('🔴🔴 confirmé, il envoie le CHOIX DE SUIVI, pas une exception', async () => {
    await ouvrirSuivi();
    const cases = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await cocher(cases.find((c) => !c.checked) as HTMLInputElement);  // une modification, sinon rien à valider
    await cliquer(bouton(/Valider le suivi/) as Element);
    expect(ecritures).toHaveLength(1);
    expect((ecritures[0].corps as { choix: string }).choix).toBe('suite');
  });
});
