-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 279 — LES 16 TÉLÉPHONES QUE L'ANNOTATION A EMPÊCHÉ DE NORMALISER (lot ANNOTATIONS-TEL, 30/09/2026)
--
-- 🔴🔴 MIGRATION LIVRÉE NON APPLIQUÉE. Arno : « Aucune réécriture en base sans me demander : montre-moi d'abord
-- le tableau et le nombre de lignes qu'un nettoyage en base toucherait. » Ce fichier EST la réponse chiffrée :
-- 16 lignes sur 804 téléphones. Il ne sera exécuté que sur un OK explicite.
--
-- ⚠️ ELLE N'EST PAS NÉCESSAIRE À L'AFFICHAGE. Le lot ANNOTATIONS-TEL corrige déjà l'écran SANS toucher la base :
-- `formaterTelephone` décortique l'annotation, renormalise le numéro nettoyé et n'accorde plus sa confiance à la
-- colonne `valeur`. Cette migration ne règle qu'une chose : ces 16 lignes portent dans `valeur` une forme qui
-- n'est PAS E.164, alors que la colonne est là pour ça, et que c'est elle qu'interrogent la recherche et le
-- rapprochement mail ↔ fiche. Le jour où un numéro annoté doit se retrouver par une recherche exacte, c'est
-- cette forme qui décide.
--
-- ═══ CE QUI S'EST PASSÉ À L'IMPORT ═══════════════════════════════════════════════════════════════════════════
--
-- L'import normalise `valeur_brute` vers E.164 dans `valeur`, et se replie sur les chiffres bruts quand la
-- normalisation échoue. L'annotation faisait échouer la normalisation :
--   • « 06 84 71 18 17 (M) »            → repli « 0684711817 »              (11 lignes de ce genre)
--   • « 0668807322 - 0629617981 »       → repli « 06688073220629617981 »    — VINGT chiffres collés
--   • « +351 932 472 464 - +351 934… »  → repli « +351932472464351934722745 »
-- Aucune n'est E.164 ; la dernière n'est même pas un numéro.
--
-- ═══ CE QUE LA MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS ═════════════════════════════════════════════════════
--
-- ① ELLE N'ÉCRIT QUE `valeur`. `valeur_brute` et `libelle_source` restent INTACTS : ils portent ce que WIPPIMMO
--    a dit, et c'est d'eux que l'écran retire l'annotation, en tire le type (M → Mobile) et compose la note
--    grise (« M.Moreau », « aussi : 06 29 61 79 81 »). Les écraser ferait disparaître l'information même que
--    le lot vient de rendre lisible.
--
-- ② ELLE NE PERD AUCUN SECOND NUMÉRO. Sur les 9 cellules à deux numéros, `valeur` reçoit le PREMIER — le second
--    reste dans `valeur_brute` et s'affiche en note. Créer une seconde ligne de contact aurait demandé un rang,
--    un libellé et une origine que la base ne porte pas : ce serait inventer une donnée, pas la nettoyer.
--
-- ③ ELLE NE TOUCHE QUE CES 16 LIGNES, NOMMÉES UNE PAR UNE, et seulement si `valeur` porte ENCORE la forme
--    mesurée le 30/09/2026. 🔴 C'EST LA GARDE PRINCIPALE : si quelqu'un a corrigé un de ces numéros dans
--    l'application entre-temps, sa ligne ne bouge pas. Un UPDATE calculé par expression régulière aurait, lui,
--    écrasé la correction humaine sans jamais le dire.
--
-- ④ ELLE NE POSE AUCUN VERROU. Un verrou (`gestion_annuaire_verrou`) dit « l'application possède ce champ,
--    l'import ne l'écrase plus ». Ici l'application ne CORRIGE pas une valeur, elle achève la normalisation que
--    l'import voulait faire : le prochain import doit rester libre de la refaire.
--
-- ⑤ AUCUN DELETE, aucun TRUNCATE. Comme tout ce lot.
--
-- ═══ CONTRÔLE APRÈS APPLICATION ══════════════════════════════════════════════════════════════════════════════
--
-- La migration se contrôle elle-même : elle compte les lignes mises à jour et ÉCHOUE si le compte n'est pas 16
-- (voir le bloc final). Une migration qui ne touche rien en silence est pire qu'une migration qui refuse.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  attendu  integer := 16;
  faites   integer;
BEGIN
  -- ⚠️ SONDE. Le lot est livrable sur une base où 278 n'est pas passée : `archive_le` peut manquer. On ne
  --   NOMME donc la colonne nulle part — les 16 identifiants suffisent à désigner les lignes.
  IF to_regclass('public.gestion_annuaire_contact') IS NULL THEN
    RAISE NOTICE '279 : gestion_annuaire_contact absente — rien a faire.';
    RETURN;
  END IF;

  WITH cible(id, avant, apres) AS (
    VALUES
      (198::bigint,  '0684711817',                '+33684711817'),
      (402,          '06828316740682831674',      '+33682831674'),
      (705,          '0622768928',                '+33622768928'),
      (761,          '06475826610784541294',      '+33647582661'),
      (905,          '07511404670698612052',      '+33751140467'),
      (944,          '0663219393',                '+33663219393'),
      (973,          '07852533370767970990',      '+33785253337'),
      (1012,         '06688073220629617981',      '+33668807322'),
      (1089,         '06438373750783703862',      '+33643837375'),
      (1212,         '33612809738',               '+33612809738'),
      (1261,         '06210404000613432838',      '+33621040400'),
      (1377,         '0623048290',                '+33623048290'),
      (1455,         '07668053320652480337',      '+33766805332'),
      (1533,         '+351932472464351934722745', '+351932472464'),
      (1704,         '07709507280615389792',      '+33770950728'),
      (1716,         '0769795798',                '+33769795798')
  ), faite AS (
    UPDATE gestion_annuaire_contact c
       SET valeur = cible.apres
      FROM cible
     WHERE c.id = cible.id
       AND c.sorte = 'telephone'
       -- 🔴 LA GARDE : la ligne n'est touchee que si elle porte ENCORE la valeur mesuree le 30/09/2026.
       AND btrim(c.valeur) = cible.avant
    RETURNING c.id
  )
  SELECT count(*) INTO faites FROM faite;

  IF faites <> attendu THEN
    RAISE EXCEPTION '279 : % lignes mises a jour au lieu de % — la base a change depuis la mesure du 30/09/2026, migration annulee.', faites, attendu;
  END IF;

  RAISE NOTICE '279 : % telephones normalises en E.164 ; valeur_brute et libelle_source intacts.', faites;
END $$;

COMMIT;
