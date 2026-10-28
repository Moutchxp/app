-- 440_transaction_inter_cabinet.sql — LOT R (Arno, 28/10/2026) : L'INTER-CABINET ENTRE NOS DEUX SOCIÉTÉS.
--
-- DÉCISIONS D'ARNO :
--   · la SOCIÉTÉ PORTEUSE d'une vente répartie (celle du négociateur d'entrée du mandat ; sans lui, la société où la vente est saisie)
--     encaisse TOUTE la commission ; la part de l'autre société lui est reversée (rétrocession inter-cabinet, dans ses commissions versées) ;
--   · chez l'autre société, une LIGNE MIROIR « … — inter-cabinet reçu de CRITERIMMO / MACJ » ne porte QUE sa part ; elle suit la vente
--     d'origine (compromis, acte signé, annulation, rétablissement, changement de % ou de négociateur) — mise à jour, jamais doublon ; si
--     l'autre société ne reçoit plus rien, la ligne miroir est ANNULÉE, jamais supprimée ;
--   · la rémunération de chaque négociateur = « taux de rémunération » (50 % par défaut) × le CA que la vente apporte à sa société.
--
-- EN AJOUT :
--   · `transaction_inter_cabinet` : LE REGISTRE des lignes miroir (une par vente d'origine et par société qui reçoit — UNIQUE), sa dernière
--     part (HT, %), son état (« active » ou « annulee ») ; append-only pour l'effacement (ni DELETE ni TRUNCATE), chaque changement écrit
--     au journal de la tuile (`transaction_journal`, entité « vente », action « inter_cabinet ») ;
--   · `transaction_vente_ligne.taux` : le taux de rémunération d'une commission de négociateur (en %), NULL : le défaut (50 %) ;
--   · l'initialisation : une ligne au registre pour chaque vente répartie déjà enregistrée dont l'autre société reçoit une part (journalisée,
--     signée « migration 440 »). Aucune autre ligne n'est touchée ; rien n'est effacé. IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour
--     l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, les lignes miroir se calculent à la lecture depuis la vente d'origine (aucune
-- n'est « annulée », faute de registre), et le taux de rémunération vaut 50 % sans s'enregistrer.

CREATE TABLE IF NOT EXISTS transaction_inter_cabinet (
  id bigserial PRIMARY KEY,
  vente_id bigint NOT NULL REFERENCES transaction_vente (id),
  societe text NOT NULL CHECK (societe IN ('criterimmo', 'macj')),
  porteuse text NOT NULL CHECK (porteuse IN ('criterimmo', 'macj')),
  part_ht numeric NOT NULL CHECK (part_ht >= 0),
  pourcentage numeric,
  etat text NOT NULL CHECK (etat IN ('active', 'annulee')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle text NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le timestamptz,
  CHECK (societe <> porteuse),
  UNIQUE (vente_id, societe)
);
COMMENT ON TABLE transaction_inter_cabinet IS
  'Lignes miroir inter-cabinet (migration 440) : la part d''une vente répartie reçue par l''autre société que la porteuse. Jamais supprimée : « annulee » quand elle ne reçoit plus rien. Journal : transaction_journal (vente, inter_cabinet).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_inter_cabinet_sans_effacement') THEN
    CREATE TRIGGER transaction_inter_cabinet_sans_effacement BEFORE DELETE ON transaction_inter_cabinet
      FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_inter_cabinet_sans_vidage') THEN
    CREATE TRIGGER transaction_inter_cabinet_sans_vidage BEFORE TRUNCATE ON transaction_inter_cabinet
      FOR EACH STATEMENT EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
END $$;

ALTER TABLE transaction_vente_ligne ADD COLUMN IF NOT EXISTS taux numeric CHECK (taux IS NULL OR taux >= 0);
COMMENT ON COLUMN transaction_vente_ligne.taux IS
  'Taux de rémunération du négociateur (%, migration 440) × le CA que la vente apporte à sa société ; NULL : le défaut (50 %).';

-- L'initialisation : les ventes réparties existantes dont l'autre société reçoit une part (commission nette = honoraires − apporteur, ÷ 1,2).
WITH ventes AS (
  SELECT v.id, v.societe,
         (v.honoraires_ttc - coalesce(v.retro_apporteur_ttc, v.retro_apporteur_ht * 1.2, 0)) / 1.2 AS net_ht,
         coalesce((SELECT p.societe FROM transaction_partie p
                    WHERE p.vente_id = v.id AND p.retire_le IS NULL AND p.sorte IN ('entree', 'entree_sortie') AND p.societe IS NOT NULL
                    ORDER BY p.rang, p.id LIMIT 1), v.societe) AS porteuse
    FROM transaction_vente v WHERE v.repartition AND v.retire_le IS NULL
), parts AS (
  SELECT x.id AS vente_id, p.societe, x.porteuse, x.net_ht,
         sum(CASE WHEN p.pourcentage IS NOT NULL THEN x.net_ht * p.pourcentage / 100 ELSE coalesce(p.montant_ht, 0) END) AS part_ht
    FROM ventes x JOIN transaction_partie p ON p.vente_id = x.id AND p.retire_le IS NULL AND p.societe IS NOT NULL AND p.societe <> x.porteuse
   GROUP BY x.id, p.societe, x.porteuse, x.net_ht
), poses AS (
  INSERT INTO transaction_inter_cabinet (vente_id, societe, porteuse, part_ht, pourcentage, etat, cree_par_libelle)
  SELECT vente_id, societe, porteuse, part_ht, CASE WHEN net_ht = 0 THEN NULL ELSE part_ht / net_ht * 100 END, 'active', 'migration 440'
    FROM parts WHERE part_ht > 0
  ON CONFLICT (vente_id, societe) DO NOTHING
  RETURNING vente_id, societe, porteuse, part_ht, pourcentage
)
INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, auteur_libelle)
SELECT 'vente', vente_id, 'inter_cabinet', NULL,
       jsonb_build_object('societe', societe, 'porteuse', porteuse, 'part_ht', part_ht, 'pourcentage', pourcentage, 'etat', 'active'),
       'Ligne miroir créée (migration 440) : part reçue par ' || upper(societe) || ' en inter-cabinet.', 'migration 440'
  FROM poses;
