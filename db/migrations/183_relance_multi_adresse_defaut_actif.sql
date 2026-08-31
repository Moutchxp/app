-- 183_relance_multi_adresse_defaut_actif.sql — LOT 27 : la multi-adresse des 2 DERNIÈRES relances devient la NORME (plus un opt-in).
--
-- ⚠️ RÈGLE MÉTIER (Arno, LOT 27) :
--   • RÈGLE A (défaut général, CÔTÉ CODE, sans colonne) : toute relance part vers le DERNIER répondant de la demande, repli
--     dest_email figé → mairie_contact confirmé → prada.
--   • RÈGLE B (cette migration) : les 2 dernières étapes de CHAQUE cascade (ordinaire : avis + saisine ; partielle : dernière
--     relance + annonce CADA) partent à TOUTES les adresses de la mairie ayant participé (dest_email ∪ mairie_contact confirmé ∪
--     prada ∪ répondants ; les 'presume' EXCLUS). Le rattachement des réponses reste par IDENTIFIANT (jamais par l'expéditeur).
--
-- 🔴 CE QUE FAIT LA MIGRATION : passe `relance_multi_adresse_active` à TRUE — (1) comme NOUVEAU défaut de colonne (nouvelles
--    installations), (2) sur le singleton EXISTANT id=1. Le drapeau reste en base comme INTERRUPTEUR D'ARRÊT D'URGENCE (repasser à
--    FALSE désactive la Règle B ; la Règle A, elle, vit dans le code et reste active). `nb_dernieres` (défaut 2, CHECK 0..10) inchangé.
--    N'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). AUCUN envoi.
--
-- SÛR : ALTER DEFAULT + UPDATE du seul singleton. Aucun DROP. Idempotente (relançable). GOLDEN-SAFE. Une transaction.
-- Requiert config_veille + colonne relance_multi_adresse_active (migration 182). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/183_relance_multi_adresse_defaut_actif.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- (1) Nouveau DÉFAUT de colonne (nouvelles installations partent en multi-adresse actif).
ALTER TABLE config_veille ALTER COLUMN relance_multi_adresse_active SET DEFAULT true;

-- (2) Bascule le singleton EXISTANT (id=1) — c'est lui qui est lu au runtime. Idempotent.
UPDATE config_veille SET relance_multi_adresse_active = true WHERE id = 1;

COMMENT ON COLUMN config_veille.relance_multi_adresse_active IS
  'LOT 27 — NORME : les N dernières relances (nb_dernieres) partent à TOUTES les adresses connues de la commune (dest_email + mairie_contact confirmé + prada + répondants ; presume exclus). DÉFAUT TRUE. Drapeau = arrêt d''urgence (FALSE = désactive la Règle B ; la Règle A « dernier répondant » reste, côté code). Rattachement des réponses par identifiant, inchangé.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> drapeau + nb_dernieres du singleton :'
SELECT relance_multi_adresse_active, relance_multi_adresse_nb_dernieres FROM config_veille WHERE id = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (revient à l'opt-in du LOT 20) :
--   ALTER TABLE config_veille ALTER COLUMN relance_multi_adresse_active SET DEFAULT false;
--   UPDATE config_veille SET relance_multi_adresse_active = false WHERE id = 1;
