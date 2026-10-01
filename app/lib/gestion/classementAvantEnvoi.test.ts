import { describe, it, expect } from 'vitest';
import {
  ANIM_COURBE_ELASTIQUE, ANIM_EFFACER_MS, ANIM_ETENDRE_MS, ANIM_REBOND_MS, ANIM_TOTAL_MS,
  AUCUNE_PROPOSITION, classementFait, classementHerite, coteDeLaCase, etapesAnimation, etatClassement,
  MOTIF_NON_CLASSE, refusSiNonClasse,
} from './classementAvantEnvoi';

/**
 * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — LA DÉCISION, ÉPROUVÉE CAS PAR CAS ═══════════════════════════════════════════
 *
 * ARNO (01/10/2026) : « “Envoyer” est inactif tant que le bloc “Classer ce mail” n'est pas une case VERTE
 * (“Interne”, ou “Rattaché” avec au moins un bien). […] et le serveur la vérifie aussi (refus avec motif). »
 */
const LOT = (cle: string, libelle = `lot ${cle}`) => ({ sorte: 'lot', cle, id: null, libelle });

describe('🔴 ① ce qui compte pour « classé », et ce qui ne compte pas', () => {
  it('🔴 un brouillon nu n’est pas classé', () => {
    expect(etatClassement({})).toBe('rien');
    expect(classementFait({})).toBe(false);
  });

  it('🔴 au moins UN bien ⇒ « Rattaché »', () => {
    expect(etatClassement({ cibles: [LOT('421')] })).toBe('rattache');
    expect(classementFait({ cibles: [LOT('421'), LOT('12')] })).toBe(true);
  });

  it('🔴 « Interne » ⇒ classé, sans aucun bien', () => {
    expect(etatClassement({ interne: true })).toBe('interne');
    expect(classementFait({ interne: true })).toBe(true);
  });

  /** 🔴 Il n'arrive que par héritage — mais il classe tout autant. */
  it('🔴 « Hors gestion » hérité ⇒ classé', () => {
    expect(etatClassement({ horsGestion: true })).toBe('hors_gestion');
    expect(classementFait({ horsGestion: true })).toBe(true);
  });

  /**
   * 🔴🔴 UN ÉVÉNEMENT N'EST PAS UN BIEN. La case verte dit « Rattaché » et liste des LOGEMENTS ; une carte
   * d'événement cochée ailleurs ne doit pas faire croire que le courrier est rattaché à un bien. C'est la
   * demande d'Arno au mot près : « “Rattaché” avec au moins un bien ».
   */
  it('🔴🔴 une cible « evenement » SEULE ne classe pas', () => {
    expect(etatClassement({ cibles: [{ sorte: 'evenement' }] })).toBe('rien');
    expect(classementFait({ cibles: [{ sorte: 'evenement' }] })).toBe(false);
  });

  it('⚠️ un tableau vide, `null` ou `false` ne classent rien', () => {
    for (const b of [{ cibles: [] }, { cibles: null }, { interne: false }, { horsGestion: null }]) {
      expect(classementFait(b), JSON.stringify(b)).toBe(false);
    }
  });

  /**
   * ⚠️ UN CAS IMPOSSIBLE À L'ÉCRAN (les deux réponses s'excluent) MAIS POSSIBLE SUR LE RÉSEAU. On tranche pour le
   * plus informatif, et jamais par un refus : un cas impossible ne doit pas devenir une panne visible.
   */
  it('⚠️ biens ET « interne » ensemble : « Rattaché » l’emporte', () => {
    expect(etatClassement({ cibles: [LOT('421')], interne: true })).toBe('rattache');
    expect(etatClassement({ interne: true, horsGestion: true })).toBe('interne');
  });
});

describe('🔴🔴 ② le refus, et sa phrase — la même partout', () => {
  it('🔴 non classé : le motif d’Arno, mot pour mot', () => {
    expect(refusSiNonClasse({})).toBe('Classez ce mail avant de l’envoyer : Rattacher ou Interne.');
    expect(refusSiNonClasse({})).toBe(MOTIF_NON_CLASSE);
  });

  it('🔴 classé : aucun refus', () => {
    expect(refusSiNonClasse({ cibles: [LOT('421')] })).toBeNull();
    expect(refusSiNonClasse({ interne: true })).toBeNull();
    expect(refusSiNonClasse({ horsGestion: true })).toBeNull();
  });
});

