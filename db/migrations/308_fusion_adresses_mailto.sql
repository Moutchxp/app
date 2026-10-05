-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 308 — LOT HISTORIQUE-BIEN-10, POINT 0 : LA FUSION DES ADRESSES « mailto: »
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARBITRAGE D'ARNO (05/10/2026), mot pour mot : « FUSIONNE. Sauvegarde d'abord. Normalise les 98 adresses. En cas
--   de collision avec une ligne vivante : on garde la plus ancienne date de création ; vérifiée si l'une des deux
--   l'était (en gardant l'auteur et la date de la vérification) ; notes mises bout à bout ; l'autre ligne passe en
--   'retire' avec le motif “fusion mailto”, jamais supprimée. »
--
-- 🔴 SAUVEGARDE PRISE AVANT : `~/Desktop/sauvegarde-avant-fusion-mailto.sql` (53 Mo, 142 736 `INSERT`), les trois
-- tables touchées en entier — l'archive du courrier, les cartes, les catégories.
--
-- ═══ CE QUE C'ÉTAIT, ET POURQUOI C'EST LA RACINE DE DEUX DÉFAUTS ════════════════════════════════════════════════
--
-- L'en-tête de certains mails porte `Nom <adresse<mailto:adresse>>` — un artefact des clients de messagerie qui
-- glissent le lien HTML DANS l'en-tête. `adresseDe` lisait le DERNIER `<…>`, donc `mailto:adresse`. Mesuré :
-- **410 lignes**, **98 adresses distinctes**, et **les 98 existent AUSSI en clair**. Ce ne sont pas 98
-- correspondants de plus : ce sont 98 personnes comptées DEUX FOIS — deux capsules, deux compteurs, deux cartes.
--
-- 🔴 ET C'EST LA CAUSE MESURÉE DU DÉFAUT DU POINT 1 (« une carte dans deux catégories ») : sur les **7 groupes**
-- de catégories vivantes en double d'un même bien, **7 sur 7** viennent de ces deux écritures ; sur les **5**
-- groupes de cartes vivantes en double, **5 sur 5**. Aucun autre chemin — ni le glisser, ni « Changer de côté »,
-- ni le « + », ni « Valider une proposition » — n'en produit : tous retirent l'ancienne ligne dans le même geste.
--
-- ═══ CE QUE FAIT CETTE MIGRATION, EN TROIS TEMPS ════════════════════════════════════════════════════════════════
--
-- ① L'ARCHIVE DU COURRIER (`gestion_message_adresse`) : 410 lignes renommées. **Zéro collision** — aucun mail ne
--    porte la même personne sous les deux écritures dans le même rôle (vérifié : l'index unique est
--    (message_id, adresse, role)). C'est ce temps-là qui défait les capsules et les compteurs en double.
--    ⚠️ `adresse_brute` N'EST PAS TOUCHÉE : c'est l'en-tête REÇU, la trace de ce que le courrier disait. La
--    corriger reviendrait à réécrire le courrier lui-même.
--
-- ② LES CARTES DE CONTACT : 34 vivantes, dont **29 simples renommages** et **5 fusions**.
-- ③ LES CATÉGORIES : 51 vivantes, dont **44 simples renommages** et **7 fusions**.
--
-- ═══ LA RÈGLE DE FUSION, ET LES DEUX POINTS QU'ARNO N'AVAIT PAS À TRANCHER ══════════════════════════════════════
--
-- Sa règle est appliquée à la lettre : plus ancienne date de création ; vérifiée si l'une des deux l'était, avec
-- SON auteur et SA date ; notes bout à bout ; l'autre en 'retire', motif « fusion mailto ».
--
-- ⚠️ ① À DATE ÉGALE, LE PLUS PETIT IDENTIFIANT. Les paires nées de la même passe de reprise portent la MÊME
-- seconde (04/10 22:11:22) : la date ne les départage pas. L'identifiant, lui, est l'ordre d'insertion — donc la
-- plus ancienne au sens strict. Sans cette clause, le résultat aurait dépendu de l'ordre de lecture du moteur.
--
-- ⚠️ ② UNE CATÉGORIE QUI DIT QUELQUE CHOSE L'EMPORTE SUR `a_repartir`. Un seul cas sur les sept
-- (`christophe.delattre@3ds.com`, lot 207) : `proprietaire` d'un côté, `a_repartir` de l'autre, même origine et
-- même seconde. `a_repartir` n'est pas une catégorie, c'est le constat qu'on n'a PAS su trancher : garder le
-- vide parce qu'il a un identifiant plus petit aurait effacé une information au nom d'une règle d'arbitrage.
-- La règle d'Arno (« ne rien perdre ») se lit dans ce sens-là.
--
-- ⚠️ AUCUNE SUPPRESSION, NULLE PART : la ligne écartée garde tout, et porte son motif. Elle se rouvre d'un
-- `UPDATE` si Arno le demande.
--
-- ⚠️ IDEMPOTENTE : rejouée, elle ne trouve plus aucune adresse en `mailto:` et ne fait rien.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

