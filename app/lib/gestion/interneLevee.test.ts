import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  messageLeveeInterne, motApresAnnulationLevee, motApresLevee, SECONDES_ANNULER_LEVEE,
  MOTIF_INTERNE_REMIS_APRES_ANNULATION, MOTIF_LEVE_PAR_RATTACHEMENT, MOTIF_RATTACHEMENT_ANNULE,
} from './interneLevee';
import { MOTIF_DETACHE_PAR_INTERNE, MOTIF_REMIS_APRES_ANNULATION } from './interneDetache';
import { MOTIF_INTERNE_PAR_SUIVI } from './interneDuMail';

/**
 * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — RATTACHER UN BIEN LÈVE LA MARQUE « INTERNE » ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026) : « Câble l'autre sens. Quand un HUMAIN rattache un bien à un mail marqué Interne,
 * la marque Interne est levée pour ce mail, selon la même fenêtre choisie. Avant d'appliquer : “Ce mail est marqué
 * Interne : rattacher ce bien retirera la marque Interne” avec Confirmer / Annuler. Après : “Annuler” quelques
 * secondes, qui remet exactement l'état d'avant. La passe AUTOMATIQUE ne lève jamais la marque et ne pose jamais de
 * bien sur un mail Interne (garde le test). »
 *
 * ⚠️ TOUT CE FICHIER EST PUR : aucune base, aucun réseau. Les deux moitiés qui touchent la base — la levée
 * elle-même et le refus de la passe automatique — sont tenues par `interneRepo` et par le groupe ④ de
 * `mailInterneSansBien.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴🔴 ① la phrase de la confirmation, mot pour mot celle d’Arno', () => {
  it('🔴🔴 elle est écrite exactement comme il l’a demandée', () => {
    expect(messageLeveeInterne(true))
      .toBe('Ce mail est marqué Interne : rattacher ce bien retirera la marque Interne');
  });

  /**
   * 🔴🔴 LE CAS LE PLUS FRÉQUENT N'A PAS DE MESSAGE, et c'est la règle du sens inverse appliquée ici : sur un mail
   * ordinaire, le rattachement garde EXACTEMENT le comportement d'avant ce lot, au clic près. Une confirmation qui
   * dirait « rien ne sera retiré » serait un geste de plus pour rien, sur des milliers de mails.
   */
  it('🔴🔴 aucun message quand le mail n’est pas marqué « interne »', () => {
    expect(messageLeveeInterne(false)).toBeNull();
  });
});

describe('🔴 ② les mots du compte rendu et de l’annulation', () => {
  /**
   * 🔴 LE NOMBRE DE MAILS EST DIT, parce que la fenêtre peut porter plus loin que le mail affiché : « marque
   * retirée » sur un geste qui en a levé quatre serait faux par omission.
   */
  it('🔴 le compte rendu dit combien de mails ont perdu leur marque', () => {
    expect(motApresLevee(1)).toBe('Bien rattaché · marque « interne » retirée de ce mail.');
    expect(motApresLevee(4)).toBe('Bien rattaché · marque « interne » retirée de 4 mails.');
  });

  /** ⚠️ ZÉRO (et le négatif, qu'aucun appelant ne produit mais que rien n'interdit) ne parle pas de la marque. */
  it('⚠️ aucun mail levé ⇒ le mot ne parle pas de la marque', () => {
    expect(motApresLevee(0)).toBe('Bien rattaché.');
    expect(motApresLevee(-1)).toBe('Bien rattaché.');
  });

  it('le mot de l’annulation dit les deux moitiés défaites', () => {
    expect(motApresAnnulationLevee(0)).toBe('Rattachement annulé · marque « interne » remise.');
    expect(motApresAnnulationLevee(1)).toBe('Rattachement annulé (1 lien) · marque « interne » remise.');
    expect(motApresAnnulationLevee(3)).toBe('Rattachement annulé (3 liens) · marque « interne » remise.');
  });
});

/**
 * ══ 🔴🔴 ③ LA MARQUE DE L'ÉCHANGE N'EST JAMAIS TOUCHÉE, ET CE N'EST PAS UN OUBLI ════════════════════════════════
 *
 * Arno écrit « la marque Interne est levée POUR CE MAIL ». Et la règle du module l'impose déjà : le 03/10/2026, le
 * commit 559d394a a RETIRÉ de la projection des fenêtres le retrait de la marque d'échange — « elle reste le
 * repli, et un repli qu'une projection effacerait ne serait pas un repli ». Lever ici ce qu'on a refusé de lever
 * là serait rouvrir la même porte par l'autre côté.
 *
 * 🔴 CETTE ÉPREUVE EST DONC UN GARDE CONTRE UNE BONNE IDÉE : celle d'« aller jusqu'au bout » en retirant aussi la
 * marque de la conversation. Elle a été écrite, puis retirée, pendant ce lot même.
 */
