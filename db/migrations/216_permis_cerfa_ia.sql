-- 216_permis_cerfa_ia.sql — CR-2b1 : PASSES de LECTURE IA du Cerfa (vision Mistral), AVEC leur JOURNAL DE TRANSMISSION.
--
-- POURQUOI : un étage IA lit les pages du Cerfa (cases nature/architecte/démolition, type d'opération SVAV, résumé du texte long) et
-- produit un compte rendu STRUCTURÉ, affiché À CÔTÉ du déterministe (jamais à sa place). Cette table garde, PASSE PAR PASSE :
--   · `transmission` — la PREUVE de ce qui est sorti (ou NON) de la machine vers le tiers : pièces, pages ENVOYÉES (+ cible),
--                      pages REFUSÉES (+ motif). Écrite AVANT l'appel (statut 'transmis'/'abstention') → existe même si l'appel échoue.
--   · `lecture`      — le compte rendu structuré rendu par l'IA (null si abstention totale ou échec). Complété APRÈS l'appel.
--   · le modèle, le coût, l'empreinte GED (péremption/gate), le statut, l'horodatage.
--
-- APPEND-ONLY : une LIGNE PAR PASSE (bigserial), horodatée. Jamais réécrite par une passe ultérieure ; l'affichage lit la DERNIÈRE.
-- Le seul UPDATE prévu est NON destructif : compléter la ligne de LA passe courante (lecture/coût/statut) après l'appel — jamais
-- effacer ni écraser la preuve de transmission. Aucun DELETE/TRUNCATE.
--
-- SÛR : DDL additive, idempotente (IF NOT EXISTS). N'écrit AUCUNE donnée. Le code est RÉSILIENT si cette table MANQUE (repli
-- to_regclass → la lecture IA est simplement absente de la cartouche, aucune écriture, comportement d'avant). Application MANUELLE :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/216_permis_cerfa_ia.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

CREATE TABLE IF NOT EXISTS permis_cerfa_ia (
  id            bigserial   PRIMARY KEY,
  dossier_id    bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  transmission  jsonb       NOT NULL,                         -- JournalTransmissionPiece[] (selectionPagesCerfaIa.ts) : preuve d'envoi
  lecture       jsonb,                                        -- compte rendu structuré IA (null si abstention / échec)
  modele        text,                                         -- modèle IA utilisé (ex. mistral-medium-latest)
  cout_usd      numeric,                                      -- coût de la passe (usage × tarifs liste)
  empreinte_ged text,                                         -- empreinte GED au moment de la passe (péremption / gate anti-rejeu)
  statut        text        NOT NULL,                         -- 'transmis' | 'lu' | 'abstention' | 'echec'
  motif         text,                                         -- motif si 'echec' / 'abstention'
  passe_le      timestamptz NOT NULL DEFAULT now()
);

-- Lecture de la DERNIÈRE passe d'un dossier (affichage cartouche).
CREATE INDEX IF NOT EXISTS permis_cerfa_ia_dossier_passe_idx ON permis_cerfa_ia (dossier_id, passe_le DESC);

COMMENT ON TABLE permis_cerfa_ia IS 'CR-2b1 — passes de lecture IA du Cerfa (append-only, une ligne/passe). `transmission` = preuve RGPD de ce qui est sorti de la machine ; `lecture` = compte rendu structuré (informatif, jamais un champ instruit). Résiliente si absente.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
\echo '>>> Table permis_cerfa_ia après 216 (attendu : colonnes id, dossier_id, transmission, lecture, modele, cout_usd, empreinte_ged, statut, motif, passe_le) :'
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'permis_cerfa_ia' ORDER BY ordinal_position;
