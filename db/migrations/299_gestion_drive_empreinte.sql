-- ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — L'INDEX DES EMPREINTES DU DRIVE ════════════════════
--
-- RÈGLE D'ARNO (03/10/2026) : « un index en LECTURE SEULE : fileId, md5Checksum, nom, parents, drive, date de
-- modification. Alimenté : à chaque dossier ouvert ; par un balayage de fond des drives partagés et de “Mon
-- Drive” (files.list paginé, champs minimaux, aucune écriture Drive) ; puis par changes.list. »
--
-- ═══ 🔴🔴 POURQUOI UN INDEX, ET POURQUOI IL N'Y A PAS D'AUTRE VOIE ══════════════════════════════════════════════
--
-- Parce que GOOGLE NE SAIT PAS CHERCHER PAR EMPREINTE. Mesuré le 03/10/2026, pas supposé : `files.list` avec
-- `q=md5Checksum='4b782aa3…'` répond HTTP 400 « Invalid Value » sur le paramètre `q` — sur chacun des 10 drives
-- partagés visibles, et avec `corpora=allDrives`. Il n'existe AUCUNE requête « rends-moi les fichiers de cette
-- empreinte ». La seule façon de reconnaître un contenu est donc de connaître d'avance l'empreinte des fichiers :
-- c'est cette table, et rien d'autre ne peut la remplacer.
--
-- Le niveau 1 (migration 298) reconnaît ce que l'APPLICATION a rangé. Celui-ci reconnaît ce qu'elle n'a JAMAIS
-- touché — les fichiers posés à la main dans Google Drive, qui sont l'immense majorité : 181 001 fichiers et
-- 20 997 dossiers recensés, contre 26 552 copies au registre.
--
-- ═══ CE QUE CETTE TABLE EST, ET CE QU'ELLE N'EST PAS ════════════════════════════════════════════════════════════
--
-- 🔒 ELLE EST UN REFLET, JAMAIS UNE VÉRITÉ. Le Drive fait foi ; cette table dit « voici ce que j'ai vu, et
-- quand ». C'est pour cela que `releve_le` est OBLIGATOIRE : une empreinte sans date ne se relit pas — on ne
-- saurait dire si elle a six minutes ou six mois, et l'écran doit pouvoir le dire.
--
-- 🔒 ELLE NE DONNE AUCUN DROIT. On n'y écrit que des métadonnées déjà lisibles par le compte de la maison, et
-- aucune ligne d'ici ne permet d'écrire dans le Drive : l'indexation n'émet que des `files.list` et des
-- `changes.list`. 🔴🔴 « Documents clients scannés » Y ENTRE EN MÉTADONNÉES — un nom, un parent, une empreinte —
-- et c'est tout ce qu'il faut pour DIRE qu'un document y est déjà rangé, sans jamais en ouvrir le contenu ni y
-- toucher. Le garde d'écriture de `driveDeplacement` reste entier et n'est pas effleuré par ce lot.
--
-- ⚠️ `parent_id` AU SINGULIER, ET C'EST MESURÉ : sur les 181 001 fichiers recensés, aucun ne porte plusieurs
-- parents — Google a retiré les emplacements multiples en 2020. Garder un tableau pour un cas qui n'existe plus
-- obligerait chaque lecture à choisir lequel des parents tracer, c'est-à-dire à deviner.
--
-- ⚠️ LES DOSSIERS SONT INDEXÉS AUSSI (`est_dossier`), et pas par symétrie : tracer le chemin d'un fichier
-- demande de remonter ses parents, et les remonter un par un chez Google coûterait un appel par niveau. Avec les
-- dossiers dans la table, le chemin se reconstitue EN BASE.
--
-- 🔒 CETTE MIGRATION NE CRÉE QUE DEUX TABLES. Elle ne touche à rien d'existant, n'ajoute aucune contrainte sur
-- une table en service, et se défait de deux `DROP TABLE`.

