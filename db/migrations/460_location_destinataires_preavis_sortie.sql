-- 460_location_destinataires_preavis_sortie.sql — LOCATION (Arno, 05/11/2026) : LES DESTINATAIRES DES MAILS DE PRÉAVIS ET DE SORTIE.
--
-- LE BESOIN (Arno) : « Paramètres Location » a une liste de destinataires pour le mail « Nouvelle location » ; les mails d'information du
-- PRÉAVIS et de la SORTIE partaient à une adresse écrite dans le code (ADHOC). Désormais TROIS listes, chacune réglable dans son onglet ;
-- plus aucune adresse partenaire dans le code.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la table des listes (395, versions en ajout seul) reçoit une colonne `sorte` ('nouvelle_location',
-- 'preavis', 'sortie') — les lignes existantes valent 'nouvelle_location' (la liste d'aujourd'hui, inchangée) ; puis l'amorce des deux
-- nouvelles listes avec ADHOC (gestion.criterimmo@gmail.com), pour garder le comportement actuel. Aucune ligne existante modifiée.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Prérequis : 395.

ALTER TABLE gestion_location_mail_destinataires ADD COLUMN IF NOT EXISTS sorte text NOT NULL DEFAULT 'nouvelle_location';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_mail_destinataires_sorte_check') THEN
    ALTER TABLE gestion_location_mail_destinataires ADD CONSTRAINT gestion_location_mail_destinataires_sorte_check
      CHECK (sorte IN ('nouvelle_location', 'preavis', 'sortie'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS gestion_location_mail_destinataires_sorte ON gestion_location_mail_destinataires (sorte, id DESC);

INSERT INTO gestion_location_mail_destinataires (liste, sorte, saisi_par_libelle)
SELECT '[{"adresse": "gestion.criterimmo@gmail.com", "libelle": "ADHOC"}]'::jsonb, 'preavis', 'migration 460'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_mail_destinataires WHERE sorte = 'preavis');
INSERT INTO gestion_location_mail_destinataires (liste, sorte, saisi_par_libelle)
SELECT '[{"adresse": "gestion.criterimmo@gmail.com", "libelle": "ADHOC"}]'::jsonb, 'sortie', 'migration 460'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_mail_destinataires WHERE sorte = 'sortie');

COMMENT ON COLUMN gestion_location_mail_destinataires.sorte IS
  'La liste : nouvelle_location (bouton « Envoi ADHOC & MONGA »), preavis, sortie (mails d''information aux partenaires) — migration 460.';
