-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 309 — LOT HISTORIQUE-BIEN-10, POINT 1 : UNE ADRESSE N'A QU'UNE SEULE CARTE VIVANTE PAR BIEN
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- RÈGLE D'ARNO (05/10/2026), mot pour mot : « pour un bien donné, une adresse (normalisée) n'a qu'UNE catégorie
--   active et qu'UNE carte active. […] Garde-fou en base : index unique partiel (bien, adresse normalisée) sur
--   les lignes actives, par migration additive. »
--
-- ═══ 🔴 CE QUI MANQUAIT, ET CE QUI NE MANQUAIT PAS ══════════════════════════════════════════════════════════════
--
-- CÔTÉ CATÉGORIES, LE GARDE EXISTE DÉJÀ et il est exact : `gestion_partie_categorie_vivante_idx`, UNIQUE sur
-- (adresse, coalesce(lot_cle, '')) WHERE retire_le IS NULL. Une adresse ne peut donc PAS porter deux catégories
-- vivantes sur un même bien. Rien à ajouter de ce côté — et c'est pourquoi cette migration ne le touche pas.
--
-- CÔTÉ CARTES, LE GARDE EXISTAIT MAIS IL ÉTAIT TROP LARGE : `gestion_contact_carte_vivante_idx` est unique sur
-- (lot_cle, **cote**, adresse). Le `cote` ouvre précisément le trou qu'Arno a vu : la même personne pouvait être
-- vivante des DEUX côtés du même bien — « CONTACT DU PROPRIÉTAIRE » et « CONTACT DU LOCATAIRE » à la fois.
--
-- ⚠️ L'ANCIEN INDEX EST CONSERVÉ, ET CE N'EST PAS UN OUBLI : c'est la CIBLE du `ON CONFLICT (lot_cle, cote,
-- adresse)` de `poserCarteAlaMain`. Le retirer casserait la pose. Migration ADDITIVE, comme Arno l'écrit : on
-- ajoute le garde strict, on n'enlève rien.
--
-- ═══ 🔴 « ADRESSE NORMALISÉE » EST DÉJÀ LA FORME STOCKÉE ════════════════════════════════════════════════════════
--
-- L'index porte sur `adresse` telle quelle, et c'est suffisant : la colonne est contrainte depuis la 304 à
-- `adresse = lower(btrim(adresse))`, et la porte d'écriture passe par `normaliserEmail` (qui retire aussi le
-- schéma `mailto:` depuis le lot 9). Un index sur une EXPRESSION de normalisation aurait été un second juge de
-- « la même adresse », à côté de celui du module pur — exactement ce que ce dépôt évite partout.
--
-- ⚠️ MESURÉ AVANT DE POSER : 480 cartes vivantes, 480 couples (bien, adresse) distincts. **Zéro conflit** — la
-- migration 308 (fusion des `mailto:`) a retiré les 5 doublons, qui venaient tous de cette seule cause.
--
-- ⚠️ `CONCURRENTLY` EST ÉCARTÉ : il ne peut pas tourner dans une transaction, et toutes les migrations de ce
-- dépôt sont rejouées d'un `psql -f`. Sur 480 lignes, le verrou dure quelques millisecondes.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS gestion_contact_carte_une_par_bien_idx
  ON gestion_contact_carte (lot_cle, adresse)
  WHERE retire_le IS NULL;

COMMENT ON INDEX gestion_contact_carte_une_par_bien_idx IS
  'Lot HISTORIQUE-BIEN-10 : une adresse n''a qu''UNE carte vivante par bien, quel que soit le côté. '
  'Changer de côté DÉPLACE la carte (l''ancienne passe en retire_le), elle ne la double pas.';