CREATE TABLE IF NOT EXISTS gestion_drive_empreinte (
  -- L'identifiant Drive EST la clé : un fichier n'a qu'une ligne, et la revoir la met à jour.
  drive_file_id   text PRIMARY KEY,
  -- ⚠️ NULLABLE, et ce n'est pas un oubli : un document Google natif (Doc, Sheet, Slide) n'a PAS d'empreinte —
  --    Google n'en calcule pas. La ligne existe quand même, parce qu'elle sert à tracer les chemins.
  md5             text,
  nom             text NOT NULL,
  parent_id       text,
  -- NULL = « Mon Drive » du compte qui a relevé. Un drive partagé porte son identifiant.
  drive_id        text,
  est_dossier     boolean NOT NULL DEFAULT false,
  type_mime       text,
  taille_octets   bigint,
  -- La date de modification que Google annonce : c'est elle qui dit si notre reflet est périmé.
  modifie_le      timestamptz,
  -- 🔴 QUAND NOUS L'AVONS VU. Obligatoire : une empreinte sans date ne se relit pas.
  releve_le       timestamptz NOT NULL DEFAULT now(),
  -- Vu disparu (corbeille, suppression, droits retirés) : on ne l'efface pas, on le DATE.
  disparu_le      timestamptz
);

COMMENT ON TABLE gestion_drive_empreinte IS
  'LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE niveau 2 : reflet en LECTURE SEULE des empreintes du Drive, pour '
  'reconnaître une pièce dont le contenu est déjà rangé quand son nom a changé. Google ne sait pas chercher par '
  'md5Checksum (HTTP 400) : sans cet index, un fichier que l''application n''a jamais touché est introuvable. '
  'Aucune ligne d''ici ne donne le droit d''écrire dans le Drive.';

-- 🔴 L'INDEX QUI SERT LA QUESTION POSÉE : « quels fichiers portent cette empreinte ? ». Sur `lower(md5)`, parce
--    que c'est ainsi qu'on compare des deux côtés, et PARTIEL : un fichier sans empreinte ne s'y cherche jamais.
CREATE INDEX IF NOT EXISTS gestion_drive_empreinte_md5_idx
  ON gestion_drive_empreinte (lower(md5)) WHERE md5 IS NOT NULL AND disparu_le IS NULL;

-- Pour remonter un chemin en base, et pour reprendre un balayage drive par drive.
CREATE INDEX IF NOT EXISTS gestion_drive_empreinte_parent_idx ON gestion_drive_empreinte (parent_id);
CREATE INDEX IF NOT EXISTS gestion_drive_empreinte_drive_idx ON gestion_drive_empreinte (drive_id);

-- ══ OÙ EN EST L'INDEX, CORPUS PAR CORPUS ════════════════════════════════════════════════════════════════════════
--
-- 🔴 SANS CETTE TABLE, L'INDEX SERAIT AVEUGLE À SA PROPRE FRAÎCHEUR. `changes.list` exige un jeton de départ
-- (`startPageToken`) obtenu AVANT le balayage : le perdre obligerait à tout rebalayer, soit 209 pages et six
-- minutes. On le range donc, avec la date du dernier relevé.
CREATE TABLE IF NOT EXISTS gestion_drive_index_etat (
  -- 🔴 LA CLÉ EST LE CORPUS, et « Mon Drive » n'a pas d'identifiant de drive : on écrit 'moi' plutôt que NULL,
  --    parce qu'une clé primaire nullable n'existe pas et qu'un corpus sans clé ne se reprend pas.
  corpus          text PRIMARY KEY,
  nom             text,
  -- Le jeton de reprise de `changes.list`. NULL = jamais balayé, donc aucun incrément possible.
  page_token      text,
  balaye_le       timestamptz,
  increment_le    timestamptz,
  fichiers        bigint,
  dossiers        bigint,
  -- Ce que le dernier balayage a coûté : c'est avec ça qu'on chiffre le suivant plutôt que de l'estimer.
  pages           integer,
  duree_ms        bigint
);

COMMENT ON TABLE gestion_drive_index_etat IS
  'LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE niveau 2 : où en est l''index pour chaque corpus (drive partagé, ou '
  '« moi » pour Mon Drive). Garde le jeton de reprise de changes.list : sans lui, tout incrément redeviendrait un '
  'balayage complet.';
