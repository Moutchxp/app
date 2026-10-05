import { describe, it, expect } from 'vitest';
import {
  adresseDuBien, aideSortirDuSuivi, classementEnVigueurSansLeBien, classementSansLeBien, lotsApresSortie,
  motConfirmationSortie, motMailSorti, MOT_SORTIR_DU_SUIVI, SECONDES_ANNULER_SORTIE, suitCeBien,
} from './sortirDuSuivi';
import type { Classement } from './periodesConversation';
import { capsuleDuMessage, motCapsule } from './statutClassement';
import type { LienAffiche } from './rattachementRepo';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « SORTIR DU SUIVI » ══════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « le mail est détaché de CE bien uniquement, avec ses pièces […]. Les autres biens
 * éventuels du mail ne bougent pas. […] Si le mail n'a plus AUCUN bien : il repasse “À classer” dans la boîte
 * (pas Interne). »
 *
 * CE FICHIER TIENT LES QUATRE PROMESSES QUI SE VÉRIFIENT SANS ÉCRAN :
 *
 *   ① LE MAIL MONO-BIEN sort complètement : la liste reposée est VIDE, et sa pastille devient « À classer ».
 *   ② LE MAIL MULTI-BIENS ne perd que celui-ci : les autres sont reposés tels quels.
 *   ③ CE QUI N'EST PAS UN BIEN NE DEVIENT PAS UN BIEN : événements, propositions et liens de PIÈCE sont écartés.
 *   ④ LA QUESTION POSÉE AVANT dit le bien et le nombre de pièces, et se tait quand il n'y en a aucune.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const lien = (o: Partial<LienAffiche> = {}): LienAffiche => ({
  id: 1, messageId: 100, pieceId: null,
  cible: { sorte: 'lot', cle: '421', id: null },
  libelle: '28 Avenue Marceau, 92400 COURBEVOIE — Appartement — lot 421',
  natureLot: null, statut: 'confirme', origine: 'manuel', parUnHumain: true,
  creeLe: '2026-03-01T09:00:00Z', creeParLibelle: 'a.jorel@sansvisavis.com', parPiece: false,
  ...o,
} as LienAffiche);

describe('🔴🔴 ① le mail qui ne suit QUE ce bien en sort complètement', () => {
  it('🔴🔴 la liste reposée est VIDE — et c’est un classement valide, pas un non-geste', () => {
    const enVigueur: Classement = { sorte: 'biens', biens: [{ cle: '421', libelle: 'Marceau' }] };
    expect(classementSansLeBien({ enVigueur, liens: [lien()], cleDuBien: '421' }))
      .toEqual({ sorte: 'biens', biens: [], personnes: [] });
  });

  /**
   * 🔴🔴 LA RÈGLE D'ARNO, TENUE PAR LE MODULE QUI DÉCIDE DÉJÀ DES PASTILLES : « il repasse À classer […] (pas
   * Interne) ». Rien n'est écrit ici pour l'obtenir — c'est `capsuleDuMessage` qui le dit, et c'est pour cela que
   * la réponse ne peut pas diverger de celle de la boîte.
   */
  it('🔴🔴 sans plus aucun bien, la pastille est « À classer » — jamais « Interne »', () => {
    const capsule = capsuleDuMessage([]);
    expect(capsule).toBe('a_classer');
    expect(motCapsule(capsule)).toBe('À classer');
    /* ⚠️ « Interne » ne s'obtient QUE si l'échange porte la marque, et ce geste ne la pose pas. */
    expect(capsule).not.toBe('interne');
  });

  it('⚠️ le bouton n’a de sens que sur un mail qui suit CE bien', () => {
    expect(suitCeBien([lien()], '421')).toBe(true);
    expect(suitCeBien([lien()], '155')).toBe(false);
    expect(suitCeBien([], '421')).toBe(false);
  });
});

