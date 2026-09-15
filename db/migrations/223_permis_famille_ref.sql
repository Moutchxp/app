-- 223_permis_famille_ref.sql — PART-2 (élargissement) : RÉFÉRENTIEL PILOTABLE des familles de pièces suivies au diagnostic de
-- complétude. Externalise ce qui était EN DUR dans le code (libellé, ordre d'affichage, phrase du corps de relance, motifs de
-- détection par nom) → Arno peut AJOUTER une famille sans toucher au code, d'un simple INSERT.
--
-- ⚠️ POURQUOI : le diagnostic ne suivait que 4 familles (masse, coupe, étages, Cerfa), alors que la demande CRPA porte sur bien
-- plus (Cerfa + annexes, PC1 situation, PC2 masse, PC3 coupe, PC4 notice, PC5 façades/toitures, PC6 insertion, l'arrêté, les
-- documents portant les cotes/altitudes NGF). Tout ce qui n'était pas suivi restait invisible, donc jamais relançable.
--
-- ═══ MODÈLE ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--   1 ligne = 1 famille suivie. `code` = identifiant stable (repris dans les cases à cocher et le journal). `detecteur_contenu`
--   pointe vers un détecteur CÂBLÉ en code (les 4 familles historiques : masse/coupe/etage/cerfa, qui lisent le CONTENU des PDF) ;
--   NULL = famille détectée par le NOM seul (motifs_nom). `motifs_nom` = mots-clés / codes réglementaires PCx (détection par nom,
--   pilotable). `libelle` = affichage court ; `libelle_corps` = la phrase insérée dans le mail de demande. `ordre` = tri d'affichage.
--   `actif` = famille proposée au diagnostic (pour les 4 HISTORIQUES, l'activation reste pilotée par config_veille.famille_attendue_*
--   — inchangé ; `actif` ne restreint QUE les familles nouvelles). Cf. app/lib/permis/famillesRef.ts (repli EN DUR si table absente).
--
-- 🔴 GARDE : ce lot ne touche NI le moteur de verdict SVAV, NI le golden Asnières (29.107259068449615), NI une altitude, NI
--    config_scoring, NI FamillePlan (sous-système tracé/best-of, INCHANGÉ), NI aucune donnée existante. Aucune IA. Le code se replie
--    sur les 4 familles historiques (comportement ACTUEL à l'identique) tant que cette table est absente ou vide → application non bloquante.
--
-- SÛR : CREATE TABLE / INSERT « IF NOT EXISTS » / « ON CONFLICT DO NOTHING ». Aucun DROP, aucune modification de donnée existante.
-- GOLDEN-SAFE. Idempotente. Une seule transaction. Requiert sitadel_dossier (déjà présent). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/223_permis_famille_ref.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

CREATE TABLE IF NOT EXISTS permis_famille_ref (
  code              text    PRIMARY KEY,
  libelle           text    NOT NULL,                       -- affichage court (liste du diagnostic + cases à cocher)
  libelle_corps     text    NOT NULL,                       -- phrase EN CLAIR insérée dans le corps du mail de demande
  ordre             integer NOT NULL,                       -- tri d'affichage (et ordre dans le corps du mail)
  motifs_nom        text[]  NOT NULL DEFAULT '{}',           -- détection PAR NOM : mots-clés / codes PCx (matching normalisé, frontière de mot pour « pcN »)
  detecteur_contenu text        NULL,                        -- 'masse'|'coupe'|'etage'|'cerfa' (détecteur de CONTENU câblé) ; NULL = par nom seul
  actif             boolean NOT NULL DEFAULT true,           -- famille proposée au diagnostic (les 4 historiques : activation par config_veille.famille_attendue_*)
  CONSTRAINT permis_famille_ref_detecteur_chk
    CHECK (detecteur_contenu IS NULL OR detecteur_contenu IN ('masse','coupe','etage','cerfa'))
);

COMMENT ON TABLE permis_famille_ref IS
  'PART-2 — référentiel PILOTABLE des familles de pièces suivies au diagnostic de complétude (libellé, ordre, phrase du corps de relance, motifs de détection par nom). Ajouter une famille = un INSERT (aucun code). detecteur_contenu non NULL = famille détectée par le CONTENU (câblé, 4 historiques) ; NULL = par le NOM seul (motifs_nom). Le code se replie sur les 4 familles historiques si la table est absente ou vide.';
COMMENT ON COLUMN permis_famille_ref.motifs_nom IS 'Détection PAR NOM : mots-clés/codes. « pcN » → frontière de mot (pc1 ne matche pas pc10). Reste → sous-chaîne (nom normalisé : minuscules, accents retirés, séparateurs unifiés).';
COMMENT ON COLUMN permis_famille_ref.detecteur_contenu IS 'Clé d''un détecteur de CONTENU câblé (masse/coupe/etage/cerfa). NULL = pas de lecture de contenu → une absence est « manquant » seulement si le dossier a un nommage réglementaire avéré, sinon « à vérifier » (jamais un faux manquant).';

-- Seed : 4 familles HISTORIQUES (comportement inchangé : detecteur_contenu = leur code, mêmes libellés/textes qu'en dur) + 6
--   NOUVELLES (détectées par le NOM). ON CONFLICT DO NOTHING → idempotent, ne réécrit jamais un libellé qu'Arno aurait personnalisé.
INSERT INTO permis_famille_ref (code, libelle, libelle_corps, ordre, motifs_nom, detecteur_contenu, actif) VALUES
  ('cerfa',     'Formulaire Cerfa (et annexes)',        'le formulaire Cerfa de demande de permis de construire et son annexe si besoin pour obtenir la liste intégrale des parcelles cadastrales concernées par ce permis', 10, ARRAY['cerfa','13409','13824'],                 'cerfa', true),
  ('situation', 'Plan de situation (PC1)',              'le plan de situation du terrain (PC1)',                                       20, ARRAY['pc1','plan de situation'],                   NULL,    true),
  ('masse',     'Plan de masse (PC2)',                  'le plan de masse (PC2)',                                                      30, ARRAY['pc2','plan de masse'],                      'masse', true),
  ('coupe',     'Plan de coupe (PC3)',                  'le plan de coupe (PC3)',                                                      40, ARRAY['pc3','plan en coupe','coupe'],             'coupe', true),
  ('notice',    'Notice descriptive (PC4)',             'la notice décrivant le terrain et présentant le projet (PC4)',                50, ARRAY['pc4','notice'],                            NULL,    true),
  ('facade',    'Plans des façades et toitures (PC5)',  'les plans des façades et des toitures (PC5)',                                 60, ARRAY['pc5','facade','facades','toiture','toitures'], NULL, true),
  ('insertion', 'Document graphique d''insertion (PC6)','le document graphique d''insertion (PC6)',                                    70, ARRAY['pc6','insertion','document graphique'],   NULL,    true),
  ('etage',     'Plans d''étages',                      'les plans des différents niveaux (plans d''étages)',                          80, ARRAY['plan de niveau','plans de niveaux','etage','etages'], 'etage', true),
  ('arrete',    'Arrêté d''autorisation',               'l''arrêté accordant l''autorisation',                                         90, ARRAY['arrete','arrete de permis','arrete accordant'], NULL, true),
  ('ngf',       'Documents cotes / altitudes NGF',      'tout document portant les altitudes ou les cotes NGF du projet (plans cotés, nivellement)', 100, ARRAY['ngf','nivellement','altimetrie'],   NULL,    true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — LECTURE SEULE) :
\echo '>>> référentiel des familles suivies (code, ordre, détecteur, actif) :'
SELECT code, ordre, detecteur_contenu, actif, libelle FROM permis_famille_ref ORDER BY ordre;
\echo '>>> nombre de familles (attendu : 10) :'
SELECT count(*) AS familles FROM permis_famille_ref;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible ; aucune donnée métier détruite, la table est un référentiel) :
--   psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS permis_famille_ref;"
