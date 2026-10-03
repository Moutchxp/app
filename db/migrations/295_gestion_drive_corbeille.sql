-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 295 — LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE : LE JOURNAL SAIT CONSIGNER UNE MISE À LA CORBEILLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴🔴 ⚠️ MIGRATION LIVRÉE **NON APPLIQUÉE**. Elle DESSERRE une contrainte, et une contrainte ne se desserre que
-- sur accord explicite d'Arno. Tant qu'elle n'est pas là, la sonde `corbeilleDriveDisponible()` rend « non » :
-- l'entrée « Supprimer » ne s'affiche NULLE PART, la route REFUSE même appelée directement, et tout le reste de la
-- fenêtre Drive se comporte exactement comme aujourd'hui.
--
-- ═══ DEMANDE D'ARNO (03/10/2026) ════════════════════════════════════════════════════════════════════════════════
--
-- « Nouvelle entrée du menu clic droit sur une ligne de FICHIER uniquement. Effet : mise à la CORBEILLE du Drive
-- (récupérable 30 jours). JAMAIS de suppression définitive. »
--
-- 🔴 C'EST UNE LEVÉE EXPLICITE, ET ELLE EST BORNÉE. Depuis le lot DRIVE-1, l'application s'interdisait de
-- supprimer quoi que ce soit dans le Drive. Arno lève cet interdit POUR CE SEUL CAS : la mise à la corbeille, qui
-- est RÉVERSIBLE (30 jours, et le bouton « Annuler » de la fenêtre la défait tout de suite). Ce qui reste interdit
-- sans aucune exception : `files.delete` et `files.emptyTrash` — la suppression DÉFINITIVE, qui ne se défait pas.
--
-- ═══ POURQUOI UNE MIGRATION EST NÉCESSAIRE, EN FRANÇAIS SIMPLE ══════════════════════════════════════════════════
--
-- La migration 274 a écrit dans la base la liste des gestes qu'on sait consigner : « déplacer » ou « copier », et
-- rien d'autre. Un troisième geste — la corbeille — serait REFUSÉ par la base au moment de l'inscrire. Or la règle
-- du lot DRIVE-DEPLACER est qu'on n'écrit pas dans le Drive du cabinet ce qu'on ne saurait pas consigner : sans
-- cette migration, la route refuse, et c'est le bon comportement.
--
-- ═══ CE QUE LA CONTRAINTE DEVIENT ══════════════════════════════════════════════════════════════════════════════
--
--   action   : 'deplacer' | 'copier' | 'corbeille' | 'restaurer'
--
-- 🔴 « restaurer » EST UNE ACTION À PART ENTIÈRE, et ce n'est pas une coquetterie. Le retour d'un DÉPLACEMENT est
-- un déplacement : il s'inscrit comme tel (c'est ce que fait déjà `annuler`). Le retour d'une mise à la corbeille,
-- lui, n'est NI un déplacement NI une corbeille — l'écrire sous l'un de ces deux mots rendrait le journal
-- illisible le jour où quelqu'un l'ouvrira pour comprendre où est passé un document.
--
--   parents  : `parent_origine` reste OBLIGATOIRE — c'est le dossier d'où part le document, donc celui où
--              « Annuler » devra le remettre, et la réponse à « où ? » dans le journal.
--              `parent_cible` devient FACULTATIF pour ces deux actions-là : une corbeille n'a pas de destination
--              dans l'arborescence. Écrire le parent d'origine des deux côtés « pour satisfaire la contrainte »
--              aurait été un mensonge inscrit en base, et c'est exactement ce qu'un journal ne doit pas contenir.
--
-- ⚠️ `copie_chk` N'EST PAS TOUCHÉE : elle dit « il y a un identifiant de copie si et seulement si c'est une
-- copie », ce qui reste vrai — une corbeille et une restauration n'en ont pas.
--
-- ⚠️ AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE, et aucune ne peut l'être : les deux contraintes ne font que
-- s'ÉLARGIR. Tout ce qui passait hier passe encore.
--
-- 🔒 ELLE NE TOUCHE À AUCUNE DONNÉE, ne crée aucune table, ne supprime aucune colonne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_drive_mouvement
  DROP CONSTRAINT IF EXISTS gestion_drive_mouvement_action_chk;

ALTER TABLE gestion_drive_mouvement
  ADD CONSTRAINT gestion_drive_mouvement_action_chk
  CHECK (action IN ('deplacer', 'copier', 'corbeille', 'restaurer'));

ALTER TABLE gestion_drive_mouvement
  DROP CONSTRAINT IF EXISTS gestion_drive_mouvement_parents_chk;

ALTER TABLE gestion_drive_mouvement
  ADD CONSTRAINT gestion_drive_mouvement_parents_chk
  CHECK (
    btrim(parent_origine) <> ''
    AND (action IN ('corbeille', 'restaurer') OR btrim(parent_cible) <> '')
  );

COMMENT ON COLUMN gestion_drive_mouvement.action IS
  'deplacer | copier | corbeille | restaurer. « corbeille » = mise à la corbeille du Drive (réversible 30 jours) ;'
  ' « restaurer » = son retour. La suppression DÉFINITIVE n''existe nulle part dans cette application.';

COMMENT ON COLUMN gestion_drive_mouvement.parent_cible IS
  'Le dossier de destination. VIDE pour « corbeille » et « restaurer » : une corbeille n''a pas de destination'
  ' dans l''arborescence, et l''écrire serait un mensonge inscrit au journal.';

COMMIT;
