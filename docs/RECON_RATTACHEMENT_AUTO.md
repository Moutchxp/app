# Reconnaissance — le rattachement automatique des mails (13/10/2026)

> **Nature :** reconnaissance en LECTURE SEULE. Aucun code modifié, aucune écriture en base (toutes les mesures en
> `BEGIN TRANSACTION READ ONLY` puis `ROLLBACK`), aucune relève ni aucun moteur lancé. Vérification d'écran dans Chrome
> (port 3000) avec un pilote qui bloque toute écriture ; fenêtre fermée sans valider.
> **Période mesurée :** mails reçus des 3 derniers mois, hors spam, corbeille, exclusions et « courrier automatique ».

## Résumé

1. L'automate tourne **à chaque relève** (démon `com.sansvisavis.gestion-continu`, bouton « Relever maintenant ») : il reconnaît les adresses, puis examine chaque mail.
2. Il reconnaît une personne **uniquement par son e-mail exact** (De, À, Cc, Reply-To) dans l'annuaire WIPPIMMO et par les cartes de contact. Jamais par téléphone, signature ou nom (le nom ne sert qu'à proposer).
3. Il ne pose un **vrai rattachement** que s'il trouve **un seul bien certain** venant des adresses du mail ; sinon il **propose** (le mail reste « À classer »).
4. **R1 (locataire) et R2 (propriétaire à un bien) sont appliquées** : 266 / 292 mails de locataires et 185 / 219 mails de propriétaires à un bien sont rattachés seuls (badge « Auto »).
5. **R3 (propriétaire à plusieurs biens) est conforme** : le mail reste « À classer », et « Rattacher » propose tous ses biens, aucun coché (vérifié dans Chrome).
6. **R4 (suivi de fond automatique) est absent** : l'automate ne pose jamais de « Ce mail + futurs échanges ». Il ré-examine chaque mail ; seul un humain crée un suivi de fond.
7. Conséquence de R4 : sur 403 conversations rattachées par l'automate en 3 mois, **98** ont des mails suivants **non rattachés** au même bien (195 mails).
8. **17 mails** « À classer » auraient dû être rattachés selon R1/R2, pour **trois causes précises** : un ancien lien retiré qui bloque la réécriture (8), une carte de contact qui rétrograde le propriétaire à un bien (5), le propriétaire à plusieurs biens en copie d'un locataire (4).
9. Le premier défaut est plus large que R2 : **733 mails** (75 sur 3 mois) ont un examen « automatique » sans aucun rattachement réel.
10. Les cas que R1–R4 ne tranchent pas sont listés à la fin, avec une recommandation chacun.

---

## 1. L'automatisation actuelle

### 1.1 Où et quand

| Déclencheur | Fichier | Ce qu'il fait |
|---|---|---|
| **Chaque relève** (démon launchd `com.sansvisavis.gestion-continu`, bouton « Relever maintenant », `npm run gestion:relever -- --appliquer`) | `app/lib/gestion/releveReelle.ts:490-499` → `enchainerApresReleve` (`suiteReleveReel.ts:94-309`) | la chaîne ci-dessous, sur les nouveaux mails |
| Ouverture d'un mail (fenêtre de classement) | `api/admin/gestion/classement/route.ts:128` → `rafraichirAvantOuverture` (`rafraichirPropositions.ts:166`) | ré-examine la conversation **seulement** si une fiche a changé depuis le dernier calcul |
| Modification d'une fiche de contact | `rafraichirPourAdresses` / `rafraichirPourNoms` (`rafraichirPropositions.ts:84, 113`) | ré-examine les mails de ces adresses |
| Scripts à la demande | `scripts/proposer-rattachements.ts`, `recalculer-propositions-agence.ts`, `propositions-contenu.ts` | mêmes moteurs, lancés à la main — **aucun script de nuit** |
| Envoi d'un mail | — | **rien à l'envoi** : les biens cochés avant l'envoi sont appliqués à la relève suivante |

