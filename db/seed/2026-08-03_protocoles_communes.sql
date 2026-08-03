-- 2026-08-03_protocoles_communes.sql — SEED de données (chantier S18) : protocoles de consultation des dossiers
-- d'urbanisme, relevés MANUELLEMENT sur les sites officiels des communes (03/08/2026). Requiert la migration 066.
--
-- ⚠️ CODES VÉRIFIÉS EN BASE : 78074 (Boinvilliers) et 78279 (Goupillières) N'EXISTENT PAS dans `commune` → EXCLUS de ce
-- seed (jamais de ligne orpheline). 18 communes importées.
--
-- EFFET : ENRICHIT des colonnes (telephone / responsable_nom / url_formulaire / note / protocole_verifie_le) SANS jamais
-- écraser un e-mail existant, et NE change le canal QUE pour les 2 communes à téléservice (Paris, Montreuil). Journal
-- append-only écrit comme ecrireContact (email_avant→email_apres, ici e-mail INCHANGÉ). auteur = NULL (hors interface).
--
-- GARDES :
--   • L'e-mail n'est JAMAIS dans le SET du DO UPDATE → jamais écrasé (les 9 communes déjà en saisie_manuelle du seed
--     précédent sont bien enrichies, sans perdre leur adresse).
--   • « Le travail humain prime » + idempotence : enrichissement en fill-if-empty (coalesce) → une valeur saisie à la main
--     est conservée ; et `protocole_verifie_le = '2026-08-03'` sert de marqueur « déjà appliqué » (WHERE ... IS DISTINCT
--     FROM) → rejouer ne touche plus rien, aucun doublon de journal.
--   • Canal changé UNIQUEMENT pour Paris et Montreuil (→ 'formulaire', statut 'confirme' pour que la décision prime).
--   • Journal + upsert pilotés par le MÊME ensemble `cible` (CTE, snapshot unique). Aucun DELETE/ALTER. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), APRÈS 066, arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed/2026-08-03_protocoles_communes.sql

BEGIN;

