-- 514_location_alerte_vingt_pourcent.sql — 🔴 L'ALERTE HEBDOMADAIRE « 20 % À RESTITUER » (Arno, 24/11/2026) : LE JOURNAL DES ENVOIS.
--
-- LE BESOIN (demande d'Arno du 24/11/2026) : « chaque lundi matin (heure de Paris), si au moins un locataire est en « Urgence », UN mail
-- récapitulatif à gestion@criterimmo.fr […] Utilise l'ordonnanceur déjà en place […] et journalise chaque envoi ; pas de double envoi le même
-- lundi. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table, une ligne par tentative d'envoi (« envoye » ou « echec ») — le lundi (date de Paris), le nombre de
-- locataires en urgence, les destinataires, l'objet, le motif d'un échec. UN SEUL « envoye » par lundi (index unique partiel) : c'est la garde
-- contre le double envoi. Ajout seul (déclencheurs : ni UPDATE, ni DELETE, ni TRUNCATE). Aucune donnée existante touchée.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE : rejouable.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, l'alerte n'est JAMAIS envoyée (elle ne pourrait pas se garder du double envoi) ;
-- le mode essai (aperçu sans envoi) reste disponible.

CREATE TABLE IF NOT EXISTS gestion_location_alerte_vingt (
  id bigserial PRIMARY KEY,
  lundi date NOT NULL,
  statut text NOT NULL CHECK (statut IN ('envoye', 'echec')),
  nombre integer NOT NULL CHECK (nombre >= 0),
  destinataires text[] NOT NULL,
  objet text NOT NULL,
  motif text NULL,
  quand timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_alerte_vingt_un_envoi ON gestion_location_alerte_vingt (lundi) WHERE statut = 'envoye';

CREATE OR REPLACE FUNCTION gestion_location_alerte_vingt_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 514) — rien ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_alerte_vingt_ajout_seul ON gestion_location_alerte_vingt;
CREATE TRIGGER gestion_location_alerte_vingt_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_alerte_vingt
  FOR EACH ROW EXECUTE FUNCTION gestion_location_alerte_vingt_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_alerte_vingt_no_truncate ON gestion_location_alerte_vingt;
CREATE TRIGGER gestion_location_alerte_vingt_no_truncate BEFORE TRUNCATE ON gestion_location_alerte_vingt
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_alerte_vingt_ajout_seul();

COMMENT ON TABLE gestion_location_alerte_vingt IS
  'Alerte hebdomadaire « 20 % à restituer » (lundi matin, heure de Paris) : une ligne par tentative d''envoi ; un seul « envoye » par lundi — migration 514.';
