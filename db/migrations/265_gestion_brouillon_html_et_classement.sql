-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 265 — LE BROUILLON GARDE SON HTML, ET CE QU'ON A DÉCIDÉ D'EN CLASSER (lot REDACTION-GMAIL, 28/09/2026)
--
-- CE QU'ELLE AJOUTE, et rien d'autre :
--   ① `gestion_brouillon.corps_html`  — le corps en TEXTE MIS EN FORME, tel que l'éditeur riche le produit ;
--   ② `gestion_brouillon_cible`       — les cibles choisies dans « Classer ce mail », gardées AVEC le brouillon.
--
-- ── ① POURQUOI UNE COLONNE ET PAS UN REMPLACEMENT DE `corps` ────────────────────────────────────────────────────
-- `corps` reste la version TEXTE, et elle reste la vérité de repli. Trois raisons, dans cet ordre :
--   · les 2 400 brouillons déjà en base n'ont que du texte — les réécrire serait une migration de données, donc un
--     risque, pour un bénéfice nul : l'éditeur sait très bien ouvrir du texte ;
--   · le message part en `multipart/alternative` : les DEUX versions voyagent, et la version texte est celle que
--     verra une partie des destinataires. Elle n'est pas un sous-produit, c'est une moitié du message ;
--   · si un jour le HTML d'un brouillon est illisible, le texte reste lisible. L'inverse ne serait pas vrai.
-- `corps_html` est donc NULLABLE : `NULL` se lit « ce brouillon n'a que du texte », et non « son HTML est vide ».
--
-- ── ② POURQUOI UNE TABLE ET PAS UN `jsonb` DE PLUS ──────────────────────────────────────────────────────────────
-- Parce que ces lignes deviennent des RATTACHEMENTS à l'envoi, et qu'un rattachement se compte, se cherche et
-- s'audite. Un `jsonb` aurait obligé à ouvrir chaque brouillon pour répondre à « quels brouillons visent le lot
-- 513 ? ». La forme reprend exactement celle de `gestion_rattachement` (sorte + clé + identifiant + libellé), pour
-- que le passage de l'un à l'autre soit une COPIE, sans traduction — une traduction finit toujours par diverger.
--
-- 🔒 CE QU'ELLE NE FAIT PAS : aucune suppression, aucune réécriture de l'existant, aucun trigger nouveau, aucune
-- contrainte ajoutée à une table existante. Réversible par
--   ALTER TABLE gestion_brouillon DROP COLUMN corps_html; DROP TABLE gestion_brouillon_cible;
--
-- LE CODE TOURNE SANS ELLE, et c'est vérifié par un test. `brouillonHtmlDisponible()` et `brouillonCibleDisponible()`
-- (app/lib/gestion/schema.ts) sondent HORS TRANSACTION ; tant qu'elles sont absentes :
--   · l'éditeur riche fonctionne à l'écran, et le brouillon enregistré ne garde que sa version TEXTE — on le DIT
--     dans l'éditeur plutôt que de laisser croire que la mise en forme est conservée ;
--   · le champ « Classer ce mail » n'est pas affiché du tout : proposer un classement qu'on ne saurait pas garder
--     serait promettre un geste qui se perdrait au rechargement.
-- L'ENVOI, lui, part en HTML dans les deux cas : il ne lit pas le brouillon en base, il lit ce qui est à l'écran.
--
-- POUR L'APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/265_gestion_brouillon_html_et_classement.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① LE CORPS MIS EN FORME ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_brouillon ADD COLUMN IF NOT EXISTS corps_html text;

COMMENT ON COLUMN gestion_brouillon.corps_html IS
  'Corps en texte mis en forme (HTML assaini par app/lib/gestion/htmlMail.ts). NULL = ce brouillon n''a que du '
  'texte (brouillon d''avant le lot REDACTION-GMAIL, ou rédigé sans mise en forme). La colonne `corps` reste la '
  'version TEXTE et voyage dans le multipart/alternative : elle n''est pas un sous-produit du HTML.';

-- ── ② LES CIBLES DE CLASSEMENT CHOISIES PENDANT L'ÉCRITURE ──────────────────────────────────────────────────────
-- ⚠️ MÊME FORME QUE `gestion_rattachement`, délibérément : à l'envoi, chaque ligne devient un rattachement MANUEL
--    confirmé du message envoyé. Une forme différente aurait demandé une traduction, et une traduction diverge.
CREATE TABLE IF NOT EXISTS gestion_brouillon_cible (
  id            bigserial PRIMARY KEY,
  brouillon_id  bigint      NOT NULL REFERENCES gestion_brouillon(id) ON DELETE CASCADE,
  cible_sorte   text        NOT NULL,
  cible_cle     text,
  cible_id      bigint,
  cible_libelle text        NOT NULL DEFAULT '',
  cree_le       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_brouillon_cible_sorte_chk
    CHECK (cible_sorte = ANY (ARRAY['lot'::text, 'proprietaire'::text, 'locataire'::text, 'evenement'::text]))
);

COMMENT ON TABLE gestion_brouillon_cible IS
  'Cibles choisies dans « Classer ce mail » pendant l''écriture d''un NOUVEAU message. À l''envoi, chacune devient '
  'un rattachement manuel confirmé du message envoyé (gestion_rattachement), journalisé avec l''auteur. Supprimées '
  'avec le brouillon (ON DELETE CASCADE) : ce ne sont pas des rattachements, seulement une intention.';

-- Une cible n'est choisie qu'UNE fois par brouillon : recliquer la même dans le sélecteur ne doit pas la doubler.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_brouillon_cible_unique_idx
  ON gestion_brouillon_cible (brouillon_id, cible_sorte, coalesce(cible_cle, ''), coalesce(cible_id, 0));

CREATE INDEX IF NOT EXISTS gestion_brouillon_cible_brouillon_idx
  ON gestion_brouillon_cible (brouillon_id);

COMMIT;
