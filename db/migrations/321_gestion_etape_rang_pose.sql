-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 321 — L'ORDRE DE LA FRISE EST L'ORDRE DE POSE (lot FRISE-ORDRE-POSE-ET-GLISSER, 08/10/2026)
--
-- ═══ CE QU'ARNO DEMANDE ═════════════════════════════════════════════════════════════════════════════════════════
-- « Une carte ajoutée se place TOUJOURS au bout à droite de la frise. La date saisie à la main est PUREMENT
-- INFORMATIVE : elle s'affiche dans la carte mais n'a AUCUNE influence sur la place des cartes entre elles. […]
-- Si l'ordre dépend de la date saisie, remplace-le par un ordre de pose enregistré (ex. colonne « position »
-- ajoutée par migration — ajout seulement, aucune colonne retirée ni renommée). Les cartes existantes reçoivent
-- une position qui reproduit EXACTEMENT l'ordre affiché aujourd'hui : rien ne doit bouger à l'écran. »
--
-- ═══ 🔴 CE QUE FAIT CETTE MIGRATION, ET RIEN DE PLUS ════════════════════════════════════════════════════════════
-- ① elle AJOUTE une colonne `rang_pose` (aucune colonne retirée, aucune renommée, aucune contrainte touchée) ;
-- ② elle la REMPLIT, événement par événement, dans l'ordre EXACT où la frise affiche les cartes aujourd'hui.
--
-- 🔴 POURQUOI `rang_pose` ET NON `position` : `position` est une FONCTION du standard SQL (`position(x in y)`).
--    PostgreSQL accepte le nom comme colonne, mais toute requête qui l'oublierait entre guillemets deviendrait
--    illisible au premier coup d'oeil. Arno écrit « ex. colonne “position” » — c'est l'exemple, pas le nom.
--
-- 🔴 `numeric` ET NON `integer`, ET C'EST CE QUI REND LE GLISSER SIMPLE : intercaler une carte entre deux
--    voisines ne demande alors aucune renumérotation de la frise entière. La route renumérote quand même à
--    chaque déplacement (1, 2, 3…), parce qu'une frise tient en quelques cartes et qu'une suite d'entiers se
--    relit ; mais le type laisse la porte ouverte sans nouvelle migration.
--
-- ⚠️ NULLABLE, ET C'EST VOULU : une carte sans rang de pose se range comme avant ce lot (date, rang de type,
--    identifiant). C'est ce qui rend la migration SANS EFFET VISIBLE si l'on n'applique que le ① — et c'est
--    aussi le repli d'une carte qu'un chemin futur insérerait sans y penser.
--
-- ═══ 🔴🔴 L'ORDRE DE REMPLISSAGE EST CELUI DE L'ÉCRAN, AU CARACTÈRE PRÈS ════════════════════════════════════════
-- La frise trie par DATE, puis — à date égale — par RANG DE TYPE, puis par identifiant (`construireFrise`,
-- app/lib/gestion/frise.ts). Le `CASE` ci-dessous est la recopie de `RANG_ETAPE` (app/lib/gestion/mongaEtape.ts),
-- et une épreuve du dépôt (`friseOrdrePose.test.ts`) COMPARE les deux à chaque exécution de `npm test` : si l'un
-- des deux bouge sans l'autre, elle rougit. C'est la seule recopie du lot, et elle est surveillée.
--
-- ⚠️ CARRÉS ET POINTS SONT NUMÉROTÉS ENSEMBLE, dans une seule suite par événement : les points informatifs se
--    posent entre les carrés, et la frise les tisse dans la MÊME séquence (`rangerEnLigne`). Deux numérotations
--    séparées auraient rendu le tissage impossible à reconstituer.
--
-- ⚠️ LES CARTES RETIRÉES (`statut <> 'vif'`) SONT NUMÉROTÉES AUSSI, et c'est volontaire : une carte retirée puis
--    rétablie à la main doit retrouver une place, et la laisser à NULL l'aurait fait réapparaître au mauvais
--    endroit. Elles ne s'affichent pas, elles ne gênent personne.
--
-- ⚠️ LES CARTES SANS ÉVÉNEMENT (`evenement_id IS NULL`, rattachées par référence Monga) sont numérotées dans
--    leur RÉFÉRENCE. Relevé le 08/10/2026 : `gestion_monga_lien` est VIDE, donc aucune de ces 137 cartes n'est
--    affichée sur une frise aujourd'hui ; le jour où une référence sera reliée, elles auront déjà un ordre.
--
-- ═══ 🔒 RÉVERSIBLE, ET SANS PERTE ═══════════════════════════════════════════════════════════════════════════════
-- `ALTER TABLE gestion_monga_etape DROP COLUMN rang_pose;` rend la base à son état d'avant. Aucune donnée
-- existante n'est lue autrement que pour trier, aucune n'est modifiée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① LA COLONNE. `IF NOT EXISTS` : la migration se rejoue sans dommage.
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS rang_pose numeric;

COMMENT ON COLUMN gestion_monga_etape.rang_pose IS
  'Ordre de POSE sur la frise (lot FRISE-ORDRE-POSE-ET-GLISSER). La frise se range par ce rang, jamais par la '
  'date de l''étape, qui est purement informative. NULL = carte d''avant la migration 321 : elle se range alors '
  'comme avant (date, rang de type, identifiant).';

-- ② LE REMPLISSAGE, DANS L'ORDRE EXACT DE L'ÉCRAN.
--    `partition` : l'événement quand il y en a un, sinon la référence Monga (voir l'encadré).
--    Le `CASE` recopie RANG_ETAPE — et `friseOrdrePose.test.ts` tient les deux d'accord.
WITH ordonnees AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY coalesce(evenement_id::text, 'ref:' || coalesce(reference, '(sans)'))
           ORDER BY survenu_le,
                    CASE type
                      WHEN 'ouverture' THEN 0 WHEN 'prise_rdv' THEN 1 WHEN 'rdv_eu_lieu' THEN 2
                      WHEN 'devis_recu' THEN 3 WHEN 'devis_refuse' THEN 4 WHEN 'devis_accepte' THEN 5
                      WHEN 'rdv_intervention' THEN 6 WHEN 'intervention' THEN 7 WHEN 'rapport' THEN 8
                      WHEN 'cloture' THEN 9 WHEN 'reouverture' THEN 9.5
                      WHEN 'facture' THEN 10 WHEN 'rappel_devis' THEN 11 WHEN 'contact_injoignable' THEN 12
                      WHEN 'commentaire' THEN 13 WHEN 'assurance' THEN 14 WHEN 'expertise' THEN 15
                      WHEN 'relance' THEN 16 WHEN 'autre' THEN 17 WHEN 'note' THEN 18
                      ELSE 99
                    END,
                    id
         ) AS n
    FROM gestion_monga_etape
)
UPDATE gestion_monga_etape e
   SET rang_pose = o.n
  FROM ordonnees o
 WHERE e.id = o.id AND e.rang_pose IS NULL;

-- ③ L'INDEX DE LECTURE : la frise lit toutes les cartes d'un événement, dans l'ordre de pose.
CREATE INDEX IF NOT EXISTS gestion_monga_etape_rang_pose_idx
    ON gestion_monga_etape (evenement_id, rang_pose)
 WHERE evenement_id IS NOT NULL AND statut = 'vif';

COMMIT;
