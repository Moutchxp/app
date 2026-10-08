import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  sqlEvenementsDesFils, sqlEvenementsDesMessages, sqlFiltreEvenementOuvert,
} from './historiqueRepo';
import { ETAT_EVENEMENT_TRAITE, estEvenementOuvert, sqlEvenementOuvert } from './historique';

/**
 * ══ 🔴🔴 LOT FILTRE-COMME-ETIQUETTE — LE FILTRE MONTRE EXACTEMENT LES MAILS QUI PORTENT L'ÉTIQUETTE ══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (07/10/2026), mot pour mot : « aligne le filtre “Événement ouvert” de l'historique sur la même
 * règle que l'étiquette (MÊME CODE, PAS DE SECOND CHEMIN) : le filtre montre exactement les mails qui portent
 * l'étiquette. »
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER PEUT GARANTIR, ET COMMENT ═══════════════════════════════════════════════════════════
 *
 * Il n'y a pas de base dans une épreuve : on ne peut pas y COMPTER deux listes et les comparer. Mais on peut
 * garantir quelque chose de plus fort qu'une comparaison de chiffres — que les deux listes n'ont QU'UNE source.
 * Le filtre est littéralement FAIT des deux requêtes de l'étiquette : ce fichier recompose, caractère par
 * caractère, le texte que le filtre envoie à PostgreSQL, et vérifie qu'il ne diffère de celui de l'étiquette
 * QUE par l'ensemble de messages sur lequel il porte. Une divergence future ne pourra donc pas « passer entre
 * les mailles » : elle fera rougir ces épreuves, parce qu'il n'y a pas deux textes à garder d'accord.
 *
 * ═══ 🔴 CE QUI A ÉTÉ MESURÉ EN BASE AVANT ET APRÈS (07/10/2026) ═════════════════════════════════════════════════
 *
 * SIMULATION, sur toute la base : avant 10 mails passaient le filtre, après 14 — 4 entrent, 0 sort. Les quatre
 * sont sur le MÊME bien, le 315, tous dans la fenêtre de GES-2026-000001 : 57597 (06/10 12:28), 57276
 * (30/09 12:26), 57258 (30/09 11:14), 55969 (24/09 09:40). Ce sont EXACTEMENT les quatre mails qui avaient gagné
 * l'étiquette au lot EVENEMENT-MINIMALISTE.
 *
 * APRÈS APPLICATION, relevé sur le bien 315 par les fonctions du dépôt elles-mêmes (`pageHistorique` +
 * `enteteHistorique`, 140 mails en tout) :
 *   portent l'étiquette : 9 → 55969, 57119, 57123, 57144, 57145, 57188, 57258, 57276, 57597
 *   passent le filtre   : 9 → les MÊMES, dans le même ordre
 *   compteur d'en-tête  : 9 sur 140 · filtrées sans étiquette : aucune · étiquetées non filtrées : aucune
 * Et sur les deux plus gros biens de la base (421 : 328 mails, 459 : 238) : égalité aussi, à zéro de part et
 * d'autre. Coût mesuré : page filtrée 3 à 8 ms, soit jamais plus que la page nue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les blancs normalisés : on éprouve le SENS, jamais l'indentation (règle du dépôt, AGENTS.md). */
const plat = (s: string): string => s.replace(/\s+/g, ' ').trim();
const REPO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');
const PUR = readFileSync('app/lib/gestion/historique.ts', 'utf8');

