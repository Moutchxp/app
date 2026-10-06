-- ══ 🔴🔴 LOT MONGA-2, POINT 2 — CE QU'UN MAIL MONGA APPORTE EST PERMANENT ════════════════════════════════════════
--
-- RÈGLE D'ARNO (06/10/2026) : « À l'arrivée de chaque mail Monga, son contenu est lu et l'étape est ENREGISTRÉE
-- dans une table propre aux étapes, rattachée à la RÉFÉRENCE MNG (et à l'événement quand la référence est reliée).
-- Ensuite, le devenir du mail (boîte, corbeille, inerte, supprimé, réintégré) ne change JAMAIS l'étape
-- enregistrée. Quand une référence est reliée plus tard à un événement, toutes ses étapes déjà enregistrées y
-- apparaissent. »
--
-- ═══ 🔴🔴 CE QUE CETTE TABLE CORRIGE, ET QUI EST MESURÉ ═════════════════════════════════════════════════════════
--
-- `gestion_monga_mail` existe déjà, mais elle est la LECTURE D'UN MAIL, pas la mémoire d'une étape :
--   · sa clé primaire est `message_id`, avec `ON DELETE CASCADE` — le mail disparaît, la ligne disparaît avec lui ;
--   · or **25 des 98 mails Monga gabarités sont DÉJÀ à la corbeille** (mesuré le 06/10/2026), et Gmail efface au
--     bout de 30 jours. Un quart de l'historique d'intervention s'efface donc tout seul, en silence ;
--   · et son champ `etape` ne lit que l'OBJET : 55 de ses lignes valent « commentaire », alors que c'est dans le
--     CORPS que Monga écrit le rendez-vous, le devis et la facture (audit du point 1).
--
-- 🔴 D'OÙ UNE TABLE À PART, ET NON UNE COLONNE DE PLUS. Les deux objets ont des durées de vie différentes : la
-- lecture d'un mail meurt avec le mail, l'étape d'une intervention doit lui survivre. Les mêler aurait fait
-- dépendre la seconde du sort de la première — ce que la règle d'Arno interdit en toutes lettres.
--
-- ⚠️ MIGRATION ADDITIVE : rien n'est modifié ni supprimé. `gestion_monga_mail` reste en place, intacte, et
-- continue de servir à ce pour quoi elle est faite (dire ce qu'un mail PRÉSENT contient).
--
-- ⚠️ APPLIQUÉE À LA MAIN, comme toutes les migrations de ce dépôt :
--     psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/313_gestion_monga_etape.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_monga_etape (
  id                 bigserial PRIMARY KEY,

  -- ── À QUOI L'ÉTAPE SE RATTACHE ────────────────────────────────────────────────────────────────────────────
  -- 🔴 LA RÉFÉRENCE D'ABORD, L'ÉVÉNEMENT ENSUITE. Une étape Monga naît AVANT que la référence soit reliée à quoi
  -- que ce soit (mesuré : 35 références, 0 reliée à ce jour). Elle se rattache donc à la RÉFÉRENCE, et l'écran
  -- retrouve l'événement par `gestion_monga_lien` — c'est ce qui fait que relier une référence plus tard fait
  -- apparaître d'un coup toutes ses étapes déjà enregistrées, sans rien réécrire.
  reference          text,

  -- 🔴 ET L'ÉVÉNEMENT DIRECTEMENT, POUR LES ÉTAPES MANUELLES. Arno : « Fonctionne aussi pour un événement SANS
  -- Monga (frise entièrement manuelle). » Une étape posée à la main sur un événement sans référence n'a pas de
  -- MNG où se raccrocher ; elle vise l'événement.
  evenement_id       bigint REFERENCES gestion_evenement(id) ON DELETE CASCADE,

  -- ⚠️ L'UNE OU L'AUTRE, AU MOINS : une étape qui ne vise rien n'est retrouvable par personne.
  CONSTRAINT gestion_monga_etape_cible_chk
    CHECK (reference IS NOT NULL OR evenement_id IS NOT NULL),
  CONSTRAINT gestion_monga_etape_reference_chk
    CHECK (reference IS NULL OR reference ~ '^MNG-[0-9]{4,6}$'),

  -- ── CE QUE L'ÉTAPE DIT ────────────────────────────────────────────────────────────────────────────────────
  type               text NOT NULL,
  CONSTRAINT gestion_monga_etape_type_chk CHECK (type = ANY (ARRAY[
    'ouverture','prise_rdv','rdv_eu_lieu','devis_recu','devis_accepte',
    'rdv_intervention','intervention','cloture',
    'facture','rappel_devis','contact_injoignable','commentaire',
    'assurance','expertise','relance','autre'])),

  -- 🔴 LE MOMENT DE L'ÉTAPE, ET NON CELUI DU MAIL. Le mail du 06/10 annonce un rendez-vous le 09/10 : c'est le
  -- 09/10 qui doit se lire sur la frise. Quand le mail ne donne pas de date propre, l'appelant y met la date du
  -- mail — il la connaît, le module pur non.
  survenu_le         timestamptz NOT NULL,
  -- ⚠️ VRAI QUAND `survenu_le` EST UNE HEURE RÉELLE (rendez-vous « entre 10h30 et 11h00 »), FAUX quand elle est
  -- la date du mail ramenée à minuit : la frise affiche l'heure dans un cas, pas dans l'autre. Sans ce drapeau,
  -- tout rendez-vous sans heure se lirait « à 00h00 », ce qui est faux et se voit.
  heure_connue       boolean NOT NULL DEFAULT false,
  heure_fin          text,

  -- Le numéro porté par l'étape : DEV-20261002-19048, FACT-20260930-16424.
  numero             text,
  -- Le rang d'un rappel (« Rappel 2 » → 2).
  rang               integer,
  -- 🔴 LE MONTANT EST NULLABLE ET LE RESTERA SOUVENT : l'audit a mesuré que **2 mails sur 120** portent un
  -- montant, et que le mail « Devis envoyé » n'en donne jamais (il est derrière le lien Monga). Décision d'Arno :
  -- « Devis automatique (numéro + date), montant complété à la main. »
  montant_cents      bigint,
  texte              text,
  auteur             text,

  -- ── D'OÙ ELLE VIENT ───────────────────────────────────────────────────────────────────────────────────────
  source             text NOT NULL,
  CONSTRAINT gestion_monga_etape_source_chk CHECK (source = ANY (ARRAY['monga','manuelle'])),

  -- 🔴🔴 `ON DELETE SET NULL`, ET C'EST TOUTE LA RÈGLE D'ARNO EN UNE CLAUSE. `gestion_monga_mail` emploie
  -- `ON DELETE CASCADE` : le mail parti, la ligne part. Ici le lien se dénoue et l'ÉTAPE RESTE. C'est ce qui
  -- permet à l'écran de dire « mail supprimé — étape conservée » au lieu de n'avoir plus rien à dire.
  message_id         bigint REFERENCES gestion_message(id) ON DELETE SET NULL,
  -- ⚠️ ET L'IDENTIFIANT RFC EN DOUBLE, EXPRÈS : il survit à la suppression de la ligne `gestion_message`. Sans
  -- lui, une étape dont le mail a été effacé puis RE-relevé (Gmail restauré depuis la corbeille) serait vue
  -- comme une étape nouvelle, et l'on aurait deux fois la même sur la frise.
  message_cle        text,

  -- ── SON ÉTAT ──────────────────────────────────────────────────────────────────────────────────────────────
  -- `fiable` s'affiche telle quelle ; `a_confirmer` porte la mention et ses deux boutons ; `confirmee` et
  -- `ecartee` sont ce qu'un humain en a fait.
  certitude          text NOT NULL DEFAULT 'fiable',
  CONSTRAINT gestion_monga_etape_certitude_chk
    CHECK (certitude = ANY (ARRAY['fiable','a_confirmer','confirmee','ecartee'])),

  -- 🔴 « RETIRÉE », JAMAIS SUPPRIMÉE (Arno) : une étape manuelle se retire, elle ne s'efface pas. On garde donc
  -- qui l'avait posée, et quand — c'est ce qui rend un retrait explicable trois mois plus tard.
  statut             text NOT NULL DEFAULT 'vif',
  CONSTRAINT gestion_monga_etape_statut_chk CHECK (statut = ANY (ARRAY['vif','retire'])),

  -- Une pièce jointe facultative, pour une étape manuelle (Arno).
  piece_id           bigint,
  piece_nom          text,

  cree_le            timestamptz NOT NULL DEFAULT now(),
  cree_par           bigint REFERENCES admin_utilisateur(id),
  cree_par_libelle   text,
  maj_le             timestamptz NOT NULL DEFAULT now(),
  maj_par_libelle    text,
  retire_le          timestamptz,
  retire_par_libelle text,
  confirme_le        timestamptz,
  confirme_par_libelle text
);

-- 🔴🔴 AUCUN DOUBLON SI UN MÊME MAIL EST RELU (Arno). La relève repasse sur les mêmes mails à chaque tour, et la
-- reprise rejoue tout le corpus : sans cette unicité, chaque passage ajouterait une frise entière.
--
-- ⚠️ LA CLÉ EST (message, type), PAS (message) SEUL : un mail de relance porte à la fois son rappel et le
-- commentaire qui l'accompagne — deux étapes, un seul mail. Les confondre en perdrait une.
--
-- ⚠️ PARTIEL SUR `source = 'monga'` : deux étapes MANUELLES du même type sur le même événement sont parfaitement
-- légitimes (deux relances, deux devis acceptés successifs), et elles n'ont de toute façon pas de message.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_monga_etape_mail_unique
  ON gestion_monga_etape (message_id, type)
  WHERE message_id IS NOT NULL AND source = 'monga';

-- ⚠️ ET LE MÊME GARDE PAR IDENTIFIANT RFC, pour le cas où la ligne `gestion_message` a disparu puis renaît :
-- `message_id` est alors NULL d'un côté et neuf de l'autre, et l'index ci-dessus ne verrait pas le doublon.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_monga_etape_cle_unique
  ON gestion_monga_etape (message_cle, type)
  WHERE message_cle IS NOT NULL AND source = 'monga';

-- La frise d'une référence, dans l'ordre : c'est la requête de l'écran.
CREATE INDEX IF NOT EXISTS gestion_monga_etape_reference_idx
  ON gestion_monga_etape (reference, survenu_le)
  WHERE reference IS NOT NULL AND statut = 'vif';

-- La frise d'un événement sans Monga.
CREATE INDEX IF NOT EXISTS gestion_monga_etape_evenement_idx
  ON gestion_monga_etape (evenement_id, survenu_le)
  WHERE evenement_id IS NOT NULL AND statut = 'vif';

-- Le décompte « confirmée 5 fois sans être écartée », par type (Arno). Il se lit souvent et porte sur peu de
-- lignes : un index partiel suffit, et il évite de parcourir toute la table à chaque ouverture d'écran.
CREATE INDEX IF NOT EXISTS gestion_monga_etape_certitude_idx
  ON gestion_monga_etape (type, certitude)
  WHERE certitude IN ('a_confirmer','confirmee','ecartee');

COMMENT ON TABLE gestion_monga_etape IS
  'LOT MONGA-2 — les etapes d''une intervention. Rattachees a la REFERENCE MNG (ou a l''evenement pour les '
  'etapes manuelles), elles SURVIVENT au mail : ON DELETE SET NULL, jamais CASCADE. 25 des 98 mails Monga '
  'gabarites etaient deja a la corbeille le 06/10/2026, et Gmail les efface a 30 jours.';

COMMIT;
