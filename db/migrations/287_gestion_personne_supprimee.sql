-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 287 — LOT SUPPRIMER-CARTE : SUPPRIMER UNE FICHE DE PERSONNE, SANS RIEN EFFACER
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ARNO : « la personne n'apparaît plus NULLE PART dans l'app (fiches, annuaire, bloc des parties, modale
-- Visualiser / Modifier, propositions de biens, recherche). Techniquement, c'est une suppression logique
-- (marquage “supprimée”, qui, quand) : les mails, les rattachements et les historiques des biens restent intacts.
-- Aucune ligne n'est effacée en base. »
--
-- ═══ POURQUOI UNE COLONNE DE PLUS, ET PAS `archive_le` ══════════════════════════════════════════════════════════
--
-- `archive_le` existe déjà, et dit « retirée de la liste active, RESTAURABLE, et elle se voit encore quand on la
-- cherche ». « Supprimée » dit autre chose : elle ne se voit plus NULLE PART, même dans les archivées. Les deux
-- états ne se confondent pas, et les mêler aurait fait disparaître les archivées en même temps — alors que ce lot
-- ajoute justement un lien « Voir les archivées (N) » pour les retrouver.
--
-- 🔴 ET C'EST BIEN UNE SUPPRESSION LOGIQUE. Aucun `DELETE`, nulle part : un mail rattaché à un bien reste rattaché,
-- l'historique du bien garde ses lignes, et la personne peut être retrouvée en base le jour où l'on comprend qu'on
-- s'est trompé. Effacer la ligne casserait les clés étrangères des occupations et des lots — c'est-à-dire
-- l'historique lui-même.
--
-- ⚠️ `supprime_par` EST L'IDENTIFIANT DU COMPTE, `supprime_par_libelle` CE QU'ON AFFICHE. Les deux, comme partout
-- dans le module : un identifiant survit à un changement de nom, un libellé se lit sans jointure.
--
-- 🔒 AUCUNE DONNÉE N'EST TOUCHÉE : trois colonnes nulles ajoutées à deux tables. Sans cette migration, la sonde
-- `suppressionPersonneDisponible` rend faux, aucune colonne n'est nommée, et l'entrée « Supprimer » n'est pas
-- offerte — l'écran se comporte exactement comme avant ce lot.
--
-- RÉVERSIBLE :
--   ALTER TABLE gestion_annuaire_proprietaire
--     DROP COLUMN supprime_le, DROP COLUMN supprime_par, DROP COLUMN supprime_par_libelle;
--   ALTER TABLE gestion_annuaire_locataire
--     DROP COLUMN supprime_le, DROP COLUMN supprime_par, DROP COLUMN supprime_par_libelle;

ALTER TABLE gestion_annuaire_proprietaire
  ADD COLUMN IF NOT EXISTS supprime_le          timestamptz,
  ADD COLUMN IF NOT EXISTS supprime_par         integer,
  ADD COLUMN IF NOT EXISTS supprime_par_libelle text;

ALTER TABLE gestion_annuaire_locataire
  ADD COLUMN IF NOT EXISTS supprime_le          timestamptz,
  ADD COLUMN IF NOT EXISTS supprime_par         integer,
  ADD COLUMN IF NOT EXISTS supprime_par_libelle text;

-- ⚠️ INDEX PARTIELS, ET SEULEMENT SUR LES SUPPRIMÉES : elles sont rares, et toutes les lectures d'affichage les
--    ÉCARTENT. Un index sur toute la colonne coûterait de l'écriture à chaque import de l'annuaire pour rien.
CREATE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_supprimees_idx
  ON gestion_annuaire_proprietaire (id) WHERE supprime_le IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestion_annuaire_locataire_supprimees_idx
  ON gestion_annuaire_locataire (id) WHERE supprime_le IS NOT NULL;

COMMENT ON COLUMN gestion_annuaire_proprietaire.supprime_le IS
  'LOT SUPPRIMER-CARTE — suppression LOGIQUE : la fiche ne s''affiche plus nulle part, mais la ligne reste, et '
  'avec elle les mails, les rattachements et l''historique du bien. NULL = fiche vivante.';
COMMENT ON COLUMN gestion_annuaire_locataire.supprime_le IS
  'LOT SUPPRIMER-CARTE — suppression LOGIQUE : voir gestion_annuaire_proprietaire.supprime_le.';
