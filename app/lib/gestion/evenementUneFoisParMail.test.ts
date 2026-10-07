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
 * 🔴🔴 L'ENSEMBLE DE FILS EST UN PARAMÈTRE DEPUIS LE LOT FILTRE-COMME-ETIQUETTE (07/10/2026). Décision d'Arno :
 * « aligne le filtre “Événement ouvert” sur la même règle que l'étiquette (même code, pas de second chemin) ».
 * Le filtre appelle donc CETTE requête-ci, bornée au fil du mail courant (`ARRAY[m.fil_id]`), là où l'étiquette
 * la borne à la page affichée. On éprouve ici la forme de l'étiquette — c'est la même, au paramètre près, et
 * `filtreCommeEtiquette.test.ts` tient cette égalité.
 */
const SQL = sqlEvenementsDesFils('$1::bigint[]').replace(/\s+/g, ' ');
const REPO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');

describe('point 3 — le couple (fil, événement) est rendu unique', () => {
  it('🔴🔴 LA CORRECTION EST DANS LA REQUÊTE : les affectations sont dédoublonnées avant la jointure', () => {
    expect(SQL).toContain('SELECT DISTINCT fil_id, evenement_id FROM gestion_affectation');
  });

  it('🔴🔴 LE DÉFAUT NE PEUT PAS REVENIR : plus de jointure directe sur la table des affectations', () => {
    /* C'est exactement ce qui produisait cinq lignes : `FROM gestion_affectation af JOIN gestion_evenement`. */
    expect(SQL).not.toMatch(/FROM gestion_affectation af JOIN gestion_evenement/);
  });

  it('⚠️ SEULES LES AFFECTATIONS ACTIVES COMPTENT — une affectation détachée n’a plus cours', () => {
    expect(SQL).toContain('WHERE actif AND fil_id = ANY($1::bigint[])');
  });

  it('⚠️ LE TRI N’A PAS BOUGÉ : le plus récemment ouvert en tête, et l’identifiant pour départager', () => {
    expect(SQL).toContain('ORDER BY af.fil_id, ev.ouvert_le DESC, ev.id DESC');
  });

  it('🔴 `ouvert_le` RESTE HORS DE LA CLÉ : le DISTINCT est dans la sous-requête, pas sur le SELECT final', () => {
    /* Un `SELECT DISTINCT` final aurait obligé à sélectionner `ev.ouvert_le` pour pouvoir trier dessus — donc à
       le faire entrer dans la clé de dédoublonnage, où il n'a rien à faire. */
    expect(SQL).not.toMatch(/SELECT DISTINCT af\.fil_id/);
    expect(SQL).not.toContain('ev.ouvert_le,');
  });

  it('⚠️ LA COLONNE QUI PORTE LA PORTÉE N’EST PAS LUE ICI, ET C’EST DÉLIBÉRÉ', () => {
    /**
     * 🔭 QUESTION POSÉE À ARNO. `message_id` existe et est renseignée (5 lignes actives en base). Scoper la
     * lecture par message RETIRERAIT la capsule des trois messages du fil 36475 qu'aucune affectation ne vise
     * nommément, et désaccorderait le filtre « Événement ouvert », qui raisonne lui aussi par fil. Ce n'est pas
     * le défaut qu'Arno a signalé, et ce serait un lot à part entière.
     */
    expect(SQL).not.toContain('message_id');
  });

  it('🔴 LA REQUÊTE EST NOMMÉE UNE FOIS : le dépôt n’en garde pas une seconde copie', () => {
    /* Le corps SQL ne doit apparaître qu'à UN endroit du dépôt — sa fonction. Deux copies divergeraient. */
    const occurrences = REPO.split('SELECT DISTINCT fil_id, evenement_id').length - 1;
    expect(occurrences).toBe(1);
    /**
     * 🔴🔴 ET ELLE A MAINTENANT **DEUX** APPELANTS, POUR LA MÊME RAISON. Lot FILTRE-COMME-ETIQUETTE : le filtre
     * « Événement ouvert » ne réécrit plus la règle, il appelle cette requête bornée au fil du mail courant.
     * Un seul corps SQL, deux bornes — c'est précisément ce que la décision d'Arno demande.
     */
    expect(REPO).toContain("sqlEvenementsDesFils('$1::bigint[]'), [uniques]);");
    expect(REPO).toContain("sqlEvenementsDesFils('ARRAY[m.fil_id]')");
  });

  it('⚠️ LA PORTÉE RESTE CELLE DU FIL : la clé rendue est `fil_id`, comme avant ce lot', () => {
    expect(SQL).toContain('SELECT af.fil_id, ev.id, ev.reference, ev.objet, ev.etat');
  });
});
