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
/** Ce que le moteur de recherche de biens rend, pour les épreuves qui s'en servent. */
let biensTrouves: Record<string, unknown>[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  cibles = []; interneChoisi = false; ferme = 0;
  contexte = { biens: [], examen: { issue: 'sans_candidat', motif: '' }, proprietaire: null,
    interneDabord: false, disponible: true };
  biensTrouves = [];
  /**
   * 🔴 LOT CLASSER-DEUX-BOUTONS — DEUX ROUTES, ET LE FAUX SERVEUR DOIT LES DISTINGUER : le moteur de propositions
   * (`/classement`) et le moteur de recherche de biens (`/biens`), désormais tous deux dans cette fenêtre.
   */
  global.fetch = vi.fn(async (u: unknown) => (String(u).includes('/gestion/biens')
    ? { ok: true, json: async () => ({ etat: 'ok', lignes: biensTrouves, tronque: false, disponible: true }) }
    : { ok: true, json: async () => ({ etat: 'ok', contexte }) }) as unknown as Response,
  ) as unknown as typeof fetch;
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
    expect(ligne?.textContent).toContain('28 av. Marceau — lot 421 · Appartement');
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
    expect(container.querySelector('.rec-compte')?.textContent).toContain('0 bien(s) coché(s) sur 1 proposé(s)');

    await taper('marceau');
    const caseResultat = container.querySelector('.rec-ligne input[type="checkbox"]') as HTMLInputElement;
    await cliquer(caseResultat);

    expect(container.querySelector('.rec-compte')?.textContent).toContain('1 bien(s) coché(s) sur 2 proposé(s)');
    // Il est aussi monté dans la liste du haut, avec les propositions.
    expect(container.querySelector('.rec-biens')?.textContent).toContain('lot 421');
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
