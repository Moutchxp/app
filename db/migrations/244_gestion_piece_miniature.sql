-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 244 — LOT 5-PJ-A : LA MÉMOIRE DES MINIATURES DE PIÈCES JOINTES.
--
-- POURQUOI UNE MIGRATION POUR UNE VIGNETTE. Une miniature se fabrique en 150 ms pour un PDF : refaire ce travail à
-- chaque affichage d'un message transformerait la lecture d'une conversation en calcul. On la fabrique donc UNE fois,
-- on la dépose sur le stockage objet, et on retient sa clé ici.
--
-- 🔴 ET SURTOUT : LA MINIATURE DOIT SURVIVRE À L'EFFACEMENT DE L'ORIGINAL. Décision déjà prise par Arno — au lot D,
-- les pièces copiées dans le Drive seront effacées du stockage de l'application. Une miniature régénérée à la volée
-- disparaîtrait donc le jour où l'original s'en va, et les cartes se videraient toutes seules, des mois après, sans
-- que personne comprenne pourquoi. La clé mémorisée ici pointe vers un fichier DÉRIVÉ, rangé sous un préfixe DISTINCT
-- de celui des pièces (`gestion/miniatures/` et non `gestion/messages/<id>/`) : un effacement ciblé des originaux ne
-- l'emporte pas.
--
-- 🔴 L'ÉCHEC EST MÉMORISÉ, LUI AUSSI. Un PDF mal formé, une image tronquée, un type sans vignette : sans trace, on
-- retenterait à chaque affichage, et un fichier cassé deviendrait une charge permanente. `miniature_etat = 'echec'`
-- avec son motif dit « on a essayé, voilà pourquoi, on n'y revient pas ».
--
-- AUCUNE COLONNE EXISTANTE N'EST MODIFIÉE, aucune donnée n'est déplacée, aucun index existant n'est refait. Le code
-- tourne SANS cette migration (sonde de schéma hors transaction, `app/lib/gestion/schema.ts`) : les cartes s'affichent
-- alors avec leur icône de type, et rien d'autre ne change.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/244_gestion_piece_miniature.sql
--
-- POUR REVENIR EN ARRIÈRE (rien n'est perdu — les fichiers dérivés restent sur le stockage) :
--   ALTER TABLE gestion_piece
--     DROP COLUMN IF EXISTS miniature_cle, DROP COLUMN IF EXISTS miniature_etat,
--     DROP COLUMN IF EXISTS miniature_motif, DROP COLUMN IF EXISTS miniature_le;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE gestion_piece
  ADD COLUMN IF NOT EXISTS miniature_cle   text,
  ADD COLUMN IF NOT EXISTS miniature_etat  text,
  ADD COLUMN IF NOT EXISTS miniature_motif text,
  ADD COLUMN IF NOT EXISTS miniature_le    timestamptz;

-- Liste FERMÉE, par contrainte NOMMÉE (donc élargissable plus tard sans refaire la table). NULL = jamais tentée.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_piece_miniature_etat_chk') THEN
    ALTER TABLE gestion_piece
      ADD CONSTRAINT gestion_piece_miniature_etat_chk
      CHECK (miniature_etat IS NULL OR miniature_etat IN ('ok', 'echec'));
  END IF;
END $$;

-- Un état « ok » sans clé serait une promesse vide : l'écran demanderait un fichier qui n'existe pas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_piece_miniature_cle_chk') THEN
    ALTER TABLE gestion_piece
      ADD CONSTRAINT gestion_piece_miniature_cle_chk
      CHECK (miniature_etat IS DISTINCT FROM 'ok' OR miniature_cle IS NOT NULL);
  END IF;
END $$;

-- Retrouver les pièces qui n'ont RIEN tenté : c'est la file de travail d'un futur rattrapage en lot, et c'est aussi
-- ce qui permet de mesurer la couverture sans balayer toute la table.
CREATE INDEX IF NOT EXISTS gestion_piece_miniature_a_faire_idx
  ON gestion_piece (id) WHERE miniature_etat IS NULL AND cle_stockage IS NOT NULL;

COMMENT ON COLUMN gestion_piece.miniature_cle IS
  'LOT 5-PJ-A — clé du fichier DÉRIVÉ (vignette JPEG) sur le stockage objet, sous le préfixe `gestion/miniatures/`. '
  'Distinct du préfixe des pièces : la vignette SURVIT à l''effacement de l''original (lot D). NULL = aucune vignette.';
COMMENT ON COLUMN gestion_piece.miniature_etat IS
  'LOT 5-PJ-A — NULL = jamais tentée ; ''ok'' = fabriquée ; ''echec'' = tentée et impossible (motif dans miniature_motif). '
  'L''échec est MÉMORISÉ exprès : sans lui, un fichier mal formé serait retenté à chaque affichage.';
COMMENT ON COLUMN gestion_piece.miniature_motif IS
  'LOT 5-PJ-A — pourquoi il n''y a pas de vignette, en clair (type sans miniature, fichier illisible, délai dépassé). '
  'Affiché nulle part par défaut : sert au diagnostic, pas à inquiéter l''utilisateur, qui voit simplement une icône.';

COMMIT;
