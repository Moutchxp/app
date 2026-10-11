-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 339 — LOT INVARIANT-HISTORIQUE-INALTERABLE : UN MAIL ENTRÉ DANS L'HISTORIQUE D'UN BIEN N'EN SORT JAMAIS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- RÈGLE ABSOLUE D'ARNO (11/10/2026) : « Un mail entré dans l'historique d'un bien n'en sort JAMAIS, sauf par le bouton
-- “Sortir du suivi”, utilisé mail par mail et restaurable. Supprimer, désactiver, fermer, détacher ou remplacer quoi
-- que ce soit dans l'annuaire ne doit JAMAIS effacer, modifier ou masquer un mail, une pièce jointe ou une information
-- de l'historique. »
--
-- CE QUE POSE CETTE MIGRATION (AJOUT SEULEMENT — aucune ligne de mail, de lien ni de pièce n'est modifiée) :
--   ① AUCUN DELETE ni TRUNCATE sur gestion_message, gestion_rattachement, gestion_message_adresse, gestion_piece
--      (même principe que gestion_journal). Seules les bases jetables d'épreuve (gestion_jetable, svav_test*) y
--      échappent : leurs scripts les vident exprès.
--   ② gestion_rattachement : l'IDENTITÉ d'un lien (mail, pièce, cible) ne se modifie plus ; un lien CONFIRMÉ ne se
--      défait plus AUTOMATIQUEMENT (statut_par NULL : moteur, scripts, projection sans auteur). La sortie du suivi
--      (colonnes sorti_*) ne se pose QUE par la fonction dédiée (réglage de session svav.sortie_suivi).
--      ⚠️ Les retraits faits PAR UNE PERSONNE (statut_par renseigné) restent possibles : six boutons existants le font,
--      et la consigne est de ne pas les modifier avant la décision d'Arno (voir le compte rendu du lot).
--   ③ gestion_message_adresse : une partie reconnue (client ou partie externe) ne s'EFFACE plus. Un recalcul qui ne la
--      reconnaît plus (contact archivé, parti, supprimé) laisse la reconnaissance mémorisée : c'est elle qui garde la
--      couleur d'un ancien contact.
--   ④ Les clés ON DELETE CASCADE qui pointent vers ces quatre tables deviennent NO ACTION (rien n'est supprimé).
--   ⑤ « Sortir du suivi » : colonnes sorti_le / sorti_par / sorti_par_libelle / sorti_motif sur gestion_rattachement.
--   ⑥ Les 34 envois d'avant la migration 338 passent « parties demandées » : la relève leur AJOUTE les parties de
--      leurs destinataires (demande d'Arno, lot INVARIANT-HISTORIQUE-INALTERABLE). Aucune ligne existante n'est
--      réécrite par cette reprise : la passe ne fait qu'ajouter.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ⑤ « Sortir du suivi » ───────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_rattachement ADD COLUMN IF NOT EXISTS sorti_le timestamptz;
ALTER TABLE gestion_rattachement ADD COLUMN IF NOT EXISTS sorti_par bigint;
ALTER TABLE gestion_rattachement ADD COLUMN IF NOT EXISTS sorti_par_libelle text;
ALTER TABLE gestion_rattachement ADD COLUMN IF NOT EXISTS sorti_motif text;
COMMENT ON COLUMN gestion_rattachement.sorti_le IS
  '339 — « Sortir du suivi » : le mail ne s''affiche plus dans l''historique de ce bien, SANS que le lien soit défait. '
  'NULL = suivi. Restaurable à tout moment. Posée et levée uniquement par la fonction dédiée (sortirDuSuiviRepo).';

-- ① Ni DELETE ni TRUNCATE ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gestion_historique_base_jetable() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_database() = 'gestion_jetable' OR current_database() LIKE 'svav_test%'
$$;

CREATE OR REPLACE FUNCTION gestion_historique_refuser_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF gestion_historique_base_jetable() THEN
    RETURN CASE WHEN TG_LEVEL = 'ROW' THEN OLD ELSE NULL END;
  END IF;
  RAISE EXCEPTION 'Historique inaltérable : % interdit sur % (règle d''Arno, migration 339). Un mail sort de l''historique d''un bien par « Sortir du suivi », jamais par une suppression.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gestion_message', 'gestion_rattachement', 'gestion_message_adresse', 'gestion_piece'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_no_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION gestion_historique_refuser_suppression()', t || '_no_delete', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION gestion_historique_refuser_suppression()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- ② Le lien mail ↔ bien ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gestion_rattachement_verrou() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF gestion_historique_base_jetable() THEN RETURN NEW; END IF;
  IF NEW.message_id IS DISTINCT FROM OLD.message_id OR NEW.piece_id IS DISTINCT FROM OLD.piece_id
     OR NEW.cible_sorte IS DISTINCT FROM OLD.cible_sorte OR NEW.cible_cle IS DISTINCT FROM OLD.cible_cle
     OR NEW.cible_id IS DISTINCT FROM OLD.cible_id THEN
    RAISE EXCEPTION 'Historique inaltérable : l''identité d''un rattachement (mail, pièce, cible) ne se modifie pas (lien %). On en pose un autre.', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.sorti_le IS DISTINCT FROM OLD.sorti_le OR NEW.sorti_par IS DISTINCT FROM OLD.sorti_par
      OR NEW.sorti_par_libelle IS DISTINCT FROM OLD.sorti_par_libelle OR NEW.sorti_motif IS DISTINCT FROM OLD.sorti_motif)
     AND coalesce(current_setting('svav.sortie_suivi', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Historique inaltérable : « Sortir du suivi » se pose et se lève uniquement par la fonction dédiée (lien %).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.statut = 'confirme' AND NEW.statut <> 'confirme' AND NEW.statut_par IS NULL THEN
    RAISE EXCEPTION 'Historique inaltérable : un rattachement confirmé ne se défait pas automatiquement (lien %, par « % »).', OLD.id, coalesce(NEW.statut_par_libelle, '?')
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gestion_rattachement_verrou_trg ON gestion_rattachement;
CREATE TRIGGER gestion_rattachement_verrou_trg BEFORE UPDATE ON gestion_rattachement
  FOR EACH ROW EXECUTE FUNCTION gestion_rattachement_verrou();

-- ③ Le lien mail ↔ partie : une reconnaissance ne s'efface pas ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gestion_message_adresse_memoire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF gestion_historique_base_jetable() THEN RETURN NEW; END IF;
  IF NEW.message_id IS DISTINCT FROM OLD.message_id OR NEW.adresse IS DISTINCT FROM OLD.adresse OR NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Historique inaltérable : l''adresse d''un mail (message, adresse, rôle) ne se modifie pas (ligne %).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- Un recalcul qui ne reconnaît plus un client (contact archivé, parti, supprimé) garde la reconnaissance d'avant.
  IF OLD.partie IS NOT NULL AND NEW.partie IS NULL THEN
    NEW.partie := OLD.partie; NEW.proprietaire_cle := OLD.proprietaire_cle;
    NEW.locataire_id := OLD.locataire_id; NEW.lot_cle := OLD.lot_cle; NEW.motif := OLD.motif;
  END IF;
  IF OLD.partie_externe IS NOT NULL AND NEW.partie_externe IS NULL THEN
    NEW.partie_externe := OLD.partie_externe; NEW.syndic_id := OLD.syndic_id;
    NEW.syndic_contact_id := OLD.syndic_contact_id; NEW.copropriete_contact_id := OLD.copropriete_contact_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gestion_message_adresse_memoire_trg ON gestion_message_adresse;
CREATE TRIGGER gestion_message_adresse_memoire_trg BEFORE UPDATE ON gestion_message_adresse
  FOR EACH ROW EXECUTE FUNCTION gestion_message_adresse_memoire();

-- ④ ON DELETE CASCADE → NO ACTION, vers les quatre tables ──────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS t, c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.confdeltype = 'c'
       AND c.confrelid IN ('gestion_message'::regclass, 'gestion_rattachement'::regclass,
                           'gestion_message_adresse'::regclass, 'gestion_piece'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.t, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.t, r.conname, replace(r.def, ' ON DELETE CASCADE', ''));
  END LOOP;
END $$;

-- ⑥ Les envois d'avant la 338 : leurs destinataires seront reconnus par la relève (ajout seulement) ─────────────
UPDATE gestion_envoi SET parties_demandees = true WHERE parties_demandees = false AND parties_appliquees_le IS NULL;

COMMIT;
