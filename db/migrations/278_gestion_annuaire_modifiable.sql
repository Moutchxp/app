-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 278 — L'ANNUAIRE DEVIENT MODIFIABLE (lot FICHES-ANNUAIRE, étape C, 29/09/2026)
--
-- ═══ 🔴🔴 CE QU'ELLE PERMET, ET POURQUOI CHAQUE MORCEAU EXISTE ══════════════════════════════════════════════════
--
-- Arno : « ces fiches SONT l'annuaire ». Jusqu'ici elles étaient en LECTURE SEULE, et le disaient : WIPPIMMO
-- faisait foi, et une correction tapée dans l'écran aurait été écrasée au prochain import, sans prévenir. Cette
-- migration est ce qui rend la saisie possible SANS ce mensonge.
--
-- ① DES CHAMPS QUE WIPPIMMO NE PORTE PAS. Mesuré avant d'écrire une ligne : ni « qualité » (SCI, indivision,
--    société + représentant), ni « note libre », ni civilité ni prénom d'un LOCATAIRE n'existent dans le schéma.
--    L'écran écrivait « non renseigné » faute de colonne. Elles arrivent ici.
--
-- ② UN ORDRE D'AFFICHAGE (`rang`). Arno : « Monsieur en premier, Madame en deuxième, puis les autres ; l'ordre se
--    règle à la main ». Sans colonne, l'ordre serait celui de la base — c'est-à-dire aucun.
--
-- ③ L'ARCHIVAGE, JAMAIS L'EFFACEMENT (`archive_le`). Arno : « Supprimer = ARCHIVER […] ses mails, rattachements
--    et historique restent. Restaurer est possible ». Une ligne archivée sort des fiches actives ; rien d'autre
--    ne bouge, et aucun DELETE n'est écrit nulle part dans ce lot.
--
-- ④ LES VERROUS (`gestion_annuaire_verrou`). Arno : « une valeur modifiée dans l'app devient PRIORITAIRE et n'est
--    plus jamais écrasée par un réimport. L'import liste les divergences (“WIPPIMMO dit X, l'app dit Y”) dans son
--    rapport, sans les appliquer ». C'est la table qui dit QUELS CHAMPS l'application possède désormais.
--    🔴 UN VERROU PAR CHAMP, ET NON PAR FICHE : corriger un numéro de téléphone ne doit pas geler l'adresse
--    postale, que WIPPIMMO continue de tenir à jour. Une fiche entière verrouillée se serait figée en silence.
--
-- ⑤ PLUSIEURS PROPRIÉTAIRES PAR BIEN (`gestion_annuaire_lot_proprietaire`). Aujourd'hui un lot n'a qu'UN
--    propriétaire (clé étrangère unique sur `gestion_annuaire_lot`), et 66 fiches sur 307 nomment pourtant deux
--    personnes DANS leur nom (« AISSAOUI Mohamed et Amina »). Cette table porte le lien, son RANG et sa PÉRIODE —
--    c'est elle qui permet « ajouter un co-propriétaire » et « remplacer un propriétaire (vente) : l'ancien passe
--    dans l'historique du bien, avec sa date de fin ».
--    ⚠️ `gestion_annuaire_lot.proprietaire_id` N'EST PAS TOUCHÉE. Elle reste la vérité de l'import, et tout ce
--    qui la lit continue de marcher à l'identique. La nouvelle table AJOUTE, elle ne remplace pas.
--
-- ⑥ D'OÙ VIENT UNE PERSONNE (`issu_de`). « Séparer en deux personnes » crée une fiche neuve à partir d'une
--    existante : on garde le lien, pour que l'historique explique d'où elle sort.
--
-- ═══ CE QU'ELLE NE FAIT PAS ═════════════════════════════════════════════════════════════════════════════════════
-- Aucune suppression, aucune réécriture de ligne existante, aucun trigger, aucune contrainte posée sur des
-- données déjà là. Toutes les colonnes ajoutées sont NULL (ou 0, ou 'import') pour les 1 182 lignes en place :
-- appliquer cette migration ne change STRICTEMENT RIEN à ce qui est affiché aujourd'hui.
--
-- 🔒 LE JOURNAL N'A PAS DE TABLE NOUVELLE. `gestion_journal` existe, il est append-only et porte déjà
-- (entite, entite_id, action, valeur_avant, valeur_apres, auteur) : c'est exactement « qui, quand, avant/après ».
-- En créer un second serait un second endroit où chercher.
--
-- LE CODE TOURNE SANS ELLE. `annuaireModifiableDisponible()` (app/lib/gestion/schema.ts) la sonde HORS
-- TRANSACTION ; tant qu'elle est absente, aucune de ces colonnes n'est NOMMÉE, les fiches restent en LECTURE
-- SEULE, et le bouton « Modifier » est rendu DÉSACTIVÉ avec son motif écrit — jamais absent, ce qui enverrait
-- chercher un bug, ni actif, ce qui promettrait un geste impossible.
--
-- POUR L'APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/278_gestion_annuaire_modifiable.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① ET ② ET ③ ET ⑥ : LES PERSONNES ──────────────────────────────────────────────────────────────────────────

