-- 034_certificat_projet_unique.sql — UN PROJET, UN SEUL CERTIFICAT (unicité ferme de certificat.projet_id).
--
-- MOTIF : la 031 pose un INDEX NON UNIQUE sur certificat(projet_id) (`certificat_projet_idx`, 031:125) — il
--   ACCÉLÈRE les lectures mais n'INTERDIT rien. Rien n'empêche donc d'écrire DEUX certificats pour le MÊME projet :
--   un double-clic ou un retard réseau relance l'émission avant que la première ait commit. Un pré-contrôle en SQL
--   (« existe-t-il déjà un certificat pour ce projet ? ») NE SUFFIT PAS : deux transactions concurrentes lisent
--   toutes les deux « rien », puis insèrent toutes les deux. Résultat : DEUX numéros SAVV brûlés, DEUX documents
--   qui FONT FOI pour le même logement, sur une table IMMUABLE (trigger certificat_immuable) — donc IMPOSSIBLES à
--   nettoyer par UPDATE/DELETE. Seule une CONTRAINTE d'unicité ferme la porte : elle sérialise à l'INSERT (verrou
--   d'index unique) → la seconde transaction concurrente ÉCHOUE au lieu de créer le doublon.
--
-- MÉCANISME RETENU (et pourquoi) : on AJOUTE une contrainte `UNIQUE (projet_id)` nommée `certificat_projet_unique`,
--   À CÔTÉ de l'index existant — on ne le remplace PAS. « Aucun DROP » est la règle : retirer `certificat_projet_idx`
--   pour le convertir en index unique serait destructif → INTERDIT ici. La contrainte crée son PROPRE index unique
--   (backing index) ; l'ancien index non unique devient techniquement redondant pour les lectures, mais on le LAISSE
--   en place (sa suppression, si un jour souhaitée, relèvera d'une migration SÉPARÉE et DÉLIBÉRÉE, jamais de celle-ci).
--   Choix d'une CONTRAINTE plutôt que d'un simple `CREATE UNIQUE INDEX` : c'est l'objet DÉCLARATIF de la règle métier
--   (visible comme contrainte dans \d, nommable, commentable via COMMENT ON CONSTRAINT), cohérent avec les autres
--   règles de la table (numero UNIQUE, verdict CHECK). Idempotence par garde sur pg_constraint (ADD CONSTRAINT n'a pas
--   de `IF NOT EXISTS` natif) — même patron que la garde pg_trigger de l'immuabilité (031:138).
--
-- PÉRIMÈTRE : ALTER TABLE additif idempotent sur `certificat` UNIQUEMENT. Aucun DROP, aucun ALTER destructif, aucune
--   donnée touchée, aucune colonne modifiée, aucun index existant retiré. Le moteur n'est ni rappelé ni modifié →
--   golden 29.107259068449615 inchangé. Aucune modification de code : la route d'émission viendra dans un lot dédié.
--
-- RÈGLE MÉTIER (portée aussi en COMMENT ON CONSTRAINT) : un projet internaute n'a QU'UN certificat, à vie. Refaire le
--   test ne « réémet » pas : il crée un NOUVEAU `internaute_projet` (une nouvelle analyse), lequel aura SON propre
--   certificat. Un même projet ne peut jamais porter deux certificats.
--
-- node-pg : aucune nouvelle colonne, aucun impact de typage côté JS. À l'émission (lot à venir), une violation de
--   cette contrainte remonte en erreur `23505` (unique_violation) — à traiter comme « certificat déjà émis pour ce
--   projet », idempotence côté route.
--
-- ROLLBACK (non destructif de données ; à n'exécuter que sciemment, hors process nominal) :
--   ALTER TABLE certificat DROP CONSTRAINT IF EXISTS certificat_projet_unique;   -- (à n'exécuter que sciemment)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/034_certificat_projet_unique.sql
--
-- ⚠️ Vérification — DOUBLONS À CONTRÔLER *AVANT* D'APPLIQUER (si la table en contient, l'ALTER échouera) :
--   SELECT projet_id, count(*) AS n, array_agg(numero ORDER BY id) AS numeros
--     FROM certificat GROUP BY projet_id HAVING count(*) > 1;
--   -- 0 ligne = pas de doublon, la migration passera. ≥ 1 ligne = résoudre AVANT (arbitrage : table immuable →
--   --   ni UPDATE ni DELETE possible sans lever le trigger ; me remonter le cas plutôt que forcer).
--   -- État déduit sans exécution : AUCUN code n'insère dans `certificat` à ce jour (l'émission n'existe pas encore)
--   --   → la table est vide, doublons impossibles. La requête ci-dessus reste le contrôle de sûreté à lancer.
-- Vérification post-application : \d certificat  (doit lister la contrainte « certificat_projet_unique UNIQUE (projet_id) »).

BEGIN;

-- Ajout idempotent SANS DROP (garde sur pg_constraint : ADD CONSTRAINT n'accepte pas IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'certificat_projet_unique' AND conrelid = 'certificat'::regclass
  ) THEN
    ALTER TABLE certificat ADD CONSTRAINT certificat_projet_unique UNIQUE (projet_id);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT certificat_projet_unique ON certificat IS
  'UN projet, UN seul certificat, à vie. Refaire le test crée un NOUVEAU internaute_projet, qui aura le sien — jamais un second certificat sur le même projet. Ferme la course entre deux émissions concurrentes (double-clic, retard réseau) qu''un pré-contrôle SQL ne peut pas fermer : la contrainte sérialise à l''INSERT (une des deux transactions échoue en 23505). Table certificat IMMUABLE → un doublon serait impossible à nettoyer, d''où le verrou en amont.';

COMMIT;
