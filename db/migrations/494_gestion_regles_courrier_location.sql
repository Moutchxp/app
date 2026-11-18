-- 494_gestion_regles_courrier_location.sql — 🔴🔴 LES MAILS INTERNES DE LA LOCATION EN « COURRIER AUTOMATIQUE » (Arno, 18/11/2026).
--
-- LA DÉCISION (Arno, 18/11/2026) : « Prépare les règles d'exclusion pour ranger ces cinq mails en « Courrier automatique » dans la
-- boîte Gestion. Elles ne s'appliquent qu'aux messages ENVOYÉS par gestion@criterimmo.fr et reconnus par leur gabarit d'objet. »
-- Garde-fous : une réponse humaine (locataire, propriétaire, collègue) reste dans la Réception ; le mail envoyé au client n'est pas
-- caché, seule la copie interne est rangée.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : quatre règles « gabarit d'objet », sens « envoyé » seulement, chacune posée UNE fois (l'index
-- unique (type, lower(valeur), sens) de la 228 ; `WHERE NOT EXISTS` la rend rejouable). Les gabarits sont ceux que calcule
-- `normaliserObjet` (objet sans « RE: », coupé au premier « — ») ; chacun n'appartient qu'à une copie interne (mesuré sur tous
-- les objets de la Location, épreuve reglesCourrierLocation.test.ts) :
--   · « Alerte préavis »                                         — les deux alertes « aucune pré-visite fixée » ;
--   · « [Copie interne] Pré-visite d’état des lieux de sortie »  — la copie interne du refus / absence de pré-visite ;
--   · « [Copie interne] Compte rendu de pré-visite d’état des lieux de sortie… » — la copie interne du compte rendu de pré-visite
--     (préfixée depuis le 18/11/2026, option 1 d'Arno ; le gabarit est coupé à 70 caractères avant la date, d'où les « … ») ;
--   · « Sortie de locataire »                                    — « Sortie enregistrée » et le mail interne du parcours préavis / sortie.
-- Les mails aux locataires et aux propriétaires (refus, compte rendu) n'ont pas le préfixe : ils restent visibles.
-- Une règle ne supprime rien : le message est enregistré, tenu hors de la file, et revient par « Afficher aussi le courrier
-- automatique ». Une règle ne s'applique qu'aux messages relevés APRÈS elle. Aucune ligne existante touchée.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.

INSERT INTO gestion_regle_exclusion (type, valeur, sens, actif, motif)
SELECT v.type, v.valeur, v.sens, true, v.motif
  FROM (VALUES
    ('gabarit_objet', 'Alerte préavis', 'envoye',
     'Alerte interne de la Location « aucune pré-visite fixée » (individuelle ou récapitulative), envoyée aux collaborateurs prévenus.'),
    ('gabarit_objet', '[Copie interne] Pré-visite d’état des lieux de sortie', 'envoye',
     'Copie interne du mail « Refus / absence de pré-visite » de la Location (le mail aux locataires, lui, reste visible).'),
    ('gabarit_objet', '[Copie interne] Compte rendu de pré-visite d’état des lieux de sortie…', 'envoye',
     'Copie interne du compte rendu de pré-visite de la Location (les mails aux locataires et aux propriétaires, eux, restent visibles).'),
    ('gabarit_objet', 'Sortie de locataire', 'envoye',
     'Mail interne de la Location « Sortie de locataire » (sortie enregistrée, parcours préavis / sortie), envoyé aux collaborateurs prévenus.')
  ) AS v (type, valeur, sens, motif)
 WHERE NOT EXISTS (SELECT 1 FROM gestion_regle_exclusion r
                    WHERE r.type = v.type AND lower(r.valeur) = lower(v.valeur) AND r.sens = v.sens);
