-- 2026-08-03_contacts_urbanisme.sql — SEED de données (chantier S16, suite) : 9 adresses e-mail de service urbanisme
-- relevées MANUELLEMENT sur les sites officiels des communes (03/08/2026). Ces communes étaient sans aucune adresse
-- (mairie_contact.email vide, canal 'inconnu', statut 'presume').
--
-- EFFET par ligne = STRICTEMENT celui de la route PATCH /api/admin/permis/contact (ecrireContact, mairieContact.ts:120-145) :
--   canal='email', email=<adresse>, source='saisie_manuelle', statut='confirme', maj_le=now(), note=NULL, PLUS une entrée
--   append-only dans mairie_contact_journal (email_avant→email_apres). auteur = NULL (écriture HORS interface ; la colonne
--   est nullable, cf. 050:45 « NULL/'import' (automatique) ») — on n'invente aucun identifiant d'administrateur.
--
-- GARDES :
--   • « Le travail humain prime » : on n'écrase JAMAIS une commune déjà statut='confirme' OU source='saisie_manuelle'
--     (une telle ligne est IGNORÉE, jamais remplacée).
--   • Idempotent : la cible étant source='saisie_manuelle', un 2e passage retombe dans le garde → aucune ligne écrite,
--     aucun doublon de journal.
--   • Uniquement ces 9 code_insee. Aucun DELETE, aucun ALTER. Un seul BEGIN/COMMIT.
--
-- Journal + upsert sont pilotés par le MÊME ensemble `cible` (CTE modifiant les données, snapshot unique) → journal et
-- registre couvrent exactement les mêmes lignes. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed/2026-08-03_contacts_urbanisme.sql

BEGIN;

WITH seed(code_insee, email) AS (
  VALUES
    ('78646'::char(5), 'service.urbanisme@versailles.fr'::text),      -- Versailles
    ('78322'::char(5), 'urbanisme@jouy-en-josas.fr'::text),           -- Jouy-en-Josas
    ('78575'::char(5), 'urba@ville-st-remy-chevreuse.fr'::text),      -- Saint-Rémy-lès-Chevreuse
    ('78571'::char(5), 'urbanisme@mairiesnlb.fr'::text),              -- Saint-Nom-la-Bretèche
    ('78475'::char(5), 'mairie@osmoy78.eu'::text),                    -- Osmoy
    ('92004'::char(5), 'urba@mairieasnieres.fr'::text),               -- Asnières-sur-Seine
    ('93001'::char(5), 'urba-reglementaire@mairie-aubervilliers.fr'::text), -- Aubervilliers
    ('93063'::char(5), 'amenagement@ville-romainville.fr'::text),     -- Romainville
    ('93015'::char(5), 'urbanisme@coubron.fr'::text)                  -- Coubron
),
-- Cibles ÉLIGIBLES : ces 9 codes dont le contact courant N'EST PAS protégé (humain). coalesce → une commune sans ligne de
-- contact serait éligible aussi (ici les 9 ont une ligne 'annuaire/presume', mais on reste robuste via LEFT JOIN).
cible AS (
  SELECT s.code_insee, s.email AS email_apres, mc.email AS email_avant
  FROM seed s
  LEFT JOIN mairie_contact mc ON mc.code_insee = s.code_insee
  WHERE coalesce(mc.statut, 'presume') <> 'confirme'
    AND coalesce(mc.source, 'annuaire') <> 'saisie_manuelle'
),
-- 1) Journal APPEND-ONLY (email_avant→email_apres), pour chaque cible éligible.
journal AS (
  INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
  SELECT code_insee, email_avant, email_apres, 'saisie_manuelle',
         'Adresse du service urbanisme relevée sur le site officiel de la commune (recherche manuelle, 03/08/2026)', NULL
  FROM cible
  RETURNING 1
)
-- 2) Upsert du registre (canal='email', confirmé, saisie_manuelle) — MÊME jeu de colonnes/valeurs qu'ecrireContact.
INSERT INTO mairie_contact (code_insee, email, source, statut, canal, url_formulaire, adresse_postale, maj_le, note)
SELECT code_insee, email_apres, 'saisie_manuelle', 'confirme', 'email', NULL, NULL, now(), NULL
FROM cible
ON CONFLICT (code_insee) DO UPDATE SET
  email = EXCLUDED.email, source = EXCLUDED.source, statut = EXCLUDED.statut, canal = EXCLUDED.canal,
  url_formulaire = EXCLUDED.url_formulaire, adresse_postale = EXCLUDED.adresse_postale, maj_le = now(), note = EXCLUDED.note;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- (a) les 9 lignes après application (attendu : canal=email, source=saisie_manuelle, statut=confirme) :
--   SELECT code_insee, email, source, statut, canal
--     FROM mairie_contact
--    WHERE code_insee IN ('78646','78322','78575','78571','78475','92004','93001','93063','93015')
--    ORDER BY code_insee;
--
--   -- (b) communes du périmètre ENCORE sans aucune adresse (contact ni PRADA) — attendu : 16 AVANT, 7 APRÈS :
--   SELECT count(*)
--     FROM commune c
--     LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
--     LEFT JOIN mairie_prada  mp ON mp.code_insee = c.code_insee
--    WHERE coalesce(btrim(mc.email), '') = '' AND coalesce(btrim(mp.courriel), '') = '';
--
--   -- (c) journal : exactement 1 ligne écrite par commune traitée (aucun doublon si on rejoue) :
--   SELECT code_insee, count(*) AS n_journal
--     FROM mairie_contact_journal
--    WHERE code_insee IN ('78646','78322','78575','78571','78475','92004','93001','93063','93015')
--      AND motif = 'Adresse du service urbanisme relevée sur le site officiel de la commune (recherche manuelle, 03/08/2026)'
--    GROUP BY code_insee ORDER BY code_insee;
