-- 453_fonctions_datees_activite_principale.sql — MON ESPACE « LES COÛTS », D35 (Arno, 03/11/2026) : LES FONCTIONS DATÉES, L'ACTIVITÉ PRINCIPALE
-- (SALAIRE), LE SALAIRE RATTACHÉ AU COLLABORATEUR.
--
-- LE BESOIN : un collaborateur change d'activité à une date ; son salaire chargé reste UN montant par collaborateur et par mois, et sa répartition
-- entre activités se CALCULE depuis l'historique de son « activité principale » (option C d'Arno : une seule activité porte 100 % du salaire ;
-- prorata en jours calendaires le mois du changement). Les autres fonctions cochées ne portent aucune part du salaire.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `admin_compte_fonction` : « À compter du » (`depuis`, NULL = depuis toujours) et la fin d'une fonction décochée (`jusqua`, exclue) — une
--     fonction décochée n'est plus retirée (`retire_le` reste pour une correction) : elle s'arrête à sa date ; une seule période ouverte par fonction ;
--   · `admin_compte_activite_principale` : l'activité principale (salaire) d'un profil, par version datée (`depuis`, NULL = depuis toujours), jamais
--     effacée (`retire_le`) ; PRÉ-REMPLIE : un profil à une seule fonction → elle ; Jean-Baptiste PONS (compte 5) → Location (décision d'Arno) ;
--   · `transaction_cout_ligne` : un salaire n'a plus de famille enregistrée (elle se calcule) — `famille` devient facultative pour les salaires ;
--     un salarié UNE fois par mois (et par structure). Les lignes de salaire existantes perdent leur famille enregistrée (au 03/11/2026 : aucune).
-- AUCUNE donnée n'est effacée. IDEMPOTENTE. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1).
-- Suppose la 451.

ALTER TABLE admin_compte_fonction ADD COLUMN IF NOT EXISTS depuis date;
ALTER TABLE admin_compte_fonction ADD COLUMN IF NOT EXISTS jusqua date;
DROP INDEX IF EXISTS admin_compte_fonction_vivante_idx;
CREATE UNIQUE INDEX IF NOT EXISTS admin_compte_fonction_ouverte_idx ON admin_compte_fonction (compte_id, fonction) WHERE retire_le IS NULL AND jusqua IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_compte_fonction_periode') THEN
    ALTER TABLE admin_compte_fonction ADD CONSTRAINT admin_compte_fonction_periode CHECK (depuis IS NULL OR jusqua IS NULL OR depuis < jusqua);
  END IF;
END $$;
COMMENT ON COLUMN admin_compte_fonction.depuis IS 'D35 (453) — la fonction vaut à compter de cette date ; NULL : depuis toujours.';
COMMENT ON COLUMN admin_compte_fonction.jusqua IS 'D35 (453) — la fonction décochée s''arrête à cette date (exclue) ; NULL : en cours.';

CREATE TABLE IF NOT EXISTS admin_compte_activite_principale (
  id                  bigserial    PRIMARY KEY,
  compte_id           bigint       NOT NULL REFERENCES admin_utilisateur(id),
  activite            text         NOT NULL CHECK (activite IN ('vente', 'location', 'gestion')),
  depuis              date,
  origine             text         NOT NULL DEFAULT 'saisie' CHECK (origine IN ('saisie', 'deduite')),
  pose_le             timestamptz  NOT NULL DEFAULT now(),
  pose_par_libelle    text,
  retire_le           timestamptz,
  retire_par_libelle  text
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_compte_activite_principale_version_idx
  ON admin_compte_activite_principale (compte_id, coalesce(depuis, DATE '0001-01-01')) WHERE retire_le IS NULL;
COMMENT ON TABLE admin_compte_activite_principale IS
  'D35 (453) — l''activité principale (salaire) d''un profil, par version datée (depuis ; NULL : depuis toujours) : elle porte 100 % du salaire chargé ; jamais effacée (retire_le).';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'admin_compte_activite_principale_sans_effacement') THEN
    CREATE TRIGGER admin_compte_activite_principale_sans_effacement BEFORE DELETE ON admin_compte_activite_principale FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
END $$;

-- Le pré-remplissage, une seule fois (un profil qui a déjà une activité principale n'est pas touché) : depuis toujours, origine « déduite ».
INSERT INTO admin_compte_activite_principale (compte_id, activite, depuis, origine, pose_par_libelle)
SELECT f.compte_id, min(f.fonction), NULL, 'deduite', 'migration 453'
  FROM admin_compte_fonction f
 WHERE f.retire_le IS NULL AND f.jusqua IS NULL
   AND NOT EXISTS (SELECT 1 FROM admin_compte_activite_principale p WHERE p.compte_id = f.compte_id AND p.retire_le IS NULL)
 GROUP BY f.compte_id
HAVING count(*) = 1;
-- Décision d'Arno (03/11/2026) : Jean-Baptiste PONS → Location depuis toujours (sa fonction Vente reste cochée, sans part de salaire)
INSERT INTO admin_compte_activite_principale (compte_id, activite, depuis, origine, pose_par_libelle)
SELECT u.id, 'location', NULL, 'saisie', 'migration 453 (décision d''Arno du 03/11/2026)'
  FROM admin_utilisateur u
 WHERE u.id = 5 AND upper(u.nom) = 'PONS'
   AND EXISTS (SELECT 1 FROM admin_compte_fonction f WHERE f.compte_id = u.id AND f.fonction = 'location' AND f.retire_le IS NULL)
   AND NOT EXISTS (SELECT 1 FROM admin_compte_activite_principale p WHERE p.compte_id = u.id AND p.retire_le IS NULL);

-- Le salaire rattaché au collaborateur : la famille d'un salaire se calcule (l'historique de l'activité principale)
ALTER TABLE transaction_cout_ligne ALTER COLUMN famille DROP NOT NULL;
ALTER TABLE transaction_cout_ligne DROP CONSTRAINT IF EXISTS transaction_cout_ligne_famille_check;
-- « Autres » : une famille, toujours ; un salaire : aucune (calculée) — une ligne RETIRÉE garde la sienne (l'historique ne change pas)
ALTER TABLE transaction_cout_ligne ADD CONSTRAINT transaction_cout_ligne_famille_check
  CHECK ((poste = 'salaires' AND (famille IS NULL OR retire_le IS NOT NULL) AND (famille IS NULL OR famille IN ('vente', 'location', 'gestion')))
      OR (poste = 'autres' AND famille IN ('vente', 'location', 'gestion')))
  NOT VALID;
UPDATE transaction_cout_ligne SET famille = NULL WHERE poste = 'salaires' AND famille IS NOT NULL AND retire_le IS NULL;
ALTER TABLE transaction_cout_ligne VALIDATE CONSTRAINT transaction_cout_ligne_famille_check;
DROP INDEX IF EXISTS transaction_cout_ligne_un_salaire_idx;
CREATE UNIQUE INDEX IF NOT EXISTS transaction_cout_ligne_un_salaire_mois_idx
  ON transaction_cout_ligne (annee, mois, compte_id) WHERE poste = 'salaires' AND retire_le IS NULL;
