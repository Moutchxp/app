-- 410_gestion_evenement_rattache_depuis.sql — GESTION « ÉVÉNEMENTS » (Arno, 23/10/2026) : LA DATE DE DÉBUT DE RATTACHEMENT.
--
-- DÉCISION D'ARNO : « on garde DEUX dates distinctes. ① Date d'ouverture = date et heure de CRÉATION de l'événement (carte
-- Ouverture, statistiques ; jamais dans le futur). ② Date de début de rattachement = date du MAIL à partir duquel l'événement a été
-- créé : tous les mails du fil reçus ou envoyés à partir de cette date (incluse) portent “Événement en cours” et comptent dans
-- l'événement, même s'ils sont antérieurs à la création. Sans mail : la date de création. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne n'est supprimée ; seule la colonne neuve est remplie) :
--   · la colonne `gestion_evenement.rattache_depuis` (timestamptz, NULL permis) ;
--   · la REPRISE des événements existants, là où elle est vide : la date du mail d'origine (la première affectation de
--     l'événement, quand elle porte un mail : « ce mail seul ») ; sinon la date d'ouverture D'ORIGINE (celle d'avant toute
--     correction, lue au journal — `valeur_avant` de la première ligne « ouverture » qui en porte une — sinon `ouvert_le`).
--     Jamais dans le futur.
-- IDEMPOTENTE (rejouable) : la reprise ne touche que les lignes encore vides. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe
-- dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : la règle des périodes lit la colonne par `to_jsonb(e) ->> 'rattache_depuis'` (NULL
-- sans elle ⇒ règle d'avant), et la création ne l'écrit que si la colonne existe (`rattacheDepuisDisponible`).

ALTER TABLE gestion_evenement ADD COLUMN IF NOT EXISTS rattache_depuis timestamptz;

COMMENT ON COLUMN gestion_evenement.rattache_depuis IS
  'Date de début de rattachement (410, Arno 23/10/2026) : date du mail d''origine, sinon la création. Les mails du fil datés à partir d''elle comptent dans l''événement (première période élargie vers le passé). Ne sert ni aux périodes ni aux statistiques : l''ouverture reste ouvert_le (la création).';

UPDATE gestion_evenement e
   SET rattache_depuis = LEAST(coalesce(
         (SELECT m.recu_le
            FROM (SELECT a.message_id FROM gestion_affectation a WHERE a.evenement_id = e.id ORDER BY a.id LIMIT 1) a1
            JOIN gestion_message m ON m.id = a1.message_id),
         (SELECT j.valeur_avant::timestamptz FROM gestion_journal j
           WHERE j.entite = 'evenement' AND j.entite_id = e.id AND j.action = 'ouverture'
             AND j.valeur_avant ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           ORDER BY j.id LIMIT 1),
         e.ouvert_le), now())
 WHERE e.rattache_depuis IS NULL;
