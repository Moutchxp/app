-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 271 — L'ENVOI EN ARRIÈRE-PLAN : file d'envoi persistante, et pièces récupérées en tâche de fond
--       (lot ENVOI-ARRIERE-PLAN, 28/09/2026)
--
-- ═══ CE QU'ON FAISAIT ATTENDRE, ET À QUI ════════════════════════════════════════════════════════════════════════
-- Joindre une pièce du Drive, c'était : le navigateur demande les octets, le serveur les tire du Drive, les renvoie
-- en base64, le navigateur les repousse. Trois allers-retours pendant lesquels l'écran était BLOQUÉ — on ne pouvait
-- pas cliquer « Joindre » sur la pièce suivante. Pour six pièces, six attentes.
--
-- Et l'envoi lui-même tenait dans la requête du navigateur : fermer l'onglet au mauvais moment, c'était un mail qui
-- ne partait pas, sans que personne le sache.
--
-- ⇒ DEUX CHANGEMENTS, ET UN SEUL PRINCIPE : ce qui prend du temps se fait CÔTÉ SERVEUR, et survit à l'onglet.
--
-- ═══ 🔴 POURQUOI UNE FILE EN BASE, ET PAS UNE PROMESSE EN MÉMOIRE ═══════════════════════════════════════════════
-- Une promesse laissée en cours dans le processus Next.js meurt avec lui : un redémarrage, un déploiement, un plantage,
-- et le mail est perdu SANS TRACE — ni parti, ni en brouillon, ni signalé. Une ligne en base, elle, se retrouve au
-- démarrage suivant. C'est la même raison qui fait écrire `gestion_envoi` AVANT l'appel à Gmail (lot 5e) : on veut
-- toujours pouvoir répondre à la question « ce mail est-il parti ? ».
--
-- ═══ 🔴 CE QUI N'EST PAS DANS CETTE TABLE, ET POURQUOI ══════════════════════════════════════════════════════════
-- Elle ne remplace PAS `gestion_envoi`, qui reste le registre de ce qui est RÉELLEMENT remis à Gmail, avec son
-- `cle_idempotence` unique. La file dit « ce mail doit partir » ; `gestion_envoi` dit « ce mail est parti ». Deux
-- questions différentes, deux tables — confondre les deux ferait d'une intention une preuve de remise.
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Le code tourne sans elle : la sonde `fileEnvoiDisponible()`
--    (`app/lib/gestion/schema.ts`) ne nomme ni la table ni les colonnes tant qu'elles n'existent pas. L'envoi reste
--    alors SYNCHRONE — c'est-à-dire exactement le comportement d'aujourd'hui, attente visible comprise — et les
--    pièces du Drive continuent de se joindre une par une. Rien n'est retiré.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/271_gestion_envoi_arriere_plan.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① LES PIÈCES ARRIVENT EN DEUX TEMPS : d'abord leur IDENTITÉ, ensuite leurs OCTETS ───────────────────────────
--
-- 🔴 LA LIGNE EXISTE AVANT LES OCTETS, et c'est tout l'objet du lot : le nom et la taille viennent des MÉTADONNÉES
--    Drive (un appel court), la pièce s'affiche tout de suite dans le mail, et les octets suivent en tâche de fond.
--    Sans ces colonnes, une ligne sans `cle_stockage` serait indiscernable d'une ligne cassée.
ALTER TABLE gestion_brouillon_piece
  -- 'prete' (octets chez nous) | 'attente' (à récupérer) | 'echec' (abandonnée après les reprises).
  ADD COLUMN IF NOT EXISTS etat             text NOT NULL DEFAULT 'prete',
  -- L'identifiant Drive à récupérer. NULL pour une pièce venue du Mac : elle naît déjà prête.
  ADD COLUMN IF NOT EXISTS source_drive_id  text,
  /**
   * 🔴🔴 L'ADRESSE DU COLLABORATEUR QUI A DEMANDÉ LA PIÈCE, ET C'EST UNE COLONNE DE SÉCURITÉ, pas de confort.
   *
   * Le Drive est lu PAR DÉLÉGATION au nom de la personne : Google applique SES droits, dossier par dossier,
   * exactement comme sur drive.google.com. En tâche de fond il n'y a plus de session — si l'on lisait alors avec
   * le jeton de `gestion@`, on irait chercher des fichiers que le demandeur n'a peut-être pas le droit de voir.
   * On garde donc l'adresse, et l'on redemande un jeton POUR ELLE au moment de récupérer les octets.
   */
  ADD COLUMN IF NOT EXISTS source_compte    text,
  ADD COLUMN IF NOT EXISTS essais           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS derniere_erreur  text,
  -- Le bail du travailleur de fond : une ligne prise il y a plus de N minutes est reprise (processus mort).
  ADD COLUMN IF NOT EXISTS pris_le          timestamptz;

