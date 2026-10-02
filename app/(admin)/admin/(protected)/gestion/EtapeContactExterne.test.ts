// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EtapeContactExterne, motOccupation, typeDuBien, type ValidationEtape2 } from './EtapeContactExterne';
// 🔴 LES MOTS D'ARNO SONT CITÉS, JAMAIS RECOPIÉS : un test qui recopie une phrase ne surveille plus rien.
import {
  BIEN_UNIQUEMENT, BIEN_UNIQUEMENT_AIDE, LIEN_ANCIENS_LOCATAIRES, TITRE_ETAPE2, TITRE_SUIVI,
  CHOIX_SUIVI_CONTACT, MOT_PERSONNALISER, TYPES_AVANT_294, TYPES_CONTACT_EXTERNE,
} from '../../../../lib/gestion/contactExterne';
import type { BienEtape2, ReponseEtape2 } from '../../../../lib/gestion/contactExterneRepo';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — L'ÉTAPE 2, SUR LE VRAI COMPOSANT MONTÉ ════════════════════════════════════════
 *
 * Les quatre cas d'Arno, éprouvés à l'écran :
 *   ① « Le bien uniquement » (un artisan, un syndic : aucune personne spécifique) ;
 *   ② un locataire OCCUPANT à la date du mail ;
 *   ③ un locataire SORTANT, retrouvé via « Voir tous les anciens locataires… » ;
 *   ④ plusieurs personnes, un propriétaire ET un locataire.
 * Plus l'exclusivité, la pastille de statut, les deux choix de suivi, les trois champs facultatifs, « ← Retour ».
 *
 * ⚠️ CE COMPOSANT NE CHARGE RIEN : il reçoit `data` tout prêt. Il n'y a donc AUCUN faux serveur ici — ce qui est
 * le signe que la décision n'est pas dans l'écran. Le cas « faut-il l'étape 2 ? » est éprouvé côté serveur
 * (`contactExterne.test.ts`, section C-A).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let retours: number;
let valide: ValidationEtape2 | null;

const BIEN = (o: Partial<BienEtape2> = {}): BienEtape2 => ({
  cle: '421', adresseComplete: '28 av. Marceau, 92400 COURBEVOIE',
  nature: 'Appartement', typeBien: 'Type 2', personnes: [], ...o,
});

