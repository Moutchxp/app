# RECON — Automatisation du dépôt téléservice (lecture seule)

> Run de RECON **lecture seule** (aucune écriture, aucune correction, aucun `veille:run`).
> Contexte : dépôt réel sur le téléservice Paris — **SVAV-DEM-2026-000160** (`demande.id = 866`),
> permis **PC07512025V0006** (`sitadel_dossier.id = 531`), le 28/08/2026. Chaque affirmation est
> citée `fichier:ligne` ou par requête `SELECT`.

---

## 1. Tableau de synthèse — A / B / C

| # | Automatisme attendu | Verdict | Preuve résumée |
|---|---|---|---|
| **A** | Après les DEUX copies, une relève se déclenche automatiquement dans la minute | **N'EXISTE PAS** (le déclencheur). La *trace* + la *fenêtre 60 s* existent, mais **rien ne les consomme**. | Un clic « Copier » ne fait que : presse-papier + pastille + **1 POST best-effort** `/depot-presume`, qui **upsert une ligne** `demande_depot_presume` (dont `echeance_detection_le = copie + 60 s`) et **rien d'autre** — aucun timer, aucun ordonnanceur, aucune relève. |
| **B** | La relève de la boîte trouve le mail de la mairie et le rattache à la demande | **EXISTE, MAIS NE RATTACHE PAS** la demande téléservice | La relève (run 91, 20 s après le dépôt) a **vu 7 messages, RETENU 1 (un accusé), RATTACHÉ 0**. Le rattachement échoue structurellement pour une demande `formulaire` : threading impossible + aucun n° de dossier / référence pour matcher. |
| **C** | Dès le mail reconnu, le n° de dossier mairie remonte dans « Référence mairie » | **N'EXISTE PAS** | Aucun code n'**extrait** une référence (type `SLC…`) d'un message pour l'**écrire** dans `demande_reference_externe`. Le regex `SLC` existe mais n'est qu'un **booléen de pertinence**, jamais un extracteur. Les seuls écrivains de la table sont **manuels**. |

---

## 2. Cause exacte de chaque « ne se déclenche pas »

### A — Aucune relève déclenchée par les copies (le déclencheur n'existe pas)

Chaîne d'un clic « Copier », de bout en bout :

1. `BoutonCopier.copier()` : `navigator.clipboard.writeText(...)` + `setMarque(true)` (pastille) + `onCopie?.()`. Rien d'autre. — `app/(admin)/admin/(protected)/permis/BoutonCopier.tsx:46-54`
2. `onCopie` → `signalerDepot(d.id, 'texte'|'ref')`. — `app/(admin)/admin/(protected)/permis/BlocDepot.tsx:94`
3. `signalerDepot` = **un seul** `fetch('/api/admin/permis/depot-presume', POST)` détaché (`.catch(()=>undefined)`, jamais attendu). — `BlocDepot.tsx:19-23`
4. La route `depot-presume` appelle `signalerDepotPresume` et **n'écrit qu'une table de trace**. En-tête explicite : « N'écrit JAMAIS demande.statut ni envoye_le ». — `app/(admin)/api/admin/permis/depot-presume/route.ts:16-30`
5. `signalerDepotPresume` : `INSERT … ON CONFLICT (demande_id) …` dans **`demande_depot_presume`**, colonnes `copie_texte_le` / `copie_ref_le`, `dernier_signal_le`, `echeance_detection_le` (= maintenant + 60 s). — `app/lib/veille/depotPresume.ts:28-53`

**Aucun consommateur de `echeance_detection_le`.** Grep `relever|releve|cron|schedule|setInterval|setTimeout` sur le chemin copie (`depot-presume/route.ts`, `depotPresume.ts`, `BlocDepot.tsx`, `BoutonCopier.tsx`) = **0 résultat**. La machinerie de relève (`releveAuto`) n'est appelée **que** par le CLI/cron `app/scripts/relever-demandes.ts` et le bouton manuel `app/(admin)/api/admin/permis/relever/route.ts` — jamais depuis une copie ni depuis `depot-presume`.

> **Nuance importante** : l'échafaudage d'une « détection dans la minute » **existe en données** (`demande_depot_presume.echeance_detection_le` = copie + 60 s), mais **le code qui déclencherait une relève sur cette fenêtre n'existe pas**. Confirmé en base pour 866 (les deux copies ont bien laissé leur trace) :
>
> ```
> demande_id | copie_texte_le          | copie_ref_le            | echeance_detection_le   | resolu_le               | resolution
> 866        | 2026-08-28 00:10:36.44  | 2026-08-28 00:10:48.98  | 2026-08-28 00:11:48.98  | 2026-08-28 00:20:57.46  | deposee
> ```

