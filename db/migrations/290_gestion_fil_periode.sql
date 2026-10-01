-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 290 — LES PÉRIODES DE CLASSEMENT D'UNE CONVERSATION (lot SUIVI-CONVERSATION, 01/10/2026)
--
-- 🔴🔴 MIGRATION LIVRÉE NON APPLIQUÉE. Je demande avant.
--
--    Pour l'appliquer :  psql "$DATABASE_URL" -f db/migrations/290_gestion_fil_periode.sql
--    Puis la reprise   :  npm run gestion:periodes:reprise -- --appliquer
--
-- ═══ 🔴 CE QU'ELLE SERT ═════════════════════════════════════════════════════════════════════════════════════════
--
-- RÈGLE D'ARNO : « Une conversation peut changer de sujet. Son classement se découpe en PÉRIODES successives.
-- Chaque mail retient la règle sous laquelle il a été classé, et alimente l'historique des biens de SA période.
-- Un changement en cours de route n'efface jamais le passé (sauf “Toute la conversation”). »
--
-- Aujourd'hui, le classement est posé MAIL PAR MAIL dans `gestion_rattachement`. Rien ne dit SOUS QUELLE RÈGLE
-- un mail a été classé : on ne distingue pas « ce mail-ci seulement » de « à partir d'ici, toute la suite ».
-- D'où l'impossibilité d'hériter correctement à l'arrivée d'un mail, et la tentation d'écraser le passé.
--
-- ═══ 🔴🔴 CE QUE CES TABLES NE FONT PAS, ET C'EST LE POINT LE PLUS IMPORTANT ════════════════════════════════════
--
-- ELLES NE REMPLACENT PAS `gestion_rattachement`. Les périodes sont la couche d'INTENTION ; elles sont PROJETÉES
-- sur les mails, et c'est `gestion_rattachement` qui reste la vérité que tout le reste de l'application lit —
-- la capsule d'une ligne de liste, l'historique d'un bien, les compteurs, l'arbre du Drive, la file à trier.
--
-- 🔴 POURQUOI CE CHOIX PLUTÔT QUE DE TOUT RÉÉCRIRE. Faire des périodes la source de vérité aurait demandé de
-- reprendre CHAQUE lecture de classement de l'application — des dizaines, dont certaines dans des requêtes
-- lourdes. La projection, elle, répond mot pour mot à la demande (« un mail est dans l'historique d'un bien si
-- sa période ou son exception contient ce bien ») sans toucher à une seule de ces lectures.
--
-- ═══ CE QUE CETTE MIGRATION FAIT, ET RIEN DE PLUS ═══════════════════════════════════════════════════════════════
--
-- QUATRE TABLES NOUVELLES, aucune colonne touchée, aucune ligne existante modifiée, aucun DELETE. Tant que la
-- reprise (commande ci-dessus) n'a pas été lancée, elles sont VIDES et l'application se comporte exactement
-- comme avant : sans période, le classement d'un mail reste ce qu'il est aujourd'hui.
--
-- 🔒 Les 🔴🔴 « Documents clients scannés » ne sont concernés à aucun titre.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① LES PÉRIODES ──────────────────────────────────────────────────────────────────────────────────────────────
-- Une période commence à un mail (inclus) et court jusqu'à la suivante, ou jusqu'à la fin de la conversation.
CREATE TABLE IF NOT EXISTS gestion_fil_periode (
  id                bigserial PRIMARY KEY,
  fil_id            bigint      NOT NULL,
  -- 🔴 LE MAIL À PARTIR DUQUEL ELLE S'APPLIQUE. C'est sa POSITION dans la conversation qui ordonne les périodes,
  --    jamais l'identifiant ni la date de création : un mail capturé en retard porte un id plus grand qu'un mail
  --    plus ancien, et trier par id placerait la période au mauvais endroit.
  depuis_message_id bigint      NOT NULL,
  sorte             text        NOT NULL,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint,
  cree_par_libelle  text        NOT NULL,
  -- 🔴 « Toute la conversation » REMPLACE les périodes : elles sont DATÉES, jamais supprimées. On doit pouvoir
  --    dire, six mois plus tard, qu'une période a existé et qui l'a remplacée.
  remplacee_le      timestamptz,
  remplacee_par_libelle text,

  CONSTRAINT gestion_fil_periode_sorte_chk
    CHECK (sorte = ANY (ARRAY['biens'::text, 'interne'::text, 'hors_gestion'::text])),
  -- 🔴 JAMAIS AUTOMATIQUE : une période est une décision humaine. Même garde que `gestion_fil_interne`.
  CONSTRAINT gestion_fil_periode_humain_chk
    CHECK (btrim(cree_par_libelle) <> '' AND lower(btrim(cree_par_libelle)) <> 'automatique')
);

