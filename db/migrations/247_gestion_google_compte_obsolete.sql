-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 247 — LOT 5-PJ-C2 : LES COMPTES GOOGLE INDIVIDUELS DEVIENNENT OBSOLÈTES.
--
-- CE QUI CHANGE, ET POURQUOI. Le lot 5-PJ-C (migration 246) proposait à chaque collaborateur de RELIER son compte
-- Google à la tuile Gestion. Arno a décidé le 25/09 à 12 h 34 qu'on ne demanderait plus rien à personne : on agit
-- désormais AU NOM DE L'ADRESSE avec laquelle la personne s'identifie déjà à l'interface, grâce à une délégation au
-- niveau du domaine accordée à un compte de service. Plus d'écran Google, plus de choix de compte, plus de bouton.
--
-- 🔴 LA TABLE N'EST PAS SUPPRIMÉE. Un `DROP` effacerait aussi la possibilité de comprendre, dans six mois, ce qui
-- avait existé — et la doctrine du module est de ne jamais supprimer. Elle est VIDÉE et DOCUMENTÉE obsolète.
--
-- 🔴 VIDER N'EST PAS UNE ENTORSE À « RIEN N'EST JAMAIS SUPPRIMÉ ». Cette règle protège des données MÉTIER : un
-- message, un classement, une trace. Le contenu de cette table n'est rien de tout cela — ce sont des JETONS, c'est-
-- à-dire des ACCÈS au Drive personnel de quelqu'un, sans mot de passe et sans expiration. Un accès dont plus rien ne
-- se sert n'est pas une réserve, c'est un passif.
--
-- ⚠️ RÉVOQUER AVANT D'EFFACER. Effacer un jeton sans l'avoir révoqué chez Google le laisse VALABLE, et plus personne
-- ne peut le retirer. Lancer d'abord, donc :
--     npm run gestion:purger-jetons-google                    (simulation : dit ce qu'il ferait)
--     npm run gestion:purger-jetons-google -- --appliquer     (révoque chez Google, puis efface)
-- MESURÉ le 25/09/2026 avant livraison : la table contenait 0 ligne — personne n'avait jamais relié son compte. Le
-- DELETE ci-dessous est donc une ceinture, pas le geste principal.
--
-- 🔴 LE JOURNAL N'EST PAS TOUCHÉ. `gestion_journal` est append-only (trigger de la 228) : les lignes disant qui
-- avait relié quoi, et quand, restent intactes. C'est la trace qui compte, pas le secret.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   npm run gestion:purger-jetons-google -- --appliquer
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/247_gestion_google_compte_obsolete.sql
--
-- POUR REVENIR EN ARRIÈRE : il n'y a rien à défaire — la table reste, les colonnes aussi. Seuls les commentaires
-- changent, et les jetons (déjà révoqués) ne reviendront pas, ce qui est le but.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_google_compte') IS NULL THEN
    RAISE EXCEPTION 'La migration 246 doit être appliquée avant celle-ci (table gestion_google_compte absente).';
  END IF;
END $$;

-- Ceinture : s'il restait un jeton, il ne doit pas survivre à cette migration. La révocation, elle, est le travail
-- de la commande ci-dessus — une migration SQL ne sait pas parler à Google.
DELETE FROM gestion_google_compte;

COMMENT ON TABLE gestion_google_compte IS
  '⚠️ OBSOLÈTE depuis le lot 5-PJ-C2 (25/09/2026) — VIDE, et plus jamais écrite. Elle portait les comptes Google '
  'reliés un par un par les collaborateurs. L''accès au Drive se fait désormais AU NOM DE L''ADRESSE DE SESSION, par '
  'délégation au niveau du domaine accordée à un compte de service : il n''y a plus rien à relier, donc plus rien à '
  'stocker. Conservée VIDE plutôt que supprimée, pour que l''on puisse encore comprendre ce qui a existé. '
  'Les lignes de gestion_journal correspondantes, elles, sont intactes.';

COMMENT ON COLUMN gestion_google_compte.refresh_token_chiffre IS
  '⚠️ OBSOLÈTE — plus jamais renseignée. Les jetons qui s''y trouvaient ont été RÉVOQUÉS chez Google puis effacés '
  '(npm run gestion:purger-jetons-google -- --appliquer). Un jeton de rafraîchissement est un accès permanent au '
  'Drive d''une personne : le garder sans usage aurait été un passif, pas une précaution.';

COMMENT ON COLUMN gestion_config.domaines_google_autorises IS
  'Domaines dont une adresse peut servir d''identité Drive, séparés par des virgules. TOUJOURS EN USAGE après le lot '
  '5-PJ-C2 : c''est contre cette liste que l''adresse de session est vérifiée avant de partir en délégation. '
  'RÉGLAGE et non constante — ajouter un domaine ne doit demander ni code ni redéploiement.';

COMMIT;
