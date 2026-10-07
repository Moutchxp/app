import { describe, it, expect } from 'vitest';
import {
  motRoleSuggere, rangSuivant, suggestionsAnnuaire, type PersonnePourSuggestion,
} from './suggestionAnnuaire';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 3 — CE QUE LA BARRE ANNUAIRE SUGGÈRE ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (07/10/2026) : « Chaque suggestion montre le nom et son rôle : Locataire / Propriétaire (et
 * l'adresse du bien pour distinguer les homonymes, SANS numéro de lot interne). Clic sur un locataire → ouvre
 * directement la fiche locataire. Clic sur un propriétaire → la fiche propriétaire. Un contact à la fois locataire
 * et propriétaire apparaît en deux suggestions (une par rôle). Clavier : flèches haut/bas, Entrée, Échap. »
 *
 * 🔒 Module PUR : aucune base, aucun réseau, aucun React. C'est le rangement des résultats de la recherche
 * EXISTANTE de l'annuaire — ce fichier ne cherche rien, et n'éprouve donc pas une seconde recherche.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** ⚠️ `fin: null` = ENCORE EN GESTION : c'est la règle de la fiche propriétaire (`bienEnGestion`). */
const BIEN = { adresse: '67 rue de Normandie', commune: 'COURBEVOIE', fin: null };
/** Un bien SORTI de gestion — vendu, mandat perdu : il ne compte pas dans le « X biens au total ». */
const VENDU = { adresse: '3 rue des Lilas', commune: 'PUTEAUX', fin: '2025-06-30' };

const PROPRIO: PersonnePourSuggestion = {
  sujet: 'proprietaire', id: 12, nomAffiche: 'Mme ABDELLATIF Névine',
  roles: ['proprietaire'], autreFicheId: null, biens: [BIEN],
};
const LOCATAIRE: PersonnePourSuggestion = {
  sujet: 'locataire', id: 45, nomAffiche: 'M. ROI Nathan',
  roles: ['locataire'], autreFicheId: null, biens: [BIEN],
};

describe('🔴🔴 ① une suggestion par rôle, avec le bon lien', () => {
  it('🔴 un PROPRIÉTAIRE mène à sa fiche propriétaire', () => {
    expect(suggestionsAnnuaire([PROPRIO])).toEqual([{
      cle: 'proprietaire-proprietaire-12', nom: 'Mme ABDELLATIF Névine', role: 'proprietaire',
      mot: 'Propriétaire', lieu: '67 rue de Normandie, COURBEVOIE',
      /* 🔴 UN SEUL BIEN ⇒ AUCUNE MENTION (Arno : « rien si X = 1 »). */
      mention: null,
      fiche: { sorte: 'proprietaire', id: 12 },
    }]);
  });

  it('🔴 un LOCATAIRE mène à sa fiche locataire', () => {
    const [s] = suggestionsAnnuaire([LOCATAIRE]);
    expect(s.mot).toBe('Locataire');
    expect(s.fiche).toEqual({ sorte: 'locataire', id: 45 });
  });

  /**
   * ⚠️ UN ANCIEN LOCATAIRE OUVRE LA MÊME FICHE QU'UN LOCATAIRE : c'est la même personne et le même écran, seule
   * sa période d'occupation diffère. Lui inventer une troisième sorte de fiche n'ouvrirait rien.
   */
  it('⚠️ un ANCIEN locataire ouvre la fiche locataire, et le dit', () => {
    const [s] = suggestionsAnnuaire([{ ...LOCATAIRE, roles: ['ancien_locataire'] }]);
    expect(s.mot).toBe('Ancien locataire');
    expect(s.fiche).toEqual({ sorte: 'locataire', id: 45 });
  });

  /** 🔴 L'ADRESSE DISTINGUE LES HOMONYMES — et elle NE PORTE PAS le numéro de lot (Arno). */
  it('🔴🔴 l’adresse est là, sans numéro de lot', () => {
    const [s] = suggestionsAnnuaire([PROPRIO]);
    expect(s.lieu).toBe('67 rue de Normandie, COURBEVOIE');
    expect(s.lieu).not.toContain('lot');
  });

  it('⚠️ sans bien connu, aucune adresse — et la suggestion reste', () => {
    const [s] = suggestionsAnnuaire([{ ...PROPRIO, biens: [] }]);
    expect(s.lieu).toBeNull();
    expect(s.nom).toBe('Mme ABDELLATIF Névine');
  });

  it('⚠️ un bien sans adresse ni commune ne fabrique pas une ligne vide', () => {
    const [s] = suggestionsAnnuaire([{ ...PROPRIO, biens: [{ adresse: null, commune: null, fin: null }] }]);
    expect(s.lieu).toBeNull();
  });
});

describe('🔴🔴 ② le DOUBLE RÔLE fait deux suggestions', () => {
  /**
   * 🔴🔴 LA DEMANDE D'ARNO, MOT POUR MOT : « un contact à la fois locataire et propriétaire apparaît en deux
   * suggestions (une par rôle) ». Et chacune mène à SA fiche — la principale pour l'une, la secondaire pour
   * l'autre. Choisir à sa place aurait rendu la moitié de la personne inatteignable.
   */
  it('🔴🔴 deux lignes, deux fiches, un seul nom', () => {
    const deux: PersonnePourSuggestion = {
      sujet: 'proprietaire', id: 12, nomAffiche: 'M. JULLIEN - GARRIDO Cédric',
      roles: ['proprietaire', 'locataire'], autreFicheId: 98, biens: [BIEN],
    };
    const s = suggestionsAnnuaire([deux]);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.mot)).toEqual(['Propriétaire', 'Locataire']);
    expect(s[0].fiche).toEqual({ sorte: 'proprietaire', id: 12 });
    expect(s[1].fiche).toEqual({ sorte: 'locataire', id: 98 });
    /* ⚠️ DEUX CLÉS DISTINCTES : deux lignes d'une même personne ne doivent pas se confondre à l'affichage. */
    expect(new Set(s.map((x) => x.cle)).size).toBe(2);
  });

  /** ⚠️ L'AUTRE SENS AUSSI : quand la fiche principale est le locataire, c'est le propriétaire qui est second. */
  it('⚠️ fiche principale locataire : le propriétaire est la seconde', () => {
    const s = suggestionsAnnuaire([{
      sujet: 'locataire', id: 45, nomAffiche: 'X', roles: ['locataire', 'proprietaire'],
      autreFicheId: 7, biens: [],
    }]);
    expect(s[0].fiche).toEqual({ sorte: 'locataire', id: 45 });
    expect(s[1].fiche).toEqual({ sorte: 'proprietaire', id: 7 });
  });

  /**
   * ⚠️ UN RÔLE SANS FICHE N'EST PAS SUGGÉRÉ : on ne propose pas un lien mort. Le cas n'arrive que si la
   * recherche annonce un rôle sans l'identifiant qui va avec.
   */
  it('⚠️ un rôle dont la fiche manque est écarté, pas inventé', () => {
    const s = suggestionsAnnuaire([{ ...PROPRIO, roles: ['proprietaire', 'locataire'], autreFicheId: null }]);
    expect(s).toHaveLength(1);
    expect(s[0].mot).toBe('Propriétaire');
  });
});

