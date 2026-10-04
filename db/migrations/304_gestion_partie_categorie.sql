-- 304_gestion_partie_categorie.sql — MODULE « GESTION » : TROIS CATÉGORIES DE PARTIES, ET LES CARTES DE CONTACT.
-- LOT HISTORIQUE-BIEN-1, COUCHE DE DONNÉES.
--
-- 🔴🔴 MIGRATION LIVRÉE. STRICTEMENT ADDITIVE : elle ne crée que DEUX TABLES NEUVES et leurs index. Elle ne touche
--    AUCUNE table existante — aucun ALTER, aucun UPDATE, aucun DELETE, aucun DROP, aucune contrainte desserrée.
--    Tant qu'elle n'est pas appliquée, les sondes `partieCategorieDisponible()` et `contactCarteDisponible()`
--    répondent « non », les deux tables ne sont NOMMÉES NULLE PART, et tout le module se comporte exactement comme
--    avant ce lot. C'est la règle du module depuis l'incident du lot 4a : nommer une table absente ne casse pas la
--    fonction nouvelle, il casse TOUT l'écran.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CE QU'ARNO A DÉCIDÉ (04/10/2026), ET CE QUE CES DEUX TABLES RANGENT.
--
-- Une adresse qui apparaît sur le courrier d'un bien sans être au fichier n'est pas « un contact » en général : elle
-- est le contact DE QUELQU'UN. Trois catégories, et une liste d'attente :
--
--   · `proprietaire`  — CONTACT DU PROPRIÉTAIRE de ce bien (son mandataire, son notaire, son fils) ;
--   · `locataire`     — CONTACT DU LOCATAIRE de ce bien (sa famille, son assureur, son garant) ;
--   · `independant`   — diagnostiqueur, artisan, prestataire, syndic, autre agence. Catégorie **GLOBALE** : rangée
--                       UNE FOIS pour tous les biens, et **JAMAIS rattachée à un bien** ;
--   · `a_repartir`    — on ne sait pas encore, et on le DIT plutôt que de deviner.
--
-- 🔴🔴 UN CONTACT N'EST JAMAIS UN CLIENT. Aucune de ces lignes ne fait de personne un propriétaire ni un locataire :
--    elles ne comptent pas dans « PROPRIÉTAIRE N » ni dans « LOCATAIRE EN PLACE N » de la fiche, elles ne donnent
--    ni le statut ni le badge, et elles ne changent RIEN à la détermination du locataire à une date (laquelle ne
--    lit que `gestion_annuaire_occupation`). Les clients restent dans l'annuaire WIPPIMMO, et nulle part ailleurs.
--
-- ═══ 🔒 LE GARDE LE PLUS IMPORTANT : UN INDÉPENDANT NE SERT JAMAIS À L'AUTOMATISATION ══════════════════════════════
--
-- Mesuré sur la base le 04/10/2026, avant toute écriture : la règle des conversations, appliquée seule, fabriquait
-- des « contacts du propriétaire » à partir de prestataires qui travaillent pour nous sur des dizaines de biens —
-- `gdsproprete@gmail.com` (société de ménage) sur **40 biens**, `assistance@wipimo.fr` (l'éditeur du logiciel) sur
-- **31**, `a.bruneel@grospiron.com` (déménageur), `jcordel@mavimmo.fr` (une autre agence). **65 adresses sur 640
-- expliquaient 312 des 887 paires (bien, adresse).**
--
-- 🔴 D'OÙ LA RÈGLE, ET D'OÙ LE GARDE. Un `independant` — PROPOSÉ comme VÉRIFIÉ — ne sert à AUCUNE déduction : aucun
-- bien n'est déduit de son adresse, aucun rattachement automatique n'est posé à partir d'elle. Son `lot_cle` est
-- `NULL` **en base**, pas seulement dans le code : la contrainte `_portee_chk` ci-dessous rend l'erreur
-- IMPOSSIBLE À ÉCRIRE, au lieu de compter sur la vigilance de la prochaine requête. Le module pur
-- `app/lib/gestion/partieCategorie.ts` porte la même règle côté code (`sertALAutomatisation`), et un test de garde
-- la prouve.
--
-- ═══ 🔴 LA RÈGLE PAR DÉFAUT, À TROIS ÉTAGES (validée, et mesurée avant d'être écrite) ══════════════════════════════
--
--   ① l'adresse apparaît sur PLUSIEURS biens        → `independant`, origine `propose` (« à vérifier ») ;
--   ② elle n'apparaît que sur UN SEUL bien          → `proprietaire` ou `locataire`, selon qu'elle participe à une
--                                                     même conversation (`fil_id`) que le propriétaire ou que le
--                                                     locataire de ce bien, origine `defaut` ;
--   ③ elle parle avec LES DEUX, ou avec AUCUN       → `a_repartir`, origine `defaut`.
--
-- Mesure du 04/10/2026 (reprise en simulation, lecture seule) : **65 indépendants proposés**, **485 cartes**
-- (318 côté propriétaire, 167 côté locataire) sur **164 biens**, **90 « à répartir »** sur 50 biens.
--
-- 🔴 LE CHOIX MANUEL PRIME TOUJOURS, et la reprise ne doit JAMAIS écraser une ligne `origine = 'manuel'`. C'est la
-- raison d'être de la colonne `origine` : sans elle, on ne saurait pas distinguer ce qu'une règle a posé de ce que
-- quelqu'un a décidé — et la passe suivante reprendrait la main sur une décision humaine, en silence.
--
-- ═══ 🔴 RIEN N'EST JAMAIS SUPPRIMÉ : ON DATE ET ON SIGNE ═══════════════════════════════════════════════════════════
--
-- Comme partout dans ce module (`gestion_hors_gestion`, `gestion_fil_interne`, `gestion_message_interne`), une
-- catégorie ou une carte RETIRÉE garde sa ligne, avec qui l'a retirée, quand et pourquoi. L'unicité ne porte donc
-- que sur les lignes VIVANTES (index PARTIELS `WHERE retire_le IS NULL`) — et c'est la leçon de la migration 301 :
-- une ligne morte ne doit jamais bloquer la réécriture d'un rangement corrigé.
--
-- ⚠️ CONSÉQUENCE POSTGRESQL, À NE PAS OUBLIER CÔTÉ CODE : pour viser un index PARTIEL, un `ON CONFLICT` doit
-- RÉPÉTER SON PRÉDICAT — `ON CONFLICT (adresse, coalesce(lot_cle, '')) WHERE retire_le IS NULL`. Sans le prédicat,
-- PostgreSQL rend « there is no unique or exclusion constraint matching the ON CONFLICT specification », erreur
-- déjà payée une fois le 04/10/2026 sur `gestion_piece_drive`.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : deux `CREATE TABLE IF NOT EXISTS` et leurs index, rien d'autre. Aucun DROP, aucun DELETE, aucune colonne
--   modifiée en place, aucune donnée existante touchée. Ne touche NI le module Permis, NI le moteur SVAV, NI le
--   verdict, NI le golden Asnières (29.107259068449615). Une seule transaction. Rejouable (idempotente).
--
-- Application MANUELLE, arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/304_gestion_partie_categorie.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.

BEGIN;

-- ═══ ① LA CATÉGORIE D'UNE PARTIE ═══════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gestion_partie_categorie (
  id                   bigserial PRIMARY KEY,

  -- L'ADRESSE, EN MINUSCULES. Une seule écriture possible pour une seule personne : sans cette normalisation en
  --   base, « Jean@X.fr » et « jean@x.fr » seraient deux catégories vivantes pour la même boîte, et l'index
  --   d'unicité ne les verrait pas. La contrainte le dit ICI, pas seulement dans le code qui insère.
  adresse              text        NOT NULL,

  -- 🔴 NULL = CATÉGORIE GLOBALE, c'est-à-dire `independant` : rangée une fois pour TOUS les biens. Toute autre
  --   catégorie porte OBLIGATOIREMENT un bien (`_portee_chk`).
  lot_cle              text,

  categorie            text        NOT NULL,

  -- `defaut`  : la règle à trois étages a tranché (étages ② et ③) ;
  -- `propose` : la règle PROPOSE un indépendant et le dit « à vérifier » (étage ①) ;
  -- `manuel`  : quelqu'un a décidé. 🔴 CELLE-LÀ N'EST JAMAIS ÉCRASÉE PAR UNE REPRISE.
  origine              text        NOT NULL,

  -- « Vérifié » : un humain a regardé et confirmé. Ne change PAS la catégorie — il retire la mention « à vérifier ».
  verifie_le           timestamptz,
  verifie_par          bigint      REFERENCES admin_utilisateur(id),
  verifie_par_libelle  text,

  pose_le              timestamptz NOT NULL DEFAULT now(),
  pose_par             bigint      REFERENCES admin_utilisateur(id),
  pose_par_libelle     text        NOT NULL,

  -- LE QUATUOR DE RETRAIT — on ne supprime pas, on retire : qui, quand, pourquoi.
  retire_le            timestamptz,
  retire_par           bigint      REFERENCES admin_utilisateur(id),
  retire_par_libelle   text,
  retire_motif         text,

  CONSTRAINT gestion_partie_categorie_adresse_chk
    CHECK (adresse = lower(btrim(adresse)) AND btrim(adresse) <> ''),

  CONSTRAINT gestion_partie_categorie_lot_chk
    CHECK (lot_cle IS NULL OR btrim(lot_cle) <> ''),

  CONSTRAINT gestion_partie_categorie_categorie_chk
    CHECK (categorie IN ('proprietaire', 'locataire', 'independant', 'a_repartir')),

  CONSTRAINT gestion_partie_categorie_origine_chk
    CHECK (origine IN ('defaut', 'propose', 'manuel')),

  -- 🔴🔴 LE GARDE EN BASE : un `independant` est GLOBAL (lot_cle IS NULL), et toute autre catégorie porte un bien.
  --    L'équivalence dans les DEUX SENS, exprès : elle interdit aussi bien « un indépendant rattaché à un bien »
  --    (qui ouvrirait la porte à une déduction de bien depuis son adresse) que « un contact du propriétaire sans
  --    bien » (qui ne voudrait rien dire — contact du propriétaire DE QUOI ?).
  CONSTRAINT gestion_partie_categorie_portee_chk
    CHECK ((categorie = 'independant') = (lot_cle IS NULL)),

  -- ⚠️ L'AUTEUR EST TOUJOURS ÉCRIT, et il est HUMAIN dès que le choix est MANUEL : une décision a un auteur. Les
  --    origines `defaut` et `propose` sont, elles, le fait d'une passe — elles peuvent signer « automatique », et
  --    c'est la vérité. Interdire « automatique » partout aurait obligé la reprise à signer d'un faux nom humain.
  CONSTRAINT gestion_partie_categorie_auteur_chk
    CHECK (btrim(pose_par_libelle) <> ''
           AND (origine <> 'manuel' OR lower(btrim(pose_par_libelle)) <> 'automatique')),

  -- ⚠️ « VÉRIFIÉ » EST TOUJOURS UN GESTE HUMAIN, sans exception : c'est ce que la mention « à vérifier » promet au
  --    lecteur. Une vérification automatique serait un mensonge d'écran.
  CONSTRAINT gestion_partie_categorie_verifie_chk
    CHECK ((verifie_le IS NULL AND verifie_par_libelle IS NULL)
           OR (verifie_le IS NOT NULL AND btrim(coalesce(verifie_par_libelle, '')) <> ''
               AND lower(btrim(verifie_par_libelle)) <> 'automatique')),

  -- ⚠️ UN RETRAIT SANS AUTEUR NE SE DÉFEND PAS : les deux vont ensemble, ou aucun des deux.
  CONSTRAINT gestion_partie_categorie_retrait_chk
    CHECK ((retire_le IS NULL AND retire_par_libelle IS NULL)
           OR (retire_le IS NOT NULL AND btrim(coalesce(retire_par_libelle, '')) <> ''))
);

-- 🔴🔴 UNE SEULE CATÉGORIE VIVANTE PAR (ADRESSE, BIEN) — ET UNE SEULE GLOBALE PAR ADRESSE.
--    `coalesce(lot_cle, '')` fait les deux d'un seul index : les lignes globales se rangent sous la clé vide, donc
--    une adresse ne peut pas être « indépendante » deux fois. Le `lot_cle` littéralement vide est interdit par
--    `_lot_chk`, il ne peut donc pas entrer en collision avec elles.
--    ⚠️ Sans cet index, deux poses concurrentes laisseraient deux lignes ouvertes, et retirer la catégorie n'en
--    fermerait qu'une — l'adresse resterait rangée sans que rien ne le dise (leçon de `gestion_message_interne`).
CREATE UNIQUE INDEX IF NOT EXISTS gestion_partie_categorie_vivante_idx
  ON gestion_partie_categorie (adresse, coalesce(lot_cle, '')) WHERE retire_le IS NULL;

-- La lecture courante : « les catégories de CE bien », pour une fiche.
CREATE INDEX IF NOT EXISTS gestion_partie_categorie_lot_idx
  ON gestion_partie_categorie (lot_cle, adresse) WHERE retire_le IS NULL;

-- La lecture croisée : « que sait-on de CETTE adresse ? » — par bien et en global, en une requête.
CREATE INDEX IF NOT EXISTS gestion_partie_categorie_adresse_idx
  ON gestion_partie_categorie (adresse, categorie) WHERE retire_le IS NULL;

COMMENT ON TABLE gestion_partie_categorie IS
  'LOT HISTORIQUE-BIEN-1 : de QUI cette adresse est-elle le contact — du propriétaire, du locataire, de personne '
  '(independant, GLOBAL : lot_cle IS NULL, jamais rattaché à un bien, JAMAIS utilisé pour l''automatisation), ou '
  'pas encore tranché (a_repartir). Un contact n''est JAMAIS un client. origine=manuel ne doit jamais être écrasée '
  'par une reprise. Rien n''est supprimé : on retire en datant et en signant.';

COMMENT ON COLUMN gestion_partie_categorie.lot_cle IS
  'NULL = catégorie GLOBALE (independant, rangé une fois pour tous les biens). NON NULL pour toute autre '
  'catégorie — contrainte gestion_partie_categorie_portee_chk, dans les deux sens.';

COMMENT ON COLUMN gestion_partie_categorie.origine IS
  'defaut = la règle a tranché · propose = indépendant PROPOSÉ, à vérifier · manuel = décidé par quelqu''un, '
  'JAMAIS écrasé par une reprise.';

-- ═══ ② LA CARTE DE CONTACT D'UN BIEN ══════════════════════════════════════════════════════════════════════════════
--
-- Une carte est l'OBJET D'ÉCRAN du côté propriétaire ou du côté locataire d'UN bien. Elle est distincte de la
-- catégorie ci-dessus, et ce n'est pas une redondance :
--   · la CATÉGORIE dit « de qui cette adresse est le contact » — un jugement, qui peut être global ;
--   · la CARTE est ce qu'on AFFICHE sur un bien, avec le nom deviné et le téléphone s'il existe — un contenu, qui
--     se complète à la main. Une catégorie peut exister sans carte (`independant`, `a_repartir` : AUCUNE carte).
--
-- ⚠️ `nom` ET `telephone` SONT NULLABLES, ET LE CAS A ÉTÉ MESURÉ : `rusanov_d@me.com` n'a JAMAIS écrit (0 envoi,
-- 29 fois en copie). Son nom ne peut donc pas être deviné depuis un en-tête — sa carte naît avec la seule adresse.
-- C'est exactement ce que la mention « Créée automatiquement — à vérifier et compléter » couvre.
--
-- 🔴 AUCUNE CARTE POUR UN INDÉPENDANT : la table n'a pas de `cote = 'independant'`, et son `lot_cle` est NOT NULL.
-- Un indépendant n'étant jamais rattaché à un bien, il n'a rien à y afficher.

