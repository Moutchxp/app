-- 512_gestion_copropriete_arrete_comptes.sql — 🔴 LA DATE D'ARRÊTÉ DES COMPTES DE LA COPROPRIÉTÉ (Arno, 23/11/2026, suivi des 20 %).
--
-- LE BESOIN (demande d'Arno du 23/11/2026) : « Nouvelle donnée par copropriété : « Date d'arrêté des comptes » (jour et mois annuels, propre à
-- chaque copropriété, ex. 31/12 ou 30/06). FACULTATIVE. Saisie dans la fiche Copropriété, à côté des dates d'AGO, et dans la fenêtre de la
-- sortie (même composant). Migration au prochain numéro libre (la 511 reste réservée à la 361 en attente). »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL, sur gestion_copropriete : deux colonnes facultatives (jour, mois), renseignées ensemble ou pas du tout, un jour
-- qui existe dans ce mois (le 29/02 refusé : un arrêté annuel doit exister chaque année), et qui l'a saisie / quand. Chaque saisie est journalisée
-- par l'application (gestion_journal, entité « copropriete », migration 506). Aucune donnée touchée, rien supprimé ni renommé.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE : rejouable.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la date d'arrêté est dite « non installée », rien ne se saisit, et le suivi des 20 %
-- traite chaque copropriété comme « date d'arrêté des comptes manquante ».

ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS arrete_comptes_jour smallint NULL;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS arrete_comptes_mois smallint NULL;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS arrete_comptes_le timestamptz NULL;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS arrete_comptes_par_libelle text NULL;

ALTER TABLE gestion_copropriete DROP CONSTRAINT IF EXISTS gestion_copropriete_arrete_comptes_chk;
ALTER TABLE gestion_copropriete ADD CONSTRAINT gestion_copropriete_arrete_comptes_chk CHECK (
  (arrete_comptes_jour IS NULL AND arrete_comptes_mois IS NULL)
  OR (arrete_comptes_mois BETWEEN 1 AND 12 AND arrete_comptes_jour >= 1
      AND arrete_comptes_jour <= CASE WHEN arrete_comptes_mois = 2 THEN 28 WHEN arrete_comptes_mois IN (4, 6, 9, 11) THEN 30 ELSE 31 END));

COMMENT ON COLUMN gestion_copropriete.arrete_comptes_jour IS 'Jour de la date annuelle d''arrêté des comptes (avec arrete_comptes_mois) ; facultatif — migration 512.';
COMMENT ON COLUMN gestion_copropriete.arrete_comptes_mois IS 'Mois de la date annuelle d''arrêté des comptes (1 à 12) ; facultatif — migration 512.';
COMMENT ON COLUMN gestion_copropriete.arrete_comptes_le IS 'Quand la date d''arrêté des comptes a été saisie en dernier — migration 512.';
COMMENT ON COLUMN gestion_copropriete.arrete_comptes_par_libelle IS 'Qui a saisi la date d''arrêté des comptes en dernier (figé en texte) — migration 512.';
