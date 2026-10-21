-- 402_location_honoraires_saisis.sql — LOCATION (Arno, 21/10/2026) : HONORAIRES PROPRIÉTAIRE SAISISSABLES.
--
-- LA RÈGLE (Arno) : à l'écran « Nouveau locataire », le montant des honoraires propriétaire (€ TTC) est TOUJOURS saisissable.
-- Pré-rempli par le calcul (surface Carrez/Boutin × barème en vigueur à la date d'entrée) quand la surface est connue, il reste
-- librement modifiable. Un montant MODIFIÉ À LA MAIN est enregistré tel quel dans `hono_total_proprietaire`, SANS version de
-- barème ni surface, marqué « saisi à la main », et n'est JAMAIS recalculé ensuite (le recalcul de la fiche exige une
-- confirmation explicite).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne `hono_saisi_main` (booléen, faux par défaut) sur
-- `gestion_location_conditions_entree`. Les lignes existantes prennent « faux » : ce sont des calculs, et elles le restent.
-- AUCUN montant existant n'est modifié ; rien n'est supprimé.
--
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS hono_saisi_main boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gestion_location_conditions_entree.hono_saisi_main IS 'Vrai : hono_total_proprietaire a été saisi à la main (€ TTC), sans barème ni surface, jamais recalculé (migration 402).';
