-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LOT 5-FIDÈLE — LE PONT ENTRE NOTRE BASE ET LA VRAIE BOÎTE GMAIL.
--
-- 🔴 LIVRÉE NON APPLIQUÉE. Tant qu'elle ne l'est pas, les actions Gmail retrouvent le message à CHAQUE fois par une
-- recherche `rfc822msgid:` — elles marchent, simplement au prix d'une requête de plus. Aucun écran ne casse, aucune
-- fonctionnalité n'est conditionnée à cette migration : elle ne fait qu'éviter de redemander ce qu'on sait déjà.
--
-- 🔴 POURQUOI MÉMORISER, ET POURQUOI SEULEMENT ÇA. L'identifiant Gmail d'un message n'existe nulle part chez nous :
-- il se demande à Google. Le `Message-ID` RFC, lui, est écrit dans le message et ne bouge jamais — c'est le pont.
-- Une fois la correspondance faite, on garde les deux identifiants Gmail (message et fil) : poser une étoile ne
-- redemande alors plus « quel message ? » avant de demander « mets-lui une étoile ».
--
-- ⚠️ ON NE MÉMORISE AUCUN LIBELLÉ (étoile, non lu, spam). L'état vrai est celui de Gmail, et il change sous nos pieds
-- — quelqu'un de l'équipe peut étoiler depuis son téléphone. Le copier ici, c'est garantir de l'afficher faux.
--
-- ADDITIVE, réversible, sans effet sur l'existant : deux colonnes NULLABLES sans valeur par défaut.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_message
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id  text;

-- Retrouver nos messages depuis un identifiant Gmail (le jour où une notification Gmail nous en donnera un).
CREATE INDEX IF NOT EXISTS gestion_message_gmail_idx
  ON gestion_message (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

COMMENT ON COLUMN gestion_message.gmail_message_id IS
  'LOT 5-FIDÈLE — identifiant Gmail du message, obtenu par recherche rfc822msgid. NULL = correspondance jamais faite.';
COMMENT ON COLUMN gestion_message.gmail_thread_id IS
  'LOT 5-FIDÈLE — identifiant du fil Gmail. Sert au lien « ouvrir dans Gmail » et au rangement d''une réponse.';
