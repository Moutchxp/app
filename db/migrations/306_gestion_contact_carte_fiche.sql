-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 306 — LOT HISTORIQUE-BIEN-8, POINT 3 : UNE CARTE DE CONTACT PORTE LES CHAMPS D'UNE « NOUVELLE FICHE »
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (05/10/2026), mot pour mot : « Le formulaire du “+” doit être le MÊME que celui des clients
--   (“Nouvelle fiche” / “Modifier la fiche”) : civilité, nom, prénom, qualité, adresse, code postal, commune,
--   “Téléphones et e-mails” (plusieurs lignes, ordre ↑↓, ✕, “+ Téléphone”, “+ E-mail”), note libre, catégorie.
--   Pour un CONTACT, seuls le NOM et AU MOINS UN E-MAIL sont obligatoires. La carte du carrousel montre les mêmes
--   rubriques qu'une carte client (QUALITÉ, ADRESSE, MOBILE/E-MAIL avec “Copier”, NOTE). »
--
-- 🔴 CE QUE LA 304 PORTAIT, ET CE QU'IL MANQUAIT. `gestion_contact_carte` tenait `nom`, `telephone` et (305)
-- `note` — trois champs sur onze. Le formulaire des clients en remplit huit de plus, et un formulaire dont les
-- trois quarts des champs ne seraient pas gardés serait un formulaire qui MENT : on saisit une adresse postale,
-- on valide, et elle n'existe nulle part.
--
-- ⚠️ `adresse` EST DÉJÀ PRISE, ET C'EST POUR ÇA QUE L'ADRESSE POSTALE S'APPELLE `adresse_postale`. La colonne
-- `adresse` de cette table est l'ADRESSE E-MAIL, et elle est l'IDENTITÉ de la carte (index unique
-- (lot_cle, cote, adresse) sur les vivantes). Réutiliser le mot aurait fait écrire un jour l'une à la place de
-- l'autre — et une carte dont l'identité change est une carte que sa capsule ne retrouve plus.
--
-- ═══ 🔴🔴 POURQUOI LES COORDONNÉES SONT UN `jsonb` ORDONNÉ, ET NON UNE TABLE FILLE ════════════════════════════
--
-- Les clients ont une table (`gestion_annuaire_contact`) parce que leurs coordonnées sont ARCHIVÉES une par une,
-- réordonnées par un rang écrit en base, réparties entre deux personnes par l'écran « Séparer », et cherchées
-- par numéro depuis la recherche. Rien de cela n'existe pour un contact : la liste se saisit, se réordonne et
-- s'enregistre D'UN BLOC (« la liste complète part à chaque enregistrement, dans l'ordre affiché » — règle du
-- formulaire, écrite au lot FICHES-RETOUCHES), et la carte entière est déjà versionnée par `retire_le`.
--
-- Une table fille aurait apporté un rang à tenir, une seconde porte d'écriture, et un ordre qui peut diverger de
-- celui qu'on a vu à l'écran. Le tableau JSON, lui, EST l'ordre : il n'y a rien à trier au retour.
--
-- ⚠️ LA FORME EST CONTRAINTE PAR LA BASE : un tableau, et rien d'autre. Sans ce `CHECK`, un objet ou un nombre
-- s'y rangerait sans bruit, et c'est l'écran qui serait tombé en le relisant. Le CONTENU des éléments, lui, est
-- vérifié par le module pur (`coordonneesDeLaCarte`) : une ligne illisible est IGNORÉE, jamais devinée.
--
-- ⚠️ TOUT EST NULLABLE, et c'est la règle d'Arno pour un contact : « seuls le NOM et AU MOINS UN E-MAIL sont
-- obligatoires ; les autres champs sont facultatifs, sans message rouge ». Une contrainte NOT NULL ici
-- contredirait l'écran — et les 481 cartes déjà en base (des PROPOSITIONS, cf. point 1) n'ont aucun de ces
-- champs.
--
-- ⚠️ IDEMPOTENTE (`IF NOT EXISTS` partout) : une migration qu'on ne peut pas rejouer est une migration qu'on
-- n'ose pas rejouer, et c'est toujours au pire moment qu'on en a besoin.
--
-- ⚠️ AUCUNE DONNÉE TOUCHÉE : les colonnes naissent vides sur les cartes existantes. Une carte sans ces champs
-- s'affiche « non renseigné », exactement comme une carte client qui n'en porte pas.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_contact_carte
  ADD COLUMN IF NOT EXISTS civilite        text,
  ADD COLUMN IF NOT EXISTS prenom          text,
  ADD COLUMN IF NOT EXISTS qualite         text,
  ADD COLUMN IF NOT EXISTS adresse_postale text,
  ADD COLUMN IF NOT EXISTS code_postal     text,
  ADD COLUMN IF NOT EXISTS commune         text,
  ADD COLUMN IF NOT EXISTS coordonnees     jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gestion_contact_carte_coordonnees_chk'
  ) THEN
    ALTER TABLE gestion_contact_carte
      ADD CONSTRAINT gestion_contact_carte_coordonnees_chk
      CHECK (coordonnees IS NULL OR jsonb_typeof(coordonnees) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN gestion_contact_carte.civilite IS
  'Civilité saisie dans le formulaire du « + » (M., Mme, SCI…). Facultative pour un contact.';
COMMENT ON COLUMN gestion_contact_carte.prenom IS
  'Prénom. Pré-rempli par découpe du nom affiché du courrier quand elle est possible ; facultatif.';
COMMENT ON COLUMN gestion_contact_carte.qualite IS
  'Qualité libre (gérant, syndic, artisan…). Même rôle que gestion_annuaire_*.qualite.';
COMMENT ON COLUMN gestion_contact_carte.adresse_postale IS
  'Adresse POSTALE (voie). À ne pas confondre avec la colonne « adresse », qui est l''adresse E-MAIL et '
  'l''identité de la carte.';
COMMENT ON COLUMN gestion_contact_carte.coordonnees IS
  'Téléphones et e-mails de ce contact, DANS L''ORDRE AFFICHÉ : tableau JSON de {sorte, libelle, valeur}. '
  'L''ordre du tableau EST l''ordre de la carte — il n''y a rien à trier au retour.';
