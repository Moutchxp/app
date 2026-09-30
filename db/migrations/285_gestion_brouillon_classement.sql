-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 285 — LOT CLASSER-DEUX-BOUTONS : LE CLASSEMENT VOYAGE AVEC LE BROUILLON
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QU'ARNO DEMANDE : « L'état est enregistré avec le brouillon et retrouvé à sa réouverture. »
--
-- 🔴 CE QUI MANQUAIT, MESURÉ LE 30/09/2026 : `gestion_brouillon` n'a NI colonne pour les biens rattachés, NI
-- colonne pour « Interne ». Les deux ne vivaient que dans l'état React de la fenêtre de rédaction : fermer la
-- fenêtre, ou recharger la page, et le travail de classement était perdu en silence. On pouvait cocher six biens,
-- rouvrir le brouillon le lendemain, et ne plus rien trouver — sans qu'aucun message ne le dise.
--
-- ⚠️ `cibles` EST UN `jsonb`, COMME `dest_a` ET `gestion_envoi_file.cibles` JUSTE À CÔTÉ. C'est la même forme que
-- celle qui voyage déjà jusqu'à la file d'envoi : une table de liaison obligerait à traduire deux fois, et à tenir
-- deux vérités sur ce qu'est une cible.
--
-- ⚠️ `interne` EST UN BOOLÉEN NON NUL, PAR DÉFAUT FAUX : « pas de réponse » et « pas interne » sont la même chose
-- ici — le mail part « à classer ». Un booléen nullable aurait inventé un troisième état que rien n'affiche.
--
-- 🔒 AUCUNE DONNÉE N'EST TOUCHÉE : deux colonnes ajoutées, l'une vide, l'autre fausse, sur les brouillons
-- existants. Sans cette migration, la sonde `brouillonClassementDisponible` rend faux, rien n'est nommé dans le
-- SQL, et le classement se comporte exactement comme avant — il vit le temps de la fenêtre.
--
-- RÉVERSIBLE : ALTER TABLE gestion_brouillon DROP COLUMN cibles, DROP COLUMN interne;

ALTER TABLE gestion_brouillon
  ADD COLUMN IF NOT EXISTS cibles  jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS interne boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gestion_brouillon.cibles IS
  'LOT CLASSER-DEUX-BOUTONS — les biens auxquels ce brouillon sera rattaché à l''envoi. Même forme que '
  'gestion_envoi_file.cibles : [{sorte, cle, id, libelle}]. Vide = le mail partira « à classer ».';
COMMENT ON COLUMN gestion_brouillon.interne IS
  'LOT CLASSER-DEUX-BOUTONS — « Interne » choisi pendant la rédaction. La marque est posée sur l''ÉCHANGE à '
  'l''envoi, jamais ici : un message neuf n''a pas encore d''échange.';
