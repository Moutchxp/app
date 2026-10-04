import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  interneDuMail, mailsCouvertsParLeChoix, MOTIF_INTERNE_PAR_SUIVI, MOTIF_INTERNE_REPRISE,
} from './interneDuMail';

/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — « INTERNE » EST UN STATUT PAR MAIL ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LE DIAGNOSTIC A ÉTABLI, ET QUI EST LA RAISON D'ÊTRE DE CE FICHIER.
 *
 * La migration 297 (`gestion_message_interne`) a été LIVRÉE le 03/10/2026 par le commit 559d394a, qui s'est arrêté
 * VOLONTAIREMENT. Son message le dit mot pour mot : « Le modèle complet demande une marque PAR MAIL, donc la
 * MIGRATION 297 […], LIVRÉE ET NON APPLIQUÉE. Je m'arrête là et je demande l'accord d'Arno. »
 *
 * 🔴 LE CODE N'A DONC JAMAIS ÉTÉ ÉCRIT — RIEN N'A ÉTÉ PERDU. Vérifié : `git log -S"gestion_message_interne" --all`
 * ne rend que DEUX commits, celui de la migration et un commentaire du 04/10. Aucun fichier `.ts` n'a jamais nommé
 * la table. Arno a donné son accord le 04/10, et c'est ce lot qui la câble.
 *
 * RÈGLE VALIDÉE : « Interne est un statut PAR MAIL. Le choix fait sur un mail s'applique selon les 3 fenêtres. Un
 * choix ultérieur ne doit jamais effacer le statut Interne d'un mail antérieur. Le repli sur la marque d'échange
 * reste un repli, utilisé seulement quand rien ne couvre le mail. »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA RÈGLE DU REPLI — TROIS CAS, ET LE PIÈGE QU'ELLE ÉVITE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ce mail est-il « interne » ?', () => {
  /** 🔴 ① LA MARQUE PAR MAIL VIVANTE GAGNE : c'est la vérité la plus précise qu'on ait. */
  it('🔴 une marque par mail vivante suffit, même sans marque d’échange', () => {
    expect(interneDuMail({
      marqueDuMailVivante: true, marqueDuMailConnue: true, marqueDeLEchange: false,
    })).toBe(true);
  });

  /**
   * ══ 🔴🔴 ② LE PIÈGE PRINCIPAL — UNE MARQUE RETIRÉE N'EST PAS UNE ABSENCE DE MARQUE ═════════════════════════════
   *
   * Sans ce cas, retirer « Interne » d'un mail d'une conversation marquée interne n'aurait AUCUN effet visible :
   * le repli le remettrait aussitôt. Quelqu'un cliquerait trois fois, puis conclurait que le bouton ne marche pas.
   * C'est la raison pour laquelle le dépôt rend les lignes RETIRÉES en plus des vivantes.
   */
  it('🔴🔴 une marque par mail RETIRÉE veut dire « non », et l’échange ne la ressuscite pas', () => {
    expect(interneDuMail({
      marqueDuMailVivante: false, marqueDuMailConnue: true, marqueDeLEchange: true,
    })).toBe(false);
  });

  /** 🔴 ③ LE REPLI D'ARNO : personne ne s'est prononcé sur ce mail → la marque d'échange répond. */
  it('🔴 sans aucune marque par mail, l’échange répond', () => {
    expect(interneDuMail({
      marqueDuMailVivante: false, marqueDuMailConnue: false, marqueDeLEchange: true,
    })).toBe(true);
    expect(interneDuMail({
      marqueDuMailVivante: false, marqueDuMailConnue: false, marqueDeLEchange: false,
    })).toBe(false);
  });

  /**
   * ⚠️ SANS LA MIGRATION 297, LE COMPORTEMENT EST CELUI D'AVANT CE LOT, AU BIT PRÈS : la table n'est nommée nulle
   * part, les deux signaux par mail sont faux, et la règle retombe sur la seule marque d'échange.
   */
  it('⚠️ sans la 297, la règle est exactement l’ancienne', () => {
    for (const echange of [true, false]) {
      expect(interneDuMail({
        marqueDuMailVivante: false, marqueDuMailConnue: false, marqueDeLEchange: echange,
      })).toBe(echange);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LES TROIS FENÊTRES D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 les mails qu’un choix couvre', () => {
  /** L'ordre est CHRONOLOGIQUE, du plus ancien au plus récent — les six mails du fil 3490. */
  const MAILS = [5495, 5499, 57122, 57368, 57472, 57473];

  it('🔴 « ce mail uniquement » ne couvre que lui', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 57368, 'mail')).toEqual([57368]);
  });

  /**
   * 🔴🔴 « CE MAIL ET LA CONVERSATION À VENIR » VEUT DIRE « À VENIR DANS LE TEMPS », jamais « plus bas dans la
   * liste ». L'écran peut afficher le plus récent en haut : confondre les deux aurait marqué le PASSÉ en croyant
   * marquer l'avenir. C'est exactement le défaut que le repère rouge a payé une fois (lot
   * VISUALISER-MAIL-ET-REPERE-FENETRE), et il n'y a aucune raison de le repayer ici.
   */
  it('🔴🔴 « ce mail et la conversation à venir » part du mail et va vers le FUTUR', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 57368, 'suite')).toEqual([57368, 57472, 57473]);
    /* 🔴 ET SURTOUT : AUCUN MAIL ANTÉRIEUR N'EST TOUCHÉ. C'est la seconde phrase de la règle d'Arno. */
    for (const antérieur of [5495, 5499, 57122]) {
      expect(mailsCouvertsParLeChoix(MAILS, 57368, 'suite')).not.toContain(antérieur);
    }
  });

  it('🔴 « toute la conversation » couvre tout, et dans l’ordre reçu', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 57368, 'conversation')).toEqual(MAILS);
    /* ⚠️ Et elle n'a pas besoin du mail visé : elle couvre tout, quel qu'il soit. */
    expect(mailsCouvertsParLeChoix(MAILS, 999999, 'conversation')).toEqual(MAILS);
  });

  /**
   * ⚠️ UN MAIL ABSENT DE LA LISTE NE COUVRE RIEN. Mieux vaut un geste qui ne porte sur rien — et qui le dit — que
   * un geste qui porte sur toute la conversation par accident.
   */
  it('⚠️ un mail inconnu ne couvre rien, pour les deux choix bornés', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 999999, 'mail')).toEqual([]);
    expect(mailsCouvertsParLeChoix(MAILS, 999999, 'suite')).toEqual([]);
  });

  /** ⚠️ ET UNE LISTE VIDE NE COUVRE RIEN NON PLUS, sans faire d'histoires. */
  it('⚠️ une conversation vide ne couvre rien', () => {
    expect(mailsCouvertsParLeChoix([], 57368, 'conversation')).toEqual([]);
    expect(mailsCouvertsParLeChoix([], 57368, 'suite')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔒 LES PROPRIÉTÉS DU CÂBLAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 le câblage de la migration 297', () => {
  const pur = readFileSync('app/lib/gestion/interneDuMail.ts', 'utf8');
  const depot = readFileSync('app/lib/gestion/interneMessageRepo.ts', 'utf8');
  const projection = readFileSync('app/lib/gestion/periodeRepo.ts', 'utf8');
  const liste = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
  const cnv = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

  /** 🔒🔒 LA RÈGLE EST PURE : elle est lue par le navigateur ET par le serveur, et doit répondre pareil. */
  it('🔒🔒 la règle du repli ne sait ni lire ni écrire', () => {
    for (const mot of ['fetch(', 'SELECT ', 'UPDATE ', 'INSERT ', 'useState', "from 'react'", 'server-only']) {
      expect(pur, mot).not.toContain(mot);
    }
  });

  /**
   * 🔴🔴 UNE SEULE ÉCRITURE DE LA RÈGLE. Quatre endroits la lisent — la liste, la modale du ⓘ, le statut de ligne
   * et les compteurs —, et c'est exactement le genre de règle dont quatre copies divergent. Le point 4 de ce même
   * lot en était déjà la preuve : la modale lisait les fenêtres, la liste la marque d'échange, et les deux se
   * contredisaient sur 3 conversations.
   */
  it('🔴🔴 la liste et la conversation appellent la MÊME règle', () => {
    expect(liste).toContain("import { interneDuMail } from './interneDuMail';");
    expect(liste).toContain('interne: interneDuMail({');
    expect(cnv).toContain("import { interneDuMail } from '../../../../lib/gestion/interneDuMail';");
    expect(cnv).toContain('interne={interne === null ? null : interneDuMail({');
  });

  /**
   * 🔴🔴 LA SECONDE PHRASE DE LA RÈGLE EST TENUE PAR LA FORME DE LA PROJECTION : elle écrit ce que la fenêtre qui
   * COUVRE CE MAIL demande, et rien d'autre. Un mail antérieur reste sous sa propre fenêtre.
   */
  it('🔴🔴 la projection écrit « interne » mail par mail', () => {
    expect(projection).toContain("if (c.sorte === 'interne') {");
    expect(projection).toContain('marquerInterneDesMessages({ messageIds: [m], auteur })');
    expect(projection).toContain('annulerInterneDesMessages({');
    /* 🔴 ET ELLE NE RETIRE PLUS LA MARQUE D'ÉCHANGE : c'est la correction du 03/10 (559d394a), intacte. Un repli
       qu'une projection effacerait ne serait pas un repli. */
    expect(projection).not.toContain('annulerInterne({');
  });

  /**
   * 🔴 LE DÉPÔT REND LES LIGNES RETIRÉES AUSSI, et c'est indispensable : sans elles, l'appelant ne peut pas
   * distinguer « personne ne s'est prononcé » de « on a retiré la marque ».
   */
  it('🔴 le dépôt distingue « retirée » de « absente »', () => {
    expect(depot).toContain('(retire_le IS NULL) AS vivante');
    expect(depot).toContain('DISTINCT ON (message_id)');
    expect(depot).toContain('itm.vivante AS itm_vivante, (itm.vivante IS NOT NULL) AS itm_connue');
  });

  /** 🔒 AUCUNE SUPPRESSION, NULLE PART : annuler écrit une date, il n'efface rien. */
  it('🔒 rien n’est jamais supprimé', () => {
    for (const mot of ['DELETE FROM', 'TRUNCATE', 'DROP ']) {
      expect(depot, mot).not.toContain(mot);
      expect(readFileSync('app/scripts/reprise-interne-par-mail.ts', 'utf8'), mot).not.toContain(mot);
    }
  });

  /** 🔒 ET LE GESTE EXIGE UN AUTEUR HUMAIN, comme son jumeau « hors gestion ». */
  it('🔒 jamais automatique', () => {
    expect(depot).toContain('auteurHumainInterneMessage');
    expect(depot).toContain("l.toLowerCase() !== 'automatique'");
  });

  /** ⚠️ LES DEUX MOTIFS SONT DISTINCTS : un retrait par une fenêtre ne se répare pas comme une reprise. */
  it('⚠️ les motifs disent d’où vient le geste', () => {
    expect(MOTIF_INTERNE_PAR_SUIVI).toBe('suivi de la conversation');
    expect(MOTIF_INTERNE_REPRISE).toContain('migration 297');
    expect(MOTIF_INTERNE_PAR_SUIVI).not.toBe(MOTIF_INTERNE_REPRISE);
  });

  /**
   * ⚠️ SANS LA MIGRATION, LA TABLE N'EST NOMMÉE NULLE PART. Chaque fonction sonde d'abord — règle du module depuis
   * l'incident du lot 4a : nommer une table absente ferait échouer TOUTE la boîte, pas seulement la fonction neuve.
   */
  it('⚠️ chaque lecture et chaque écriture sonde la migration', () => {
    expect((depot.match(/await interneDuMessageDisponible\(\)/g) ?? []).length).toBe(3);
    expect(depot).toContain('migration 297');
  });
});
