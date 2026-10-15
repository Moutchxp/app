-- 355_login_throttle_ip.sql
-- Lot « SÉCURITÉ DE L'ADMIN — IMPORTANTS » (décision d'Arno du 15/10/2026), audit point 3.
--
-- POURQUOI : la limite d'essais de connexion ne comptait que par IDENTIFIANT ; une seule machine pouvait essayer un mot de
-- passe sur des dizaines de comptes sans être freinée. Elle compte désormais AUSSI par adresse IP — en EMPREINTE seulement
-- (`ip:` + HMAC-SHA256 avec le secret serveur), jamais l'adresse en clair, effacée dès qu'elle sort de la fenêtre.
--
-- Deux réglages, lus au runtime par app/lib/auth/antiBruteforce.ts (le délai suit login_throttle_base_s / _max_s) :
--   login_throttle_ip_seuil      défaut 20   plage [5 ; 1000]     échecs depuis une même adresse avant le premier délai
--   login_throttle_ip_fenetre_s  défaut 900  plage [60 ; 86400]   fenêtre (s) où ces échecs comptent
-- Une valeur hors plage est IGNORÉE par le code (défaut appliqué). Tant que cette migration n'est pas appliquée, le code
-- applique ces mêmes défauts : l'appliquer avec ses valeurs NE CHANGE donc RIEN au comportement — elle rend les réglages
-- visibles et modifiables.
--
-- ⚠️ La limite par IP ne s'applique que si l'adresse est établie de façon sûre : variable CADENCE_ENTETE_IP posée dans le
-- .env du serveur (ex. CADENCE_ENTETE_IP=x-forwarded-for derrière Caddy). Sans elle : aucune limite par IP (jamais un
-- compteur commun qui bloquerait tout le monde), la limite par compte reste active.
--
-- IDEMPOTENTE (ON CONFLICT DO NOTHING : une valeur déjà réglée n'est jamais écrasée). NON APPLIQUÉE par le lot :
--   psql "$DATABASE_URL" -f db/migrations/355_login_throttle_ip.sql

INSERT INTO analytics_config (cle, valeur, description) VALUES
  ('login_throttle_ip_seuil', '20',
   'Échecs de connexion depuis une même adresse IP (en empreinte) avant le premier délai. Plage [5 ; 1000] ; hors plage → défaut 20.'),
  ('login_throttle_ip_fenetre_s', '900',
   'Fenêtre (secondes) de la limite par adresse IP ; les empreintes plus anciennes sont effacées. Plage [60 ; 86400] ; hors plage → défaut 900.')
ON CONFLICT (cle) DO NOTHING;
