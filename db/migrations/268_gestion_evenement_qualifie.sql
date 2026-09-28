-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 268 — UN ÉVÉNEMENT QUALIFIÉ, ET RATTACHÉ À UN BIEN (lot CONTACTS-ET-EVENEMENT, 28/09/2026)
--
-- ═══ CE QUE L'ÉVÉNEMENT NE SAVAIT PAS DIRE ══════════════════════════════════════════════════════════════════════
-- Une carte porte aujourd'hui une référence, un objet, un demandeur et un état. Elle ne dit ni DE QUOI il s'agit
-- (des travaux ? une fuite ? un litige ?), ni SI C'EST URGENT, ni SUR QUEL BIEN elle porte. On ne pouvait donc ni
-- trier les cartes d'un logement, ni retrouver « la fuite du 2 rue Mars et Roty » autrement qu'en relisant l'objet.
--
-- ⇒ Deux colonnes, et une table de liaison.
--
-- ═══ 🔴 POURQUOI UNE TABLE, ET PAS TROIS COLONNES SUR L'ÉVÉNEMENT ═══════════════════════════════════════════════
-- Un événement concerne UN bien, mais aussi SON propriétaire et SON locataire — et parfois DEUX logements (un
-- dégât des eaux qui traverse un plancher). Trois colonnes `lot_cle`, `proprietaire_cle`, `locataire_cle`
-- auraient imposé un seul de chaque, et il aurait fallu les élargir au premier cas réel. Une ligne par partie ne
-- coûte rien et ne ment jamais.
--
-- 🔴 LES CLÉS SONT DES CLÉS WIPPIMMO, PAS DES IDENTIFIANTS INTERNES, et c'est la convention de tout le module
-- (`gestion_rattachement` fait de même) : elles survivent à un ré-import de l'annuaire, les identifiants non.
--
-- 🔴 RIEN N'EST SUPPRIMÉ : une partie retirée est DATÉE (`retire_le`), comme partout ailleurs dans ce module.
--
-- ═══ CE QUE CETTE MIGRATION NE FAIT PAS ════════════════════════════════════════════════════════════════════════
-- Elle ne touche NI `gestion_affectation` (le lien mail/échange ↔ événement, qui existe déjà et qui reste le seul
-- chemin pour lier et délier), NI `gestion_rattachement`, NI l'état des cartes. Les 1 événements existants restent
-- valides : `categorie` et `urgence` sont NULLABLES, et se lisent « non précisé ».
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Le code tourne sans elle : la sonde `evenementQualifieDisponible()`
--    (`app/lib/gestion/schema.ts`) ne nomme ni les colonnes ni la table tant qu'elles n'existent pas. L'écran
--    masque alors le choix de catégorie et d'urgence, et la recherche d'événements ne peut pas mettre en tête ceux
--    du bien — elle reste la recherche d'avant, qui marche.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/268_gestion_evenement_qualifie.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① DE QUOI S'AGIT-IL, ET EST-CE URGENT ? ─────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_evenement
  ADD COLUMN IF NOT EXISTS categorie text,
  ADD COLUMN IF NOT EXISTS urgence   text;

-- ⚠️ LES QUATRE CATÉGORIES SONT CELLES D'ARNO, MOT POUR MOT. La contrainte les tient en base : un cinquième mot
--    arrivé par un script ne doit pas pouvoir créer une catégorie que l'écran ne sait pas afficher.
DO $$ BEGIN
  ALTER TABLE gestion_evenement ADD CONSTRAINT gestion_evenement_categorie_chk
    CHECK (categorie IS NULL OR categorie = ANY (ARRAY['travaux','fuite_eau','administratif','litige']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE gestion_evenement ADD CONSTRAINT gestion_evenement_urgence_chk
    CHECK (urgence IS NULL OR urgence = ANY (ARRAY['normale','haute','critique']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN gestion_evenement.categorie IS
  'travaux | fuite_eau | administratif | litige. NULL = non précisé (cartes ouvertes avant la 268).';
COMMENT ON COLUMN gestion_evenement.urgence IS
  'normale | haute | critique. NULL = non précisée. Le MOT est toujours écrit à l''écran, jamais une couleur seule.';

-- ── ② SUR QUOI PORTE CET ÉVÉNEMENT : le bien, son propriétaire, son locataire ────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_evenement_partie (
  id            bigserial PRIMARY KEY,
  evenement_id  bigint      NOT NULL REFERENCES gestion_evenement(id) ON DELETE CASCADE,
  sorte         text        NOT NULL,
  -- La clé WIPPIMMO : la seule identité qui survive à un ré-import de l'annuaire.
  cle           text        NOT NULL,
  -- Le nom lisible, FIGÉ au moment du rattachement : une clé seule ne dit rien à personne, et si le lot sort de la
  -- gestion, aucune jointure ne rendrait plus son nom. Même raison que `cible_libelle` sur gestion_rattachement.
  libelle       text        NOT NULL DEFAULT '',
  cree_le       timestamptz NOT NULL DEFAULT now(),
  cree_par      bigint      REFERENCES admin_utilisateur(id),
  cree_par_libelle text     NOT NULL DEFAULT 'automatique',
  -- 🔴 RIEN N'EST SUPPRIMÉ : une partie retirée est datée et signée, comme partout dans ce module.
  retire_le     timestamptz,
  retire_par    bigint      REFERENCES admin_utilisateur(id),
  retire_par_libelle text,
  CONSTRAINT gestion_evenement_partie_sorte_chk
    CHECK (sorte = ANY (ARRAY['lot','proprietaire','locataire'])),
  CONSTRAINT gestion_evenement_partie_cle_chk CHECK (btrim(cle) <> '')
);

COMMENT ON TABLE gestion_evenement_partie IS
  'Sur quoi porte un événement : le BIEN, son PROPRIÉTAIRE et son LOCATAIRE au moment où la carte est ouverte. '
  'Une ligne par partie — un dégât des eaux peut traverser deux logements. Rien n''est supprimé : retire_le date '
  'le retrait. Ne remplace PAS gestion_affectation, qui lie le MAIL (ou l''échange) à l''événement.';

-- Une partie n'est rattachée qu'UNE fois à un événement : recliquer ne doit pas la doubler.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_evenement_partie_vivante_idx
  ON gestion_evenement_partie (evenement_id, sorte, cle) WHERE retire_le IS NULL;

-- La lecture de l'écran : « quels événements portent sur ce bien ? », pour les mettre EN TÊTE de la recherche.
CREATE INDEX IF NOT EXISTS gestion_evenement_partie_cible_idx
  ON gestion_evenement_partie (sorte, cle) WHERE retire_le IS NULL;

COMMIT;
