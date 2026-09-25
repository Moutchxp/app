-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 251 — LOT 5-BOITE-3 : LA CORBEILLE, ENTIÈREMENT CHEZ NOUS.
--
-- DÉCISION D'ARNO du 25/09/2026 : la corbeille est INTERNE. Le mail reste INTACT dans Gmail — aucun `TRASH` n'est
-- posé, et la portée qui permettrait d'effacer n'est même pas demandée (cf. `PORTEES_GESTION`). Supprimer, ici, veut
-- dire « je ne veux plus voir cet échange dans mes boîtes », et rien d'autre.
--
-- 🔴 DEUX COLONNES, ET AUCUNE LIGNE N'EST JAMAIS EFFACÉE. Même patron que `sans_suite_le` / `sans_suite_par_libelle`
-- posé par la migration 228 : la date du geste, et l'auteur FIGÉ EN TEXTE. Figé, parce que des années après on doit
-- savoir qui a mis quoi à la corbeille, même si le compte a été désactivé ou purgé.
--
-- 🔴 LE RETOUR AUTOMATIQUE EST DÉRIVÉ, PAS ÉCRIT. Un échange est « en corbeille » tant que
--       corbeille_le IS NOT NULL  ET  corbeille_le >= date du DERNIER message
-- Autrement dit : un nouveau message arrive → sa date dépasse celle du geste → l'échange REVIENT tout seul dans sa
-- boîte, exactement comme dans Gmail, et SANS QU'UNE SEULE LIGNE SOIT ÉCRITE. La relève n'a rien à savoir de la
-- corbeille ; aucun rattrapage à faire ; rien qui puisse se désynchroniser. C'est la même règle que « attend une
-- réponse » depuis le lot 2 : ce qui se dérive ne peut pas mentir.
--
-- 🔴 L'ÉTAT DE L'ÉCHANGE N'EST PAS TOUCHÉ. `etat` reste `a_classer`, `affecte` ou `sans_suite` : un échange mis à la
-- corbeille RESTE rattaché à sa carte d'événement, et la carte n'est pas modifiée. Restaurer le remet donc
-- exactement là où il était — c'est pour cela que la corbeille est une DATE à côté de l'état, et non un état de plus.
--
-- ⚠️ ELLE NE CONDITIONNE QUE L'ENTRÉE « SUPPRIMER ». Sans cette migration, la sonde de schéma (HORS transaction,
-- `schema.ts`) répond « non » : l'entrée n'apparaît pas dans le menu, l'étiquette « Corbeille » non plus, et le
-- reste de la boîte se comporte EXACTEMENT comme avant. Rien ne casse, rien ne promet un geste qui échouerait.
--
-- INDEX. Un seul, PARTIEL : seuls les échanges réellement à la corbeille y entrent (une poignée sur 36 000), et
-- c'est la seule question posée — « lesquels sont à la corbeille ? ». Un index complet sur une colonne presque
-- toujours nulle serait payé par toutes les écritures pour n'être jamais emprunté (cf. AGENTS.md).
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/251_gestion_corbeille.sql
--
-- POUR REVENIR EN ARRIÈRE (les échanges reviennent tous dans leurs boîtes ; rien n'a jamais été perdu) :
--   ALTER TABLE gestion_fil DROP COLUMN IF EXISTS corbeille_le;
--   ALTER TABLE gestion_fil DROP COLUMN IF EXISTS corbeille_par;
--   ALTER TABLE gestion_fil DROP COLUMN IF EXISTS corbeille_par_libelle;
--   (et, si l'on y tient, remettre la contrainte d'entité du journal telle qu'elle était en 246.)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_fil') IS NULL THEN
    RAISE EXCEPTION 'La migration 228 (schéma du module Gestion) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

ALTER TABLE gestion_fil
  ADD COLUMN IF NOT EXISTS corbeille_le          timestamptz,
  ADD COLUMN IF NOT EXISTS corbeille_par         bigint,          -- pas de FK : la trace survit à la purge d'un compte
  ADD COLUMN IF NOT EXISTS corbeille_par_libelle text;

-- « Lesquels sont à la corbeille ? » — la seule question posée, et elle ne porte que sur une poignée de lignes.
CREATE INDEX IF NOT EXISTS gestion_fil_corbeille_idx
  ON gestion_fil (corbeille_le DESC) WHERE corbeille_le IS NOT NULL;

COMMENT ON COLUMN gestion_fil.corbeille_le IS
  'LOT 5-BOITE-3 — quand l''échange a été mis à la corbeille. La corbeille est INTERNE : le mail reste intact dans '
  'Gmail (aucun TRASH n''est posé). Un échange n''y est que tant que cette date est POSTÉRIEURE OU ÉGALE à celle de '
  'son dernier message : un nouveau message l''en fait donc ressortir tout seul, sans qu''aucune ligne soit écrite.';
COMMENT ON COLUMN gestion_fil.corbeille_par_libelle IS
  'Qui a fait le geste, FIGÉ EN TEXTE — comme sans_suite_par_libelle. Des années après, on doit pouvoir le lire même '
  'si le compte a été désactivé ou purgé.';

-- Mettre à la corbeille (ou restaurer) est un GESTE : il se journalise comme les autres, en append-only.
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi',          -- 243 : un courrier PARTI de chez nous
    'piece_drive',    -- 245 : une pièce jointe COPIÉE dans le Drive
    'compte_google'   -- 246 : un collaborateur relie ou délie son compte Google
  ]));
-- ⚠️ « fil » était DÉJÀ dans la liste : le geste se journalise donc sur l'échange lui-même, sans nouvelle entité.
--    La contrainte est réécrite à l'identique ci-dessus uniquement pour qu'elle reste lisible d'un seul endroit.

COMMIT;
