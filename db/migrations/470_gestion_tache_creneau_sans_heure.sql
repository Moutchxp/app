-- 470_gestion_tache_creneau_sans_heure.sql — GESTION (Arno, 11/11/2026) : LA PLACE D'UNE TÂCHE SANS HEURE DANS L'AGENDA.
--
-- LE BESOIN (Arno) : une tâche SANS heure reste « sans heure » dans l'application ; dans l'agenda (Google et invitation .ics), chacune a SON
-- créneau de 30 minutes, empilées en remontant, jamais après 9h30 : la 1re tâche sans heure du jour pour ce collaborateur 9h00–9h30, la 2e
-- 8h30–9h00, la 3e 8h00–8h30… L'ordre suit la date de création ; une tâche supprimée, annulée ou déplacée ne fait PAS bouger les autres
-- (aucune réorganisation en cascade) ; passée à un autre jour, elle prend le premier créneau libre de ce jour.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : `gestion_tache.creneau_sans_heure` (heure de début du créneau, NULL = pas de créneau : tâche avec heure,
-- rendez-vous, ou tâche d'avant cette migration — elle garde alors son affichage d'avant, sur la journée, jusqu'à sa prochaine modification).
-- Aucune ligne n'est réécrite ici.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose gestion_tache.

ALTER TABLE gestion_tache ADD COLUMN IF NOT EXISTS creneau_sans_heure time;
CREATE INDEX IF NOT EXISTS gestion_tache_creneau_jour ON gestion_tache (confiee_a, jour) WHERE heure IS NULL AND creneau_sans_heure IS NOT NULL;

COMMENT ON COLUMN gestion_tache.creneau_sans_heure IS
  'Début du créneau de 30 min d’une tâche SANS heure dans l’agenda (9h00, puis 8h30, 8h00… par collaborateur et par jour ; jamais réorganisé) — migration 470.';
