-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 344 — LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES : « SYNDIC & IMMEUBLE » RANGÉ À LA MAIN, SUR UN BIEN
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DÉCISION D'ARNO (13/10/2026) : on peut déposer dans « Syndic & immeuble » une personne venant de « Non affectés »
-- ou de « Tiers indépendant ». Ce dépôt est un SIMPLE CLASSEMENT LOCAL, pour l'historique de CE bien uniquement :
-- aucun ajout dans la fiche syndic, aucun effet sur les autres biens (même du même immeuble), même mécanisme, même
-- confirmation, même annulation et même trace datée que les autres rangements manuels.
--
-- 🔴 MIGRATION D'ÉLARGISSEMENT, ET SEULEMENT D'ÉLARGISSEMENT : la contrainte `gestion_partie_categorie_categorie_chk`
-- accepte UNE valeur de plus, `syndic_immeuble`. Aucune ligne existante n'est lue, modifiée ni supprimée ; toute ligne
-- valide avant l'est encore après. Aucune autre table, aucun index, aucune autre contrainte n'est touché.
--
--   · LA PORTÉE EST DÉJÀ TENUE : `gestion_partie_categorie_portee_chk` impose `lot_cle IS NOT NULL` à toute catégorie
--     autre que `independant` — un `syndic_immeuble` est donc TOUJOURS posé sur un bien, jamais global ;
--   · l'application SONDE la contrainte avant de proposer le geste (`syndicLocalDisponible`) : sans cette migration,
--     la zone « Syndic & immeuble » reste exactement celle d'avant (non déposable).
--
-- ⚠️ CETTE LISTE EST CELLE DE `Categorie` (app/lib/gestion/partieCategorie.ts), DANS LE MÊME ORDRE.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.gestion_partie_categorie') IS NULL THEN RETURN; END IF;
  ALTER TABLE gestion_partie_categorie DROP CONSTRAINT IF EXISTS gestion_partie_categorie_categorie_chk;
  ALTER TABLE gestion_partie_categorie ADD CONSTRAINT gestion_partie_categorie_categorie_chk
    CHECK (categorie = ANY (ARRAY['proprietaire', 'locataire', 'ancien_locataire', 'independant', 'a_repartir',
                                  'syndic_immeuble']));
END $$;

COMMIT;
