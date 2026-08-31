-- 184_cascade_partiel_auto.sql — AUTO-PARTIEL : brancher la cascade PARTIELLE (CASC-3 : relances 1..N, annonce CADA) sur l'envoi
-- AUTOMATIQUE, au même titre que la cascade ordinaire et la relance sur réponse (PART-E). Jusqu'ici CASC-3 n'avait AUCUN exécuteur
-- auto (envoi 100 % manuel via la route cascade-partielle) : arbitrage Arno = tout doit partir tout seul aux dates dérivées de partiel_le.
--
-- ⚠️ RÈGLE MÉTIER (Arno) : les étapes partielles partent SEULES aux dates de la cascade. L'envoi manuel reste possible (relance hors
-- calendrier). Le butoir CADA et l'échéance légale sont ANCRÉS à partiel_le + config (cascadePartielle.ts) et NE bougent PAS.
--
-- 🔴 CE QUE FAIT LA MIGRATION :
--   ① config_veille.cascade_partiel_auto_active (booléen, DÉFAUT TRUE = intention d'Arno) — interrupteur d'ARRÊT D'URGENCE.
--      Sur le modèle relance_auto_active (booléen simple, pas de CHECK de plage). Lu au runtime (pilotage sans code) ; repli TRUE côté code.
--   ② Table cascade_partiel_creneau — VERROU ANTI-DOUBLON par (demande, créneau) : une étape (relance-N / annonce) n'est envoyée
--      qu'UNE fois, que ce soit par l'auto OU par un envoi manuel (les deux RÉSERVENT le créneau avant d'envoyer ; PK = exactement-une-fois).
--      C'est LA garantie « jamais deux fois la même relance » : le premier qui réserve envoie, l'autre est neutralisé.
--
-- N'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). AUCUN envoi ici.
-- ADDITIVE PURE : ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS. Aucun DROP/UPDATE de données. Idempotente. GOLDEN-SAFE. Une transaction.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/184_cascade_partiel_auto.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① interrupteur (défaut ACTIF).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cascade_partiel_auto_active boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN config_veille.cascade_partiel_auto_active IS
  'AUTO-PARTIEL — les étapes de la cascade PARTIELLE (relances 1..N, annonce CADA) partent AUTOMATIQUEMENT aux dates dérivées de partiel_le + config. DÉFAUT TRUE. Interrupteur d''arrêt d''urgence (FALSE = suspend l''envoi auto partiel ; l''envoi manuel reste possible). Butoir CADA inchangé (ancré à partiel_le).';

-- ② verrou anti-doublon par créneau (demande, étape). Réservé AVANT l'envoi ; PK ⇒ exactement-une-fois (auto ⇄ manuel).
CREATE TABLE IF NOT EXISTS cascade_partiel_creneau (
  demande_id bigint NOT NULL REFERENCES demande(id) ON DELETE CASCADE,
  cle        text   NOT NULL,               -- « relance-1 », « relance-2 », …, « annonce »
  reserve_le timestamptz NOT NULL DEFAULT now(),
  auteur     text,                          -- 'auto' | 'admin[:id]'
  PRIMARY KEY (demande_id, cle)
);
COMMENT ON TABLE cascade_partiel_creneau IS
  'AUTO-PARTIEL — verrou d''idempotence : un créneau (demande, étape) réservé une fois ne peut plus l''être. Le premier (auto OU manuel) qui réserve envoie ; l''autre est neutralisé. Garantit « jamais deux fois la même relance ».';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> interrupteur + table de verrou :'
SELECT cascade_partiel_auto_active FROM config_veille WHERE id = 1;
SELECT to_regclass('public.cascade_partiel_creneau') AS table_verrou;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK :
--   DROP TABLE IF EXISTS cascade_partiel_creneau;
--   ALTER TABLE config_veille DROP COLUMN IF EXISTS cascade_partiel_auto_active;
