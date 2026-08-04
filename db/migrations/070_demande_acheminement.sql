-- 070_demande_acheminement.sql — Module VEILLE PERMIS (chantier S37) : SCHÉMA D'ACHEMINEMENT des demandes CRPA + CAPS
-- D'ENVOI. ⚠️ AUCUN CODE D'ENVOI, AUCUN OCTET NE PART : ce chantier ne fait que préparer le terrain (table de preuve +
-- garde-fous de volume). L'envoi réel est le chantier suivant.
--
-- POURQUOI : aujourd'hui la chaîne s'arrête à 'prete' (canal e-mail) ; rien ne borne une salve. La recon S36 a montré qu'un
-- futur « envoyer toutes les prêtes » tirerait ~335 e-mails d'un coup. On grave donc les CAPS **avant** tout code d'envoi
-- (c'est le point le plus important du chantier), et on crée la table qui portera la PREUVE D'ÉMISSION d'une demande.
--
-- SÛR : DDL ADDITIVE uniquement (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS). Aucun
-- DROP, aucun ALTER destructeur. FK NULLABLE-safe vers demande(id) (stable). GOLDEN-SAFE (aucun contact
-- moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotent. Un seul BEGIN/COMMIT. AUCUN ENVOI.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/070_demande_acheminement.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) demande_acheminement — suivi MUTABLE de l'ÉMISSION d'une demande, calqué sur certificat_acheminement (031:152).
--    UN enregistrement PAR ÉMISSION (table NON unique par demande) : c'est ce qui permettra l'OPPOSABILITÉ ÉTAGÉE — une
--    première émission par e-mail, puis, pour les communes SILENCIEUSES, une seconde par recommandé — chacune avec sa
--    propre preuve. Le statut de la DEMANDE (brouillon/prete/envoyee/…) vit ailleurs (table `demande`) ; ici c'est l'état
--    de l'acheminement (émise / rebond / échec).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demande_acheminement (
  id                 bigserial   PRIMARY KEY,
  demande_id         bigint      NOT NULL REFERENCES demande(id),
  canal              text        NOT NULL DEFAULT 'email'
                       CONSTRAINT demande_acheminement_canal_chk CHECK (canal IN ('email','recommande')),
  statut             text        NOT NULL DEFAULT 'en_attente'
                       CONSTRAINT demande_acheminement_statut_chk CHECK (statut IN ('en_attente','envoye','rebond','echec')),
  envoye_le          timestamptz,                 -- ⚠️ horodatage d'ÉMISSION (voir COMMENT) — JAMAIS la réception
  message_id         text,                        -- Message-ID SMTP retourné par le serveur (traçabilité de l'émission)
  retour_fournisseur text,                        -- réponse d'acceptation du serveur SMTP (ex. « 250 2.0.0 OK … »)
  rebond_le          timestamptz,                 -- horodatage d'un rebond détecté (adresse invalide, boîte pleine…)
  rebond_motif       text,                        -- motif du rebond, tel que rapporté (diagnostic, réémission)
  derniere_erreur    text,                        -- NOM de la dernière erreur d'acheminement (jamais le message brut)
  cree_a             timestamptz NOT NULL DEFAULT now(),
  maj_a              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE demande_acheminement IS
  'Suivi MUTABLE de l''ÉMISSION d''une demande de communication (un enregistrement par émission — e-mail puis, pour les silencieuses, recommandé). Calqué sur certificat_acheminement. Aucune immuabilité : cet état bouge. NE PORTE AUCUNE PREUVE DE RÉCEPTION.';
COMMENT ON COLUMN demande_acheminement.envoye_le IS
  '⚠️ PROUVE L''ÉMISSION (remise au serveur SMTP), JAMAIS LA RÉCEPTION par la mairie. Le délai CADA d''un mois court à compter de la RÉCEPTION : ne JAMAIS utiliser envoye_le comme point de départ du délai. La réception ne se prouve que par un recommandé AR (canal=''recommande'') ou un accusé de dépôt de téléservice — pas par un e-mail simple.';
COMMENT ON COLUMN demande_acheminement.canal IS 'Voie d''émission de CET enregistrement : email (défaut) | recommande. Une même demande peut cumuler plusieurs enregistrements (opposabilité étagée).';
COMMENT ON COLUMN demande_acheminement.statut IS 'État de l''acheminement : en_attente | envoye (remis au SMTP) | rebond (retour négatif) | echec (émission impossible). ≠ demande.statut.';
COMMENT ON COLUMN demande_acheminement.message_id IS 'Message-ID SMTP de l''e-mail émis (aujourd''hui NON capturé pour le certificat — ici on le conservera pour la traçabilité de l''émission).';
COMMENT ON COLUMN demande_acheminement.derniere_erreur IS 'NOM de la dernière erreur (jamais le message brut, pour ne pas fuiter d''information), motif certificat_acheminement.';

CREATE INDEX IF NOT EXISTS demande_acheminement_demande_idx ON demande_acheminement (demande_id);
CREATE INDEX IF NOT EXISTS demande_acheminement_statut_idx  ON demande_acheminement (statut);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) CAPS D'ENVOI (config_veille, éditables sans code) — LE REMPART contre un envoi accidentel en masse.
--    Motif inline CHECK (comme dossiers_par_demande, 053:32) → bornes lues EN DIRECT par parserBornesCheck.
--    DÉFAUTS VOLONTAIREMENT PRUDENTS (à relever par Arno une fois la confiance acquise) :
--      • envois_max_par_run = 10 : une SEULE action d'envoi expédie au plus 10 e-mails. C'est le rempart IMMÉDIAT — un
--        « envoyer toutes les prêtes » (ou un bug qui boucle) ne tire plus ~335 courriels d'un coup, mais 10 au maximum.
--      • envois_max_par_jour = 25 : plafond CUMULÉ quotidien (plusieurs runs additionnés). À 25/jour, une campagne de
--        335 communes s'étale sur ~14 jours : envoi délibéré, observable, très en-deçà du plafond Google Workspace
--        (~500/jour) → pas de risque « envoi de masse classé spam », et un accident reste borné à 25.
--    Ces deux caps sont INDÉPENDANTS ; le code d'envoi (chantier suivant) prendra min(reste du jour, cap par run).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS envois_max_par_run  integer NOT NULL DEFAULT 10 CHECK (envois_max_par_run  BETWEEN 1 AND 200);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS envois_max_par_jour integer NOT NULL DEFAULT 25 CHECK (envois_max_par_jour BETWEEN 1 AND 500);

COMMENT ON COLUMN config_veille.envois_max_par_run  IS 'CAP D''ENVOI : nb maximum d''e-mails aux mairies expédiés par UNE action d''envoi. Rempart immédiat contre une salve accidentelle. Défaut prudent 10.';
COMMENT ON COLUMN config_veille.envois_max_par_jour IS 'CAP D''ENVOI : nb maximum d''e-mails aux mairies expédiés par JOUR (runs cumulés). Défaut prudent 25 (~14 jours pour 335 communes ; loin du plafond Google Workspace).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_acheminement
--   SELECT envois_max_par_run, envois_max_par_jour FROM config_veille WHERE id = 1;
--
--   -- (a) colonnes de preuve présentes :
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'demande_acheminement'
--    AND column_name IN ('envoye_le','message_id','retour_fournisseur','rebond_le','rebond_motif','derniere_erreur');
--
--   -- (b) CHECK des caps en place (bornes) :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%envois_max%';
--
--   -- (c) contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET envois_max_par_run = 0 WHERE id = 1; ROLLBACK;   -- viole le CHECK (min 1)
--   -- BEGIN; INSERT INTO demande_acheminement (demande_id, statut) VALUES (-1, 'xxx'); ROLLBACK; -- viole statut_chk (et FK)