**Ordre de la chaîne après chaque relève** (`suiteReleveReel.ts`) :
1. avis de non-remise ;
2. biens cochés pendant la rédaction (rattachement **manuel** confirmé, `envoiCiblesRepo.ts:152-192`) ;
3. parties des destinataires de nos envois (adresses seulement) ;
4. « Interne » / « Hors gestion » demandés avant l'envoi ;
5. **héritage du suivi de fond** de la conversation, s'il existe (`heriterLesNouveauxMails`, `periodeRepo.ts:1163`) ;
6. **reconnaissance des adresses** (`releverPaquet`, `adressesRepo.ts:85-149`) ;
7. **moteur de rattachement** sur les conversations touchées (`examinerFilsPrecis` → `examinerLePaquet`, `rattachementRepo.ts:500-692`) ;
8. passe Monga.

### 1.2 Les règles du moteur, dans l'ordre (`propositionsBien.ts:365-657`)

Refus d'emblée : mail marqué **Interne** (`rattachement.ts:272`) et **documents que nous envoyons** (« Document CRITERIMMO », `rattachement.ts:295`).

Chaque règle regarde d'abord **les adresses du mail**, et seulement si le mail n'a rien donné, celles de **toute la conversation** (et dans ce cas rien n'est jamais posé d'office).

| Règle | Reconnaissance | Résultat |
|---|---|---|
| **(a)** locataire | e-mail d'un locataire **en place à la date du mail** sur **un seul** lot | bien **quasi certain**, pré-coché |
| **(f)** carte de contact | adresse portant une carte de contact sur un bien (`gestion_contact_carte`) | **à trancher**, non cochée |
| **(b)** propriétaire à un bien | e-mail d'un propriétaire qui n'a qu'**un** bien | bien **quasi certain**, pré-coché |
| **(c)** propriétaire à plusieurs biens | e-mail d'un propriétaire à N biens (ou locataire de plusieurs lots d'un même bailleur) | **tous** ses biens, à trancher, non cochés (sauf « lot N » cité dans le texte) |
| **(d)** texte | n° de lot cité (coché) ou adresse citée (non cochée, 5 au plus) — seulement si rien d'autre | proposition |
| **(e)** nom cité dans le texte | personne de l'annuaire nommée | proposition non cochée |
| **(g)** référence Monga citée | — | proposition non cochée |

**La décision « automatique »** (`propositionsBien.ts:633`) : *un seul bien proposé par les adresses (hors e et g), quasi certain, venant du mail lui-même* (pas de la conversation).

**Ce qui est écrit** (`ecrireLienMoteur`, `rattachementRepo.ts:368-410`) : une ligne `gestion_rattachement` `origine='automatique'`, `statut='confirme'` pour le bien certain, `statut='propose'` pour les autres candidats. Exception : un suivi de fond (« fenêtre ») qui couvre le mail sans contenir ce bien fait passer le bien certain en simple proposition (« la fenêtre gagne »).

### 1.3 « Auto », « Classé », « À classer »

Calculé par `capsuleDuMessage` (`statutClassement.ts:398-421`), SQL équivalent dans `boiteRepo.ts:594-606` :

- **seul un lien `confirme`** vers un bien, un propriétaire ou un locataire compte comme « rattaché » ; une proposition ne compte pas ;
- **« Auto »** = rattaché, et aucun de ses liens n'est manuel ni touché par un humain → **c'est un vrai rattachement**, posé par le moteur ;
- **« Classé »** = au moins un lien manuel ou validé par un humain. ⚠️ Les rattachements posés par **le suivi de fond**, par les **biens cochés avant l'envoi** et par **Monga** s'affichent aussi « Classé » ;
- **« À classer »** = aucun lien confirmé, ni Interne, ni Hors gestion. Les **propositions** (« N bien(s) proposé(s), à trancher ») laissent le mail « À classer ».

### 1.4 La portée appliquée par l'automate

