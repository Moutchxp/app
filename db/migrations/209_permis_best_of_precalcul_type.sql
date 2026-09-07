-- 209 — SOCLE GÉNÉRIQUE de pré-calcul : clé (dossier_id, type) au lieu de dossier_id SEUL (P-fond 4a).
--
-- POURQUOI : `permis_best_of_precalcul` (migration 208) a `dossier_id` en PK SEULE → UN seul résultat pré-calculé par dossier. Ajouter
--   un 2e consommateur (la complétude, lot 4b) écraserait SILENCIEUSEMENT le best-of (ON CONFLICT (dossier_id)). On rend le socle
--   générique : un résultat PAR (dossier × type), le type étant contraint à une LISTE FERMÉE (garde, pas confort).
--
-- CE LOT NE CHANGE AUCUN COMPORTEMENT : le seul consommateur reste le best-of (type='best_of'). Les 6 lignes existantes sont
--   backfillées EXPLICITEMENT en 'best_of' et restent lisibles à l'identique (aucune perte, aucun recalcul, aucun retour au froid).
--
-- AUCUN DROP TABLE, AUCUN TRUNCATE, AUCUN DELETE de données : on ne touche QUE la colonne `type` et la contrainte de clé.
--
-- Commande d'application :
--   psql "postgresql://localhost:5432/sansvisavis" -f db/migrations/209_permis_best_of_precalcul_type.sql

-- 1) Colonne `type`, ajoutée NULLABLE d'abord pour un BACKFILL EXPLICITE des lignes existantes (jamais un remplissage implicite par DEFAULT).
ALTER TABLE permis_best_of_precalcul ADD COLUMN IF NOT EXISTS type text;

-- 2) BACKFILL EXPLICITE : toute ligne existante EST un best-of (seul consommateur avant ce lot) → elle reste valide en tant que best_of.
UPDATE permis_best_of_precalcul SET type = 'best_of' WHERE type IS NULL;

-- 3) NOT NULL, SANS DEFAULT persistant : chaque appelant DOIT porter son type (un INSERT sans type viole NOT NULL). Un DEFAULT 'best_of'
--    ré-ouvrirait EXACTEMENT le bug que ce lot ferme (un writer de complétude omettant le type écraserait le best_of). Garde volontaire.
ALTER TABLE permis_best_of_precalcul ALTER COLUMN type SET NOT NULL;

-- 4) LISTE FERMÉE (GARDE) : une faute de frappe côté appelant est REFUSÉE par la base (jamais une ligne fantôme). 'completude' est RÉSERVÉ
--    au lot 4b (pas encore écrit). Étendre la liste = un nouveau consommateur explicite, jamais une colonne texte libre.
ALTER TABLE permis_best_of_precalcul DROP CONSTRAINT IF EXISTS permis_best_of_precalcul_type_chk;
ALTER TABLE permis_best_of_precalcul ADD CONSTRAINT permis_best_of_precalcul_type_chk CHECK (type IN ('best_of', 'completude'));

-- 5) PK (dossier_id) → (dossier_id, type) : un résultat pré-calculé par (dossier × type). Le FK dossier_id → sitadel_dossier (ON DELETE
--    CASCADE) est une contrainte DISTINCTE, inchangée par ce remplacement de PK.
ALTER TABLE permis_best_of_precalcul DROP CONSTRAINT IF EXISTS permis_best_of_precalcul_pkey;
ALTER TABLE permis_best_of_precalcul ADD CONSTRAINT permis_best_of_precalcul_pkey PRIMARY KEY (dossier_id, type);

-- 6) SÉMANTIQUE EXPLICITE dans le schéma (la doc de la liste fermée vit AVEC le schéma, lisible dans \d — comme sitadel_dossier.type PC/PD).
COMMENT ON COLUMN permis_best_of_precalcul.type IS
  'GARDE (liste fermée) — nature du résultat pré-calculé stocké dans `resultat`. Valeurs autorisées : ''best_of'' (best-of PDF servi par /emprise) ; ''completude'' (diagnostic de complétude, RÉSERVÉ au lot 4b, pas encore écrit). Toute autre valeur est refusée par permis_best_of_precalcul_type_chk. Clé : (dossier_id, type) = un résultat par dossier et par type.';
COMMENT ON COLUMN permis_best_of_precalcul.empreinte IS
  'Clé d''invalidation PROPRE AU TYPE : le résultat n''est servi que si l''empreinte STOCKÉE == l''empreinte COURANTE recalculée pour ce type (sinon périmé → recalcul). Pour type=''best_of'' : empreinte STRUCTURELLE de la GED (pièces PDF triées par id, jointes en id:cle_stockage:taille:nom — cf. empreinteGed, bestOfCache.ts). Un autre type peut dériver son empreinte d''autres entrées ; ce lot ne change pas le calcul de l''empreinte.';
COMMENT ON CONSTRAINT permis_best_of_precalcul_type_chk ON permis_best_of_precalcul IS
  'Liste fermée (GARDE) des types de pré-calcul autorisés. L''étendre = déclarer explicitement un nouveau consommateur (jamais une colonne texte libre).';

-- Table (mise à jour du commentaire : la purge PC-2 à l'entrée en Rattachement a été retirée en P-fond 2 ; le best-of survit et sert tel quel).
COMMENT ON TABLE permis_best_of_precalcul IS
  'Résultats pré-calculés par (dossier_id, type) — ACCÉLÉRATEUR, JAMAIS un prérequis (le lecteur garde son repli à la volée). Invalidation par la colonne empreinte, propre au type. type=''best_of'' aujourd''hui ; socle prêt pour d''autres types (liste fermée).';
