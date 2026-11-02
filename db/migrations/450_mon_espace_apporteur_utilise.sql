-- 450_mon_espace_apporteur_utilise.sql — MON ESPACE, LOT 9 (Arno, 02/11/2026) : « L'UTILISER » — UN APPORTEUR EXISTANT DANS LA LISTE D'UN COLLABORATEUR.
--
-- LE BESOIN (décision 4 d'Arno, zéro doublon) : quand un collaborateur veut un apporteur qui existe déjà (rattaché à un autre collègue), on ne le
-- recrée pas : « L'utiliser ». Il entre alors dans SES apporteurs (« Mon espace », formulaire de compromis), SANS changer son collègue de
-- rattachement ni ses règles de commission (`gestion_location_apporteur_collegue`, `_bareme`, `_remuneration` : intacts). Aucune table existante
-- ne porte ce lien « ce collaborateur utilise cet apporteur » : il faut le noter quelque part — d'où cette table, la seule nécessité de ce lot.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : `mon_espace_apporteur` (compte, apporteur, qui l'a posé, quand ; retirée par `retire_le`, jamais effacée), une
-- seule ligne vivante par couple (index unique partiel : deux « L'utiliser » simultanés n'en font qu'une). AUCUNE ligne existante n'est modifiée.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction. Suppose la 406 (annuaire des apporteurs).
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, « L'utiliser » choisit l'apporteur pour la vente en cours (formulaire de compromis), et
-- l'onglet « Mes apporteurs » dit « disponible après la mise à jour (migration 450) » pour le garder dans la liste.

CREATE TABLE IF NOT EXISTS mon_espace_apporteur (
  id                bigserial    PRIMARY KEY,
  compte_id         bigint       NOT NULL REFERENCES admin_utilisateur(id),
  apporteur_id      bigint       NOT NULL REFERENCES gestion_location_apporteur(id),
  cree_le           timestamptz  NOT NULL DEFAULT now(),
  cree_par_libelle  text         NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le         timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS mon_espace_apporteur_vivant_idx ON mon_espace_apporteur (compte_id, apporteur_id) WHERE retire_le IS NULL;

COMMENT ON TABLE mon_espace_apporteur IS
  'Les apporteurs qu''un collaborateur « utilise » sans en être le collègue de rattachement (migration 450, Mon espace) ; rien d''autre ne change. Jamais effacée : retire_le.';