describe('🔴🔴 ② le mail multi-biens ne perd que celui-ci', () => {
  const trois = [
    lien({ id: 1, cible: { sorte: 'lot', cle: '421', id: null }, libelle: 'Marceau — lot 421' }),
    lien({ id: 2, cible: { sorte: 'lot', cle: '155', id: null }, libelle: 'Carnot — lot 155' }),
    lien({ id: 3, cible: { sorte: 'proprietaire', cle: 'P-9', id: null }, libelle: 'ROI Nathan' }),
  ];
  /** La configuration que le SUIVI applique à ce mail : deux lots, et une personne avec son contact. */
  const EN_VIGUEUR: Classement = {
    sorte: 'biens',
    biens: [{ cle: '421', libelle: 'Marceau — lot 421' }, { cle: '155', libelle: 'Carnot — lot 155' }],
    personnes: [{ sorte: 'proprietaire', cle: 'P-9', libelle: 'ROI Nathan', contactExterneId: 12 }],
  };

  /**
   * 🔴🔴 « Les autres biens éventuels du mail ne bougent pas » (Arno). Ils ne bougent pas PARCE QU'ON LES REPOSE :
   * le geste réécrit la liste entière du mail, il ne « retire » pas un lien. C'est ce qui le rend stable le jour
   * où la projection se recalcule.
   */
  it('🔴🔴 l’autre lot est reposé, avec son libellé', () => {
    expect(classementEnVigueurSansLeBien(EN_VIGUEUR, '421')?.biens)
      .toEqual([{ cle: '155', libelle: 'Carnot — lot 155' }]);
  });

  /**
   * 🔴🔴 LA PERSONNE EST REPOSÉE TELLE QUELLE, SON CONTACT EXTÉRIEUR COMPRIS. C'est le second dégât de l'essai
   * réel du 05/10 : sans elle dans la liste, le diff de la fenêtre RETIRE l'intervention — et « via Arnaud
   * JOREL » disparaît du mail sans que personne l'ait demandé.
   */
  it('🔴🔴 les personnes sont reposées telles quelles, contact compris', () => {
    expect(classementEnVigueurSansLeBien(EN_VIGUEUR, '421')?.personnes)
      .toEqual([{ sorte: 'proprietaire', cle: 'P-9', libelle: 'ROI Nathan', contactExterneId: 12 }]);
  });

  /**
   * 🔴🔴 ET UN PROPRIÉTAIRE N'ENTRE JAMAIS DANS `biens`. C'est le PREMIER dégât de l'essai réel : `Classement.biens`
   * se projette en `cible_sorte = 'lot'`, et le propriétaire 45 était devenu « lot 45 », un autre bien.
   */
  it('🔴🔴 le repli ne met dans `biens` que des LOTS', () => {
    expect(lotsApresSortie(trois, '421')).toEqual([{ cle: '155', libelle: 'Carnot — lot 155' }]);
  });

  it('⚠️ sortir d’un bien que le mail ne suit pas ne retire rien', () => {
    expect(classementEnVigueurSansLeBien(EN_VIGUEUR, '999')?.biens).toHaveLength(2);
    expect(lotsApresSortie(trois, '999')).toHaveLength(2);
  });

  /** ⚠️ UN ENSEMBLE, PAS UNE LISTE : deux liens vers le même lot ne font qu'une entrée dans le repli. */
  it('⚠️ un lot présent deux fois n’est reposé qu’une', () => {
    expect(lotsApresSortie([...trois, lien({ id: 4, cible: { sorte: 'lot', cle: '155', id: null } })], '421')
      .map((b) => b.cle)).toEqual(['155']);
  });

  /**
   * 🔴🔴 ET AUCUNE PERSONNE QUAND IL NE RESTE PLUS AUCUN BIEN. La base refuse une intervention sans bien
   * (migration 293), et la règle d'Arno le dit déjà : « une intervention ne survit pas au départ de son bien ».
   * Les envoyer quand même faisait REFUSER le geste entier — mesuré à l'écran sur le mail 57471.
   */
  it('🔴🔴 plus aucun bien ⇒ aucune personne reposée : la cascade s’en charge', () => {
    const seul: Classement = {
      sorte: 'biens',
      biens: [{ cle: '26', libelle: 'Union — lot 26' }],
      personnes: [{ sorte: 'proprietaire', cle: '45', libelle: 'JOREL Arnaud', contactExterneId: 9 }],
    };
    expect(classementEnVigueurSansLeBien(seul, '26')).toEqual({ sorte: 'biens', biens: [], personnes: [] });
  });

  /**
   * 🔴 LE REPLI NE SERT QUE SI AUCUNE FENÊTRE NE COUVRE LE MAIL, et il ne repose alors AUCUNE personne : une
   * intervention ne peut avoir été posée que par une fenêtre, et il n'y en a pas. Le diff ne retire donc rien.
   */
  it('🔴 sans configuration en vigueur, on retombe sur les LOTS du mail, sans personne', () => {
    expect(classementSansLeBien({ enVigueur: undefined, liens: trois, cleDuBien: '421' }))
      .toEqual({ sorte: 'biens', biens: [{ cle: '155', libelle: 'Carnot — lot 155' }], personnes: [] });
  });

  /** ⚠️ UNE FENÊTRE « interne » OU « hors gestion » N'EST PAS UN CLASSEMENT DE BIENS : on retombe sur les liens. */
  it('⚠️ une fenêtre d’une autre sorte renvoie au repli', () => {
    expect(classementEnVigueurSansLeBien({ sorte: 'interne', biens: [] }, '421')).toBeUndefined();
  });
});