describe('🔴🔴 ③ « + Propriétaire de X biens au total »', () => {
  /**
   * ══ 🔴🔴 LA RÈGLE D'ARNO, MOT POUR MOT ═══════════════════════════════════════════════════════════════════════
   * « X = nombre TOTAL de biens en gestion de ce propriétaire (bien affiché compris). Mention seulement si
   * X ≥ 2 ; rien si X = 1. »
   *
   * 🔴 « EN GESTION » EST LA DÉFINITION DE LA FICHE PROPRIÉTAIRE : un bien l'est tant qu'il n'a pas de date de
   * fin (`bienEnGestion`). Les biens vendus ou perdus — qui en portent une — ne comptent donc pas.
   */
  it('🔴 X = 1 : aucune mention', () => {
    expect(suggestionsAnnuaire([PROPRIO])[0].mention).toBeNull();
  });

  it('🔴🔴 X = 3 : « + Propriétaire de 3 biens au total »', () => {
    const trois = { ...PROPRIO, biens: [BIEN, { ...BIEN, adresse: '12 rue A' }, { ...BIEN, adresse: '5 rue B' }] };
    expect(suggestionsAnnuaire([trois])[0].mention).toBe('+ Propriétaire de 3 biens au total');
  });

  /** 🔴🔴 UN BIEN SORTI DE GESTION NE COMPTE PAS : deux lots dont un vendu font X = 1, donc aucune mention. */
  it('🔴🔴 un bien vendu ne compte pas — deux lots dont un sorti font X = 1', () => {
    expect(suggestionsAnnuaire([{ ...PROPRIO, biens: [BIEN, VENDU] }])[0].mention).toBeNull();
  });

  it('🔴 trois lots dont un vendu : « 2 biens au total »', () => {
    const s = suggestionsAnnuaire([{ ...PROPRIO, biens: [BIEN, { ...BIEN, adresse: '12 rue A' }, VENDU] }]);
    expect(s[0].mention).toBe('+ Propriétaire de 2 biens au total');
  });

  /**
   * 🔴🔴 UNE SEULE LIGNE PAR PROPRIÉTAIRE, et c'est la garantie qu'Arno demande : la recherche rend UNE personne
   * avec TOUS ses biens, jamais une ligne par bien. Le regroupement n'est pas à faire — il est à NE PAS DÉFAIRE.
   */
  it('🔴🔴 trois biens ⇒ UNE seule suggestion, pas trois', () => {
    const trois = { ...PROPRIO, biens: [BIEN, { ...BIEN, adresse: '12 rue A' }, { ...BIEN, adresse: '5 rue B' }] };
    const s = suggestionsAnnuaire([trois]);
    expect(s).toHaveLength(1);
    /* 🔴 ET C'EST LE PREMIER BIEN QUI DONNE L'ADRESSE : une suggestion est une ligne. */
    expect(s[0].lieu).toBe('67 rue de Normandie, COURBEVOIE');
  });

  /** ⚠️ RIEN POUR UN LOCATAIRE : ses « biens » sont ceux qu'il occupe, pas les siens. */
  it('⚠️ un locataire n’a jamais la mention, même avec plusieurs biens', () => {
    const s = suggestionsAnnuaire([{ ...LOCATAIRE, biens: [BIEN, { ...BIEN, adresse: '12 rue A' }] }]);
    expect(s[0].mention).toBeNull();
  });

  /** ⚠️ ET SUR UN DOUBLE RÔLE, SEULE LA LIGNE « Propriétaire » LA PORTE. */
  it('⚠️ double rôle : la mention n’est que sur la ligne Propriétaire', () => {
    const s = suggestionsAnnuaire([{
      sujet: 'proprietaire', id: 12, nomAffiche: 'X', roles: ['proprietaire', 'locataire'],
      autreFicheId: 98, biens: [BIEN, { ...BIEN, adresse: '12 rue A' }],
    }]);
    expect(s[0].mention).toBe('+ Propriétaire de 2 biens au total');
    expect(s[1].mention).toBeNull();
  });
});

