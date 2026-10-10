-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 329 — LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES : « TOUS LES IMMEUBLES » N'EST PLUS UN SUIVI AUTOMATIQUE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « une copropriété nouvellement rattachée à un syndic a une liste de contacts VIDE. On pioche ensuite dans le
-- catalogue ou on crée de nouveaux contacts. » Bug constaté : un contact « Tous les immeubles » apparaissait aussitôt
-- dans toute copropriété nouvellement rattachée.
--
-- CONVERSION CIBLÉE (accord d'Arno pour cette écriture) : pour chaque contact VIVANT encore marqué
-- `tous_immeubles`, des affectations EXPLICITES sont créées vers les copropriétés de son syndic EN COURS au moment de
-- la migration (auteur « migration ») ; puis le marqueur passe à faux (maj par « migration »). Aucune autre donnée
-- n'est touchée ; la colonne reste en place ; rien n'est effacé.
--
-- LA VALEUR PAR DÉFAUT DE LA COLONNE passe à FAUX (elle était VRAI depuis la 326) : un contact inséré sans dire le
-- contraire ne suit rien — jamais de « tous » par oubli.
--
-- IDEMPOTENTE : une affectation déjà en cours n'est pas recréée, et un contact déjà converti n'a plus le marqueur —
-- la relancer ne fait rien.
--
-- Recensement en lecture seule avant application (10/10/2026) : un seul contact concerné — Augustin JOREL (contact 3)
-- du syndic « TEST ARNAUD / Asnieres Sur Seine » (id 2), alors rattaché à 3 copropriétés.
-- Application réelle (10/10/2026, soir) : INSERT 0, UPDATE 0. Entre-temps, à 22:35:16, un enregistrement de la fiche
-- par Arno (ajout de « 15 rue Carle Hebert ») sous le NOUVEAU code avait déjà converti Augustin : affectations
-- explicites aux 3 copropriétés d'alors (auteur a.jorel@…), marqueur à faux — et PAS à la 4e, conformément à la règle.
-- Seul effet réel de la 329 : la valeur par défaut de la colonne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

INSERT INTO gestion_syndic_contact_copropriete (contact_id, copropriete_id, affecte_par_libelle)
SELECT ct.id, cs.copropriete_id, 'migration'
  FROM gestion_syndic_contact ct
  JOIN gestion_syndic s ON s.id = ct.syndic_id AND s.supprime_le IS NULL
  JOIN gestion_copropriete_syndic cs ON cs.syndic_id = ct.syndic_id AND cs.fin IS NULL
 WHERE ct.tous_immeubles AND ct.retire_le IS NULL
   AND NOT EXISTS (SELECT 1 FROM gestion_syndic_contact_copropriete a
                    WHERE a.contact_id = ct.id AND a.copropriete_id = cs.copropriete_id AND a.retire_le IS NULL);

UPDATE gestion_syndic_contact
   SET tous_immeubles = false, maj_le = now(), maj_par_libelle = 'migration'
 WHERE tous_immeubles;

ALTER TABLE gestion_syndic_contact ALTER COLUMN tous_immeubles SET DEFAULT false;
