-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 311 — LOT MONGA-1, POINT 1 : LA RÉFÉRENCE D'UNE INTERVENTION MONGA, ET SON ÉVÉNEMENT
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (06/10/2026), mot pour mot : « DONNÉES : migration ADDITIVE (sauvegarde d'abord). Lien
--   référence Monga ↔ événement (unique par référence), avec le libellé Monga, l'adresse lue, le lien « Vers
--   Mission », la dernière étape connue et sa date. Extraction depuis le TEXTE (comme dans l'audit), corrige au
--   passage le défaut « MNG-20354 lu comme code postal ». »
--
-- ⚠️ ADDITIVE AU SENS STRICT : deux tables neuves, aucune colonne ajoutée, aucune ligne touchée, aucun
--    `gestion_*` existant modifié. Rejouable (`IF NOT EXISTS` partout).
--
-- ═══ 🔴🔴 POURQUOI **DEUX** TABLES, ET NON UNE SEULE ════════════════════════════════════════════════════════════
--
-- Arno demande six renseignements sur une référence : son événement, son libellé, son adresse, son lien
-- « Vers Mission », sa dernière étape, la date de cette étape. Les mettre tous dans la table du lien aurait
-- fabriqué un **cache** : six colonnes à rafraîchir à chaque mail, et une seconde vérité à côté des mails.
--
-- Or ces six renseignements ne sont pas de la même nature, et c'est la mesure de l'audit qui le dit :
--
--   ① CE QUE DIT CHAQUE MAIL — sa référence, son libellé, son adresse, son lien, son étape. C'est une LECTURE,
--      rejouable : effacez `gestion_monga_mail`, relisez les mails, vous retrouvez exactement les mêmes lignes.
--      Elle vit mail par mail parce que **40 références portent 156 mails** : la dernière étape d'une
--      intervention est l'étape de son dernier mail, et rien d'autre.
--
--   ② LA DÉCISION D'ARNO — « cette référence, c'est CET événement ». Ce n'est pas une lecture : c'est un clic,
--      daté et signé, que rien ne permet de recalculer. RÈGLE D'ARNO : « Premier rattachement d'une référence
--      = TOUJOURS un clic d'Arno, même quand le lot est unique. »
--
-- 🔴 D'OÙ : la dernière étape ne se STOCKE PAS. Elle se lit — l'étape du mail le plus récent de la référence.
--    Aucune invalidation de cache, aucune colonne à rafraîchir, et le chiffre est juste par construction.
--
-- 🔴 ET C'EST CE QUI REND LES POINTS 4 ET 5 POSSIBLES. **19 des 40 références n'auront JAMAIS de ligne de
--    lien** tant qu'Arno n'a pas cliqué (leur adresse porte plusieurs lots : choix manuel, aucune déduction).
--    Il faut pourtant les lister avec leur libellé, leur adresse, leur nombre de mails et leur dernière étape —
--    « Interventions Monga à relier (N) ». Une référence SANS événement est donc un objet de plein droit ici :
--    elle vit dans ①, elle n'est simplement pas encore dans ②.
--
-- ═══ ⚠️ CE QUE CES TABLES NE FONT PAS ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ELLES NE RATTACHENT RIEN À UN BIEN. Le rattachement d'un mail à ses lots reste `gestion_rattachement`, et
--    il passe par la porte d'écriture existante — un seul chemin, inchangé. Ici on ne garde que ce que Monga
--    DIT, et le lien qu'Arno DÉCIDE.
--
-- ⚠️ ELLES NE FERMENT AUCUN ÉVÉNEMENT. L'audit n'a trouvé **qu'UN SEUL** mail « Mission terminée » pour 40
--    références : une clôture automatique ne fermerait presque rien, et fermerait parfois à tort. L'écran
--    PROPOSE, Arno tranche.
--
-- ⚠️ ELLES NE CONSERVENT PAS L'ANCIEN NOM D'UN ÉVÉNEMENT RENOMMÉ. `gestion_journal` le fait déjà, avec
--    sa valeur avant / après, son auteur et sa date — c'est exactement « l'ancien nom conservé et visible dans
--    l'historique de l'événement ». Le recopier ici aurait créé une seconde vérité pour rien.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ① CE QUE DIT UN MAIL MONGA — une lecture, une ligne par mail, rejouable
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LA DATE DU MAIL N'EST PAS ICI, ET C'EST VOULU : c'est `gestion_message.recu_le`. La recopier aurait fait
--    diverger l'ordre des étapes du courrier dont elles sortent.

CREATE TABLE IF NOT EXISTS gestion_monga_mail (
  message_id    bigint      PRIMARY KEY REFERENCES gestion_message(id) ON DELETE CASCADE,
  -- La référence, normalisée « MNG-23987 ». NULLABLE : l'audit a mesuré **2 mails sur 97** qui n'en portent
  -- aucune (un transfert tronqué, un relevé de factures). On enregistre la lecture telle qu'elle est — dire
  -- « pas de référence » est un renseignement, inventer une référence serait une faute.
  reference     text        CONSTRAINT gestion_monga_mail_reference_chk
                              CHECK (reference IS NULL OR reference ~ '^MNG-[0-9]{4,6}$'),
  libelle       text,
  adresse       text,
  lien_mission  text,
  -- L'étape. 🔴 CETTE LISTE EST LA MÊME QUE `EtapeMonga` dans app/lib/gestion/monga.ts, et une épreuve compare
  -- les deux en lisant CE fichier : deux listes qui divergent, c'est une étape qui disparaît en silence.
  etape         text        NOT NULL CONSTRAINT gestion_monga_mail_etape_chk
                              CHECK (etape IN ('devis_envoye', 'devis_rappel', 'commentaire', 'attention',
                                               'terminee', 'facture', 'relance_facture', 'compte_rendu',
                                               'service', 'autre')),
  lu_le         timestamptz NOT NULL DEFAULT now()
);

-- La lecture de tous les lots : « les mails de cette référence », du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS gestion_monga_mail_reference_idx
  ON gestion_monga_mail (reference) WHERE reference IS NOT NULL;

COMMENT ON TABLE gestion_monga_mail IS
  'LOT MONGA-1 : ce que DIT chaque mail Monga (référence, libellé, adresse, lien mission, étape). Pure '
  'lecture, rejouable depuis les mails. La DATE du mail reste gestion_message.recu_le ; la dernière étape '
  'd''une référence se LIT (étape du mail le plus récent), elle ne se stocke pas.';


-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ② LA DÉCISION D'ARNO — « cette référence, c'est CET événement »
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gestion_monga_lien (
  id                  bigserial PRIMARY KEY,
  reference           text        NOT NULL CONSTRAINT gestion_monga_lien_reference_chk
                                    CHECK (reference ~ '^MNG-[0-9]{4,6}$'),
  evenement_id        bigint      NOT NULL REFERENCES gestion_evenement(id) ON DELETE CASCADE,
  -- 🔴 CE QU'ARNO AVAIT SOUS LES YEUX EN CLIQUANT, figé. Ce n'est pas une copie du mail : c'est la trace de la
  -- décision. Monga peut renommer son intervention trois mails plus tard — on saura toujours sur quel libellé
  -- et quelle adresse le lien a été fait, et donc pourquoi.
  libelle_lu          text,
  adresse_lue         text,
  lien_mission_lu     text,
  relie_le            timestamptz NOT NULL DEFAULT now(),
  relie_par           bigint      REFERENCES admin_utilisateur(id),
  relie_par_libelle   text        NOT NULL,
  retire_le           timestamptz,
  retire_par          bigint      REFERENCES admin_utilisateur(id),
  retire_par_libelle  text,
  retire_motif        text,
  -- ⚠️ UN HUMAIN, TOUJOURS. « Premier rattachement d'une référence = TOUJOURS un clic d'Arno » : une passe
  --    automatique qui voudrait poser un lien se heurte à cette contrainte, en base, et non à une bonne
  --    intention dans du code. C'est la garde la plus solide qu'on puisse donner à cette règle.
  CONSTRAINT gestion_monga_lien_humain_chk
    CHECK (btrim(relie_par_libelle) <> '' AND lower(btrim(relie_par_libelle)) <> 'automatique')
);

-- 🔴 UNE RÉFÉRENCE N'A QU'UN ÉVÉNEMENT VIVANT — « unique par référence » (Arno). Sans cet index, deux clics
--    concurrents sur le même encart poseraient deux liens, et les mails suivants se rangeraient dans l'un ou
--    l'autre au hasard du tri.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_monga_lien_vivant_idx
  ON gestion_monga_lien (reference) WHERE retire_le IS NULL;

-- La lecture de l'écran : « cet événement porte-t-il une intervention Monga ? » (badge, étape, lien Mission).
-- ⚠️ PAS D'UNICITÉ SUR L'ÉVÉNEMENT, et c'est délibéré : rien n'interdit que deux interventions Monga
--    successives concernent le même événement (un devis refusé, une seconde mission). L'unicité porte sur la
--    RÉFÉRENCE, comme Arno l'a demandée — pas sur l'événement.
CREATE INDEX IF NOT EXISTS gestion_monga_lien_evenement_idx
  ON gestion_monga_lien (evenement_id) WHERE retire_le IS NULL;

COMMENT ON TABLE gestion_monga_lien IS
  'LOT MONGA-1 : le lien DÉCIDÉ entre une référence Monga et un événement — un clic d''Arno, daté et signé, '
  'jamais une déduction (contrainte gestion_monga_lien_humain_chk). Unique par référence vivante. Délier = '
  'retire_le, jamais DELETE.';
