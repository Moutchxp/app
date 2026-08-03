-- 2026-08-03d_protocoles_lot2.sql — SEED de données (chantier S20) : 2e lot de coordonnées de services urbanisme,
-- VÉRIFIÉES sur les sites officiels (03/08/2026). Requiert les migrations 066 et 067.
--
-- RÈGLE (différente des seeds injoignables) : ces communes ont déjà une adresse PRÉSUMÉE (statut='presume',
-- source='annuaire'). On la REMPLACE par l'adresse vérifiée et on pose statut='confirme', source='saisie_manuelle'
-- (groupes A/B). ⚠️ « Le travail humain prime » : on ne touche JAMAIS une commune déjà statut='confirme' OU
-- source='saisie_manuelle' — elle est ignorée (voir requête (c) de vérification).
--
-- ⚠️ FORME : UPDATE … FROM cible, JAMAIS un INSERT … ON CONFLICT. Cause (bug corrigé le 03/08 matin) : PostgreSQL évalue
-- les CHECK sur le tuple candidat AVANT de résoudre le conflit → un ON CONFLICT partiel prendrait canal=DEFAULT 'email'
-- + email NULL et violerait mairie_contact_coherence_chk. Un UPDATE n'insère jamais ; une commune absente n'est pas jointe
-- → ignorée en silence. Même structure que 2026-08-03c_email_type.sql : journal comme ecrireContact, auteur NULL, une
-- seule instruction, idempotence par protocole_verifie_le, garde anti-orphelin par JOIN commune.
--
-- CODES VÉRIFIÉS EN BASE : 93059 (Pierrefitte-sur-Seine) N'EXISTE PAS dans `commune` (fusionnée dans Saint-Denis 93066)
-- → EXCLU. 21 communes importées.
--
-- Groupes A/B (source consultée fournie) : email vérifié + canal 'email' + confirme + saisie_manuelle + email_type +
--   telephone/standard/note + protocole_source (URL verbatim) + protocole_verifie_le = '2026-08-03'.
-- Groupe C (aucune adresse ET aucune source d'URL) : n'enrichit QUE telephone / telephone_standard / note. ⚠️ protocole_
--   verifie_le N'EST PAS posé (une date de vérification sans source consultable ne serait pas auditable — décision §3) ;
--   protocole_source reste NULL ; email, canal, statut, source, email_type INCHANGÉS.
-- IDEMPOTENCE DE CONTENU (pas par date) : seules les lignes dont au moins une colonne posée diffère sont mises à jour ;
--   journal écrit UNIQUEMENT si l'e-mail change (jamais de ligne à vide). Garde « travail humain prime » inchangé.
-- Application MANUELLE (Arno), APRÈS 066+067, arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed/2026-08-03d_protocoles_lot2.sql

BEGIN;

-- canal_cible = 'email' (groupes A/B → verrouille le canal) ; NULL (groupe C → canal inchangé).
-- email_type = 'urbanisme' (A) / 'accueil' (B) ; NULL (C). email = adresse vérifiée (A/B) ; NULL (C).
WITH seed(code_insee, email, canal_cible, email_type, tel, std, note, source) AS (
  VALUES
    -- ── GROUPE A : adresse vérifiée, service urbanisme ─────────────────────────────────────────────────────────────
    ('92023'::char(5), 'urba@clamart.fr'::text, 'email'::text, 'urbanisme'::text, '01 46 62 36 44'::text, '01 46 62 35 35'::text,
       'Reproductions confiées à un prestataire extérieur, frais à la charge du demandeur. RDV sous 10 jours ouvrés.'::text,
       'clamart.fr/fr/infos-demarches/autorisations-durbanisme'::text),
    ('92002', 'urbanisme@ville-antony.fr', 'email', 'urbanisme', '01 40 96 71 77', '01 40 96 71 00', NULL, 'ville-antony.fr/urbanisme'),
    ('93057', 'service.urbanisme@lespavillonssousbois.fr', 'email', 'urbanisme', '01 48 02 75 87', '01 48 02 75 75',
       'Pas d''accueil mardi ni jeudi.', 'les-pavillons-sous-bois.fr/formalites-administratives-et-procedures-durbanisme'),
    ('78586', 'urba@ville-sartrouville.fr', 'email', 'urbanisme', '01 30 86 39 00', '01 30 86 39 00', NULL,
       'sartrouville.fr/vivre-a-sartrouville/urbanisme/missions'),
    ('92044', 'urbanisme_administratif@ville-levallois.fr', 'email', 'urbanisme', '01 47 15 77 27', '01 49 68 30 00', NULL,
       'ville-levallois.fr/services/urbanisme'),
    ('92062', 'urbanisme@mairie-puteaux.fr', 'email', 'urbanisme', '01 46 92 92 26', '01 46 92 92 92',
       'Rendez-vous obligatoire.', 'puteaux.fr/vos-demarches/urbanisme'),
    ('92064', 'urbanisme@saintcloud.fr', 'email', 'urbanisme', '01 47 71 54 50', '01 47 71 53 00',
       'Manque d''instructeur signalé, permanences sur rendez-vous. Secteur ABF.', 'saintcloud.fr/urbanisme'),
    ('92024', 'urbanisme@ville-clichy.fr', 'email', 'urbanisme', '01 41 40 91 58', '01 47 15 30 00', NULL,
       'ville-clichy.fr/173-demarches-urbanisme-clichy.htm'),
    ('92048', 'contact.urbanisme@mairie-meudon.fr', 'email', 'urbanisme', '01 41 14 80 14', '01 41 14 80 00',
       'Consultation des dossiers DÉCIDÉS possible, sur rendez-vous. Fermé le jeudi.',
       'meudon.fr/mon-quotidien/urbanisme/regles-et-demarches-durbanisme'),
    ('92072', 'urbanisme@ville-sevres.fr', 'email', 'urbanisme', '01 41 14 10 72', '01 41 14 10 10',
       'Consultation d''un dossier décidé sur rendez-vous demandé par e-mail.', 'sevres.fr/services/service-de-lurbanisme'),
    ('93055', 'urbanisme@ville-pantin.fr', 'email', 'urbanisme', '01 49 15 41 80', '01 49 15 40 00', NULL,
       'pratique.pantin.fr/urbanisme/demolir-construire-transformer-ou-ravaler'),
    ('93031', 'urbanisme@epinay-sur-seine.fr', 'email', 'urbanisme', '01 49 71 99 62', '01 49 71 99 99',
       'Instruction mutualisée Plaine Commune.', 'plainecommune.fr/plui'),
    ('93027', 'Urbanisme.LACOURNEUVE@plainecommune.fr', 'email', 'urbanisme', '01 71 86 37 61', '01 49 92 60 00',
       'Instruction mutualisée Plaine Commune.', 'plainecommune.fr/plui'),
    ('78551', 'urbanisme@saintgermainenlaye.fr', 'email', 'urbanisme', NULL, '01 30 87 20 00',
       'Gère aussi l''ex-commune de Fourqueux (fusionnée au 1er janvier 2019).', 'saintgermainenlaye.fr'),
    -- ── GROUPE B : adresse vérifiée mais ACCUEIL GÉNÉRAL ───────────────────────────────────────────────────────────
    ('93051', 'accueil.01@ville-noisylegrand.fr', 'email', 'accueil', NULL, '01 45 92 75 75', NULL,
       'lannuaire.service-public.gouv.fr'),
    ('93047', 'contact@ville-montfermeil.fr', 'email', 'accueil', NULL, '01 41 70 70 70',
       'Archives municipales sur RDV : archives.doc@ville-montfermeil.fr, 01 41 70 79 01.', 'ville-montfermeil.fr'),
    -- ── GROUPE C : aucune adresse trouvée → enrichir SEULEMENT téléphone / standard / note / protocole ──────────────
    ('93007', NULL, NULL, NULL, '01 45 91 71 50', '01 45 91 70 70',
       'Service Droit des sols sur rendez-vous uniquement (lun/mer 14-17h, ven 9-12h).', NULL),
    ('92049', NULL, NULL, NULL, '01 46 12 73 00', '01 46 12 76 76',
       'Formulaire de contact uniquement. Service fermé le mardi après-midi.', NULL),
    ('93072', NULL, NULL, NULL, '01 71 86 38 32', '01 49 71 82 42',
       'Unité territoriale Plaine Commune, 1-3 rue d''Amiens.', NULL),
    ('93010', NULL, NULL, NULL, NULL, '01 48 50 53 00', 'Aucune adresse de service publiée.', NULL),
    ('92073', NULL, NULL, NULL, NULL, '01 41 18 19 20', 'Aucune adresse de service publiée.', NULL)
),
-- Valeurs AVANT (courantes) + valeurs CIBLES, par jointure sur la ligne de contact EXISTANTE. Garde « travail humain
-- prime » (inchangé). ⚠️ protocole_verifie_le n'est daté QUE si une source est fournie (groupes A/B) : dater le groupe C
-- (sans source consultable) donnerait une date de vérification non auditable — on ne le date donc PAS (décision, cf. §3).
cible AS (
  SELECT
    s.code_insee,
    -- avant (pour la comparaison de contenu et le journal) :
    mc.email AS email_av, mc.canal AS canal_av, mc.source AS source_av, mc.statut AS statut_av, mc.email_type AS email_type_av,
    mc.telephone AS telephone_av, mc.telephone_standard AS telephone_standard_av, mc.note AS note_av,
    mc.protocole_verifie_le AS protocole_verifie_le_av, mc.protocole_source AS protocole_source_av,
    -- cibles :
    coalesce(s.email, mc.email)                                             AS email,             -- A/B remplacent ; C garde
    coalesce(s.canal_cible, mc.canal, 'inconnu')                            AS canal,             -- A/B → 'email' ; C garde
    CASE WHEN s.canal_cible IS NOT NULL THEN 'saisie_manuelle' ELSE coalesce(mc.source, 'annuaire') END AS source,
    CASE WHEN s.canal_cible IS NOT NULL THEN 'confirme'        ELSE coalesce(mc.statut, 'presume') END AS statut,
    coalesce(s.email_type, mc.email_type)                                   AS email_type,        -- A/B posent ; C garde
    coalesce(mc.telephone, s.tel)                                           AS telephone,         -- fill-if-empty
    coalesce(mc.telephone_standard, s.std)                                 AS telephone_standard, -- fill-if-empty
    coalesce(mc.note, s.note)                                               AS note,              -- fill-if-empty
    CASE WHEN s.source IS NOT NULL THEN DATE '2026-08-03' ELSE mc.protocole_verifie_le END AS protocole_verifie_le, -- daté SSI source (A/B)
    coalesce(mc.protocole_source, s.source)                                AS protocole_source    -- fill-if-empty (NULL pour C)
  FROM seed s
  JOIN commune com ON com.code_insee = s.code_insee                         -- garde-fou anti-orphelin (double la FK)
  JOIN mairie_contact mc ON mc.code_insee = s.code_insee                    -- n'agit que sur des contacts EXISTANTS
  WHERE coalesce(mc.statut, 'presume') <> 'confirme'                        -- « travail humain prime » (INCHANGÉ)
    AND coalesce(mc.source, 'annuaire') <> 'saisie_manuelle'
),
-- IDEMPOTENCE DE CONTENU : on ne retient que les lignes dont AU MOINS UNE colonne posée diffère de la valeur courante.
-- Un rejeu à l'identique produit un n-uplet égal → 0 ligne, aucun journal. (Remplace le marqueur de date qui sautait en
-- silence toute ligne déjà estampillée du jour, même si le contenu différait.)
dirty AS (
  SELECT * FROM cible c
  WHERE (c.email, c.canal, c.source, c.statut, c.email_type, c.telephone, c.telephone_standard, c.note, c.protocole_verifie_le, c.protocole_source)
        IS DISTINCT FROM
        (c.email_av, c.canal_av, c.source_av, c.statut_av, c.email_type_av, c.telephone_av, c.telephone_standard_av, c.note_av, c.protocole_verifie_le_av, c.protocole_source_av)
),
-- 1) Journal append-only — UNIQUEMENT si l'e-mail change réellement (jamais une ligne à vide). Pour le groupe C
--    (téléphone/note seuls, e-mail inchangé) → aucune ligne de journal.
journal AS (
  INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
  SELECT d.code_insee, d.email_av, d.email, d.source,
         'Coordonnées du service urbanisme relevées et vérifiées sur le site officiel de la commune (recherche manuelle, 03/08/2026)', NULL
  FROM dirty d
  WHERE d.email_av IS DISTINCT FROM d.email
  RETURNING 1
)
-- 2) UPDATE (jamais d'INSERT). Pour le groupe C, email/canal/statut/source/email_type/protocole_verifie_le valent
--    l'existant → réécriture sans effet ; seuls téléphone/standard/note sont réellement posés.
UPDATE mairie_contact mc SET
  email = d.email, canal = d.canal, source = d.source, statut = d.statut, email_type = d.email_type,
  telephone = d.telephone, telephone_standard = d.telephone_standard, note = d.note,
  protocole_verifie_le = d.protocole_verifie_le, protocole_source = d.protocole_source, maj_le = now()
FROM dirty d
WHERE mc.code_insee = d.code_insee;

COMMIT;

-- NON IMPORTÉES (fiabilité « à vérifier », à traiter après vérification par Arno) : Neuilly-sur-Seine, Courbevoie,
-- Sceaux, Rosny-sous-Bois. Et 93059 Pierrefitte-sur-Seine EXCLUE (fusionnée dans Saint-Denis 93066, absente de `commune`).

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- (a) groupes A + B après application (canal='email', confirme/saisie_manuelle, email_type urbanisme|accueil) :
--   SELECT code_insee, email, canal, statut, source, email_type, telephone, protocole_verifie_le
--     FROM mairie_contact
--    WHERE code_insee IN ('92023','92002','93057','78586','92044','92062','92064','92024','92048','92072',
--                         '93055','93031','93027','78551','93051','93047')
--    ORDER BY email_type, code_insee;
--
--   -- (b) communes du périmètre ENCORE sans aucune adresse e-mail (contact ni PRADA) :
--   SELECT count(*) FROM commune c
--     LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
--     LEFT JOIN mairie_prada  mp ON mp.code_insee = c.code_insee
--    WHERE coalesce(btrim(mc.email), '') = '' AND coalesce(btrim(mp.courriel), '') = '';
--
--   -- (c) communes du seed IGNORÉES parce que déjà confirmées/saisies à la main (travail humain antérieur) :
--   SELECT mc.code_insee, mc.statut, mc.source
--     FROM mairie_contact mc
--    WHERE mc.code_insee IN ('92023','92002','93057','78586','92044','92062','92064','92024','92048','92072',
--                            '93055','93031','93027','78551','93051','93047',
--                            '93007','92049','93072','93010','92073')
--      AND (mc.statut = 'confirme' OR mc.source = 'saisie_manuelle');  -- humaines → écartées par le garde
--
--   -- (d) communes du seed qui n'ont RIEN reçu, avec le MOTIF (à lancer À LA MAIN, de préférence AVANT application) :
--   --     'absente' = code hors table commune (jamais de contact, ex. 93059) ;
--   --     'humaine' = déjà confirme/saisie_manuelle → écartée par le garde « travail humain prime ».
--   --   Le 3e motif possible, 'identique' (toutes les valeurs cibles = valeurs courantes → aucune écriture par idempotence
--   --   de contenu), ne se distingue qu'en rejouant : sur cette base, aucune des 21 communes présentes n'est 'identique'
--   --   (toutes presume/annuaire, protocole NULL, téléphone NULL). Une commune ni 'absente' ni 'humaine' ci-dessous a donc
--   --   bien été mise à jour.
--   WITH liste(code) AS (VALUES
--     ('92023'),('92002'),('93057'),('78586'),('92044'),('92062'),('92064'),('92024'),('92048'),('92072'),
--     ('93055'),('93031'),('93027'),('78551'),('93051'),('93047'),
--     ('93007'),('92049'),('93072'),('93059'),('93010'),('92073'))
--   SELECT l.code,
--          CASE WHEN mc.code_insee IS NULL THEN 'absente' ELSE 'humaine' END AS motif_ignoree
--     FROM liste l
--     LEFT JOIN mairie_contact mc ON mc.code_insee = l.code
--    WHERE mc.code_insee IS NULL
--       OR mc.statut = 'confirme' OR mc.source = 'saisie_manuelle'
--    ORDER BY motif_ignoree, l.code;
