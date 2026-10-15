-- 360_capture_sortants_passe.sql — journal des passes de capture des envoyés (FIL-C) : le CURSEUR qui lui manquait.
-- Lot LENTEUR DE LA VEILLE (15/10/2026).
--
-- POURQUOI : la capture des réponses envoyées hors outil relisait, à CHAQUE passe de veille (toutes les 15 min), le dossier
-- « envoyés » depuis le PREMIER envoi de demande (72 jours au 15/10/2026, et la fenêtre ne faisait que grandir) : ~3 min
-- par passe sur le serveur. Aucun curseur n'existait, ni en base ni dans un fichier.
--
-- CE QUE C'EST : une ligne par passe de capture qui a pu lire le dossier jusqu'au bout. Le curseur = début de la dernière
-- passe « ok » ; la passe suivante relit depuis curseur − 3 jours (même marge que la relève, P1). Une passe en échec IMAP
-- n'écrit rien (le curseur n'avance pas) ; une passe où un stockage a échoué est « partiel » (le curseur n'avance pas non
-- plus) → jamais un envoi « certifié vu » sans l'avoir été. `message_ids` = les Message-ID de fils couverts par la passe :
-- dès qu'un fil apporte un Message-ID NOUVEAU, la passe suivante relit toute la fenêtre d'origine (aucune détection perdue).
--
-- SÛR : table neuve, vide ; aucune donnée existante touchée ; aucun envoi. Tant qu'elle est absente, la capture garde son
-- ancienne fenêtre (repli). IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe avec son inscription.

CREATE TABLE IF NOT EXISTS capture_sortants_passe (
  id           bigserial    PRIMARY KEY,
  profil       text         NOT NULL CHECK (profil IN ('entreprise', 'personne')),
  debut        timestamptz  NOT NULL,
  fin          timestamptz  NOT NULL DEFAULT now(),
  depuis       timestamptz  NOT NULL,
  message_ids  text[]       NOT NULL,
  examines     integer      NOT NULL CHECK (examines >= 0),
  captures     integer      NOT NULL CHECK (captures >= 0),
  erreurs      integer      NOT NULL CHECK (erreurs >= 0),
  resultat     text         NOT NULL CHECK (resultat IN ('ok', 'partiel'))
);

CREATE INDEX IF NOT EXISTS capture_sortants_passe_curseur_idx ON capture_sortants_passe (profil, debut DESC) WHERE resultat = 'ok';

COMMENT ON TABLE capture_sortants_passe IS
  'Passes de capture des envoyés hors outil (FIL-C) : curseur = début de la dernière passe ok ; relecture depuis curseur − 3 j ; Message-ID nouveau → relecture complète. Lignes de plus de 30 jours purgées par l''application (la dernière ok est toujours gardée).';
