import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sqlCompteBoite, sqlPageBoite, sensDeLEtiquette } from './boiteRepo';
import { sqlSansCourrierAutomatique } from './courrierAutomatique';

/**
 * ══ 🔴🔴 LOT RECEPTION-COURRIER-AUTO-CONTENU, POINT 1 — LE COURRIER AUTOMATIQUE **REÇU** ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « quand le lien est activé, voir ces conversations de courrier automatique REÇUES
 * mêlées à la Réception, dans l'ordre chronologique strict de l'ensemble. »
 *
 * ═══ 🔴🔴 CE QUE LA MESURE A TROUVÉ — IL N'Y A RIEN À MÊLER, ET CE N'EST PAS LE CODE ═══════════════════════════════
 *
 * Mesuré en base le 05/10/2026 :
 *   · les 22 098 échanges de l'étiquette « Courrier automatique » portent 22 101 messages, **tous `sens = envoye`**,
 *     tous écrits par `gestion@criterimmo.fr` : **ZÉRO message reçu**, pas un seul ;
 *   · sur 17 341 messages REÇUS, **zéro** porte `exclu_le` — aucune règle n'a jamais écarté un message entrant ;
 *   · et la raison tient en une ligne de `gestion_regle_exclusion` : sur ses 12 règles, **une seule est active**
 *     (nº 5, `gabarit_objet` « Document CRITERIMMO », `sens = envoye`). Les onze autres — dont les sept qui
 *     viseraient du courrier entrant (no-reply, list-id, auto-submitted, precedence, list-unsubscribe,
 *     feedback-id, x-campaign-id) — sont ÉTEINTES depuis la migration 228.
 *
 * 🔴 LE CHEMIN, LUI, EST COMPLET ET JUSTE, et c'est ce que ce fichier FIGE. Le jour où une règle écartera un
 * message reçu, la Réception le cachera par défaut et le remettra à SA DATE d'un clic — sans une ligne de plus.
 *
 * ⚠️ VÉRIFIÉ POUR DE VRAI, SUR LA BASE, PAR UN ESSAI RÉVERSIBLE (message 57497, `noreply@monga.io`, 05/10 09:54,
 * écarté quelques minutes par la règle nº 2 puis rétabli) :
 *   · lien éteint  → 10 244 conversations, l'échange ABSENT, « 1 échange ne contient que du courrier automatique » ;
 *   · lien allumé  → 10 245 conversations, l'échange REVENU **au rang 14**, entre 08:13:44 et 07:53:00 — donc à sa
 *     date, au milieu de la page, et les 25 dates restent strictement décroissantes ;
 *   · écran partagé → 17 005 → 17 006 mails reçus, même ligne, même place.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const RECEPTION = { sorte: 'reception', evenementId: null } as const;
const plat = (s: string): string => s.replace(/\s+/g, ' ');

describe('🔴🔴 ① la Réception ne connaît qu’UN filtre de courrier automatique : l’interrupteur', () => {
  /**
   * 🔴🔴 LE CŒUR DE LA GARANTIE. Lien allumé, il ne doit rester AUCUNE condition sur `exclu_le` dans la requête de
   * la Réception — ni sur le message candidat, ni sur le « y a-t-il plus récent ? ». S'il en restait une, un
   * message reçu écarté par une règle resterait invisible et personne ne saurait pourquoi : c'est exactement la
   * forme du défaut qu'Arno décrit, et elle serait indétectable tant qu'aucune règle n'est allumée.
   */
  it('🔴🔴 lien ALLUMÉ : plus une seule condition `exclu_le`, aux deux étages', () => {
    for (const [nom, sql] of [
      ['page', sqlPageBoite(true, RECEPTION)],
      ['compte', sqlCompteBoite(true, RECEPTION)],
    ] as const) {
      /**
       * ⚠️ ON VISE LES **CONDITIONS**, PAS LE MOT. `exclu_le` apparaît aussi dans une sous-expression
       * d'AFFICHAGE — `count(*) … AND c.exclu_le IS NULL … AS nb_lisibles`, le « combien de messages lisibles »
       * de la ligne. L'interdire tout court serait une fausse alerte permanente : ma première version de ce cas
       * a échoué là-dessus, et c'est la bonne leçon — un filtre et un compteur ne sont pas la même chose.
       */
      expect(plat(sql), nom).not.toContain(sqlSansCourrierAutomatique(false, 'm'));
      expect(plat(sql), nom).not.toContain(sqlSansCourrierAutomatique(false, 'm2'));
      /**
       * ⚠️ ET ON NE CHERCHE PAS NON PLUS UN `WHERE … exclu_le` QUELCONQUE : le sous-compte `nb_lisibles` en porte
       * un, légitimement (`WHERE c.fil_id = p.fil_id AND c.exclu_le IS NULL`). Ma deuxième version de ce cas
       * s'est cassée là-dessus aussi. Ce qui interdit une copie du prédicat écrite à la main vit déjà dans
       * `courrierAutomatiqueDeuxEcrans.test.ts` — et il a servi : il avait trouvé deux copies inline.
       */
    }
  });

  /** 🔴 LIEN ÉTEINT : le filtre est là, AUX DEUX ÉTAGES — c'est le défaut, et il ne bouge pas. */
  it('🔴 lien ÉTEINT : le filtre porte sur `m` ET sur `m2`', () => {
    for (const [nom, sql] of [
      ['page', sqlPageBoite(false, RECEPTION)],
      ['compte', sqlCompteBoite(false, RECEPTION)],
    ] as const) {
      expect(plat(sql), nom).toContain(sqlSansCourrierAutomatique(false, 'm'));
      expect(plat(sql), nom).toContain(sqlSansCourrierAutomatique(false, 'm2'));
    }
  });

  /**
   * 🔴🔴 ET LA RÉCEPTION N'AJOUTE AUCUN FILTRE À ELLE. Son prédicat d'étiquette est VIDE : elle se borne au SENS
   * (`sensDeLEtiquette`), appliqué au parcours. Un `AND m.exclu_le IS NULL` écrit en plus dans l'étiquette — ou un
   * `sens` recopié — rendrait l'interrupteur sans effet ici, sans qu'aucune autre épreuve ne s'en aperçoive.
   */
  it('🔴🔴 l’étiquette « Réception » se borne au SENS, et ne filtre rien d’autre', () => {
    expect(sensDeLEtiquette(RECEPTION)).toBe('recu');
    const src = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
    /* Le `case 'reception'` rend la chaîne VIDE : c'est écrit noir sur blanc dans le dépôt, et ce cas le tient. */
    expect(plat(src)).toContain("case 'reception': return '';");
  });

  /**
   * 🔴🔴 LE SENS ENTRE AUX DEUX ÉTAGES, SANS REGARDER L'EXCLUSION. C'est ce qui fait qu'un message reçu ÉCARTÉ
   * devient le candidat de son échange dès que l'interrupteur est allumé : Réception montre « le dernier message
   * REÇU », et non « le dernier message reçu NON écarté » — cette seconde règle vit dans l'interrupteur, et là
   * seulement.
   */
  it('🔴🔴 lien allumé, le candidat de la Réception est le dernier message REÇU, écarté ou non', () => {
    const sql = plat(sqlPageBoite(true, RECEPTION));
    expect(sql).toContain("m.sens = 'recu'");
    expect(sql).toContain("m2.sens = 'recu'");
    /* 🔴 ET AUCUNE EXCLUSION N'EST ACCROCHÉE À CE SENS : les deux règles restent séparées. */
    expect(sql).not.toContain("m.sens = 'recu' AND m.exclu_le");
  });
});

