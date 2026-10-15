# Audit — comptes collaborateurs et sécurité de l'admin exposée sur internet

> Recon en LECTURE SEULE du 14/10/2026 (code du dépôt ; aucune écriture en base, aucun compte créé, aucune commande
> vers le serveur). Contexte : l'admin est joignable sur `https://authentification.sansvisavis.com/admin` ; Arno veut
> créer autant de collaborateurs qu'il le souhaite, chacun avec les tuiles qu'il lui ouvre et toutes leurs
> fonctionnalités. Mesures brutes : `.captures/audit-comptes/` (liste des 219 routes et de leurs gardes).

## 0. Synthèse

- **Créer des collaborateurs : possible, sans limite de nombre** (aucune constante, contrainte ni plafond d'écran).
- **Mais « toutes les fonctionnalités de la tuile » n'est PAS vrai aujourd'hui** : Permis et Internautes s'affichent
  pour un collaborateur mais restent réservés au rôle administrateur ; Gestion réserve l'envoi au nom de gestion@ à un
  sous-droit ; à l'inverse, Pilotage laisse un collaborateur modifier la configuration du moteur de score.
- **Aucune route admin n'est ouverte à un visiteur non connecté** (proxy fail-closed + gardes des handlers).
- **Deux trous CRITIQUES avant toute ouverture** : la voie de secours (identifiant vide) est exposée sur internet sans
  aucune limite d'essais et donne un accès administrateur anonyme non révocable ; il n'y a pas de double
  authentification.

## 1. Les droits

| Droit | Où | Lu comment |
|---|---|---|
| Rôle `administrateur` / `collaborateur` | `admin_utilisateur.role` (migration 014:19) | l'administrateur a TOUS les droits implicitement (`session.ts:31-33`) |
| `perm_pilotage`, `perm_cartes_annee`, `perm_statistiques`, `perm_internautes`, `perm_curation`, `perm_banc_test` | 014:23-28 | une tuile chacun |
| `perm_permis` (+ sous-droit `perm_permis_modif`, valable seulement avec le parent) | 225:43-44 | `garde.ts:128`, `comptes.ts:75-78` |
| `perm_gestion` (+ sous-droit `perm_gestion_envoi` : oui / non / NULL = « à décider », NULL vaut non) | 228:63, 236:47-51 | `comptes.ts:106-109`, `gardeEnvoi.ts:36-54` |
| `actif`, `doit_changer_mot_de_passe` | 014:20, 016:34 | relus en base par les gardes `exiger*` ; `doitChanger` vit AUSSI dans le jeton |
| Voie de secours (identifiant vide, secret `ADMIN_PASSWORD_ARGON2_B64`) | `api/admin/session/route.ts:93-107` | session anonyme `sub=null`, administrateur, tous droits ; toutes les gardes la laissent passer SANS requête (`garde.ts:64,91,119,157,198`) |
| « Fondateur » | — | n'existe pas dans le code (seulement des commentaires) |

**Jeton de session** (`session.ts:82`) : `sub`, `identifiant`, `role`, `perms`, `doitChanger`, `peutModifierPermis`,
`jti` ; HS256, `ADMIN_SESSION_SECRET`, 8 h. **Le proxy décide sur le jeton seul** (`proxy.ts:127-178`) ; les gardes
`exigerAdministrateur`, `exigerModule`, `exigerCompteActif`, `exigerCapaciteModif` relisent rôle, actif et droit **en
base** à chaque requête (`garde.ts:56-216`).

**Gérer les comptes** — tuile Administratif (`/admin/comptes`), réservée au rôle (proxy `:73-78` + `exigerAdministrateur`
sur les 8 routes `api/admin/comptes/*`) : créer (identifiant e-mail, nom, rôle, tuiles, sous-droits ; mot de passe
temporaire de 16 caractères montré une seule fois, changement obligatoire à la 1re connexion `proxy.ts:148-153`),
changer les tuiles, réinitialiser le mot de passe, désactiver / réactiver (collaborateurs seulement), promouvoir en
administrateur (jamais l'inverse). Pas de suppression (désactivation, à dessein). CLI `npm run admin:*` : `creer`,
`reset`, `secours`, `secours-hash`, `lister`. **Aucune limite du nombre de comptes.**

## 2. Tuile par tuile

| Tuile | Droit qui l'ouvre (proxy + handler) | Actions qui restent réservées (rôle administrateur ou droit supplémentaire) |
|---|---|---|
| Pilotage | `perm_pilotage` (proxy:25,34) ; PATCH `exigerCompteActif` (`config/route.ts:62`) ; GET : proxy seul | **rien** — un collaborateur peut modifier `config_scoring` (moteur de score) |
| Années de construction | `perm_cartes_annee` ; écritures `exigerCompteActif` (`cartes-annee/route.ts:43`, `[id]:32,121`) | rien |
| Statistiques | `perm_statistiques` ; `exigerCompteActif` | rien |
| Internautes | page : `perm_internautes` ; API absente de la table du proxy → refus par défaut | **TOUT** : page réservée au rôle (`internautes/page.tsx:19,28`) et `exigerAdministrateur` sur ses 11 routes → **droit sans effet** |
| Curation | `perm_curation` ; écritures `exigerCompteActif` ; 8 GET : proxy seul | rien |
| Banc de test | `perm_banc_test` ; `aLaPermission` (jeton seul) | rien |
| Permis | `perm_permis` (proxy:31,44) ; `exigerModule('permis')` sur ~25 routes de lecture et d'analyse | **la PAGE elle-même** est réservée au rôle (`permis/page.tsx:24,46`) → tuile inutilisable par l'écran ; `exigerAdministrateur` sur dépôt, envoi, relances, réglages, saisines, rattachement, contacts, demandes… (≈ 25 routes : `automatisation`, `basculer-rail`, `cascade-partielle`, `collaborateurs`, `contact`, `demander-pieces`, `demandes*`, `depot*`, `prada`, `rattachement`, `reglage-passage`, `reglages`, `relever*`, `repondre`, `reponses`, `saisines`) ; `exigerCapaciteModif` (modifier après validation) sur `caracteristiques:184`, `emprise:197` |
| Gestion | `perm_gestion` ; ≈ 100 routes `exigerCompteActif('gestion')` | **envoyer au nom de gestion@** (`perm_gestion_envoi`, `peutEnvoyerAuNomDeGestion`) : brouillons, envois, corbeille Gmail, étiquettes, étoiles ; **réglages des tâches** : administrateur seul (`taches/reglage/route.ts:23-31`) |
| Administratif (comptes) | rôle, en dur (proxy:73-78) | tout |
| Audit | rôle (proxy:87-92) | tout |
| Sources de données | administrateur (refus par défaut du proxy) | tout |
| Mes tâches (hors grille) | tout compte connecté + règle « Confiée à » relue en base | — |

## 3. Contrôle côté serveur

- **Visiteur non connecté** : aucune route admin accessible. Le proxy couvre `/admin`, `/admin/:path*`,
  `/api/admin/:path*` (401 en API, redirection vers la connexion en page) et REFUSE par défaut tout chemin non déclaré ;
  seules exceptions publiques : la page de connexion et `/api/admin/session`.
- **Collaborateur connecté sans le droit** : refusé partout (proxy sur le jeton, puis garde du handler). Aucune route
  trouvée qui laisse passer un collaborateur sans le droit de la tuile.
- **Mais des routes ne vérifient que le JETON** (valable 8 h, sans relecture en base) : un collaborateur DÉSACTIVÉ ou à
  qui l'on RETIRE la tuile y garde l'accès jusqu'à expiration :
  - lecture Curation : `curation/journal`, `parcelles`, `parcelle-dossiers`, `emprises`, `tags-manuels`,
    `entites/[id]/{journal,emprises,borne}` (proxy seul) ;
  - Banc de test : `banc-comparer` (POST), `banc-profil-actif` (`aLaPermission`, jeton seul) ;
  - lecture de la configuration (`config` GET), des cartes d'année (GET) ;
  - les PAGES : le layout protégé lit le compte mais ne vérifie pas `actif` (`(protected)/layout.tsx:24-35`) ; les
    gardes de page Permis / Internautes / Gestion lisent le jeton.
  Les écritures et la plupart des lectures relisent la base : l'effet y est immédiat.

## 4. Sécurité de la connexion

| Point | Ce qui existe | Constat |
|---|---|---|
| Mots de passe | argon2id (lib `argon2`, paramètres par défaut), `admin_utilisateur.mot_de_passe` ; leurre argon2 pour un identifiant inconnu (temps constant) ; `ADMIN_PASSWORD` en clair n'est plus accepté | solide |
| Politique | ≥ 12 caractères, différent de l'ancien ; pas de liste de mots de passe compromis | correct |
| Limitation des essais | par IDENTIFIANT seulement (`login_echec`, `antiBruteforce.ts`) : dès 5 échecs en 15 min, délai 2·2^(n-5) s plafonné à 300 s, 429 | **aucune limite par IP ni globale** ; vérification non atomique (rafale en parallèle) ; **voie de secours JAMAIS limitée** (`session/route.ts:88`) |
| Session | JWS HS256, 8 h, pas de renouvellement glissant | **déconnexion = cookie effacé seulement** (`session/route.ts:137-139`) ; aucune liste noire de `jti` ni version de session ; un changement de mot de passe ou une désactivation ne tue pas les jetons déjà émis |
| Cookie | `svv_admin_session`, HttpOnly, SameSite=Strict, Path=/, sans Domain, 8 h ; `Secure` si `NODE_ENV=production` (forcé par `svav-next.service`) | correct derrière HTTPS ; préfixe `__Host-` absent |
| CSRF | SameSite=Strict seulement ; aucun contrôle `Origin` / `Sec-Fetch-Site` ; 2 routes multipart (`permis/archives`, `gestion/brouillons/[id]/pieces`) | les sous-domaines de sansvisavis.com sont « même site » : une faille sur un autre sous-domaine permettrait des actions authentifiées |
| Double authentification | **absente** | — |
| Journal des connexions | compteurs quotidiens anonymes (`analytics_admin_jour`), page Audit = agrégats ; `admin_utilisateur_log` trace les changements de COMPTE, pas les connexions ; `derniere_connexion_a` | **aucun journal nominatif (qui, quand, IP)**, connexions de secours comprises |
| Désactivation | effet immédiat sur les routes à garde `exiger*` | pas sur les routes « jeton seul » ni les pages (§3) ; un administrateur ne peut être désactivé que par SQL (la CLI n'a pas de commande) |
| Réinitialisation | par l'administrateur : mot de passe temporaire (CSPRNG, 16 car.), changement forcé ; pas de réinitialisation par e-mail | les sessions ouvertes survivent à la réinitialisation |
| En-têtes HTTP | aucun (`next.config.ts` sans `headers()`) | pas de HSTS, `frame-ancestors`, CSP, nosniff, Referrer-Policy |
| Énumération | même 401, même temps de réponse, 403 sans cause | correct |

## 5. Trous, par gravité

### Critique
1. **Voie de secours exposée** (identifiant vide + secret partagé) : jamais limitée en essais, accès administrateur
   complet, session anonyme (`sub=null`) que rien ne peut révoquer hors changement de `ADMIN_SESSION_SECRET`, aucune
   trace nominative. Le code la marque « à retirer au lot M3-5 après bascule » (`session/route.ts:94`).
2. **Pas de double authentification** sur une admin publique qui donne accès aux données personnelles des locataires
   (Gestion), aux envois aux mairies (Permis) et aux comptes.

### Important
3. **Aucune limitation par IP ni globale** des tentatives de connexion ; contrôle non atomique.
4. **Aucune révocation de session côté serveur** : déconnexion, désactivation, changement ou réinitialisation de mot de
   passe laissent le jeton valable jusqu'à 8 h là où il est seul juge.
5. **Routes et pages « jeton seul »** (§3) : un collaborateur désactivé ou privé de tuile y garde l'accès jusqu'à 8 h.
6. **CSRF entre sous-domaines** : pas de contrôle `Origin` sur les requêtes qui modifient.
7. **Aucun en-tête de sécurité** (HSTS, anti-cadre, CSP…).
8. **Aucun journal nominatif des connexions** : une intrusion ne laisserait pas de trace exploitable.
9. **Le mail d'acceptation de tâche part de gestion@ sans le droit d'envoi** (`taches/route.ts:72`,
   `taches/[id]/route.ts:137` ; seul le réglage global le conditionne).
10. **Droits qui ne correspondent pas aux tuiles** (à trancher par Arno, cf. §6) : Permis et Internautes s'ouvrent mais
    sont réservés à l'administrateur ; `perm_permis_modif` n'agit que sur deux routes derrière une page fermée ;
    Pilotage permet à un collaborateur de modifier `config_scoring` (moteur de score, que CLAUDE.md réserve à une
    relecture humaine).
11. **Un administrateur ne peut pas être désactivé** autrement qu'en SQL.

### Confort
12. `Secure` du cookie dépend de `NODE_ENV` ; préfixe `__Host-` absent ; longueur du secret de session non contrôlée.
13. `app/lib/admin/password.ts` et la variable `ADMIN_PASSWORD` sont orphelins ; `exigerCapaciteEnvoiGestion`
    (`garde.ts:150`) n'est appelée par aucune route (doublon de `gardeEnvoi.ts`) ; `secours()` laisse des colonnes de
    droits incohérentes (sans effet aujourd'hui).
14. Pas de liste de mots de passe compromis ; CSRF de connexion possible (`text/plain` accepté) ;
    `allowedDevOrigins` contient `*.trycloudflare.com` (`next.config.ts:12`).
15. Commentaires périmés (`menuAdmin.ts:59-61`, `permis/page.tsx:13-16`, `BoutonDeconnexion.tsx:16` qui affirme une
    invalidation serveur inexistante).

## 6. À corriger AVANT d'ouvrir l'admin à des collaborateurs

1. **Fermer la voie de secours sur internet** : la retirer de la route web (ou ne l'accepter que depuis `127.0.0.1`), la
   corde de rappel restant la CLI `npm run admin:secours` sur le serveur.
2. **Double authentification** (TOTP au minimum) — à défaut, en attendant : restreindre `/admin` et `/api/admin` par
   adresse IP ou VPN au niveau du reverse proxy.
3. **Limitation par IP et globale** sur `POST /api/admin/session`, au reverse proxy.
4. **Révocation côté serveur** : une version de session (ou une liste de `jti`) vérifiée par le proxy ou les gardes,
   incrémentée à la déconnexion, à la désactivation, au changement et à la réinitialisation du mot de passe.
5. **Relecture en base partout** : gardes `exiger*` sur les routes « jeton seul » (§3) et contrôle de `actif` dans le
   layout protégé.
6. **Contrôle `Origin`** (ou `Sec-Fetch-Site: same-origin`) sur toute requête non-GET de `/api/admin`.
7. **En-têtes** au reverse proxy : HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
8. **Journal nominatif des connexions** (qui, quand, IP, réussite / échec), au minimum les journaux d'accès du reverse
   proxy en attendant.
9. **Décisions d'Arno sur le contenu des tuiles**, avant de promettre « toutes les fonctionnalités » : Permis (ouvrir
   la page et lesquelles des ≈ 25 actions réservées ?), Internautes (ouvrir, ou retirer la tuile de la liste des droits),
   Pilotage (réserver la modification de `config_scoring` à l'administrateur ?), réglages des tâches, et le mail
   d'acceptation de tâche (exiger `perm_gestion_envoi` ?).

## 7. Suivi des décisions d'Arno (15/10/2026)

| Point | Décision | État |
|---|---|---|
| Critique 1 — limite d'essais sur la voie de secours | corriger | fait (`f4b333fa`) |
| A — voie de secours | **RETIRER de la page web** (accord explicite d'Arno pour ce retrait) : identifiant vide refusé, mention « Laisser vide pour l'accès de secours » supprimée, session anonyme (`sub=null`) refusée par le proxy et les gardes, `admin:secours-hash` supprimée. Corde de rappel unique : `npm run admin:secours` sur le serveur (`docs/BASCULE_CHECKLIST.md` §7) | fait |
| B — double authentification | **reportée par décision d'Arno le 15/10/2026** — à rouvrir AVANT l'ouverture de comptes collaborateurs | reportée |
| 3 — limite par IP | en plus de la limite par compte ; IP jamais en clair (HMAC, secret serveur), effacée après la fenêtre ; seuil et fenêtre réglables (migration 355) ; active si `CADENCE_ENTETE_IP` est posé | fait |
| 4 — révocation des sessions | le proxy relit le compte à chaque requête ; jeton porteur de l'empreinte du mot de passe (changement / réinitialisation / `admin:secours` coupent les sessions, sans migration) et d'une version de session incrémentée à la déconnexion et à la désactivation (migration 356) | fait |
| 5 — routes et pages « jeton seul » | couvertes au proxy : compte absent ou inactif → refus ; droits effectifs = jeton ∩ base (retrait immédiat sur toutes les routes et pages de l'admin) | fait |
| 6 — contrôle d'origine | toute requête d'API qui modifie (connexion comprise) doit venir de l'admin elle-même : `Sec-Fetch-Site` same-origin, ou `Origin` du même hôte ; autre sous-domaine ou site tiers → 403 | fait |
| 7 — en-têtes de sécurité | posés par l'application (`next.config.ts`) sur l'admin seule : `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy: same-origin`, HSTS un an en production (sans sous-domaines). **CSP globale reportée** : les routes de pièces et de mails posent la leur (plus stricte), et une CSP de pages exige des nonces pour les scripts de Next — à reprendre dans un lot dédié | fait (CSP : plus tard) |
| 8 — journal des connexions | une ligne par tentative (moment, identifiant, compte, réussie / échouée / bloquée, adresse en empreinte HMAC seulement), lisible dans la tuile Audit (« Dernières connexions ») ; conservation 12 mois réglable ; migration 357 | fait |
| 9 — mail d'acceptation de tâche | passe par la garde d'envoi au nom de gestion@ (relue en base) : sans le droit, tâche créée, demande en attente visible dans « Mes tâches », aucun mail | fait |
| 11 — désactiver un administrateur | `npm run admin:desactiver` / `admin:reactiver` sur le serveur : confirmation en retapant l'adresse, jamais le dernier administrateur actif, journal `admin_utilisateur_log` (via CLI), sessions révoquées | fait |
| 10 — contenu des tuiles pour les collaborateurs | choix métier, plus tard | non traité |
