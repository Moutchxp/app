-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LOT 5e — LE REGISTRE DES ENVOIS DE LA BOÎTE GESTION.
--
-- 🔴 LIVRÉE NON APPLIQUÉE (voir 239_gestion_brouillon.sql).
--
-- 🔴 LA LIGNE EST ÉCRITE AVANT L'APPEL RÉSEAU, puis finalisée. C'est la seule façon de ne jamais perdre la trace d'un
-- envoi : si l'application tombe entre l'appel et la réponse de Gmail, la ligne reste `en_cours` — on SAIT qu'un mail a
-- peut-être été envoyé, au lieu de ne rien savoir du tout. Même patron que `gestion_releve_run` (migration 228).
--
-- 🔴 `cle_idempotence` UNIQUE : un double-clic, un renvoi de formulaire ou un navigateur qui rejoue la requête ne
-- produisent QU'UN envoi. C'est la base qui tranche, jamais le code — un verrou applicatif ne survit pas à deux
-- processus, et deux mails partis au même correspondant ne se rattrapent pas.
--
-- 🔴 `message_id_rfc` est NOTRE Message-ID, écrit par nous à l'envoi. La relève le reconnaîtra dans « Envoyés » et
-- n'en fera pas un doublon : c'est ce qui permet au message de revenir dans le fil sans s'y compter deux fois.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gestion_envoi (
  id                 bigserial PRIMARY KEY,

  -- 🔴 LA GARDE CONTRE LE DOUBLE ENVOI. Fournie par l'écran, tranchée par la base.
  cle_idempotence    text NOT NULL UNIQUE,

  brouillon_id       bigint REFERENCES gestion_brouillon(id) ON DELETE SET NULL,
  fil_id             bigint REFERENCES gestion_fil(id) ON DELETE SET NULL,
  repond_a_message_id bigint REFERENCES gestion_message(id) ON DELETE SET NULL,

  -- Notre Message-ID, posé AVANT l'appel : c'est lui que la relève retrouvera dans « Envoyés ».
  message_id_rfc     text NOT NULL,
  -- In-Reply-To et References du message d'origine, pour rester dans le bon fil Gmail.
  in_reply_to        text,
  references_rfc     text,

  dest_a             jsonb NOT NULL DEFAULT '[]'::jsonb,
  dest_cc            jsonb NOT NULL DEFAULT '[]'::jsonb,
  dest_cci           jsonb NOT NULL DEFAULT '[]'::jsonb,
  objet              text NOT NULL DEFAULT '',

  -- QUI a envoyé. Lu dans la SESSION côté serveur (invariant du lot 5-DROITS) : l'auteur d'un envoi ne s'auto-déclare pas.
  auteur_id          integer,
  auteur_libelle     text NOT NULL,

  -- 'en_cours' → 'envoye' | 'echec' | 'annule'. Jamais laissé en silence : l'écran dit lequel des trois.
  etat               text NOT NULL DEFAULT 'en_cours' CHECK (etat IN ('en_cours', 'envoye', 'echec', 'annule')),
  -- Identifiant rendu par Gmail. Sert à retrouver le message côté Google, jamais à l'afficher.
  gmail_message_id   text,
  erreur             text,

  demande_le         timestamptz NOT NULL DEFAULT now(),
  parti_le           timestamptz
);

-- Les envois d'un échange, du plus récent au plus ancien : ce que la conversation affiche sous les messages.
CREATE INDEX IF NOT EXISTS gestion_envoi_fil_idx ON gestion_envoi (fil_id, demande_le DESC);
-- Retrouver un envoi par NOTRE Message-ID, quand la relève le ramène depuis « Envoyés ».
CREATE INDEX IF NOT EXISTS gestion_envoi_message_id_idx ON gestion_envoi (message_id_rfc);

COMMENT ON TABLE gestion_envoi IS
  'LOT 5e — registre des envois au nom de gestion@. Ligne écrite AVANT l''appel réseau, clé d''idempotence UNIQUE.';