describe('🔴🔴 ③ la levée ne touche pas la marque de l’ÉCHANGE', () => {
  const REPO = readFileSync('app/lib/gestion/interneRepo.ts', 'utf8');
  const corps = REPO.slice(
    REPO.indexOf('export async function leverInterneApresRattachementHumain'),
    REPO.indexOf('export async function remettreInterneApresAnnulation'));

  it('🔴🔴 la levée ne nomme ni la table ni le verbe de l’échange', () => {
    expect(corps).not.toContain('gestion_fil_interne');
    expect(corps).not.toContain('leverInterneApresRattachement(');
    expect(corps).not.toContain('annulerInterne(');
    /* ⚠️ TÉMOIN : elle agit bien, et au grain du MAIL. */
    expect(corps).toContain('annulerInterneDesMessages({');
    expect(corps).toContain('declarerNonInterneDesMessages({');
  });

  /**
   * 🔴🔴 ET `leverInterneApresRattachement` — celle qui porte sur l'ÉCHANGE — N'A TOUJOURS AUCUN APPELANT. C'est
   * un état ASSUMÉ, documenté dans les deux fichiers. Si quelqu'un la branche un jour, cette épreuve le dira, et
   * il faudra que ce soit une décision d'Arno — pas un effet de bord.
   */
  it('🔴🔴 le verbe d’échange reste sans appelant, et les deux fichiers le disent', () => {
    expect(REPO).toContain('leverInterneApresRattachement');
    const LEVEE = readFileSync('app/lib/gestion/interneLevee.ts', 'utf8');
    expect(LEVEE).toContain('N\'A TOUJOURS PAS D\'APPELANT');
  });

  it('⚠️ le délai de l’« Annuler » est celui du sens inverse, et il est écrit', () => {
    expect(SECONDES_ANNULER_LEVEE).toBe(12);
  });
});

/**
 * ══ 🔴🔴 ④ LES QUATRE MOTIFS NE SE CONFONDENT PAS, ET C'EST FONCTIONNEL ═════════════════════════════════════════
 *
 * Chaque « Annuler » ne remet que ce que SON geste avait défait, et la seule preuve qu'il en ait est le MOTIF écrit
 * en base. Deux motifs identiques rendraient les deux annulations incapables de se distinguer — un « Annuler »
 * cliqué un peu tard remettrait alors des liens que personne n'avait demandé de remettre. Le défaut a déjà été
 * payé une fois sur les rattachements : il est figé ici.
 */
describe('🔴🔴 ④ chaque trace est distincte de toutes les autres', () => {
  it('🔴🔴 les quatre motifs des deux sens sont tous différents', () => {
    const motifs = [
      MOTIF_LEVE_PAR_RATTACHEMENT, MOTIF_INTERNE_REMIS_APRES_ANNULATION, MOTIF_RATTACHEMENT_ANNULE,
      MOTIF_DETACHE_PAR_INTERNE, MOTIF_REMIS_APRES_ANNULATION, MOTIF_INTERNE_PAR_SUIVI,
    ];
    expect(new Set(motifs).size).toBe(motifs.length);
  });

  it('chacun se relit sans connaître ce lot', () => {
    expect(MOTIF_LEVE_PAR_RATTACHEMENT).toBe('levé en rattachant un bien à ce mail');
    expect(MOTIF_RATTACHEMENT_ANNULE).toBe('rattachement annulé dans les secondes qui suivaient');
    expect(MOTIF_INTERNE_REMIS_APRES_ANNULATION)
      .toBe('remis : le rattachement a été annulé dans les secondes qui suivaient');
  });
});

/**
 * ══ 🔒 ⑤ CE MODULE EST ATTEINT PAR LE NAVIGATEUR : IL NE DOIT RIEN TIRER DE LA BASE ═════════════════════════════
 *
 * Les mots de la confirmation viennent d'ici, et `EncartRattachement` est un composant `'use client'`. Un import
 * qui tirerait `pg` ferait tomber TOUTE l'application au bundling — page de connexion comprise. Le garde de graphe
 * `clientBoundary.guard.test.ts` attrape le cas ; cette épreuve le dit à l'endroit où la faute se commettrait.
 */
