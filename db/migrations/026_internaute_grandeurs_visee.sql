-- 026_internaute_grandeurs_visee.sql — Module INTERNAUTE (base nominative), LOT 2 (complément) :
--   PERSISTANCE DE 3 GRANDEURS DE VISÉE au dossier projet (bloc C, `internaute_projet`).
--
-- MOTIF : le dossier internaute doit conserver, à visée de PREUVE (litige), les grandeurs géométriques de la
--   visée qui étaient jusqu'ici calculées puis PERDUES à l'ingestion (envoyées au moteur `/api/analyse`, jamais
--   au stockage nominatif). Trois colonnes STABLES nullable (comme lat/lon/etage déjà promus) :
--     • azimut_deg            : ENTRÉE validée par l'internaute (axe de visée, degrés boussole). Valeur brute.
--     • hauteur_sous_plafond_m: INTRANT choisi par l'internaute (stepper, défaut 2,50, bornes config). Valeur brute.
--     • hauteur_vision_m      : SNAPSHOT DÉRIVÉ = hauteurVision(etage, sous_plafond) figé au moment T. Le serveur
--                               revérifie ce snapshot contre la formule moteur (garde-fou ingestion.ts) : la
--                               formule fait foi si etage + sous_plafond sont présents. Aucun arrondi.
--
-- PORTÉE : ALTER TABLE additif idempotent sur `internaute_projet` UNIQUEMENT. Aucune autre table touchée, aucune
--   donnée existante modifiée (dossiers antérieurs : NULL → « — » à l'affichage). Le moteur n'est ni rappelé ni
--   modifié (golden hors sujet) ; zéro pont M2. À appliquer à la main après validation du diff.

BEGIN;

ALTER TABLE internaute_projet ADD COLUMN IF NOT EXISTS azimut_deg             numeric;
ALTER TABLE internaute_projet ADD COLUMN IF NOT EXISTS hauteur_sous_plafond_m numeric;
ALTER TABLE internaute_projet ADD COLUMN IF NOT EXISTS hauteur_vision_m       numeric;

COMMENT ON COLUMN internaute_projet.azimut_deg IS
  'Azimut de l''axe de visée validé par l''internaute (degrés boussole 0-360). Entrée capturée en lecture seule ; snapshot preuve, aucun arrondi.';
COMMENT ON COLUMN internaute_projet.hauteur_sous_plafond_m IS
  'Hauteur sous plafond choisie par l''internaute (m ; défaut 2,50 ; bornes config [2,40 ; 4,50]). Intrant du calcul de la hauteur de vision ; snapshot preuve, aucun arrondi.';
COMMENT ON COLUMN internaute_projet.hauteur_vision_m IS
  'Hauteur de vision (m) = etage × (sous_plafond + 0,30 dalle) + 1,65 yeux, formule config.hauteurVision. Snapshot dérivé revérifié serveur (formule fait foi si intrants présents) ; preuve, aucun arrondi.';

COMMIT;