describe('« ouvert » n’est défini qu’une fois, et il l’est dans les deux langages', () => {
  it('🔴🔴 la constante est unique, et les trois états de la table sont respectés', () => {
    expect(ETAT_EVENEMENT_TRAITE).toBe('traite');
    expect(estEvenementOuvert('a_traiter')).toBe(true);
    expect(estEvenementOuvert('en_cours')).toBe(true);
    expect(estEvenementOuvert('traite')).toBe(false);
  });

  it('🔴 la MÊME règle en SQL, pour l’alias demandé', () => {
    expect(sqlEvenementOuvert('ev')).toBe("ev.etat <> 'traite'");
    expect(sqlEvenementOuvert('porte')).toBe("porte.etat <> 'traite'");
  });

  /**
   * 🔴🔴 LE DÉPÔT N'ÉCRIT PLUS « traité » À LA MAIN. C'est exactement ce qui rendait l'ancien écart possible :
   * le filtre portait `ev.etat <> 'traite'` dans son SQL, la projection `r.etat !== 'traite'` en TypeScript, et
   * rien ne les tenait ensemble. Les deux viennent maintenant du module pur.
   */
  it('🔴🔴 ni le filtre ni la projection ne recopient l’état « traité »', () => {
    expect(REPO).not.toContain("etat <> 'traite'");
    expect(REPO).not.toContain("etat !== 'traite'");
    /**
     * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE (08/10/2026) — LA PROJECTION NE LIT PLUS DU TOUT LA COLONNE ═════════════
     *
     * Elle valait `ouvert: estEvenementOuvert(r.etat)` : la règle venait bien du module pur, mais la DONNÉE
     * venait de `gestion_evenement.etat`. Le constat d'Arno a montré ce que cette donnée vaut — « clos » sur
     * un dossier dont la carte Clôture avait été retirée.
     *
     * 🔴 LA BASE REND MAINTENANT `ouvert` DÉJÀ TRANCHÉ, calculé sur les cartes de BORNE de la frise. Il n'y a
     * plus rien à lire ni à convertir côté TypeScript — donc plus rien à oublier de convertir.
     */
    expect(REPO).toContain('ouvert: r.ouvert });');
    expect(REPO).not.toContain('estEvenementOuvert(');
    // Et la constante n'est écrite qu'à UN endroit du module pur : sa déclaration.
    expect(PUR.split("= 'traite'").length - 1).toBe(1);
  });
});

