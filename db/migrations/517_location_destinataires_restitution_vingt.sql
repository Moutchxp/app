-- 517_location_destinataires_restitution_vingt.sql — 🔴 PARAMÈTRES LOCATION › DESTINATAIRES MAILS : LA LISTE « RESTITUTION DES 20 % » (Arno, 25/11/2026, 22h06).
--
-- LE BESOIN (demande d'Arno du 25/11/2026) : « après le bouton Sorties ajouter le bouton Restitution des 20 %, dans lequel on pourra, comme dans les 3
-- précédents, ajouter les partenaires à qui nous sommes susceptibles de faire suivre l'information de la restitution des 20 %. »
--
-- CE QU'ELLE FAIT : la liste des sortes admises par gestion_location_mail_destinataires (versions de listes, en ajout seul — 395, 460) reçoit une
-- quatrième valeur, « restitution_vingt ». Rien d'autre : AUCUNE adresse n'est posée (la liste naît vide : aucun partenaire proposé tant qu'Arno n'en
-- ajoute pas), aucune donnée existante touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE : rejouable.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, l'onglet s'affiche vide et son enregistrement est refusé avec son motif (mise à jour de la base).

ALTER TABLE gestion_location_mail_destinataires DROP CONSTRAINT IF EXISTS gestion_location_mail_destinataires_sorte_check;
ALTER TABLE gestion_location_mail_destinataires ADD CONSTRAINT gestion_location_mail_destinataires_sorte_check
  CHECK (sorte = ANY (ARRAY['nouvelle_location'::text, 'preavis'::text, 'sortie'::text, 'restitution_vingt'::text]));
