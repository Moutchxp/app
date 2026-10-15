-- 357_admin_connexion_journal.sql
-- Lot « SÉCURITÉ DE L'ADMIN — IMPORTANTS » (décision d'Arno du 15/10/2026), audit point 8.
--
-- POURQUOI : seuls des compteurs quotidiens anonymes existaient (analytics_admin_jour) ; une intrusion ne laissait aucune
-- trace exploitable. Une ligne par tentative de connexion à l'admin : moment, identifiant saisi (minuscules), compte s'il
-- existe, résultat (succes / echec / bloque), adresse EN EMPREINTE seulement (HMAC-SHA256 avec le secret serveur — jamais
-- l'adresse en clair). Lisible par l'administrateur dans la tuile Audit.
--
-- CONSERVATION : 12 mois, réglable (journal_connexions_retention_mois, défaut 12, plage [1 ; 60]) ; l'application efface
-- les lignes plus anciennes à chaque connexion réussie. Tant que la migration n'est pas appliquée, l'application n'écrit
-- rien (repli silencieux) et la carte de l'Audit dit « journal pas encore activé ».
--
-- SANS RISQUE sur une base en service : CREATE TABLE / INDEX sur une table neuve et vide, une ligne de réglage ajoutée.
-- IDEMPOTENTE. NON APPLIQUÉE par le lot :
--   psql "$DATABASE_URL" -f db/migrations/357_admin_connexion_journal.sql

CREATE TABLE IF NOT EXISTS admin_connexion_journal (
  id            bigserial    PRIMARY KEY,
  survenu_le    timestamptz  NOT NULL DEFAULT now(),
  identifiant   text         NOT NULL CHECK (char_length(identifiant) <= 254),
  compte_id     integer,
  resultat      text         NOT NULL CHECK (resultat IN ('succes', 'echec', 'bloque')),
  ip_empreinte  text         CHECK (ip_empreinte IS NULL OR ip_empreinte ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS admin_connexion_journal_survenu_idx ON admin_connexion_journal (survenu_le);
CREATE INDEX IF NOT EXISTS admin_connexion_journal_compte_idx ON admin_connexion_journal (compte_id, survenu_le);

COMMENT ON TABLE admin_connexion_journal IS
  'Journal nominatif des connexions à l''admin (audit point 8, 15/10/2026) — IP en empreinte HMAC seulement ; conservation 12 mois (réglable).';

INSERT INTO analytics_config (cle, valeur, description) VALUES
  ('journal_connexions_retention_mois', '12',
   'Conservation (mois) du journal des connexions à l''admin. Plage [1 ; 60] ; hors plage → défaut 12.')
ON CONFLICT (cle) DO NOTHING;