describe('🔴 ② l’étiquette « Courrier automatique » garde SA définition, qui est celle d’un ÉCHANGE', () => {
  /**
   * ⚠️ DEUX NOTIONS VOISINES QU'IL NE FAUT PAS CONFONDRE, et c'est la source du malentendu :
   *   · l'ÉTIQUETTE « Courrier automatique » = les échanges dont AUCUN message n'est lisible (niveau ÉCHANGE) ;
   *   · l'INTERRUPTEUR = les messages écartés par une règle (niveau MESSAGE).
   * Sur les données d'aujourd'hui les deux désignent le même courrier — tout sortant — mais ce sont bien deux
   * questions, et les mêler ferait disparaître de l'étiquette un échange qui porte UN message lisible.
   */
  it('🔴 elle demande qu’AUCUN message de l’échange ne soit lisible', () => {
    const src = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
    expect(plat(src)).toContain(
      "case 'automatique': return `AND NOT EXISTS (SELECT 1 FROM gestion_message ml "
      + 'WHERE ml.fil_id = m.fil_id AND ml.exclu_le IS NULL)`;');
  });

  /** ⚠️ ET ELLE NE DÉPEND PAS DE L'INTERRUPTEUR : allumé ou éteint, elle montre les mêmes échanges. */
  it('⚠️ l’interrupteur ne change pas la définition de l’étiquette', () => {
    const etiquette = { sorte: 'automatique', evenementId: null } as const;
    for (const avec of [true, false]) {
      expect(plat(sqlCompteBoite(avec, etiquette)))
        .toContain('AND NOT EXISTS (SELECT 1 FROM gestion_message ml WHERE ml.fil_id = m.fil_id');
    }
  });
});
