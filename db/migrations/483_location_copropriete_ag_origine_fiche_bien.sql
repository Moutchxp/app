-- 483_location_copropriete_ag_origine_fiche_bien.sql — L'ORIGINE « FICHE DU BIEN » D'UN PV D'AG (Arno, 17/11/2026).
--
-- LE BESOIN (réponse d'Arno du 17/11/2026) : « un PV saisi depuis « Nouveau bien » ou « Modifier le bien » doit apparaître dans l'historique comme
-- « (fiche du bien) ». Ajoute cette origine (petite migration au numéro libre suivant, ajout seul, idempotente, enveloppée, recette seulement). »
-- L'origine 'fiche_bien' de la 475 existe déjà, mais elle désigne le champ « Date de la dernière AG » (la dernière saisie vaut) ; un PV saisi sur la
-- fiche du bien est un PV (historique daté) : il prend sa propre valeur, 'fiche_bien_pv', lue « fiche du bien ».
--
-- CE QU'ELLE FAIT : la contrainte d'origine (481) admet une valeur de plus, 'fiche_bien_pv' ; toutes les valeurs d'avant restent permises.
-- AJOUT SEUL : aucune ligne touchée, rien supprimé ni renommé (la contrainte est remplacée par la même, élargie). Pas de BEGIN/COMMIT : l'appel
-- l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT. Suppose 481.
--
-- ⚠️ Sans elle, un PV saisi sur la fiche du bien est enregistré comme avant (origine « fiche copropriété »).

ALTER TABLE gestion_copropriete_ag DROP CONSTRAINT IF EXISTS gestion_copropriete_ag_origine_chk;
ALTER TABLE gestion_copropriete_ag ADD CONSTRAINT gestion_copropriete_ag_origine_chk CHECK (
  origine IN ('reprise', 'sortie', 'fiche_bien', 'creation_bien', 'fiche_copropriete', 'fiche_bien_pv'));

COMMENT ON CONSTRAINT gestion_copropriete_ag_origine_chk ON gestion_copropriete_ag IS
  'Origines d''une entrée de l''historique des AG ; fiche_bien_pv : un PV d''AG saisi sur la fiche du bien (« Nouveau bien », « Modifier le bien ») — 483, Arno 17/11/2026.';
