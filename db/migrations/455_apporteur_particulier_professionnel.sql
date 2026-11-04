-- 455_apporteur_particulier_professionnel.sql — SUIVI CA / LOCATION / MON ESPACE, D38 (Arno, 04/11/2026) : L'APPORTEUR PARTICULIER OU PROFESSIONNEL.
--
-- LE BESOIN (Arno) : la règle D29 « sans TVA » s'appliquait à TOUS les apporteurs externes — trop large. Chaque apporteur d'affaires a un statut :
--   · « Particulier » : sa commission n'a pas de TVA (versé = HT = TTC), comme D29 ;
--   · « Professionnel » : sa commission porte la TVA (TTC = HT × 1,2), comme avant D29 ; aucune TVA non récupérable pour lui.
-- Décisions d'Arno du 04/11/2026 : statut obligatoire, « Particulier » par défaut, modifiable dans la fiche (administrateurs, journal) ; une
-- rétrocession sans apporteur nommé est « Professionnel » par défaut (rattachée à une vente dont l'apporteur est nommé : le statut de celui-ci),
-- et chaque rétrocession peut recevoir son propre statut (administrateurs, journal).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `gestion_location_apporteur.statut_tva` ('particulier' | 'professionnel', obligatoire, « particulier » par défaut). PRÉ-REMPLIE à sa
--     CRÉATION seulement (rejouée, elle ne touche jamais un statut corrigé à la main) par la règle d'Arno : type « agence » ou « internet », ou
--     une société renseignée → Professionnel ; une personne physique → Particulier ; douteux → Particulier ; Léonardo, « Michael Salle de sport
--     Cédric », « Marjorie Arthur Immo » et Pierre Thevenin → Particulier (cas douteux, réponses laissées en blanc : la règle « douteux »).
--     Chaque statut posé est journalisé (`gestion_journal`, entité « location_apporteur », auteur : la migration) ;
--   · `transaction_retrocession.statut_apporteur` (facultatif) : le statut choisi À LA MAIN pour une rétrocession ; NULL = la règle (l'apporteur
--     nommé ou celui de la vente rattachée, sinon Professionnel). Aucune ligne n'est pré-remplie.
-- AUCUNE donnée n'est effacée ni aucun montant réécrit : seule la lecture (le calcul) change. IDEMPOTENTE. Pas de BEGIN/COMMIT : l'appel
-- l'enveloppe dans UNE transaction (psql -1). Suppose la 406 (annuaire des apporteurs) et la 419 (entité de journal « location_apporteur »).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = current_schema() AND table_name = 'gestion_location_apporteur' AND column_name = 'statut_tva') THEN
    ALTER TABLE gestion_location_apporteur ADD COLUMN statut_tva text NOT NULL DEFAULT 'particulier'
      CONSTRAINT gestion_location_apporteur_statut_tva_chk CHECK (statut_tva IN ('particulier', 'professionnel'));
    UPDATE gestion_location_apporteur a SET statut_tva = 'professionnel'
     WHERE (a.type IN ('agence', 'internet') OR nullif(btrim(coalesce(a.societe, '')), '') IS NOT NULL)
       AND lower(btrim(a.nom)) NOT IN ('léonardo', 'michael salle de sport cédric', 'marjorie arthur immo', 'pierre thevenin');
    INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
    SELECT 'location_apporteur', a.id, 'location_apporteur_statut_tva',
           '—', CASE a.statut_tva WHEN 'professionnel' THEN 'Professionnel (avec TVA)' ELSE 'Particulier (sans TVA)' END,
           'Fiche de l’apporteur — Statut TVA posé par la migration 455 (D38) : '
             || CASE WHEN a.statut_tva = 'professionnel' THEN 'agence, internet ou société renseignée'
                     ELSE 'personne physique ou cas douteux' END || ' ; modifiable dans la fiche',
           NULL, 'migration 455'
      FROM gestion_location_apporteur a;
  END IF;
END $$;

ALTER TABLE transaction_retrocession ADD COLUMN IF NOT EXISTS statut_apporteur text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_retrocession_statut_apporteur_chk') THEN
    ALTER TABLE transaction_retrocession ADD CONSTRAINT transaction_retrocession_statut_apporteur_chk
      CHECK (statut_apporteur IS NULL OR statut_apporteur IN ('particulier', 'professionnel'));
  END IF;
END $$;

COMMENT ON COLUMN gestion_location_apporteur.statut_tva IS
  'D38 (455) — « particulier » : commission sans TVA (versé = HT = TTC) ; « professionnel » : avec TVA (TTC = HT × 1,2). Un collaborateur (compte) : toujours avec TVA en Transaction.';
COMMENT ON COLUMN transaction_retrocession.statut_apporteur IS
  'D38 (455) — le statut choisi à la main pour cette rétrocession ; NULL : la règle (l''apporteur nommé ou celui de la vente rattachée, sinon professionnel).';
