-- 398_location_mail_message.sql — LOCATION (Arno, 21/10/2026) : LE MESSAGE D'ACCOMPAGNEMENT DU MAIL « NOUVELLE LOCATION ».
--
-- LE BESOIN (Arno) : dans la fenêtre « Envoi ADHOC & MONGA », un « Message d'accompagnement (facultatif) », sans limite de
-- caractères, repris dans le mail (« Message de <Prénom Nom> ») ET ENREGISTRÉ DANS LE JOURNAL D'ENVOI.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne `message` (texte, facultative) sur `gestion_location_mail_envoi`
-- (migration 395, journal en ajout seul). Aucune ligne n'est lue, modifiée ni supprimée ; le verrou « ajout seul » de la 395 est
-- inchangé (un ALTER TABLE ne le déclenche pas).
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription. Prérequis : 395.

ALTER TABLE gestion_location_mail_envoi ADD COLUMN IF NOT EXISTS message text;

COMMENT ON COLUMN gestion_location_mail_envoi.message IS 'Message d''accompagnement saisi avant l''envoi (texte brut, facultatif) — migration 398.';
