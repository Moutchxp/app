-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 317 — LA LISTE DES TYPES D'ÉVÉNEMENT N'A PLUS QU'UNE SOURCE (lot CAPSULE-TYPE-EVENEMENT, 07/10/2026)
--
-- ═══ CE QUI N'ALLAIT PAS ════════════════════════════════════════════════════════════════════════════════════════
-- ARNO : « Il faut UNE seule source de vérité pour la liste des types, lue par TOUS ces endroits. Ainsi, un type
-- créé plus tard apparaît automatiquement partout (listes de choix, filtres, capsule) sans toucher au code de
-- chaque écran. »
--
-- La liste était écrite TROIS fois : le tableau `CATEGORIES_EVENEMENT`, la chaîne de `if` de `motCategorie()`, et
-- cette contrainte-ci (posée par la 268). Les deux premières sont désormais DÉRIVÉES d'une déclaration unique,
-- `TYPES_EVENEMENT` (`app/lib/gestion/evenementQualite.ts`). La troisième — celle-ci — est RÉGÉNÉRÉE depuis elle.
--
-- ═══ 🔴 POURQUOI ON NE SUPPRIME PAS LA CONTRAINTE ═══════════════════════════════════════════════════════════════
-- Elle fait DOUBLE GARDE avec `categorieValide()`, et c'est délibéré depuis la 268 : « un garde applicatif se
-- contourne au prochain script, une contrainte non ». Le défaut n'était pas qu'elle existe, c'était que PERSONNE
-- ne pouvait prouver qu'elle disait la même chose que le code. C'est ce que cette migration répare : la liste
-- ci-dessous est COPIÉE de `TYPES_EVENEMENT`, et l'épreuve `typeEvenement.test.ts` relit ce fichier pour exiger
-- qu'elles soient identiques, clé pour clé et dans le même ordre. Une divergence devient donc une suite ROUGE,
-- et non une carte qu'on n'arrive pas à enregistrer six mois plus tard.
--
-- ═══ 🔴 CE QUE CETTE MIGRATION NE CHANGE PAS : LES DONNÉES ══════════════════════════════════════════════════════
-- Les quatre clés sont EXACTEMENT celles de la 268 — travaux, fuite_eau, administratif, litige. Aucune ligne n'est
-- lue, écrite, ni déplacée : on rejoue une contrainte à l'identique pour qu'elle ait désormais une origine nommée.
-- Le contrôle avant/après (nombre d'événements par type) est donc identique PAR CONSTRUCTION, et il a été fait.
--
-- ⚠️ ELLE EST SANS EFFET SI LA 268 N'EST PAS APPLIQUÉE : sans la colonne `categorie`, il n'y a pas de contrainte à
--    rejouer, et le bloc ci-dessous ne fait rien plutôt que d'échouer. La sonde `evenementQualifieDisponible()`
--    continue de commander l'affichage, exactement comme avant.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/317_gestion_evenement_types_source_unique.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── LA CONTRAINTE, REJOUÉE DEPUIS LA SOURCE UNIQUE ──────────────────────────────────────────────────────────────
-- ⚠️ CETTE LISTE EST CELLE DE `TYPES_EVENEMENT` (app/lib/gestion/evenementQualite.ts), DANS LE MÊME ORDRE.
--    Ajouter un type = une ligne là-bas, et une migration qui rejoue ce bloc. Rien d'autre, aucun écran.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'gestion_evenement' AND column_name = 'categorie') THEN
    ALTER TABLE gestion_evenement DROP CONSTRAINT IF EXISTS gestion_evenement_categorie_chk;
    ALTER TABLE gestion_evenement ADD CONSTRAINT gestion_evenement_categorie_chk
      CHECK (categorie IS NULL OR categorie = ANY (ARRAY['travaux','fuite_eau','administratif','litige']));

    COMMENT ON COLUMN gestion_evenement.categorie IS
      'Type de l''événement. Liste tenue par TYPES_EVENEMENT (app/lib/gestion/evenementQualite.ts) et rejouée ici '
      'par la migration 317. NULL = non précisé : la carte affiche alors « Type à définir », qui se clique.';
  END IF;
END $$;

COMMIT;
