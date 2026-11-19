-- 500_gestion_regle_courrier_rdv_modifie.sql — 🔴🔴 LE MAIL INTERNE « RENDEZ-VOUS MODIFIÉ » EN « COURRIER AUTOMATIQUE » (Arno, 19/11/2026).
--
-- LA DÉCISION (Arno, 19/11/2026, règle D) : « si c'est QUELQU'UN D'AUTRE qui modifie, le collaborateur initial reçoit un mail qui l'informe de la
-- modification : ancien et nouveau créneau, ancien et nouveau collaborateur, auteur de la modification » ; « mail interne « [Copie interne] » et
-- règles « courrier automatique » quand c'est pertinent ».
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une règle « gabarit d'objet », sens « envoyé » seulement (messages DE gestion@criterimmo.fr), posée UNE fois
-- (`WHERE NOT EXISTS`, rejouable ; une règle déjà là, même éteinte, reste telle quelle). Le gabarit est celui que calcule `normaliserObjet` (coupé au
-- premier « — ») de l'objet du code (`mailModificationRdv`, modificationRdv.ts). Une réponse d'un collègue est REÇUE : jamais rangée.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.

INSERT INTO gestion_regle_exclusion (type, valeur, sens, actif, motif)
SELECT v.type, v.valeur, v.sens, true, v.motif
  FROM (VALUES
    ('gabarit_objet', '[Copie interne] Rendez-vous modifié', 'envoye',
     'Mail interne : un rendez-vous (pré-visite, état des lieux, tâche) retiré à un collaborateur par quelqu’un d’autre — ancien et nouveau créneau, ancien et nouveau collaborateur.')
  ) AS v (type, valeur, sens, motif)
 WHERE NOT EXISTS (SELECT 1 FROM gestion_regle_exclusion r
                    WHERE r.type = v.type AND lower(r.valeur) = lower(v.valeur) AND r.sens = v.sens);
