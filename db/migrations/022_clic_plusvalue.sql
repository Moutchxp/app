-- 022_clic_plusvalue.sql — M2 (statistiques), Chantier A : ISOLER le CTA « plus-value ».
--
-- MOTIF : le bouton « Calculer la plus-value de ma vue » (écran résultat CERTIFIÉ) et le bouton
-- « Estimation immobilière » (écran résultat VIS-À-VIS) émettaient tous deux le MÊME événement
-- `clic_estimation` → impossible de les distinguer. On introduit un nom d'événement DÉDIÉ
-- `clic_plusvalue` pour le premier ; `clic_estimation` reste attaché au second.
--
-- PORTÉE MINIMALE : une SEULE ligne ajoutée au CATALOGUE d'événements. Le nom d'événement est contraint
-- par une CLÉ ÉTRANGÈRE (`analytics_compteur_jour.nom REFERENCES analytics_catalogue_evenement(nom)`,
-- migration 018) — PAS un CHECK. Ajouter un événement = un simple INSERT dans le catalogue, AUCUNE
-- altération de contrainte, AUCUN DDL sur une table existante. Sans cette ligne, l'écriture de
-- `clic_plusvalue` serait rejetée par la FK (et avalée par le writer best-effort).
--
-- IDEMPOTENTE : `ON CONFLICT (nom) DO NOTHING` → un rejeu est un no-op. TRANSACTIONNELLE.
-- ADDITIVE / NON DESTRUCTIVE : aucun DROP/TRUNCATE/DELETE/UPDATE, aucune donnée existante touchée.
-- Zéro couplage au moteur de calcul → golden hors de portée.
--
-- ROLLBACK (non destructif, si vraiment nécessaire) : la ligne catalogue n'est référencée que par les
-- compteurs déjà écrits ; supprimer l'événement exigerait de purger d'abord ses compteurs — inutile en
-- pratique (le laisser est inoffensif). Ne PAS supprimer sans process validé (règle SVAV).
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/022_clic_plusvalue.sql
-- Vérification : SELECT * FROM analytics_catalogue_evenement WHERE nom = 'clic_plusvalue';

BEGIN;

INSERT INTO analytics_catalogue_evenement (nom, portee, description) VALUES
  ('clic_plusvalue', 'public', 'Clic « Calculer la plus-value de ma vue » (écran résultat certifié)')
ON CONFLICT (nom) DO NOTHING;

COMMIT;
