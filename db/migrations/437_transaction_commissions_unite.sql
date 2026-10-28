-- 437_transaction_commissions_unite.sql — TUILE « TRANSACTION », LOT I (Arno, 28/10/2026) : LES COMMISSIONS VERSÉES, EN HT OU EN TTC.
--
-- DÉCISION D'ARNO : sur chaque compromis / vente, la commission versée au négociateur d'ENTRÉE et au négociateur de SORTIE se saisit à la
-- main, chacune avec son unité « HT » ou « TTC » (le choix est PAR COMMISSION, jamais par personne) ; la rétrocession de l'apporteur
-- aussi (HT proposé par défaut pour une nouvelle saisie). Conversion au taux de la tuile (TTC = HT × 1,2, `TVA` de modele.ts).
--
-- PAS DE DOUBLON : la commission versée à un négociateur EST la « paye du négociateur » qui existe depuis la 433 (lignes
-- `transaction_vente_ligne` de rôle 'negociateur', imports MACJ). Cette migration lui ajoute seulement :
--   · `cote`       : 'entree' / 'sortie' — la ligne saisie depuis le dossier pour ce côté du mandat (NULL : ligne d'avant, importée) ;
--   · `montant_ht` : le montant quand il est saisi EN HT (alors `montant_ttc` reste NULL) — une ligne porte UNE unité, celle saisie.
-- Et à la vente : `retro_apporteur_ht`, la rétrocession de l'apporteur quand elle est saisie EN HT (alors `retro_apporteur_ttc` NULL).
--
-- EN AJOUT SEUL : colonnes NEUVES et vides. Les montants déjà enregistrés (imports, saisies) restent en TTC, tels quels : RIEN n'est
-- converti. IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, tout se saisit en TTC comme avant (le choix « HT » est grisé, « disponible
-- après la mise à jour (migration 437) ») et rien ne lit ni n'écrit ces colonnes.

ALTER TABLE transaction_vente_ligne ADD COLUMN IF NOT EXISTS cote       text    CHECK (cote IS NULL OR cote IN ('entree', 'sortie'));
ALTER TABLE transaction_vente_ligne ADD COLUMN IF NOT EXISTS montant_ht numeric CHECK (montant_ht IS NULL OR montant_ht >= 0);
ALTER TABLE transaction_vente_ligne DROP CONSTRAINT IF EXISTS transaction_vente_ligne_une_unite;
ALTER TABLE transaction_vente_ligne ADD CONSTRAINT transaction_vente_ligne_une_unite CHECK (montant_ht IS NULL OR montant_ttc IS NULL);
COMMENT ON COLUMN transaction_vente_ligne.montant_ht IS
  'Le montant de la ligne quand il est saisi en HT (montant_ttc alors NULL) ; NULL : saisi en TTC (montant_ttc), comme avant la migration 437.';
COMMENT ON COLUMN transaction_vente_ligne.cote IS
  'La commission versée au négociateur d''entrée ou de sortie du mandat, saisie depuis le dossier (migration 437) ; NULL : ligne d''avant (import, saisie).';

ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS retro_apporteur_ht numeric CHECK (retro_apporteur_ht IS NULL OR retro_apporteur_ht >= 0);
COMMENT ON COLUMN transaction_vente.retro_apporteur_ht IS
  'La rétrocession de l''apporteur quand elle est saisie en HT (retro_apporteur_ttc alors NULL) ; NULL : saisie en TTC, comme avant (migration 437).';
