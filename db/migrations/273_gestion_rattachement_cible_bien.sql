-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 273 — LA CIBLE D'UN RATTACHEMENT VIVANT EST TOUJOURS UN BIEN (lot FICHE-RATTACHEMENT, 28/09/2026 au soir)
--
-- ═══ 🔴🔴 POURQUOI UNE CONTRAINTE DE BASE, ALORS QUE LE CODE REFUSE DÉJÀ ═══════════════════════════════════════
-- Le 28/09 à 14h26, la règle a changé : la cible d'un classement est TOUJOURS un bien, jamais une personne. Le code
-- a suivi le jour même, et 19 538 liens « propriétaire » ont été convertis.
--
-- Le soir du même jour, le mail « modification adresse mail » d'Isabelle MENN (19h41) portait pourtant
-- « PROPRIÉTAIRE BALIABINE épouse MENN Isabelle (234) ». La cause n'était PAS dans le code : le processus de relève
-- continue tournait depuis le 27/09 à 16h41, donc AVANT la conversion, et exécutait minute après minute l'ancien
-- moteur chargé en mémoire. 17 liens « propriétaire » sont nés entre 15h23 et 23h11.
--
-- ⇒ C'EST LA LEÇON DE CE LOT, ET ELLE EST DURE : UN GARDE-FOU ÉCRIT EN TYPESCRIPT NE PROTÈGE QUE LE CODE QU'ON
--   VIENT DE CHARGER. Il ne peut rien contre un processus démarré la veille, ni contre un script lancé depuis un
--   vieux répertoire de travail, ni contre une commande rejouée. La base, elle, est la même pour tout le monde :
--   c'est le seul endroit d'où la règle vaut pour les processus qu'on a oubliés.
--
-- ═══ CE QUE LA CONTRAINTE DIT, EXACTEMENT ══════════════════════════════════════════════════════════════════════
-- Un lien VIVANT (« proposé » ou « confirmé ») ne peut viser qu'un `lot` ou un `evenement`.
--
-- 🔴 L'HISTOIRE RESTE INTACTE, et c'est la moitié du soin de cette migration. Les 19 538 liens « propriétaire »
-- déjà RETIRÉS gardent leur ligne, leur date, leur auteur et leur motif : on n'efface pas le passé, on cesse d'en
-- écrire. La contrainte ne porte donc que sur les statuts vivants — d'où le `OR statut IN ('rejete','retire')`.
--
-- 🔴 L'ÉVÉNEMENT RESTE UNE CIBLE PERMISE. Une carte d'événement n'est pas une PERSONNE, c'est un dossier de
-- travail : la règle d'Arno vise les personnes (« on ne range pas un litige chez un propriétaire »), pas les cartes.
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Elle ne conditionne AUCUN affichage et aucune fonctionnalité : le code refuse
--    déjà les cibles « personne » par lui-même, sonde ou pas. Aucune requête ne nomme cette contrainte. Elle
--    n'ajoute qu'une chose — mais c'est celle qui manquait : l'impossibilité, pour un programme qu'on ne contrôle
--    plus, d'écrire ce que la règle interdit.
--
--    ⚠️ ELLE ÉCHOUERA tant qu'il reste un lien VIVANT de sorte « propriétaire » ou « locataire ». C'est voulu : elle
--    refuse de s'installer sur une base qui la violerait déjà, au lieu de s'installer à moitié. Le rattrapage du
--    28/09 au soir a retiré les 17 derniers ; la requête de contrôle ci-dessous doit rendre 0 avant de l'appliquer.
--
--    Contrôle :  psql -d sansvisavis -c "SELECT count(*) FROM gestion_rattachement
--                  WHERE cible_sorte NOT IN ('lot','evenement') AND statut IN ('propose','confirme')"
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/273_gestion_rattachement_cible_bien.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_rattachement
  ADD CONSTRAINT gestion_rattachement_cible_bien_chk
  CHECK (cible_sorte IN ('lot', 'evenement') OR statut IN ('rejete', 'retire'));

COMMENT ON CONSTRAINT gestion_rattachement_cible_bien_chk ON gestion_rattachement IS
  'La cible d''un rattachement VIVANT est toujours un bien (ou une carte d''événement), jamais une personne : '
  'règle d''Arno du 28/09/2026. Les liens « propriétaire » RETIRÉS restent permis — on n''efface pas le passé, on '
  'cesse d''en écrire. Cette contrainte est le seul garde-fou qui arrête aussi un programme lancé avant la règle, '
  'ce qui est précisément ce qui s''est produit le soir du 28/09.';

COMMIT;
