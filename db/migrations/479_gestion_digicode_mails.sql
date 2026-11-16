-- 479_gestion_digicode_mails.sql — 🔴🔴 LES MAILS DE CHANGEMENT DE DIGICODE ENTRENT DANS L'HISTORIQUE (Arno, 16/11/2026, chantier « Digicodes unifiés »,
-- lot 6).
--
-- LE BESOIN : quand un digicode change (« Modifier »), un mail nominatif part à chaque locataire en place (préavis compris, règle des 7 jours) et,
-- sur demande, un mail à chaque propriétaire (ses logements regroupés). Chaque mail doit être ENREGISTRÉ dans l'historique du bien, du locataire
-- (et du propriétaire) : le journal des mails de la Location (`gestion_location_mail_avis`, 457) ne connaît qu'une LISTE FERMÉE de sortes.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la liste autorisée S'ÉLARGIT de deux sortes — 'digicode_locataire', 'digicode_proprietaire' ; toutes les sortes
-- d'avant restent valides ; aucune ligne touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.
-- Suppose la 467. RECETTE SEULEMENT. ⚠️ Sans elle, l'envoi est refusé avant tout envoi (rien ne part sans pouvoir être enregistré).

ALTER TABLE gestion_location_mail_avis DROP CONSTRAINT IF EXISTS gestion_location_mail_avis_sorte_check;
ALTER TABLE gestion_location_mail_avis ADD CONSTRAINT gestion_location_mail_avis_sorte_check
  CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc', 'sortie_locataires',
    'previsite_alerte', 'previsite_invitation', 'previsite_reponse', 'previsite_locataires', 'previsite_locataires_modif',
    'previsite_invitation_cr', 'previsite_compte_rendu', 'previsite_refus', 'previsite_annulation',
    'sortie_edls_locataire', 'sortie_edls_proprietaire', 'sortie_edls_interne',
    'digicode_locataire', 'digicode_proprietaire'));