WITH seed(code_insee, canal_cible, url, tel, resp, note) AS (
  VALUES
    ('75056'::char(5), 'formulaire'::text, 'https://adsconsult.paris.fr/'::text, NULL::text, NULL::text,
       'Consult''ADS, compte MonParis + FranceConnect obligatoire. PRADA Charles Chenel, daj-cada@paris.fr. Ancienne adresse courrier BASU conservée.'::text),
    ('93048', 'formulaire', 'https://formulaires.demarches.montreuil.fr/formulaires-masques/demande-de-consultation-de-dossier-d-autorisation-d-urbanisme/', '01 48 70 69 26', NULL,
       'Consultation sur place, photos autorisées, reproductions par correspondance refusées. Dossiers antérieurs à 2001 aux Archives municipales.'),
    ('92035', NULL, NULL, '01 72 42 45 33', 'Frédéric Delvigne', NULL),
    ('92025', NULL, NULL, '01 70 72 18 96', NULL, 'Demandes de copie par courrier uniquement : Mairie de Colombes, Service Droit des Sols, Place de la République.'),
    ('93001', NULL, NULL, '01 48 39 52 80', NULL, NULL),
    ('78646', NULL, NULL, '01 30 97 82 05', NULL, 'Consultation des dossiers délivrés possible, photocopies à la charge du demandeur.'),
    ('92036', NULL, NULL, '01 40 85 63 27', NULL, 'Consultation d''un permis sur rendez-vous.'),
    ('93073', NULL, NULL, '01 49 63 71 35', NULL, NULL),
    ('78172', NULL, NULL, '01 34 90 85 20', NULL, NULL),
    ('92063', NULL, NULL, '01 47 32 65 80', NULL, NULL),
    ('92004', NULL, NULL, '01 41 11 15 40', NULL, NULL),
    ('93063', NULL, NULL, '01 49 20 93 60', NULL, NULL),
    ('93015', NULL, NULL, '01 43 88 80 25', NULL, NULL),
    ('78575', NULL, NULL, '01 30 47 05 15', 'Roxane Mercier', NULL),
    ('78571', NULL, NULL, '01 30 80 07 04', NULL, 'Instruction mutualisée CC Gally Mauldre, 01 30 55 12 69.'),
    ('78322', NULL, NULL, '01 39 20 10 56', 'Christophe Hascoët', NULL),
    ('78475', NULL, NULL, '01 34 87 23 67', NULL, NULL),
    ('93013', NULL, NULL, '01 48 38 82 82', NULL, NULL)
),
-- État FINAL désiré par commune (join mc → valeurs actuelles ; coalesce = fill-if-empty ; e-mail conservé). Le garde
-- d'idempotence (protocole_verifie_le déjà à la date cible) exclut les lignes déjà traitées.
cible AS (
  SELECT
    s.code_insee,
    mc.email                                                          AS email,           -- INCHANGÉ, jamais écrasé
    CASE WHEN s.canal_cible IS NOT NULL THEN 'saisie_manuelle' ELSE coalesce(mc.source, 'annuaire') END AS source,
    CASE WHEN s.canal_cible IS NOT NULL THEN 'confirme'        ELSE coalesce(mc.statut, 'presume') END AS statut,
    coalesce(s.canal_cible, mc.canal, 'inconnu')                      AS canal,           -- changé UNIQUEMENT pour les 2
    coalesce(mc.url_formulaire, s.url)                                AS url_formulaire,  -- complété si vide
    mc.adresse_postale                                               AS adresse_postale, -- INCHANGÉE (ex. BASU de Paris)
    coalesce(mc.note, s.note)                                         AS note,            -- complétée si vide
    coalesce(mc.telephone, s.tel)                                     AS telephone,       -- complété si vide
    coalesce(mc.responsable_nom, s.resp)                             AS responsable_nom,  -- complété si vide
    mc.protocole_source                                              AS protocole_source
  FROM seed s
  JOIN commune com ON com.code_insee = s.code_insee                   -- garde-fou anti-orphelin (double la FK)
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
-- 2) Upsert. ⚠️ email / adresse_postale / protocole_source ABSENTS du SET → JAMAIS écrasés.
INSERT INTO mairie_contact (code_insee, email, source, statut, canal, url_formulaire, adresse_postale, note, telephone, responsable_nom, protocole_verifie_le, protocole_source, maj_le)
SELECT code_insee, email, source, statut, canal, url_formulaire, adresse_postale, note, telephone, responsable_nom, DATE '2026-08-03', protocole_source, now()
FROM cible
ON CONFLICT (code_insee) DO UPDATE SET
  source = EXCLUDED.source, statut = EXCLUDED.statut, canal = EXCLUDED.canal,
  url_formulaire = EXCLUDED.url_formulaire, note = EXCLUDED.note,
  telephone = EXCLUDED.telephone, responsable_nom = EXCLUDED.responsable_nom,
  protocole_verifie_le = EXCLUDED.protocole_verifie_le, maj_le = now();

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- (a) les 18 communes enrichies (Paris/Montreuil doivent être en canal 'formulaire' + url_formulaire) :
--   SELECT code_insee, canal, telephone, responsable_nom, protocole_verifie_le, left(url_formulaire, 40) AS url
--     FROM mairie_contact
--    WHERE code_insee IN ('75056','93048','92035','92025','93001','78646','92036','93073','78172','92063',
--                         '92004','93063','93015','78575','78571','78322','78475','93013')
--    ORDER BY code_insee;
--
--   -- (b) aucun e-mail écrasé : les adresses des communes déjà pourvues sont intactes (compare avant/après si besoin) :
--   SELECT code_insee, email FROM mairie_contact
--    WHERE code_insee IN ('78646','78322','78475','78571','78575','92004','93001','93063','93015','92035','92036','92063','78172')
--    ORDER BY code_insee;
--
--   -- (c) journal : exactement 1 ligne par commune traitée (aucun doublon si on rejoue) :
--   SELECT code_insee, count(*) AS n FROM mairie_contact_journal
--    WHERE motif = 'Protocole du service urbanisme relevé et vérifié sur le site officiel de la commune (recherche manuelle, 03/08/2026)'
--    GROUP BY code_insee ORDER BY code_insee;
