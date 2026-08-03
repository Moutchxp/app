-- 2026-08-03f_restauration_notes.sql — SEED (chantier S26) : RESTAURE les notes de protocole EFFACÉES.
--
-- POURQUOI : jusqu'à S25, la modale de contact ouvrait toujours le champ `note` vide et l'enregistrement manuel écrasait
-- donc la note stockée par ''. Les notes posées par les seeds de protocole (2026-08-03_protocoles_communes,
-- ...b_protocoles_complement, ...d_protocoles_lot2) ont pu être perdues ainsi. La cause est corrigée (S25) ; ce seed répare
-- les DÉGÂTS.
--
-- PÉRIMÈTRE (recon chiffrée du 03/08/2026, 23 communes portant une note de seed) :
--   • 22 notes CONFORMES au seed (intactes) → non touchées ;
--   • 1 note VIDE (effacée) = Paris (75056) → seule reposée aujourd'hui ;
--   • 0 note DIFFÉRENTE (modifiée à la main) → aucune à protéger, mais la garde ci-dessous les protégerait le cas échéant.
-- Le mapping complet des 23 notes est conservé : ce seed rattrape aussi toute note de ce lot effacée À L'AVENIR.
--
-- GARDES :
--   • UPDATE ... FROM — JAMAIS d'INSERT dans mairie_contact (les lignes existent). JOIN strict (commune absente → ignorée).
--   • NE REPOSE QUE si la note actuelle est VIDE (`coalesce(btrim(note),'') = ''`). Une note NON VIDE — donc modifiée à la
--     main — est laissée EXACTEMENT en l'état : le travail humain prime.
--   • AUCUNE autre colonne touchée : ni canal, ni e-mail, ni adresse_postale, ni téléphone… seule `note` (+ `maj_le`).
--   • IDEMPOTENCE DE CONTENU : la cible ne retient que les notes vides → une fois reposée, la note n'est plus vide, donc
--     rejouer ne fait RIEN (ni UPDATE, ni doublon de journal).
--   • JOURNALISÉ : une ligne par commune reposée (e-mail INCHANGÉ : email_avant = email_apres).
--   • Un seul BEGIN/COMMIT. Aucun DELETE/ALTER.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed/2026-08-03f_restauration_notes.sql

BEGIN;

-- Notes ATTENDUES (verbatim des seeds de protocole). 6 de protocoles_communes + 2 de b_complement + 15 de d_lot2.
WITH attendue(code_insee, note) AS (
  VALUES
    ('75056'::char(5), 'Consult''ADS, compte MonParis + FranceConnect obligatoire. PRADA Charles Chenel, daj-cada@paris.fr. Ancienne adresse courrier BASU conservée.'::text),
    ('93048', 'Consultation sur place, photos autorisées, reproductions par correspondance refusées. Dossiers antérieurs à 2001 aux Archives municipales.'),
    ('92025', 'Demandes de copie par courrier uniquement : Mairie de Colombes, Service Droit des Sols, Place de la République.'),
    ('78646', 'Consultation des dossiers délivrés possible, photocopies à la charge du demandeur.'),
    ('92036', 'Consultation d''un permis sur rendez-vous.'),
    ('78571', 'Instruction mutualisée CC Gally Mauldre, 01 30 55 12 69.'),
    ('78278', 'Aucune adresse e-mail publiée, formulaire de contact générique uniquement. CC Cœur d''Yvelines.'),
    ('78072', 'Aucune adresse e-mail publiée, formulaire de contact générique uniquement. CC du Pays Houdanais.'),
    ('92023', 'Reproductions confiées à un prestataire extérieur, frais à la charge du demandeur. RDV sous 10 jours ouvrés.'),
    ('93057', 'Pas d''accueil mardi ni jeudi.'),
    ('92062', 'Rendez-vous obligatoire.'),
    ('92064', 'Manque d''instructeur signalé, permanences sur rendez-vous. Secteur ABF.'),
    ('92048', 'Consultation des dossiers DÉCIDÉS possible, sur rendez-vous. Fermé le jeudi.'),
    ('92072', 'Consultation d''un dossier décidé sur rendez-vous demandé par e-mail.'),
    ('93031', 'Instruction mutualisée Plaine Commune.'),
    ('93027', 'Instruction mutualisée Plaine Commune.'),
    ('78551', 'Gère aussi l''ex-commune de Fourqueux (fusionnée au 1er janvier 2019).'),
    ('93047', 'Archives municipales sur RDV : archives.doc@ville-montfermeil.fr, 01 41 70 79 01.'),
    ('93007', 'Service Droit des sols sur rendez-vous uniquement (lun/mer 14-17h, ven 9-12h).'),
    ('92049', 'Formulaire de contact uniquement. Service fermé le mardi après-midi.'),
    ('93072', 'Unité territoriale Plaine Commune, 1-3 rue d''Amiens.'),
    ('93010', 'Aucune adresse de service publiée.'),
    ('92073', 'Aucune adresse de service publiée.')
),
-- Cible = communes de ce lot dont la note est ACTUELLEMENT VIDE (effacée). Une note non vide (modifiée main) est exclue.
cible AS (
  SELECT a.code_insee, a.note, mc.email AS email_actuel
  FROM attendue a
  JOIN mairie_contact mc ON mc.code_insee = a.code_insee
  WHERE coalesce(btrim(mc.note), '') = ''
),
-- Journal append-only (e-mail INCHANGÉ : email_avant = email_apres), même mécanique qu'ecrireContact.
journal AS (
  INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
  SELECT code_insee, email_actuel, email_actuel, 'saisie_manuelle',
         'S26 : restauration de la note de protocole effacée par un enregistrement manuel antérieur (note du seed reposée, aucune autre colonne touchée)',
         NULL
  FROM cible
  RETURNING 1
)
UPDATE mairie_contact mc SET note = c.note, maj_le = now()
FROM cible c
WHERE mc.code_insee = c.code_insee;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- (a) CE QUI A ÉTÉ REPOSÉ : les notes du lot, avec leur état vs le seed. Après application, Paris doit passer VIDE→CONFORME.
--   WITH attendue(code_insee, note) AS (VALUES  -- (recopier les 23 lignes ci-dessus si besoin) )
--   SELECT s.code_insee, com.nom,
--          CASE WHEN coalesce(btrim(mc.note),'')='' THEN 'VIDE'
--               WHEN btrim(mc.note)=s.note        THEN 'CONFORME'
--               ELSE 'DIFFERENTE (modifiée main)' END AS etat
--     FROM attendue s
--     LEFT JOIN commune com ON com.code_insee = s.code_insee
--     LEFT JOIN mairie_contact mc ON mc.code_insee = s.code_insee
--    ORDER BY etat, s.code_insee;
--   -- Attendu après application : 23 CONFORME, 0 VIDE, 0 DIFFERENTE (aucune note modifiée main dans ce lot au 03/08/2026).
--
--   -- (b) CE QUI RESTE VIDE (hors lot) : notes vides sur des communes NON couvertes par un seed (rien à restaurer, informatif) :
--   SELECT count(*) FILTER (WHERE coalesce(btrim(note),'') = '') AS notes_vides_total FROM mairie_contact;
--
--   -- (c) journal de restauration : exactement 1 ligne par commune reposée (aucun doublon si on rejoue) :
--   SELECT code_insee, count(*) FROM mairie_contact_journal
--    WHERE motif LIKE 'S26 : restauration%' GROUP BY code_insee ORDER BY code_insee;
