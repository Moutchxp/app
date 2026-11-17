-- 482_gestion_digicode_code_15.sql — LE CODE D'UN DIGICODE : 15 CARACTÈRES AU PLUS (Arno, 17/11/2026).
--
-- LE BESOIN (demande d'Arno du 17/11/2026) : « CHAMP DIGICODE plus court : largeur adaptée à 15 caractères au plus (même largeur pour le commun et
-- pour chaque bâtiment), saisie limitée à 15 caractères […]. Un code existant plus long reste affiché tel quel, jamais tronqué en base. Même réglage
-- partout où le composant unique sert. » La base unique des digicodes (478) bornait le code à 8 caractères : un code de 9 à 15 serait refusé.
--
-- CE QU'ELLE FAIT : la contrainte de longueur du code (contrainte en ligne de la 478, nom donné par PostgreSQL) est remplacée par une contrainte
-- nommée qui admet 15 caractères au plus (même règle sinon : pas de code vide). ÉLARGISSEMENT SEUL : toute ligne valable avant le reste ; aucune
-- ligne touchée ; l'historique reste en ajout seul (triggers de la 478 inchangés). Les anciennes tables (396, 399, fiche du bien) ne changent pas.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT. Suppose 478.
--
-- ⚠️ Sans elle, le serveur garde la limite de 8 caractères (le champ en accepte 15 mais le serveur refuse au-delà de 8, avec un message clair).

ALTER TABLE gestion_digicode DROP CONSTRAINT IF EXISTS gestion_digicode_code_check;
ALTER TABLE gestion_digicode DROP CONSTRAINT IF EXISTS gestion_digicode_code_longueur_chk;
ALTER TABLE gestion_digicode ADD CONSTRAINT gestion_digicode_code_longueur_chk CHECK (code IS NULL OR (btrim(code) <> '' AND char_length(code) <= 15));

COMMENT ON CONSTRAINT gestion_digicode_code_longueur_chk ON gestion_digicode IS 'Le code d''un digicode : 15 caractères au plus, jamais vide (482, Arno 17/11/2026 ; 8 avant).';
