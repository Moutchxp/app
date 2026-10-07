-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 318 — UN CONTACT PEUT ÊTRE RATTACHÉ À UN **ANCIEN LOCATAIRE** (lot ANCIENS-LOCATAIRES-VIOLET, 07/10/2026)
--
-- ═══ CE QU'ARNO DEMANDE ═════════════════════════════════════════════════════════════════════════════════════════
-- « Chaque ancien locataire a sa propre carte “+ Ajouter un contact”. […] Le contact ajouté est rattaché à
-- L'ANCIEN LOCATAIRE, pas au locataire actuel ni au bien en général. »
--
-- ═══ 🔴 CE QUE LE MODÈLE NE SAVAIT PAS FAIRE, VÉRIFIÉ COLONNE PAR COLONNE LE 07/10/2026 ═════════════════════════
-- `gestion_partie_categorie` range une ADRESSE sur un BIEN (`lot_cle`), avec une catégorie prise dans quatre
-- valeurs : proprietaire · locataire · independant · a_repartir. Deux manques, et pas un :
--   ① aucune valeur ne distingue un contact d'ANCIEN locataire d'un contact du locataire EN PLACE ;
--   ② aucune colonne ne dit DE QUEL ancien locataire il s'agit — un bien en a souvent plusieurs, et « rattaché
--     au bien » serait exactement ce qu'Arno écarte.
--
-- ═══ 🔴 CE QUE CETTE MIGRATION AJOUTE, ET RIEN DE PLUS ══════════════════════════════════════════════════════════
--   · la valeur `ancien_locataire` dans la contrainte de catégorie ;
--   · une colonne `locataire_id` NULLABLE, qui nomme l'ancien locataire (clé de `gestion_annuaire_locataire`) ;
--   · une contrainte d'équivalence : `locataire_id` est renseignée SI ET SEULEMENT SI la catégorie vaut
--     `ancien_locataire`. Une colonne facultative sans règle serait remplie à moitié dans six mois.
--
-- 🔴 AUCUNE DONNÉE N'EST LUE, ÉCRITE NI DÉPLACÉE. Les 676 lignes existantes gardent leur catégorie, leur origine
-- et leur portée ; `locataire_id` naît à NULL partout, ce que la nouvelle contrainte accepte puisqu'aucune de ces
-- lignes ne porte la catégorie `ancien_locataire`.
--
-- ═══ 🔴🔴 L'INDEX D'UNICITÉ — POURQUOI IL EST REJOUÉ, ET POURQUOI C'EST SANS EFFET SUR L'EXISTANT ═══════════════
-- `gestion_partie_categorie_vivante_idx` interdit deux rangements VIVANTS pour une même paire (adresse, bien).
-- Tel quel, il aurait interdit qu'un même avocat soit le contact de DEUX anciens locataires du même immeuble —
-- ce qui arrive, et qui n'a rien d'une erreur. Il prend donc `COALESCE(locataire_id, 0)` en troisième clé.
--
-- ⚠️ SUR LES LIGNES EXISTANTES, L'INDEX EST **IDENTIQUE** : `locataire_id` y vaut NULL, donc la troisième clé y
--    vaut 0 pour toutes. Une paire (adresse, bien) qui passait reste unique ; une qui ne passait pas ne passe
--    toujours pas. La règle d'avant est conservée mot pour mot pour tout ce qui n'est pas un ancien locataire.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/318_gestion_partie_categorie_ancien_locataire.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ⚠️ SANS LA MIGRATION 304, IL N'Y A PAS DE TABLE : on ne fait rien plutôt que d'échouer. Les sondes applicatives
--    (`partiesCategorieDisponible`) commandent déjà l'affichage, exactement comme avant.
DO $$ BEGIN
  IF to_regclass('public.gestion_partie_categorie') IS NULL THEN RETURN; END IF;

  -- ── ① LA COLONNE QUI NOMME L'ANCIEN LOCATAIRE ────────────────────────────────────────────────────────────────
  -- Clé de `gestion_annuaire_locataire` — la PERSONNE, et non l'occupation. Une même personne peut avoir occupé
  -- deux fois le même logement ; ses coordonnées et ses contacts, eux, sont les siens dans les deux cas.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'gestion_partie_categorie' AND column_name = 'locataire_id') THEN
    ALTER TABLE gestion_partie_categorie ADD COLUMN locataire_id bigint;
    -- La clé étrangère n'est posée que si l'annuaire est là (il l'est depuis la 253).
    IF to_regclass('public.gestion_annuaire_locataire') IS NOT NULL THEN
      ALTER TABLE gestion_partie_categorie
        ADD CONSTRAINT gestion_partie_categorie_locataire_fkey
        FOREIGN KEY (locataire_id) REFERENCES gestion_annuaire_locataire(id);
    END IF;
  END IF;

  -- ── ② LA CATÉGORIE `ancien_locataire` ────────────────────────────────────────────────────────────────────────
  -- ⚠️ CETTE LISTE EST CELLE DE `Categorie` (app/lib/gestion/partieCategorie.ts), DANS LE MÊME ORDRE.
  ALTER TABLE gestion_partie_categorie DROP CONSTRAINT IF EXISTS gestion_partie_categorie_categorie_chk;
  ALTER TABLE gestion_partie_categorie ADD CONSTRAINT gestion_partie_categorie_categorie_chk
    CHECK (categorie = ANY (ARRAY['proprietaire', 'locataire', 'ancien_locataire', 'independant', 'a_repartir']));

  -- ── ③ L'ÉQUIVALENCE : QUI DIT `ancien_locataire` DIT LEQUEL ──────────────────────────────────────────────────
  -- 🔴 DANS LES DEUX SENS. Un `ancien_locataire` sans `locataire_id` serait « rattaché au bien en général »,
  --    ce qu'Arno écarte explicitement ; un `locataire_id` sur une autre catégorie serait une donnée que rien
  --    ne lit — et qu'on finirait par lire de travers.
  ALTER TABLE gestion_partie_categorie DROP CONSTRAINT IF EXISTS gestion_partie_categorie_ancien_chk;
  ALTER TABLE gestion_partie_categorie ADD CONSTRAINT gestion_partie_categorie_ancien_chk
    CHECK ((categorie = 'ancien_locataire') = (locataire_id IS NOT NULL));

  -- ── ④ L'UNICITÉ DES RANGEMENTS VIVANTS, TROISIÈME CLÉ COMPRISE ───────────────────────────────────────────────
  DROP INDEX IF EXISTS gestion_partie_categorie_vivante_idx;
  CREATE UNIQUE INDEX gestion_partie_categorie_vivante_idx
    ON gestion_partie_categorie (adresse, COALESCE(lot_cle, ''), COALESCE(locataire_id, 0))
    WHERE retire_le IS NULL;

  -- ── ⑤ L'INDEX DE LECTURE PAR ANCIEN LOCATAIRE ────────────────────────────────────────────────────────────────
  -- La fiche d'un bien demande « les contacts de CET ancien » une fois par carte : sans index, c'est un parcours
  -- complet de la table à chaque carte.
  CREATE INDEX IF NOT EXISTS gestion_partie_categorie_ancien_idx
    ON gestion_partie_categorie (locataire_id, lot_cle)
    WHERE retire_le IS NULL AND locataire_id IS NOT NULL;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ⑥ LA SECONDE TABLE : `gestion_contact_carte` — LA CARTE ELLE-MÊME
--
-- 🔴 IL Y EN A BIEN DEUX, ET CHACUNE A SON RÔLE : `gestion_partie_categorie` dit DE QUI une adresse est le
-- contact (c'est elle qui donne la couleur) ; `gestion_contact_carte` porte la CARTE affichée (civilité, nom,
-- qualité, coordonnées, note). Les deux sont écrites ensemble par le geste « ranger », et les deux doivent donc
-- savoir dire « ancien locataire » — n'en traiter qu'une aurait donné une couleur sans carte, ou l'inverse.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF to_regclass('public.gestion_contact_carte') IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'gestion_contact_carte' AND column_name = 'locataire_id') THEN
    ALTER TABLE gestion_contact_carte ADD COLUMN locataire_id bigint;
    IF to_regclass('public.gestion_annuaire_locataire') IS NOT NULL THEN
      ALTER TABLE gestion_contact_carte
        ADD CONSTRAINT gestion_contact_carte_locataire_fkey
        FOREIGN KEY (locataire_id) REFERENCES gestion_annuaire_locataire(id);
    END IF;
  END IF;

  -- ⚠️ CETTE LISTE EST CELLE DE `Cote` (app/lib/gestion/partieCategorie.ts), DANS LE MÊME ORDRE.
  ALTER TABLE gestion_contact_carte DROP CONSTRAINT IF EXISTS gestion_contact_carte_cote_chk;
  ALTER TABLE gestion_contact_carte ADD CONSTRAINT gestion_contact_carte_cote_chk
    CHECK (cote = ANY (ARRAY['proprietaire', 'locataire', 'ancien_locataire']));

  ALTER TABLE gestion_contact_carte DROP CONSTRAINT IF EXISTS gestion_contact_carte_ancien_chk;
  ALTER TABLE gestion_contact_carte ADD CONSTRAINT gestion_contact_carte_ancien_chk
    CHECK ((cote = 'ancien_locataire') = (locataire_id IS NOT NULL));

  -- 🔴 LES DEUX UNICITÉS PRENNENT LA TROISIÈME CLÉ, pour la même raison que plus haut — et avec le même effet
  --    NUL sur l'existant (`locataire_id` y vaut NULL, donc 0 partout).
  --    `…_une_par_bien_idx` : une adresse n'a qu'UNE carte par bien… et par ancien locataire nommé.
  DROP INDEX IF EXISTS gestion_contact_carte_une_par_bien_idx;
  CREATE UNIQUE INDEX gestion_contact_carte_une_par_bien_idx
    ON gestion_contact_carte (lot_cle, adresse, COALESCE(locataire_id, 0)) WHERE retire_le IS NULL;
  DROP INDEX IF EXISTS gestion_contact_carte_vivante_idx;
  CREATE UNIQUE INDEX gestion_contact_carte_vivante_idx
    ON gestion_contact_carte (lot_cle, cote, adresse, COALESCE(locataire_id, 0)) WHERE retire_le IS NULL;
END $$;

COMMIT;
