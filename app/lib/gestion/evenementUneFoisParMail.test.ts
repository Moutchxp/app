import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sqlEvenementsDesFils } from './historiqueRepo';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 3 — UN ÉVÉNEMENT N'APPARAÎT QU'UNE FOIS PAR MAIL ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT (relevé au lot 4, corrigé sur accord d'Arno du 05/10/2026) : sur le bien 315, le message **57188**
 * rendait `evenements: [1, 1, 1, 1, 1]` — la même carte cinq fois. L'écran affichait cinq capsules identiques et
 * la console criait huit fois « Encountered two children with the same key, `1` ». Mot d'Arno : « Un événement
 * n'apparaît qu'une fois par mail. Corrige la requête, pas seulement l'affichage. »
 *
 * ═══ 🔴 CE N'ÉTAIT PAS UNE DONNÉE ABÎMÉE — ET C'EST CE QUI RENDAIT LE DÉFAUT INVISIBLE ══════════════════════════
 *
 * `gestion_affectation` porte DEUX PORTÉES, tenues par deux index uniques partiels :
 *   · `message_id IS NULL` → l'affectation couvre TOUT le fil (un seul actif par fil) ;
 *   · `message_id = X`     → elle ne couvre QUE ce message (un seul actif par message).
 *
 * MESURÉ EN BASE LE 05/10/2026 : le fil 36475 porte **cinq** affectations actives, une par message (57123, 57145,
 * 57188, 57202, 57224), toutes vers l'événement 1 — cinq lignes parfaitement légitimes, posées entre le 28 et le
 * 29 septembre. La base entière n'en compte que six actives : cinq « un message » et une « fil entier ».
 *
 * 🔴 LE DÉFAUT ÉTAIT DANS LA LECTURE : la requête joignait `gestion_affectation` par `fil_id` SEUL. Cinq lignes
 * pour un fil ⇒ cinq fois l'événement, pour CHACUN des huit messages de ce fil.
 *
 * ═══ 🔴 LA PREUVE, JOUÉE SUR LA VRAIE BASE AVANT D'ÉCRIRE CE FICHIER ════════════════════════════════════════════
 *
 * L'ancienne requête sur le fil 36475 : **5 lignes**, toutes `36475 | 1`. La nouvelle : **1 ligne**,
 * `36475 | 1 | GES-2026-000001`. Et sur TOUTE la base, le nombre de couples (fil, événement) rendus plusieurs
 * fois passe de **1 couple / 5 lignes** à **0**.
 *
 * ⚠️ CE QUE CE FICHIER PEUT TENIR, ET CE QU'IL NE PEUT PAS. Il n'y a pas de base dans une épreuve : ce qui est
 * éprouvé ici, c'est la requête que le dépôt émet VRAIMENT (elle est nommée et exportée, comme `sqlPageBoite`
 * avant elle), par FRAGMENTS SÉMANTIQUES sur une chaîne aux blancs normalisés — jamais sa mise en forme.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * La requête, blancs normalisés : on éprouve le SENS, jamais l'indentation (règle du dépôt, AGENTS.md).
 *
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE (08/10/2026) — CE QUE CE FICHIER TENAIT, ET CE QU'IL TIENT MAINTENANT ════════════
 *
 * Il figeait la FORME EXACTE de la requête : « SELECT DISTINCT fil_id, evenement_id FROM gestion_affectation »,
 * « WHERE actif AND fil_id = ANY(…) », « ORDER BY af.fil_id, … ». C'est précisément ce qu'AGENTS.md interdit aux
 * tests nouveaux (« ne jamais figer la FORME d'un SQL émis »), et ce que les anciens migrent « au fil de l'eau,
 * quand un chantier les touche ». Ce chantier les touche.
 *
 * 🔴 POURQUOI LA REQUÊTE A CHANGÉ : la règle d'Arno du 08/10/2026 (point 5) borne l'étiquette aux PÉRIODES
 * OUVERTES de l'événement — « un mail reçu entre une Clôture et la Réouverture suivante n'est PAS étiqueté ».
 * Une période se compare à une DATE DE MAIL : la requête prend donc des MESSAGES, et non plus des fils. Le fil
 * reste la condition d'appartenance (`af.fil_id = msg.fil_id`) ; le message n'apporte que son instant.
 *
 * 🔴 LA GARANTIE DU LOT HISTORIQUE-BIEN-5 N'EST PAS RELÂCHÉE D'UN POUCE, ET C'EST CE QUE CE FICHIER VÉRIFIE
 * MAINTENANT : cinq affectations actives d'un même fil vers un même événement doivent rendre UNE ligne. Elle est
 * tenue par le `SELECT DISTINCT` de tête, qui porte sur (message, événement) — la clé que l'écran emploie.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const SQL = sqlEvenementsDesFils('$1::bigint[]').replace(/\s+/g, ' ');
const REPO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');

describe('point 3 — le couple (mail, événement) est rendu unique', () => {
  /**
   * 🔴🔴 LA GARANTIE CENTRALE, ET ELLE SURVIT AU CHANGEMENT DE FORME. Cinq affectations actives du fil 36475
   * vers l'événement 1 (mesurées en base le 05/10/2026) joignent cinq fois ; le `DISTINCT` de tête rend une
   * seule ligne, parce que les cinq portent exactement les mêmes valeurs.
   */
  it('🔴🔴 le dédoublonnage porte sur la clé que l’écran emploie : (message, événement)', () => {
    expect(SQL).toContain('SELECT DISTINCT msg.id AS message_id, ev.id');
  });

  it('🔴🔴 LE DÉFAUT NE PEUT PAS REVENIR : aucune jointure non dédoublonnée vers les événements', () => {
    /* C'est exactement ce qui produisait cinq lignes : une jointure directe SANS `DISTINCT` en tête. */
    expect(SQL).not.toMatch(/SELECT af\.fil_id, ev\./);
    expect(SQL.startsWith('SELECT DISTINCT ')).toBe(true);
  });

  it('⚠️ SEULES LES AFFECTATIONS ACTIVES COMPTENT — une affectation détachée n’a plus cours', () => {
    expect(SQL).toContain('JOIN gestion_affectation af ON af.actif');
  });

  it('⚠️ LE TRI N’A PAS BOUGÉ DE SENS : le plus récemment ouvert en tête, l’identifiant pour départager', () => {
    expect(SQL).toContain('ev.ouvert_le DESC, ev.id DESC');
  });

  /**
   * ══ 🔴🔴 CE QUE CETTE ÉPREUVE DISAIT, ET POURQUOI SON VERDICT S'INVERSE ════════════════════════════════════
   *
   * Elle s'appelait « LA PORTÉE RESTE CELLE DU FIL » et exigeait `SQL` SANS `message_id` : la question posée au
   * lot HISTORIQUE-BIEN-5 était restée ouverte (« scoper par message retirerait la capsule de trois messages
   * du fil 36475 »), et Arno ne l'avait pas tranchée.
   *
   * 🔴 IL L'A TRANCHÉE LE 08/10/2026, ET DANS L'AUTRE SENS : « Un mail ne porte “Événement en cours” que s'il
   * est daté DANS une période ouverte. » C'est une date de MAIL qui décide, donc la requête lit des messages.
   *
   * ⚠️ ET LA CRAINTE D'ALORS NE SE RÉALISE PAS : les trois messages du fil 36475 qu'aucune affectation ne vise
   * nommément gardent leur étiquette, parce que l'APPARTENANCE reste celle du fil (`af.fil_id = msg.fil_id`).
   * Seul le QUAND est borné. C'est la nuance que la question laissait justement en suspens.
   */
  it('🔴🔴 la portée est celle du FIL, et la borne celle du MAIL', () => {
    expect(SQL).toContain('JOIN gestion_affectation af ON af.actif AND af.fil_id = msg.fil_id');
    expect(SQL).toContain('WHERE msg.id = ANY($1::bigint[])');
    /* ⚠️ `af.message_id` N'EST TOUJOURS PAS LUE : la portée « un seul message » de la colonne reste ignorée par
       cette voie — c'est la voie du BIEN qui la lit, et c'est une autre question. */
    expect(SQL).not.toContain('af.message_id');
  });

  it('🔴 LA REQUÊTE EST NOMMÉE UNE FOIS : le dépôt n’en garde pas une seconde copie', () => {
    /* Le corps SQL ne doit apparaître qu'à UN endroit du dépôt — sa fonction. Deux copies divergeraient. */
    const occurrences = REPO.split('SELECT DISTINCT msg.id AS message_id').length - 1;
    expect(occurrences).toBe(1);
    /**
     * 🔴🔴 ET ELLE A DEUX APPELANTS, POUR LA MÊME RAISON (lot FILTRE-COMME-ETIQUETTE) : le filtre « Événement
     * ouvert » ne réécrit pas la règle, il appelle cette requête bornée au mail courant.
     *
     * 🔴 LES DEUX VOIES PRENNENT MAINTENANT LE MÊME ENSEMBLE, `ARRAY[m.id]`, et c'est une simplification du lot
     * ETAT-PAR-LA-FRISE : la voie du fil se borne elle aussi à une date de mail.
     */
    expect(REPO).toContain("sqlEvenementsDesFils('$1::bigint[]'), [uniques]);");
    expect(REPO).toContain("sqlEvenementsDesFils('ARRAY[m.id]')");
  });

  /**
   * 🔴🔴 LA BORNE DES PÉRIODES EST BIEN LÀ, et elle vient du module qui porte la règle — jamais réécrite ici.
   * Sans elle, un mail reçu entre une Clôture et la Réouverture suivante garderait son étiquette.
   */
  it('🔴🔴 la voie du fil est bornée par les périodes ouvertes de l’événement', () => {
    expect(SQL).toContain('msg.recu_le >= svv_p.du');
    expect(SQL).toContain('svv_p.au IS NULL OR msg.recu_le <= svv_p.au');
  });
});
