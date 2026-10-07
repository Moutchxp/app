import { describe, it, expect } from 'vitest';
import {
  bulleEtoileLigne, clicPoseLEtoile, ETOILE_LIGNE_VIDE, etoileDeLaLigne, etoileLigneApresSignal,
  nomDuMailEtoile, sorteEtoileLigne, type MailEtoile,
} from './etoileLigne';

/**
 * ══ 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — LES TROIS ÉTATS DE L'ÉTOILE D'UNE LIGNE ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026, fil 383 « Fenêtre cassée ») : la ligne de la Réception affiche une étoile rouge
 * PLEINE. On ouvre la conversation : le mail que la ligne montre (houda ghannam, 06/10 17:26, message 57634) n'a
 * AUCUNE étoile. Elle est sur un autre mail du même échange (didier.caussanel, 24 sept. 21:08).
 *
 * RÈGLE D'ARNO :
 *   ① PLEINE si le mail affiché par la ligne est lui-même étoilé ;
 *   ② CREUSE si le mail affiché ne l'est pas mais qu'un AUTRE mail de la conversation l'est ;
 *   ③ RIEN si aucun mail de la conversation n'est étoilé ;
 *   ④ la creuse disparaît dès qu'on retire l'étoile de l'autre mail — « aucun état mémorisé à part : c'est un
 *      calcul ».
 *
 * 🔒 Module PUR : aucune base, aucun réseau, aucun React. C'est le MÊME calcul que le serveur (`boiteRepo`,
 * `rechercheBoite`) et que l'écran (`BoiteMail`, `BarreLigne`) — l'éprouver ici l'éprouve pour les quatre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les deux mails du fil 383, aux heures qu'Arno a relevées. */
const AFFICHE = 57634;
const HOUDA: MailEtoile = {
  messageId: AFFICHE, de: 'houda.ghannam@gmail.com', deNom: 'houda ghannam', recuLe: '2026-10-06T15:26:00Z',
};
const DIDIER: MailEtoile = {
  messageId: 55012, de: 'didier.caussanel@free.fr', deNom: 'Didier Caussanel', recuLe: '2026-09-24T19:08:00Z',
};

describe('🔴🔴 ① les trois états', () => {
  /** ① PLEINE — le mail que la ligne montre porte lui-même l'étoile. */
  it('🔴 PLEINE quand le mail affiché est étoilé', () => {
    const e = etoileDeLaLigne([HOUDA], AFFICHE);
    expect(e.duMessage).toBe(true);
    expect(sorteEtoileLigne(e)).toBe('pleine');
  });

  /**
   * ② CREUSE — LE CAS D'ARNO, À L'IDENTIQUE. L'étoile est sur le mail de didier.caussanel ; la ligne montre celui
   * de houda ghannam. Avant ce lot, elle affichait une PLEINE et promettait ce que le mail montré ne tenait pas.
   */
  it('🔴🔴 CREUSE quand l’étoile est sur un AUTRE mail — le cas du fil 383', () => {
    const e = etoileDeLaLigne([DIDIER], AFFICHE);
    expect(e.duMessage).toBe(false);
    expect(e.ailleurs).toEqual(DIDIER);
    expect(sorteEtoileLigne(e)).toBe('creuse');
  });

  /** ③ RIEN — aucun mail de la conversation n'est étoilé. */
  it('🔴 AUCUNE quand rien n’est étoilé dans la conversation', () => {
    const e = etoileDeLaLigne([], AFFICHE);
    expect(e).toEqual(ETOILE_LIGNE_VIDE);
    expect(sorteEtoileLigne(e)).toBe('aucune');
  });

  /**
   * ⚠️ PLEINE GAGNE SUR CREUSE quand les DEUX sont étoilés : il n'y a qu'une étoile à dessiner, et c'est celle du
   * mail qu'on montre. L'autre existe toujours — il resservira si l'on retire celle-ci (voir ④).
   */
  it('⚠️ le mail affiché l’emporte quand les deux sont étoilés', () => {
    const e = etoileDeLaLigne([DIDIER, HOUDA], AFFICHE);
    expect(sorteEtoileLigne(e)).toBe('pleine');
    expect(e.ailleurs).toEqual(DIDIER);
  });

  /**
   * 🔴 L'AUTRE MAIL NOMMÉ EST LE PLUS RÉCENT, et l'ordre est TOTAL : deux mails reçus à la même seconde existent,
   * et la bulle ne doit pas nommer l'un ou l'autre selon l'ordre où la requête les a rendus.
   */
  it('🔴 avec plusieurs autres mails étoilés, c’est le plus récent qui est nommé', () => {
    const vieux: MailEtoile = { ...DIDIER, messageId: 1, recuLe: '2026-01-01T00:00:00Z' };
    expect(etoileDeLaLigne([vieux, DIDIER], AFFICHE).ailleurs).toEqual(DIDIER);
    expect(etoileDeLaLigne([DIDIER, vieux], AFFICHE).ailleurs).toEqual(DIDIER);
  });

  it('⚠️ à la même seconde, l’identifiant tranche — et toujours dans le même sens', () => {
    const a: MailEtoile = { ...DIDIER, messageId: 10 };
    const b: MailEtoile = { ...DIDIER, messageId: 11 };
    expect(etoileDeLaLigne([a, b], AFFICHE).ailleurs?.messageId).toBe(11);
    expect(etoileDeLaLigne([b, a], AFFICHE).ailleurs?.messageId).toBe(11);
  });
});

