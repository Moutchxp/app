-- 493_gestion_collaborateurs_prevenus.sql — 🔴🔴 LE RÉGLAGE « COLLABORATEURS PRÉVENUS » (Arno, 18/11/2026).
--
-- LA DÉCISION (Arno, 18/11/2026) : « Crée un seul réglage « collaborateurs prévenus », éditable sans code, qui remplace la règle des
-- comptes pour les cinq mails internes de la Location » — l'alerte préavis (individuelle et récapitulative), la copie du compte rendu
-- de pré-visite, la copie du mail « Refus / absence de pré-visite », le mail « Sortie enregistrée » et le mail interne du parcours
-- préavis / sortie. « Valeur par défaut : a.jorel@sansvisavis.com, jb.pons@sansvisavis.com, c.jullien@sansvisavis.com,
-- gestion@criterimmo.fr. » a.dasilva@sansvisavis.com ne les reçoit plus.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une colonne `collaborateurs_prevenus` (adresses séparées par des virgules, la forme des autres
-- listes de `gestion_config`), et la valeur par défaut posée sur la ligne de configuration SEULEMENT si la colonne est encore vide.
-- La validation (adresses valides, sans doublon, 30 au plus) est au serveur (`validerCollaborateurs`) ; une valeur invalide ou vide
-- fait appliquer la règle des comptes (tous les comptes actifs ayant accès à la Gestion ou à la Location), comme sans la colonne.
-- Aucune autre ligne ni colonne touchée.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.
-- ⚠️ Sans elle, les cinq mails partent comme avant, à tous les comptes ayant accès à la Gestion ou à la Location.

ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS collaborateurs_prevenus text
  CHECK (collaborateurs_prevenus IS NULL OR length(collaborateurs_prevenus) <= 2000);

UPDATE gestion_config
   SET collaborateurs_prevenus = 'a.jorel@sansvisavis.com, jb.pons@sansvisavis.com, c.jullien@sansvisavis.com, gestion@criterimmo.fr'
 WHERE id = 1 AND collaborateurs_prevenus IS NULL;

COMMENT ON COLUMN gestion_config.collaborateurs_prevenus IS 'Collaborateurs prévenus (mails internes de la Location) : les adresses, séparées par des virgules, qui reçoivent les alertes « aucune pré-visite fixée », les copies du compte rendu et du refus de pré-visite et les mails de sortie de locataire (493). Vide ou invalide : tous les comptes actifs ayant accès à la Gestion ou à la Location.';