describe('🔴 ④ aucun résultat', () => {
  it('🔴 aucune personne ⇒ aucune suggestion', () => {
    expect(suggestionsAnnuaire([])).toEqual([]);
  });

  it('⚠️ une personne sans aucun rôle ne produit rien non plus', () => {
    expect(suggestionsAnnuaire([{ ...PROPRIO, roles: [] }])).toEqual([]);
  });
});

describe('🔴🔴 ⑤ le clavier : flèches haut et bas', () => {
  /** 🔴 RIEN DE SÉLECTIONNÉ (`-1`) : « bas » prend la PREMIÈRE, « haut » la DERNIÈRE. */
  it('🔴 depuis « rien », bas prend la première et haut la dernière', () => {
    expect(rangSuivant(-1, 3, 'bas')).toBe(0);
    expect(rangSuivant(-1, 3, 'haut')).toBe(2);
  });

  it('🔴 bas avance, haut recule', () => {
    expect(rangSuivant(0, 3, 'bas')).toBe(1);
    expect(rangSuivant(2, 3, 'haut')).toBe(1);
  });

  /**
   * 🔴 IL BOUCLE AUX DEUX BOUTS. C'est ce que fait toute liste de suggestions ; rester bloqué fait croire que la
   * touche ne répond plus.
   */
  it('🔴🔴 il boucle : après la dernière, la première — et l’inverse', () => {
    expect(rangSuivant(2, 3, 'bas')).toBe(0);
    expect(rangSuivant(0, 3, 'haut')).toBe(2);
  });

  /** ⚠️ UNE LISTE VIDE NE SÉLECTIONNE RIEN : jamais un rang qui n'existe pas. */
  it('⚠️ liste vide : aucune sélection', () => {
    expect(rangSuivant(-1, 0, 'bas')).toBe(-1);
    expect(rangSuivant(0, 0, 'haut')).toBe(-1);
  });

  it('⚠️ une seule suggestion : les deux sens y restent', () => {
    expect(rangSuivant(0, 1, 'bas')).toBe(0);
    expect(rangSuivant(0, 1, 'haut')).toBe(0);
  });
});

describe('🔴 ⑥ les mots des rôles', () => {
  it('🔴 « Propriétaire », « Locataire », « Ancien locataire »', () => {
    expect(motRoleSuggere('proprietaire')).toBe('Propriétaire');
    expect(motRoleSuggere('locataire')).toBe('Locataire');
    expect(motRoleSuggere('ancien_locataire')).toBe('Ancien locataire');
  });
});