/**
 * ══ 🔴🔴 ③ RÉPONDRE DANS UNE CONVERSATION DÉJÀ CLASSÉE ═════════════════════════════════════════════════════════
 *
 * ARNO : « si la conversation est déjà rattachée, interne ou hors gestion, la case est pré-remplie en vert dans le
 * même état (avec Réinitialiser). Sinon, même obligation que pour un nouveau message. »
 */
describe('🔴🔴 ③ l’héritage d’une conversation déjà classée', () => {
  it('🔴 conversation RATTACHÉE : les biens du message sont repris, et la case est verte', () => {
    const h = classementHerite({ biens: [LOT('421', '28 av. Marceau — lot 421')] });
    expect(h.cibles).toEqual([{ sorte: 'lot', cle: '421', id: null, libelle: '28 av. Marceau — lot 421' }]);
    expect(classementFait(h)).toBe(true);
    expect(etatClassement(h)).toBe('rattache');
  });

  it('🔴 conversation INTERNE : « Interne », sans aucun bien', () => {
    const h = classementHerite({ filInterne: true });
    expect(h).toEqual({ cibles: [], interne: true, horsGestion: false });
    expect(etatClassement(h)).toBe('interne');
  });

  it('🔴 message HORS GESTION : le même état, hérité', () => {
    const h = classementHerite({ messageHorsGestion: true });
    expect(h).toEqual({ cibles: [], interne: false, horsGestion: true });
    expect(etatClassement(h)).toBe('hors_gestion');
  });

  /** 🔴 « Sinon, même obligation que pour un nouveau message. » */
  it('🔴 conversation NON classée : rien n’est hérité, et l’envoi reste bloqué', () => {
    const h = classementHerite({ biens: [], filInterne: false, messageHorsGestion: false });
    expect(classementFait(h)).toBe(false);
    expect(refusSiNonClasse(h)).toBe(MOTIF_NON_CLASSE);
  });

  /** ⚠️ ON NE SAIT RIEN (migration absente, lecture en échec) : on n'invente pas un classement. */
  it('⚠️ `null` partout n’hérite de rien', () => {
    expect(classementHerite({ biens: null, filInterne: null, messageHorsGestion: null }))
      .toEqual({ cibles: [], interne: false, horsGestion: false });
  });

  it('🔴 JAMAIS deux états à la fois : les biens l’emportent sur « interne » et « hors gestion »', () => {
    const h = classementHerite({ biens: [LOT('421')], filInterne: true, messageHorsGestion: true });
    expect(h.interne).toBe(false);
    expect(h.horsGestion).toBe(false);
    expect(h.cibles).toHaveLength(1);
  });

  it('⚠️ un lien qui ne vise pas un logement n’est pas hérité', () => {
    expect(classementHerite({ biens: [{ sorte: 'proprietaire', cle: 'P1', id: null, libelle: 'MARTY' }] }).cibles)
      .toEqual([]);
  });

  it('⚠️ un bien sans libellé n’est pas hérité : il laisserait une ligne vide sous la case', () => {
    expect(classementHerite({ biens: [{ sorte: 'lot', cle: '421', id: null, libelle: '   ' }] }).cibles).toEqual([]);
  });

  it('⚠️ le même bien rattaché deux fois n’est hérité qu’une', () => {
    expect(classementHerite({ biens: [LOT('421'), LOT('421')] }).cibles).toHaveLength(1);
  });
});

/**
 * ══ 🔴🔴 ④ L'ANIMATION « D — ÉLASTIQUE » : LES DURÉES D'ARNO, AU MILLISECONDE PRÈS ═════════════════════════════
 *
 * « la case choisie passe de la moitié à toute la largeur en 300 ms, easing cubic-bezier(.34,1.56,.64,1) […]
 * l'autre case s'efface en 180 ms […] puis rebond simple de 260 ms […] Total ≈ 560 ms. »
 */
describe('🔴🔴 ④ les durées de l’animation validée par Arno', () => {
  it('🔴 300 ms d’extension, 180 ms d’effacement, 260 ms de rebond', () => {
    expect([ANIM_ETENDRE_MS, ANIM_EFFACER_MS, ANIM_REBOND_MS]).toEqual([300, 180, 260]);
  });

  it('🔴 le total annoncé — environ 560 ms', () => {
    expect(ANIM_TOTAL_MS).toBe(560);
  });

  it('🔴 le léger dépassement, écrit une seule fois', () => {
    expect(ANIM_COURBE_ELASTIQUE).toBe('cubic-bezier(.34,1.56,.64,1)');
  });
});

