-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 319 — « critique » DEVIENT « urgent », ET LA LISTE DES NIVEAUX N'A PLUS QU'UNE SOURCE
--       (lot URGENCE-EVENEMENT, point 2, 08/10/2026)
--
-- ═══ CE QU'ARNO DEMANDE ═════════════════════════════════════════════════════════════════════════════════════════
-- « Le niveau le plus haut s'appelle “Urgent” partout (création, modification, carte, fiche, filtres, bulles). Si
-- la valeur stockée est “critique”, écris une migration qui la renomme sans rien perdre : chaque événement garde
-- son niveau. »
--
-- ═══ 🔴 CE QUE LA MIGRATION FAIT, DANS CET ORDRE, ET POURQUOI CET ORDRE ═════════════════════════════════════════
--   ① la contrainte est RETIRÉE d'abord. Elle n'autorise que ['normale','haute','critique'] : écrire « urgent »
--      avant de l'avoir retirée serait REFUSÉ par la base, et la migration échouerait sur sa propre première
--      ligne ;
--   ② les lignes qui portent « critique » sont renommées en « urgent ». Aucune autre colonne n'est touchée, et
--      aucune ligne n'est créée ni supprimée : chaque événement garde SON niveau, sous son nouveau nom ;
--   ③ la contrainte est REPOSÉE sur la liste neuve ['normale','haute','urgent'].
--
-- 🔴 LA CONTRAINTE N'EST PAS SUPPRIMÉE, ELLE EST REJOUÉE. Elle fait DOUBLE GARDE avec `urgenceValide()`, et c'est
-- délibéré depuis la 268 : « un garde applicatif se contourne au prochain script, une contrainte non ». La liste
-- ci-dessous est COPIÉE de `NIVEAUX_URGENCE` (app/lib/gestion/evenementQualite.ts), dans le MÊME ordre, et
-- l'épreuve `urgenceEvenement.test.ts` relit ce fichier pour exiger qu'elles soient identiques, clé pour clé.
-- Une divergence devient donc une suite ROUGE, et non une carte qu'on n'arrive pas à enregistrer six mois plus tard.
--
-- ═══ 🔴 LE CONTRÔLE AVANT / APRÈS ═══════════════════════════════════════════════════════════════════════════════
-- MESURÉ EN BASE LE 08/10/2026, AVANT D'ÉCRIRE CE FICHIER : `SELECT coalesce(urgence,'(aucune)'), count(*) FROM
-- gestion_evenement GROUP BY 1` rend UNE seule ligne — **(aucune) : 2** —, sur un total de 2 événements. Il n'y a
-- donc, aujourd'hui, AUCUNE ligne à renommer : le `UPDATE` ci-dessous touche 0 ligne, et le nombre d'événements par
-- niveau est identique avant et après PAR CONSTRUCTION. Le `UPDATE` reste écrit quand même — une base de secours,
-- une copie plus ancienne ou une reprise d'avant ce lot peut en porter, et c'est exactement ce qu'« sans rien
-- perdre » veut dire.
--
-- ⚠️ ELLE EST SANS EFFET SI LA 268 N'EST PAS APPLIQUÉE : sans la colonne `urgence`, il n'y a ni ligne à renommer ni
--    contrainte à rejouer, et le bloc ci-dessous ne fait rien plutôt que d'échouer. La sonde
--    `evenementQualifieDisponible()` continue de commander l'affichage, exactement comme avant.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/319_gestion_evenement_urgence_urgent.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE renommees integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'gestion_evenement' AND column_name = 'urgence') THEN

    -- ① LA CONTRAINTE D'ABORD : elle refuserait « urgent ».
    ALTER TABLE gestion_evenement DROP CONSTRAINT IF EXISTS gestion_evenement_urgence_chk;

    -- ② LES LIGNES, RENOMMÉES. Rien d'autre n'est touché.
    UPDATE gestion_evenement SET urgence = 'urgent' WHERE urgence = 'critique';
    GET DIAGNOSTICS renommees = ROW_COUNT;
    RAISE NOTICE '319 — événements passés de « critique » à « urgent » : %', renommees;

    -- ③ LA CONTRAINTE, REJOUÉE DEPUIS LA SOURCE UNIQUE.
    -- ⚠️ CETTE LISTE EST CELLE DE `NIVEAUX_URGENCE` (app/lib/gestion/evenementQualite.ts), DANS LE MÊME ORDRE.
    --    Ajouter un niveau = une ligne là-bas, et une migration qui rejoue ce bloc. Rien d'autre, aucun écran.
    ALTER TABLE gestion_evenement ADD CONSTRAINT gestion_evenement_urgence_chk
      CHECK (urgence IS NULL OR urgence = ANY (ARRAY['normale','haute','urgent']));

    COMMENT ON COLUMN gestion_evenement.urgence IS
      'Degré d''urgence de l''événement. Liste tenue par NIVEAUX_URGENCE (app/lib/gestion/evenementQualite.ts) et '
      'rejouée ici par la migration 319, qui a renommé « critique » en « urgent ». NULL = non précisé : la capsule '
      'de la carte est alors grise neutre.';
  END IF;
END $$;

COMMIT;