- **L'automate travaille mail par mail, sans jamais créer de suivi de fond.** La glissière « One shot / Ce mail + futurs échanges / Toute la conversation » est un geste **humain** (`POST /api/admin/gestion/suivi` → `poserClassement`, `periodeRepo.ts:391-518`), et la base refuse un suivi créé par « automatique » (contrainte de `gestion_fil_periode`).
- **Les mails suivants d'une conversation** : si un suivi de fond existe, ils en héritent à la relève (étape 5 — rattachement manuel « posé par le suivi de la conversation », badge « Classé ») ; sinon chacun est examiné seul, par ses propres adresses.
- Mesuré : **23 803** suivis de fond vivants viennent de la « reprise des périodes » (passe unique d'il y a quelques jours), **19** ont été posés par Arno, **0** par l'automate.

### 1.5 Les cas particuliers

| Cas | Ce que fait l'automate |
|---|---|
| **Mails envoyés par nous** (« nous avons écrit ») | même moteur ; nos adresses sont exclues, les destinataires À/Cc/Cci servent de clé. « Document CRITERIMMO » : aucun candidat. ⚠️ trou possible : un envoi de l'application peut échapper à l'examen s'il est seul dans sa relève — **1 cas** mesuré sur 4 713 envois en 3 mois |
| **Ancien locataire** (aucun bail à la date du mail) | aucune proposition par l'adresse ; reste la carte de contact (f) ou le texte (d). Mesuré : **92 mails**, tous « À classer » |
| **Locataire de plusieurs biens** à la même date | aucun lot tranché ; si le bailleur est commun, tous ses biens proposés (c), non cochés |
| **Personne à la fois propriétaire et locataire** | **le propriétaire l'emporte** (`adressesMessage.ts:346-353`) : (b) ou (c) |
| **Propriétaire et locataire en copie** | si le propriétaire n'a qu'un bien et que c'est celui du locataire : « Auto ». S'il a plusieurs biens : (c) ajoute tous ses biens → « À classer », le bien du locataire pré-coché mais non confirmé |
| **Syndic** | **non utilisé** par le moteur : ni la fiche syndic, ni le carnet de l'immeuble, ni les rangements des PARTIES → seulement des propositions par le texte |
| **Adresse générique partagée** (prestataire, CAF…) | jamais de clé : absente des contacts propriétaire/locataire et sans carte possible. ⚠️ la garde `sertALAutomatisation` (`partieCategorie.ts`) **n'a aucun appelant** : la protection tient au modèle de données, pas à cette garde |
| **Conversation déjà suivie** | héritage du suivi ; un bien différent désigné par l'expéditeur reste proposé (« la fenêtre gagne ») ; un suivi « Interne » / « Hors gestion » transforme tout bien certain en proposition |
| **Mail marqué Interne** | refusé d'emblée (aucun candidat). Un rattachement humain lève la marque ; un rattachement Monga, non |

---

## 2. Comparaison aux règles d'Arno

| Règle | Ce que fait le code aujourd'hui | Verdict | Écart précis |
|---|---|---|---|
| **R1** — mail reçu d'un locataire actuel → rattaché à son bien | règle (a), rattachement réel « Auto » | **Partiel** (presque conforme) | 4 mails sur 292 restent « À classer » : quand le propriétaire **à plusieurs biens** est en copie, la règle (c) ajoute ses autres biens et le mail passe « à trancher », alors que le bien du locataire est pré-coché |
| **R2** — propriétaire à un seul bien → rattaché | règle (b), « Auto » | **Partiel** (presque conforme) | 13 mails sur 219 restent « À classer » : ① **un ancien lien du moteur retiré bloque la réécriture** (le moteur conclut « automatique », mais l'écriture ne crée pas de nouveau lien si une ligne retirée de même identité existe, et ne met à jour que les liens proposés ou confirmés) — 8 mails ; ② **une carte de contact (f), examinée avant (b), rétrograde la quasi-certitude** en « à trancher » (`ajouter` garde la première proposition d'un bien) — 5 mails |
| **R3** — propriétaire à plusieurs biens → « À classer », « Rattacher » propose tous ses biens | règle (c) ; fenêtre « Rattacher » = `contexteClassement` | **Conforme** | vérifié dans Chrome sur le mail 57991 (propriétaire des biens 121, 125 et 318) : les 3 biens proposés, aucun coché, « Sélectionner tous les biens », portée proposée « Ce mail + futurs échanges ». 95 de leurs 107 mails sont « À classer », comme voulu |
| **R4** — tout rattachement automatique en « Ce mail + futurs échanges » | l'automate rattache **ce mail seul** ; aucun suivi de fond n'est créé ; la base l'interdit même à un auteur « automatique » | **Absent** | sur 403 conversations rattachées par l'automate en 3 mois, **98** ont **195 mails suivants** non rattachés au même bien. Les mails suivants ne sont rattachés que si leurs propres adresses désignent le bien |

---

## 3. Mesures (lecture seule)

### 3.1 Mails reçus depuis 3 mois

1 785 mails reçus, dont 433 « courrier automatique » (exclus) → **1 352 mails humains**.

| État | Mails | Part |
|---|---:|---:|
| Rattaché par l'automate (badge **Auto**) | 554 | 41 % |
| Rattaché par le suivi de fond (badge Classé) | 53 | 4 % |
| Rattaché par un humain (badge Classé) | 21 | 2 % |
| **À classer, avec propositions** | 427 | 32 % |
| **À classer, sans proposition** | 297 | 22 % |

### 3.2 Par expéditeur (à la date du mail, propriétaire prioritaire comme dans le code)

| Expéditeur | Total | Auto | Classé (suivi) | Classé (humain) | À classer |
|---|---:|---:|---:|---:|---:|
| Locataire actuel (1 bien) | 292 | 266 | 22 | 0 | **4** |
| Locataire actuel (plusieurs biens) | 32 | 3 | 3 | 0 | 26 |
| Propriétaire à 1 bien | 219 | 185 | 15 | 6 | **13** |
| Propriétaire à plusieurs biens | 107 | 4 | 3 | 5 | 95 |
| Ancien locataire / sans bail à la date | 92 | 0 | 0 | 0 | 92 |
| Autres (syndic, prestataires, inconnus…) | 610 | 96 | 10 | 10 | 494 |

### 3.3 Mails « À classer » qui auraient dû être rattachés (R1 / R2) : **17**

- 4 de locataires actuels (examen « à trancher » : 2, 9 ou 12 biens proposés — le propriétaire à plusieurs biens est en copie) ;
- 13 de propriétaires à un bien : 8 avec un examen « automatique » mais un lien retiré qui bloque la réécriture, 5 « à trancher » à cause d'une carte de contact.

Cinq exemples :

| Id | Reçu | Expéditeur | Bien attendu | Cause |
|---|---|---|---|---|
| 58173 | 13/10/2026 11:48 | kharrat.12.ahmed@gmail.com (propriétaire à 1 bien) | 504 | carte de contact (f) avant la règle (b) → « 1 bien proposé, à trancher » |
| 57053 | 27/09/2026 19:21 | michaelfsexton@gmail.com (propriétaire à 1 bien) | 177 | examen « automatique », lien retiré le 28/09 qui bloque la réécriture |
| 661 | 18/09/2026 18:24 | jeandavid.bile@gmail.com (propriétaire à 1 bien) | 418 | même cause |
| 1549 | 26/08/2026 18:41 | o.georges@novaregroup.fr (locataire) | 474 | propriétaire à plusieurs biens en copie → 12 biens proposés |
| 4633 | 16/07/2026 17:18 | houda.ghannamsiad@gmail.com (locataire) | 189 | propriétaire à plusieurs biens en copie → 2 biens proposés |

**Ampleur du premier défaut (lien retiré qui bloque) sur toute la base :** 733 mails ont un examen « automatique » sans aucun rattachement confirmé (75 sur les 3 derniers mois), dont 732 portent un ancien lien du moteur retiré.

### 3.4 Propriétaires à plusieurs biens

- 274 propriétaires ont au moins un bien en gestion : **213** n'en ont qu'un, **61** en ont plusieurs (jusqu'à 6).
- R3 vérifié dans Chrome sur le mail **57991** (Igor ZYEMIT, biens 121, 125, 318) : fenêtre « Bien(s) rattaché(s) à ce mail », « 3 bien(s) proposé(s), à trancher », les trois biens listés avec propriétaire et locataire, **aucun coché**, « Sélectionner tous les biens » disponible, portée « Ce mail + futurs échanges » proposée. Fenêtre fermée par « × », sans valider ; le marquage « lu » a été bloqué par le pilote. Capture : `.captures/recon-rattachement/r3-fenetre-rattacher-proprietaire-3-biens.png`.

### 3.5 Écart à R4

Sur les 3 derniers mois : **403** conversations ont au moins un mail rattaché par l'automate à un bien ; **98** d'entre elles ont des mails **suivants** (reçus ou envoyés, hors courrier automatique) **non rattachés à ce bien** — **195 mails**.

---

## 4. Risques et questions pour Arno

| Cas que R1–R4 ne tranchent pas | Recommandation |
|---|---|
| **Personne locataire d'un bien ET propriétaire d'un autre** (aujourd'hui le propriétaire l'emporte) | Garder « propriétaire d'abord » et proposer aussi le bien du locataire, sans rattachement automatique. |
| **Ancien locataire qui écrit après son départ** (dépôt de garantie, régularisation) | Rattacher automatiquement à son dernier bien pendant 6 mois après sa sortie, puis seulement proposer. |
| **Locataire en copie d'un mail du propriétaire à plusieurs biens** (cause des 4 cas R1) | Laisser l'adresse du locataire trancher : rattacher automatiquement à son bien, et proposer les autres biens du propriétaire sans les cocher. |
| **Propriétaire à un bien qui a aussi une carte de contact** (cause des 5 cas R2) | Faire passer la règle « propriétaire à un seul bien » avant la carte de contact, comme celle du locataire. |
| **Ancien lien retiré qui bloque la réécriture** (cause des 8 cas R2, 733 mails au total) | Corriger l'écriture pour qu'un examen « automatique » rouvre ou recrée le lien ; mesurer d'abord pourquoi ces liens ont été retirés le 28/09 (passe « conversion règle bien »). |
| **R4 : suivi de fond automatique** — à quel moment le poser, et que faire si un mail suivant désigne un autre bien ? | Poser le suivi « Ce mail + futurs échanges » dès le premier rattachement automatique, et, si un mail suivant désigne un autre bien, le proposer sans changer le suivi (règle actuelle « la fenêtre gagne »). |
| **R4 et la contrainte de base** : un suivi « automatique » est aujourd'hui interdit (`cree_par_libelle` ≠ « automatique ») | Décider si l'automate peut signer un suivi (libellé dédié, ex. « suivi automatique ») ou si un humain doit le confirmer d'un clic. |
| **Locataire de deux biens à la même date** | Proposer les deux biens, sans rattachement automatique (comportement actuel). |
| **Syndic, carnet d'immeuble, rangements des PARTIES** : non utilisés par le moteur | Ne pas les utiliser pour rattacher automatiquement (un syndic gère tout un immeuble) ; les garder comme propositions. |
| **Garde `sertALAutomatisation` sans appelant** | La brancher dans le moteur, pour que la règle « un indépendant ne sert jamais à l'automatisation » soit tenue par le code et non par le seul modèle de données. |
| **Envoi de l'application qui échappe à l'examen** (1 cas) | Faire examiner aussi les envois dont les adresses ont été posées avant la relève. |