ALTER TABLE gestion_annuaire_proprietaire
  ADD COLUMN IF NOT EXISTS qualite             text,
  ADD COLUMN IF NOT EXISTS note                text,
  ADD COLUMN IF NOT EXISTS rang                integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archive_le          timestamptz,
  ADD COLUMN IF NOT EXISTS archive_par_libelle text,
  ADD COLUMN IF NOT EXISTS issu_de             bigint;

ALTER TABLE gestion_annuaire_locataire
  ADD COLUMN IF NOT EXISTS civilite            text,
  ADD COLUMN IF NOT EXISTS prenom              text,
  ADD COLUMN IF NOT EXISTS qualite             text,
  ADD COLUMN IF NOT EXISTS note                text,
  ADD COLUMN IF NOT EXISTS rang                integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archive_le          timestamptz,
  ADD COLUMN IF NOT EXISTS archive_par_libelle text,
  ADD COLUMN IF NOT EXISTS issu_de             bigint;

COMMENT ON COLUMN gestion_annuaire_proprietaire.qualite IS
  'Qualité de la personne morale ou du rôle : SCI, indivision, société + représentant… Saisie dans l''application ; '
  'WIPPIMMO ne la porte pas. NULL = non renseignée, ce que l''écran écrit en toutes lettres.';
COMMENT ON COLUMN gestion_annuaire_proprietaire.rang IS
  'Ordre d''affichage des cartes du bloc « Coordonnées ». Décision d''Arno : Monsieur, puis Madame, puis les autres ; '
  'réglable à la main. 0 = pas encore ordonné — l''écran retombe alors sur l''ordre par civilité puis par nom.';
COMMENT ON COLUMN gestion_annuaire_proprietaire.archive_le IS
  'Instant de l''ARCHIVAGE. La personne sort des fiches actives ; ses mails, rattachements et historique restent '
  'intacts, et « Restaurer » remet la colonne à NULL. Aucun effacement n''existe dans ce module.';
COMMENT ON COLUMN gestion_annuaire_proprietaire.issu_de IS
  'La fiche DONT celle-ci a été séparée (geste « Séparer en deux personnes »). Garde le fil de l''historique : '
  'sans elle, une fiche neuve apparaîtrait sans qu''on sache d''où elle vient.';
COMMENT ON COLUMN gestion_annuaire_locataire.civilite IS
  'Civilité du locataire. WIPPIMMO n''en exporte pas pour les locataires (seul le propriétaire en a une) : '
  'elle se saisit ici. NULL = non renseignée.';

-- ── ① bis : LES COORDONNÉES — libellé modifiable, origine, archivage ──────────────────────────────────────────

ALTER TABLE gestion_annuaire_contact
  ADD COLUMN IF NOT EXISTS libelle    text,
  ADD COLUMN IF NOT EXISTS origine    text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS archive_le timestamptz;

DO $$
BEGIN
  -- ⚠️ La contrainte est posée à part, et seulement si elle manque : une migration rejouée ne doit pas échouer.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_contact_origine_chk') THEN
    ALTER TABLE gestion_annuaire_contact
      ADD CONSTRAINT gestion_annuaire_contact_origine_chk CHECK (origine IN ('import', 'saisie'));
  END IF;
END $$;

COMMENT ON COLUMN gestion_annuaire_contact.libelle IS
  'Le libellé TEL QU''ON LE VEUT (« Mobile », « Fixe », « Pro », « Email 1 »…), modifiable dans l''application. '
  'DISTINCT de libelle_source, qui garde ce que WIPPIMMO écrivait : les deux coexistent, et l''écran montre celui-ci '
  'quand il existe. Effacer libelle_source aurait perdu la trace de l''import.';
COMMENT ON COLUMN gestion_annuaire_contact.origine IS
  '« import » = venue de WIPPIMMO ; « saisie » = ajoutée dans l''application. Une coordonnée SAISIE n''est jamais '
  'retirée par un réimport — c''est la règle de priorité demandée par Arno.';
