-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 340 — LOT HISTORIQUE-SORTIE-PAR-BIEN-ET-SIX-BOUTONS : « SORTI DU SUIVI » EST UN STATUT DU COUPLE (MAIL, BIEN)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- RÈGLE PRÉCISÉE PAR ARNO (11/10/2026) :
--   · ENRICHIR est toujours permis : rattacher après coup un mail à d'autres biens reste possible, le verrou ne bloque
--     jamais un ajout ;
--   · RETIRER n'est possible QUE par « Sortir du suivi », et seulement pour le bien depuis lequel on clique. Les autres
--     historiques du même mail ne sont jamais touchés. « Restaurer » ne restaure que ce bien-là.
--
-- CE QUE POSE CETTE MIGRATION (AJOUT, AUCUNE PERTE) :
--   ① un statut de plus, « sorti », sur la LIGNE du lien (message, bien) — jamais sur le mail. Le lien reste en base,
--      avec ses dates et ses auteurs ; « Restaurer » le rend « confirme ». Toutes les lectures « confirmé » (historique,
--      capsules, classement, moteur) l'excluent d'elles-mêmes. Il n'existe que pour un lien de bien, daté.
--   ② les liens déjà marqués par la 339 (colonne sorti_le, statut resté « confirme ») passent au statut « sorti »
--      (0 ligne le 11/10/2026 à la rédaction ; la conversion est écrite pour qu'aucune ne se perde d'ici l'application).
--   ③ LE VERROU SE RESSERRE : l'exception « auteur humain » de la 339 disparaît. Un lien CONFIRMÉ ne change de statut
--      que sous le réglage de session `svav.sortie_suivi`, posé par les seules fonctions dédiées :
--        - un lien de BIEN confirmé ne sort que vers « sorti » (sortir du suivi), SAUF l'annulation immédiate d'un
--          AJOUT (lien confirmé il y a moins de 15 minutes : il n'a jamais vraiment été dans l'historique) ;
--        - un lien de PERSONNE ou d'événement confirmé peut être marqué « retire » (restaurable) ;
--        - un lien « sorti » ne redevient que « confirme » (restauration).
--      Passer à « confirme » (ajouter, restaurer) n'est JAMAIS bloqué.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① Le statut « sorti » ───────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_statut_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_statut_chk
  CHECK (statut IN ('propose', 'confirme', 'rejete', 'retire', 'sorti'));
ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_sorti_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_sorti_chk
  CHECK (statut <> 'sorti' OR (cible_sorte = 'lot' AND sorti_le IS NOT NULL));
COMMENT ON COLUMN gestion_rattachement.statut IS
  'propose | confirme | rejete | retire | sorti (340 : « sorti du suivi » de CE bien, restaurable — le lien reste).';

-- ③ Le verrou, resserré ────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gestion_rattachement_verrou() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  dediee boolean := coalesce(current_setting('svav.sortie_suivi', true), '') = 'on';
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
     AND NOT dediee THEN
    RAISE EXCEPTION 'Historique inaltérable : « Sortir du suivi » se pose et se lève uniquement par la fonction dédiée (lien %).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.statut = 'sorti' AND NEW.statut NOT IN ('sorti', 'confirme') THEN
    RAISE EXCEPTION 'Historique inaltérable : un lien sorti du suivi ne peut que rester tel quel ou être restauré (lien %).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.statut = 'sorti' AND OLD.statut NOT IN ('sorti', 'confirme') THEN
    RAISE EXCEPTION 'Historique inaltérable : seul un lien confirmé se sort du suivi (lien %).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.statut = 'confirme' AND NEW.statut <> 'confirme' THEN
    IF NOT dediee THEN
      RAISE EXCEPTION 'Historique inaltérable : un rattachement confirmé ne se défait que par « Sortir du suivi » (lien %, par « % »).', OLD.id, coalesce(NEW.statut_par_libelle, '?')
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.cible_sorte = 'lot' AND NEW.statut <> 'sorti'
       AND NOT (NEW.statut IN ('retire', 'propose') AND coalesce(OLD.statut_le, OLD.cree_le) > now() - interval '15 minutes') THEN
      RAISE EXCEPTION 'Historique inaltérable : un mail ne quitte l''historique d''un bien que par « Sortir du suivi » (lien %).', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ② Les liens déjà marqués par la 339 ──────────────────────────────────────────────────────────────────────────────
SELECT set_config('svav.sortie_suivi', 'on', true);
UPDATE gestion_rattachement SET statut = 'sorti', statut_le = coalesce(sorti_le, now())
 WHERE statut = 'confirme' AND sorti_le IS NOT NULL AND cible_sorte = 'lot';

COMMIT;