/* ── ① L'ARCHIVE DU COURRIER ─────────────────────────────────────────────────────────────────────────────── */
UPDATE gestion_message_adresse
   SET adresse = substring(adresse from 8)
 WHERE adresse LIKE 'mailto:%'
   /* 🔒 Le garde de l'index unique, écrit en toutes lettres : mesuré à zéro, mais une migration ne pose pas une
      mesure comme une hypothèse. Une ligne qui collisionnerait est simplement laissée en place. */
   AND NOT EXISTS (
     SELECT 1 FROM gestion_message_adresse b
      WHERE b.message_id = gestion_message_adresse.message_id
        AND b.role = gestion_message_adresse.role
        AND b.adresse = substring(gestion_message_adresse.adresse from 8));

/* ── ② LES CARTES DE CONTACT ─────────────────────────────────────────────────────────────────────────────── */
DO $$
DECLARE
  v record;
  garde bigint;
  ecarte bigint;
BEGIN
  FOR v IN
    SELECT m.id AS id_mailto, o.id AS id_clair, m.lot_cle, m.cote, substring(m.adresse from 8) AS nue
      FROM gestion_contact_carte m
      JOIN gestion_contact_carte o
        ON o.retire_le IS NULL AND o.lot_cle = m.lot_cle AND o.cote = m.cote
       AND o.adresse = substring(m.adresse from 8)
     WHERE m.retire_le IS NULL AND m.adresse LIKE 'mailto:%'
  LOOP
    /* LA PLUS ANCIENNE DATE DE CRÉATION ; à égalité, le plus petit identifiant (voir l'encadré ⚠️ ①). */
    SELECT id INTO garde FROM gestion_contact_carte
     WHERE id IN (v.id_mailto, v.id_clair) ORDER BY cree_le, id LIMIT 1;
    ecarte := CASE WHEN garde = v.id_mailto THEN v.id_clair ELSE v.id_mailto END;

    /* 🔴 ON ÉCARTE **AVANT** DE RENOMMER, ET L'ORDRE N'EST PAS UN DÉTAIL : l'index unique des vivantes porte
       sur (bien, côté, adresse), et la ligne écartée occupe DÉJÀ l'adresse nue. Renommer d'abord lève
       « duplicate key value violates unique constraint » — erreur payée au premier essai de cette migration. */
    UPDATE gestion_contact_carte
       SET retire_le = now(), retire_par_libelle = 'migration 308', retire_motif = 'fusion mailto'
     WHERE id = ecarte AND retire_le IS NULL;

    /* LA VÉRIFICATION DE L'UNE PROFITE À L'AUTRE — avec SON auteur et SA date, jamais « maintenant ». */
    UPDATE gestion_contact_carte g
       SET verifie_le = coalesce(g.verifie_le, a.verifie_le),
           verifie_par = CASE WHEN g.verifie_le IS NULL THEN a.verifie_par ELSE g.verifie_par END,
           verifie_par_libelle = CASE WHEN g.verifie_le IS NULL
                                      THEN a.verifie_par_libelle ELSE g.verifie_par_libelle END,
           /* LES NOTES BOUT À BOUT, et jamais un saut de ligne orphelin quand l'une des deux est vide. */
           note = nullif(concat_ws(E'\n', nullif(btrim(coalesce(g.note, '')), ''),
                                          nullif(btrim(coalesce(a.note, '')), '')), ''),
           /* ⚠️ LE NOM ET LE TÉLÉPHONE SE COMPLÈTENT : la ligne gardée ne doit pas perdre ce que l'autre savait. */
           nom = coalesce(g.nom, a.nom),
           telephone = coalesce(g.telephone, a.telephone),
           /* 🔴 ET L'ADRESSE DEVIENT LA FORME NUE : c'est tout l'objet de la fusion. */
           adresse = v.nue
      FROM gestion_contact_carte a
     WHERE g.id = garde AND a.id = ecarte;
  END LOOP;
