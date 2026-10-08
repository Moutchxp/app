-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ══ 322 — UNE CARTE POSÉE À UN ENDROIT CHOISI, ET QUI NE DOIT PAS PASSER À L'ORANGE ══════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (08/10/2026, lot FRISE-PLUS-INTERCALAIRE-ET-ENTETE-EVENEMENTS, point 1) :
--   « Un élément (point OU carré) créé depuis un “+” intercalaire doit être enregistré EXACTEMENT à cet
--     emplacement (entre les deux éléments qui entourent ce “+”), via rang_pose. […] Cet emplacement voulu ne
--     doit faire passer AUCUN carré à l'orange : l'orange reste réservé aux carrés déplacés à la main.
--     L'élément inséré affiche normalement “créée le JJ/MM/AAAA” en vert. »
--
-- ══ 🔴🔴 POURQUOI UNE COLONNE, ET NON UNE DÉDUCTION ══════════════════════════════════════════════════════════════
--
-- L'orange de la frise compare la place RÉELLE d'une carte à l'ordre de ses horodatages de création
-- (`cartesHorsChronologie`, lot FRISE-HORODATAGE-SECONDE-ET-PICTOS). Une carte insérée AU MILIEU porte
-- forcément l'horodatage le plus récent : la règle la verrait donc « déplacée » — et, pire, elle ferait passer
-- ses VOISINES à l'orange, puisqu'elle casse leur suite croissante. C'est exactement ce qu'Arno interdit.
--
-- 🔴 IL FALLAIT DONC QUE LA CARTE SACHE DIRE « ma place a été CHOISIE, elle n'a jamais découlé de ma date ».
-- Une telle carte sort de la comparaison : ni marquée, ni prise comme repère.
--
-- 🔴 UNE DÉDUCTION AURAIT ÉTÉ FRAGILE, ET IL FAUT DIRE LAQUELLE ON A ÉCARTÉE : un `rang_pose` FRACTIONNAIRE
-- (1,5 entre 1 et 2) trahit une insertion, puisque l'ajout en fin et la renumérotation du glisser ne produisent
-- que des entiers (vérifié : 0 rang fractionnaire sur les 179 cartes de la base à ce jour). Mais le premier
-- glisser venu renumérote TOUT l'événement en entiers : la carte insérée perdrait son exemption sans que
-- personne ne l'ait touchée, et passerait à l'orange toute seule. Un fait écrit ne s'efface pas par accident.
--
-- ⚠️ CE QU'ELLE NE DIT PAS : elle ne dit pas « cette carte a été déplacée ». Un glisser ultérieur ne l'efface
-- donc pas — la carte n'a toujours pas été rangée par son ordre de création, et c'est la seule chose que la
-- colonne affirme.
--
-- ══ MIGRATION D'AJOUT PURE ══════════════════════════════════════════════════════════════════════════════════════
--
-- Une colonne AJOUTÉE, avec un défaut : aucune colonne retirée, aucune renommée, aucune contrainte touchée,
-- aucune ligne existante modifiée dans son sens — `false` est exactement ce que les 179 cartes d'aujourd'hui
-- sont : posées en fin de frise, ou rangées par un glisser.
--
-- RETOUR EN ARRIÈRE : `ALTER TABLE gestion_monga_etape DROP COLUMN pose_choisie;` rend la base à son état
-- d'avant. Aucune donnée d'avant cette migration n'en dépend.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_monga_etape
  ADD COLUMN IF NOT EXISTS pose_choisie boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gestion_monga_etape.pose_choisie IS
  'Carte posée à un emplacement CHOISI (« + » intercalaire) : sa place ne découle pas de son horodatage de '
  'création, elle est donc hors du calcul vert/orange de la frise — ni marquée, ni prise comme repère.';