### B — La relève lit une seule boîte et ne peut pas rattacher une demande téléservice

**Quelle boîte est réellement lue ?** L'INBOX du **compte du profil `releve_profil`**, en lecture seule ; le compte est identifié par les **variables d'env `SMTP_{infixe}USER/PASS`** (IMAP `imap.gmail.com` par défaut), **jamais** par `adresse_reponse`.

- `releve_profil` (config) = **`entreprise`** → infixe `''` → compte `SMTP_USER`. — `veilleConfig` `releve_profil` ; `releveAuto.ts:120` (`INFIXE = { entreprise:'', personne:'PERSONNE_' }`) ; `releveAuto.ts:137-138` `lireCompteImap`.
- Compte IMAP = mêmes creds que SMTP : `email/index.ts:40-47` (`SMTP_{infixe}USER/PASS`) et `:64-70` (IMAP host/port). Box ouverte : **`INBOX`, `{ readOnly: true }`** — `app/lib/email/imap.ts:78-79`.
- **`adresse_reponse` n'est PAS lue par la relève** : `releverBoite` ne tire de la config que `pieceTailleMaxMo`, `natureAccuseMotifs`, `rechercheReferencesMax` (`releveReponses.ts:400-403`). `adresse_reponse` n'est qu'un réglage d'**envoi** (reply-to des courriers) — `email/index.ts:236,250` — et un affichage (`reponsesSuivi.ts:275`). **Rien dans le code ne garantit que `adresse_reponse` = la boîte relevée (`SMTP_USER`)** : ce sont deux réglages indépendants.

Valeurs en base :
```
releve_active | releve_profil | releve_intervalle_minutes | releve_fraicheur_heures | adresse_reponse
t             | entreprise    | 360                       | 48                      | a.jorel@sansvisavis.com
```

