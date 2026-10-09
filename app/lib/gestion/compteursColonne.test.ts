import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  appliquerDelta, appliquerDeltaBrouillons,
  DELTA_BROUILLON_ABANDONNE, DELTA_BROUILLON_CORBEILLE, DELTA_BROUILLON_JETE, DELTA_BROUILLON_NEUF,
  DELTA_BROUILLON_RESTAURE,
  DELTA_ENVOI, DELTA_FIL_CORBEILLE, DELTA_FIL_RESTAURE, DELTA_SPAM, DELTA_SPAM_RETIRE,
  type ComptesColonne,
} from './compteursColonne';

/**
 * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 1 — LES COMPTEURS DE LA COLONNE, EN DIRECT ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « mettre un brouillon à la corbeille ne met pas à jour les compteurs (Brouillons,
 * Corbeille…). Il faut recharger la page. »
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE : les sept nombres venaient d'UNE lecture gardée par un numéro de version, et UN
 * SEUL geste la redemandait (le classement). Tous les autres la laissaient telle quelle — le compteur n'était pas
 * faux, il était VIEUX, ce qui est pire parce que rien ne le dit.
 *
 * 🔴 LA CORRECTION EST STRUCTURELLE, et c'est le point : le compte rendu d'un geste passe désormais par UNE seule
 * fonction (`surGeste`), qui rafraîchit toujours. Il était écrit six fois dans le même fichier ; il suffisait d'en
 * oublier cinq, et c'est ce qui était arrivé.
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① l'arithmétique des deltas, bornes comprises (jamais de nombre négatif à l'écran) ;
 *   ② un compteur INCONNU reste inconnu — on ne fabrique pas un nombre à partir de `null` ;
 *   ③ chaque geste nommé déplace ce qu'il doit, et rien d'autre ;
 *   ④ l'écran passe par une seule porte, et cette porte relit TOUJOURS les trois sources.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const COMPTES: ComptesColonne = {
  lisibles: 14241, automatiques: 22096, envoyes: 9657, reception: 10232,
  corbeille: 34, spam: 281, aClasser: 9146,
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① L'ARITHMÉTIQUE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① appliquer un delta', () => {
  it('🔴 ne touche QUE ce que le delta nomme', () => {
    const r = appliquerDelta(COMPTES, { corbeille: 1 });
    expect(r?.corbeille).toBe(35);
    expect(r?.reception).toBe(COMPTES.reception);
    expect(r?.envoyes).toBe(COMPTES.envoyes);
    expect(r?.spam).toBe(COMPTES.spam);
    expect(r?.aClasser).toBe(COMPTES.aClasser);
  });

  /**
   * 🔴🔴 JAMAIS SOUS ZÉRO. Un « −1 échange » affiché est un bogue qu'on montre : il vaut mieux 0 pendant 150 ms,
   * que la relecture corrigera, qu'un nombre impossible qui ferait douter de tout l'écran.
   */
  it('🔴🔴 ne descend jamais sous zéro', () => {
    const r = appliquerDelta({ ...COMPTES, corbeille: 0, spam: 0 }, { corbeille: -1, spam: -3 });
    expect(r?.corbeille).toBe(0);
    expect(r?.spam).toBe(0);
    expect(appliquerDeltaBrouillons(0, { brouillons: -1 })).toBe(0);
  });

  /**
   * 🔴🔴 UN COMPTEUR INCONNU RESTE INCONNU. `corbeille: null` veut dire « migration 251 absente » : lui ajouter 1
   * fabriquerait un nombre à partir de rien — et ferait APPARAÎTRE dans la colonne une entrée qui ne doit pas y
   * être (une étiquette sans nombre est écartée). Même règle pour `spam` et `aClasser`, absents des réponses plus
   * anciennes.
   */
  it('🔴🔴 un nombre qu’on n’a pas mesuré ne s’invente pas', () => {
    const r = appliquerDelta({ ...COMPTES, corbeille: null, spam: undefined, aClasser: undefined },
      { corbeille: 1, spam: 1, aClasser: -1 });
    expect(r?.corbeille).toBeNull();
    expect(r?.spam).toBeUndefined();
    expect(r?.aClasser).toBeUndefined();
    expect(appliquerDeltaBrouillons(null, { brouillons: -1 })).toBeNull();
  });

  it('⚠️ sans comptes ou sans delta, rien ne change', () => {
    expect(appliquerDelta(null, { corbeille: 1 })).toBeNull();
    expect(appliquerDelta(COMPTES, undefined)).toBe(COMPTES);
    expect(appliquerDeltaBrouillons(12, undefined)).toBe(12);
    expect(appliquerDeltaBrouillons(12, { corbeille: 1 })).toBe(12);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 CHAQUE GESTE DÉPLACE CE QU'IL DOIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② les gestes nommés', () => {
  /**
   * 🔴🔴 LE CAS D'ARNO, MOT POUR MOT : un brouillon à la corbeille. LES DEUX compteurs bougent.
   *
   * ⚠️ VÉRIFIÉ SUR LA VRAIE ROUTE, et j'ai failli me tromper deux fois. La requête de `boiteRepo` compte des
   * ÉCHANGES et rend 34 ; j'en avais conclu qu'un brouillon jeté n'entrait pas dans « Corbeille ». Mais la
   * ROUTE rend 71 — elle AJOUTE les brouillons jetés, comptés à part (`brouillonsJetes: 37`), et c'est ce
   * nombre-là que la colonne affiche. 34 + 37 = 71. Le compteur affiché n'est pas toujours la requête qu'on a
   * sous les yeux : on lit la route, qui est ce que l'écran consomme.
   */
  it('🔴🔴 un brouillon à la corbeille : Brouillons −1, Corbeille +1', () => {
    expect(appliquerDeltaBrouillons(14, DELTA_BROUILLON_CORBEILLE)).toBe(13);
    expect(appliquerDelta(COMPTES, DELTA_BROUILLON_CORBEILLE)?.corbeille).toBe(35);
  });

  it('🔴 …et le retour, à l’identique en sens inverse', () => {
    expect(appliquerDeltaBrouillons(13, DELTA_BROUILLON_RESTAURE)).toBe(14);
    expect(appliquerDelta(COMPTES, DELTA_BROUILLON_RESTAURE)?.corbeille).toBe(33);
  });

  /** ⚠️ ET LE GESTE DE LA LISTE EST LE MÊME GESTE : un seul effet, deux noms pour deux écrans. */
  it('⚠️ jeter depuis la liste vaut jeter depuis l’éditeur', () => {
    expect(DELTA_BROUILLON_JETE).toEqual(DELTA_BROUILLON_CORBEILLE);
  });

  /**
   * 🔴🔴 ABANDONNER N'EST PAS JETER, et il faut les deux constantes. « Jeter » garde le brouillon et le rend
   * réintégrable (migration 276) ; « abandonner » le retire sans passer par la corbeille. Les confondre ferait
   * monter « Corbeille » d'un cran qui n'existe pas — c'est le cas d'une base sans la 276.
   */
  it('🔴🔴 abandonner ne remplit pas la corbeille', () => {
    expect(DELTA_BROUILLON_ABANDONNE.corbeille).toBeUndefined();
    expect(appliquerDelta(COMPTES, DELTA_BROUILLON_ABANDONNE)?.corbeille).toBe(34);
    expect(appliquerDeltaBrouillons(14, DELTA_BROUILLON_ABANDONNE)).toBe(13);
  });

  it('🔴 un envoi : Brouillons −1, Envoyés +1', () => {
    expect(appliquerDelta(COMPTES, DELTA_ENVOI)?.envoyes).toBe(9658);
    expect(appliquerDeltaBrouillons(14, DELTA_ENVOI)).toBe(13);
  });

  it('🔴 un brouillon neuf : Brouillons +1', () => {
    expect(appliquerDeltaBrouillons(14, DELTA_BROUILLON_NEUF)).toBe(15);
  });

  it('🔴 un échange à la corbeille, et son retour', () => {
    expect(appliquerDelta(COMPTES, DELTA_FIL_CORBEILLE)?.corbeille).toBe(35);
    expect(appliquerDelta(COMPTES, DELTA_FIL_RESTAURE)?.corbeille).toBe(33);
  });

  it('🔴 le spam, dans les deux sens', () => {
    expect(appliquerDelta(COMPTES, DELTA_SPAM)?.spam).toBe(282);
    expect(appliquerDelta(COMPTES, DELTA_SPAM_RETIRE)?.spam).toBe(280);
  });

  /**
   * ⚠️ UN GESTE DONT L'EFFET DÉPEND DU CONTEXTE N'A PAS DE DELTA, ET C'EST VOLONTAIRE. Mettre un ÉCHANGE à la
   * corbeille ne retire une unité de « Réception » que s'il y figurait — l'écran ne le sait pas, le serveur si.
   * On s'abstient de deviner : un chiffre qui saute est pire qu'un chiffre qui attend 150 ms.
   */
  it('⚠️ aucun geste ne devine l’effet sur Réception ni sur À classer', () => {
    for (const d of [DELTA_FIL_CORBEILLE, DELTA_FIL_RESTAURE, DELTA_SPAM, DELTA_BROUILLON_CORBEILLE, DELTA_ENVOI]) {
      expect(d.reception).toBeUndefined();
      expect(d.aClasser).toBeUndefined();
      expect(d.lisibles).toBeUndefined();
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 UNE SEULE PORTE, ET ELLE RELIT TOUJOURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ l’écran passe par une seule porte', () => {
  const vue = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');

  /**
   * 🔴🔴 C'EST LA CORRECTION STRUCTURELLE DU LOT. Le compte rendu d'un geste était écrit SIX fois dans ce
   * fichier, et un seul de ces six rafraîchissait les compteurs. Une porte unique rend l'oubli impossible.
   */
  it('🔴🔴 le compte rendu d’un geste n’est plus écrit qu’une fois', () => {
    const code = vue.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    /* 🔴 UN SEUL ENDROIT POSE LE COMPTE RENDU « ok » : `surGeste`. Les autres l'appellent. */
    expect(code.match(/setGeste\(\{ ton: 'ok'/g) ?? []).toHaveLength(1);
    expect(code).toContain('const surGeste = useCallback((');
    /**
     * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — LA PORTE PASSE UN SECOND ARGUMENT ════════════════════
     *
     * `rafraichirComptes(options?.compteurs)` est devenu
     * `rafraichirComptes(options?.compteurs, options?.avantEcriture === true)`. Le verdict de cette épreuve est
     * intact — UNE seule porte, et c'est elle qui rafraîchit — et c'est bien elle qu'on vérifie ici : le delta
     * continue d'y passer, accompagné du drapeau qui dit s'il ANTICIPE une écriture (voir `gestesMail`).
     */
    expect(code).toContain('rafraichirComptes(options?.compteurs, options?.avantEcriture === true);');
  });

  /**
   * 🔴🔴 ET ELLE RELIT LES SOURCES QUI ONT ENCORE UN LECTEUR — la colonne, les brouillons.
   *
   * ⚠️ CE QU'ELLE EXIGEAIT AVANT, ET POURQUOI LA TROISIÈME A DISPARU : `void chargerARattacher();`, qui
   * relisait le compteur de l'entrée « À rattacher » de la colonne de la boîte. Arno a demandé le RETRAIT de
   * cette entrée (accord explicite, lot RACCOURCI-EVENEMENTS), remplacée par « Événements ». Plus personne ne
   * lit ce nombre ; le relire après chaque geste était une requête pour rien.
   *
   * 🔒 LA PROPRIÉTÉ GARDÉE EST INTACTE : une seule porte rafraîchit, et elle redemande TOUT ce qui s'affiche.
   * C'est pour cela que ce cas interdit explicitement le retour de l'appel orphelin — un lot suivant qui
   * remettrait la lecture sans remettre le compteur recréerait exactement la requête muette qu'on retire.
   */
  it('🔴🔴 le rafraîchissement redemande les sources qui s’affichent', () => {
    expect(vue).toContain('setVersionComptes((v) => v + 1);');
    expect(vue).toContain('void chargerBrouillonsTotal();');
    /* ⚠️ ON INTERDIT L'APPEL, PAS LE MOT : les encadrés de `GestionVue` NOMMENT la lecture retirée pour
       expliquer pourquoi elle l'a été. Chercher le mot nu ferait rougir l'épreuve sur sa propre explication. */
    expect(vue).not.toContain('void chargerARattacher();');
  });

  /**
   * 🔴 L'OPTIMISTE D'ABORD, LA VÉRITÉ ENSUITE : les deux, dans cet ordre, dans la même fonction.
   *
   * ⚠️ LA FENÊTRE DE LECTURE A DÛ GRANDIR (lot INSTANTANE-ETOILE-CORBEILLE, point 2) : la fonction porte
   * désormais l'encadré de `avantEcriture`, qui explique pourquoi ② peut être DIFFÉRÉE. 900 caractères
   * s'arrêtaient au milieu de cet encadré, et `setVersionComptes` tombait hors du bloc lu (−1).
   */
  it('🔴🔴 optimiste d’abord, relecture ensuite', () => {
    const i = vue.indexOf('const rafraichirComptes');
    const bloc = vue.slice(i, vue.indexOf('\n  }, [chargerBrouillonsTotal, chargerARattacher]);', i));
    expect(bloc.indexOf('appliquerDelta(avant, delta)')).toBeGreaterThan(0);
    expect(bloc.indexOf('appliquerDelta(avant, delta)'))
      .toBeLessThan(bloc.indexOf('setVersionComptes((v) => v + 1)'));
  });

  /**
   * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — ② NE PART PAS AVANT L'ÉCRITURE ════════════════════════
   *
   * MESURÉ À L'ÉCRAN (06/10/2026) : un geste de corbeille applique son delta AVANT d'écrire ; la confirmation ②
   * partait donc elle aussi avant, revenait avec le nombre d'AVANT et écrasait le delta. La Corbeille affichait
   * **89** quand le serveur répondait **88**, et elle y restait. Le geste confirme lui-même, après l'écriture.
   */
  it('🔴🔴 un delta qui ANTICIPE ne déclenche aucune relecture', () => {
    const bloc = vue.slice(vue.indexOf('const rafraichirComptes'),
      vue.indexOf('\n  }, [chargerBrouillonsTotal, chargerARattacher]);'));
    expect(bloc).toContain('if (avantEcriture) return;');
    expect(bloc.indexOf('if (avantEcriture) return;'))
      .toBeLessThan(bloc.indexOf('setVersionComptes((v) => v + 1)'));
    /* ⚠️ ET PAR DÉFAUT RIEN NE CHANGE : les autres gestes appliquent leur delta APRÈS leur écriture. */
    expect(bloc).toContain('(delta?: DeltaCompteurs, avantEcriture = false)');
  });

  /**
   * 🔴🔴 ET LE DELTA TRAVERSE LES RELAIS. Un relais qui ne passerait que le message perdrait le delta en route,
   * et le chiffre n'aurait bougé nulle part — exactement le défaut qu'on répare.
   */
  it('🔴🔴 les options traversent les relais de la conversation', () => {
    const conv = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(conv).toContain('onGeste={(t, o) => onGeste(t, o)}');
    expect(conv).toContain('onGeste={(m, o) => onGeste(m, o)}');
  });

  /** 🔴 LES GESTES NOMMÉS SONT BRANCHÉS : brouillon, envoi, corbeille d'une ligne. */
  it('🔴🔴 les gestes nommés portent leur delta', () => {
    const red = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    expect(red).toContain('{ compteurs: DELTA_BROUILLON_CORBEILLE }');
    expect(red).toContain('{ compteurs: DELTA_BROUILLON_ABANDONNE }');
    expect(red).toContain('{ compteurs: DELTA_BROUILLON_RESTAURE }');
    expect(red).toContain('{ compteurs: DELTA_ENVOI }');
    /* 🔴 ET LA LISTE DES BROUILLONS AUSSI : c'est LE geste du constat d'Arno. */
    const plein = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    /* ⚠️ LE MÊME DELTA, désormais accompagné de `avantEcriture` : il part AVANT l'écriture (point 2). */
    expect(plein).toContain('compteurs: versLaCorbeille ? DELTA_FIL_CORBEILLE : DELTA_FIL_RESTAURE, avantEcriture: true,');
    expect(plein).toContain("{ compteurs: DELTA_BROUILLON_JETE }");
    /**
     * 🔴🔴 ET FERMER UNE FENÊTRE DE RÉDACTION COMPTE : un brouillon NAÎT en se fermant.
     *
     * ⚠️ REQUALIFIÉ LE 07/10/2026 — LOT BROUILLON-APERCU-SUPPRESSION : la fermeture fait DEUX choses désormais,
     * et le geste s'écrit donc sur plusieurs lignes. Elle appelle toujours `onGeste` pour les compteurs — c'est
     * ce que ce cas protège, et c'est intact — et elle incrémente en plus `versionStatuts`, parce que la LIGNE
     * du brouillon supprimé restait dans la liste pendant que le compteur, lui, descendait.
     */
    expect(plein).toContain("fen.fermerLa(cle);\n            onGeste('', { compteurs: undefined });");
    expect(plein).toContain('setVersionStatuts((v) => v + 1);');
  });

  /**
   * ⚠️ UN MESSAGE VIDE NE S'AFFICHE PAS, MAIS COMPTE QUAND MÊME. Une mise à la corbeille porte déjà son bandeau
   * « Annuler » : un second compte rendu par-dessus serait du bruit. Elle doit tout de même rafraîchir.
   */
  it('⚠️ un geste sans message rafraîchit tout de même', () => {
    expect(vue).toContain("if (message !== '') setGeste({ ton: 'ok', texte: message });");
  });
});