CREATE TABLE IF NOT EXISTS gestion_contact_carte (
  id                   bigserial PRIMARY KEY,

  -- 🔴 NOT NULL : une carte est TOUJOURS la carte d'un bien. (Un indépendant n'en a pas — voir ci-dessus.)
  lot_cle              text        NOT NULL,

  -- De quel côté du bien : `proprietaire` ou `locataire`. Jamais autre chose.
  cote                 text        NOT NULL,

  adresse              text        NOT NULL,

  -- Le nom DEVINÉ depuis les en-têtes, quand il y en a un, et le téléphone quand on le connaît. Les deux peuvent
  --   manquer : une carte sans nom reste une carte utile, et elle le DIT.
  nom                  text,
  telephone            text,

  -- `auto` : créée par la passe de reprise · `manuel` : créée (ou corrigée) par quelqu'un.
  origine              text        NOT NULL,

  verifie_le           timestamptz,
  verifie_par          bigint      REFERENCES admin_utilisateur(id),
  verifie_par_libelle  text,

  cree_le              timestamptz NOT NULL DEFAULT now(),
  cree_par             bigint      REFERENCES admin_utilisateur(id),
  cree_par_libelle     text        NOT NULL,

  retire_le            timestamptz,
  retire_par           bigint      REFERENCES admin_utilisateur(id),
  retire_par_libelle   text,
  retire_motif         text,

  CONSTRAINT gestion_contact_carte_lot_chk      CHECK (btrim(lot_cle) <> ''),
  CONSTRAINT gestion_contact_carte_cote_chk     CHECK (cote IN ('proprietaire', 'locataire')),
  CONSTRAINT gestion_contact_carte_adresse_chk
    CHECK (adresse = lower(btrim(adresse)) AND btrim(adresse) <> ''),
  CONSTRAINT gestion_contact_carte_origine_chk  CHECK (origine IN ('auto', 'manuel')),

  -- ⚠️ MÊME RÈGLE D'AUTEUR QUE CI-DESSUS : toujours écrit, humain dès que c'est un geste (`origine = 'manuel'`).
  CONSTRAINT gestion_contact_carte_auteur_chk
    CHECK (btrim(cree_par_libelle) <> ''
           AND (origine <> 'manuel' OR lower(btrim(cree_par_libelle)) <> 'automatique')),

  CONSTRAINT gestion_contact_carte_verifie_chk
    CHECK ((verifie_le IS NULL AND verifie_par_libelle IS NULL)
           OR (verifie_le IS NOT NULL AND btrim(coalesce(verifie_par_libelle, '')) <> ''
               AND lower(btrim(verifie_par_libelle)) <> 'automatique')),

  CONSTRAINT gestion_contact_carte_retrait_chk
    CHECK ((retire_le IS NULL AND retire_par_libelle IS NULL)
           OR (retire_le IS NOT NULL AND btrim(coalesce(retire_par_libelle, '')) <> ''))
);

