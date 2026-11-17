-- 484_gestion_digicode_mail_gestion.sql — LE MAIL À LA GESTION D'UN CHANGEMENT DE DIGICODE (Arno, 17/11/2026).
--
-- LE BESOIN (demande d'Arno du 17/11/2026) : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » : un mail interne à
-- gestion@criterimmo.fr (adresse prise dans les préférences existantes, rien en dur) avec le changement, la date et la liste des logements concernés
-- […] B. « Écrire maintenant aux locataires » […] Ensuite, un mail à la Gestion l'informe que les locataires listés ont été prévenus. Chaque mail
-- reste rangé dans l'historique du bien et de la personne. » Le journal des mails (`gestion_location_mail_avis`, 457/479) n'admet que ses sortes :
-- le mail à la Gestion doit y entrer pour rester dans l'historique de chaque logement concerné.
--
-- CE QU'ELLE FAIT : la contrainte des sortes (479) admet une valeur de plus, 'digicode_gestion' ; toutes les valeurs d'avant restent permises.
-- AJOUT SEUL : aucune ligne touchée, rien supprimé ni renommé (la contrainte est remplacée par la même, élargie). Pas de BEGIN/COMMIT : l'appel
-- l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT. Suppose 479.
--
-- ⚠️ Sans elle, le changement de digicode refuse de s'enregistrer avec ses mails (rien n'est enregistré ni envoyé), comme sans la 479.

ALTER TABLE gestion_location_mail_avis DROP CONSTRAINT IF EXISTS gestion_location_mail_avis_sorte_check;
ALTER TABLE gestion_location_mail_avis ADD CONSTRAINT gestion_location_mail_avis_sorte_check
  CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc', 'sortie_locataires',
    'previsite_alerte', 'previsite_invitation', 'previsite_reponse', 'previsite_locataires', 'previsite_locataires_modif',
    'previsite_invitation_cr', 'previsite_compte_rendu', 'previsite_refus', 'previsite_annulation',
    'sortie_edls_locataire', 'sortie_edls_proprietaire', 'sortie_edls_interne',
    'digicode_locataire', 'digicode_proprietaire', 'digicode_gestion'));
