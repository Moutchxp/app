-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 264 — L'ÉTOILE DE L'ÉQUIPE, SUR UN ÉCHANGE (lot LISTE-GMAIL, 27/09/2026)
--
-- CE QU'ELLE AJOUTE : une table, `gestion_fil_etoile`, une ligne par échange jamais étoilé.
--
-- 🔴 CE N'EST PAS L'ÉTOILE DE GMAIL, et c'est tout l'enjeu. Gmail en a déjà une (libellé STARRED), que le module
-- sait lire et poser sur un MESSAGE — elle vit dans la boîte, elle suit le compte Google. Celle-ci est un état de
-- NOTRE application, posé sur un ÉCHANGE, partagé par toute l'équipe et daté : « je m'en occupe », « à reprendre
-- lundi ». Les deux coexistent sans se toucher ; poser l'une ne pose pas l'autre.
--
-- 🔴 PAS DE LIGNE SUPPRIMÉE QUAND ON DÉCROCHE L'ÉTOILE. `etoilee` passe à `false`, la ligne reste, et l'on sait
-- donc qui l'avait posée et quand elle est tombée. C'est la règle du module depuis le début : rien n'est jamais
-- effacé. Le journal (`gestion_journal`, append-only par trigger) garde le détail de chaque bascule.
--
-- ⚠️ `fil_id` EST LA CLÉ PRIMAIRE : un échange a UNE étoile, pas une par personne. C'est la demande d'Arno — un
-- seul état, commun, pour que l'équipe se réparte le courrier sans doublon, exactement comme le lu/non lu.
--
-- 🔒 CE QU'ELLE NE FAIT PAS : aucune suppression, aucune réécriture de l'existant, aucun trigger nouveau, aucune
-- colonne ajoutée à une table existante. Réversible par un simple `DROP TABLE gestion_fil_etoile`.
--
-- LE CODE TOURNE SANS ELLE. `etoileDisponible()` (app/lib/gestion/schema.ts) la sonde HORS TRANSACTION ; tant
-- qu'elle est absente, la table n'est NOMMÉE NULLE PART, l'étoile de la barre d'actions est rendue DÉSACTIVÉE avec
-- une info-bulle qui dit pourquoi, et tout le reste du module se comporte exactement comme avant ce lot.
--
-- POUR L'APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/264_gestion_fil_etoile.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_fil_etoile (
  fil_id        bigint PRIMARY KEY REFERENCES gestion_fil(id) ON DELETE CASCADE,
  etoilee       boolean     NOT NULL DEFAULT true,
  maj_le        timestamptz NOT NULL DEFAULT now(),
  maj_par       bigint,
  maj_par_libelle text      NOT NULL DEFAULT 'inconnu'
);

COMMENT ON TABLE gestion_fil_etoile IS
  'Étoile de l''équipe sur un échange — état de NOTRE application, partagé, daté. Sans rapport avec le libellé '
  'STARRED de Gmail, que le module gère par ailleurs sur les MESSAGES. Décrocher l''étoile met etoilee à false : '
  'la ligne reste, on sait qui l''avait posée.';

-- L'index de la LISTE : « quels échanges sont étoilés ? », posé sur les seules lignes vivantes. Une poignée de
-- lignes aujourd''hui, quelques centaines au pire — l''index partiel ne coûte presque rien.
CREATE INDEX IF NOT EXISTS gestion_fil_etoile_vivantes_idx
  ON gestion_fil_etoile (fil_id) WHERE etoilee;

-- ── LE JOURNAL ACCEPTE L'ENTITÉ « fil_etoile » ───────────────────────────────────────────────────────────────────
-- ⚠️ ON AJOUTE À LA LISTE EXISTANTE, ON NE LA RÉÉCRIT PAS. La contrainte est relue telle qu'elle est en base et
-- complétée : réécrire une liste figée dans ce fichier effacerait les entités ajoutées par les migrations posées
-- entre-temps. Le précédent est la 260, dont le bloc de journal avait été écrit de cette façon et corrigé après.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.gestion_journal') AND conname = 'gestion_journal_entite_chk';
  IF def IS NOT NULL AND def NOT LIKE '%''fil_etoile''%' THEN
    EXECUTE 'ALTER TABLE gestion_journal DROP CONSTRAINT gestion_journal_entite_chk';
    -- ⚠️ ANCRÉ À LA FIN, ET NON UN `replace` GLOBAL. La définition se termine par « ])))  » ; un `replace` de
    --    « )) » aurait frappé TOUTES les occurrences et produit une contrainte illisible. On ne touche qu'à la
    --    fermeture du tableau, en fin de chaîne.
    EXECUTE 'ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk '
         || regexp_replace(def, '\]\)\)\)$', ', ''fil_etoile''::text])))');
  END IF;
END $$;

COMMIT;