describe('🔒 ⑤ la frontière client', () => {
  it('🔒 `interneLevee.ts` n’importe ni la base, ni la sonde, ni React', () => {
    const src = readFileSync('app/lib/gestion/interneLevee.ts', 'utf8');
    expect(src).not.toContain("from './schema'");
    expect(src).not.toContain("from '../db/client'");
    expect(src).not.toContain("from 'react'");
    expect(src).not.toContain("from 'pg'");
    /* ⚠️ TÉMOIN LE PLUS FORT QU'ON PUISSE AVOIR ICI : le fichier n'a AUCUN `import`. Il ne peut donc rien tirer,
       ni aujourd'hui ni par une dépendance transitive. */
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });
});

/**
 * ══ 🔴🔴 ⑥ LA LEVÉE EST ÉCRITE À UN SEUL ENDROIT : LA SEULE PORTE D'ÉCRITURE ════════════════════════════════════
 *
 * 🔴🔴 LE CHOIX DE CE LOT, ET LE DÉFAUT QU'IL ÉVITE. Sept écrans rattachent un bien. Câbler la levée dans chacun
 * en aurait oublié un — et c'est l'oublié qui aurait continué de créer « Interne avec un bien ». Elle est donc
 * posée dans `rattacher()`, par où TOUS passent, projection des fenêtres comprise.
 *
 * ⚠️ POURQUOI UNE LECTURE DE SOURCE : la chaîne complète traverse une route et une base. Ce qui se tient sans
 * elles, c'est que la règle est à UN endroit, et que les écrans POSENT LA QUESTION sans réécrire la phrase.
 */
describe('🔴🔴 ⑥ une seule porte pour la règle, deux écrans pour la question', () => {
  const RATTACHER = readFileSync('app/lib/gestion/rattachementRepo.ts', 'utf8');

  it('🔴🔴 la levée est appelée par `rattacher`, après la transaction, comme sa jumelle « hors gestion »', () => {
    const corps = RATTACHER.slice(RATTACHER.indexOf('const leverLaMarque = async'));
    const bloc = corps.slice(0, corps.indexOf('};'));
    /* 🔴 JAMAIS POUR UN ÉVÉNEMENT : poser une carte ne dit rien des biens. */
    expect(bloc).toContain("if (o.cible.sorte === 'evenement') return;");
    expect(bloc).toContain('leverHorsGestionApresRattachement([o.messageId], o.auteur)');
    expect(bloc).toContain('leverInterneApresRattachementHumain({ messageIds: [o.messageId], auteur: o.auteur })');
    /* ⚠️ APRÈS LA TRANSACTION, ET SANS LA FAIRE ÉCHOUER : c'est un rattrapage d'état, pas le geste lui-même. */
    /**
     * ══ 🔴🔴 LA CONDITION A GAGNÉ UNE MOITIÉ LE 06/10/2026 — LOT MONGA-1, POINT 2 ════════════════════════════
     *
     * Elle disait `if (issue.ok)`. Elle dit maintenant `if (issue.ok && !auteurAutomatique)`, et cette épreuve
     * est réécrite exprès plutôt que relâchée.
     *
     * 🔴 POURQUOI C'EST LA MÊME RÈGLE, ET NON UNE EXCEPTION. Arno l'a posée le 04/10 pour un HUMAIN : « quand un
     * HUMAIN rattache un bien à un mail marqué Interne, la marque est levée ». La passe automatique, elle, « ne
     * lève jamais la marque » — c'est la dernière phrase de la même décision, et `mailInterneSansBien.test.ts`
     * la tient depuis. Jusqu'au 06/10, aucune automatisation ne pouvait emprunter `rattacher` : la condition
     * n'avait donc rien à dire. Le classement Monga peut, lui (`origine: 'automatique'`) — et il doit se heurter
     * à la seconde moitié de la décision d'Arno, pas la contourner.
     */
    expect(RATTACHER).toContain('if (issue.ok && !auteurAutomatique) await leverLaMarque();');
    expect(RATTACHER).toContain("const auteurAutomatique = (o.origine ?? 'manuel') === 'automatique';");
  });

  /**
   * 🔴 LA PROJECTION DES FENÊTRES PASSE PAR LA MÊME PORTE, et c'est ce qui fait suivre la fenêtre choisie sans
   * qu'aucune ligne n'en parle : elle appelle `rattacher` une fois par mail couvert.
   */
  it('🔴 la projection des fenêtres rattache par `rattacher`, donc lève mail par mail', () => {
    const PERIODES = readFileSync('app/lib/gestion/periodeRepo.ts', 'utf8');
    expect(PERIODES.replace(/\s+/g, ' ')).toContain('const issue = await rattacher({ messageId: m,');
  });

  /**
   * ⚠️ ET AUCUN ÉCRAN NE LÈVE LUI-MÊME : un second chemin serait une seconde règle à tenir d'accord.
   *
   * 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE — ILS N'ANNULENT PLUS EUX-MÊMES NON PLUS. L'annulation est devenue un geste
   * en DEUX appels, dans un ordre qui est la fonctionnalité (la décision de suivi, puis la marque) : écrite deux
   * fois, elle aurait divergé au premier ajustement. Les deux écrans appellent donc `annulerLaLevee`.
   */
  it('⚠️ aucun écran n’appelle la levée : ils demandent, ils ne lèvent pas', () => {
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/EncartRattachement.tsx',
      'app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toContain('lever: true');
      expect(src, f).not.toContain('leverInterneApresRattachementHumain');
      /* …mais ils POSENT la question, et ils offrent la sortie par le module partagé. */
      expect(src, f).toContain('messageLeveeInterne(true)');
      expect(src, f).toContain('annulerLaLevee(fait)');
      expect(src, f).not.toContain('remettreLevee: true');
    }
  });

  /**
   * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — L'ORDRE DE L'ANNULATION EST LA FONCTIONNALITÉ ══════════════
   *
   * 🔴 LA DÉCISION DE SUIVI D'ABORD, LA MARQUE ENSUITE. Reposer « interne » sur un mail qui porte encore son
   * bien reconstruirait, le temps d'une requête, l'état même que ce lot ferme.
   */
  it('🔴🔴 l’annulation défait la décision de suivi AVANT de remettre la marque', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/annulationLevee.ts', 'utf8');
    const iSuivi = src.indexOf('const suivi = await defaireLaDecisionDeSuivi(fait.trace);');
    const iMarque = src.indexOf('remettreLevee: true');
    expect(iSuivi).toBeGreaterThan(0);
    expect(iMarque).toBeGreaterThan(0);
    expect(iSuivi).toBeLessThan(iMarque);
    /* 🔴 ET LA DÉCISION EST DÉFAITE PAR SA TRACE, jamais rejouée : rejouer en inventerait une. */
    expect(src.replace(/\s+/g, ' ')).toContain("body: JSON.stringify({ annuler: trace })");
  });
});

