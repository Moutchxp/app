-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 320 — LA CARTE « RÉOUVERTURE » (lot CLOTURE-REOUVERTURE, 08/10/2026)
--
-- ═══ CE QU'ARNO DEMANDE ═════════════════════════════════════════════════════════════════════════════════════════
-- « Ajoute un bouton “Réouverture”, placé EN DERNIER, juste après “Carte libre”. […] Ajouter la carte
-- “Réouverture” rouvre un événement clos : statut ouvert, nouvelle période “Événement ouvert” qui commence à la
-- date de la carte. […] C'est le SEUL moyen de rouvrir un événement clos. »
--
-- ═══ 🔴 CE QUE FAIT CETTE MIGRATION, ET RIEN DE PLUS ════════════════════════════════════════════════════════════
-- Elle REJOUE la contrainte de type de `gestion_monga_etape` en y ajoutant `reouverture`. La liste ci-dessous est
-- celle d'avant, MOT POUR MOT, plus une valeur : aucune n'est retirée.
--
-- ⚠️ `relance` Y RESTE, ET C'EST DÉLIBÉRÉ. Le même lot retire le bouton « Relance » de la grille « Ajouter une
--    carte », mais les cartes déjà posées doivent rester affichables ET modifiables (accord d'Arno : « aucune
--    donnée supprimée, aucune modifiée »). Retirer la valeur de la contrainte aurait rendu impossible la
--    moindre correction de date sur une carte Relance existante.
--
-- ═══ 🔴 CE QUE CETTE MIGRATION NE CHANGE PAS : LES DONNÉES ══════════════════════════════════════════════════════
-- Aucune ligne n'est lue, écrite ni déplacée : on élargit une contrainte. Le contrôle avant/après (nombre
-- d'étapes par type) est donc identique PAR CONSTRUCTION.
--
-- ⚠️ ELLE EST SANS EFFET SI LA TABLE N'EXISTE PAS (migration 313) : le bloc ne fait rien plutôt que d'échouer.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/320_gestion_etape_reouverture.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gestion_monga_etape') THEN
    ALTER TABLE gestion_monga_etape DROP CONSTRAINT IF EXISTS gestion_monga_etape_type_chk;
    -- ⚠️ CETTE LISTE EST CELLE DE `TypeEtape` (app/lib/gestion/mongaEtape.ts), et une épreuve compare les deux.
    ALTER TABLE gestion_monga_etape ADD CONSTRAINT gestion_monga_etape_type_chk
      CHECK (type = ANY (ARRAY[
        'ouverture','prise_rdv','rdv_eu_lieu','devis_recu','devis_refuse','devis_accepte',
        'rdv_intervention','intervention','rapport','cloture','facture','rappel_devis',
        'contact_injoignable','commentaire','assurance','expertise','relance','reouverture','autre','note'
      ]));

    COMMENT ON COLUMN gestion_monga_etape.type IS
      'Type de la carte de frise. Liste tenue par TypeEtape (app/lib/gestion/mongaEtape.ts) et rejouée ici par la '
      'migration 320. « cloture » ferme l''événement, « reouverture » le rouvre — ce sont les deux seuls chemins. '
      '« relance » n''est plus proposé par la grille, mais reste valide : les cartes posées restent modifiables.';
  END IF;
END $$;

COMMIT;
