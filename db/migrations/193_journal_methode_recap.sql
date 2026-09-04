-- 193_journal_methode_recap.sql — LOT 69 : élargir la méthode du journal d'extraction à 'recap'.
--
-- POURQUOI : le CHAMP LIBRE du récapitulatif (« Courte description de votre projet ») déclare en toutes lettres un décompte
-- qu'AUCUN champ structuré ne porte — logements PAR bâtiment, nombre de bâtiments. On ne le RETIENT que si la SOMME concorde avec
-- le total structuré des logements (40 + 18 + 9 = 67 = total → écrit ; sinon écarté avec motif). Cette valeur n'est ni 'cerfa'
-- (champ AcroForm), ni 'enonce' (table structurée des planches), ni 'plan' (cote lue par géométrie), ni 'ia', ni 'motifs' (cote
-- isolée sans corroboration) : c'est une valeur DÉCLARÉE dans une PHRASE et CORROBORÉE par une somme. Un journal qui mentirait sur
-- sa méthode serait pire que pas de journal → on ajoute 'recap' à la liste fermée. Rang de précédence : le PLUS FAIBLE
-- (precedenceMethodes.ts) — la corroboration gate l'ÉCRITURE d'un champ vierge, jamais l'ÉCRASEMENT d'une méthode structurée.
--
-- SÛR : DDL minimale, idempotente (DROP CONSTRAINT IF EXISTS + ADD). CHECK ÉLARGI (surensemble) : aucune ligne existante ne peut le
-- violer. Ne touche aucune donnée. Requiert 133. Le code est RÉSILIENT si cette migration manque : l'INSERT methode='recap' viole le
-- CHECK → capturé (ecrireDecompteDescription) → no-op, l'affichage reste porté par l'instantané permis_cerfa_recap (comportement
-- d'avant). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/193_journal_methode_recap.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_extraction_journal DROP CONSTRAINT IF EXISTS permis_journal_methode_chk;
ALTER TABLE permis_extraction_journal ADD  CONSTRAINT permis_journal_methode_chk CHECK (methode IN ('motifs','cerfa','ia','enonce','plan','recap'));

COMMENT ON COLUMN permis_extraction_journal.methode IS
  'motifs = extraction par motifs (N5) | cerfa = champ AcroForm (N7-D) | enonce = fait ÉNONCÉ dans une pièce (N8-B) | plan = cote LUE sur une planche par géométrie (N10-I) | ia = repli IA | recap = valeur DÉCLARÉE dans le champ libre du récapitulatif, corroborée par une somme sur un total structuré (LOT 69) — rang le plus faible. Liste fermée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE — AFFICHE la contrainte résultante) :
\echo '>>> Contrainte methode après 193 (attendu : IN (''motifs'', ''cerfa'', ''ia'', ''enonce'', ''plan'', ''recap'')) :'
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid='permis_extraction_journal'::regclass AND conname='permis_journal_methode_chk';
