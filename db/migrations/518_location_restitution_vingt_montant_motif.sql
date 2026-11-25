-- 518_location_restitution_vingt_montant_motif.sql — 🔴 LA FENÊTRE « FAIRE RESTITUTION » RETRAVAILLÉE (Arno, 25/11/2026, 22h06).
--
-- LE BESOIN (demande d'Arno du 25/11/2026) : « Montants : « 20 % retenus » prérempli, « Montant restitué » (prérempli = 20 %), différence calculée. Si
-- différence ≠ 0 : zone « Motif de la différence » OBLIGATOIRE » ; un mail par locataire et par partenaire, visibles dans les échanges de la ligne.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   1. gestion_location_restitution_vingt (513, en ajout seul) reçoit deux colonnes facultatives : `montant_vingt` (les 20 % retenus au moment de la
--      restitution) et `motif_difference` (le motif, quand le restitué est inférieur aux 20 %). Les lignes existantes gardent NULL : rien n'est modifié.
--   2. gestion_location_mail_vingt (515) admet deux modèles de plus : « restitution_locataire » et « restitution_partenaire » (les mails partis de la
--      fenêtre de restitution, comptés et montrés dans les échanges de la ligne comme les autres).
-- Aucune donnée existante touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE : rejouable.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la restitution s'enregistre comme avant (montants, commentaire) et le motif de la différence est
-- ajouté au commentaire ; les mails de la fenêtre partent, sans être comptés dans les échanges de la ligne.

ALTER TABLE gestion_location_restitution_vingt ADD COLUMN IF NOT EXISTS montant_vingt numeric(12, 2) NULL;
ALTER TABLE gestion_location_restitution_vingt ADD COLUMN IF NOT EXISTS motif_difference text NULL;
ALTER TABLE gestion_location_restitution_vingt DROP CONSTRAINT IF EXISTS gestion_location_restitution_vingt_montant_vingt_check;
ALTER TABLE gestion_location_restitution_vingt ADD CONSTRAINT gestion_location_restitution_vingt_montant_vingt_check CHECK (montant_vingt IS NULL OR montant_vingt >= 0);
ALTER TABLE gestion_location_restitution_vingt DROP CONSTRAINT IF EXISTS gestion_location_restitution_vingt_motif_difference_check;
ALTER TABLE gestion_location_restitution_vingt ADD CONSTRAINT gestion_location_restitution_vingt_motif_difference_check
  CHECK (motif_difference IS NULL OR (btrim(motif_difference) <> '' AND char_length(motif_difference) <= 500));

ALTER TABLE gestion_location_mail_vingt DROP CONSTRAINT IF EXISTS gestion_location_mail_vingt_modele_check;
ALTER TABLE gestion_location_mail_vingt ADD CONSTRAINT gestion_location_mail_vingt_modele_check
  CHECK (modele IS NULL OR modele IN ('syndic', 'proprietaire', 'syndic_copie', 'locataire', 'restitution_locataire', 'restitution_partenaire'));
