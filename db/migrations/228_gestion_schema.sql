-- 228_gestion_schema.sql — MODULE « GESTION » (gestion locative) : SCHÉMA COMPLET. LOT 1.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — LE PRINCIPE QUI COMMANDE TOUT LE SCHÉMA : **CAPTURER D'ABORD, CLASSER ENSUITE.**
--
-- Il n'existe aujourd'hui NI fichier des lots en gestion, NI accès au prestataire MONGA. Un événement ne peut donc porter que
-- ce que le mail contient : une adresse en texte libre, un nom, un objet. Tout message est ENREGISTRÉ quand même — expéditeur,
-- date, objet, pièces jointes — même non rattachable. Le rattachement à un lot se fera plus tard, sur l'historique déjà en base,
-- SANS RIEN PERDRE. Le schéma est conçu pour que l'arrivée d'un référentiel de lots soit une ADDITION (une colonne, une table),
-- jamais une reprise. Les deux accroches sont posées d'avance : cf. gestion_evenement et gestion_reference_externe.
--
-- CE QUE LA SONDE (lots 0 et 0-bis, LECTURE STRICTE de la vraie boîte) A ÉTABLI, et qui est gravé ici en valeurs par défaut :
--   · dossier IMAP réel « _GESTION BOITE MAIL », 5 492 messages sur 90 jours (~61/jour) ;
--   · 69 % du flux est SORTANT, mais 201 des 295 sortants de l'échantillon portent l'objet « Document CRITERIMMO » — des envois
--     de logiciel SANS aucun en-tête d'automatisme : la règle d'en-tête ne les voit pas, un GABARIT D'OBJET les voit. Écartés,
--     il reste ~13 vraies réponses par jour ;
--   · 175 réponses sur 177 portent des en-têtes de fil exploitables (99 %) → les fils se calculent à partir des en-têtes, voie
--     PURE : aucune colonne « identifiant de fil Gmail » n'est créée, elle ne servirait à rien ;
--   · 22 % des messages portent une pièce ; types vus : pdf, png, jpeg, gif, mp4 (jusqu'à 14,6 Mo), text/plain.
--
-- LES QUATRE RÈGLES DE CONCEPTION, à ne pas réinterpréter :
--   ① ON NE SUPPRIME JAMAIS. Une règle d'exclusion ne supprime pas un message : elle le tient HORS DE LA FILE. Le message reste
--      en base, avec la RÉFÉRENCE de la règle qui l'a écarté → désactiver la règle peut le faire revenir. Idem pour les fils
--      classés sans suite, les affectations défaites, les règles retirées (actif = false, jamais DELETE).
--   ② L'ÉTAT « ATTEND UNE RÉPONSE DE NOTRE PART » EST DÉRIVÉ, JAMAIS STOCKÉ. Il se lit : « le dernier message NON EXCLU du fil
--      est un message REÇU et PROBABLEMENT HUMAIN ». Aucune colonne ne le porte — une colonne mentirait dès le message suivant.
--      L'index gestion_message_attente_idx (plus bas) existe précisément pour que ce calcul reste instantané.
--   ③ TOUT CE QUI SE PILOTE SE PILOTE SANS CODE. Dossier relevé, durée de conservation, fenêtre de rattrapage, plafond, types de
--      pièces, domaines internes et TOUTES les règles d'exclusion vivent en base, éditables au runtime. Aucune valeur métier en dur.
--   ④ CE QUI EST DÉRIVABLE N'EST PAS STOCKÉ : nombre de messages d'un fil, date du dernier échange, part automatique — tout cela
--      se calcule. Seuls les FAITS sont écrits.
--
-- 🔒 CE QUE CETTE MIGRATION NE TOUCHE PAS : aucune table du module Permis (demande*, sitadel_*, permis_*, mairie_*, releve_run…),
--    aucune table du moteur (config_scoring, batiment, mnt/mns_lidar_brut), ni le verdict, ni le golden Asnières
--    (29.107259068449615). La SEULE table existante modifiée est `admin_utilisateur`, par AJOUT d'une colonne de droit
--    (perm_gestion), sur le patron EXACT des 8 perm_* déjà présentes (014, 225) — table partagée de l'administration, qui
--    n'appartient à aucun module.
--
-- SÛR : DDL strictement ADDITIVE — CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--    DROP TRIGGER IF EXISTS + CREATE TRIGGER (seule façon idempotente d'en poser un). Aucun DROP de table, de colonne ni de
--    données. Aucun type énuméré (toutes les listes fermées sont des CHECK NOMMÉS, donc élargissables par
--    DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, sans réécrire la table). Deux écritures de données SEULEMENT, toutes deux
--    idempotentes : la ligne singleton de configuration, et la graine des règles d'exclusion. Un seul BEGIN/COMMIT. Rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/228_gestion_schema.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — DROIT D'ACCÈS AU MODULE (patron EXACT des perm_* de 014 / 225 : boolean NOT NULL DEFAULT false).
--   La tuile « Gestion » sera un MODULE GARDÉ par collaborateur, pas une tuile réservée au rôle administrateur : le module
--   contiendra des données personnelles de locataires, un accès « tout le monde » n'est pas tenable. La colonne peut vivre AVANT
--   le code qui la lit (c'est ce qu'a fait 225 pour perm_permis) : les SELECT nomment leurs colonnes, une colonne de plus est ignorée.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_gestion boolean NOT NULL DEFAULT false;

-- Décision d'Arno : « personne par défaut ; seul Arno coché pendant le pilote ». Les ADMINISTRATEURS ont toutes les permissions
--   par construction (permsToutes) → on aligne la base sur cette règle ; les COLLABORATEURS restent à false (DEFAULT), Arno les
--   cochera un par un depuis « Administratif — comptes » le jour venu. Idempotent.
UPDATE admin_utilisateur SET perm_gestion = true WHERE role = 'administrateur' AND perm_gestion = false;

COMMENT ON COLUMN admin_utilisateur.perm_gestion IS
  'Accès au MODULE « Gestion » (gestion locative). Module gardé, patron des perm_* de 014/225. Administrateur : true forcé (permsToutes). DEFAULT false : un collaborateur n''y a accès que si Arno le coche — le module porte des données personnelles de locataires.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 2 — CONFIGURATION DU MODULE (singleton id = 1, convention config_scoring / config_veille / config_cadence).
--   Lue au runtime avec REPLI SÛR côté code (table absente ou ligne manquante ⇒ valeurs par défaut codées, jamais un crash).
--   Toutes les bornes sont dans des CHECK NOMMÉS : l'écran de réglage les LIT en base plutôt que de les recopier.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_config (
  id                            integer     PRIMARY KEY DEFAULT 1,

  -- QUOI RELEVER ------------------------------------------------------------------------------------------------------------
  -- Chemin IMAP du dossier porté par le libellé. Valeur constatée par la sonde ; en RÉGLAGE, jamais en dur dans le code.
  dossier_imap                  text        NOT NULL DEFAULT '_GESTION BOITE MAIL',
  -- Adresse de la boîte de gestion : c'est ELLE qui décide du SENS d'un message (émis par elle = « envoye », sinon « recu »).
  adresse_gestion               text        NOT NULL DEFAULT 'gestion@criterimmo.fr',
  -- Domaines de la maison. Un message venu de là est du courrier INTERNE, pas la demande d'un tiers (la sonde en a vu 11/105).
  --   Liste séparée par des virgules — même forme que config_veille.pieces_demandees, lisible et éditable sans outil.
  domaines_internes             text        NOT NULL DEFAULT 'criterimmo.fr,sansvisavis.com',

  -- JUSQU'OÙ ET À QUEL RYTHME -----------------------------------------------------------------------------------------------
  -- Profondeur du PREMIER rattrapage, en jours. 90 = le périmètre mesuré par la sonde (~5 500 messages). On pourra remonter
  --   plus loin ensuite sans rien perdre : le dédoublonnage par message_id rend toute reprise gratuite.
  rattrapage_jours              integer     NOT NULL DEFAULT 90,
  -- Nombre maximum de messages lus par passe. Au-delà, la passe s'arrête et la suivante REPREND où elle en était (plafond
  --   chronologique progressif, patron éprouvé du module Permis) : on avance toujours, on ne boucle jamais.
  plafond_par_passe             integer     NOT NULL DEFAULT 400,

  -- PIÈCES JOINTES ----------------------------------------------------------------------------------------------------------
  -- Liste PROPRE à la gestion (arbitrage d'Arno d'après les types réellement vus par la sonde). Volontairement DISTINCTE de la
  --   liste du module Permis (urbanisme : DWG, ODT…), qui n'est pas touchée : deux métiers, deux listes.
  --   ⚠️ image/heic est là PAR PRÉCAUTION : un locataire photographiant un dégât depuis un iPhone produit du HEIC.
  types_pieces_acceptes         text        NOT NULL DEFAULT 'application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/heic',
  -- Taille maximale d'UNE pièce, en Mo. 25 couvre la plus grosse vue par la sonde (une vidéo de 14,6 Mo) avec de la marge.
  piece_taille_max_mo           integer     NOT NULL DEFAULT 25,

  -- CONSERVATION ------------------------------------------------------------------------------------------------------------
  -- Durée de conservation d'une carte CLOSE, en mois. 60 (5 ans) est un DÉFAUT DE DÉPART aligné sur la prescription civile
  --   usuelle, PAS un avis juridique : c'est un réglage, Arno le change sans code ni migration. Aucune purge automatique n'est
  --   créée par ce lot — la valeur est posée pour que la décision existe avant qu'on en ait besoin.
  conservation_carte_close_mois integer     NOT NULL DEFAULT 60,

  maj_le                        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gestion_config_singleton_chk CHECK (id = 1),
  CONSTRAINT gestion_config_textes_chk CHECK (
    btrim(dossier_imap) <> '' AND btrim(adresse_gestion) <> ''
    AND btrim(domaines_internes) <> '' AND btrim(types_pieces_acceptes) <> ''
  ),
  CONSTRAINT gestion_config_bornes_chk CHECK (
    rattrapage_jours BETWEEN 1 AND 3650
    AND plafond_par_passe BETWEEN 10 AND 5000
    AND piece_taille_max_mo BETWEEN 1 AND 200
    AND conservation_carte_close_mois BETWEEN 6 AND 240
  )
);

