-- 467_location_validation_sortie_edls.sql — LOCATION (Arno, 11/11/2026, lot 4) : « VALIDER L'ÉTAT DES LIEUX DE SORTIE ».
--
-- LE BESOIN (Arno) : depuis la ligne de préavis, « Valider la sortie » ouvre la fenêtre « Valider l'état des lieux de sortie » — l'état des
-- lieux réalisé, la date de sortie effective, les locataires concernés, un compte rendu libre et des destinataires cochés un par un
-- (LOCATAIRES, PROPRIÉTAIRES). UN mail par destinataire, puis une copie interne (gestion@ et la personne qui valide). Chaque mail entre
-- dans l'historique du bien, de chaque locataire et de chaque propriétaire.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · le journal des mails de la Location (457, élargi en 464) accepte les trois sortes de cette validation — la liste autorisée
--     S'ÉLARGIT (les sortes d'avant restent valides ; aucune ligne touchée) ;
--   · `proprietaire_ids` : les propriétaires qu'un mail concerne (l'historique d'un propriétaire les lit par là, jamais par une adresse).
--     Colonne ajoutée avec sa valeur par défaut : aucune ligne existante n'est réécrite (le déclencheur « ajout seul » ne joue pas).
--
-- Sans elle, la fenêtre refuse la validation et RIEN n'est enregistré (l'écran de sortie reste disponible).
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose 457 et 464.

ALTER TABLE gestion_location_mail_avis DROP CONSTRAINT IF EXISTS gestion_location_mail_avis_sorte_check;
ALTER TABLE gestion_location_mail_avis ADD CONSTRAINT gestion_location_mail_avis_sorte_check
  CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc', 'sortie_locataires',
    'previsite_alerte', 'previsite_invitation', 'previsite_reponse', 'previsite_locataires', 'previsite_locataires_modif',
    'previsite_invitation_cr', 'previsite_compte_rendu', 'previsite_refus', 'previsite_annulation',
    'sortie_edls_locataire', 'sortie_edls_proprietaire', 'sortie_edls_interne'));

ALTER TABLE gestion_location_mail_avis ADD COLUMN IF NOT EXISTS proprietaire_ids bigint[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS gestion_location_mail_avis_proprietaires ON gestion_location_mail_avis USING gin (proprietaire_ids);

COMMENT ON COLUMN gestion_location_mail_avis.proprietaire_ids IS
  'Les propriétaires que le mail concerne (historique du propriétaire) — migration 467.';