describe('🔴🔴 ⑦ les deux écrans qui posent la question, et ce qu’ils demandent', () => {
  const ECRANS = [
    'app/(admin)/admin/(protected)/gestion/EncartRattachement.tsx',
    'app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx',
  ] as const;

  /**
   * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT DE CHERCHER : les encadrés CITENT la décision d'Arno mot pour mot —
   * c'est leur raison d'être. Sans ce retrait, le garde se dénoncerait sur sa propre documentation. Le même piège
   * a déjà été rencontré sur le garde du lien de bien.
   */
  const sansCommentaires = (src: string): string => src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  it('🔴🔴 la phrase affichée vient du module, jamais d’une chaîne recopiée dans la balise', () => {
    for (const f of ECRANS) {
      const propre = sansCommentaires(readFileSync(f, 'utf8'));
      expect(propre, f).not.toContain('Ce mail est marqué Interne : rattacher');
      expect(propre, f).toContain('.message}');
    }
  });

  /**
   * 🔴🔴 LA CONDITION EST « UN BIEN S'AJOUTE », et non « on valide ». Retirer un bien, ou revalider la même
   * liste, ne lève aucune marque et ne doit poser aucune question.
   */
  it('🔴🔴 rien n’est demandé quand aucun bien ne s’ajoute', () => {
    const encart = readFileSync(ECRANS[0], 'utf8').replace(/\s+/g, ' ');
    const fenetre = readFileSync(ECRANS[1], 'utf8').replace(/\s+/g, ' ');
    expect(encart).toContain('if (leveeConfirmee === null && clesAjoutees.length > 0)');
    expect(fenetre).toContain('if (leveeConfirmee === null && ajoutes.length > 0)');
  });

  /**
   * 🔴🔴 LA LISTE DES MAILS INTERNE EST CAPTURÉE **AVANT** L'ÉCRITURE, et c'est la seule occasion : après, la
   * levée a eu lieu, et les redemander rendrait une liste vide — l'« Annuler » n'aurait plus rien à remettre.
   */
  it('🔴🔴 la confirmation PORTE les mails levés, ce n’est pas un simple « oui »', () => {
    for (const f of ECRANS) {
      const plat = readFileSync(f, 'utf8').replace(/\s+/g, ' ');
      expect(plat, f).toContain('leveeConfirmee: readonly number[] | null = null');
      expect(plat, f).toContain('const leves = demandeLevee.mails;');
    }
  });

  /**
   * 🔴 ET L'« ANNULER » DÉFAIT LES TROIS MOITIÉS : la marque seule laisserait « Interne avec un bien », et le
   * lien seul laisserait une décision de suivi que plus aucun lien ne suit (point 1 de ce lot).
   */
  it('🔴 l’annulation passe par le module partagé, qui défait les trois', () => {
    const partage = readFileSync('app/(admin)/admin/(protected)/gestion/annulationLevee.ts', 'utf8')
      .replace(/\s+/g, ' ');
    expect(partage).toContain('remettreLevee: true, remettre: fait.liens, marques: fait.mails');
    expect(partage).toContain('defaireLaDecisionDeSuivi(fait.trace)');
    for (const f of ECRANS) {
      expect(readFileSync(f, 'utf8'), f).toContain('annulerLaLevee(fait)');
    }
  });

  /**
   * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — LA SORTIE PORTE LA TRACE, ET ELLE VIENT DU SERVEUR ════════
   *
   * ⚠️ LA TRACE NE SE FABRIQUE PAS À L'ÉCRAN : elle est rendue par le POST qui a écrit la décision. Un écran qui
   * la reconstruirait devinerait des identifiants — et l'annulation toucherait des lignes au hasard.
   */
  it('🔴🔴 la trace de la décision vient de la réponse du serveur', () => {
    for (const f of ECRANS) {
      const plat = readFileSync(f, 'utf8').replace(/\s+/g, ' ');
      expect(plat, f).toContain('trace?: TraceSuivi');
      expect(plat, f).toContain('d.trace ?? null');
    }
  });
});