describe('🔴🔴 ② la bulle d’aide', () => {
  /** DEMANDE D'ARNO, mot pour mot : « Un autre message de cette conversation est étoilé (expéditeur, date) ». */
  it('🔴🔴 la creuse NOMME l’autre mail : expéditeur et date', () => {
    const texte = bulleEtoileLigne(etoileDeLaLigne([DIDIER], AFFICHE));
    expect(texte).toContain('Un autre message de cette conversation est étoilé');
    expect(texte).toContain('Didier Caussanel');
    /* ⚠️ LA DATE EST CELLE DU MODULE, en heure de Paris : 21:08 pour un mail reçu à 19:08 UTC le 24 septembre. */
    expect(texte).toContain('24 septembre 2026');
    expect(texte).toContain('21:08');
  });

  it('🔴 la pleine parle du mail qu’on regarde, et de lui seul', () => {
    expect(bulleEtoileLigne(etoileDeLaLigne([HOUDA], AFFICHE))).toBe('Ce message est étoilé.');
  });

  /** ⚠️ PAS D'ÉTOILE ⇒ PAS DE PHRASE : rendre un texte aurait invité à dessiner une étoile pour le porter. */
  it('⚠️ sans étoile, aucune phrase', () => {
    expect(bulleEtoileLigne(ETOILE_LIGNE_VIDE)).toBe('');
  });

  /** ⚠️ SANS NOM, L'ADRESSE — jamais « undefined », jamais les deux ensemble. */
  it('⚠️ un expéditeur sans nom est nommé par son adresse', () => {
    expect(nomDuMailEtoile({ ...DIDIER, deNom: null })).toBe('didier.caussanel@free.fr');
    expect(nomDuMailEtoile({ ...DIDIER, deNom: '   ' })).toBe('didier.caussanel@free.fr');
  });
});

describe('🔴🔴 ③ le clic ne touche que le mail affiché', () => {
  /**
   * RÈGLE D'ARNO : « pleine → vide, vide ou creuse → pleine ». Le cas qui compte est la CREUSE : dessinée en
   * contour, elle ressemble à une étoile éteinte, et l'ancien `!etat.etoilee` l'aurait lue « l'échange est
   * étoilé, donc on retire » — décrochant l'étoile d'un mail qu'on ne regardait même pas.
   */
  it('🔴🔴 cliquer une CREUSE POSE l’étoile sur le mail affiché', () => {
    expect(clicPoseLEtoile(etoileDeLaLigne([DIDIER], AFFICHE))).toBe(true);
  });

  it('🔴 cliquer une PLEINE la retire', () => {
    expect(clicPoseLEtoile(etoileDeLaLigne([HOUDA], AFFICHE))).toBe(false);
  });

  it('🔴 cliquer une ligne sans étoile en pose une', () => {
    expect(clicPoseLEtoile(ETOILE_LIGNE_VIDE)).toBe(true);
  });

  /**
   * 🔴🔴 LE CAS D'ARNO, BOUCLÉ : « Cas creuse + clic : le mail affiché devient étoilé, la ligne passe en pleine,
   * et l'autre mail garde son étoile. »
   */
  it('🔴🔴 creuse + clic ⇒ pleine, et l’autre mail garde la sienne', () => {
    const avant = etoileDeLaLigne([DIDIER], AFFICHE);
    const apres = etoileLigneApresSignal(avant, AFFICHE,
      { messageId: AFFICHE, etoilee: clicPoseLEtoile(avant), etoiles: null });
    expect(sorteEtoileLigne(apres)).toBe('pleine');
    expect(apres.ailleurs).toEqual(DIDIER);
  });
});

