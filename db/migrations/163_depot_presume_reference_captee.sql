-- 163_depot_presume_reference_captee.sql — Module VEILLE PERMIS (Lot C) : le VERROU de commune se lève à la CAPTURE DE LA
-- RÉFÉRENCE MAIRIE, plus au dépôt. DÉCISION PORTEUR : « marquer déposée » n'est qu'un geste déclaratif ; c'est la référence
-- renvoyée par la mairie (accusé) qui PROUVE l'enregistrement de la demande. Tant qu'elle n'est pas captée, la commune reste
-- bloquée (une seule demande téléservice en attente d'accusé par commune) ; l'issue de secours « pas d'accusé attendu »
-- (résolution 'sans_accuse') évite le blocage indéfini.
--
-- DEUX changements de SCHÉMA, tous deux SÛRS/ADDITIFS dans leur effet :
--   1. Le CHECK de résolution accepte deux issues DE PLUS : 'reference_captee' (réf. enregistrée → mairie a bien reçu) et
--      'sans_accuse' (geste humain explicite de déblocage). Les valeurs existantes 'deposee'/'renoncee' restent VALIDES : aucune
--      ligne existante n'est invalidée (élargissement de la liste fermée, jamais un rétrécissement).
--   2. Un TRIGGER AFTER INSERT sur demande_reference_externe résout la présomption VIVANTE de la demande concernée en
--      'reference_captee'. Il couvre UNIFORMÉMENT les trois écrivains de références (saisie manuelle, dépôt avec référence inline,
--      capture automatique par la relève — Lot C) sans coupler le code applicatif. WHERE resolu_le IS NULL : n'écrase JAMAIS une
--      résolution déjà posée ('renoncee'/'sans_accuse') ; no-op si la demande n'a aucune présomption (canal e-mail, ou dépôt sans
--      clic « copier ») → aucun effet hors téléservice.
--
-- Côté CODE (commit associé) : `marquerDeposee` NE résout PLUS la présomption en 'deposee' au dépôt ; la résolution passe
-- désormais par la capture de référence (trigger) ou l'issue de secours ('sans_accuse').
--
-- SÛR : DDL de contrainte (remplacement d'un CHECK par un CHECK plus permissif) + un trigger IDEMPOTENT (CREATE OR REPLACE
-- FUNCTION, DROP TRIGGER IF EXISTS avant CREATE). Aucun DROP de colonne, aucun UPDATE de données. N'écrit JAMAIS demande.statut.
-- GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Un seul BEGIN/COMMIT.
-- Requiert 085 (demande_reference_externe) et 124 (demande_depot_presume).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/163_depot_presume_reference_captee.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- 1) Élargir la liste fermée des résolutions (les anciennes restent valides).
ALTER TABLE demande_depot_presume DROP CONSTRAINT IF EXISTS demande_depot_presume_resolution_chk;
ALTER TABLE demande_depot_presume ADD CONSTRAINT demande_depot_presume_resolution_chk
  CHECK ( ((resolu_le IS NULL) = (resolution IS NULL))
          AND (resolution IS NULL OR resolution IN ('deposee', 'renoncee', 'reference_captee', 'sans_accuse')) );

-- 2) TRIGGER : capturer une référence mairie lève le verrou de commune de la demande (résolution 'reference_captee').
CREATE OR REPLACE FUNCTION resoudre_depot_presume_sur_reference() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Ne touche QUE la présomption VIVANTE de CETTE demande ; no-op si aucune (canal e-mail, ou jamais « copié »).
  --   N'écrase JAMAIS une résolution déjà posée (renoncee/sans_accuse) : la référence n'annule pas un renoncement.
  UPDATE demande_depot_presume
     SET resolu_le = now(), resolution = 'reference_captee', resolu_par = 'trigger:reference', maj_le = now()
   WHERE demande_id = NEW.demande_id AND resolu_le IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_depot_presume_reference ON demande_reference_externe;
CREATE TRIGGER trg_depot_presume_reference
  AFTER INSERT ON demande_reference_externe
  FOR EACH ROW EXECUTE FUNCTION resoudre_depot_presume_sur_reference();

COMMENT ON FUNCTION resoudre_depot_presume_sur_reference() IS
  'Lot C — la capture d''une référence mairie (INSERT demande_reference_externe) lève le verrou de commune de la demande (demande_depot_presume → resolution ''reference_captee''), WHERE resolu_le IS NULL (jamais d''écrasement, no-op hors téléservice).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- le CHECK accepte les 4 résolutions :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_depot_presume_resolution_chk';
--
--   -- le trigger est en place :
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'demande_reference_externe'::regclass AND NOT tgisinternal;
--     -- attendu : trg_depot_presume_reference
