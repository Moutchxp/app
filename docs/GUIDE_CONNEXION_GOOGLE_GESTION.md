# Connecter l'application à la boîte `gestion@criterimmo.fr`

**Pour qui :** Arno. Aucune connaissance technique requise.
**Combien de temps :** 15 à 25 minutes la première fois.
**À faire une seule fois.** Ensuite, l'application se débrouille seule.

---

## Ce qu'on est en train de faire, en une phrase

On donne à l'application **la permission d'agir au nom de la boîte `gestion@criterimmo.fr`** : envoyer des
mails, lire la signature configurée dans Gmail, et accéder au Drive partagé. C'est **vous** qui donnez cette
permission, en cliquant « Autoriser » dans une fenêtre Google. Personne d'autre ne peut le faire à votre place.

**Trois permissions, pas une de plus :**

| Permission | À quoi elle sert |
|---|---|
| Lire, modifier et envoyer des mails | Répondre et transférer ; mettre une **étoile**, marquer **non lu**, signaler un **spam**, retrouver l'**original** d'un message — le tout dans la vraie boîte |
| Lire les paramètres Gmail | Récupérer **votre signature**, et créer le filtre de **blocage** d'un expéditeur |
| Google Drive | Ouvrir les pièces jointes, les enregistrer, en joindre depuis le Drive |

> 🔴 **CE QUE L'APPLICATION NE PEUT PAS FAIRE, ET C'EST VOULU : supprimer définitivement un mail.**
> Google réserve cela à une permission « accès total » que nous **ne demandons pas**. Tout ce que l'outil
> fait à votre boîte se **défait depuis Gmail** : une étoile se retire, un libellé s'enlève, un filtre se
> supprime. Aucun geste de l'application ne peut effacer un message pour de bon.

---

# PARTIE 1 — Dans la console Google (le site d'administration)

Ouvrez **Chrome**, et vérifiez en haut à droite que vous êtes bien connecté avec **`gestion@criterimmo.fr`**
(ou avec votre compte administrateur du domaine `criterimmo.fr`).

## Étape 1.1 — Activer les deux interfaces

1. Allez sur **https://console.cloud.google.com**
2. En haut, à gauche, il y a un **sélecteur de projet**. Choisissez le projet déjà utilisé pour le Drive
   (il existe : l'application s'en sert déjà). Si vous ne savez pas lequel c'est, prenez celui dont le nom
   ressemble à « Criterimmo » ou « Sans Vis-à-Vis ».
3. Dans le menu de gauche : **API et services → Bibliothèque**
4. Cherchez **« Gmail API »** → cliquez dessus → bouton **ACTIVER**
   *(si le bouton dit déjà « GÉRER », c'est qu'elle est activée : parfait, ne touchez à rien)*
5. Cherchez **« Google Drive API »** → même chose

> **Ce que vous devez voir :** les deux interfaces marquées **« API activée »**.

## Étape 1.2 — L'écran de consentement : « Interne » ou « Externe » ?

Menu de gauche : **API et services → Écran de consentement OAuth**.

Regardez le **type d'utilisateur** affiché en haut :

### ✅ Si c'est « Interne »