describe('🔴🔴 ④ après un geste : la creuse apparaît et disparaît toute seule', () => {
  /**
   * 🔴🔴 RÈGLE 4 D'ARNO : « l'étoile creuse disparaît dès qu'on retire l'étoile du mail concerné dans la
   * conversation (aucun état mémorisé à part : c'est un calcul) ». La conversation annonce la liste complète ;
   * la ligne recalcule.
   */
  it('🔴🔴 retirer l’étoile de l’AUTRE mail dans la conversation fait disparaître la creuse', () => {
    const avant = etoileDeLaLigne([DIDIER], AFFICHE);
    expect(sorteEtoileLigne(avant)).toBe('creuse');
    const apres = etoileLigneApresSignal(avant, AFFICHE, { messageId: DIDIER.messageId, etoilee: false, etoiles: [] });
    expect(sorteEtoileLigne(apres)).toBe('aucune');
  });

  /** 🔴 ET DANS L'AUTRE SENS : étoiler un autre mail depuis la conversation fait APPARAÎTRE la creuse. */
  it('🔴 étoiler un autre mail fait apparaître la creuse', () => {
    const apres = etoileLigneApresSignal(ETOILE_LIGNE_VIDE, AFFICHE,
      { messageId: DIDIER.messageId, etoilee: true, etoiles: [DIDIER] });
    expect(sorteEtoileLigne(apres)).toBe('creuse');
    expect(apres.ailleurs).toEqual(DIDIER);
  });

  /**
   * 🔴🔴 RETIRER L'ÉTOILE DU MAIL AFFICHÉ NE REND PAS LA LIGNE MUETTE si un autre mail garde la sienne : elle
   * passe de PLEINE à CREUSE. C'est pour cela que `ailleurs` voyage même sur une pleine — sans quoi l'écran
   * devrait relire, et la ligne clignoterait.
   */
  it('🔴🔴 pleine → creuse quand on retire l’étoile du mail affiché', () => {
    const avant = etoileDeLaLigne([DIDIER, HOUDA], AFFICHE);
    const apres = etoileLigneApresSignal(avant, AFFICHE, { messageId: AFFICHE, etoilee: false, etoiles: null });
    expect(sorteEtoileLigne(apres)).toBe('creuse');
    expect(apres.ailleurs).toEqual(DIDIER);
  });

  /** ⚠️ UN SIGNAL QUI NOMME UN AUTRE MAIL, SANS LA LISTE : on ne sait rien, on garde ce qu'on a. */
  it('⚠️ un geste sur un autre mail, sans la liste, ne change rien', () => {
    const avant = etoileDeLaLigne([HOUDA], AFFICHE);
    expect(etoileLigneApresSignal(avant, AFFICHE, { messageId: 999, etoilee: true, etoiles: null })).toBe(avant);
  });

  /**
   * ⚠️ `messageId: null` = LA PORTE D'AVANT LA MIGRATION 277, où l'étoile EST celle de l'ÉCHANGE : la question
   * « quel mail ? » n'y existe pas. L'échange s'allume ou s'éteint, et l'éteindre efface aussi l'ailleurs — cette
   * porte retire l'étoile de TOUS les messages du fil. C'est le comportement d'avant ce lot, conservé tel quel.
   */
  it('⚠️ un geste sur l’ÉCHANGE entier allume ou éteint la ligne, comme avant', () => {
    const allume = etoileLigneApresSignal(ETOILE_LIGNE_VIDE, AFFICHE,
      { messageId: null, etoilee: true, etoiles: null });
    expect(sorteEtoileLigne(allume)).toBe('pleine');
    const eteint = etoileLigneApresSignal(etoileDeLaLigne([DIDIER, HOUDA], AFFICHE), AFFICHE,
      { messageId: null, etoilee: false, etoiles: null });
    expect(sorteEtoileLigne(eteint)).toBe('aucune');
  });
});

describe('🔴 ⑤ un fil d’un SEUL mail ne change pas de comportement', () => {
  /**
   * 🔴 C'EST LE CAS DE LA GRANDE MAJORITÉ DES LIGNES, et il ne doit RIEN voir de ce lot : un seul mail, donc
   * jamais d'« ailleurs », donc jamais de creuse. Pleine ou rien, exactement comme avant.
   */
  it('🔴 un seul mail étoilé ⇒ PLEINE, et aucun « ailleurs »', () => {
    const e = etoileDeLaLigne([HOUDA], AFFICHE);
    expect(sorteEtoileLigne(e)).toBe('pleine');
    expect(e.ailleurs).toBeNull();
    expect(bulleEtoileLigne(e)).toBe('Ce message est étoilé.');
  });

  it('🔴 un seul mail NON étoilé ⇒ aucune étoile', () => {
    expect(sorteEtoileLigne(etoileDeLaLigne([], AFFICHE))).toBe('aucune');
  });

  /** 🔴 ET LE CLIC Y FAIT CE QU'IL A TOUJOURS FAIT : poser, puis retirer. */
  it('🔴 poser puis retirer, sans jamais passer par une creuse', () => {
    const vide = ETOILE_LIGNE_VIDE;
    const pose = etoileLigneApresSignal(vide, AFFICHE,
      { messageId: AFFICHE, etoilee: true, etoiles: [HOUDA] });
    expect(sorteEtoileLigne(pose)).toBe('pleine');
    const retire = etoileLigneApresSignal(pose, AFFICHE, { messageId: AFFICHE, etoilee: false, etoiles: [] });
    expect(sorteEtoileLigne(retire)).toBe('aucune');
  });
});
