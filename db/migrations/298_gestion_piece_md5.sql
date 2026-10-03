-- ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 1 — L'EMPREINTE QUI PARLE À GOOGLE ═════════════════════
--
-- CONSTAT D'ARNO (03/10/2026) : depuis gestion@, il envoie à son adresse perso une pièce prise dans notre Drive et
-- RENOMMÉE ; il se la renvoie vers gestion@ ; les pièces du mail revenu sont LES MÊMES FICHIERS, mais la loupe ne
-- trouve rien et aucune pastille verte n'apparaît.
--
-- RÈGLE D'ARNO : « une pièce dont le CONTENU est déjà dans le Drive doit être reconnue, quel que soit son nom. »
--
-- ═══ 🔴🔴 LE DIAGNOSTIC, EN TROIS CHIFFRES, ET IL EXPLIQUE TOUT ══════════════════════════════════════════════════
--
-- Les trois pièces de la chaîne (27122 « _MESURE … [octets] », 27124 notre envoi, 27125 le mail revenu) portent
-- le MÊME contenu à l'octet : md5 `4b782aa3d863fd2e7f2e849d523b0448`, sha256 `0d2f4019…dfcaec`, 133 157 octets.
-- Le contenu a traversé Gmail SANS AUCUNE MODIFICATION — aller-retour compris.
--
-- Et pourtant rien ne s'allume, pour DEUX raisons distinctes qui se cumulent :
--
--   ① LE LIEN N'EXISTE PAS. `gestion_piece_drive` ne connaît la pièce 27125 ni de près ni de loin (0 ligne) : une
--      pièce revenue par mail est une pièce NEUVE, qui n'a jamais été rangée. Or la loupe et la pastille partent
--      TOUTES DEUX du lien `piece_id` → `drive_file_id`. Sans lien, pas de départ, donc rien à montrer.
--
--   ② L'EMPREINTE MANQUE DES DEUX CÔTÉS. Il faudrait rattraper par le contenu, et c'est impossible aujourd'hui :
--        · côté PIÈCE, nous ne stockons que le sha256 — Google, lui, ne connaît QUE le md5. Deux empreintes qui
--          ne se comparent pas ;
--        · côté REGISTRE, la colonne `md5` existe, mais elle n'est remplie que pour les lignes `origine='copie'`
--          (26 522 sur 26 552, par la campagne automatique). Les 30 lignes `origine='manuel'` — c'est-à-dire
--          TOUT ce qu'un humain a rangé par la fenêtre « Ranger une pièce dans le Drive » — ont `md5` À NULL,
--          parce que `memoriserDepot` ne l'a jamais écrit. Les 5 copies du document d'Arno sont de celles-là.
--
-- ⚠️ ET GOOGLE NE SAIT PAS CHERCHER PAR EMPREINTE. Mesuré ce jour, pas supposé : `files.list` avec
-- `q=md5Checksum='…'` répond HTTP 400 « Invalid Value » sur le paramètre `q`, sur chacun des 10 drives partagés et
-- avec `corpora=allDrives`. Il n'existe donc AUCUNE requête « rends-moi les fichiers de cette empreinte » : ce que
-- l'on veut reconnaître, il faut l'avoir rangé chez nous d'abord. C'est la raison d'être de cette colonne.
--
-- ═══ 🔴 POURQUOI `md5` ET PAS LE sha256 QU'ON A DÉJÀ ═════════════════════════════════════════════════════════════
--
-- Parce que l'autre partie de la comparaison est Google, et que Google rend `md5Checksum`. Calculer le sha256 des
-- fichiers du Drive supposerait de TÉLÉCHARGER leur contenu — 181 001 fichiers — alors que le md5 voyage
-- gratuitement avec chaque ligne de `files.list`. Le sha256 reste la clé d'identité INTERNE (déduplication des
-- compteurs, images intégrées) : les deux colonnes ne disent pas la même chose et ne se remplacent pas.
--
-- 🔒 CETTE MIGRATION N'AJOUTE QU'UNE COLONNE ET DEUX INDEX. Aucune pièce n'est supprimée, aucun rattachement n'est
-- touché, rien n'est écrit dans le Drive. Elle se défait d'un `DROP COLUMN` et de deux `DROP INDEX`.

ALTER TABLE gestion_piece ADD COLUMN IF NOT EXISTS md5 text;

COMMENT ON COLUMN gestion_piece.md5 IS
  'LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE : empreinte MD5 des octets de la pièce, en minuscules. C''est '
  'l''empreinte que Google rend pour un fichier du Drive (md5Checksum) : elle seule permet de reconnaître une '
  'pièce dont le contenu est déjà rangé, quel que soit son nom. NULL = pas encore calculée (octets introuvables, '
  'ou pièce antérieure au rattrapage) et la reconnaissance par contenu ne joue alors pas.';

-- ⚠️ L'INDEX PORTE SUR `lower(md5)`, PARCE QUE C'EST AINSI QU'ON COMPARE. Google rend l'empreinte en minuscules,
--    mais rien ne le garantit par contrat : la comparaison normalise des deux côtés, et un index qui ne
--    normaliserait pas ne serait jamais pris.
-- ⚠️ ET IL EST PARTIEL : une pièce sans empreinte ne se cherche jamais par empreinte.
CREATE INDEX IF NOT EXISTS gestion_piece_md5_idx ON gestion_piece (lower(md5)) WHERE md5 IS NOT NULL;

-- 🔴 LE MÊME INDEX DE L'AUTRE CÔTÉ DE LA COMPARAISON. Sans lui, « quelles copies du Drive portent ce contenu ? »
--    balaie les 26 552 lignes du registre à CHAQUE vignette d'une colonne — et la pastille doit paraître à
--    l'ouverture de la fenêtre, sans faire attendre.
CREATE INDEX IF NOT EXISTS gestion_piece_drive_md5_idx ON gestion_piece_drive (lower(md5)) WHERE md5 IS NOT NULL;
