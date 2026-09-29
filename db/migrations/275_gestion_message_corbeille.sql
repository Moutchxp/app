-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 275 — LA CORBEILLE DE GMAIL, CHEZ NOUS (lot BOITE-INTERNE-CORBEILLE, 29/09/2026)
--
-- CE QU'ELLE AJOUTE : une seule colonne, `gestion_message.corbeille_le`. Elle porte l'instant où NOUS avons constaté
-- que ce message était dans la corbeille de Gmail — ou l'instant où nous l'y avons mis nous-mêmes.
--
-- ═══ 🔴 ELLE REMPLACE UNE CORBEILLE, ELLE N'EN AJOUTE PAS UNE SECONDE ═══════════════════════════════════════════
--
-- La migration 251 avait posé `gestion_fil.corbeille_le` : une corbeille INTERNE, qui cachait un échange de nos
-- boîtes sans jamais rien toucher dans Gmail. Décision d'Arno du 29/09/2026 : c'est la corbeille de GMAIL qui fait
-- foi, un seul état synchronisé, comme le spam et comme le lu/non lu. Deux entrées « Corbeille » côte à côte, avec
-- deux sens différents, n'auraient rien voulu dire.
--
-- 🔒 RIEN N'EST SUPPRIMÉ POUR AUTANT. `gestion_fil.corbeille_le` et ses deux colonnes d'auteur RESTENT EN PLACE,
-- avec leur commentaire réécrit. Elles ne portent AUCUNE donnée — mesuré le 29/09/2026 : **0 échange sur 36 531**,
-- la corbeille interne n'a jamais servi une seule fois — mais les effacer rendrait la 251 irrejouable et ferait
-- perdre la trace de ce qui a existé. C'est la règle du dépôt : un invariant dépassé se RÉÉCRIT, il ne s'efface pas.
--
-- ═══ POURQUOI SUR LE MESSAGE, ET NON SUR L'ÉCHANGE ═══════════════════════════════════════════════════════════════
--
-- Parce que Gmail met à la corbeille des MESSAGES. Une conversation peut parfaitement avoir un message à la
-- corbeille et trois autres dans la boîte — c'est même le cas courant quand on fait le ménage dans un long fil. La
-- 251 raisonnait par échange et devait, pour cette raison, dériver le retour automatique d'une comparaison de dates.
-- Ici il n'y a rien à dériver : l'état est celui de Gmail, relu à chaque passe.
--
-- C'est aussi, exactement, la forme de `spam_le` (migration 263) : même grammaire, même lecture, mêmes gardes.
--
-- ⚠️ NULLABLE, ET C'EST LE POINT : `NULL` = courrier ordinaire, c'est-à-dire tout l'existant. Aucune ligne n'est
-- réécrite, aucune valeur par défaut n'est posée. Appliquer cette migration ne change donc STRICTEMENT RIEN à ce
-- qui est déjà en base — seule la relève suivante commencera à remplir la colonne (201 messages sont dans la
-- corbeille de Gmail au 29/09/2026).
--
-- ⚠️ POURQUOI PAS UN `boolean`. Une date répond en plus à « depuis quand ? » — ce qui compte ici plus qu'ailleurs,
-- puisque GMAIL SUPPRIME DÉFINITIVEMENT SON PROPRE CONTENU DE CORBEILLE AU BOUT DE 30 JOURS. La date dit combien
-- de temps il reste, et c'est ce que la fenêtre annonce.
--
-- 🔒 CE QU'ELLE NE FAIT PAS : aucune suppression, aucune réécriture, aucun changement de contrainte, aucun trigger.
-- Elle est réversible par un simple `ALTER TABLE gestion_message DROP COLUMN corbeille_le`.
--
-- LE CODE TOURNE SANS ELLE. `corbeilleGmailDisponible()` (app/lib/gestion/schema.ts) la sonde HORS TRANSACTION ;
-- tant qu'elle est absente, la colonne n'est NOMMÉE NULLE PART — ni en lecture, ni en écriture. L'entrée
-- « Corbeille » de la colonne de gauche n'apparaît pas, la relève ne lit pas le dossier « [Gmail]/Corbeille », le
-- menu « ⋯ » d'une ligne ne propose pas « Supprimer », et tout le reste du module se comporte exactement comme
-- avant ce lot. Nommer une colonne absente ferait échouer TOUTE la boîte, pas seulement la fonction nouvelle —
-- c'est la leçon de la migration 251, et elle a coûté assez cher pour être respectée deux fois.
--
-- POUR L'APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/275_gestion_message_corbeille.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_message ADD COLUMN IF NOT EXISTS corbeille_le timestamptz;

COMMENT ON COLUMN gestion_message.corbeille_le IS
  'Instant où ce message a été constaté dans la corbeille de Gmail (relève), ou mis à la corbeille depuis l''app. '
  'NULL = il n''y est pas. État MIROIR de Gmail : la relève le pose ET le retire, Gmail fait foi. '
  'Gmail supprime définitivement le contenu de sa corbeille au bout de 30 jours.';

-- INDEX PARTIEL : il n''indexe QUE les lignes de la corbeille (201 au 29/09/2026 sur 57 198 messages), donc quelques
-- kilo-octets. C''est l''index de la liste « Corbeille », triée du plus récent au plus ancien comme toutes les autres.
-- Les 56 997 lignes ordinaires n''y entrent pas — l''exclusion de la corbeille ailleurs se lit sur
-- `corbeille_le IS NULL`, que le planificateur sert sans index (la quasi-totalité des lignes la satisfont ; un index
-- y serait inutile, donc nuisible). Même raisonnement, et même forme, que `gestion_message_spam_idx`.
CREATE INDEX IF NOT EXISTS gestion_message_corbeille_idx
  ON gestion_message (recu_le DESC, fil_id DESC)
  WHERE corbeille_le IS NOT NULL;

-- ── LA CORBEILLE INTERNE DE LA 251 : CONSERVÉE, ET REQUALIFIÉE ──────────────────────────────────────────────────
-- Aucune donnée n''y a jamais été écrite (0 ligne). On ne la supprime pas ; on écrit en base ce qu''elle est
-- devenue, pour que quelqu''un qui lira le schéma dans deux ans ne cherche pas laquelle des deux fait foi.
COMMENT ON COLUMN gestion_fil.corbeille_le IS
  'DÉPASSÉE depuis le lot BOITE-INTERNE-CORBEILLE (29/09/2026), conservée sans être lue. Portait la corbeille '
  'INTERNE de la migration 251 (cacher un échange de nos boîtes sans toucher Gmail) ; jamais utilisée (0 ligne). '
  'La corbeille qui fait foi est celle de Gmail, sur gestion_message.corbeille_le.';

COMMIT;
