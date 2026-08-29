-- 170_phases_delais_bascule.sql — PHASE-1 : les deux DÉLAIS du verdict à trois phases, en configuration (pilotage sans code) + la
-- colonne qui ENREGISTRERA la date de bascule d'un dossier. Ce lot ne pose QUE les variables ; le MOTEUR de phases viendra après.
--
-- ⚠️ POURQUOI : le verdict certifié connaîtra trois phases. (1) De l'accord du permis jusqu'à une DATE DE BASCULE (défaut 1,5 an), le
-- certificat reste sur l'ANCIENNE configuration de la parcelle et le verdict projeté est proposé. (2) De la bascule jusqu'à une FIN
-- D'INFORMATION (défaut 1,5 an APRÈS la bascule), le certificat utilise les polygones OFFICIELS + un message signale la construction
-- récente. (3) Ensuite, plus de message. La BASCULE ne survient que si TROIS conditions sont réunies : le délai est écoulé ET les
-- nouveaux polygones du cadastre sont en base ET le rattachement a été validé — sinon on reste en phase 1, quel que soit le délai.
--
-- ═══ ① DEUX DÉLAIS dans config_veille (singleton id=1), en JOURS ══════════════════════════════════════════════════════════════════
--   Patron EXACT des seuils de rattachement (migration 166) : integer NOT NULL DEFAULT + CHECK de plage, lu au runtime avec repli sûr +
--   provenance (rattachementConfig.ts). PAS dans config_scoring (moteur de score / golden) : ce sont des délais de POLITIQUE, pas des
--   pondérations de score.
--   · delai_bascule_jours — défaut 548 (1,5 an), compté depuis sitadel_dossier.date_reelle_autorisation.
--   · duree_message_jours — défaut 548 (1,5 an), comptée depuis LA BASCULE elle-même (pas depuis l'accord).
--   BORNES retenues : [30 ; 1825] jours (1 mois → 5 ans), pour les DEUX. Justification :
--     — plancher 30 j : en dessous, une bascule/un message quasi immédiat serait du bruit (et le cadastre n'a de toute façon jamais
--       publié les nouveaux polygones si tôt) ; le plancher reste bas pour permettre un réglage court en test.
--     — plafond 1825 j (5 ans) : au-delà, une « construction récente » n'a plus de sens ; borne large mais finie (cohérente avec la
--       fenêtre IGN 1–3 ans du seuil attente_bati, ici doublée pour couvrir les publications cadastrales les plus lentes).
--
-- ═══ ② ENREGISTREMENT de la DATE DE BASCULE — colonne permis_rattachement.bascule_le (date) ═══════════════════════════════════════
--   DÉCISION (Arno) : la date à laquelle la bascule survient est ENREGISTRÉE au moment où elle survient, JAMAIS recalculée à l'affichage
--   — sinon la durée du message dépendrait du jour où l'on regarde, et deux certificats émis le même jour pourraient diverger.
--   OÙ : sur `permis_rattachement` (une ligne par dossier, migration 116), qui porte déjà le cycle de vie du rattachement d'un dossier
--   (etat, valide_le, refuse_le, annule_par_lidar…). La bascule est l'événement de cycle SUIVANT du MÊME dossier → foyer naturel, une
--   seule date par dossier, écrite une fois. Grain `date` (jour) : la durée du message se compte en jours (cohérent avec date_reelle_autorisation).
--   ⚠️ Ce lot AJOUTE la colonne mais N'ÉCRIT PAS dedans : le remplissage est la responsabilité du MOTEUR de phases (chantier suivant).
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS + CHECK inline). Aucun DROP, aucun UPDATE, aucune donnée existante touchée.
-- Ne touche NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI config_scoring, NI les gardes ETAN-1.
-- Idempotente. Une transaction. Requiert `config_veille` (048) et `permis_rattachement` (116). Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/170_phases_delais_bascule.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① Les deux délais (jours) — patron 166 : entier + NOT NULL + DEFAULT + CHECK de plage lu par parserBornesCheck (Réglages).
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS delai_bascule_jours integer NOT NULL DEFAULT 548
    CHECK (delai_bascule_jours >= 30 AND delai_bascule_jours <= 1825),
  ADD COLUMN IF NOT EXISTS duree_message_jours integer NOT NULL DEFAULT 548
    CHECK (duree_message_jours >= 30 AND duree_message_jours <= 1825);

COMMENT ON COLUMN config_veille.delai_bascule_jours IS
  'PHASE-1 — délai (JOURS) après l''accord du permis (sitadel_dossier.date_reelle_autorisation) avant que le certificat puisse basculer sur les polygones OFFICIELS du cadastre. Défaut 548 (≈ 1,5 an). Plage [30 ; 1825]. La bascule reste conditionnée à la présence des nouveaux polygones ET à un rattachement validé. Lu au runtime (lireDelaisPhases) avec repli sûr + provenance. N''alimente NI le verdict NI une altitude par lui-même.';
COMMENT ON COLUMN config_veille.duree_message_jours IS
  'PHASE-1 — durée (JOURS), comptée depuis LA BASCULE (pas depuis l''accord), pendant laquelle un message signale que le verdict tient compte d''une construction récente. Défaut 548 (≈ 1,5 an). Plage [30 ; 1825]. Lu au runtime avec repli sûr + provenance.';

-- ② Date de bascule ENREGISTRÉE (jamais recalculée) — remplie plus tard par le MOTEUR de phases, pas par ce lot.
ALTER TABLE permis_rattachement ADD COLUMN IF NOT EXISTS bascule_le date;
COMMENT ON COLUMN permis_rattachement.bascule_le IS
  'PHASE-1 — DATE à laquelle le certificat de CE dossier a basculé sur les polygones officiels du cadastre. ENREGISTRÉE au moment où la bascule survient (les trois conditions réunies), JAMAIS recalculée à l''affichage : la durée du message se compte à partir d''ICI, de façon stable. NULL = pas encore basculé (phase 1). Écrite par le futur moteur de phases (ce lot ne fait que poser la colonne).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — LECTURE SEULE) :
\echo '>>> ① colonnes délais (type + défaut + NOT NULL) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name IN ('delai_bascule_jours','duree_message_jours') ORDER BY column_name;
\echo '>>> ② CHECK des deux délais (plage lue par le moteur de Réglages) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'config_veille'::regclass AND contype = 'c' AND (pg_get_constraintdef(oid) ILIKE '%delai_bascule_jours%' OR pg_get_constraintdef(oid) ILIKE '%duree_message_jours%') ORDER BY conname;
\echo '>>> ③ valeurs courantes (singleton) :'
SELECT delai_bascule_jours, duree_message_jours FROM config_veille WHERE id = 1;
\echo '>>> ④ colonne bascule_le posée sur permis_rattachement (attendu : date, nullable, sans défaut) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'permis_rattachement' AND column_name = 'bascule_le';

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible ; les colonnes peuvent aussi rester sans effet) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE config_veille DROP COLUMN IF EXISTS delai_bascule_jours; \
--     ALTER TABLE config_veille DROP COLUMN IF EXISTS duree_message_jours; \
--     ALTER TABLE permis_rattachement DROP COLUMN IF EXISTS bascule_le; \
--     COMMIT;"