END $$;

/* Les 29 cartes sans jumelle vivante : un simple renommage. */
UPDATE gestion_contact_carte
   SET adresse = substring(adresse from 8)
 WHERE retire_le IS NULL AND adresse LIKE 'mailto:%'
   AND NOT EXISTS (
     SELECT 1 FROM gestion_contact_carte c
      WHERE c.retire_le IS NULL AND c.lot_cle = gestion_contact_carte.lot_cle
        AND c.cote = gestion_contact_carte.cote
        AND c.adresse = substring(gestion_contact_carte.adresse from 8));

/* ── ③ LES CATÉGORIES ────────────────────────────────────────────────────────────────────────────────────── */
DO $$
DECLARE
  v record;
  garde bigint;
  ecarte bigint;
BEGIN
  FOR v IN
    SELECT m.id AS id_mailto, o.id AS id_clair, substring(m.adresse from 8) AS nue
      FROM gestion_partie_categorie m
      JOIN gestion_partie_categorie o
        ON o.retire_le IS NULL AND o.lot_cle IS NOT DISTINCT FROM m.lot_cle
       AND o.adresse = substring(m.adresse from 8)
     WHERE m.retire_le IS NULL AND m.adresse LIKE 'mailto:%'
  LOOP
    /* 🔴 L'ORDRE DE PRÉFÉRENCE, ET IL DIT TROIS CHOSES DANS CET ORDRE :
         · une catégorie QUI DIT QUELQUE CHOSE passe devant `a_repartir` (voir l'encadré ⚠️ ②) ;
         · puis la plus ancienne date de pose ;
         · puis le plus petit identifiant. */
    SELECT id INTO garde FROM gestion_partie_categorie
     WHERE id IN (v.id_mailto, v.id_clair)
     ORDER BY (categorie = 'a_repartir'), pose_le, id LIMIT 1;
    ecarte := CASE WHEN garde = v.id_mailto THEN v.id_clair ELSE v.id_mailto END;

    /* 🔴 ON ÉCARTE **AVANT** DE RENOMMER, pour la même raison que les cartes : la ligne écartée occupe déjà
       l'adresse nue, et l'index unique des vivantes refuserait le renommage. */
    UPDATE gestion_partie_categorie
       SET retire_le = now(), retire_par_libelle = 'migration 308', retire_motif = 'fusion mailto'
     WHERE id = ecarte AND retire_le IS NULL;

    UPDATE gestion_partie_categorie g
       SET verifie_le = coalesce(g.verifie_le, a.verifie_le),
           verifie_par = CASE WHEN g.verifie_le IS NULL THEN a.verifie_par ELSE g.verifie_par END,
           verifie_par_libelle = CASE WHEN g.verifie_le IS NULL
                                      THEN a.verifie_par_libelle ELSE g.verifie_par_libelle END,
           adresse = v.nue
      FROM gestion_partie_categorie a
     WHERE g.id = garde AND a.id = ecarte;
  END LOOP;
END $$;

/* Les 44 catégories sans jumelle vivante : un simple renommage. */
UPDATE gestion_partie_categorie
   SET adresse = substring(adresse from 8)
 WHERE retire_le IS NULL AND adresse LIKE 'mailto:%'
   AND NOT EXISTS (
     SELECT 1 FROM gestion_partie_categorie g
      WHERE g.retire_le IS NULL AND g.lot_cle IS NOT DISTINCT FROM gestion_partie_categorie.lot_cle
        AND g.adresse = substring(gestion_partie_categorie.adresse from 8));