/**
 * ══ 🔴🔴 ⑤ LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — LES DEUX SENS DU MOUVEMENT ════════════════════════════
 *
 * ARNO : « Ajoute l'animation inverse, quand le gros bouton vert se scinde en Rattacher (rouge) et Interne
 * (blanc). […] Passage direct de Rattaché à Interne (ou l'inverse) : scission, puis réunion du côté de l'autre
 * bouton. »
 */
describe('🔴🔴 ⑤ ce qu’il faut jouer pour passer d’un état à l’autre', () => {
  it('🔴 des deux boutons à une case verte : une RÉUNION, et rien d’autre', () => {
    expect(etapesAnimation('rien', 'rattache')).toEqual([{ geste: 'reunion', etat: 'rattache' }]);
    expect(etapesAnimation('rien', 'interne')).toEqual([{ geste: 'reunion', etat: 'interne' }]);
    expect(etapesAnimation('rien', 'hors_gestion')).toEqual([{ geste: 'reunion', etat: 'hors_gestion' }]);
  });

  /**
   * ══ 🔴🔴 L'INVENTAIRE DES CHEMINS QUI RAMÈNENT À « À CLASSER » ════════════════════════════════════════════
   *
   * Arno demande l'inventaire de TOUS les chemins. Les voici — et ils produisent tous la MÊME étape, parce
   * qu'ils passent tous par le même entonnoir : l'état du bloc.
   *   ① décocher le dernier bien, puis « Valider — aucun bien »  ⇒ rattache → rien
   *   ② cliquer la case verte « Interne »                        ⇒ interne  → rien
   *   ③ cliquer la case verte « Hors gestion »                   ⇒ hors_gestion → rien
   *   ④ « Annuler » / « Retirer » un rattachement                ⇒ rattache → rien
   *   ⑤ le bloc « Suivi dans la conversation » qui ne porte plus rien ⇒ rattache → rien
   *   ⑥ un classement HÉRITÉ qui disparaît                       ⇒ rattache/interne/hors_gestion → rien
   */
  it('🔴🔴 TOUS les chemins vers « À classer » donnent une SCISSION', () => {
    for (const depuis of ['rattache', 'interne', 'hors_gestion'] as const) {
      expect(etapesAnimation(depuis, 'rien'), depuis).toEqual([{ geste: 'scission', etat: depuis }]);
    }
  });

  it('🔴🔴 d’une case verte à l’autre : scission PUIS réunion', () => {
    expect(etapesAnimation('rattache', 'interne')).toEqual([
      { geste: 'scission', etat: 'rattache' }, { geste: 'reunion', etat: 'interne' },
    ]);
    expect(etapesAnimation('interne', 'rattache')).toEqual([
      { geste: 'scission', etat: 'interne' }, { geste: 'reunion', etat: 'rattache' },
    ]);
  });

  /** ⚠️ C'EST CE QUI INTERDIT LA DOUBLE ANIMATION quand la liste se rafraîchit sans rien changer. */
  it('⚠️ le même état deux fois ne joue RIEN', () => {
    for (const e of ['rien', 'rattache', 'interne', 'hors_gestion'] as const) {
      expect(etapesAnimation(e, e), e).toEqual([]);
    }
  });

  /** 🔴 LE CÔTÉ : « Rattaché » vient du bouton rouge, à gauche ; « Interne » du blanc, à droite. */
  it('🔴 chaque case verte sait de quel côté elle se rétracte', () => {
    expect(coteDeLaCase('rattache')).toBe('gauche');
    expect(coteDeLaCase('interne')).toBe('droite');
    // « Hors gestion » n'a pas de bouton à lui : il suit « Interne », par où il se pose.
    expect(coteDeLaCase('hors_gestion')).toBe('droite');
  });
});

/** 🔴 LA PHRASE D'ARNO QUAND LE MOTEUR NE TROUVE RIEN — citée, jamais recopiée. */
describe('🔴🔴 ⑥ « aucune proposition » se dit, et dit quoi faire', () => {
  it('🔴 la phrase est celle d’Arno, au mot près', () => {
    expect(AUCUNE_PROPOSITION).toBe('Aucune proposition disponible pour ce mail. '
      + 'Utilise le moteur de recherche ci-dessous pour sélectionner le ou les biens en relation avec ce mail.');
  });

  it('⚠️ elle ne compte rien : c’est tout l’objet du changement', () => {
    expect(AUCUNE_PROPOSITION).not.toContain('0');
    expect(AUCUNE_PROPOSITION).toContain('moteur de recherche');
  });
});

/** 🔒 LE MODULE EST PUR : il ne connaît ni la base, ni le DOM, ni React. */
describe('🔒 module pur', () => {
  it('🔒 aucun import', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/classementAvantEnvoi.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
