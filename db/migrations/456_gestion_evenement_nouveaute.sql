-- 456_gestion_evenement_nouveaute.sql — GESTION, LOT NEW-EVENEMENT-PROPRE (Arno, 04/11/2026) : LE « NEW » D'UN ÉVÉNEMENT, ÉTAT PROPRE.
--
-- LE SIGNALEMENT (production) : « les mails contenant un événement, lorsque tu les ouvres, repassent en non lu ; c'est pour cela que la
-- mention NEW apparaît à chaque fois ». Le « New » se DÉDUISAIT du non-lu Gmail ; or un échange de chez nous peut couvrir plusieurs
-- conversations Gmail, et l'ouvrir n'en marquait lue qu'une : le mail resté non lu dans une autre gardait l'événement « New ».
--
-- LA RÈGLE D'ARNO : le « New » s'allume quand un mail REÇU rattaché à l'événement arrive ; il s'éteint quand on DÉPLIE la carte, ou quand
-- on OUVRE le mail qui l'a allumé (dans l'application, ou dans Gmail : la lecture de l'écran le constate) ; il ne revient qu'avec un
-- NOUVEAU mail reçu. Nos envois n'allument rien.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : `gestion_evenement_nouveaute` — UNE ligne par événement (commune à l'équipe, comme le lu / non lu de
-- Gmail) : `vu_jusqu_au` = l'identifiant du dernier mail reçu tenu pour VU. L'événement est « New » s'il porte un mail reçu d'identifiant
-- PLUS GRAND (l'identifiant suit l'ordre d'arrivée chez nous : aucune horloge d'expéditeur n'entre en jeu).
--
-- L'ÉTAT INITIAL N'EST PAS ÉCRIT ICI, ET RIEN N'EST ÉCRIT DANS GMAIL : la table naît VIDE. Un événement sans ligne garde la règle d'avant
-- (« New » tant qu'un de ses mails reçus est non lu dans Gmail) ; la première lecture de l'écran qui LIT Gmail pose la ligne des
-- événements dont tous les mails reçus sont lus, et chaque geste (carte dépliée, mail ouvert) pose la sienne. Aucun mail n'est modifié.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose la table gestion_evenement.

CREATE TABLE IF NOT EXISTS gestion_evenement_nouveaute (
  evenement_id    bigint      PRIMARY KEY REFERENCES gestion_evenement(id),
  vu_jusqu_au     bigint      NOT NULL CHECK (vu_jusqu_au >= 0),
  vu_le           timestamptz NOT NULL DEFAULT now(),
  vu_par_libelle  text        NOT NULL,
  motif           text        NOT NULL CONSTRAINT gestion_evenement_nouveaute_motif_chk CHECK (motif IN ('carte', 'mail', 'gmail'))
);

COMMENT ON TABLE gestion_evenement_nouveaute IS
  'LOT NEW-EVENEMENT-PROPRE (456) — le « New » d''un événement : vu_jusqu_au = id du dernier mail reçu rattaché tenu pour vu (carte dépliée, mail ouvert dans l''application, ou constaté lu dans Gmail). « New » = un mail reçu rattaché d''id plus grand. Sans ligne : la règle d''avant (non-lu Gmail).';
COMMENT ON COLUMN gestion_evenement_nouveaute.motif IS
  'carte : carte dépliée ; mail : mail ouvert dans l''application ; gmail : mails constatés lus dans Gmail à la lecture de l''écran.';