-- Les biens d'une période (vide pour « interne » et « hors gestion »).
CREATE TABLE IF NOT EXISTS gestion_fil_periode_bien (
  periode_id    bigint NOT NULL REFERENCES gestion_fil_periode(id) ON DELETE CASCADE,
  cible_cle     text   NOT NULL,
  cible_libelle text   NOT NULL,
  PRIMARY KEY (periode_id, cible_cle)
);

-- ── ② LES EXCEPTIONS ────────────────────────────────────────────────────────────────────────────────────────────
-- Une exception porte sur UN mail et sur lui seul. Elle ne déplace aucune période : le mail suivant reprend la
-- règle d'avant. C'est le « Ce mail uniquement » d'Arno.
--
-- ⚠️ UNE TABLE À PART, ET NON UNE COLONNE SUR `gestion_rattachement` : une exception peut être « interne »,
-- « hors gestion », ou VIDE (ce mail-ci n'est rattaché à rien). Aucun de ces trois cas ne produit de ligne de
-- rattachement — une colonne n'aurait donc eu nulle part où vivre.
CREATE TABLE IF NOT EXISTS gestion_message_exception (
  id               bigserial PRIMARY KEY,
  message_id       bigint      NOT NULL,
  sorte            text        NOT NULL,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  cree_par         bigint,
  cree_par_libelle text        NOT NULL,
  retiree_le       timestamptz,

  CONSTRAINT gestion_message_exception_sorte_chk
    CHECK (sorte = ANY (ARRAY['biens'::text, 'interne'::text, 'hors_gestion'::text])),
  CONSTRAINT gestion_message_exception_humain_chk
    CHECK (btrim(cree_par_libelle) <> '' AND lower(btrim(cree_par_libelle)) <> 'automatique')
);

CREATE TABLE IF NOT EXISTS gestion_message_exception_bien (
  exception_id  bigint NOT NULL REFERENCES gestion_message_exception(id) ON DELETE CASCADE,
  cible_cle     text   NOT NULL,
  cible_libelle text   NOT NULL,
  PRIMARY KEY (exception_id, cible_cle)
);

-- ── ③ LES INDEX DES QUESTIONS RÉELLEMENT POSÉES ─────────────────────────────────────────────────────────────────
-- « Quelles sont les périodes VIVANTES de cette conversation ? » — la question de chaque ouverture de fil.
CREATE INDEX IF NOT EXISTS gestion_fil_periode_fil_idx
  ON gestion_fil_periode (fil_id) WHERE remplacee_le IS NULL;
-- « Ce mail porte-t-il une exception vivante ? » — UNE seule à la fois, et la base le garantit.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_message_exception_vivante_idx
  ON gestion_message_exception (message_id) WHERE retiree_le IS NULL;

COMMENT ON TABLE gestion_fil_periode IS
  'Lot SUIVI-CONVERSATION — une periode de classement d''une conversation : elle commence au mail '
  'depuis_message_id (inclus) et court jusqu''a la periode suivante, ou jusqu''a la fin du fil. Couche '
  'd''INTENTION : elle est PROJETEE sur gestion_rattachement / gestion_fil_interne / gestion_hors_gestion, qui '
  'restent la verite lue par le reste de l''application.';

COMMENT ON TABLE gestion_message_exception IS
  'Lot SUIVI-CONVERSATION — « Ce mail uniquement » : un classement qui porte sur UN mail et ne deplace aucune '
  'periode. Jamais ecrasee par « Toute la conversation ».';

COMMIT;