COMMENT ON TABLE gestion_config IS
  'Configuration du module « Gestion » (singleton id=1). Pilotage SANS CODE : dossier relevé, adresse de la boîte, domaines internes, profondeur de rattrapage, plafond par passe, types et taille des pièces, conservation d''une carte close. Lue au runtime avec repli sûr (absente ⇒ défauts codés, jamais un crash).';
COMMENT ON COLUMN gestion_config.dossier_imap IS 'Chemin IMAP du dossier porté par le libellé de gestion. Constaté par la sonde du lot 0 ; réglage, jamais une valeur en dur.';
COMMENT ON COLUMN gestion_config.adresse_gestion IS 'Adresse de la boîte de gestion : décide du SENS d''un message (expéditeur = elle ⇒ « envoye », sinon « recu »).';
COMMENT ON COLUMN gestion_config.conservation_carte_close_mois IS 'Durée de conservation d''une carte close, en mois. DÉFAUT DE DÉPART (60 = 5 ans), pas un avis juridique — à arbitrer, modifiable sans code. Aucune purge automatique n''est posée par la migration 228.';
COMMENT ON COLUMN gestion_config.types_pieces_acceptes IS 'Types MIME acceptés pour une pièce jointe de gestion. Liste PROPRE au module, distincte de celle du module Permis (qui n''est pas modifiée).';

