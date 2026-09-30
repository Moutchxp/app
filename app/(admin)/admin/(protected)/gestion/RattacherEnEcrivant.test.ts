// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RattacherEnEcrivant } from './RattacherEnEcrivant';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';

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

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  cibles = []; interneChoisi = false; ferme = 0;
  contexte = { biens: [], examen: { issue: 'sans_candidat', motif: '' }, proprietaire: null,
    interneDabord: false, disponible: true };
  global.fetch = vi.fn(
    async () => ({ ok: true, json: async () => ({ etat: 'ok', contexte }) }) as unknown as Response,
  ) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (dest = ['locataire@orange.fr']) => {
  await act(async () => {
    root.render(createElement(RattacherEnEcrivant, {
      destinataires: dest, objet: 'Charges', corps: '', pieces: [],
      cibles, onChange: (c) => { cibles = c; },
      interneDisponible: true, interneChoisi,
      onInterne: (a: boolean) => { interneChoisi = a; },
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
    expect(boutonPar(/Tout sélectionner/)).toBeDefined();

    await cliquer(boutonPar(/Tout sélectionner/));
    expect(cases().every((c) => c.checked)).toBe(true);
    // 🔴 LE MOT CHANGE : deux boutons séparés laisseraient toujours l'un des deux sans effet.
    expect(boutonPar(/Tout désélectionner/)).toBeDefined();

    await cliquer(boutonPar(/Tout désélectionner/));
    expect(cases().every((c) => !c.checked)).toBe(true);
    expect(boutonPar(/Tout sélectionner/)).toBeDefined();
  });

  it('le compte affiché suit les cases, toujours', async () => {
    await monter(['bailleur@free.fr']);
    await cliquer(cases()[1]);
    expect(container.querySelector('.rec-compte')?.textContent).toContain('1 bien(s) coché(s) sur 3');
    await cliquer(boutonPar(/Tout sélectionner/));
    expect(container.querySelector('.rec-compte')?.textContent).toContain('3 bien(s) coché(s) sur 3');
  });

  /** ⚠️ AUCUN BIEN À PROPOSER : pas de bouton « tout », et on le DIT plutôt que de laisser une liste muette. */
  it('⚠️ aucun bien proposé : on le dit, et le bouton « tout » n’existe pas', async () => {
    contexte.biens = [];
    await monter();
    expect(container.querySelector('.rec-compte')?.textContent).toContain('Aucun bien ne se déduit');
    expect(boutonPar(/Tout sélectionner/)).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ « INTERNE » ET LES BIENS S'EXCLUENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ « Interne » et les biens s’excluent', () => {
  it('🔴 choisir « Interne » DÉCOCHE tous les biens', async () => {
    contexte.biens = [BIEN('134', true, 'locataire en place')];
    await monter();
    expect(cases()[0].checked).toBe(true);
    await cliquer(boutonPar(/^Interne/));
    expect(cases()[0].checked).toBe(false);
    expect(interneChoisi).toBe(true);
  });

  /** 🔴 « PROPOSÉ EN PREMIER » quand tous les destinataires sont de la maison — c'est le serveur qui le dit. */
  it('🔴 tous les destinataires de la maison : la modale le DIT', async () => {
    contexte.interneDabord = true;
    await monter(['a.jorel@sansvisavis.com']);
    expect(container.querySelector('.rec-interne-dabord')?.textContent).toContain('interne');
  });

  it('destinataires mêlés : la mention n’apparaît pas, le bouton reste', async () => {
    contexte.interneDabord = false;
    await monter(['a.jorel@sansvisavis.com', 'locataire@orange.fr']);
    expect(container.querySelector('.rec-interne-dabord')).toBeNull();
    expect(boutonPar(/^Interne/)).toBeDefined();
  });

  /** ⚠️ SANS LA MIGRATION 281, LE BOUTON EST GRISÉ **AVEC SON MOTIF** — jamais absent sans explication. */
  it('⚠️ sans la migration, le bouton est grisé et dit pourquoi', async () => {
    await act(async () => {
      root.render(createElement(RattacherEnEcrivant, {
        destinataires: ['a@b.fr'], cibles: [], onChange: () => {},
        interneDisponible: false, interneChoisi: false, onInterne: () => {}, onFerme: () => {},
      }));
    });
    await calmer();
    expect(boutonPar(/^Interne/).disabled).toBe(true);
    expect(container.textContent).toContain('pas encore installé sur cette base');
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
   * 🔴 IGNORER N'EST PAS UNE ERREUR, C'EST UNE SORTIE NOMMÉE. Le mail part « à classer », comme avant ce lot —
   * une modale qu'on ne peut quitter que par la croix se referme dans le doute.
   */
  it('🔴 ignorer ferme sans rien écrire, et le bouton le DIT', async () => {
    contexte.biens = [BIEN('134', true, 'locataire en place')];
    await monter();
    const ignorer = boutonPar(/^Ignorer/);
    expect(ignorer.textContent).toContain('à classer');
    await cliquer(ignorer);
    expect(cibles).toEqual([]);
    expect(ferme).toBe(1);
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