-- 🔴🔴 UNE SEULE CARTE VIVANTE PAR (BIEN, CÔTÉ, ADRESSE). C'est la clé annoncée par la simulation : « aucune carte
--    en double ». Partiel sur les vivantes, pour qu'une carte retirée puis reposée soit possible sans effacer la
--    trace de la première.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_contact_carte_vivante_idx
  ON gestion_contact_carte (lot_cle, cote, adresse) WHERE retire_le IS NULL;

-- La lecture d'une fiche : les cartes des deux côtés d'un bien, les vérifiées d'abord (elles s'affichent d'emblée).
CREATE INDEX IF NOT EXISTS gestion_contact_carte_lot_idx
  ON gestion_contact_carte (lot_cle, cote, verifie_le DESC NULLS LAST) WHERE retire_le IS NULL;

-- La lecture croisée : « sur quels biens cette adresse a-t-elle une carte ? » — utile pour reclasser une adresse
--   qui se révèle indépendante après coup.
CREATE INDEX IF NOT EXISTS gestion_contact_carte_adresse_idx
  ON gestion_contact_carte (adresse) WHERE retire_le IS NULL;

COMMENT ON TABLE gestion_contact_carte IS
  'LOT HISTORIQUE-BIEN-1 : la carte de contact affichée du côté propriétaire ou locataire d''UN bien. Un contact '
  'n''est JAMAIS un client : une carte ne compte dans aucun compteur « Propriétaire N » / « Locataire en place N », '
  'ne donne aucun statut ni badge, et ne change rien au locataire déterminé à une date. Jamais de carte pour un '
  'independant. Une seule carte vivante par (lot_cle, cote, adresse). Rien n''est supprimé : on retire en datant.';

