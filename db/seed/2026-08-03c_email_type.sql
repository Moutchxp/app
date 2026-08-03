-- 2026-08-03c_email_type.sql — SEED de données (chantier S19) : NATURE des adresses e-mail déjà enregistrées. Requiert 067.
--
-- Pose email_type='urbanisme' sur les 9 communes du seed 2026-08-03_contacts_urbanisme.sql (adresses de SERVICE vérifiées),
-- et email_type='accueil' sur Flins-sur-Seine (78238) dont accueil@mairiedeflins.fr est manifestement un accueil général.
-- ⚠️ Ne touche AUCUNE autre commune : email_type reste NULL partout ailleurs (honnête : on ne sait pas).
--
-- EFFET : pose SEULEMENT email_type. N'écrase NI email, NI canal, NI rien d'autre. Journal append-only écrit comme
-- ecrireContact (e-mail INCHANGÉ). auteur = NULL (hors interface).
--
-- GARDES :
--   • email / canal / source / statut / adresse_postale / telephone / … ABSENTS du SET → jamais écrasés.
--   • Idempotence : marqueur `email_type IS DISTINCT FROM` la valeur cible → rejouer ne touche plus rien, aucun doublon de
--     journal. (« Le travail humain prime » : si un humain a posé une autre valeur, elle diffère → hélas re-posée ; mais ces
--     10 adresses sont vérifiées et la valeur est stable — pas de coalesce ici, la valeur EST la décision.)
--   • Journal + upsert pilotés par le MÊME ensemble `cible`. Aucun DELETE/ALTER. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), APRÈS 067, arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed/2026-08-03c_email_type.sql

BEGIN;

WITH seed(code_insee, email_type) AS (
  VALUES
    ('78646'::char(5), 'urbanisme'::text),  -- Versailles
    ('78322', 'urbanisme'),                 -- Jouy-en-Josas
    ('78575', 'urbanisme'),                 -- Saint-Rémy-lès-Chevreuse
    ('78571', 'urbanisme'),                 -- Saint-Nom-la-Bretèche
    ('78475', 'urbanisme'),                 -- Osmoy
    ('92004', 'urbanisme'),                 -- Asnières-sur-Seine
    ('93001', 'urbanisme'),                 -- Aubervilliers
    ('93063', 'urbanisme'),                 -- Romainville
    ('93015', 'urbanisme'),                 -- Coubron
    ('78238', 'accueil')                    -- Flins-sur-Seine (accueil@mairiedeflins.fr = accueil général)
),
cible AS (
  SELECT s.code_insee, s.email_type, mc.email
  FROM seed s
  JOIN commune com ON com.code_insee = s.code_insee                 -- garde-fou anti-orphelin (double la FK)
  JOIN mairie_contact mc ON mc.code_insee = s.code_insee            -- ne qualifie que des lignes de contact existantes
  WHERE mc.email_type IS DISTINCT FROM s.email_type
),
-- 1) Journal append-only (e-mail INCHANGÉ : email_avant = email_apres).
journal AS (
  INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
  SELECT c.code_insee, c.email, c.email, 'saisie_manuelle',
         'Nature de l''adresse e-mail qualifiée manuellement (recherche manuelle, 03/08/2026)', NULL
  FROM cible c
  RETURNING 1
)
-- 2) Upsert. ⚠️ SEUL email_type est dans le SET → rien d'autre n'est écrasé.
INSERT INTO mairie_contact (code_insee, email_type, maj_le)
SELECT code_insee, email_type, now() FROM cible
ON CONFLICT (code_insee) DO UPDATE SET email_type = EXCLUDED.email_type, maj_le = now();

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   -- (a) les 9 en 'urbanisme', Flins en 'accueil', e-mail intact :
--   SELECT code_insee, email_type, email FROM mairie_contact
--    WHERE code_insee IN ('78646','78322','78575','78571','78475','92004','93001','93063','93015','78238')
--    ORDER BY email_type, code_insee;
--   -- (b) email_type reste NULL ailleurs (honnête) :
--   SELECT count(*) FILTER (WHERE email_type IS NULL) AS nuls, count(*) AS total FROM mairie_contact;
--   -- (c) journal : 1 ligne par commune, aucun doublon si on rejoue :
--   SELECT code_insee, count(*) FROM mairie_contact_journal
--    WHERE motif = 'Nature de l''adresse e-mail qualifiée manuellement (recherche manuelle, 03/08/2026)'
--    GROUP BY code_insee ORDER BY code_insee;