COMMENT ON COLUMN gestion_annuaire_contact.archive_le IS
  'Coordonnée retirée À LA MAIN. DISTINCTE de absent_le, qui dit « plus dans le dernier export de WIPPIMMO » : '
  'les deux absences n''ont pas la même cause, et les confondre ferait réapparaître au prochain import ce que '
  'quelqu''un venait de retirer.';

-- ── ④ : LES VERROUS — les champs que l'application possède désormais ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gestion_annuaire_verrou (
  id              bigserial PRIMARY KEY,
  sujet           text        NOT NULL CHECK (sujet IN ('proprietaire', 'locataire')),
  sujet_id        bigint      NOT NULL,
  /* Le NOM du champ verrouillé : 'civilite', 'nom', 'qualite', 'adresse', 'note', ou 'contacts' pour le bloc
     entier des téléphones et e-mails — ils se modifient ensemble, et les verrouiller un par un obligerait à
     inventer une identité stable pour chaque numéro. */
  champ           text        NOT NULL CHECK (btrim(champ) <> ''),
  /* La valeur de WIPPIMMO AU MOMENT DU VERROU : c'est elle qui permet de dire « WIPPIMMO dit X, l'app dit Y »
     sans avoir à deviner ce que l'import aurait écrit. NULL = WIPPIMMO ne portait rien. */
  valeur_import   text,
  pose_le         timestamptz NOT NULL DEFAULT now(),
  pose_par        bigint,
  pose_par_libelle text       NOT NULL,
  UNIQUE (sujet, sujet_id, champ)
);

COMMENT ON TABLE gestion_annuaire_verrou IS
  'Les champs de l''annuaire que l''APPLICATION possède : l''import WIPPIMMO ne les réécrit plus, et signale la '
  'divergence dans son rapport au lieu de l''appliquer. Un verrou par CHAMP, jamais par fiche : corriger un '
  'téléphone ne doit pas figer l''adresse postale, que WIPPIMMO continue de tenir à jour.';

-- ── ⑤ : PLUSIEURS PROPRIÉTAIRES PAR BIEN, AVEC LEUR PÉRIODE ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gestion_annuaire_lot_proprietaire (
  id               bigserial PRIMARY KEY,
  lot_id           bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  proprietaire_id  bigint      NOT NULL REFERENCES gestion_annuaire_proprietaire(id),
  rang             integer     NOT NULL DEFAULT 0,
  /* La PÉRIODE de propriété. `jusqu_a` renseignée = l'ancien propriétaire, après une vente : il passe dans
     l'historique du bien sans rien perdre — ni ses mails, ni ses rattachements. */
  depuis           date,
  jusqu_a          date,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  cree_par         bigint,
  cree_par_libelle text        NOT NULL DEFAULT 'import',
  CONSTRAINT gestion_annuaire_lot_prop_dates_chk CHECK (depuis IS NULL OR jusqu_a IS NULL OR jusqu_a >= depuis)
);

CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_prop_lot_idx
  ON gestion_annuaire_lot_proprietaire (lot_id, rang, id);
CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_prop_prop_idx
  ON gestion_annuaire_lot_proprietaire (proprietaire_id);
/* ⚠️ UN SEUL LIEN EN COURS par couple (lot, propriétaire) : deux liens ouverts diraient qu'il possède le bien
   deux fois. Un lien CLOS (jusqu_a renseignée) peut se répéter — on peut racheter un bien qu'on a vendu. */
CREATE UNIQUE INDEX IF NOT EXISTS gestion_annuaire_lot_prop_encours_unique
  ON gestion_annuaire_lot_proprietaire (lot_id, proprietaire_id) WHERE jusqu_a IS NULL;

COMMENT ON TABLE gestion_annuaire_lot_proprietaire IS
  'Le lien BIEN ↔ PROPRIÉTAIRE, avec son rang d''affichage et sa période. AJOUTÉE : '
  'gestion_annuaire_lot.proprietaire_id n''est pas touchée et reste la vérité de l''import. Cette table porte ce '
  'que l''import ne sait pas dire — plusieurs propriétaires pour un bien, et le changement de propriétaire.';

-- ── LES INDEX DE LECTURE DES FICHES ACTIVES ───────────────────────────────────────────────────────────────────
-- ⚠️ PARTIELS : une fiche archivée est l'exception (aucune au 29/09/2026). Un index plein porterait 817 lignes
--    pour n'en servir presque aucune.
CREATE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_archive_idx
  ON gestion_annuaire_proprietaire (archive_le) WHERE archive_le IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestion_annuaire_locataire_archive_idx
  ON gestion_annuaire_locataire (archive_le) WHERE archive_le IS NOT NULL;

COMMIT;
