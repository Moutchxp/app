-- 359_mention_sources_reveil.sql — réveille la migration 148, jamais appliquée (décision d'Arno du 15/10/2026).
-- svav:remplace 148_mention_sources_graphiques.sql
--
-- POURQUOI : 148 (tiret « fichiers sources DWG/DXF » des demandes CRPA) n'a jamais été appliquée, ni sur le Mac ni sur
-- le serveur ; elle a été inscrite « ecartee » à l'amorçage du registre svav_migration. Faute de ses deux colonnes, la
-- lecture des mentions de la veille échouait EN BLOC (veilleConfig.ts, lireMentions) : les deux mentions réglées par
-- Arno (« service de l'urbanisme » et « délai d'un mois », migration 072) étaient OMISES des demandes par e-mail, et le
-- tiret DWG était AJOUTÉ d'office, sans réglage possible (docs/BASCULE_CHECKLIST.md §8).
--
-- CE QUE FAIT CETTE MIGRATION : les deux colonnes de 148, à l'identique SAUF le défaut d'activation : FALSE (148 disait
-- TRUE). Le tiret DWG est donc DÉSACTIVÉ tant qu'Arno ne l'active pas dans Réglages ; le texte est celui de 148, mot pour
-- mot (= MENTION_SOURCES_TEXTE_DEFAUT, verrouillé par mentionsCourrierSchema.test.ts). Effet dans les demandes par e-mail,
-- dès qu'elle est passée : les deux mentions d'Arno reviennent, le tiret DWG n'apparaît plus. Canal formulaire, relances,
-- cascade partielle et saisines CADA : inchangés (ils ne portent ni mentions ni tiret).
--
-- L'HISTORIQUE N'EST PAS RÉÉCRIT : 148 reste « ecartee » au registre ; l'en-tête « svav:remplace » ci-dessus fait taire son
-- rappel une fois celle-ci appliquée. Jamais rejouer 148 elle-même (son défaut TRUE activerait le tiret).
--
-- SÛR : DDL additive (ADD COLUMN IF NOT EXISTS), idempotente, aucune donnée existante touchée, aucun envoi. Pas de
-- BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son inscription au registre.

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_sources_active boolean NOT NULL DEFAULT false;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_sources_texte  text    NOT NULL DEFAULT '— si le dossier en comporte, les fichiers sources des pièces graphiques (DWG, DXF) ; leur communication nous serait précieuse, mais leur absence ne doit en rien retarder l’envoi des pièces ci-dessus.';

COMMENT ON COLUMN config_veille.mention_sources_active IS 'S-DWG (148, réveillée par 359 le 15/10/2026) — active le 3e tiret « fichiers sources des pièces graphiques » dans la liste des pièces des DEMANDES par e-mail. Défaut FALSE : désactivé tant qu''Arno ne l''active pas dans Réglages.';
COMMENT ON COLUMN config_veille.mention_sources_texte  IS 'S-DWG — texte ÉDITABLE du 3e tiret « fichiers sources ». Formulation qui N''OBLIGE À RIEN (les sources ne sont pas une pièce Cerfa). Vide = rien ajouté même si actif.';
