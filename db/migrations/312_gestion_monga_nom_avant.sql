-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 312 — LOT MONGA-1, POINT 3 : LE NOM QUE L'ÉVÉNEMENT PORTAIT AVANT D'ÊTRE RELIÉ
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- RÈGLE D'ARNO (06/10/2026), mot pour mot : « Quand une référence est reliée à un événement EXISTANT, l'événement
--   PREND le libellé Monga. L'ancien nom est conservé et visible dans l'historique de l'événement. Ensuite, le nom
--   est verrouillé. » Et, pour le geste : « “Annuler” quelques secondes après. »
--
-- ═══ 🔴🔴 POURQUOI UNE COLONNE, ALORS QUE LE JOURNAL GARDE DÉJÀ L'ANCIEN NOM ════════════════════════════════════
--
-- L'« ancien nom conservé et visible dans l'historique » est tenu par `gestion_journal` : `modifierEvenement`
-- écrit la valeur AVANT et la valeur APRÈS, l'auteur et la date. Cette colonne ne le remplace pas, et ne sert pas
-- à l'affichage.
--
-- 🔴 ELLE SERT À L'« ANNULER ». Pour remettre le nom d'avant, il faut le CONNAÎTRE. Sans elle, l'annulation
-- devrait relire le journal et deviner laquelle de ses lignes est la bonne — en se fiant à la forme d'un
-- commentaire en français (« objet modifié sur GES-… »), c'est-à-dire à un texte d'affichage. Un jour où ce texte
-- change, l'annulation remettrait un nom au hasard, ou aucun, et personne ne le verrait avant qu'Arno s'en
-- plaigne.
--
-- ⚠️ `NULL` A UN SENS, ET DEUX : soit le nom n'a pas changé (l'événement portait déjà le libellé Monga), soit
-- l'événement vient d'être CRÉÉ par le geste — il n'avait pas de nom d'avant. Dans les deux cas, l'annulation n'a
-- aucun nom à remettre, et c'est juste.
--
-- ⚠️ ADDITIVE : une colonne nullable sur une table née à la migration 311, le même jour. Aucune ligne existante
-- n'est touchée (elle en compte zéro au moment où ceci s'applique), aucune contrainte n'est modifiée.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_monga_lien ADD COLUMN IF NOT EXISTS nom_avant text;

COMMENT ON COLUMN gestion_monga_lien.nom_avant IS
  'LOT MONGA-1 : le « quoi » que l''événement portait juste avant que la RÈGLE DU NOM d''Arno ne lui donne le '
  'libellé Monga. Sert à l''« Annuler » des secondes qui suivent, et à lui SEUL — l''ancien nom reste visible '
  'dans gestion_journal, qui est l''historique. NULL = le nom n''a pas changé, ou la carte vient de naître.';
