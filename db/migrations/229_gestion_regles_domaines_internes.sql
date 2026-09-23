-- 229_gestion_regles_domaines_internes.sql — MODULE « GESTION » : on ÉTEINT les deux règles « domaine interne ». LOT 3-bis.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — UN FAIT MÉTIER QUE LA SONDE NE POUVAIT PAS VOIR.
--
-- La migration 228 avait semé ACTIVES deux règles `domaine_expediteur` (criterimmo.fr, sansvisavis.com), sur un raisonnement
-- qui semblait sûr : un message venu de la maison est du courrier interne, pas la demande d'un tiers. La sonde avait
-- d'ailleurs compté 11 messages entrants sur 105 venant de ces domaines.
--
-- CE RAISONNEMENT ÉTAIT FAUX, et voici ce qui manquait : un collègue du service location, qui reçoit un mail de locataire
-- sur SA propre adresse, clique sur « Transférer » dans Gmail pour le faire suivre à la gestion. L'expéditeur du message
-- qui arrive dans la boîte devient alors SON adresse — donc une adresse interne. Ces messages sont de VRAIES demandes,
-- souvent les plus urgentes (c'est un humain qui a jugé qu'il fallait les transmettre). Les deux règles les tiendraient
-- hors de la file, en silence : exactement le défaut que tout ce module est construit pour éviter.
--
-- ⚠️ CETTE MIGRATION EST À APPLIQUER AVANT LA PREMIÈRE RELÈVE RÉELLE. À ce stade aucune passe n'a encore tourné, donc
-- aucun message n'a été écarté par ces règles : la partie 2 ci-dessous touchera 0 ligne. Elle est écrite quand même, parce
-- qu'une règle qu'on éteint DOIT pouvoir faire revenir ce qu'elle avait écarté — c'est la promesse du schéma, et une
-- migration qui ne la tiendrait pas serait un piège pour la prochaine.
--
-- CE QUI NE CHANGE PAS : la règle « Document CRITERIMMO » reste ACTIVE (c'est le bruit prouvé : 201 des 295 sortants
-- mesurés), et les neuf règles de signal d'en-tête restent ÉTEINTES (elles écarteraient les notifications MONGA).
-- AUCUNE RÈGLE N'EST SUPPRIMÉE : on éteint, on date, on journalise. Rallumer est un clic.
--
-- 🔭 LOT ULTÉRIEUR, VOLONTAIREMENT PAS FAIT ICI — lire l'AUTEUR D'ORIGINE d'un transfert. Un message transféré porte dans
-- son corps un en-tête « ---------- Message transféré ---------- » avec le De: réel. Le lire permettrait : (a) d'afficher
-- le vrai demandeur plutôt que le collègue qui a transféré ; (b) de relier les messages suivants par l'adresse de ce
-- demandeur — rattachement automatique s'il n'a qu'UNE carte ouverte, simple proposition sinon (jamais au jugé). Tant que
-- ce lot n'existe pas, ces messages entrent dans la file au nom du collègue : c'est imparfait, mais VISIBLE — et visible
-- vaut infiniment mieux qu'écarté.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : aucune DDL du tout (pas une table, pas une colonne, pas un index). Deux UPDATE de DONNÉES, tous deux BORNÉS aux
--   seules lignes concernées et IDEMPOTENTS (`AND actif` / `WHERE exclu_par_regle_id IN (…)` : rejouer ne refait rien et
--   ne double aucune ligne de journal). Aucun DROP, aucun DELETE, aucune suppression de règle. Ne touche NI le module
--   Permis, NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). Une seule transaction. Rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/229_gestion_regles_domaines_internes.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- PARTIE 1 — ON ÉTEINT LES DEUX RÈGLES, on les date, et on journalise le geste.
--   Le MOTIF est réécrit pour dire l'état ET sa raison : c'est ce texte que l'écran des réglages montrera, et c'est lui
--   qu'un humain relira dans six mois en se demandant pourquoi cette règle dort. `AND actif` rend l'UPDATE idempotent
--   (une seconde application ne retouche rien et n'écrit aucune seconde ligne de journal).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
WITH maj AS (
  UPDATE gestion_regle_exclusion
     SET actif = false,
         desactive_le = now(),
         desactive_par_libelle = 'migration 229',
         motif = 'Courrier venu d''un domaine de la maison. ÉTEINTE : le service location TRANSFÈRE à la gestion des mails de locataires — l''expéditeur devient alors une adresse interne, alors que ce sont de VRAIES demandes. La rallumer les rendrait invisibles.',
         maj_le = now()
   WHERE type = 'domaine_expediteur'
     AND lower(valeur) IN ('criterimmo.fr', 'sansvisavis.com')
     AND actif
  RETURNING id, valeur
)
INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
SELECT 'regle', maj.id, 'changement_etat', 'actif', 'inactif',
       'Éteinte avant la première relève : un collègue du service location transfère à la gestion des mails de locataires, '
       || 'l''expéditeur devient alors « ' || maj.valeur || ' » et la règle écarterait de vraies demandes.',
       'migration 229'
  FROM maj;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- PARTIE 2 — ON FAIT REVENIR DANS LA FILE ce que ces deux règles avaient écarté.
--   ⚠️ À la date d'écriture, AUCUNE passe n'a tourné : cet UPDATE touchera 0 ligne. Il est là parce qu'éteindre une règle
--   DOIT pouvoir rendre ses messages — sans quoi « on ne supprime jamais » ne serait qu'une phrase.
--   Le message reprend sa place telle quelle : il n'est ni modifié, ni déplacé, ni re-jugé par les autres règles. C'est la
--   direction SÛRE — un message rendu à tort à la file est visible et se classe en un clic, quand un message gardé dehors
--   à tort est invisible. Et le fil, s'il avait été classé sans suite, n'est pas touché : c'est une décision humaine.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
WITH rendus AS (
  UPDATE gestion_message m
     SET exclu_le = NULL, exclu_par_regle_id = NULL, exclu_motif = NULL, maj_le = now()
    FROM gestion_regle_exclusion r
   WHERE r.id = m.exclu_par_regle_id
     AND r.type = 'domaine_expediteur'
     AND lower(r.valeur) IN ('criterimmo.fr', 'sansvisavis.com')
  RETURNING m.id
)
INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
SELECT 'message', rendus.id, 'retour_file', 'exclu', 'dans la file',
       'La règle de domaine interne qui l''avait écarté a été éteinte (migration 229) : le message revient dans la file.',
       'migration 229'
  FROM rendus;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① état des règles : UNE SEULE active (« Document CRITERIMMO »), 11 éteintes :'
--   SELECT actif, count(*) FROM gestion_regle_exclusion GROUP BY actif ORDER BY actif DESC;
--   SELECT type, valeur, sens, actif, desactive_le IS NOT NULL AS datee FROM gestion_regle_exclusion ORDER BY actif DESC, type, valeur;
--   -- ⚠️ Ceci REMPLACE l'état annoncé par le bloc de vérification de la migration 228 (« 3 actives ») : c'est 229 qui fait foi.
--
-- \echo '>>> ② le motif des deux règles éteintes dit POURQUOI (c''est ce texte que l''écran montrera) :'
--   SELECT valeur, motif FROM gestion_regle_exclusion WHERE type = 'domaine_expediteur' ORDER BY valeur;
--
-- \echo '>>> ③ le geste est journalisé (append-only) :'
--   SELECT entite, action, valeur_avant, valeur_apres, auteur_libelle, commentaire
--     FROM gestion_journal WHERE auteur_libelle = 'migration 229' ORDER BY id;
--
-- \echo '>>> ④ aucun message ne reste écarté par une règle de domaine interne :'
--   SELECT count(*) AS restes FROM gestion_message m JOIN gestion_regle_exclusion r ON r.id = m.exclu_par_regle_id
--    WHERE r.type = 'domaine_expediteur';
--   -- attendu : 0 (et 0 aussi avant application, tant qu''aucune relève n''a tourné)
--
-- \echo '>>> ⑤ idempotence : relancer la migration ne doit RIEN retoucher ni rejournaliser.'
--   -- Relancer la commande d'application, puis :
--   SELECT count(*) AS lignes_journal FROM gestion_journal WHERE auteur_libelle = 'migration 229';
--   -- attendu : le MÊME nombre qu'à l'étape ③ (2 lignes)
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (rallumer les deux règles — à ne faire QUE si le fait métier ci-dessus se révélait faux) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "UPDATE gestion_regle_exclusion \
--      SET actif = true, desactive_le = NULL, desactive_par_libelle = NULL, maj_le = now() \
--    WHERE type = 'domaine_expediteur' AND lower(valeur) IN ('criterimmo.fr','sansvisavis.com');"
--   (Les lignes de journal, elles, RESTENT : gestion_journal est append-only, et l'histoire d'une décision ne se réécrit pas.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
