-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 310 — LOT HISTORIQUE-BIEN-12, POINT 0 : LES CARTES NÉES D'UN DÉPLACEMENT SORTENT DES CARROUSELS
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DÉCISION D'ARNO (05/10/2026), mot pour mot : « une carte ne naît QUE du « + ». Les cartes 1459, 1461, 1472,
--   1474 et 1476 (nées d'un glisser) passent en 'retire', motif « créée par un déplacement — règle du + »,
--   tracé, jamais supprimées. Leur capsule retrouve son « + ». La carte 1462 (créée par le « + ») reste. »
--
-- ═══ 🔴 CE QUE CETTE MIGRATION RÉPARE, ET CE QU'ELLE NE RÉPARE PAS ══════════════════════════════════════════════
--
-- LE DÉFAUT EST CORRIGÉ DEPUIS LE LOT HISTORIQUE-BIEN-11 (commit c38b215d) : `faireSuivreLaCarte` ne pose plus
-- de carte quand le geste est un déplacement. Aucune carte nouvelle ne peut donc naître ainsi. Cette migration
-- ne touche QUE les cartes déjà nées du défaut — c'est un nettoyage de données, pas une correction de code.
--
-- ⚠️ ON RETIRE, ON NE SUPPRIME PAS, et c'est la règle de ce dépôt : la ligne reste, avec sa date de création,
-- son auteur, et désormais son motif de retrait. L'historique d'un contact doit pouvoir se relire — « d'où sort
-- cette carte, et pourquoi n'est-elle plus là » est exactement la question que ce lot a posée.
--
-- ⚠️ LA CATÉGORIE DU CONTACT N'EST PAS TOUCHÉE, et ce n'est pas un oubli. Le déplacement avait DEUX effets : il
-- rangeait la personne dans un groupe (ce qu'Arno voulait) et il fabriquait une carte (ce qu'il ne voulait pas).
-- Seul le second est annulé. Fanny Rosky reste côté propriétaire du lot 29 ; sa capsule retrouve simplement son
-- « + », parce qu'aucune carte vivante ne la porte plus.
--
-- ═══ 🔴 TROIS DES CINQ ÉTAIENT DÉJÀ RETIRÉES — À LA MAIN, PAR ARNO, LE 05/10 À 15:48 ════════════════════════════
--
--   1472 (a.bruneel@grospiron.com, lot 421) · 1474 (p.larfa@…) · 1476 (i.gauthier@…)
--
-- Elles portent le motif « retirée à la main », qui est VRAI : c'est ce qui s'est passé. Le `WHERE retire_le IS
-- NULL` ci-dessous les laisse donc intactes. Réécrire leur motif aurait effacé une trace exacte pour lui
-- substituer la nôtre — et cette table n'est tenue que pour pouvoir relire ce qui a eu lieu.
--
-- ⚠️ IL RESTE DONC DEUX LIGNES À RETIRER : 1459 et 1461 (lot 29, les deux Rosky). Mesuré juste avant d'écrire.
--
-- ═══ 🔴 CE QUI N'EST PAS DANS LA LISTE D'ARNO, ET QUE JE NE TOUCHE PAS ══════════════════════════════════════════
--
-- La carte **1477** (j.tadeu@lemanoiradb.fr, lot 421, posée le 05/10 à 16:12) n'existait pas quand j'ai dressé
-- la liste. Elle n'est née NI d'un déplacement NI du « + » : sa sœur 480 porte « proposition validée à la
-- main », c'est-à-dire le geste « Valider une proposition » — une création délibérée, comme le « + ». Elle
-- reste, et elle est signalée à Arno plutôt que décidée à sa place.
--
-- ⚠️ REJOUABLE SANS DOMMAGE : le `WHERE retire_le IS NULL` fait de la seconde exécution une opération vide.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

UPDATE gestion_contact_carte
   SET retire_le = now(),
       retire_par_libelle = 'a.jorel@sansvisavis.com',
       retire_motif = 'créée par un déplacement — règle du +'
 WHERE id IN (1459, 1461, 1472, 1474, 1476)
   AND retire_le IS NULL;