/**
 * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — LES DEUX ÉCRITURES DE LA TRACE DISENT LA MÊME CHOSE ════════════
 *
 * ⚠️ POURQUOI IL Y EN A DEUX, ET POURQUOI C'EST ACCEPTABLE ICI. `TraceClassement` vit dans `periodeRepo`, qui
 * tire `pg` : le navigateur ne peut pas l'importer. `TraceSuivi` en est la forme, côté écran. C'est exactement le
 * genre de doublon dont ce dépôt a déjà payé plusieurs exemplaires — deux listes de domaines, deux règles de
 * repli, trois listes de types d'images — et la parade est la même : une épreuve qui compare les deux À LA SOURCE,
 * champ pour champ, au lieu de les recopier.
 */
describe('🔴🔴 ⑧ la trace de la décision de suivi, des deux côtés de la frontière', () => {
  /** Les noms de champs déclarés dans un bloc `interface X { … }`, lus dans la source. */
  const champsDe = (fichier: string, nom: string): string[] => {
    const src = readFileSync(fichier, 'utf8');
    const debut = src.indexOf(`export interface ${nom} {`);
    expect(debut, `${nom} introuvable dans ${fichier}`).toBeGreaterThan(-1);
    const corps = src.slice(debut, src.indexOf('\n}', debut));
    return [...corps.matchAll(/^\s{2}([A-Za-z]\w*)\??:/gm)].map((m) => m[1]).sort();
  };

  it('🔴🔴 `TraceSuivi` (écran) et `TraceClassement` (dépôt) portent EXACTEMENT les mêmes champs', () => {
    const ecran = champsDe('app/lib/gestion/interneLevee.ts', 'TraceSuivi');
    const depot = champsDe('app/lib/gestion/periodeRepo.ts', 'TraceClassement');
    expect(ecran).toEqual(depot);
    /* 🔴 ET LES SIX SONT NOMMÉS ICI : un champ ajouté d'un seul côté fait rougir l'épreuve au-dessus ; un champ
       ajouté des DEUX côtés sans être compris fait rougir celle-ci. */
    expect(depot).toEqual([
      'exceptionCreee', 'exceptionsRetirees', 'filId', 'messageId', 'periodeCreee', 'periodesRemplacees',
    ]);
  });

  /** ⚠️ Et la route les relit un par un : un champ oublié là arriverait `null`, donc jamais défait. */
  it('⚠️ la route lit les six champs de la trace', () => {
    const src = readFileSync('app/(admin)/api/admin/gestion/suivi/route.ts', 'utf8');
    const debut = src.indexOf('export function traceRecue');
    const corps = src.slice(debut, src.indexOf('\n}', debut));
    for (const champ of ['filId', 'messageId', 'periodeCreee', 'exceptionCreee',
      'periodesRemplacees', 'exceptionsRetirees']) {
      expect(corps, champ).toContain(champ);
    }
  });
});
