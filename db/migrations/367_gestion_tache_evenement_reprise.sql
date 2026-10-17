-- 367_gestion_tache_evenement_reprise.sql — LOT GESTION-TACHES-EVENEMENTS-FUSION (17/10/2026) : REPRISE DE L'ANCIEN
-- CHAMP « Événement du bien lié » DANS LES RATTACHEMENTS MULTIPLES.
--
-- DÉCISION D'ARNO : « fusionne avec le nouveau sélecteur, sans rien perdre : l'événement déjà lié par l'ancien champ
-- apparaît coché d'office ; les tâches existantes qui n'ont que l'ancien lien reçoivent aussi leur point dans la frise ;
-- l'ancien champ disparaît de la fenêtre seulement une fois la reprise faite ; la donnée d'origine reste en base. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : pour chaque tâche dont `gestion_tache.evenement_id` est renseigné, une ligne dans
-- `gestion_tache_evenement` (migration 366), sauf si ce rattachement existe déjà, actif. La ligne reprend la date de
-- création de la tâche et son créateur, avec le libellé « reprise de “Événement du bien lié” (migration 367) ».
-- `gestion_tache.evenement_id` n'est NI modifié NI effacé : la donnée d'origine reste en base.
-- Aucune autre table n'est touchée. Exige la 366.
--
-- IDEMPOTENTE (NOT EXISTS). Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son
-- inscription.

INSERT INTO gestion_tache_evenement (tache_id, evenement_id, ajoute_le, ajoute_par, ajoute_par_libelle)
SELECT t.id, t.evenement_id, t.cree_le, t.cree_par, 'reprise de « Événement du bien lié » (migration 367)'
  FROM gestion_tache t
 WHERE t.evenement_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM gestion_tache_evenement x
                    WHERE x.tache_id = t.id AND x.evenement_id = t.evenement_id AND x.retire_le IS NULL);
