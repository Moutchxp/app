-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 341 — LOT PROFIL-GESTION-ET-ROUGE-PROPRIETAIRE : « APPARTIENT AU SERVICE GESTION », CASE EXPLICITE SUR LE COMPTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DÉCISION D'ARNO (11/10/2026, option 3 du lot OBJET-CARTOUCHE-NOM-SELON-PROFIL-GESTION) : une AFFECTATION explicite au
-- service gestion, distincte de l'accès à la tuile Gestion et du droit d'envoi. Un compte coché écrit dans son cadre
-- habituel : l'objet du mail pré-rempli porte son nom SANS cartouche d'alerte. Non coché : le cartouche rouge rappelle
-- qu'on écrit au nom de la gestion.
--
-- 🔒 CETTE CASE NE DONNE AUCUN DROIT : elle ne change ni l'accès à la tuile Gestion, ni le droit d'envoi, et aucune
-- garde ne la lit.
--
-- CE QUE POSE CETTE MIGRATION (AJOUT, AUCUNE PERTE) :
--   ① la colonne `service_gestion`, FAUSSE pour tous les comptes : aucun compte n'est coché ici, Arno coche lui-même ;
--   ② l'action `changement_service_gestion` admise au journal des comptes (`admin_utilisateur_log`) : chaque changement
--      y est écrit avec sa date, son auteur, l'avant et l'après.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS service_gestion boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN admin_utilisateur.service_gestion IS
  'Appartient au service gestion (lot PROFIL-GESTION, 341). Aucun droit : seulement l''absence de cartouche d''alerte sur le nom dans l''objet des mails pré-remplis.';

ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check CHECK (action = ANY (ARRAY[
  'creation', 'desactivation', 'reactivation', 'changement_role', 'changement_permissions',
  'reinitialisation_mot_de_passe', 'changement_mot_de_passe', 'changement_identite',
  'changement_service_gestion'
]::text[]));

COMMIT;
