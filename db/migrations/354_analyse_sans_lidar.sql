-- 354_analyse_sans_lidar.sql
-- Lot « ZONE SANS LiDAR — CE QUE VOIT L'INTERNAUTE » (15/10/2026).
--
-- POURQUOI : une analyse lancée sur un bâtiment qu'aucune dalle LiDAR ne couvre (zone interdite de survol, livraison IGN
-- incomplète) s'arrête sans verdict ; l'internaute voit « Nous ne disposons pas encore des relevés aériens nécessaires pour
-- certifier cette adresse. » Cette table garde une ligne par analyse arrêtée pour ce motif, pour qu'Arno sache combien
-- d'internautes sont concernés, et où (dalle IGN, commune). Le COMPTE quotidien par commune existe déjà sans elle
-- (analytics_compteur_jour : nom 'resultat', verdict 'INDETERMINE', raison 'hors_lidar').
--
-- 🔒 AUCUNE DONNÉE DE LOCALISATION PRÉCISE (décision d'Arno, 15/10/2026 — visiteurs anonymes, sans consentement) : ni
-- l'adresse saisie, ni le point (lat/lon, Lambert-93), ni l'heure. Seulement le JOUR, la COMMUNE (INSEE) et la DALLE IGN
-- (1 km²). Le point sert en mémoire à calculer la dalle, puis il est jeté.
--
-- Écrite par app/lib/analytics/sansLidar.ts (best-effort, post-réponse) ; tant que la table n'existe pas, l'écriture est
-- abandonnée sans erreur pour l'internaute (repli : seul le compteur quotidien est tenu).
--
-- IDEMPOTENTE (IF NOT EXISTS). NON APPLIQUÉE par le lot :
--   psql "$DATABASE_URL" -f db/migrations/354_analyse_sans_lidar.sql

CREATE TABLE IF NOT EXISTS analyse_sans_lidar (
  id             bigserial PRIMARY KEY,
  jour_paris     date      NOT NULL,
  motif          text      NOT NULL CHECK (motif IN ('pas_de_lidar')),
  dalle          text      CHECK (dalle IS NULL OR dalle ~ '^[0-9]{4}_[0-9]{4}$'),
  commune_insee  text      CHECK (commune_insee IS NULL OR commune_insee ~ '^(2[AB]|[0-9]{2})[0-9]{3}$')
);

CREATE INDEX IF NOT EXISTS analyse_sans_lidar_jour_idx ON analyse_sans_lidar (jour_paris);
CREATE INDEX IF NOT EXISTS analyse_sans_lidar_dalle_idx ON analyse_sans_lidar (dalle);

COMMENT ON TABLE analyse_sans_lidar IS
  'Analyses arrêtées faute de LiDAR sous l''origine (une ligne par analyse) — lot ZONE SANS LiDAR, 15/10/2026.';