COMMENT ON COLUMN gestion_contact_carte.origine IS
  'auto = créée par la passe de reprise (mention « Créée automatiquement — à vérifier et compléter ») · '
  'manuel = créée ou corrigée par quelqu''un, JAMAIS écrasée par une reprise.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (après COMMIT) :
--   SELECT count(*) FROM gestion_partie_categorie;   -- → 0 avant la reprise
--   SELECT count(*) FROM gestion_contact_carte;      -- → 0 avant la reprise
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('gestion_partie_categorie','gestion_contact_carte')
--    ORDER BY 1;                                     -- → 8 lignes (2 PK + 6 index)
--   -- Le garde en base, à essayer : les DEUX doivent être REFUSÉES (23514).
--   INSERT INTO gestion_partie_categorie (adresse, lot_cle, categorie, origine, pose_par_libelle)
--     VALUES ('x@y.fr', '155', 'independant', 'propose', 'essai');     -- → viole _portee_chk
--   INSERT INTO gestion_partie_categorie (adresse, lot_cle, categorie, origine, pose_par_libelle)
--     VALUES ('x@y.fr', NULL, 'proprietaire', 'defaut', 'essai');      -- → viole _portee_chk
--
-- Puis la reprise, SIMULATION d'abord (elle n'écrit rien sans --appliquer) :
--   npx tsx --env-file=.env app/scripts/reprendre-categories-parties.ts
--   npx tsx --env-file=.env app/scripts/reprendre-categories-parties.ts --appliquer
--
-- ROLLBACK (si Arno revient sur sa décision) :
--   BEGIN;
--   DROP TABLE IF EXISTS gestion_contact_carte;
--   DROP TABLE IF EXISTS gestion_partie_categorie;
--   COMMIT;
--   ⚠️ CE ROLLBACK PERD LES RANGEMENTS FAITS À LA MAIN (origine = 'manuel') : ce sont des décisions humaines, et
--      elles ne vivent nulle part ailleurs. Les relever AVANT :
--        SELECT * FROM gestion_partie_categorie WHERE origine = 'manuel' AND retire_le IS NULL;
--        SELECT * FROM gestion_contact_carte    WHERE origine = 'manuel' AND retire_le IS NULL;
--   ⚠️ Il ne perd RIEN d'autre : aucune donnée de message, de pièce, d'annuaire ni de rattachement n'a été touchée
--      par cette migration — elle n'a fait qu'ajouter. Les sondes répondront « non » et le module reviendra, au
--      bit près, à son comportement d'avant ce lot.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