const DATA = (o: Partial<ReponseEtape2> = {}): ReponseEtape2 => ({
  messageId: 57368, filId: 3490, dateMail: '2025-03-12',
  expediteur: 'contact@cabinet-martin.fr', expediteurNom: 'Cabinet Martin',
  requise: true, motif: null, biens: [BIEN()], contact: null,
  premierClassement: true, precoche: null, disponible: true,
  /**
   * 🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — la liste des types vient du SERVEUR. Par défaut, celle qu'une base
   * SANS la migration 294 accepte : les huit d'origine, et pas de « Personnaliser… ». Les épreuves du type libre
   * posent `typesProposes` et `typeLibre` elles-mêmes.
   */
  typesProposes: [...TYPES_AVANT_294], typeLibre: false, ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  retours = 0; valide = null;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = (data: ReponseEtape2 = DATA()) => {
  act(() => {
    root.render(createElement(EtapeContactExterne, {
      data,
      onRetour: () => { retours += 1; },
      onValider: (v) => { valide = v; },
    }));
  });
};

const texte = (): string => container.textContent ?? '';
const cases = (): HTMLInputElement[] =>
  [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
const radios = (): HTMLInputElement[] =>
  [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const bouton = (mot: string): HTMLButtonElement | undefined =>
  boutons().find((b) => (b.textContent ?? '').includes(mot));
/** La case dont la ligne porte ce nom. C'est ainsi qu'on coche « la personne X », pas « la 3e case ». */
const caseDe = (nom: string): HTMLInputElement => {
  const label = [...container.querySelectorAll('label')]
    .find((l) => (l.textContent ?? '').includes(nom));
  const c = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (c === null || c === undefined) throw new Error(`aucune case pour « ${nom} »`);
  return c;
};
const cocher = (e: HTMLInputElement) => act(() => { e.click(); });

const OCCUPANT = {
  sorte: 'locataire' as const, cle: 'thai cecile#c.thai@orange.fr', id: 12, nom: 'THAI Cécile',
  civilite: 'Mme', role: 'locataire_occupant' as const, entree: '2024-02-01', sortie: null,
};
const SORTANT = {
  sorte: 'locataire' as const, cle: 'barouk alexis#a.barouk@gmail.com', id: 13, nom: 'BAROUK Alexis',
  civilite: 'M.', role: 'locataire_sortant' as const, entree: '2021-01-01', sortie: '2023-12-31',
};
const SORTANT_VIEUX = {
  sorte: 'locataire' as const, cle: 'dersu clement#c.dersu@4mtec.com', id: 14, nom: 'D’ERSU Clément',
  civilite: 'M.', role: 'locataire_sortant' as const, entree: '2018-01-01', sortie: '2020-12-31',
};
const PROPRIO = {
  sorte: 'proprietaire' as const, cle: 'P9', id: 9, nom: 'GARREAU Gabrielle', civilite: 'Mme',
  role: 'proprietaire' as const, actif: true,
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   E-1 — L'ÉTAPE S'OUVRE, ET DIT CE QU'ELLE DEMANDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('E-1 — l’étape 2 affiche ce qu’Arno a demandé', () => {
  it('🔴 le titre, « Ce contact intervient pour : », et l’adresse du contact', () => {
    monter();
    expect(texte()).toContain(TITRE_ETAPE2);
    expect(texte()).toContain(BIEN_UNIQUEMENT);
    expect(texte()).toContain(BIEN_UNIQUEMENT_AIDE);
    expect(texte()).toContain('contact@cabinet-martin.fr');
  });

  it('🔴 la DATE du mail est annoncée : les statuts affichés sont ceux de ce jour-là', () => {
    monter();
    expect(texte()).toContain('12/03/2025');
  });

  it('🔴🔴 « Valider » est INACTIF tant qu’aucun choix n’est fait, et le motif se LIT', () => {
    monter();
    const v = bouton('Valider');
    expect(v?.disabled).toBe(true);
    // Le motif est écrit à l'écran, pas dans une infobulle : au doigt, le survol n'existe pas.
    expect(texte()).toContain('ou au moins une personne');
  });

  it('🔴 rien n’est pré-coché à la première fois', () => {
    monter();
    expect(cases().every((c) => !c.checked)).toBe(true);
  });

  it('🔴 « ← Retour » rend la main à l’étape 1 sans rien valider', () => {
    monter();
    act(() => { bouton('Retour')?.click(); });
    expect(retours).toBe(1);
    expect(valide).toBeNull();
  });

  it('🔴 « Échap » fait la même chose que « ← Retour » : rien n’est écrit', () => {
    monter();
    const dialogue = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialogue.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(retours).toBe(1);
    expect(valide).toBeNull();
  });

  it('⚠️ sans la migration 293, l’étape le DIT EN TÊTE — et ne bloque rien', () => {
    monter(DATA({ disponible: false }));
    expect(texte()).toContain('293');
    expect(texte()).toContain('le classement du bien sera enregistré');
    // Le bouton reste utilisable dès qu'un choix est fait : le bien se classe comme avant.
    cocher(cases()[0]);
    expect(bouton('Valider')?.disabled).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 E-2 — LE CAS 1 D'ARNO : « LE BIEN UNIQUEMENT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 E-2 — cas 1 : un artisan, un syndic — aucune personne spécifique', () => {
  it('🔴 cocher « Le bien uniquement » suffit, et ne rend AUCUNE personne', () => {
    monter(DATA({ biens: [BIEN({ personnes: [OCCUPANT, PROPRIO] })] }));
    cocher(caseDe(BIEN_UNIQUEMENT));
    expect(bouton('Valider')?.disabled).toBe(false);
    act(() => { bouton('Valider')?.click(); });
    expect(valide).not.toBeNull();
    expect((valide as unknown as ValidationEtape2).bienUniquement).toBe(true);
    expect((valide as unknown as ValidationEtape2).personnes).toEqual([]);
  });

  it('🔴 un bien SANS aucune personne connue le dit, et « Le bien uniquement » reste la seule réponse', () => {
    monter(DATA({ biens: [BIEN({ personnes: [] })] }));
    expect(texte()).toContain('Aucune personne connue sur ce bien');
    // Une seule case : celle du choix exclusif.
    expect(cases()).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 E-3 — LE CAS 2 D'ARNO : UN LOCATAIRE OCCUPANT, AVEC SA PASTILLE VERTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 E-3 — cas 2 : le locataire occupant à la date du mail', () => {
  it('🔴 il est VISIBLE sans rien déplier, avec « Locataire occupant » en vert', () => {
    monter(DATA({ biens: [BIEN({ personnes: [OCCUPANT] })] }));
    expect(texte()).toContain('THAI Cécile');
    expect(texte()).toContain('Locataire occupant');
    // 🔴 LE TON EST UN RENFORT, LE MOT PORTE L'INFORMATION — mais le ton doit tout de même être le bon.
    const pastille = [...container.querySelectorAll('.ece-pastille')]
      .find((e) => (e.textContent ?? '').includes('Locataire occupant'));
    expect(pastille?.className).toContain('ece-pastille--vert');
    // ⚠️ ET SURTOUT : JAMAIS « en place ». Ce sont les mots d'Arno.
    expect(texte()).not.toMatch(/en place/i);
  });

  it('🔴 sa période d’occupation est écrite en clair', () => {
    monter(DATA({ biens: [BIEN({ personnes: [OCCUPANT] })] }));
    expect(texte()).toContain('depuis le 01/02/2024');
  });

  it('🔴 le cocher le rend à l’appelant avec sa sorte et sa clé', () => {
    monter(DATA({ biens: [BIEN({ personnes: [OCCUPANT] })] }));
    cocher(caseDe('THAI Cécile'));
    act(() => { bouton('Valider')?.click(); });
    expect((valide as unknown as ValidationEtape2).personnes).toEqual([
      { sorte: 'locataire', cle: OCCUPANT.cle, libelle: 'THAI Cécile' },
    ]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 E-4 — LE CAS 3 D'ARNO : UN SORTANT RETROUVÉ VIA « Voir tous les anciens locataires… »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 E-4 — cas 3 : le locataire sortant, et le dépliage', () => {
  it('🔴 le sortant LE PLUS RÉCENT est visible d’emblée, en ROUGE', () => {
    monter(DATA({ biens: [BIEN({ personnes: [SORTANT, SORTANT_VIEUX] })] }));
    expect(texte()).toContain('BAROUK Alexis');
    expect(texte()).toContain('Locataire sortant');
    const pastille = [...container.querySelectorAll('.ece-pastille')]
      .find((e) => (e.textContent ?? '').includes('Locataire sortant'));
    expect(pastille?.className).toContain('ece-pastille--rouge');
  });

  it('🔴🔴 les PLUS ANCIENS sont derrière le lien, qui porte les mots d’Arno et DIT combien', () => {
    monter(DATA({ biens: [BIEN({ personnes: [SORTANT, SORTANT_VIEUX] })] }));
    // Avant le clic : l'ancien n'est pas à l'écran.
    expect(texte()).not.toContain('D’ERSU Clément');
    const lien = bouton(LIEN_ANCIENS_LOCATAIRES);
    expect(lien).toBeDefined();
    expect(lien?.textContent).toContain('(1)');
    // Après le clic : il est là, et il se coche.
    act(() => { lien?.click(); });
    expect(texte()).toContain('D’ERSU Clément');
    cocher(caseDe('D’ERSU Clément'));
    act(() => { bouton('Valider')?.click(); });
    expect((valide as unknown as ValidationEtape2).personnes).toEqual([
      { sorte: 'locataire', cle: SORTANT_VIEUX.cle, libelle: 'D’ERSU Clément' },
    ]);
  });

  it('🔴 le lien n’apparaît PAS quand il n’y a rien à déplier', () => {
    monter(DATA({ biens: [BIEN({ personnes: [OCCUPANT] })] }));
    expect(bouton(LIEN_ANCIENS_LOCATAIRES)).toBeUndefined();
  });

  it('🔴 la période d’un sortant est bornée des deux côtés', () => {
    monter(DATA({ biens: [BIEN({ personnes: [SORTANT] })] }));
    expect(texte()).toContain('du 01/01/2021 au 31/12/2023');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 E-5 — LE CAS 4 D'ARNO : PLUSIEURS PERSONNES, PROPRIÉTAIRE ET LOCATAIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 E-5 — cas 4 : un propriétaire ET un locataire, toutes fiches confondues', () => {
  it('🔴 les deux sections sont titrées, et les deux cases se cochent', () => {
    monter(DATA({ biens: [BIEN({ personnes: [PROPRIO, OCCUPANT] })] }));
    expect(texte()).toContain('PROPRIÉTAIRE(S)');
    expect(texte()).toContain('LOCATAIRE(S)');
    cocher(caseDe('GARREAU Gabrielle'));
    cocher(caseDe('THAI Cécile'));
    act(() => { bouton('Valider')?.click(); });
    const v = valide as unknown as ValidationEtape2;
    expect(v.bienUniquement).toBe(false);
    expect(v.personnes).toHaveLength(2);
    expect(v.personnes.map((x) => x.sorte).sort()).toEqual(['locataire', 'proprietaire']);
  });

  it('🔴 plusieurs biens cochés ⇒ UNE SECTION PAR BIEN, chacune titrée de son adresse', () => {
    monter(DATA({
      biens: [
        BIEN({ cle: '421', adresseComplete: '28 av. Marceau, 92400 COURBEVOIE', personnes: [OCCUPANT] }),
        BIEN({ cle: '422', adresseComplete: '12 rue Danton, 92800 PUTEAUX', personnes: [PROPRIO] }),
      ],
    }));
    expect(texte()).toContain('28 av. Marceau, 92400 COURBEVOIE');
    expect(texte()).toContain('12 rue Danton, 92800 PUTEAUX');
  });

  it('⚠️ avec UN SEUL bien, son titre n’est pas répété : l’étape 1 l’a déjà dit', () => {
    monter(DATA({ biens: [BIEN({ personnes: [OCCUPANT] })] }));
    expect(texte()).not.toContain('28 av. Marceau, 92400 COURBEVOIE');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 E-6 — L'EXCLUSIVITÉ, À L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 E-6 — « Le bien uniquement » est exclusif, dans les deux sens, à l’écran', () => {
  it('🔴 cocher le choix exclusif DÉCOCHE les personnes déjà cochées', () => {
    monter(DATA({ biens: [BIEN({ personnes: [PROPRIO, OCCUPANT] })] }));
    cocher(caseDe('THAI Cécile'));
    expect(caseDe('THAI Cécile').checked).toBe(true);
    cocher(caseDe(BIEN_UNIQUEMENT));
    expect(caseDe(BIEN_UNIQUEMENT).checked).toBe(true);
    expect(caseDe('THAI Cécile').checked).toBe(false);
  });

  it('🔴 cocher une personne DÉCOCHE le choix exclusif', () => {
    monter(DATA({ biens: [BIEN({ personnes: [PROPRIO] })] }));
    cocher(caseDe(BIEN_UNIQUEMENT));
    cocher(caseDe('GARREAU Gabrielle'));
    expect(caseDe(BIEN_UNIQUEMENT).checked).toBe(false);
    expect(caseDe('GARREAU Gabrielle').checked).toBe(true);
  });

  it('🔴 tout décocher re-désactive « Valider »', () => {
    monter(DATA({ biens: [BIEN({ personnes: [OCCUPANT] })] }));
    cocher(caseDe('THAI Cécile'));
    expect(bouton('Valider')?.disabled).toBe(false);
    cocher(caseDe('THAI Cécile'));
    expect(bouton('Valider')?.disabled).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 E-7 — LE SUIVI, ET LES TROIS CHAMPS FACULTATIFS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 E-7 — « Suivi des prochains échanges », et les champs qui ne bloquent jamais', () => {
  it('🔴 les deux choix sont là, et « Suivi automatique » est coché d’avance', () => {
    monter();
    expect(texte()).toContain(TITRE_SUIVI);
    expect(radios()).toHaveLength(2);
    expect(radios()[0].checked).toBe(true);
    expect(texte()).toContain(CHOIX_SUIVI_CONTACT[0].mot);
    expect(texte()).toContain(CHOIX_SUIVI_CONTACT[1].mot);
  });

  it('🔴🔴 ils N’APPARAISSENT PAS quand ce n’est pas le premier classement de ce contact', () => {
    monter(DATA({ premierClassement: false }));
    expect(texte()).not.toContain(TITRE_SUIVI);
    expect(radios()).toHaveLength(0);
    // Et le choix rendu est alors `null` : c'est la conversation qui décide (bloc à 3 choix existant).
    cocher(cases()[0]);
    act(() => { bouton('Valider')?.click(); });
    expect((valide as unknown as ValidationEtape2).suivi).toBeNull();
  });

  it('🔴 « Classement ponctuel » est rendu tel quel à l’appelant', () => {
    monter();
    act(() => { radios()[1].click(); });
    cocher(cases()[0]);
    act(() => { bouton('Valider')?.click(); });
    expect((valide as unknown as ValidationEtape2).suivi).toBe('ponctuel');
  });

  it('🔴🔴 les trois champs sont FACULTATIFS : « Valider » n’attend ni nom, ni téléphone, ni type', () => {
    monter();
    cocher(cases()[0]);
    expect(bouton('Valider')?.disabled).toBe(false);
    act(() => { bouton('Valider')?.click(); });
    const v = valide as unknown as ValidationEtape2;
    expect(v.contact.telephone).toBe('');
    expect(v.contact.type).toBeNull();
  });

  it('🔴 le NOM du mail pré-remplit le champ — sans l’imposer', () => {
    monter();
    const champ = container.querySelector<HTMLInputElement>('input[type="text"]');
    expect(champ?.value).toBe('Cabinet Martin');
  });

  it('🔴 un contact DÉJÀ CONNU pré-remplit les trois champs (demande d’Arno)', () => {
    monter(DATA({
      contact: { email: 'contact@cabinet-martin.fr', nom: 'Me Martin', telephone: '01 45 00 00 00', type: 'avocat' },
    }));
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Me Martin');
    expect(container.querySelector<HTMLInputElement>('input[type="tel"]')?.value).toBe('01 45 00 00 00');
    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('avocat');
  });

  it('🔴 la phrase qui rappelle qu’un contact externe n’entre dans AUCUNE fiche', () => {
    monter();
    expect(texte()).toContain('ni propriétaire ni locataire');
    expect(texte()).toContain('aucune fiche');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 E-8 — LA PRÉ-COCHE DU « CLASSEMENT PONCTUEL » AU MAIL SUIVANT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 E-8 — au mail suivant, la dernière configuration est proposée d’avance', () => {
  it('🔴 les personnes de la dernière décision sont cochées, et « Valider » est actif', () => {
    monter(DATA({
      biens: [BIEN({ personnes: [PROPRIO, OCCUPANT] })],
      premierClassement: false,
      precoche: { personnes: [`locataire:${OCCUPANT.cle}`], bienUniquement: false, suivi: 'ponctuel' },
    }));
    expect(caseDe('THAI Cécile').checked).toBe(true);
    expect(caseDe('GARREAU Gabrielle').checked).toBe(false);
    expect(bouton('Valider')?.disabled).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   E-9 — LES PETITS MOTS DE L'ÉCRAN, ÉPROUVÉS À PART (ils sont PURS)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('E-9 — les mots de mise en forme', () => {
  it('la période d’occupation, dans ses trois formes, et « aucune borne » = null', () => {
    expect(motOccupation({ ...OCCUPANT })).toBe('depuis le 01/02/2024');
    expect(motOccupation({ ...SORTANT })).toBe('du 01/01/2021 au 31/12/2023');
    expect(motOccupation({ ...OCCUPANT, entree: null, sortie: '2025-08-31' })).toBe('jusqu’au 31/08/2025');
    expect(motOccupation({ ...OCCUPANT, entree: null, sortie: null })).toBeNull();
  });

  it('le type d’un bien : sans doublon, et jamais un tiret muet', () => {
    expect(typeDuBien({ nature: 'Appartement', typeBien: 'Type 2' })).toBe('Appartement — Type 2');
    expect(typeDuBien({ nature: 'Parking', typeBien: 'Parking' })).toBe('Parking');
    expect(typeDuBien({ nature: null, typeBien: null })).toBe('');
    expect(typeDuBien({ nature: 'Box', typeBien: null })).toBe('Box');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 E-10 — LE CHAMP « TYPE » (lot URGENT-VERIF-SUIVI-ET-76-BIENS)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les mots du choix « Type », tels qu'ils s'affichent. */
const optionsDuType = (): string[] =>
  [...container.querySelectorAll('select option')].map((o) => o.textContent ?? '');

describe('🔴🔴 E-10 — le type : « Diagnostiqueur », et « Personnaliser… »', () => {
  it('⚠️ SANS la migration 294, la liste est celle que la base accepte — et « Personnaliser… » est absent', () => {
    monter();
    expect(optionsDuType()).not.toContain(MOT_PERSONNALISER);
    // 🔴 « Diagnostiqueur » non plus : la contrainte de la 293 le refuserait, et le type disparaîtrait en
    //   silence (les trois champs du contact ne bloquent jamais le classement).
    expect(optionsDuType()).not.toContain('Diagnostiqueur');
    expect(optionsDuType()).toContain('Syndic');
  });

  it('🔴🔴 AVEC la 294, « Diagnostiqueur » est proposé', () => {
    monter(DATA({ typesProposes: [...TYPES_CONTACT_EXTERNE], typeLibre: true }));
    expect(optionsDuType()).toContain('Diagnostiqueur');
  });

  it('🔴🔴 « Personnaliser… » ouvre un champ texte, et ce qu’on y écrit est rendu TEL QUEL', () => {
    monter(DATA({ typesProposes: [...TYPES_CONTACT_EXTERNE], typeLibre: true }));
    expect(optionsDuType()).toContain(MOT_PERSONNALISER);
    // Avant le choix, aucun champ libre.
    expect(container.querySelectorAll('input[type="text"]')).toHaveLength(1); // le seul champ « Nom »

    const select = container.querySelector('select') as HTMLSelectElement;
    act(() => {
      select.value = '__personnaliser__';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const champs = [...container.querySelectorAll<HTMLInputElement>('input[type="text"]')];
    expect(champs).toHaveLength(2);

    /**
     * ⚠️ LE SETTER NATIF, ET NON `champ.value = …` : React garde la valeur du champ dans son propre suivi, et une
     * affectation directe ne déclenche PAS son `onChange`. C'est le même geste que `taper` dans
     * `RattacherEnEcrivant.test.ts` — un test qui l'oublie croit avoir tapé et n'a rien tapé.
     */
    const libre = champs[1];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(libre, '  Huissier DE Justice ');
      libre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    cocher(cases()[0]);
    act(() => { bouton('Valider')?.click(); });
    // 🔴 ENREGISTRÉ TEL QUEL, à la normalisation près (casse et blancs) — on ne traduit pas, on ne range pas.
    expect((valide as unknown as ValidationEtape2).contact.type).toBe('huissier de justice');
  });

  it('🔴 le marqueur d’écran n’est JAMAIS rendu comme un type', () => {
    monter(DATA({ typesProposes: [...TYPES_CONTACT_EXTERNE], typeLibre: true }));
    const select = container.querySelector('select') as HTMLSelectElement;
    act(() => {
      select.value = '__personnaliser__';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Champ libre laissé VIDE : aucun type, et « Valider » part quand même (les champs ne bloquent jamais).
    cocher(cases()[0]);
    expect(bouton('Valider')?.disabled).toBe(false);
    act(() => { bouton('Valider')?.click(); });
    expect((valide as unknown as ValidationEtape2).contact.type).toBeNull();
  });

  it('🔴 un type déjà écrit à la main revient dans la liste les prochaines fois', () => {
    monter(DATA({
      typesProposes: [...TYPES_CONTACT_EXTERNE, 'huissier'], typeLibre: true,
    }));
    expect(optionsDuType()).toContain('Huissier');
  });

  it('⚠️ un contact dont le type n’est plus proposé garde quand même son type dans la liste', () => {
    monter(DATA({
      typesProposes: [...TYPES_AVANT_294], typeLibre: false,
      contact: { email: 'x@y.fr', nom: null, telephone: null, type: 'huissier' },
    }));
    // Sans cela, rouvrir la fiche afficherait un choix VIDE, et valider effacerait son type.
    expect(optionsDuType()).toContain('Huissier');
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('huissier');
  });
});