describe('🔴 ③ ce qui n’est pas un bien ne devient pas un bien', () => {
  /** Un événement n'est pas un bien — c'est déjà la règle de `capsuleDuMessage` (`SORTES_BIEN`). */
  it('🔴 un lien vers un ÉVÉNEMENT est écarté', () => {
    const liens = [lien({ cible: { sorte: 'evenement', cle: null, id: 7 }, libelle: 'GES-2026-000001' })];
    expect(lotsApresSortie(liens, '421')).toEqual([]);
  });

  /** Une proposition n'est pas une décision : la reposer en exception l'aurait transformée en décision prise. */
  it('🔴 un lien PROPOSÉ et non confirmé est écarté', () => {
    expect(lotsApresSortie([lien({ statut: 'propose' } as Partial<LienAffiche>)], '421')).toEqual([]);
  });

  /**
   * 🔴🔴 UN LIEN DE PIÈCE N'EST PAS UN LIEN DE MAIL. Le reposer en exception de mail aurait élargi sa portée en
   * silence : une pièce classée seule serait devenue un bien du mail entier.
   */
  it('🔴🔴 un lien de PIÈCE est écarté', () => {
    const liens = [lien({ pieceId: 55, cible: { sorte: 'lot', cle: '155', id: null }, libelle: 'Carnot' })];
    expect(lotsApresSortie(liens, '421')).toEqual([]);
  });

  it('⚠️ une clé vide est écartée plutôt que reposée', () => {
    expect(lotsApresSortie([lien({ cible: { sorte: 'lot', cle: '  ', id: null } })], '421')).toEqual([]);
  });

  /** ⚠️ UN LIBELLÉ VIDE RETOMBE SUR LA CLÉ : une ligne sans nom se relirait sans qu'on sache de quel bien on parle. */
  it('⚠️ un libellé vide retombe sur la clé', () => {
    const liens = [lien({ cible: { sorte: 'lot', cle: '155', id: null }, libelle: '   ' })];
    expect(lotsApresSortie(liens, '421')).toEqual([{ cle: '155', libelle: '155' }]);
  });
});

describe('🔴🔴 ④ ce que l’écran dit avant, et après', () => {
  it('🔴🔴 la question d’Arno, mot pour mot', () => {
    expect(motConfirmationSortie({ adresseDuBien: '28 Avenue Marceau', nbPieces: 3 }))
      .toBe('Sortir ce mail du suivi de 28 Avenue Marceau ? Ses 3 pièces jointes quitteront aussi cet historique.');
  });

  /** ⚠️ UNE CONFIRMATION QUI ÉNUMÈRE DES RIENS EST UNE CONFIRMATION QU'ON APPREND À NE PLUS LIRE. */
  it('⚠️ aucune pièce ⇒ la seconde phrase disparaît', () => {
    expect(motConfirmationSortie({ adresseDuBien: '28 Avenue Marceau', nbPieces: 0 }))
      .toBe('Sortir ce mail du suivi de 28 Avenue Marceau ?');
  });

  it('⚠️ une seule pièce se dit au singulier', () => {
    expect(motConfirmationSortie({ adresseDuBien: 'Marceau', nbPieces: 1 }))
      .toContain('Sa pièce jointe quittera aussi cet historique.');
  });

  /** 🔴 L'ADRESSE, ET NON LE TITRE ENTIER : une question qu'on ne lit pas jusqu'au bout se clique sans être lue. */
  it('🔴 l’adresse est le premier segment du titre du bien', () => {
    expect(adresseDuBien('28 Avenue Marceau, 92400 COURBEVOIE — Appartement — lot 421'))
      .toBe('28 Avenue Marceau, 92400 COURBEVOIE');
  });

  it('⚠️ un titre sans séparateur est rendu entier, et un titre vide dit « ce bien »', () => {
    expect(adresseDuBien('Lot sans adresse')).toBe('Lot sans adresse');
    expect(adresseDuBien('   ')).toBe('ce bien');
  });

  it('⚠️ l’info-bulle NOMME le bien, et dit ce qui ne bouge pas', () => {
    const aide = aideSortirDuSuivi('28 Avenue Marceau');
    expect(aide).toContain('28 Avenue Marceau');
    expect(aide).toContain('ne bougent pas');
  });

  it('⚠️ le bandeau d’après nomme le bien, lui aussi', () => {
    expect(motMailSorti('28 Avenue Marceau')).toBe('Mail sorti du suivi de 28 Avenue Marceau.');
  });

  it('⚠️ le mot du bouton est court — il vit à droite d’un en-tête déjà chargé', () => {
    expect(MOT_SORTIR_DU_SUIVI).toBe('Sortir du suivi');
  });

  /**
   * 🔴 LA FENÊTRE D'ANNULATION RESTE BIEN EN DEÇÀ DE CE QUE LE DÉPÔT PERMET : `annulerClassement` refuse de
   * défaire un geste vieux de plus de DEUX MINUTES. Un « Annuler » offert au-delà serait un bouton qui échoue.
   */
  it('🔴 « Annuler » dure moins longtemps que la garde du dépôt (2 minutes)', () => {
    expect(SECONDES_ANNULER_SORTIE).toBeGreaterThan(0);
    expect(SECONDES_ANNULER_SORTIE).toBeLessThan(120);
  });
});