C'est le bon réglage, il n'y a **rien à faire**. Passez à l'étape 1.3.
*(« Interne » veut dire : seuls les comptes `@criterimmo.fr` peuvent autoriser cette application. C'est plus
sûr, et surtout l'autorisation **ne périme jamais**.)*

### ⚠️ Si c'est « Externe »

Regardez juste en dessous le **statut de publication** :

- **« En production »** → c'est bon, passez à l'étape 1.3.
- **« Test »** → 🔴 **ARRÊTEZ-VOUS SUR CE POINT.** C'est le piège le plus fréquent, et il est silencieux :
  en mode « Test », **l'autorisation cesse de fonctionner au bout de 7 jours**, sans prévenir. Un beau matin
  les mails ne partent plus, et rien à l'écran ne dit pourquoi.

  **Deux façons de l'éviter, au choix :**

  **(a) La meilleure — repasser en « Interne ».** Sur cette même page, s'il y a un bouton
  **« PASSER AU TYPE INTERNE »** (ou « MAKE INTERNAL »), cliquez-le. C'est possible parce que
  `criterimmo.fr` est un domaine Google Workspace. Pour une application « Interne », **rien n'est à valider
  par Google**, et l'autorisation est permanente.

  **(b) Sinon — publier l'application.** Bouton **« PUBLIER L'APPLICATION »**, puis confirmez.
  Le statut doit passer à **« En production »**. Google peut afficher un avertissement sur une éventuelle
  validation : tant que l'application n'est utilisée que par des comptes du domaine, cela ne bloque rien.

> **Ce que vous devez voir avant de continuer :** soit **Interne**, soit **Externe + En production**.
> Jamais **Externe + Test**.

## Étape 1.3 — Ajouter les trois permissions à l'écran de consentement

Toujours sur **Écran de consentement OAuth**, section **« Champs d'application »** (ou « Scopes ») →
bouton **MODIFIER** ou **AJOUTER OU SUPPRIMER DES CHAMPS D'APPLICATION**.

Dans la zone de recherche, collez ces trois lignes **une par une**, et cochez la case de chacune :

```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.settings.basic
https://www.googleapis.com/auth/drive
```

> ⚠️ Si vous aviez déjà ajouté `gmail.send` lors d'une première tentative, **remplacez-la** par
> `gmail.modify` (retirez l'ancienne). `gmail.modify` fait tout ce que faisait `gmail.send`, **et** permet
> d'agir sur les messages. Elle ne permet toujours pas la suppression définitive.

Puis **METTRE À JOUR**, puis **ENREGISTRER**.

> **Ce que vous devez voir :** les trois lignes dans la liste des champs d'application.
> *(Si le Drive y était déjà en « lecture seule », laissez-le : les deux peuvent coexister.)*

## Étape 1.4 — L'identifiant du client : rien à faire, normalement

Menu de gauche : **API et services → Identifiants**. Vous devez voir un **ID client OAuth 2.0** de type
**« Application de bureau »** — c'est celui qui sert déjà pour le Drive. **On le réutilise : ne créez rien.**

> Si vous n'en voyez aucun : **CRÉER DES IDENTIFIANTS → ID client OAuth → Application de bureau**,
> nom libre (« Criterimmo Gestion »). Notez l'**identifiant** et le **secret**, et dites-le-moi : il faudra
> les ranger dans la configuration. **Ne les envoyez jamais par messagerie ordinaire.**

---

# PARTIE 2 — Sur votre Mac (deux commandes à coller)

## Comment ouvrir le Terminal

1. Appuyez sur **Cmd + Espace** (la touche Commande et la barre d'espace ensemble)
2. Tapez **Terminal**
3. Appuyez sur **Entrée**

Une fenêtre noire ou blanche s'ouvre avec du texte. C'est normal.

> **Besoin d'une deuxième fenêtre ?** **Cmd + N** en ouvre une nouvelle.
> **Pour vérifier que vous êtes au bon endroit**, collez ceci et appuyez sur Entrée :
> ```
> whoami
> ```
> Il doit répondre `macbookprom4arnaud`.

**Pour coller :** Cmd + V. **Pour valider :** Entrée. Une commande = un bloc = un Entrée.

---

## Étape 2.1 — Donner l'autorisation

Collez ce bloc **en entier** (les deux lignes), puis Entrée :

```
cd /Users/macbookprom4arnaud/sansvisavis/app
npm run gestion:google:autoriser
```

**Ce qui se passe ensuite, dans l'ordre :**

1. Le Terminal affiche la liste des **trois permissions demandées**. Vérifiez qu'il n'y a que celles-là.
2. Il affiche une **longue adresse** commençant par `https://accounts.google.com/...`
3. **Sélectionnez cette adresse avec la souris, copiez-la (Cmd + C), collez-la dans Chrome (Cmd + V), Entrée.**
   *(Sur certains Macs, Cmd + clic sur l'adresse l'ouvre directement.)*
4. Google vous demande **quel compte utiliser**.
   🔴 **Choisissez `gestion@criterimmo.fr`.** Si vous ne le voyez pas dans la liste, cliquez sur
   **« Utiliser un autre compte »** et connectez-vous avec.
5. Google affiche ce que l'application demande : **lire, rédiger, envoyer et supprimer définitivement vos
   e-mails** — ⚠️ c'est la formule que Google emploie pour `gmail.modify`, et elle est **plus large que ce
   que l'application peut réellement faire** : la suppression définitive exige une AUTRE permission, que
   nous ne demandons pas. Puis **paramètres Gmail** et **Drive**.
   Cliquez **Continuer**, puis **Autoriser**.
   *(Si Google affiche « Google n'a pas validé cette application » : c'est normal pour une application
   maison. Cliquez sur « Paramètres avancés », puis sur « Accéder à … (non sécurisé) ».)*
6. La page affiche : **« Autorisation reçue. Vous pouvez fermer cet onglet et revenir au Terminal. »**
7. **Revenez au Terminal.**

**Ce que vous devez voir dans le Terminal :**

```
[gestion:google:autoriser] ✅ AUTORISATION ENREGISTRÉE.
[gestion:google:autoriser]    Compte  : gestion@criterimmo.fr
[gestion:google:autoriser]    Jeton   : présent (103 caractères, non affiché)
[gestion:google:autoriser]    Fichier : /Users/macbookprom4arnaud/.config/sansvisavis/google-gestion.json
```

> Le mot de passe de la boîte n'est **jamais** demandé, et la clé obtenue n'est **jamais affichée** : elle est
> rangée dans un fichier **hors du dossier du projet**, lisible par vous seul.

### 🔴 Si le Terminal affiche « REFUS — ce n'est pas la bonne boîte »

Vous avez autorisé avec un autre compte (votre compte personnel, par exemple). **Rien n'a été enregistré.**
Recommencez : relancez la commande, et à l'étape 4 choisissez bien **« Utiliser un autre compte »** →
`gestion@criterimmo.fr`.

---

## Étape 2.2 — Vérifier que tout répond

Collez ce bloc, puis Entrée :

```
cd /Users/macbookprom4arnaud/sansvisavis/app
npm run gestion:google:verifier
```

Cette commande **ne fait que regarder** : elle n'envoie aucun mail, ne crée aucun fichier, ne modifie rien.
Vous pouvez la relancer autant de fois que vous voulez.

**Ce que vous devez voir :**

```
[gestion:google:verifier] ① Compte connecté : gestion@criterimmo.fr (Gestion Criterimmo) ✅
[gestion:google:verifier] ② Signatures Gmail (1 adresse(s) d'envoi) :
[gestion:google:verifier]    · gestion@criterimmo.fr [par défaut] — « Service Gestion CRITERIMMO … »
[gestion:google:verifier] ③ Drive partagés visibles (noms seulement, aucun fichier listé) :
[gestion:google:verifier]    · Gestion locative
[gestion:google:verifier] ✅ Vérification terminée. Aucun envoi, aucune écriture, aucun fichier créé.
```

**Les trois lignes à lire :**

- **① le compte** doit être `gestion@criterimmo.fr` avec un ✅ ;
- **①bis un message lu** : la vérification lit un message de la boîte pour confirmer que la permission
  `gmail.modify` est bien accordée. Elle ne modifie rien ;
- **② la signature** doit afficher les premiers mots de **votre vraie signature Gmail**. Si elle dit
  « aucune signature configurée », c'est qu'il n'y en a pas dans Gmail (Paramètres → Signature) — ce n'est pas
  une panne, mais les mails partiront sans signature ;
- **③ le Drive** doit lister « Gestion locative » (ou le nom que vous lui avez donné). Si la liste est vide,
  c'est que `gestion@criterimmo.fr` n'est pas membre du Drive partagé — ajoutez-le sur `drive.google.com`.

---

# Si quelque chose ne marche pas

| Ce que le Terminal affiche | Ce que ça veut dire | Quoi faire |
|---|---|---|
| `Aucun identifiant de client OAuth trouvé` | La configuration ne connaît pas l'application Google | Étape 1.4, puis dites-le-moi : il faut ranger l'identifiant et le secret |
| `REFUS — ce n'est pas la bonne boîte` | Vous avez autorisé avec un autre compte | Relancez, choisissez `gestion@criterimmo.fr` |
| `Google n'a pas renvoyé de jeton de rafraîchissement` | Cette application a déjà été autorisée par ce compte | Allez sur **myaccount.google.com/permissions**, retirez l'accès de l'application, relancez |
| `Jeton refusé par Google` | L'autorisation a expiré (souvent : **Externe + Test**, 7 jours) | Refaites l'**étape 1.2**, puis relancez l'étape 2.1 |
| `Signatures illisibles (HTTP 403)` | La permission « paramètres Gmail » n'a pas été accordée | Refaites l'**étape 1.3**, puis l'étape 2.1 |
| `Lecture d'un message impossible (HTTP 403)` | La permission `gmail.modify` n'a pas été accordée (ou `gmail.send` est restée à sa place) | Refaites l'**étape 1.3** en remplaçant `gmail.send` par `gmail.modify`, puis l'étape 2.1 |
| `Drive partagés illisibles` ou liste vide | `gestion@` n'est pas membre du Drive partagé | Sur `drive.google.com`, ajoutez-le comme **Gestionnaire de contenu** |
| `Google a refusé : access_denied` | Vous avez cliqué « Annuler » | Relancez et cliquez « Autoriser » |
| Google refuse l'adresse de redirection | Le client OAuth n'accepte pas l'adresse locale | Le Terminal affiche l'adresse EXACTE à déclarer : copiez-la dans **Identifiants → votre client → URI de redirection autorisés** |

**Dans tous les cas, rien n'est cassé :** tant que l'autorisation n'a pas réussi, l'application continue de
fonctionner comme avant. Vous pouvez recommencer autant de fois que nécessaire.

---

# Ce qui se passe après

Une fois ces deux commandes passées, je peux écrire les lots suivants :

- **répondre / répondre à tous / transférer / nouveau message** au nom de `gestion@criterimmo.fr`,
  dans le bon fil Gmail, et visibles dans « Envoyés » ;
- **la signature Gmail** reprise automatiquement au bas des messages ;
- l'**étoile**, le **non lu**, le **spam**, le **blocage d'un expéditeur**, l'**original** d'un message et
  son **téléchargement** — tout cela agissant sur la vraie boîte, et défaisable depuis Gmail ;
- **les pièces jointes dans le Drive partagé** : les ouvrir, les y enregistrer, en joindre depuis le Drive.

**Rien de tout cela ne fonctionne tant que l'autorisation n'est pas donnée.** Ce guide la prépare.

---

# Pour révoquer, un jour

Si vous voulez retirer cette permission :

1. Allez sur **https://myaccount.google.com/permissions** (connecté en `gestion@criterimmo.fr`)
2. Trouvez l'application, cliquez **Supprimer l'accès**
3. Dans le Terminal, supprimez le fichier de la clé :
   ```
   rm ~/.config/sansvisavis/google-gestion.json
   ```

L'application redevient exactement ce qu'elle était avant.
