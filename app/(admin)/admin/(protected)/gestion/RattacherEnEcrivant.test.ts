// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RattacherEnEcrivant } from './RattacherEnEcrivant';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';
// 🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — la phrase d'Arno, citée et non recopiée.
import { AUCUNE_PROPOSITION } from '../../../../lib/gestion/classementAvantEnvoi';

/**
 * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — LA MODALE « RATTACHER CE MAIL À… » ════════════════════════════════════════
 *
 * Les règles d'Arno, éprouvées sur le vrai composant monté :
 *   ① LA PRÉ-COCHE suit le moteur, et RIEN d'autre : locataire → son bien ; propriétaire à bien unique → ce bien ;
 *      propriétaire à plusieurs biens → rien, sauf citation dans l'objet ou le texte ;
 *   ② « TOUT SÉLECTIONNER / TOUT DÉSÉLECTIONNER » est UN bouton qui bascule ;
 *   ③ « INTERNE » ET LES BIENS S'EXCLUENT — cocher l'un lève l'autre ;
 *   ④ IGNORER NE VALIDE RIEN : le mail part « à classer », et c'est une sortie nommée.
 *
 * ⚠️ LA PRÉ-COCHE N'EST PAS RECALCULÉE ICI. Elle est LUE dans `recommande`, que le serveur rend — parce que c'est
 * le moteur pur (`proposerBiens`, règles a–e) qui la décide, et qu'une seconde décision côté écran divergerait du
 * MOTIF affiché juste à côté. Ces épreuves vérifient donc qu'on la SUIT, jamais qu'on la refait.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BIEN = (cle: string, recommande: boolean, motif: string) => ({
  cle, libelle: `12 rue Danton, PUTEAUX — lot ${cle}`, adresse: '12 rue Danton', commune: 'PUTEAUX',
  typeBien: 'Appartement', caracteristiques: [], adresseComplete: '12 rue Danton, 92800 PUTEAUX',
  parties: [{ role: 'proprietaire', cle: 'P1', nom: 'MARTY Jean-François', emails: [], telephones: [] }],
  recommande, motif, cas: 'c', certitude: 'a_trancher', dejaRattache: false,
});

let container: HTMLDivElement;
let root: Root;
let contexte: Record<string, unknown>;
let cibles: CibleBrouillon[];
let interneChoisi: boolean;
let ferme: number;
/** Ce que le moteur de recherche de biens rend, pour les épreuves qui s'en servent. */
let biensTrouves: Record<string, unknown>[];
/** 🔴 LOT MODALE-RATTACHER-PROPRE — la fiche d'un bien, telle que la route de l'annuaire la rend à la pastille. */
let ficheLot: Record<string, unknown>;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  cibles = []; interneChoisi = false; ferme = 0;
  contexte = { biens: [], examen: { issue: 'sans_candidat', motif: '' }, proprietaire: null,
    interneDabord: false, disponible: true };
  biensTrouves = [];
  ficheLot = {
    id: 77, numero: '421', nature: 'Appartement meublé', typeBien: 'Type 2', immeuble: null,
    adresse: '28 av. Marceau', commune: 'COURBEVOIE', codePostal: '92400',
    debut: '2021-01-04', fin: null, absent: false, surfaceM2: null, driveDossierId: 'D1',
    proprietaireId: 9, proprietaireCle: 'P9', proprietaireNom: 'GARREAU Gabrielle', proprietaireContacts: [],
    occupations: [{ nom: 'THAI Cécile', entree: '2024-02-01', sortie: null }],
    proprietaires: [{ nom: 'GARREAU Gabrielle' }], occupants: [],
    modifiable: true, suppressionDisponible: true, evenementsOuverts: 0,
  };
  /**
   * 🔴 LOT CLASSER-DEUX-BOUTONS — DEUX ROUTES, ET LE FAUX SERVEUR DOIT LES DISTINGUER : le moteur de propositions
   * (`/classement`) et le moteur de recherche de biens (`/biens`), désormais tous deux dans cette fenêtre.
   */
  global.fetch = vi.fn(async (u: unknown) => {
    const url = String(u);
    // 🔴 LOT MODALE-RATTACHER-PROPRE — la fiche que la pastille « i » demande, par la CLÉ du lot.
    if (url.includes('lotCle=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: ficheLot }) } as unknown as Response;
    }
    if (url.includes('/gestion/biens')) {
      return {
        ok: true, json: async () => ({ etat: 'ok', lignes: biensTrouves, tronque: false, disponible: true }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok', contexte }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (dest = ['locataire@orange.fr']) => {
  await act(async () => {
    root.render(createElement(RattacherEnEcrivant, {
      destinataires: dest, objet: 'Charges', corps: '', pieces: [],
      cibles, onChange: (c) => { cibles = c; },
      onFerme: () => { ferme += 1; },
    }));
  });
  await calmer();
};
const cases = () => [...container.querySelectorAll('.rec-bien input')] as HTMLInputElement[];
const boutonPar = (re: RegExp) =>
  [...container.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '')) as HTMLButtonElement;
const cliquer = async (b: HTMLElement) => {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA PRÉ-COCHE — LES TROIS CAS D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① la pré-coche suit le moteur, et rien d’autre', () => {
  it('🔴 LOCATAIRE : son bien, coché d’avance', async () => {
    contexte.biens = [BIEN('134', true, 'locataire en place à la date du mail (locataire@orange.fr)')];
    await monter();
    expect(cases().map((c) => c.checked)).toEqual([true]);
    expect(container.textContent).toContain('locataire en place');
  });

  it('🔴 PROPRIÉTAIRE À UN SEUL BIEN : ce bien, coché d’avance', async () => {
    contexte.biens = [BIEN('315', true, 'ABDELLATIF Névine n’a qu’un bien en gestion')];
    await monter(['proprio@free.fr']);
    expect(cases().map((c) => c.checked)).toEqual([true]);
    expect(container.textContent).toContain('n’a qu’un bien en gestion');
  });

  /**
   * 🔴 L'ÉPREUVE QUI COMPTE LE PLUS. Un rattachement automatique est une décision que personne ne relit : il ne se
   * pose que lorsqu'il n'existe qu'UNE lecture possible. Trois biens du même bailleur, sans rien qui tranche, ne
   * doivent RIEN cocher — un clic contre une erreur silencieuse dans l'historique d'un client.
   */
  it('🔴 PROPRIÉTAIRE À PLUSIEURS BIENS : tous proposés, AUCUN coché', async () => {
    contexte.biens = [
      BIEN('24', false, 'un des 3 biens de ARMAND Jacques'),
      BIEN('61', false, 'un des 3 biens de ARMAND Jacques'),
      BIEN('316', false, 'un des 3 biens de ARMAND Jacques'),
    ];
    await monter(['bailleur@free.fr']);
    expect(cases()).toHaveLength(3);
    expect(cases().every((c) => !c.checked)).toBe(true);
    expect(container.querySelector('.rec-compte')?.textContent).toContain('0 bien(s) coché(s) sur 3');
  });

  it('🔴 …SAUF si le lot est CITÉ : celui-là seul est coché', async () => {
    contexte.biens = [
      BIEN('316', true, 'n° de lot cité dans le mail — un des 3 biens de ARMAND Jacques'),
      BIEN('24', false, 'un des 3 biens de ARMAND Jacques'),
    ];
    await monter(['bailleur@free.fr']);
    expect(cases().map((c) => c.checked)).toEqual([true, false]);
    expect(container.textContent).toContain('n° de lot cité dans le mail');
  });

  /** ⚠️ LE MOTIF EST ÉCRIT EN CLAIR SUR CHAQUE CARTE : on doit pouvoir trancher sans rouvrir le code. */
  it('⚠️ chaque bien porte son motif, et ses parties', async () => {
    contexte.biens = [BIEN('134', true, 'locataire en place à la date du mail')];
    await monter();
    expect(container.querySelector('.rec-motif')?.textContent).toContain('locataire en place');
    expect(container.textContent).toContain('MARTY Jean-François');
    expect(container.textContent).toContain('propriétaire');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② TOUT SÉLECTIONNER / TOUT DÉSÉLECTIONNER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② « Tout sélectionner » est UN bouton qui bascule', () => {
  beforeEach(() => {
    contexte.biens = [BIEN('24', false, 'm'), BIEN('61', false, 'm'), BIEN('316', false, 'm')];
  });

  it('🔴 il coche tout, puis décoche tout, et son MOT suit', async () => {
    await monter(['bailleur@free.fr']);
    expect(boutonPar(/Sélectionner tous les biens/)).toBeDefined();

    await cliquer(boutonPar(/Sélectionner tous les biens/));
    expect(cases().every((c) => c.checked)).toBe(true);
    // 🔴 LE MOT CHANGE : deux boutons séparés laisseraient toujours l'un des deux sans effet.
    expect(boutonPar(/Désélectionner tous les biens/)).toBeDefined();

    await cliquer(boutonPar(/Désélectionner tous les biens/));
    expect(cases().every((c) => !c.checked)).toBe(true);
    expect(boutonPar(/Sélectionner tous les biens/)).toBeDefined();
  });

  it('le compte affiché suit les cases, toujours', async () => {
    await monter(['bailleur@free.fr']);
    await cliquer(cases()[1]);
    expect(container.querySelector('.rec-compte')?.textContent).toContain('1 bien(s) coché(s) sur 3');
    await cliquer(boutonPar(/Sélectionner tous les biens/));
    expect(container.querySelector('.rec-compte')?.textContent).toContain('3 bien(s) coché(s) sur 3');
  });

  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — QUAND IL N'Y A RIEN, ON DIT QUOI FAIRE ══════════════
   *
   * ARNO (01/10/2026), au mot près : « Aucune proposition disponible pour ce mail. Utilise le moteur de recherche
   * ci-dessous pour sélectionner le ou les biens en relation avec ce mail. » La phrase remplace « 0 bien(s)
   * coché(s) sur 0 affiché(s) » — un compteur qui ne comptait rien et donnait à une fenêtre vide l'air d'une
   * fenêtre pleine.
   */
  it('🔴🔴 aucun bien proposé : la phrase d’Arno, et aucun compteur à zéro', async () => {
    contexte.biens = [];
    await monter();
    const dit = container.querySelector('.rec-compte')?.textContent ?? '';
    expect(dit).toBe(AUCUNE_PROPOSITION);
    expect(dit).not.toContain('0 bien(s)');
    expect(boutonPar(/Sélectionner tous les biens/)).toBeUndefined();
    // …et aucune case à cocher dans la carte des propositions.
    expect(container.querySelectorAll('.rec-biens input[type="checkbox"]')).toHaveLength(0);
  });

  /** 🔴 « Le curseur se place directement dans le champ du moteur de recherche » (Arno). */
  it('🔴🔴 le curseur part dans le champ de recherche', async () => {
    contexte.biens = [];
    await monter();
    expect(document.activeElement).toBe(container.querySelector('.rec-saisie'));
  });

  /** ⚠️ ET DÈS QU'IL Y A QUELQUE CHOSE À COCHER, le compteur et la bascule reviennent. */
  it('⚠️ avec un bien proposé, le compteur et la bascule sont là', async () => {
    await monter();
    expect(container.querySelector('.rec-compte')?.textContent).toContain('bien(s) coché(s)');
    expect(boutonPar(/les biens/)).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — « INTERNE » A QUITTÉ CETTE FENÊTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CE QU'IL Y AVAIT : un bouton « Interne — échange entre collègues » en bas de cette modale. Il obligeait à
   ouvrir une fenêtre de RATTACHEMENT pour dire qu'il n'y avait rien à rattacher.

   🔴 IL EST DEVENU LE GROS BOUTON BLANC du bloc « Classer ce mail » (demande d'Arno), où il se voit sans ouvrir
   quoi que ce soit. Sa règle d'exclusion avec les biens n'a pas bougé d'un mot — elle est éprouvée là-bas
   (`ChampClassement.test.ts`), sur le composant qui la porte désormais.
*/

describe('🔴 ③ « Interne » n’est plus dans cette fenêtre', () => {
  it('🔴 aucun bouton « Interne » dans la modale de rattachement', async () => {
    contexte.biens = [BIEN('134', true, 'locataire en place')];
    await monter();
    expect([...container.querySelectorAll('button')]
      .some((b) => /^Interne/.test(b.textContent ?? ''))).toBe(false);
  });

  /**
   * ⚠️ CE QUI RESTE : la MENTION « tous les destinataires sont de la maison », qui est une INFORMATION du
   * serveur, pas un bouton. La retirer aurait fait perdre le seul endroit où l'on apprend ce fait.
   */
  it('⚠️ la mention « tous de la maison » reste — c’est un renseignement, pas une décision', async () => {
    contexte.interneDabord = true;
    await monter(['a.jorel@sansvisavis.com']);
    expect(container.querySelector('.rec-interne-dabord')?.textContent).toContain('interne');
  });

  it('destinataires mêlés : la mention n’apparaît pas', async () => {
    contexte.interneDabord = false;
    await monter(['a.jorel@sansvisavis.com', 'locataire@orange.fr']);
    expect(container.querySelector('.rec-interne-dabord')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ VALIDER, ET IGNORER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ valider écrit les cibles ; ignorer n’écrit rien', () => {
  it('🔴 valider rend TOUS les biens cochés', async () => {
    contexte.biens = [BIEN('24', false, 'm'), BIEN('61', false, 'm')];
    await monter(['bailleur@free.fr']);
    await cliquer(cases()[0]);
    await cliquer(cases()[1]);
    await cliquer(boutonPar(/^Valider/));
    expect(cibles.map((c) => c.cle).sort()).toEqual(['24', '61']);
    expect(cibles.every((c) => c.sorte === 'lot')).toBe(true);
    expect(ferme).toBe(1);
  });

  /**
   * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — FERMER SANS CHOISIR : LA CROIX ET « ÉCHAP » ════════════════════════════
   *
   * CE QU'IL Y AVAIT : un bouton « Ignorer — envoyer à classer », dans le pied, à côté du seul bouton qui pose
   * une décision. Il prenait la place d'un choix pour dire qu'on n'en faisait pas.
   *
   * 🔴 LES DEUX SORTIES D'ARNO LE REMPLACENT, et elles ne changent RIEN : « Rien n'est changé et le bloc reste
   * à l'état initial ».
   */
  it('🔴 la CROIX ferme sans rien écrire', async () => {
    contexte.biens = [BIEN('134', true, 'locataire en place')];
    await monter();
    // La case est pré-cochée : si la croix validait, on le verrait tout de suite dans `cibles`.
    expect(cases()[0].checked).toBe(true);
    const croix = container.querySelector('.rec-croix') as HTMLButtonElement;
    expect(croix, 'la croix doit exister').not.toBeNull();
    await cliquer(croix);
    expect(cibles).toEqual([]);
    expect(ferme).toBe(1);
  });

  it('🔴 « Échap » ferme sans rien écrire non plus', async () => {
    contexte.biens = [BIEN('134', true, 'locataire en place')];
    await monter();
    const boite = container.querySelector('[role="dialog"]') as HTMLElement;
    await act(async () => {
      boite.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await calmer();
    expect(cibles).toEqual([]);
    expect(ferme).toBe(1);
  });

  it('⚠️ et « Ignorer » a bien disparu du pied', async () => {
    await monter();
    expect([...container.querySelectorAll('button')]
      .some((b) => /^Ignorer/.test(b.textContent ?? ''))).toBe(false);
  });

  /**
   * ⚠️ LES CIBLES QUI NE SONT PAS DES LOGEMENTS SONT CONSERVÉES. Un événement choisi dans « Classer ce mail » n'a
   * rien à faire dans cette fenêtre, et valider ici ne doit pas l'effacer.
   */
  it('⚠️ un ÉVÉNEMENT déjà choisi survit à la validation', async () => {
    cibles = [{ sorte: 'evenement' as const, cle: null, id: 12, libelle: 'GES-2026-000012' }];
    contexte.biens = [BIEN('134', true, 'locataire en place')];
    await monter();
    await cliquer(boutonPar(/^Valider/));
    expect(cibles.some((c) => c.sorte === 'evenement' && c.id === 12)).toBe(true);
    expect(cibles.some((c) => c.sorte === 'lot' && c.cle === '134')).toBe(true);
  });

  /** ⚠️ ET LES CIBLES DÉJÀ RETENUES RESTENT COCHÉES : rouvrir la modale ne décoche jamais un choix fait. */
  it('⚠️ rouvrir la modale ne décoche pas un bien déjà retenu', async () => {
    cibles = [{ sorte: 'lot' as const, cle: '61', id: null, libelle: '12 rue Danton, PUTEAUX — lot 61' }];
    contexte.biens = [BIEN('24', false, 'm'), BIEN('61', false, 'm')];
    await monter(['bailleur@free.fr']);
    expect(cases().map((c) => c.checked)).toEqual([false, true]);
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — « LE BOUTON RESTE BLOQUÉ À 1 » ════════════════════════════════════════
 *
 * CONSTAT D'ARNO : « le bouton reste bloqué à “1” alors que rien n'est coché dans la liste visible ».
 *
 * LA CAUSE, rejouée ici avant d'être corrigée : un bien DÉJÀ RETENU que le moteur ne propose pas était
 * PRÉ-COCHÉ (il entre dans la pré-coche par `dejaLa`) mais N'AVAIT AUCUNE CASE dans la liste. Il était donc
 * compté par le bouton, invisible à l'œil, et hors d'atteinte de « Tout désélectionner », qui ne parcourait que
 * les lignes affichées.
 *
 * ⚠️ ET IL Y AVAIT PIRE, SILENCIEUX : `valider` écartait les clés absentes de la liste visible — ce bien aurait
 * donc été RETIRÉ à la validation, sans que rien ne le dise.
 */
describe('🔴🔴 ⑤bis un bien déjà retenu que le moteur ne propose pas', () => {
  const DEJA: CibleBrouillon = {
    sorte: 'lot', cle: 'Z9', id: null, libelle: '9 rue Ancienne — lot Z9', categorie: 'parking',
  };

  it('🔴🔴 il a SA CASE dans la liste, cochée — plus jamais compté sans être visible', async () => {
    cibles = [DEJA];
    contexte = { ...contexte, biens: [BIEN('100', false, 'un des 3 biens')] };
    await monter();
    expect(cases()).toHaveLength(2);
    expect(container.textContent).toContain('9 rue Ancienne — lot Z9');
    // Le motif distingue les deux sources : on ne décoche pas à l'aveugle.
    expect(container.textContent).toContain('déjà rattaché');
    expect(boutonPar(/Valider/).textContent).toContain('1 bien(s)');
  });

  it('🔴🔴 on peut le DÉCOCHER, et le compteur tombe à zéro', async () => {
    cibles = [DEJA];
    await monter();
    expect(boutonPar(/Valider/).textContent).toContain('1 bien(s)');
    await cliquer(cases()[0]);
    expect(boutonPar(/Valider/).textContent).toBe('Valider — aucun bien');
  });

  /** 🔴 « Tout désélectionner » l'atteint désormais : il fait partie de la liste. */
  it('🔴 « Tout désélectionner » le décoche aussi', async () => {
    cibles = [DEJA];
    contexte = { ...contexte, biens: [BIEN('100', true, 'locataire')] };
    await monter();
    expect(boutonPar(/Valider/).textContent).toContain('2 bien(s)');
    await cliquer(boutonPar(/^Désélectionner tous les biens$/));
    expect(boutonPar(/Valider/).textContent).toBe('Valider — aucun bien');
  });

  /** 🔴🔴 ET IL SURVIT À LA VALIDATION, avec sa catégorie : il n'est plus écarté en silence. */
  it('🔴🔴 valider le garde — il n’est plus perdu en chemin', async () => {
    cibles = [DEJA];
    await monter();
    await cliquer(boutonPar(/Valider/));
    expect(cibles).toEqual([DEJA]);
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — VALIDER À ZÉRO EST UNE DÉCISION ═══════════════════════════════════════
 *
 * ARNO : « À 0, le bouton reste actif et s'intitule “Valider — aucun bien” : valider retire tous les
 * rattachements et ramène les deux boutons rouge et blanc. On peut alors choisir “Interne”. »
 */
describe('🔴🔴 valider à 0 bien', () => {
  it('🔴 le bouton est ACTIF et dit « aucun bien »', async () => {
    await monter();
    const b = boutonPar(/^Valider/);
    expect(b.textContent).toBe('Valider — aucun bien');
    expect(b.disabled).toBe(false);
  });

  it('🔴🔴 valider à zéro retire TOUS les biens — et la fenêtre se ferme', async () => {
    cibles = [
      { sorte: 'lot', cle: 'A', id: null, libelle: 'A' },
      { sorte: 'lot', cle: 'B', id: null, libelle: 'B' },
    ];
    await monter();
    for (const c of cases()) if (c.checked) await cliquer(c);
    expect(boutonPar(/^Valider/).textContent).toBe('Valider — aucun bien');
    await cliquer(boutonPar(/^Valider/));
    expect(cibles).toEqual([]);
    expect(ferme).toBe(1);
  });

  /** ⚠️ UN ÉVÉNEMENT CHOISI AILLEURS SURVIT : valider à zéro parle des BIENS, pas de tout le classement. */
  it('⚠️ un événement déjà choisi n’est pas emporté', async () => {
    cibles = [
      { sorte: 'lot', cle: 'A', id: null, libelle: 'A' },
      { sorte: 'evenement', cle: null, id: 7, libelle: 'Visite' },
    ];
    await monter();
    for (const c of cases()) if (c.checked) await cliquer(c);
    await cliquer(boutonPar(/^Valider/));
    expect(cibles).toEqual([{ sorte: 'evenement', cle: null, id: 7, libelle: 'Visite' }]);
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA CATÉGORIE VOYAGE AVEC LA CIBLE ═════════════════════════════════════
 *
 * La case verte écrit « 1 logement + 1 parking ». Ce compte ne peut pas se faire à l'affichage : l'écran ne
 * connaît ni l'annuaire ni les natures. La catégorie est donc posée ICI, là où la nature du lot est connue.
 */
describe('🔴🔴 la catégorie est posée à la validation', () => {
  it('🔴 un bien proposé part avec sa catégorie, déduite de sa NATURE', async () => {
    contexte = { ...contexte, biens: [
      { ...BIEN('360', true, 'locataire'), nature: 'Appartement meublé' },
      { ...BIEN('397', true, 'même propriétaire'), nature: 'Parking' },
    ] };
    await monter();
    await cliquer(boutonPar(/^Valider/));
    expect(cibles.map((c) => c.categorie)).toEqual(['logement', 'parking']);
  });

  /** 🔴 LE CAS RÉEL D'ARNO : lots 360 + 397 de Mme THAI ⇒ « 1 logement + 1 parking ». */
  it('🔴🔴 le cas réel : 360 + 397 donnent bien un logement et un parking', async () => {
    contexte = { ...contexte, biens: [
      { ...BIEN('360', true, 'locataire'), nature: 'Appartement meublé', typeBien: 'Type 2' },
      { ...BIEN('397', true, 'même propriétaire'), nature: 'Parking', typeBien: 'Garage' },
    ] };
    await monter();
    await cliquer(boutonPar(/^Valider/));
    const { resumeParCategorie } = await import('../../../../lib/gestion/categorieBien');
    expect(resumeParCategorie(cibles)).toBe('1 logement + 1 parking');
  });
});

/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — ① LE DOUBLE COMPTE ═════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO : « le lot 432 est coché dans PROPOSITIONS et à nouveau dans les résultats du MOTEUR DE
 * RECHERCHE. Le compteur affiche “2 bien(s) coché(s)” […] alors qu'il n'y a qu'UN bien. »
 *
 * 🔴 CE QU'ON A TROUVÉ EN LE REJOUANT, ET QUI EST PLUS SUBTIL QUE « le compteur compte deux fois ». Le même bien
 * était AFFICHÉ DEUX FOIS — une fois en haut, une fois dans les résultats — et rien ne disait que les deux cases
 * n'en faisaient qu'une. Le compte, lui, était juste : il additionnait le bien cherché et une proposition déjà
 * cochée. Mais en voyant le bien deux fois ET le chiffre deux, on conclut qu'il est compté deux fois. Le défaut
 * n'était pas dans le calcul, il était dans ce que l'écran laissait croire — ce qui revient au même pour qui
 * valide un classement.
 *
 * 🔴 LA SÉLECTION EST DÉSORMAIS UN ENSEMBLE (`Set`), et le résultat déjà montré en haut le DIT.
 */
describe('🔴🔴 ⑥ un bien ne se compte jamais deux fois', () => {
  /**
   * 🔴🔴 LE TEST QUI ÉCHOUE SUR LE CODE D'AVANT : la mention « déjà dans la sélection » n'existait pas, et rien
   * ne reliait les deux apparitions du même bien.
   */
  it('🔴🔴 un résultat déjà montré en haut porte « déjà dans la sélection »', async () => {
    contexte.biens = [BIEN('432', true, 'locataire de ce bien')];
    biensTrouves = [TROUVE('432')];
    await monter();
    await taper('manessier');
    const ligne = container.querySelector('.rec-ligne');
    expect(ligne?.textContent).toContain('déjà dans la sélection');
    expect(ligne?.className).toContain('rec-ligne--deja');
  });

  /** 🔴 ET IL NE CRÉE AUCUNE SECONDE ENTRÉE EN HAUT : une seule ligne pour ce bien dans les propositions. */
  it('🔴🔴 aucune seconde entrée en haut, et le compteur reste à UN', async () => {
    contexte.biens = [BIEN('432', true, 'locataire de ce bien')];
    biensTrouves = [TROUVE('432')];
    await monter();
    await taper('manessier');
    expect(container.querySelectorAll('.rec-bien')).toHaveLength(1);
    expect(container.querySelector('.rec-compte')?.textContent).toContain('1 bien(s) coché(s) sur 1 affiché(s)');
    expect(boutonPar(/^Valider/).textContent).toBe('Valider — 1 bien(s)');
  });

  /**
   * 🔴🔴 « UNE SEULE CASE LOGIQUE : cocher ou décocher l'une met à jour l'autre instantanément » (Arno).
   */
  it('🔴🔴 décocher depuis les RÉSULTATS décoche aussi en haut, et inversement', async () => {
    contexte.biens = [BIEN('432', true, 'locataire de ce bien')];
    biensTrouves = [TROUVE('432')];
    await monter();
    await taper('manessier');
    const enHaut = () => (container.querySelector('.rec-bien input') as HTMLInputElement);
    const enBas = () => (container.querySelector('.rec-ligne input') as HTMLInputElement);
    expect([enHaut().checked, enBas().checked]).toEqual([true, true]);

    await cliquer(enBas());
    expect([enHaut().checked, enBas().checked]).toEqual([false, false]);
    expect(boutonPar(/^Valider/).textContent).toBe('Valider — aucun bien');

    await cliquer(enHaut());
    expect([enHaut().checked, enBas().checked]).toEqual([true, true]);
    expect(boutonPar(/^Valider/).textContent).toBe('Valider — 1 bien(s)');
  });

  /** 🔴 ET LA VALIDATION N'EN POSE QU'UN : l'ensemble ne peut pas rendre deux fois la même clé. */
  it('🔴🔴 valider ne rend qu’UNE cible pour ce bien', async () => {
    contexte.biens = [BIEN('432', true, 'locataire')];
    biensTrouves = [TROUVE('432')];
    await monter();
    await taper('manessier');
    await cliquer(boutonPar(/^Valider/));
    expect(cibles.map((c) => c.cle)).toEqual(['432']);
  });

  /** ⚠️ UN BIEN RÉELLEMENT NOUVEAU, LUI, REJOINT BIEN LA LISTE DU HAUT — rien n'est cassé de ce côté. */
  it('⚠️ un résultat qui n’est PAS en haut l’y fait entrer, une seule fois', async () => {
    contexte.biens = [BIEN('134', false, 'motif')];
    biensTrouves = [TROUVE('432')];
    await monter();
    await taper('manessier');
    expect(container.querySelector('.rec-ligne')?.textContent).not.toContain('déjà dans la sélection');
    await cliquer(container.querySelector('.rec-ligne input') as HTMLInputElement);
    expect(container.querySelectorAll('.rec-bien')).toHaveLength(2);
    expect(container.querySelector('.rec-ligne')?.textContent).toContain('déjà dans la sélection');
    expect(boutonPar(/^Valider/).textContent).toBe('Valider — 1 bien(s)');
  });
});

/**
 * ══ 🔴🔴 ⑦ LA BASCULE PORTE SUR TOUT CE QUI EST VISIBLE ════════════════════════════════════════════════════════
 *
 * ARNO : « “Sélectionner tous les biens” quand au moins un bien visible n'est pas coché, “Désélectionner tous
 * les biens” quand tous le sont. Il porte sur les biens proposés ET sur les résultats de recherche affichés. »
 */
describe('🔴🔴 ⑦ un seul lien qui bascule, sur les propositions ET les résultats', () => {
  it('🔴🔴 il coche AUSSI les résultats de recherche', async () => {
    contexte.biens = [BIEN('134', false, 'motif')];
    biensTrouves = [TROUVE('421'), TROUVE('432')];
    await monter();
    await taper('marceau');
    expect(boutonPar(/^Sélectionner tous les biens$/)).toBeDefined();

    await cliquer(boutonPar(/^Sélectionner tous les biens$/));
    const toutes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(toutes.every((c) => c.checked)).toBe(true);
    expect(boutonPar(/^Valider/).textContent).toBe('Valider — 3 bien(s)');
  });

  it('🔴 puis il les décoche tous, et son MOT suit', async () => {
    contexte.biens = [BIEN('134', false, 'motif')];
    biensTrouves = [TROUVE('421')];
    await monter();
    await taper('marceau');
    await cliquer(boutonPar(/^Sélectionner tous les biens$/));
    expect(boutonPar(/^Désélectionner tous les biens$/)).toBeDefined();
    await cliquer(boutonPar(/^Désélectionner tous les biens$/));
    const toutes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(toutes.every((c) => !c.checked)).toBe(true);
    expect(boutonPar(/^Sélectionner tous les biens$/)).toBeDefined();
  });

  /** ⚠️ « VISIBLE » EST LE MOT : un résultat qu'on n'a pas cherché n'est pas coché d'un clic. */
  it('⚠️ il ne touche à rien d’invisible', async () => {
    contexte.biens = [BIEN('134', false, 'motif')];
    biensTrouves = [TROUVE('421')];
    await monter();
    await cliquer(boutonPar(/^Sélectionner tous les biens$/));
    expect(boutonPar(/^Valider/).textContent).toBe('Valider — 1 bien(s)');
  });
});

/**
 * ══ 🔴🔴 ⑧ LA PASTILLE « i » ══════════════════════════════════════════════════════════════════════════════════
 *
 * ARNO : « À côté du titre de chaque bien, une petite pastille “i”. […] Cliquer la pastille ne coche ni ne
 * décoche le bien. […] Fermeture par la croix, par Échap ou par un clic à l'extérieur. »
 */
describe('🔴🔴 ⑧ la pastille d’information', () => {
  const pastille = () => container.querySelector('.ifb-pastille') as HTMLButtonElement;
  /**
   * 🔴 LOT BULLE-INFO-ET-S12 — LA BULLE N'EST PLUS DANS LE CONTENEUR, ET C'EST LE CORRECTIF LUI-MÊME.
   * Elle est rendue par un PORTAIL dans `document.body`, pour qu'aucun bloc à `overflow` ne la coupe : on la
   * cherche donc dans le document. Un sélecteur resté sur `container` dirait « fermée » alors qu'elle est ouverte.
   */
  const fenetre = () => document.querySelector('.ifb-bulle');

  it('🔴 chaque bien proposé porte une pastille', async () => {
    contexte.biens = [BIEN('421', false, 'm'), BIEN('432', false, 'm')];
    await monter();
    expect(container.querySelectorAll('.rec-bien .ifb-pastille')).toHaveLength(2);
  });

  it('🔴 un clic l’ouvre, et la fiche s’y affiche', async () => {
    contexte.biens = [BIEN('421', false, 'm')];
    await monter();
    expect(fenetre()).toBeNull();
    await cliquer(pastille());
    expect(fenetre()).not.toBeNull();
    const texte = fenetre()?.textContent ?? '';
    expect(texte).toContain('Appartement meublé');
    // 🔴🔴 LE NUMÉRO DE LOT EST ICI — c'est la contrepartie exacte de son retrait du titre.
    expect(texte).toContain('421');
    expect(texte).toContain('GARREAU Gabrielle');
    expect(texte).toContain('THAI Cécile');
    expect(texte).toContain('Ouvrir la fiche du bien');
  });

  /** 🔴🔴 « Cliquer la pastille ne coche ni ne décoche le bien » — la pastille vit DANS le libellé de la case. */
  it('🔴🔴 l’ouvrir ne coche PAS le bien, la fermer non plus', async () => {
    contexte.biens = [BIEN('421', false, 'pas de pré-coche')];
    await monter();
    const laCase = () => (container.querySelector('.rec-bien input') as HTMLInputElement);
    expect(laCase().checked).toBe(false);

    await cliquer(pastille());
    expect(laCase().checked).toBe(false);
    await cliquer(document.querySelector('.ifb-croix') as HTMLElement);
    expect(laCase().checked).toBe(false);
    expect(fenetre()).toBeNull();
  });

  it('🔴 « Échap » la ferme', async () => {
    contexte.biens = [BIEN('421', false, 'm')];
    await monter();
    await cliquer(pastille());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await calmer();
    expect(fenetre()).toBeNull();
  });

  it('🔴 un clic à l’extérieur la ferme aussi', async () => {
    contexte.biens = [BIEN('421', false, 'm')];
    await monter();
    await cliquer(pastille());
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await calmer();
    expect(fenetre()).toBeNull();
  });

  /**
   * 🔴🔴 UNE SEULE FENÊTRE À LA FOIS. Constaté à l'écran : ouvrir une seconde pastille laissait les deux
   * descriptifs ouverts, superposés. Deux fiches côte à côte, c'est deux fois la question « de quel bien
   * parle-t-on ? ».
   */
  it('🔴🔴 ouvrir une seconde pastille ferme la première', async () => {
    contexte.biens = [BIEN('421', false, 'm'), BIEN('432', false, 'm')];
    await monter();
    const pastilles = [...container.querySelectorAll('.ifb-pastille')] as HTMLButtonElement[];
    await cliquer(pastilles[0]);
    expect(document.querySelectorAll('.ifb-bulle')).toHaveLength(1);
    await cliquer(pastilles[1]);
    expect(document.querySelectorAll('.ifb-bulle')).toHaveLength(1);
  });

  /** ⚠️ ELLE NE CHARGE QU'À L'OUVERTURE : quarante biens ne font pas quarante requêtes. */
  it('⚠️ aucune lecture de fiche tant qu’on n’ouvre pas', async () => {
    contexte.biens = [BIEN('421', false, 'm'), BIEN('432', false, 'm')];
    await monter();
    const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(appels.some((c) => String(c[0]).includes('lotCle='))).toBe(false);
    await cliquer(pastille());
    expect(appels.some((c) => String(c[0]).includes('lotCle='))).toBe(true);
  });
});

describe('⑤ la demande au serveur', () => {
  /**
   * 🔴 UN `POST`, ET LES DESTINATAIRES DANS LE CORPS — jamais dans l'adresse. La question porte sur des adresses
   * électroniques, un objet et un corps en cours de frappe : les mettre dans l'URL y écrirait des données
   * personnelles, et les ferait entrer dans les journaux du serveur et l'historique du navigateur.
   */
  it('🔴 aucune donnée personnelle dans l’adresse de la requête', async () => {
    await monter(['locataire@orange.fr']);
    const appel = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(appel[0]).toBe('/api/admin/gestion/classement');
    expect(appel[0]).not.toContain('@');
    expect(appel[1].method).toBe('POST');
    const corps = JSON.parse(String(appel[1].body));
    expect(corps.destinataires).toEqual(['locataire@orange.fr']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — LE MOTEUR DE RECHERCHE, DANS LA MODALE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   Il était derrière un lien « + Ajouter un autre bien » qui ouvrait une SECONDE fenêtre par-dessus celle-ci : on
   perdait de vue les propositions au moment précis où l'on cherchait ce qu'elles n'avaient pas trouvé.

   🔴 C'EST LE MOTEUR EXISTANT, pas un second : même route (`/api/admin/gestion/biens`), mêmes groupes
   (« Par adresse » / « Par nom ou coordonnée »), mêmes raisons de correspondance. Seule la LIGNE change.
*/
const TROUVE = (cle: string, o: Record<string, unknown> = {}) => ({
  cle, libelle: `28 av. Marceau — lot ${cle}`, adresse: '28 av. Marceau', nature: null, typeBien: 'Appartement',
  // 🔴 LOT MODALE-RATTACHER-PROPRE — la voie et la commune, séparées : c'est d'elles que le TITRE se compose.
  adresseVoie: '28 av. Marceau', commune: 'COURBEVOIE',
  parties: [{ role: 'proprietaire', cle: 'P9', nom: 'GARREAU', emails: [], telephones: [] },
    { role: 'locataire', cle: 'L9', nom: 'THAI', emails: [], telephones: [] }],
  raisons: [{ sorte: 'adresse', detail: '28 av. Marceau' }],
  ...o,
});

const taper = async (texte: string) => {
  const champ = container.querySelector('.rec-saisie') as HTMLInputElement;
  expect(champ, 'le champ de recherche doit exister').not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(champ, texte);
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // ⚠️ La recherche est DIFFÉRÉE de 250 ms (une requête par lettre serait une requête de trop) : on attend.
  await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
  await calmer();
};

describe('🔴🔴 ⑤ la recherche est DANS la modale, toujours visible', () => {
  it('🔴 le champ et sa légende sont là dès l’ouverture, sans rien cliquer', async () => {
    await monter();
    expect(container.querySelector('.rec-saisie')).not.toBeNull();
    // 🔴 LA LÉGENDE EST AU-DESSUS DU CHAMP, jamais dedans : un texte d'aide qui disparaît à la première lettre
    //   n'aide qu'avant qu'on en ait besoin.
    expect(container.querySelector('.rec-legende')?.textContent).toContain('Adresse');
  });

  it('⚠️ et le lien « + Ajouter un autre bien » a disparu — il ouvrait une seconde fenêtre', async () => {
    await monter();
    expect(container.textContent).not.toContain('Ajouter un autre bien');
  });

  it('🔴 un résultat porte l’adresse, le type, le PROPRIÉTAIRE et le LOCATAIRE', async () => {
    biensTrouves = [TROUVE('421')];
    await monter();
    await taper('marceau');
    const ligne = container.querySelector('.rec-ligne');
    // 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LE TITRE N'A PLUS DE NUMÉRO DE LOT : « adresse — qualité ».
    expect(ligne?.textContent).toContain('28 av. Marceau, COURBEVOIE — Appartement');
    expect(ligne?.textContent).not.toContain('lot 421');
    expect(ligne?.textContent).toContain('GARREAU');
    expect(ligne?.textContent).toContain('THAI');
  });

  /** 🔴 « VACANT » EST UN MOT, JAMAIS UN BLANC : c'est un fait, et souvent celui qui fait trancher. */
  it('🔴 un bien sans locataire dit « Vacant »', async () => {
    biensTrouves = [TROUVE('421', { parties: [{ role: 'proprietaire', cle: 'P9', nom: 'GARREAU' }] })];
    await monter();
    await taper('marceau');
    expect(container.querySelector('.rec-ligne')?.textContent).toContain('Vacant');
  });

  it('🔴 les deux groupes du moteur sont titrés', async () => {
    biensTrouves = [TROUVE('421')];
    await monter();
    await taper('marceau');
    expect(container.querySelector('.rec-groupe-titre')?.textContent).toBe('Par adresse');
  });

  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE DE CE BLOC : « Un résultat coché rejoint la liste des biens cochés en haut, et le
   * compteur se met à jour » (demande d'Arno, mot pour mot).
   */
  it('🔴🔴 cocher un résultat le fait rejoindre les cochés, et le compteur bouge', async () => {
    contexte.biens = [BIEN('134', false, 'motif')];
    biensTrouves = [TROUVE('421')];
    await monter();
    expect(container.querySelector('.rec-compte')?.textContent).toContain('0 bien(s) coché(s) sur 1 affiché(s)');

    await taper('marceau');
    const caseResultat = container.querySelector('.rec-ligne input[type="checkbox"]') as HTMLInputElement;
    await cliquer(caseResultat);

    expect(container.querySelector('.rec-compte')?.textContent).toContain('1 bien(s) coché(s) sur 2 affiché(s)');
    // Il est aussi monté dans la liste du haut, avec les propositions — sous son titre, sans numéro de lot.
    expect(container.querySelector('.rec-biens')?.textContent).toContain('28 av. Marceau, COURBEVOIE');
  });

  it('🔴 et « Valider » l’emporte avec les autres', async () => {
    biensTrouves = [TROUVE('421')];
    await monter();
    await taper('marceau');
    await cliquer(container.querySelector('.rec-ligne input[type="checkbox"]') as HTMLInputElement);
    await cliquer(boutonPar(/^Valider/));
    expect(cibles.map((c) => c.cle)).toEqual(['421']);
    expect(cibles[0].libelle).toBe('28 av. Marceau — lot 421');
  });

  it('⚠️ moins de deux caractères : on ne demande rien au serveur', async () => {
    await monter();
    const avant = (global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await taper('m');
    const apres = (global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(apres).toBe(avant);
  });

  it('⚠️ rien trouvé : on DIT ce qu’on a cherché — « aucun résultat » se lit comme une panne', async () => {
    biensTrouves = [];
    await monter();
    await taper('zzzzz');
    expect(container.querySelector('.rec-vide')?.textContent).toContain('zzzzz');
  });
});
