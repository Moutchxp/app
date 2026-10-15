-- 361_permis_emprise_numero_reveil.sql — réveille la migration 212, jamais appliquée (préparée la nuit du 16/10/2026).
-- svav:remplace 212_permis_emprise_numero.sql
--
-- ⚠️ EN ATTENTE DE LA DÉCISION D'ARNO : ce fichier est rangé dans db/migrations-en-attente/, que la mise à jour de la prod
-- ne lit pas. Le déplacer dans db/migrations/ (en vérifiant que 361 est toujours le numéro suivant) = décider de
-- l'appliquer à la prochaine mise à jour. Analyse complète : docs/RAPPORT_NUIT_2026-10-16.md, lot 2.
--
-- POURQUOI : sur la fiche d'un permis, chaque emprise de « bâtiment en projet » doit recevoir un numéro DÉFINITIF par
-- dossier, jamais réattribué après une suppression (une note qui cite « bâtiment A (2) » désigne toujours la même).
-- Faute de 212, le numéro affiché est recalculé à chaque affichage (rang par id parmi les emprises du même bâtiment,
-- nomCorps.ts:70) : supprimer une emprise renumérote les suivantes.
--
-- CONTENU : celui de 212, à l'identique (table compteur + colonne + reprise des emprises existantes + amorce du compteur).
-- Reprise mesurée sur la copie de la base du Mac (15/10/2026) : 12 emprises, 7 dossiers, 1 bâtiment à 2 emprises,
-- 0 nom affiché qui change. IDEMPOTENTE (IF NOT EXISTS, « WHERE numero IS NULL », GREATEST). Aucun DROP, DELETE ni
-- TRUNCATE. Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS permis_emprise_numero (
  dossier_id     bigint  PRIMARY KEY,
  dernier_numero integer NOT NULL DEFAULT 0
);
COMMENT ON TABLE permis_emprise_numero IS
  'Compteur PAR DOSSIER du numéro d''emprise : monotone, ne décroît jamais → un numéro n''est jamais réattribué. Bumpé (+1) à chaque création d''emprise (enregistrerEmprise). Réveil de 212 par 361.';

ALTER TABLE permis_emprise_reconstruite ADD COLUMN IF NOT EXISTS numero integer;
COMMENT ON COLUMN permis_emprise_reconstruite.numero IS
  'Numéro STABLE de l''emprise dans son dossier (ordre de création, jamais réattribué après suppression). Désambiguïse le nom affiché quand un bâtiment porte plusieurs emprises. Le nom lui-même reste DÉRIVÉ (repère du bâtiment + « (numéro) »), jamais stocké.';

-- REPRISE : numéro = rang par ordre de création (id) DANS le dossier, seulement là où il manque (ré-exécutable sans effet).
WITH rangs AS (
  SELECT id, row_number() OVER (PARTITION BY dossier_id ORDER BY id) AS rang
    FROM permis_emprise_reconstruite
)
UPDATE permis_emprise_reconstruite e
   SET numero = r.rang
  FROM rangs r
 WHERE e.id = r.id AND e.numero IS NULL;

-- AMORCE du compteur au maximum par dossier (idempotent : GREATEST → ne redescend jamais).
INSERT INTO permis_emprise_numero (dossier_id, dernier_numero)
  SELECT dossier_id, COALESCE(MAX(numero), 0) FROM permis_emprise_reconstruite GROUP BY dossier_id
ON CONFLICT (dossier_id) DO UPDATE SET dernier_numero = GREATEST(permis_emprise_numero.dernier_numero, EXCLUDED.dernier_numero);