-- Ligne singleton (valeurs par défaut ci-dessus). ON CONFLICT DO NOTHING : rejouer la migration ne réécrit JAMAIS une
--   configuration déjà ajustée par Arno.
INSERT INTO gestion_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 3 — RÈGLES D'EXCLUSION DE LA FILE (pilotage sans code).
--   ⚠️ UNE RÈGLE NE SUPPRIME RIEN. Elle tient un message HORS DE LA FILE de travail. Le message est capturé, stocké, consultable,
--   et il porte la référence de la règle qui l'a écarté (gestion_message.exclu_par_regle_id) : désactiver la règle permet de le
--   faire revenir. C'est la différence entre « ranger » et « jeter », et ce module ne jette pas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_regle_exclusion (
  id                bigserial   PRIMARY KEY,
  -- COMMENT la règle reconnaît un message. Liste fermée, élargissable (CHECK nommé) :
  --   'gabarit_objet'       : l'objet NORMALISÉ du message est égal à la valeur (c'est le cas « Document CRITERIMMO ») ;
  --   'domaine_expediteur'  : le domaine de l'expéditeur est égal à la valeur ;
  --   'adresse_expediteur'  : l'adresse complète de l'expéditeur est égale à la valeur ;
  --   'signal_entete'       : le message porte l'en-tête d'automatisme nommé par la valeur (auto-submitted, list-unsubscribe…),
  --                           ou la valeur spéciale 'adresse sans réponse'.
  type              text        NOT NULL,
  valeur            text        NOT NULL,
  -- À QUEL SENS la règle s'applique : 'recu', 'envoye', ou 'les_deux'.
  sens              text        NOT NULL DEFAULT 'les_deux',
  -- Interrupteur. false = la règle existe, documentée, mais n'écarte plus rien. On ne SUPPRIME jamais une règle : on l'éteint,
  --   et les messages qu'elle avait écartés peuvent revenir dans la file.
  actif             boolean     NOT NULL DEFAULT true,
  -- Phrase LISIBLE par un non-développeur, affichée à l'écran et recopiée sur chaque message écarté. Toujours écrite.
  motif             text        NOT NULL,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint      REFERENCES admin_utilisateur(id),   -- NULL = posée par la migration ou la voie de secours
  cree_par_libelle  text        NOT NULL DEFAULT 'migration 228',   -- nom FIGÉ : lisible des années après, même compte désactivé
  maj_le            timestamptz NOT NULL DEFAULT now(),
  desactive_le      timestamptz,
  desactive_par     bigint      REFERENCES admin_utilisateur(id),
  desactive_par_libelle text,

  CONSTRAINT gestion_regle_exclusion_type_chk CHECK (type IN ('gabarit_objet','domaine_expediteur','adresse_expediteur','signal_entete')),
  CONSTRAINT gestion_regle_exclusion_sens_chk CHECK (sens IN ('recu','envoye','les_deux')),
  CONSTRAINT gestion_regle_exclusion_valeur_chk CHECK (btrim(valeur) <> ''),
  CONSTRAINT gestion_regle_exclusion_motif_chk CHECK (btrim(motif) <> '')
);

-- Une même règle ne peut pas être posée deux fois (comparaison insensible à la casse : un gabarit d'objet ou un domaine ne se
--   distinguent pas par leur casse).
CREATE UNIQUE INDEX IF NOT EXISTS gestion_regle_exclusion_cle_idx
  ON gestion_regle_exclusion (type, lower(valeur), sens);
-- Le moteur de capture ne lit QUE les règles actives : index partiel, petit et ciblé.
CREATE INDEX IF NOT EXISTS gestion_regle_exclusion_actives_idx
  ON gestion_regle_exclusion (type) WHERE actif;

COMMENT ON TABLE gestion_regle_exclusion IS
  'Règles qui tiennent un message HORS DE LA FILE de travail — JAMAIS une suppression : le message reste capturé et porte la référence de la règle (gestion_message.exclu_par_regle_id), si bien qu''éteindre la règle peut le faire revenir. Éditables au runtime (pilotage sans code). Une règle ne se supprime pas : elle se désactive (actif = false).';
COMMENT ON COLUMN gestion_regle_exclusion.type IS 'Comment la règle reconnaît un message : gabarit_objet | domaine_expediteur | adresse_expediteur | signal_entete. Liste fermée par CHECK NOMMÉ, donc élargissable sans réécrire la table.';
COMMENT ON COLUMN gestion_regle_exclusion.motif IS 'Phrase lisible par un non-développeur. Affichée à l''écran ET recopiée sur chaque message écarté (gestion_message.exclu_motif), pour que la trace survive à une modification ultérieure de la règle.';

-- ── GRAINE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Insérée par WHERE NOT EXISTS (et non ON CONFLICT) : idempotent sans dépendre de l'inférence d'un index à expression.
--
-- ⚠️ DEUX FAMILLES, DEUX ÉTATS DE DÉPART — c'est une décision, et elle est motivée ici pour pouvoir être contredite :
--   · ACTIVES d'emblée : le gabarit « Document CRITERIMMO » (PROUVÉ par la sonde : 201 des 295 sortants de l'échantillon, des
--     envois de logiciel sans aucun en-tête) et les domaines internes (demandés par Arno). Sans elles, la file naît noyée.
--   · INACTIVES d'emblée : les signaux d'en-tête d'automatisme. Motif : les notifications MONGA arrivent de « no-reply@monga.io »
--     AVEC un List-Unsubscribe — elles seraient écartées par ces règles alors que ce sont de VRAIES demandes d'intervention.
--     Les règles sont donc posées, nommées et documentées, mais éteintes : Arno les allume une par une, en voyant ce qu'elles
--     retirent. Mieux vaut une file un peu bruyante qu'un travail rendu invisible en silence.
INSERT INTO gestion_regle_exclusion (type, valeur, sens, actif, motif)
SELECT v.type, v.valeur, v.sens, v.actif, v.motif
  FROM (VALUES
    ('gabarit_objet', 'Document CRITERIMMO', 'les_deux', true,
     'Envoi de document produit par un logiciel (201 des 295 sortants mesurés par la sonde) : aucune réponse n''est attendue.'),
    ('domaine_expediteur', 'criterimmo.fr', 'recu', true,
     'Courrier interne à la maison : ce n''est pas la demande d''un tiers.'),
    ('domaine_expediteur', 'sansvisavis.com', 'recu', true,
     'Courrier interne à la maison : ce n''est pas la demande d''un tiers.'),
    ('signal_entete', 'auto-submitted', 'les_deux', false,
     'Message déclaré automatique par son émetteur (RFC 3834). ÉTEINTE au départ : à allumer après avoir vu ce qu''elle retire.'),
    ('signal_entete', 'list-unsubscribe', 'les_deux', false,
     'Diffusion de masse ou notification de plateforme. ÉTEINTE au départ : elle écarterait aussi les notifications MONGA, qui sont de vraies demandes.'),
    ('signal_entete', 'list-id', 'les_deux', false,
     'Message appartenant à une liste de diffusion. ÉTEINTE au départ.'),
    ('signal_entete', 'precedence', 'les_deux', false,
     'Priorité « bulk », « list », « junk » ou « auto_reply ». ÉTEINTE au départ.'),
    ('signal_entete', 'x-auto-response-suppress', 'les_deux', false,
     'Posé par les serveurs d''envoi en masse. ÉTEINTE au départ.'),
    ('signal_entete', 'feedback-id', 'les_deux', false,
     'Identifiant de campagne (routeur d''e-mail transactionnel). ÉTEINTE au départ.'),
    ('signal_entete', 'x-campaign-id', 'les_deux', false,
     'Identifiant de campagne. ÉTEINTE au départ.'),
    ('signal_entete', 'x-mailer', 'les_deux', false,
     'Un logiciel se nomme lui-même comme émetteur. ÉTEINTE au départ : des clients de messagerie ordinaires posent aussi cet en-tête.'),
    ('signal_entete', 'adresse sans réponse', 'recu', false,
     'Expéditeur en no-reply / ne-pas-repondre / notification. ÉTEINTE au départ : MONGA écrit depuis une telle adresse.')
  ) AS v(type, valeur, sens, actif, motif)
 WHERE NOT EXISTS (
   SELECT 1 FROM gestion_regle_exclusion r
    WHERE r.type = v.type AND lower(r.valeur) = lower(v.valeur) AND r.sens = v.sens
 );

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 4 — LE FIL DE DISCUSSION (une ligne de la file = UN fil, jamais un message isolé).
--   Un échange de six mails ne doit pas prendre six lignes. La clé du fil est CALCULÉE à partir des en-têtes
--   (Message-ID ∪ In-Reply-To ∪ References, composantes connexes) : voie PURE, recalculable à tout moment, sans Gmail.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_fil (
  id             bigserial   PRIMARY KEY,
  -- Identifiant racine normalisé du fil (un Message-ID sans chevrons, domaine en minuscules). Recalculable : si l'arrivée d'un
  --   message relie deux fils jusque-là séparés, ils FUSIONNENT — les messages changent de fil_id et le fait est journalisé.
  cle            text        NOT NULL,
  -- Objet du premier message, tel quel (affichage). Le GABARIT anonymisé, lui, vit sur chaque message.
  objet_initial  text,
  -- 'a_classer' : dans la file. 'affecte' : rattaché à un événement. 'sans_suite' : écarté à la main, jamais supprimé.
  etat           text        NOT NULL DEFAULT 'a_classer',
  -- CLASSEMENT SANS SUITE — geste humain, tracé, réversible. ⚠️ RÈGLE D'ARNO : si un NOUVEAU message arrive dans un fil classé
  --   sans suite, le fil REVIENT dans la file (etat repasse à 'a_classer', le fait est journalisé). Sans quoi une facture
  --   mensuelle écartée une fois le resterait pour toujours, relance comprise.
  sans_suite_le  timestamptz,
  sans_suite_par bigint      REFERENCES admin_utilisateur(id),
  sans_suite_par_libelle text,
  sans_suite_motif text,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  maj_le         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gestion_fil_cle_key UNIQUE (cle),
  CONSTRAINT gestion_fil_etat_chk CHECK (etat IN ('a_classer','affecte','sans_suite'))
);

