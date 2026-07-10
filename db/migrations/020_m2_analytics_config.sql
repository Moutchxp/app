-- 020_m2_analytics_config.sql — M2 (statistiques), LOT 2 : config d'analytique « pilotage sans code ».
--
-- MOTIF : le LOT 2 (instrumentation du tunnel) a besoin de DEUX réglages qui doivent naître EN CONFIG
-- (éditables au runtime par un non-développeur), jamais en dur :
--   * `k_anonymat_min` — seuil de k-anonymat de la carte / des ventilations. ⚠️ POSÉ, PAS APPLIQUÉ dans
--     ce lot : il n'est lu NULLE PART dans le chemin d'écriture (on écrit TOUT au grain jour ; le k
--     s'applique à l'AFFICHAGE, lots 4-5). Valeur = 11 (précédent INSEE des 11 ménages, plancher de
--     `SPEC_M2_rgpd_et_donnees_personnelles.md` §A.3.4 « ne pas descendre sous »). ⚠️ À CONFIRMER PAR UN
--     DPO AVANT TOUTE PUBLICATION : le chiffre exact défendable relève d'un avis juridique.
--   * `bots_ua_motif` — motif (regex, insensible à la casse) d'User-Agents de bots exclus du comptage
--     (SPEC_M2_evenements §5 « filtrage bots, règle 2 »). CELUI-CI est APPLIQUÉ dès ce lot (le beacon
--     `/api/mesure` filtre). Le filtre PRINCIPAL reste « exiger un événement JS » (règle 1), intrinsèque
--     à un beacon client : un bot sans JS n'émet jamais.
--
-- Les DURÉES DE RÉTENTION vivent déjà dans `analytics_retention` (018) ; les réglages du job de
-- maintenance dans `analytics_maintenance_config` (019). Cette table-ci porte les réglages de
-- COMPORTEMENT ANALYTIQUE / AFFICHAGE. Le job/instrumentation lisent avec REPLI CODÉ sûr → fonctionnent
-- même si cette migration n'est pas (encore) appliquée.
--
-- REJOUABLE / IDEMPOTENTE (`CREATE TABLE IF NOT EXISTS`, seed `ON CONFLICT DO NOTHING`).
-- TRANSACTIONNELLE (BEGIN/COMMIT). ADDITIVE : table strictement nouvelle, isolée, aucun DROP/ALTER/TRIGGER
-- sur une table existante → golden hors de portée.
--
-- Application MANUELLE (Arno) : psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/020_m2_analytics_config.sql
-- Rollback non destructif : DROP TABLE IF EXISTS analytics_config;

BEGIN;

CREATE TABLE IF NOT EXISTS analytics_config (
  cle          text PRIMARY KEY,
  valeur       text NOT NULL,
  description  text
);

INSERT INTO analytics_config (cle, valeur, description) VALUES
  ('k_anonymat_min', '11',
   'Seuil de k-anonymat pour l''AFFICHAGE (lots 4-5). POSÉ, NON APPLIQUÉ dans le lot 2 (on écrit tout). '
   '11 = plancher SPEC_M2_rgpd §A.3.4 (précédent INSEE). À CONFIRMER PAR UN DPO AVANT PUBLICATION.'),
  ('bots_ua_motif',
   'bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|bingbot|googlebot|gptbot|bytespider|applebot|semrush|ahrefs|petalbot|yandex|duckduckbot|ia_archiver|headlesschrome|phantom|python-requests|curl|wget|monitor|uptime|pingdom',
   'Motif regex (insensible casse) d''User-Agents de bots exclus du comptage (SPEC_M2_evenements §5, règle 2). Appliqué par le beacon /api/mesure.')
ON CONFLICT (cle) DO NOTHING;

COMMIT;