**Le transfert Gmail (paris.fr → sansvisavis) :** la relève ne suit **aucun** transfert ; elle ouvre **une seule** boîte (`SMTP_USER`). MAIS les compteurs du run 91 (`vus=7`, `retenus=1`, `accuses=1`) prouvent que **l'accusé de Paris ÉTAIT bien présent dans la boîte relevée** — donc le transfert a, de fait, livré le message dans la boîte `a.jorel@sansvisavis.com`. Le problème n'est donc **pas** la visibilité du message (B n'a pas échoué à le voir), mais son **rattachement**.

**Pourquoi `rattaches = 0` ?** La cascade de rattachement (`rattachementReponse.ts:128-188`) prend comme candidates **toutes** les demandes `statut='envoyee'`, tous canaux confondus (`releveReponses.ts:173-190`) — donc 866 EST candidate. Mais pour une demande `canal='formulaire'` :
- **Rung 1 (threading In-Reply-To/References) : IMPOSSIBLE.** Le join des `message_id` émis est filtré `AND a.canal='email'` (`releveReponses.ts:181`). L'acheminement de 866 est `canal='formulaire'` (voir §3) → `messageIdsEmis` vide → jamais de threading.
- **Rung 2 (référence interne `SVAV-DEM-…`)** : une mairie répondant à un téléservice ne cite pas notre référence interne → jamais.
- **Rungs 2bis / 2ter (n° de dossier Sitadel ; référence mairie enregistrée)** : *pourraient* matcher, MAIS il faut soit que le message cite littéralement le n° de dossier, soit qu'une référence soit **déjà enregistrée** dans `demande_reference_externe` — or celle de 866 est **vide** (§3).
- **Rung 3 (référence discrète)** : idem, exige une référence enregistrée.

→ Résultat : l'accusé est **retenu** (reconnu via le domaine dérivé `paris.fr` + un signal, `releveReponses.ts:524-531`) mais **rattaché à aucune demande**. Du point de vue du porteur, « la relève n'a rien trouvé » = **`rattaches=0`**.

Trace du run (le seul run autour du dépôt ; `declencheur` est **toujours** écrit `'planifie'` par le code, `releveAuto.ts:149`, donc le log ne distingue pas manuel/planifié — mais son horodatage hors-cycle, 20 s après le dépôt et 1 h 36 après le run précédent alors que l'intervalle est de 6 h, l'identifie comme **la relève lancée à la main par le porteur**) :
```
id | demarre_le             | declencheur | resultat | vus | hors_perimetre | retenus | rattaches | accuses | emis_par_nous
91 | 2026-08-28 00:21:18.93 | planifie    | ok       | 7   | 4              | 1       | 0         | 1       | 1
```

### C — Aucune remontée automatique de la référence

- Le regex `MOTIF_REFERENCE = /[A-Z]{2,6}\d{8,}/` (matche `SLC260810440700`) — `app/lib/veille/releveReponses.ts:153`.
- Il n'est utilisé que par `citeMotifReference(mb)` qui **renvoie un booléen** (`.test(...)`), jamais la chaîne capturée — `releveReponses.ts:154-156`. Seul appel : `releveReponses.ts:530`, comme **gate de pertinence** d'un domaine dérivé. **Aucune extraction, aucune écriture.**
- `grep 'INSERT INTO demande_reference_externe' app/lib/veille/` = **0 résultat**. Tous les accès de la relève à cette table sont des **SELECT** (`releveReponses.ts:179,218` ; `reponsesSuivi.ts:313,537`).
- Les **seuls** écrivains de `demande_reference_externe`, tous deux **manuels** :
  1. `ajouterReferenceExterne` (`demandeRepo.ts:1188-1202`, INSERT `:1194`) ← route « Référence mairie » `app/(admin)/api/admin/permis/demandes/reference/route.ts:31` (`source='saisie_manuelle'`).
  2. `marquerDeposee` (`demandeRepo.ts:1228-1271`, INSERT `:1261`, `source='accuse_reception'`) — **seulement si** une `reference` non vide est passée, càd tapée à la main sur la carte de dépôt.

→ La note d'août « **auto-ancre SLC jamais déclenchée** » est **confirmée** : il n'existe aucun chemin d'ancrage automatique à déclencher.

---

## 3. État réel de la demande 000160 (`id = 866`)

```
id  | reference            | code_insee | statut  | dest_canal | dest_email | profil    | cree_le             | maj_le
866 | SVAV-DEM-2026-000160 | 75056      | envoyee | formulaire | (vide)     | personne  | 2026-08-28 00:08:37 | 2026-08-28 00:20:57
dest_url_formulaire = https://sollicitations.paris.fr/ticketing/jsp/site/Portal.jsp?page=ticket
```

- **Acheminement** (1 ligne) : `canal='formulaire'`, `statut='envoye'`, `envoye_le=2026-08-28 00:20:57`, **`message_id` vide**, aucune relance. → confirme l'impossibilité du threading (§B, rung 1).
- **`demande_reference_externe`** : **0 ligne** (aucune référence mairie, ni auto — inexistant, C — ni saisie à la main).
- **`demande_dossier`** : dossier `531` (`PC07512025V0006`), `actif=true`, non satisfait.
- **`demande_journal`** : `→ brouillon` (« création », auteur 2), puis `brouillon → envoyee` (« **dépôt manuel (téléservice)** », auteur 2). Aucun événement automatique.
- **`demande_depot_presume`** : copies enregistrées (texte 00:10:36, réf 00:10:48), fenêtre 60 s jusqu'à 00:11:48, résolue « deposee » à 00:20:57 (§A).
- **Aucun message rattaché** : il n'existe **aucune table de stockage des messages entrants** (seule `releve_run` existe ; pas de `releve_message` / `message_entrant` / `reponse_mairie`). Les messages retenus ne sont **pas** persistés hors compteurs agrégés.

---

## 4. Ce que je n'ai PAS pu établir (et pourquoi)

1. **Que le message `retenus=1` du run 91 EST bien l'accusé de la demande 000160.** Fortement probable (run 20 s après le dépôt ; `accuses=1`), mais **non prouvable en base** : aucun message entrant n'est persisté (pas de table de messages ; seuls les compteurs agrégés de `releve_run` existent). Il y a par ailleurs un `rebonds_etrangers=1` dans le même run — un rebond distinct est aussi passé. Le contenu exact du message retenu est donc hors de portée d'un `SELECT`.
2. **Manuel vs planifié pour le run 91.** Le code écrit **toujours** `declencheur='planifie'` (`releveAuto.ts:149`) : le log ne distingue pas les deux. L'identification « manuelle » repose sur l'horodatage hors-cycle (20 s après le dépôt, alors que l'intervalle est de 6 h), pas sur une colonne dédiée.
3. **La configuration réelle du transfert Gmail** (filtre paris.fr créé le 10/08) est **hors code/base** : elle vit dans les réglages Gmail du porteur. Le code n'en a aucune connaissance ; je n'en infère l'effet que par les compteurs du run 91 (le message a atteint la boîte relevée).
4. **Quel compte exact `SMTP_USER` ouvre la relève** (adresse littérale de la boîte) : dépend des variables d'environnement `.env` (`SMTP_USER`, `IMAP_HOST`), non lues dans ce run de RECON. Le code prouve *quelle variable* est utilisée, pas sa *valeur*.

---

*Fin du rapport. Aucune écriture hors ce fichier ; aucun `veille:run` ni commande de relève/envoi n'a été exécuté.*
