-- 466 — MAILS LOCATION / PRÉ-VISITE / TÂCHES : LE TEXTE MODIFIABLE AVANT ENVOI, AVEC SES PARTIES PROTÉGÉES (décision d'Arno du 10/11/2026, option 1).
--
-- Quand la personne modifie le texte proposé dans le récapitulatif (formule d'appel, introduction, conclusion, politesse — jamais les parties
-- protégées), le journal garde QUI (auteur), QUAND (date d'envoi, déjà là), le texte d'ORIGINE et le texte ENVOYÉ :
--   · `gestion_location_mail_avis.texte_origine`   — préavis, sortie, pré-visite (le texte envoyé est déjà dans `texte`) ;
--   · `gestion_tache_contact_envoi.texte_origine`   — les mails des tâches aux contacts extérieurs (le texte envoyé est dans `texte`) ;
--   · `gestion_location_mail_envoi.texte_origine` et `.texte_envoye` — le mail « Nouvelle location » aux partenaires (qui ne gardait pas son texte).
-- NULL = texte non modifié (ce qui est parti est le texte proposé). Aucune donnée existante n'est modifiée.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose 457, 465 et la table des envois de nouvelle location.
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION POUR LES TEXTES PROPOSÉS : sans elle, un texte MODIFIÉ est refusé (il ne pourrait pas être tracé).

ALTER TABLE gestion_location_mail_avis ADD COLUMN IF NOT EXISTS texte_origine text;
COMMENT ON COLUMN gestion_location_mail_avis.texte_origine IS
  'Le texte PROPOSÉ quand la personne l''a modifié avant l''envoi (le texte envoyé est dans « texte ») ; NULL = non modifié (migration 466).';

ALTER TABLE gestion_tache_contact_envoi ADD COLUMN IF NOT EXISTS texte_origine text;
COMMENT ON COLUMN gestion_tache_contact_envoi.texte_origine IS
  'Le texte PROPOSÉ quand la personne l''a modifié avant l''envoi (le texte envoyé est dans « texte ») ; NULL = non modifié (migration 466).';

ALTER TABLE gestion_location_mail_envoi ADD COLUMN IF NOT EXISTS texte_origine text;
ALTER TABLE gestion_location_mail_envoi ADD COLUMN IF NOT EXISTS texte_envoye text;
COMMENT ON COLUMN gestion_location_mail_envoi.texte_origine IS
  'Le texte PROPOSÉ du mail « Nouvelle location » quand la personne l''a modifié avant l''envoi ; NULL = non modifié (migration 466).';
COMMENT ON COLUMN gestion_location_mail_envoi.texte_envoye IS
  'Le texte ENVOYÉ du mail « Nouvelle location » quand la personne l''a modifié avant l''envoi ; NULL = non modifié (migration 466).';
