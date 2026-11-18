-- 496_gestion_regles_courrier_rdv.sql — 🔴🔴 LES MAILS INTERNES « RENDEZ-VOUS CONFIRMÉ / REFUSÉ » EN « COURRIER AUTOMATIQUE » (Arno, 18/11/2026).
--
-- LA DÉCISION (Arno, 18/11/2026) : « MAIL DE CONFIRMATION INTERNE, quand le rendez-vous devient confirmé (par un locataire ou à la main) : au
-- créateur de l'invitation et à la liste « Collaborateurs prévenus » […]. Son objet commence par « [Copie interne] ». Ajoute la règle « courrier
-- automatique » correspondante si besoin, sur le modèle de la 494. » Le mail « refusé par tous les locataires » suit la même règle.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : quatre règles « gabarit d'objet », sens « envoyé » seulement (messages DE gestion@criterimmo.fr), chacune posée
-- UNE fois (`WHERE NOT EXISTS`, rejouable ; une règle déjà là, même éteinte, reste telle quelle). Les gabarits sont ceux que calcule
-- `normaliserObjet` (coupé au premier « — ») des objets du code (`objetInterneRdv`, reponsesRdv.ts) ; ils n'appartiennent qu'à ces mails
-- internes (épreuve reponsesRdv.test.ts). Une réponse d'un collègue est REÇUE : jamais rangée. Aucune ligne existante touchée.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.

INSERT INTO gestion_regle_exclusion (type, valeur, sens, actif, motif)
SELECT v.type, v.valeur, v.sens, true, v.motif
  FROM (VALUES
    ('gabarit_objet', '[Copie interne] Pré-visite confirmée', 'envoye',
     'Mail interne de la Location : rendez-vous de pré-visite confirmé (par un locataire ou à la main).'),
    ('gabarit_objet', '[Copie interne] Pré-visite refusée par les locataires', 'envoye',
     'Mail interne de la Location : rendez-vous de pré-visite refusé par tous les locataires invités.'),
    ('gabarit_objet', '[Copie interne] État des lieux de sortie confirmé', 'envoye',
     'Mail interne de la Location : rendez-vous d’état des lieux de sortie confirmé (par un locataire ou à la main).'),
    ('gabarit_objet', '[Copie interne] État des lieux de sortie refusé par les locataires', 'envoye',
     'Mail interne de la Location : rendez-vous d’état des lieux de sortie refusé par tous les locataires invités.')
  ) AS v (type, valeur, sens, motif)
 WHERE NOT EXISTS (SELECT 1 FROM gestion_regle_exclusion r
                    WHERE r.type = v.type AND lower(r.valeur) = lower(v.valeur) AND r.sens = v.sens);