-- LA FILE : index partiel sur les seuls fils à classer, trié par le plus ancien d'abord (« ce qui attend depuis le plus
--   longtemps » est en tête — l'ordre demandé à l'écran).
CREATE INDEX IF NOT EXISTS gestion_fil_a_classer_idx ON gestion_fil (cree_le) WHERE etat = 'a_classer';

COMMENT ON TABLE gestion_fil IS
  'Un ÉCHANGE (conversation), pas un message : une ligne de la file = un fil. Clé calculée à partir des en-têtes de fil (composantes connexes sur Message-ID/In-Reply-To/References), donc recalculable hors ligne, sans dépendance à Gmail. Deux fils FUSIONNENT si un message les relie. RÈGLE : un nouveau message dans un fil « sans_suite » le ramène à « a_classer » (rien ne reste écarté pour toujours).';
COMMENT ON COLUMN gestion_fil.etat IS 'a_classer (dans la file) | affecte (rattaché à un événement) | sans_suite (écarté à la main, conservé, réversible). L''état « attend une réponse de notre part » n''est PAS ici : il est DÉRIVÉ des messages (cf. gestion_message_attente_idx).';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 5 — LE MESSAGE CAPTURÉ.
--   Décision d'Arno : le TEXTE des messages est conservé en base (les collaborateurs n'ont pas accès à la boîte relue ; sans le
--   texte, l'outil ne serait qu'une liste de titres). Les PIÈCES, elles, ne sont JAMAIS en base — invariant projet (CLAUDE.md §7) :
--   elles vont sur le stockage objet, la base ne garde que la clé et les métadonnées (cf. gestion_piece).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_message (
  id                bigserial   PRIMARY KEY,
  fil_id            bigint      NOT NULL REFERENCES gestion_fil(id),
  -- Message-ID AVEC chevrons (même forme que partout dans le dépôt). UNIQUE ⇒ le dédoublonnage des relèves est GRATUIT : une
  --   passe qui repasse sur une fenêtre déjà lue n'insère rien. C'est ce qui rend toute reprise de rattrapage sans danger.
  message_id        text        NOT NULL,
  -- Ancres de fil, conservées BRUTES : elles permettent de RECALCULER les fils à tout moment (après correction d'un bug, ou
  --   pour rejouer l'historique), sans retourner chercher les messages dans la boîte.
  in_reply_to       text,
  references_brut   text,
  -- 'recu' | 'envoye', décidé par comparaison à gestion_config.adresse_gestion. La sonde a montré que les DEUX sens sont
  --   recopiés sous le libellé (69 % de sortants) : une carte pourra donc montrer la conversation des deux côtés.
  sens              text        NOT NULL,
  de_adresse        text        NOT NULL,
  de_nom            text,
  -- En-têtes To + Cc conservés tels quels (affichage), et leur nombre (mesure). Aucune adresse n'est exposée hors de la fiche.
  destinataires     text,
  nb_destinataires  integer     NOT NULL DEFAULT 0,
  objet             text,
  -- Objet NORMALISÉ en gabarit (préfixes Re:/TR: retirés, coupe à la première séparation, nom/adresse/date/montant/référence
  --   remplacés). C'est LUI que compare une règle d'exclusion de type 'gabarit_objet' — d'où l'index plus bas.
  objet_gabarit     text,
  recu_le           timestamptz NOT NULL,
  corps_texte       text,
  corps_html        text,
  -- INDICE « probablement automatique » calculé à la capture (règle documentée et affichée dans la sonde), avec la liste des
  --   signaux qui l'ont produit. Sert à DÉRIVER « ce fil attend une réponse » : un message automatique n'attend rien.
  automatique       boolean     NOT NULL DEFAULT false,
  signaux_automatisme text,
  -- EXCLUSION — le message reste en base ; il est seulement tenu hors de la file. `exclu_motif` est une COPIE FIGÉE du motif de
  --   la règle au moment de l'exclusion : la trace reste lisible même si la règle est réécrite ensuite.
  exclu_le          timestamptz,
  exclu_par_regle_id bigint     REFERENCES gestion_regle_exclusion(id),   -- pas d'ON DELETE : une règle citée ne se supprime pas
  exclu_motif       text,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  maj_le            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gestion_message_message_id_key UNIQUE (message_id),
  CONSTRAINT gestion_message_sens_chk CHECK (sens IN ('recu','envoye')),
  CONSTRAINT gestion_message_nb_destinataires_chk CHECK (nb_destinataires >= 0),
  -- Cohérence de l'exclusion : les trois marques vont ensemble ou aucune. Interdit une exclusion « orpheline » dont on ne
  --   saurait plus ni pourquoi ni par quelle règle elle a eu lieu — donc qu'on ne saurait pas défaire.
  CONSTRAINT gestion_message_exclusion_chk CHECK (
    (exclu_le IS NULL AND exclu_par_regle_id IS NULL AND exclu_motif IS NULL)
    OR (exclu_le IS NOT NULL AND exclu_par_regle_id IS NOT NULL AND exclu_motif IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS gestion_message_fil_idx    ON gestion_message (fil_id, recu_le);
CREATE INDEX IF NOT EXISTS gestion_message_recu_idx   ON gestion_message (recu_le DESC);
-- Règles d'exclusion : appariement par gabarit d'objet et par domaine/adresse d'expéditeur (formes NORMALISÉES, alignées sur
--   ce que compare le code — jamais une comparaison sensible à la casse d'un côté et pas de l'autre).
CREATE INDEX IF NOT EXISTS gestion_message_gabarit_idx ON gestion_message (objet_gabarit) WHERE objet_gabarit IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestion_message_de_idx      ON gestion_message (lower(de_adresse));
-- ⭐ L'INDEX QUI REND DÉRIVABLE « CE FIL ATTEND UNE RÉPONSE DE NOTRE PART ». La règle : le DERNIER message NON EXCLU d'un fil
--   est-il un message REÇU et probablement HUMAIN ? Cet index partiel donne ce dernier message d'un fil en une lecture, ce qui
--   rend inutile — et donc interdite — toute colonne qui prétendrait stocker cet état.
CREATE INDEX IF NOT EXISTS gestion_message_attente_idx
  ON gestion_message (fil_id, recu_le DESC) WHERE exclu_le IS NULL;
-- Les messages ÉCARTÉS d'une règle donnée : c'est la lecture qui permet de les FAIRE REVENIR quand la règle est éteinte.
CREATE INDEX IF NOT EXISTS gestion_message_exclus_idx
  ON gestion_message (exclu_par_regle_id) WHERE exclu_le IS NOT NULL;

COMMENT ON TABLE gestion_message IS
  'Un message capturé dans le dossier de gestion. TOUT message est enregistré, même non rattachable et même écarté de la file (principe : capturer d''abord, classer ensuite). Le TEXTE est conservé (les collaborateurs n''ont pas accès à la boîte) ; les PIÈCES vont sur le stockage objet, jamais en base (CLAUDE.md §7). message_id UNIQUE ⇒ une relève rejouée n''insère aucun doublon.';
COMMENT ON COLUMN gestion_message.exclu_par_regle_id IS 'Règle qui a tenu ce message hors de la file. JAMAIS une suppression : éteindre la règle permet de faire revenir le message. Aucune action ON DELETE — une règle citée ne peut pas être supprimée.';
COMMENT ON COLUMN gestion_message.objet_gabarit IS 'Objet normalisé en gabarit (préfixes Re:/TR: retirés, coupe à la première séparation, nom/adresse/date/montant/référence remplacés). C''est la valeur que compare une règle d''exclusion de type gabarit_objet.';
COMMENT ON COLUMN gestion_message.automatique IS 'Indice « probablement automatique » calculé à la capture (en-tête d''automatisme, ou expéditeur sans réponse). Sert à dériver « ce fil attend une réponse » : un message automatique n''attend rien.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 6 — LES PIÈCES JOINTES (métadonnées seulement ; le fichier vit sur le stockage objet).
--   Patron EXACT de demande_reponse_piece (073) : si le dépôt échoue, la ligne reste AVEC SON MOTIF — jamais une pièce perdue
--   en silence. Types acceptés et taille maximale sont lus dans gestion_config, pas codés en dur.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_piece (
  id               bigserial   PRIMARY KEY,
  message_id       bigint      NOT NULL REFERENCES gestion_message(id) ON DELETE CASCADE,
  nom_fichier      text        NOT NULL,
  type_mime        text,
  taille_octets    bigint,
  cle_stockage     text,                    -- clé sur le stockage objet ; NULL tant que la pièce n'est pas déposée
  empreinte_sha256 text,
  stocke_le        timestamptz,
  motif_non_stocke text,                    -- renseigné si la pièce n'a PAS pu être déposée (type refusé, trop lourde, stockage indisponible)
  cree_le          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gestion_piece_taille_chk CHECK (taille_octets IS NULL OR taille_octets >= 0)
);

CREATE INDEX IF NOT EXISTS gestion_piece_message_idx ON gestion_piece (message_id);
-- Les pièces NON déposées : la file de rattrapage (une pièce refusée par la liste de types redevient déposable dès qu'Arno
--   ajoute ce type dans gestion_config — encore faut-il pouvoir les retrouver).
CREATE INDEX IF NOT EXISTS gestion_piece_non_stockees_idx ON gestion_piece (message_id) WHERE cle_stockage IS NULL;

COMMENT ON TABLE gestion_piece IS
  'Métadonnées d''une pièce jointe de gestion. Le FICHIER n''est JAMAIS en base (invariant CLAUDE.md §7) : il va sur le stockage objet et seule la clé est gardée. Un dépôt qui échoue laisse la ligne AVEC son motif — aucune pièce n''est perdue en silence, et elle redevient déposable si la configuration change.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 7 — L'ÉVÉNEMENT (la carte) ET SON COMPTEUR.
--   Définition tranchée par Arno : un ÉVÉNEMENT est une demande qui attend une réponse de notre part, quel qu'en soit l'auteur.
--   Il s'ouvre à l'arrivée de la demande et se ferme quand elle est traitée. Tous les mails ne créent PAS un événement.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_compteur (
  annee   integer PRIMARY KEY,
  dernier integer NOT NULL DEFAULT 0,
  CONSTRAINT gestion_compteur_dernier_chk CHECK (dernier >= 0)
);
COMMENT ON TABLE gestion_compteur IS
  'Compteur séquentiel du numéro d''événement, par année. Attribution ATOMIQUE (INSERT … ON CONFLICT (annee) DO UPDATE SET dernier = dernier + 1 RETURNING), donc sans trou ni doublon même à plusieurs. Même patron que demande_compteur (053) et certificat_compteur.';

CREATE TABLE IF NOT EXISTS gestion_evenement (
  id             bigserial   PRIMARY KEY,
  reference      text        NOT NULL,
  -- CE QUE LE MAIL CONTIENT, ET RIEN DE PLUS. Tant qu'il n'existe pas de référentiel de lots, un événement ne porte que du texte
  --   libre : une adresse telle qu'elle est écrite, un nom, un objet. ⚠️ Ne JAMAIS fabriquer un référentiel à partir de ça.
  objet          text        NOT NULL,
  demandeur_nom  text,
  demandeur_email text,
  adresse_libre  text,
  -- 'a_traiter' | 'en_cours' | 'traite'. Liste volontairement COURTE : catégorie, urgence, responsable et date de prochaine
  --   action viendront quand le besoin sera prouvé à l'usage, pas avant (chacun s'ajoute par une colonne, sans reprise).
  etat           text        NOT NULL DEFAULT 'a_traiter',
  note           text,
  ouvert_le      timestamptz NOT NULL DEFAULT now(),
  ouvert_par     bigint      REFERENCES admin_utilisateur(id),
  ouvert_par_libelle text,                 -- nom FIGÉ : lisible des années après, même si le compte est désactivé
  traite_le      timestamptz,
  traite_par     bigint      REFERENCES admin_utilisateur(id),
  traite_par_libelle text,
  maj_le         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gestion_evenement_reference_key UNIQUE (reference),
  CONSTRAINT gestion_evenement_reference_chk CHECK (reference ~ '^GES-[0-9]{4}-[0-9]{6}$'),
  CONSTRAINT gestion_evenement_etat_chk CHECK (etat IN ('a_traiter','en_cours','traite')),
  CONSTRAINT gestion_evenement_objet_chk CHECK (btrim(objet) <> ''),
  -- Cohérence : « traité » et la date de traitement vont ensemble. Un événement traité sans date serait introuvable dans
  --   l'historique ; une date sans l'état ferait mentir la liste.
  CONSTRAINT gestion_evenement_traite_chk CHECK ((etat = 'traite') = (traite_le IS NOT NULL))
);

-- Les cartes OUVERTES, les plus anciennes d'abord (l'ordre de l'écran : ce qui attend depuis le plus longtemps en tête).
CREATE INDEX IF NOT EXISTS gestion_evenement_ouvertes_idx ON gestion_evenement (ouvert_le) WHERE traite_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_evenement_etat_idx     ON gestion_evenement (etat, ouvert_le);

COMMENT ON TABLE gestion_evenement IS
  'La CARTE : une demande qui attend une réponse de notre part, quel qu''en soit l''auteur (locataire, propriétaire, prestataire, syndic). Tant qu''aucun référentiel de lots n''existe, elle ne porte que du TEXTE LIBRE lu dans le mail — on ne fabrique JAMAIS un référentiel à partir de là. ACCROCHE FUTURE : le jour où un référentiel existera, on AJOUTE une colonne lot_id (ALTER TABLE … ADD COLUMN, aucune reprise) et le rapprochement se fera sur l''historique déjà capturé.';
COMMENT ON COLUMN gestion_evenement.adresse_libre IS 'Adresse telle qu''elle est écrite dans le mail. Texte libre ASSUMÉ : c''est la matière du futur rapprochement avec un référentiel de lots, jamais un référentiel en soi.';

-- ── Références externes suivant une carte : MNG-…, n° de sinistre, n° de mission. ────────────────────────────────────────────
-- FORMAT LIBRE → AUCUNE contrainte de forme (doctrine 085_reference_externe.sql:9 : chaque tiers a la sienne, et elle change
--   sans préavis). Unique PAR ÉVÉNEMENT, jamais globalement : deux interventions distinctes sur un même logement sont deux
--   cartes, chacune avec sa référence — c'est un FAIT, pas une ambiguïté.
CREATE TABLE IF NOT EXISTS gestion_reference_externe (
  id           bigserial   PRIMARY KEY,
  evenement_id bigint      NOT NULL REFERENCES gestion_evenement(id) ON DELETE CASCADE,
  reference    text        NOT NULL,
  source       text,                       -- 'monga' | 'assurance' | 'artisan' | 'saisie' — texte libre, jamais une liste fermée
  cree_le      timestamptz NOT NULL DEFAULT now(),
  cree_par     bigint      REFERENCES admin_utilisateur(id),
  cree_par_libelle text,

  CONSTRAINT gestion_reference_externe_key UNIQUE (evenement_id, reference),
  CONSTRAINT gestion_reference_externe_valeur_chk CHECK (btrim(reference) <> '')
);

-- Retrouver une carte à partir d'une référence citée dans un mail, quelle que soit sa ponctuation (MNG-23987 / MNG 23987).
CREATE INDEX IF NOT EXISTS gestion_reference_externe_norm_idx
  ON gestion_reference_externe (upper(regexp_replace(reference, '[[:space:]_-]', '', 'g')));

COMMENT ON TABLE gestion_reference_externe IS
  'Références d''un tiers attachées à une carte (MNG-…, n° de sinistre, n° de mission). ACCROCHE MONGA, posée d''avance et VIDE : aucune intégration n''existe, et la sonde a montré que MONGA est marginal dans le flux (2 messages sur 105 entrants). Format LIBRE, aucune contrainte de forme (doctrine 085).';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 8 — L'AFFECTATION (fil → événement). UNE TABLE, PAS UNE COLONNE.
--   Trois raisons, chacune constatée : un événement peut regrouper PLUSIEURS échanges (décision d'Arno : le locataire écrit,
--   puis le plombier écrit à part, même affaire) ; une affectation se DÉFAIT (et l'historique doit rester) ; un fil peut être
--   reclassé d'une carte à l'autre. Une colonne ne répondrait qu'à la première question, et mal.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_affectation (
  id             bigserial   PRIMARY KEY,
  fil_id         bigint      NOT NULL REFERENCES gestion_fil(id),
  evenement_id   bigint      NOT NULL REFERENCES gestion_evenement(id),
  actif          boolean     NOT NULL DEFAULT true,
  -- Phrase lisible, TOUJOURS écrite, même quand l'affectation est évidente : c'est ce qu'on relit six mois plus tard.
  motif          text        NOT NULL,
  affecte_le     timestamptz NOT NULL DEFAULT now(),
  affecte_par    bigint      REFERENCES admin_utilisateur(id),
  affecte_par_libelle text,
  detache_le     timestamptz,
  detache_par    bigint      REFERENCES admin_utilisateur(id),
  detache_par_libelle text,
  detache_motif  text,

  CONSTRAINT gestion_affectation_motif_chk CHECK (btrim(motif) <> ''),
  -- Cohérence : « détaché » et sa date vont ensemble (une affectation inactive sans date serait inexplicable).
  CONSTRAINT gestion_affectation_detache_chk CHECK (actif = (detache_le IS NULL))
);

-- ⭐ UN FIL N'EST AFFECTÉ QU'À UNE CARTE À LA FOIS (index unique PARTIEL sur les seules affectations actives). L'inverse est
--   libre : une carte porte autant de fils qu'il en faut. C'est exactement la règle demandée, et elle est tenue EN BASE.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_affectation_fil_actif_idx ON gestion_affectation (fil_id) WHERE actif;
CREATE INDEX IF NOT EXISTS gestion_affectation_evenement_idx ON gestion_affectation (evenement_id, affecte_le DESC) WHERE actif;

COMMENT ON TABLE gestion_affectation IS
  'Rattachement d''un ÉCHANGE (fil) à une CARTE (événement). Table et non colonne : une carte regroupe plusieurs échanges, une affectation se défait sans perdre l''historique, un fil se reclasse. Un fil n''a qu''UNE affectation active à la fois (index unique partiel) ; une carte en a autant qu''il en faut. On ne SUPPRIME jamais une affectation : on la détache (actif = false).';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 9 — LE JOURNAL, APPEND-ONLY GARANTI **EN BASE** (patron 118_permis_altitude_journal.sql:58-72).
--   Qui a fait quoi, quand. C'est la pièce qui rend le module auditable — et qui permet de dire, des mois après, pourquoi un
--   message a quitté la file ou pourquoi un fil a été classé sans suite.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_journal (
  id             bigserial   PRIMARY KEY,
  entite         text        NOT NULL,
  -- PAS de clé étrangère, VOLONTAIREMENT (doctrine 118) : la trace doit survivre à la disparition de l'objet qu'elle décrit.
  entite_id      bigint      NOT NULL,
  action         text        NOT NULL,     -- 'capture','exclusion','retour_file','fusion_fil','sans_suite','reprise','affectation','detachement','ouverture','changement_etat','note','reglage'
  valeur_avant   text,
  valeur_apres   text,
  commentaire    text,
  survenu_le     timestamptz NOT NULL DEFAULT now(),   -- quand ÇA s'est passé (≠ quand on l'a saisi)
  auteur_id      bigint,                                -- pas de FK non plus : la trace survit à la purge d'un compte
  auteur_libelle text        NOT NULL DEFAULT 'automatique',  -- nom FIGÉ, ou 'automatique'
  horodatage     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gestion_journal_entite_chk CHECK (entite IN ('message','fil','evenement','affectation','regle','config','releve')),
  CONSTRAINT gestion_journal_action_chk CHECK (btrim(action) <> ''),
  CONSTRAINT gestion_journal_auteur_chk CHECK (btrim(auteur_libelle) <> '')
);

CREATE INDEX IF NOT EXISTS gestion_journal_entite_idx ON gestion_journal (entite, entite_id, horodatage DESC);
CREATE INDEX IF NOT EXISTS gestion_journal_date_idx   ON gestion_journal (horodatage DESC);

-- 🔴 GARDE APPEND-ONLY EN BASE — pas seulement une convention de code : une exception, pour de bon.
CREATE OR REPLACE FUNCTION gestion_journal_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_journal est APPEND-ONLY (pièce de preuve) : % interdit. On ne corrige pas en place — on émet une nouvelle ligne.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_journal_no_update_delete ON gestion_journal;
CREATE TRIGGER gestion_journal_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_journal
  FOR EACH ROW EXECUTE FUNCTION gestion_journal_append_only();
DROP TRIGGER IF EXISTS gestion_journal_no_truncate ON gestion_journal;
CREATE TRIGGER gestion_journal_no_truncate
  BEFORE TRUNCATE ON gestion_journal
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_journal_append_only();

COMMENT ON TABLE gestion_journal IS
  'Journal APPEND-ONLY du module Gestion, à valeur de preuve. 🔴 JAMAIS d''UPDATE/DELETE/TRUNCATE : garanti EN BASE par le trigger gestion_journal_append_only (on émet une nouvelle ligne, on ne corrige pas). Aucune FK (ni entite_id, ni auteur_id) : la trace survit à la purge de l''objet et du compte. survenu_le = quand le fait a eu lieu ; horodatage = quand il a été écrit.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 10 — JOURNAL DES RELÈVES (table SŒUR, jamais `releve_run`).
--   🔴 RAISON IMPÉRATIVE : `releve_run` appartient au module Permis, et son CURSEUR se lit
--   `max(termine_le) WHERE resultat='ok' AND declencheur='planifie'`. Y écrire une ligne de gestion FERAIT AVANCER le curseur de
--   la relève des permis, qui SAUTERAIT alors des messages — en silence. Deux modules, deux journaux. Ne jamais fusionner.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gestion_releve_run (
  id                 bigserial   PRIMARY KEY,
  demarre_le         timestamptz NOT NULL DEFAULT now(),
  termine_le         timestamptz,
  declencheur        text        NOT NULL,   -- 'manuel' | 'planifie' | 'rattrapage'
  dossier            text,                   -- dossier IMAP réellement ouvert (trace : le réglage a pu changer entre deux passes)
  resultat           text        NOT NULL DEFAULT 'en_cours',
  fenetre_depuis     timestamptz,
  uids_serveur       integer,
  vus                integer,
  deja_connus        integer,
  captures           integer,
  exclus             integer,
  fils_touches       integer,
  pieces_deposees    integer,
  pieces_non_deposees integer,
  -- ⚠️ Vrai ⇒ la passe a été TRONQUÉE par le plafond : elle n'a pas tout vu, donc le curseur ne doit PAS avancer sur sa foi.
  plafond_atteint    boolean,
  erreur             text,

  CONSTRAINT gestion_releve_run_resultat_chk CHECK (resultat IN ('en_cours','ok','erreur','ignore')),
  CONSTRAINT gestion_releve_run_declencheur_chk CHECK (declencheur IN ('manuel','planifie','rattrapage'))
);

CREATE INDEX IF NOT EXISTS gestion_releve_run_demarre_idx ON gestion_releve_run (demarre_le DESC);
-- Lecture du CURSEUR : dernière passe planifiée réussie et COMPLÈTE (une passe tronquée n'a rien « certifié vu »).
CREATE INDEX IF NOT EXISTS gestion_releve_run_curseur_idx
  ON gestion_releve_run (termine_le DESC) WHERE resultat = 'ok' AND declencheur = 'planifie' AND plafond_atteint IS NOT TRUE;

COMMENT ON TABLE gestion_releve_run IS
  'Journal des relèves RÉELLES du dossier de gestion (écrit en DEUX TEMPS : « en_cours » avant la connexion, « ok »/« erreur » après, pour qu''un plantage brutal laisse une trace datée). 🔴 TABLE SŒUR de releve_run, JAMAIS la même : le curseur de la relève des permis lit releve_run, et une ligne de gestion l''y ferait avancer à tort, lui faisant sauter des messages en silence.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① les 11 tables du module existent :'
--   SELECT tablename FROM pg_tables WHERE tablename LIKE 'gestion\_%' ORDER BY tablename;
--   -- attendu : gestion_affectation, gestion_compteur, gestion_config, gestion_evenement, gestion_fil, gestion_journal,
--   --           gestion_message, gestion_piece, gestion_regle_exclusion, gestion_reference_externe, gestion_releve_run
--
-- \echo '>>> ② le droit d''accès est posé, et coché pour les seuls administrateurs :'
--   SELECT role, perm_gestion, count(*) FROM admin_utilisateur GROUP BY role, perm_gestion ORDER BY role;
--
-- \echo '>>> ③ la configuration singleton est là, avec ses valeurs de départ :'
--   SELECT dossier_imap, adresse_gestion, domaines_internes, rattrapage_jours, plafond_par_passe,
--          piece_taille_max_mo, conservation_carte_close_mois FROM gestion_config WHERE id = 1;
--   -- attendu : « _GESTION BOITE MAIL » | gestion@criterimmo.fr | criterimmo.fr,sansvisavis.com | 90 | 400 | 25 | 60
--
-- \echo '>>> ④ la graine des règles : 3 ACTIVES (le gabarit prouvé + les 2 domaines internes), 9 posées mais ÉTEINTES :'
--   SELECT actif, type, count(*) FROM gestion_regle_exclusion GROUP BY actif, type ORDER BY actif DESC, type;
--   SELECT type, valeur, sens, actif, motif FROM gestion_regle_exclusion ORDER BY actif DESC, type, valeur;
--   -- ⚠️ Les règles de signal d'en-tête sont ÉTEINTES À DESSEIN : allumées, elles écarteraient aussi les notifications MONGA,
--   --    qui sont de VRAIES demandes. À allumer une par une, en regardant ce qu'elles retirent.
--
-- \echo '>>> ⑤ les listes fermées sont des CHECK NOMMÉS (donc élargissables sans réécrire la table) :'
--   SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid::regclass::text LIKE 'gestion\_%' AND contype = 'c' ORDER BY tbl, conname;
--
-- \echo '>>> ⑥ les index, dont les PARTIELS qui portent la file et la dérivation de « attend une réponse » :'
--   SELECT tablename, indexname FROM pg_indexes WHERE tablename LIKE 'gestion\_%' ORDER BY tablename, indexname;
--
-- \echo '>>> ⑦ preuve que le trigger append-only MORD (INSERT autorisé ; UPDATE et DELETE bloqués ; rien ne subsiste) :'
-- DO $$
-- BEGIN
--   BEGIN
--     INSERT INTO gestion_journal (entite, entite_id, action, auteur_libelle)
--     VALUES ('config', 0, 'test trigger migration 228', 'migration:228');
--     BEGIN
--       UPDATE gestion_journal SET action = 'x' WHERE auteur_libelle = 'migration:228';
--       RAISE EXCEPTION 'ÉCHEC : l''UPDATE de gestion_journal aurait dû être bloqué par le trigger append-only';
--     EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'OK : UPDATE gestion_journal bloqué (%).', SQLERRM;
--     END;
--     BEGIN
--       DELETE FROM gestion_journal WHERE auteur_libelle = 'migration:228';
--       RAISE EXCEPTION 'ÉCHEC : le DELETE de gestion_journal aurait dû être bloqué par le trigger append-only';
--     EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'OK : DELETE gestion_journal bloqué (%).', SQLERRM;
--     END;
--     RAISE EXCEPTION '__ROLLBACK_VERIF__';  -- annule l'INSERT de test (le DELETE étant bloqué, c'est la seule voie)
--   EXCEPTION WHEN OTHERS THEN
--     IF SQLERRM <> '__ROLLBACK_VERIF__' THEN RAISE; END IF;
--     RAISE NOTICE 'Vérification trigger terminée (ligne de test annulée, rien ne subsiste).';
--   END;
-- END;
-- $$;
--
-- \echo '>>> ⑧ preuve qu''un fil n''a qu''UNE affectation active (l''index unique partiel mord) — à lancer dans une transaction annulée :'
--   -- BEGIN;
--   --   INSERT INTO gestion_fil (cle) VALUES ('test@228') RETURNING id;            -- soit :fil
--   --   INSERT INTO gestion_compteur (annee, dernier) VALUES (1900, 0) ON CONFLICT DO NOTHING;
--   --   INSERT INTO gestion_evenement (reference, objet) VALUES ('GES-1900-000001', 'test A') RETURNING id;  -- soit :ev1
--   --   INSERT INTO gestion_evenement (reference, objet) VALUES ('GES-1900-000002', 'test B') RETURNING id;  -- soit :ev2
--   --   INSERT INTO gestion_affectation (fil_id, evenement_id, motif) VALUES (:fil, :ev1, 'test');           -- OK
--   --   INSERT INTO gestion_affectation (fil_id, evenement_id, motif) VALUES (:fil, :ev2, 'test');           -- DOIT ÉCHOUER
--   -- ROLLBACK;
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (la migration est additive, donc entièrement réversible tant qu'aucun message n'a été capturé) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     DROP TABLE IF EXISTS gestion_releve_run; \
--     DROP TABLE IF EXISTS gestion_journal; \
--     DROP FUNCTION IF EXISTS gestion_journal_append_only(); \
--     DROP TABLE IF EXISTS gestion_affectation; \
--     DROP TABLE IF EXISTS gestion_reference_externe; \
--     DROP TABLE IF EXISTS gestion_evenement; \
--     DROP TABLE IF EXISTS gestion_compteur; \
--     DROP TABLE IF EXISTS gestion_piece; \
--     DROP TABLE IF EXISTS gestion_message; \
--     DROP TABLE IF EXISTS gestion_fil; \
--     DROP TABLE IF EXISTS gestion_regle_exclusion; \
--     DROP TABLE IF EXISTS gestion_config; \
--     ALTER TABLE admin_utilisateur DROP COLUMN IF EXISTS perm_gestion; \
--     COMMIT;"
--   (Ordre imposé par les clés étrangères. Aucune fonction ni aucun objet d'un autre module n'est touché.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
