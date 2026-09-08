-- 211_permis_emprise_ajustement.sql — Module VEILLE PERMIS (PROJ-3t, lot 3a) : SOCLE de l'AJUSTEMENT MANUEL réversible d'une emprise
-- projetée (translation + rotation + échelle uniforme), stocké comme un DELTA par-dessus le tracé d'origine.
--
-- 🔴 DELTA, JAMAIS D'ÉCRASEMENT : `geom` reste le tracé d'ORIGINE, non transformé — une seule vérité géométrique. La colonne `ajustement`
--   (jsonb NULLABLE) porte la transformation NOMMÉE appliquée PAR-DESSUS, au RENDU seulement :
--     {tx, ty, rotDeg, echelle, centre:{x,y}, pose_le, pose_par}
--   · NULL = aucun ajustement → comportement IDENTIQUE à aujourd'hui (les emprises existantes restent intactes, ajustement NULL).
--   · Supprimer le delta (repasser à NULL) = retour EXACT à l'origine (aucune donnée d'origine perdue).
-- Transformation RIGIDE (similitude : translation + rotation + échelle UNIFORME) UNIQUEMENT — jamais d'affine, jamais de cisaillement, jamais
--   d'échelles X≠Y (invariant A1 de la recon : une transformation à plus de paramètres ABSORBERAIT l'erreur en déformant le bâtiment au lieu
--   de la montrer). Le `centre` (centroïde de l'objet AU MOMENT de la pose) est FIGÉ dans le delta, jamais recalculé à la lecture — sinon le
--   rendu bougerait si la géométrie sous-jacente change.
-- TRAÇABILITÉ DANS LA DONNÉE : delta non NULL + pose_le/pose_par ⇒ l'emprise a été retouchée à la main, distinguable SANS l'écran. Motif :
--   l'emprise alimente la simulation de vis-à-vis projeté montrée à un internaute ; on doit toujours pouvoir dire ce qui a été ajusté.
-- 🔴 GARDE MOTEUR INCHANGÉE : reconstitution, JAMAIS une mesure. N'alimente NI le verdict SVAV, NI une injection d'altitude, NI un certificat.
--   L'auto-statut des polygones voisins (polygonesRecouvertsParEmprise) reste calculé sur le geom D'ORIGINE : un ajustement ne le recalcule pas.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, nullable, AUCUN DEFAULT non-NULL, AUCUNE reprise de données). Aucun DROP, aucun
-- ALTER destructif, aucun UPDATE/DELETE/TRUNCATE. GOLDEN-SAFE (ne touche ni au verdict, ni au score, ni au golden). Idempotent. Un seul
-- BEGIN/COMMIT. AUCUN ENVOI. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/211_permis_emprise_ajustement.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

ALTER TABLE permis_emprise_reconstruite
  ADD COLUMN IF NOT EXISTS ajustement jsonb;   -- delta rigide réversible appliqué au RENDU ; NULL = aucun (comportement d'origine, inchangé)

COMMENT ON COLUMN permis_emprise_reconstruite.ajustement IS
  'PROJ-3t — DELTA d''ajustement manuel réversible appliqué PAR-DESSUS `geom` (jamais un écrasement) : {tx, ty, rotDeg, echelle, centre:{x,y}, pose_le, pose_par}. Similitude RIGIDE (translation + rotation + échelle uniforme), jamais d''affine ni de cisaillement. `centre` = centroïde FIGÉ à la pose (jamais recalculé à la lecture). NULL = aucun ajustement (retour exact à l''origine). Traçabilité : delta non NULL + pose_le/pose_par ⇒ emprise retouchée à la main, distinguable dans la donnée. 🔴 reconstitution, jamais une mesure : n''alimente ni le verdict, ni l''altitude, ni un certificat.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT column_name, is_nullable, udt_name FROM information_schema.columns
--     WHERE table_name = 'permis_emprise_reconstruite' AND column_name = 'ajustement';
--   -- attendu : is_nullable = YES, udt_name = 'jsonb'
--   SELECT count(*) AS total, count(ajustement) AS avec_ajustement FROM permis_emprise_reconstruite;
--   -- attendu : avec_ajustement = 0 (toutes les emprises existantes restent à ajustement NULL, intactes)
