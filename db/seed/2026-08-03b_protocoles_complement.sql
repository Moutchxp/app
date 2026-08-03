-- 2026-08-03b_protocoles_complement.sql — COMPLÉMENT du seed protocoles (chantier S18). Les 2 communes exclues du seed
-- précédent l'étaient à cause d'un code INSEE erroné ; codes RÉELS vérifiés en base : Goupillières = 78278 (au lieu de
-- 78279), Boinvilliers = 78072 (au lieu de 78074). Requiert la migration 066. Mêmes structure/journal/gardes/idempotence
-- que 2026-08-03_protocoles_communes.sql.
--
-- ⚠️ CODES VÉRIFIÉS EN BASE : 78278 et 78072 existent bien dans `commune` (contrairement à 78279 / 78074).
--
-- EFFET : ENRICHIT telephone / note / protocole_verifie_le SANS écraser l'e-mail NI le canal (ces 2 communes restent en
-- 'inconnu'). Journal append-only comme ecrireContact (e-mail INCHANGÉ). auteur = NULL (hors interface).
--
-- GARDES :
--   • email / canal / source / statut / adresse_postale / protocole_source ABSENTS du SET → jamais écrasés (canal reste 'inconnu').
--   • Idempotence + « travail humain prime » : enrichissement fill-if-empty (coalesce) ; protocole_verifie_le = '2026-08-03'
--     sert de marqueur « déjà appliqué » (WHERE ... IS DISTINCT FROM) → rejouer ne touche plus rien, aucun doublon de journal.
--   • Journal + upsert pilotés par le MÊME ensemble `cible`. Aucun DELETE/ALTER. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), APRÈS 066, arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed/2026-08-03b_protocoles_complement.sql

BEGIN;

WITH seed(code_insee, tel, note) AS (
  VALUES
    ('78278'::char(5), '01 34 87 41 07'::text,
       'Aucune adresse e-mail publiée, formulaire de contact générique uniquement. CC Cœur d''Yvelines.'::text),
    ('78072', '01 34 76 30 94',
       'Aucune adresse e-mail publiée, formulaire de contact générique uniquement. CC du Pays Houdanais.')
),
-- État FINAL désiré (join mc → valeurs actuelles ; coalesce = fill-if-empty ; e-mail ET canal conservés). Le garde
-- d'idempotence exclut les lignes déjà traitées.
cible AS (
  SELECT
    s.code_insee,
    mc.email                                     AS email,          -- INCHANGÉ
    coalesce(mc.source, 'annuaire')              AS source,         -- INCHANGÉ (jamais 'confirme' ici)
    coalesce(mc.statut, 'presume')               AS statut,         -- INCHANGÉ
    coalesce(mc.canal, 'inconnu')                AS canal,          -- INCHANGÉ : reste 'inconnu'
    mc.url_formulaire                            AS url_formulaire, -- INCHANGÉE
    mc.adresse_postale                           AS adresse_postale,-- INCHANGÉE
    coalesce(mc.note, s.note)                    AS note,           -- complétée si vide
    coalesce(mc.telephone, s.tel)                AS telephone,      -- complété si vide
    mc.responsable_nom                           AS responsable_nom,-- INCHANGÉ
    mc.protocole_source                          AS protocole_source
  FROM seed s
  JOIN commune com ON com.code_insee = s.code_insee                 -- garde-fou anti-orphelin (double la FK)
  LEFT JOIN mairie_contact mc ON mc.code_insee = s.code_insee
  WHERE mc.protocole_verifie_le IS DISTINCT FROM DATE '2026-08-03'
),
-- 1) Journal append-only (e-mail INCHANGÉ : email_avant = email_apres), même mécanique qu'ecrireContact.
journal AS (
  INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
  SELECT c.code_insee, c.email, c.email, c.source,
         'Protocole du service urbanisme relevé et vérifié sur le site officiel de la commune (recherche manuelle, 03/08/2026)', NULL
  FROM cible c
  RETURNING 1
)
-- 2) Upsert. ⚠️ email / canal / source / statut / adresse_postale / protocole_source ABSENTS du SET → JAMAIS écrasés.
INSERT INTO mairie_contact (code_insee, email, source, statut, canal, url_formulaire, adresse_postale, note, telephone, responsable_nom, protocole_verifie_le, protocole_source, maj_le)
SELECT code_insee, email, source, statut, canal, url_formulaire, adresse_postale, note, telephone, responsable_nom, DATE '2026-08-03', protocole_source, now()
FROM cible
ON CONFLICT (code_insee) DO UPDATE SET
  note = EXCLUDED.note, telephone = EXCLUDED.telephone,
  protocole_verifie_le = EXCLUDED.protocole_verifie_le, maj_le = now();

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- (a) les 2 communes : canal RESTE 'inconnu', telephone + note + date renseignés, e-mail toujours vide :
--   SELECT code_insee, canal, telephone, protocole_verifie_le, coalesce(email,'(vide)') AS email
--     FROM mairie_contact WHERE code_insee IN ('78278','78072') ORDER BY code_insee;
--
--   -- (b) journal : exactement 1 ligne par commune (aucun doublon si on rejoue) :
--   SELECT code_insee, count(*) AS n FROM mairie_contact_journal
--    WHERE code_insee IN ('78278','78072')
--      AND motif = 'Protocole du service urbanisme relevé et vérifié sur le site officiel de la commune (recherche manuelle, 03/08/2026)'
--    GROUP BY code_insee ORDER BY code_insee;
