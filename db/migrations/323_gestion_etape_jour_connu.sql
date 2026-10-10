-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴🔴 LOT FRISE-DATE-VIDE-PAR-DEFAUT (10/10/2026) — SAVOIR SI LA DATE D'UNE CARTE A ÉTÉ SAISIE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « Une carte validée sans date n'affiche AUCUNE date dans le carré (pas de date inventée). »
--
-- 🔴 POURQUOI UNE COLONNE, ET PAS UNE DATE NULLE. `survenu_le` est `NOT NULL`, et il le reste : la frise s'ordonne
-- par `rang_pose` mais la date sert encore au rangement des anciennes cartes, aux index et aux requêtes par
-- période. On garde donc la date de repli EN BASE (le jour du « + » d'où le bloc s'est ouvert) et l'on note
-- séparément si quelqu'un l'a VRAIMENT saisie. Rendre `survenu_le` nullable aurait demandé de relire chaque
-- requête qui la lit — et la question posée n'est pas « quand », c'est « le sait-on ».
--
-- 🔴 C'EST EXACTEMENT LE MOTIF DE `heure_connue`, qui vit déjà dans cette table pour la même raison : sans ce
-- drapeau, tout rendez-vous sans heure se lirait « à 00h00 ». Une date non saisie se lirait, elle, « le jour où
-- j'ai cliqué sur + » — tout aussi faux, et bien plus difficile à démentir.
--
-- ⚠️ `DEFAULT true` ET LES CARTES EXISTANTES. Arno : « Cartes existantes : aucune date réécrite. » Les 185 cartes
-- en base ont toutes été saisies sous l'ancienne règle, avec une date proposée que l'on pouvait lire et corriger :
-- leur date est donc connue, et elles continuent de l'afficher exactement comme avant. Aucune ligne n'est touchée
-- par cette migration — seul le défaut de colonne change ce que verront les cartes À VENIR.
--
-- ⚠️ ET LE DÉFAUT RESTE `true` POUR LA SUITE : une insertion faite ailleurs (reprise Monga, script) continue de
-- dire « cette date est connue », ce qui est le cas — c'est la date du mail. Seul le formulaire de la frise écrit
-- `false`, et seulement quand le champ a été laissé vide.

ALTER TABLE gestion_monga_etape
  ADD COLUMN IF NOT EXISTS jour_connu boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN gestion_monga_etape.jour_connu IS
  'false = la date n''a pas été saisie : survenu_le porte le jour du « + » (repli), et le carré n''affiche aucune date. Lot FRISE-DATE-VIDE-PAR-DEFAUT, 10/10/2026.';
