-- 524_gestion_syndic_coordonnees_cabinet.sql — 🔴🔴 LES COORDONNÉES DU CABINET D'UN SYNDIC EN LISTE : téléphones et e-mails illimités, avec libellé
-- (décision d'Arno du 28/11/2026, « 1A », sur la demande de 14h00 : « on doit pouvoir tout modifier : adresse, mail, téléphone, ajouter des numéros et des mails »).
--
-- AVANT : la fiche d'un syndic ne portait que deux téléphones (gestion_syndic.telephone, telephone_2) et un seul e-mail (gestion_syndic.email), sans libellé.
-- CE QUE FAIT LA MIGRATION :
--   ① une table neuve, gestion_syndic_coordonnee_cabinet — une ligne par téléphone ou e-mail du cabinet (sorte, libellé, valeur, rang), sur le modèle de
--     gestion_syndic_coordonnee (celles des contacts) : une coordonnée qu'on enlève est RETIRÉE (retire_le), jamais effacée ;
--   ② les deux téléphones et l'e-mail actuels y sont RECOPIÉS, libellés « Standard » (téléphones) et « Contact » (e-mail), pour chaque syndic qui n'a
--     encore aucune ligne dans la table. RIEN n'est effacé ni supprimé : les colonnes telephone, telephone_2 et email restent, et l'application continue
--     de les tenir à jour (premier et second téléphones, premier e-mail de la liste) pour tout lecteur qui les lirait encore.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE : rejouable sans casse (IF NOT EXISTS ; la recopie ne concerne que
-- les syndics sans aucune ligne). Aucune garde « recette seulement ».
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans la table, la fiche lit et écrit les trois colonnes, comme avant.

CREATE TABLE IF NOT EXISTS gestion_syndic_coordonnee_cabinet (
  id bigserial PRIMARY KEY,
  syndic_id bigint NOT NULL REFERENCES gestion_syndic(id),
  sorte text NOT NULL CONSTRAINT gestion_syndic_coordonnee_cabinet_sorte_chk CHECK (sorte IN ('telephone', 'email')),
  libelle text,
  valeur text NOT NULL CONSTRAINT gestion_syndic_coordonnee_cabinet_valeur_chk CHECK (btrim(valeur) <> ''),
  rang integer NOT NULL DEFAULT 0,
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle text,
  retire_le timestamptz,
  retire_par_libelle text
);
COMMENT ON TABLE gestion_syndic_coordonnee_cabinet IS
  'Téléphones et e-mails du CABINET d''un syndic, en liste avec libellé (524, décision d''Arno du 28/11/2026). Retrait = retire_le, jamais d''effacement. Les colonnes gestion_syndic.telephone, telephone_2 et email restent tenues à jour par l''application (premières valeurs).';
CREATE INDEX IF NOT EXISTS gestion_syndic_coordonnee_cabinet_par_syndic
  ON gestion_syndic_coordonnee_cabinet (syndic_id, rang) WHERE retire_le IS NULL;

-- ② la recopie : seulement pour les syndics qui n'ont encore AUCUNE ligne (rejouable)
INSERT INTO gestion_syndic_coordonnee_cabinet (syndic_id, sorte, libelle, valeur, rang, cree_par_libelle)
SELECT x.syndic_id, x.sorte, x.libelle, x.valeur, x.rang, 'migration 524'
  FROM (
    SELECT s.id AS syndic_id, 'telephone' AS sorte, 'Standard' AS libelle, btrim(s.telephone) AS valeur, 0 AS rang FROM gestion_syndic s
     WHERE coalesce(btrim(s.telephone), '') <> ''
    UNION ALL
    SELECT s.id, 'telephone', 'Standard', btrim(s.telephone_2), 1 FROM gestion_syndic s WHERE coalesce(btrim(s.telephone_2), '') <> ''
    UNION ALL
    SELECT s.id, 'email', 'Contact', btrim(s.email), 2 FROM gestion_syndic s WHERE coalesce(btrim(s.email), '') <> ''
  ) x
 WHERE NOT EXISTS (SELECT 1 FROM gestion_syndic_coordonnee_cabinet c WHERE c.syndic_id = x.syndic_id);
