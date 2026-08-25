-- PROJ-3i — SÉLECTION des polygones BD TOPO « en projet » du schéma de projection.
-- Décision d'Arno (AFFICHAGE + décision, RIEN d'autre) : écarter des polygones « en projet » qui ne font pas partie du projet
-- (erreur possible dans le dossier IGN). Par DÉFAUT tout est RETENU ; une ligne ici = un polygone ÉCARTÉ (décoché), tracé (qui/quand).
--
-- 🔴 GARDE PROJ INVIOLABLE : purement de l'affichage/décision. N'alimente NI le verdict, NI l'altitude, NI un certificat, NI un
-- rattachement ; aucune écriture dans batiment / permis_polygone_altitude / permis_corps*. Le polygone reste une DONNÉE IGN.
--
-- Identité du polygone : cleabs BD TOPO (stable). Scopé au dossier (le même bâti peut concerner plusieurs permis).

CREATE TABLE IF NOT EXISTS permis_polygone_projet_ecarte (
  dossier_id  bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  cleabs      text        NOT NULL,
  ecarte_par  text,
  ecarte_le   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dossier_id, cleabs)
);

CREATE INDEX IF NOT EXISTS idx_polygone_projet_ecarte_dossier ON permis_polygone_projet_ecarte (dossier_id);
