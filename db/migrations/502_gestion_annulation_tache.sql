-- 502_gestion_annulation_tache.sql — 🔴🔴 UNE TÂCHE ANNULÉE : LES MAILS D'ANNULATION (Arno, 19/11/2026, choix A).
--
-- LA DÉCISION (Arno, 19/11/2026) : « Une tâche annulée DISPARAÎT de tous les écrans […] Un mail d'annulation part à chaque contact qui avait
-- ACCEPTÉ ce rendez-vous (collaborateurs ; locataires ou tiers s'ils avaient été invités et avaient accepté) […] Mail interne : « [Copie interne] »
-- avec la règle « courrier automatique » si c'est pertinent. […] PAS d'effacement réel de la base. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   ① le journal des mails de la Location (`gestion_location_mail_avis`) accepte la sorte « rdv_annulation_locataires » (le mail d'annulation aux
--      locataires qui avaient confirmé une pré-visite ou un état des lieux) — la liste d'avant (495) reprise À L'IDENTIQUE, plus cette sorte ;
--   ② deux règles « gabarit d'objet », sens « envoyé » (messages DE gestion@), posées UNE fois (`WHERE NOT EXISTS` ; une règle déjà là, même
--      éteinte, reste telle quelle) : « [Copie interne] Rendez-vous annulé » et « [Copie interne] Tâche annulée » (objets de `mailAnnulationTache`,
--      annulationTache.ts, coupés au premier « — » comme le calcule `normaliserObjet`).
-- AUCUNE ligne effacée, aucune tâche touchée : l'annulation elle-même ne change que `etat` (comme avant) ; l'écran cesse de la montrer.
-- Sans la 502 : les tâches annulées disparaissent quand même des écrans, les collaborateurs sont prévenus ; seul le mail aux LOCATAIRES attend
-- (il est dit « non parti : migration 502 »).
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.

ALTER TABLE gestion_location_mail_avis DROP CONSTRAINT IF EXISTS gestion_location_mail_avis_sorte_check;
ALTER TABLE gestion_location_mail_avis ADD CONSTRAINT gestion_location_mail_avis_sorte_check
  CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc', 'sortie_locataires',
    'previsite_alerte', 'previsite_invitation', 'previsite_reponse', 'previsite_locataires', 'previsite_locataires_modif',
    'previsite_invitation_cr', 'previsite_compte_rendu', 'previsite_refus', 'previsite_annulation',
    'sortie_edls_locataire', 'sortie_edls_proprietaire', 'sortie_edls_interne',
    'digicode_locataire', 'digicode_proprietaire', 'digicode_gestion',
    'edls_locataires', 'edls_locataires_modif', 'rdv_confirmation_interne', 'rdv_refus_interne',
    'rdv_annulation_locataires'));

INSERT INTO gestion_regle_exclusion (type, valeur, sens, actif, motif)
SELECT v.type, v.valeur, v.sens, true, v.motif
  FROM (VALUES
    ('gabarit_objet', '[Copie interne] Rendez-vous annulé', 'envoye',
     'Mail interne : un rendez-vous (pré-visite, état des lieux, tâche) annulé — au collaborateur qui l’avait accepté.'),
    ('gabarit_objet', '[Copie interne] Tâche annulée', 'envoye',
     'Mail interne : une tâche annulée — au collaborateur qui l’avait acceptée.')
  ) AS v (type, valeur, sens, motif)
 WHERE NOT EXISTS (SELECT 1 FROM gestion_regle_exclusion r
                    WHERE r.type = v.type AND lower(r.valeur) = lower(v.valeur) AND r.sens = v.sens);
