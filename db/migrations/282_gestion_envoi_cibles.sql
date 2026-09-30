-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 282 — LES BIENS CHOISIS PENDANT L'ÉCRITURE, EN ATTENTE DE LEUR MESSAGE (lot RATTACHER-EN-ECRIVANT, 30/09/2026)
--
-- 🔴🔴 MIGRATION LIVRÉE NON APPLIQUÉE. La règle du module : une migration se livre, elle ne s'applique pas toute
-- seule. Je demande avant.
--
--    Pour l'appliquer :  psql "$DATABASE_URL" -f db/migrations/282_gestion_envoi_cibles.sql
--
-- ═══ 🔴🔴 CE QUE ÇA RÉPARE — UNE FONCTION QUI N'EXISTAIT QU'À MOITIÉ ════════════════════════════════════════════
--
-- Le brouillon porte depuis le lot REDACTION-GMAIL un champ `cibles` : les biens choisis dans « Classer ce mail »
-- pendant qu'on écrit. `envoi.ts` déclare même la dépendance qui devrait les poser après l'envoi
-- (`DepsEnvoiComplet.classer`).
--
-- 🔴 CETTE DÉPENDANCE N'A JAMAIS ÉTÉ CÂBLÉE. Constaté le 30/09/2026 : `depsEnvoiReel` ne la fournit pas, aucun
-- appelant ne la fournit, et `deps.classer` vaut donc `undefined` en production. Les biens cochés à l'écriture
-- n'étaient posés NULLE PART — sans erreur, sans trace, sans que rien ne le dise. La demande d'Arno (« Valider =
-- le mail, à l'envoi, est rattaché à TOUS les biens cochés ») ne pouvait pas être tenue sans cette table.
--
-- ═══ 🔴 POURQUOI UNE TABLE D'ATTENTE, ET NON UN RATTACHEMENT POSÉ TOUT DE SUITE ═════════════════════════════════
--
-- `gestion_rattachement` désigne un MESSAGE. Or, au moment de l'envoi, le message n'existe pas encore en base :
-- c'est la relève qui le capturera, quelques minutes plus tard, depuis le dossier « Envoyés » de Gmail. Poser le
-- rattachement tout de suite demanderait d'inventer une ligne de message — c'est-à-dire d'écrire une deuxième
-- fois, à la main, ce que la relève sait faire, et de devoir les réconcilier ensuite.
--
-- L'intention est donc ÉCRITE ET DATÉE ici, attachée à l'envoi. Quand la relève capture le message (reconnu par
-- son `gmail_message_id`), un rattrapage transforme chaque intention en un vrai rattachement MANUEL confirmé, et
-- date `applique_le`. Rien n'est perdu si la relève tarde ; rien n'est posé deux fois si elle repasse.
--
-- ═══ 🔴 CE QUI EST POSÉ EST UN GESTE HUMAIN, ET LA BASE LE SAIT ═════════════════════════════════════════════════
--
-- Ces cibles ont été cochées par quelqu'un, dans une fenêtre, avant d'envoyer. Le rattachement qui en naîtra est
-- donc `origine = 'manuel'` et `statut = 'confirme'` — pas une proposition à trancher une seconde fois. La colonne
-- `auteur_libelle` porte son nom, et la contrainte refuse le vide et le mot « automatique ».
--
-- ═══ CE QUE CETTE MIGRATION NE FAIT PAS ════════════════════════════════════════════════════════════════════════
--
-- Elle ne touche NI `gestion_rattachement`, NI `gestion_message`, NI `gestion_envoi` (aucune colonne ajoutée à une
-- table existante), NI aucune contrainte en place. C'est une table neuve, vide, et rien d'autre. Sans elle, la
-- sonde `envoiCiblesDisponibles()` ne la nomme nulle part et l'écran dit que le classement à l'écriture n'est pas
-- encore installé — exactement le comportement d'avant ce lot, mais DIT.
--
-- 🔒 Les 🔴🔴 « Documents clients scannés » ne sont concernés à aucun titre.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_envoi_cible (
  id              bigserial PRIMARY KEY,
  envoi_id        bigint      NOT NULL REFERENCES gestion_envoi(id) ON DELETE CASCADE,
  -- La cible, dans les mots de `gestion_rattachement` : à l'application, on COPIE, on ne traduit pas.
  cible_sorte     text        NOT NULL,
  cible_cle       text,
  cible_id        bigint,
  cible_libelle   text        NOT NULL,
  auteur_id       bigint      REFERENCES admin_utilisateur(id),
  -- 🔴 LE NOM DU COLLABORATEUR, TOUJOURS : ce qui sera posé est un geste HUMAIN (voir l'encadré ci-dessus).
  auteur_libelle  text        NOT NULL,
  pose_le         timestamptz NOT NULL DEFAULT now(),
  -- Rempli par le rattrapage, quand le message a été capturé et le rattachement posé. NULL = encore en attente.
  applique_le     timestamptz,
  -- Le message finalement capturé, pour pouvoir remonter du rattachement à l'intention qui l'a produit.
  message_id      bigint      REFERENCES gestion_message(id) ON DELETE SET NULL,
  -- 🔴 LES MÊMES SORTES QUE LE BROUILLON, et pas une de plus. `proprietaire` et `locataire` en sont EXCLUES
  --    depuis le lot FICHE-RATTACHEMENT : c'était une voie de création de liens « personne » qui ne s'ouvrait
  --    qu'à l'envoi. Le type la ferme à la compilation, la route à l'exécution, cette contrainte en base.
  CONSTRAINT gestion_envoi_cible_sorte_chk
    CHECK (cible_sorte = ANY (ARRAY['lot'::text, 'evenement'::text])),
  -- 🔴 JAMAIS AUTOMATIQUE : un garde applicatif se contourne au prochain script, une contrainte non.
  CONSTRAINT gestion_envoi_cible_humain_chk
    CHECK (btrim(auteur_libelle) <> '' AND lower(btrim(auteur_libelle)) <> 'automatique'),
  -- Une application est datée ET rattachée à son message, ou n'existe pas : une moitié d'application ne se lit pas.
  CONSTRAINT gestion_envoi_cible_application_chk
    CHECK ((applique_le IS NULL AND message_id IS NULL) OR (applique_le IS NOT NULL AND message_id IS NOT NULL))
);

-- ⚠️ UNICITÉ : une cible n'est cochée qu'une fois par envoi. Rejouer la validation ne crée pas de doublon, et
--    `ON CONFLICT DO NOTHING` s'y appuie. `coalesce` parce qu'une clé nulle est une valeur comme une autre ici.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_envoi_cible_unique_idx
  ON gestion_envoi_cible (envoi_id, cible_sorte, coalesce(cible_cle, ''), coalesce(cible_id, 0));

-- La question du rattrapage : « quelles intentions attendent encore leur message ? ». Index PARTIEL — les
--   intentions déjà appliquées ne sont plus jamais relues, et elles seront bientôt les plus nombreuses.
CREATE INDEX IF NOT EXISTS gestion_envoi_cible_attente_idx
  ON gestion_envoi_cible (envoi_id) WHERE applique_le IS NULL;

COMMENT ON TABLE gestion_envoi_cible IS
  'Lot RATTACHER-EN-ECRIVANT — les biens cochés pendant l''écriture d''un mail, en attente que la relève capture '
  'le message envoyé. Un rattrapage les transforme alors en rattachements MANUELS confirmés et date applique_le. '
  'Répare une fonction qui n''existait qu''à moitié : DepsEnvoiComplet.classer n''avait jamais été câblée.';

COMMIT;