describe('le filtre est FAIT des deux requêtes de l’étiquette — pas d’un second chemin', () => {
  /**
   * ══ 🔴🔴 L'ÉPREUVE CENTRALE DU LOT ════════════════════════════════════════════════════════════════════════
   *
   * Le texte que le filtre envoie contient, VERBATIM, les deux requêtes de l'étiquette — seule leur borne
   * change. Si quelqu'un réécrivait un jour la règle du bien ou de la fenêtre dans le filtre, ces deux
   * `toContain` tomberaient : un texte recopié ne reste pas identique à sa source.
   */
  it('🔴🔴 les deux voies de l’étiquette sont dans le filtre, caractère pour caractère', () => {
    for (const avecMessageId of [true, false]) {
      const filtre = plat(sqlFiltreEvenementOuvert(avecMessageId));
      expect(filtre).toContain(plat(sqlEvenementsDesFils('ARRAY[m.id]')));
      expect(filtre).toContain(plat(sqlEvenementsDesMessages(avecMessageId, 'ARRAY[m.id]')));
    }
  });

  /**
   * 🔴🔴 ET LA SEULE DIFFÉRENCE EST LA BORNE. On remet dans le texte du filtre l'ensemble que l'étiquette
   * emploie, et l'on doit retrouver MOT POUR MOT ce que l'étiquette envoie. C'est la garantie « même code » :
   * aucune condition de plus, aucune de moins, aucun `etat` oublié en route.
   */
  it('🔴🔴 rien d’autre que l’ensemble de messages ne distingue le filtre de l’étiquette', () => {
    /* 🔴 LOT ETAT-PAR-LA-FRISE — UNE SEULE BORNE À REMETTRE : les deux voies prennent désormais le même
       ensemble de MESSAGES, parce que la voie du fil est bornée par la date du mail, elle aussi. */
    const commeLEtiquette = plat(sqlFiltreEvenementOuvert(true))
      .replaceAll('ARRAY[m.id]', '$1::bigint[]');
    expect(commeLEtiquette).toContain(plat(sqlEvenementsDesFils('$1::bigint[]')));
    expect(commeLEtiquette).toContain(plat(sqlEvenementsDesMessages(true, '$1::bigint[]')));
  });

  /**
   * 🔴 LES **DEUX** VOIES, OU LE FILTRE REDEVIENDRAIT PLUS ÉTROIT QUE L'ÉTIQUETTE. C'est précisément le défaut
   * d'avant : le filtre ne connaissait que l'affectation du fil, l'étiquette connaissait aussi le bien et la
   * fenêtre. Les deux branches s'unissent par `UNION ALL` — on ne cherche pas combien, seulement s'il en existe.
   */
  it('🔴 le filtre unit les deux voies, et ne garde que les événements ouverts', () => {
    const f = plat(sqlFiltreEvenementOuvert(true));
    expect(f.startsWith('EXISTS (')).toBe(true);
    expect(f).toContain('UNION ALL');
    /* 🔴 LOT ETAT-PAR-LA-FRISE — « ouvert » n'est plus demandé à la colonne : chaque voie le rend déjà,
       calculé sur les cartes de BORNE. Le filtre ne fait que garder les lignes où il est vrai. */
    expect(f).toContain('WHERE porte.ouvert)');
    // La voie du bien apporte la période ; la voie du fil, l'affectation active — et la période aussi.
    expect(f).toContain('msg.recu_le >= svv_p.du');
    expect(f).toContain('JOIN gestion_affectation af ON af.actif AND af.fil_id = msg.fil_id');
  });

  /**
   * 🔴🔴 LE FILTRE SE CORRÈLE SUR LE MAIL COURANT, PAR SES DEUX CLÉS. `m.fil_id` pour la voie du fil, `m.id`
   * pour la voie du bien : `m` est la table des messages de la requête porteuse, nommée ainsi dans les CINQ
   * requêtes de cet écran.
   */
  it('🔴🔴 la borne est le mail courant, et c’est la MÊME pour les deux voies', () => {
    const f = sqlFiltreEvenementOuvert(true);
    /**
     * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — `m.fil_id` A DISPARU DE LA CORRÉLATION, ET C'EST UN GAIN ═════════════
     *
     * Les deux voies se corrélaient par deux clés différentes : `m.fil_id` pour le fil, `m.id` pour le bien.
     * Depuis que la voie du fil est bornée par la PÉRIODE — donc par une date de mail — elle part du message
     * elle aussi, et retrouve le fil par `msg.fil_id`. Une seule clé de corrélation, donc un piège d'alias de
     * moins (voir l'épreuve suivante).
     */
    expect(f).toContain('ANY(ARRAY[m.id])');
    expect(f).not.toContain('ARRAY[m.fil_id]');
  });

  /**
   * ══ 🔴🔴 LE PIÈGE QUI A FAILLI PASSER, ET QUE CETTE ÉPREUVE INTERDIT DE RAMENER ══════════════════════════
   *
   * `sqlEvenementsDesMessages` nommait `m` sa propre jointure sur `gestion_message`. Glissée dans l'`EXISTS` du
   * filtre, cette seconde déclaration MASQUAIT la table porteuse : `r.message_id = ANY(ARRAY[m.id])` devenait
   * une tautologie (la jointure interne l'impose déjà), et le filtre aurait rendu VRAI pour TOUT mail dès qu'un
   * seul mail de la base portait un événement ouvert. Aucune erreur de PostgreSQL, aucun avertissement du
   * compilateur : juste un filtre qui ne filtre plus. L'alias interne s'appelle `msg`.
   */
  it('🔴🔴 aucune requête de l’étiquette ne redéclare l’alias `m` du mail courant', () => {
    for (const sql of [sqlEvenementsDesFils('ARRAY[m.fil_id]'), sqlEvenementsDesMessages(true, 'ARRAY[m.id]')]) {
      expect(plat(sql)).not.toMatch(/\bgestion_message m\b/);
      expect(plat(sql)).not.toMatch(/\bAS m\b/);
    }
  });

  /**
   * ⚠️ `aa.message_id` N'EXISTE QUE DEPUIS LA MIGRATION 234 : nommer la colonne sans elle fait tomber TOUT
   * l'écran. Le filtre prend le même témoin que l'étiquette — il le reçoit de ses cinq appelants, qui l'ont
   * déjà en main, plutôt que de poser une seconde sonde dans la même requête.
   */
  it('⚠️ la colonne de la migration 234 n’est nommée que si elle existe, filtre compris', () => {
    expect(sqlFiltreEvenementOuvert(false)).not.toContain('aa.message_id');
    expect(sqlFiltreEvenementOuvert(true)).toContain('aa.message_id');
    expect(REPO).toContain('f: FiltresHistorique, apres: number, deplacements: boolean,');
    expect(REPO).toContain('if (f.evenementOuvert) bouts.push(sqlFiltreEvenementOuvert(deplacements));');
  });

  /**
   * 🔴 LE FILTRE N'AJOUTE AUCUN PARAMÈTRE LIÉ, et c'est ce qui le rend sans danger pour la numérotation. Les
   * cinq requêtes de l'écran lient 3 valeurs de base, ou 8 pour un locataire, puis les filtres à la suite — un
   * placeholder de plus ici décalerait tout ce qui suit SANS erreur de PostgreSQL (précédent du 26/09/2026).
   * Le mail courant arrive par corrélation, pas par un `$n`.
   */
  it('🔴 le filtre ne lie aucune valeur : pas un seul placeholder de plus', () => {
    expect(sqlFiltreEvenementOuvert(true)).not.toMatch(/\$\d/);
    expect(sqlFiltreEvenementOuvert(false)).not.toMatch(/\$\d/);
  });
});