-- ⚠️ `DEFAULT 'prete'` SUR LES LIGNES EXISTANTES, et c'est le bon défaut : toutes les pièces déjà en base ont leurs
--    octets. Un défaut 'attente' les ferait toutes re-télécharger depuis un Drive qu'elles n'ont jamais connu.
DO $$ BEGIN
  ALTER TABLE gestion_brouillon_piece ADD CONSTRAINT gestion_brouillon_piece_etat_chk
    CHECK (etat = ANY (ARRAY['prete', 'attente', 'echec']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN gestion_brouillon_piece.etat IS
  'prete = les octets sont chez nous | attente = à récupérer du Drive | echec = abandonnée après les reprises. '
  'Un envoi ne part QUE si toutes ses pièces sont « prete » : jamais d''envoi partiel.';

-- La question du travailleur de fond : « qu''y a-t-il à récupérer ? ». Partiel : la quasi-totalité des lignes est
--   « prete », et un index sur toute la table ne servirait qu''à la faire grossir.
CREATE INDEX IF NOT EXISTS gestion_brouillon_piece_attente_idx
  ON gestion_brouillon_piece (etat, pris_le) WHERE etat = 'attente' AND retire_le IS NULL;

-- ── ② LA FILE D'ENVOI ───────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_envoi_file (
  id                  bigserial PRIMARY KEY,
  /**
   * 🔴 LA MÊME CLÉ D'IDEMPOTENCE QUE `gestion_envoi`, et UNIQUE ici aussi. C'est elle qui fait qu'un double-clic,
   * un navigateur qui rejoue la requête ou un rechargement pendant le compte à rebours ne mettent pas deux mails
   * dans la file. La base tranche ; le code ne compte pas sur un bouton désactivé.
   */
  cle_idempotence     text        NOT NULL UNIQUE,
  brouillon_id        bigint      REFERENCES gestion_brouillon(id) ON DELETE SET NULL,
  fil_id              bigint,
  repond_a_message_id bigint,
  voie                text,
  dest_a              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  dest_cc             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  dest_cci            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  objet               text        NOT NULL DEFAULT '',
  corps               text        NOT NULL DEFAULT '',
  corps_html          text,
  cibles              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  auteur_id           bigint      REFERENCES admin_utilisateur(id),
  auteur_libelle      text        NOT NULL DEFAULT 'inconnu',
  -- 'attente' | 'en_cours' | 'envoye' | 'echec'
  etat                text        NOT NULL DEFAULT 'attente',
  /**
   * 🔴 L'HEURE DU CLIC, et elle ne sert QU'À L'ALERTE (« vous avez cliqué à 18 h 12 »). Elle n'est JAMAIS la date
   * du mail : celle-ci est l'heure à laquelle Gmail l'a réellement accepté. Une fausse date sur un mail parti est
   * un mensonge qui se propage dans toutes les boîtes qui le reçoivent.
   */
  demande_le          timestamptz NOT NULL DEFAULT now(),
  -- Le bail du travailleur : repris au-delà d'un délai, pour qu'un processus mort ne bloque pas la file.
  pris_le             timestamptz,
  essais              integer     NOT NULL DEFAULT 0,
  derniere_erreur     text,
  -- La ligne de `gestion_envoi` ouverte au moment de la remise réelle. NULL tant que rien n'est parti.
  envoi_id            bigint      REFERENCES gestion_envoi(id) ON DELETE SET NULL,
  termine_le          timestamptz,
  /**
   * 🔴 UNE SEULE ALERTE PAR ÉCHEC, JAMAIS DE RAFALE. Cette date est posée quand l'alerte part ; le travailleur ne
   * ré-alerte pas sur une ligne qui la porte. Sans elle, une passe par minute enverrait une alerte par minute —
   * c'est-à-dire qu'on cesserait de les lire, ce qui est pire que de ne pas en envoyer.
   */
  alerte_le           timestamptz,
  CONSTRAINT gestion_envoi_file_etat_chk
    CHECK (etat = ANY (ARRAY['attente', 'en_cours', 'envoye', 'echec']))
);

COMMENT ON TABLE gestion_envoi_file IS
  'La file d''envoi : ce qui DOIT partir. `gestion_envoi` reste le registre de ce qui EST parti — la file dit une '
  'intention, l''autre une remise. Une ligne survit au redémarrage du serveur : c''est toute la raison d''être de '
  'cette table, contre une promesse laissée en mémoire qui meurt sans laisser de trace.';

-- La question du travailleur : « que reste-t-il à envoyer ? ». Partiel : une file saine est presque toujours vide.
CREATE INDEX IF NOT EXISTS gestion_envoi_file_a_faire_idx
  ON gestion_envoi_file (etat, demande_le) WHERE etat IN ('attente', 'en_cours');

-- La question de l'écran : « qu'y a-t-il à montrer dans Envoyés, et dans ce fil ? ».
CREATE INDEX IF NOT EXISTS gestion_envoi_file_fil_idx
  ON gestion_envoi_file (fil_id, demande_le DESC) WHERE etat <> 'envoye';

COMMIT;
