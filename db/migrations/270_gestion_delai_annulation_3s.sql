-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 270 — LA FENÊTRE D'ANNULATION D'ENVOI PASSE À 3 SECONDES (lot EDITEUR-PJ, 28/09/2026)
--
-- ═══ CE QUI CHANGE, ET POURQUOI ═════════════════════════════════════════════════════════════════════════════════
-- Demande d'Arno. La valeur d'origine — 10 s, posée par la migration 241 — reposait sur un raisonnement qui se
-- trompait sur ce qu'on fait pendant ce délai : « le temps de relire l'objet ». On ne relit rien, on attend. Quand
-- on se ravise, on le sait DÉJÀ au moment du clic, et trois secondes suffisent largement à porter la main sur
-- « Annuler l'envoi ». Dix secondes, c'est dix secondes passées à regarder un message ne pas partir, chaque fois.
--
-- ═══ 🔴 DEUX CHOSES À CHANGER, ET IL FAUT LES DEUX ══════════════════════════════════════════════════════════════
-- ① la VALEUR de la ligne de configuration — c'est elle qui s'applique aujourd'hui ;
-- ② le DÉFAUT de la colonne — sans quoi une base neuve renaîtrait à 10 s, et l'on chercherait longtemps d'où
--    vient ce délai que personne n'a demandé.
--
-- ⚠️ LA MIGRATION 241 N'EST PAS MODIFIÉE. Elle est appliquée depuis longtemps : la retoucher ne changerait rien
--    ici et mentirait sur ce qui s'est passé. Une migration est un fait daté, pas un réglage qu'on réécrit.
--
-- ⚠️ LE CODE N'EN DÉPEND PAS POUR FONCTIONNER : `CONFIG_GESTION_DEFAUT.annulationEnvoiSecondes` vaut déjà 3, et
--    ce repli s'applique si la colonne manque ou porte une valeur aberrante. Cette migration aligne la BASE.
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE — mais la ligne de configuration, elle, a DÉJÀ été passée à 3 pendant le lot
--    (c'était la demande : « le délai passe à 3 secondes »). Appliquer ce fichier est donc sans effet sur la
--    valeur courante ; il sert à fixer le DÉFAUT de la colonne pour toute base future.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/270_gestion_delai_annulation_3s.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_config
  ALTER COLUMN annulation_envoi_secondes SET DEFAULT 3;

-- La ligne de configuration est un singleton : on la ramène à 3 si elle porte encore l'ancienne valeur. On ne
--   touche PAS à une valeur qu'Arno aurait lui-même choisie autrement (5, 15…) — ce serait défaire son réglage.
UPDATE gestion_config
   SET annulation_envoi_secondes = 3
 WHERE annulation_envoi_secondes = 10;

COMMENT ON COLUMN gestion_config.annulation_envoi_secondes IS
  'Secondes pendant lesquelles « Annuler l''envoi » reste possible, AVANT que la moindre requête ne parte. '
  '3 par défaut depuis le 28/09/2026 (lot EDITEUR-PJ) ; 0 est valide (aucune fenêtre), 60 est le maximum.';

COMMIT;
