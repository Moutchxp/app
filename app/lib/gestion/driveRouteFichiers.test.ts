import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT REDACTION-GMAIL — LA ROUTE QUI LIT DES FICHIERS DU DRIVE, ÉPROUVÉE SUR SON SOURCE.
 *
 * POURQUOI SUR LE SOURCE, et pas en l'exécutant. Ce qu'on veut garantir est une NON-ACTION : « cette route n'écrit
 * jamais dans le Drive », « elle ne lit jamais le contenu d'un fichier sous “Documents clients scannés” ». Constater
 * une non-action en l'exécutant demanderait un vrai Drive et une attente infinie — on ne prouve pas une absence par
 * un essai. On la lit donc dans le code, comme le dépôt le fait déjà pour « ce dépôt ne fait QUE lire »
 * (`boiteRepo.test.ts`) et pour la commande de vidage.
 *
 * ⚠️ SUR LES LIGNES DE CODE SEULEMENT : les encadrés CITENT `files.create` et « Documents clients scannés » pour dire
 * qu'on ne s'en sert pas. Une assertion sur la prose rougirait pour une bonne explication.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CHEMIN = 'app/(admin)/api/admin/gestion/drive/fichiers/route.ts';

/** Le code SEUL, commentaires retirés. */
function code(chemin = CHEMIN): string {
  return readFileSync(chemin, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim()))
    .join('\n');
}

describe('🔴🔴 la route des fichiers Drive n’écrit JAMAIS dans le Drive', () => {
  it('aucune création, modification, suppression ni partage', () => {
    const c = code();
    expect(/files\.create|files\.update|files\.delete|permissions\.create|deposerFichier|API_TELEVERSEMENT/.test(c))
      .toBe(false);
  });

  it('aucune méthode HTTP d’écriture n’est posée', () => {
    expect(/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(code())).toBe(false);
  });

  /** Elle n'expose QU'UN verbe : `GET`. Un `POST` exporté ici serait une porte ouverte sans raison. */
  it('elle n’expose que GET', () => {
    const c = code();
    expect(c).toContain('export async function GET');
    expect(/export async function (POST|PUT|PATCH|DELETE)/.test(c)).toBe(false);
  });
});

describe('🔴🔴 le garde-fou est posé AVANT toute lecture de contenu', () => {
  /**
   * 🔴 L'ORDRE EST LA GARANTIE. Télécharger d'abord et vérifier ensuite reviendrait à lire un fichier qu'on n'avait
   * pas le droit de lire — le mal serait fait, même si l'on jetait ensuite les octets.
   */
  it('🔴 le verdict est demandé AVANT `lireContenuFichier`', () => {
    const c = code();
    expect(c.indexOf('verdict(')).toBeLessThan(c.indexOf('lireContenuFichier('));
  });

  /**
   * ⚠️ LA RÈGLE A DÉMÉNAGÉ AU LOT ENVOI-ARRIERE-PLAN, elle n'a pas disparu. Deux routes la prononcent désormais
   * (celle-ci, et celle qui inscrit une pièce dans un brouillon) : la garder en deux copies était le vrai danger —
   * le jour où elles divergent, c'est un avis d'imposition qui part chez un artisan. Le test suit donc la règle
   * jusqu'à son unique domicile, `driveVerdict.ts`, au lieu de figer l'endroit où elle se trouvait.
   */
  it('🔴 et il vient du module PARTAGÉ, qui remonte bien la chaîne des parents', () => {
    expect(code()).toContain('verdictJoindre');
    const partage = code('app/lib/gestion/driveVerdict.ts');
    expect(partage).toContain('chaineParents');
    expect(partage).toContain('peutJoindre');
  });

  /** 🔴🔴 LES DEUX ROUTES APPELLENT LA MÊME FONCTION : c'est ce qui garantit qu'il n'y a qu'une seule règle. */
  it('🔴🔴 la route qui INSCRIT une pièce prononce le MÊME verdict, avant d’inscrire quoi que ce soit', () => {
    const c = code('app/(admin)/api/admin/gestion/brouillons/[id]/pieces/route.ts');
    expect(c).toContain('verdictJoindre');
    expect(c.indexOf('verdictJoindre(')).toBeLessThan(c.indexOf('inscrirePieceDrive('));
  });

  it('le refus est explicite, et rendu en 403', () => {
    const c = code();
    expect(c).toMatch(/etat:\s*'refus'/);
    expect(c).toContain('403');
  });

  /** ⚠️ Le verdict vient d'un module PUR, sans réseau : c'est ce qui permet de l'éprouver exhaustivement. */
  it('la règle vient du module PUR, elle n’est pas réécrite', () => {
    expect(readFileSync('app/lib/gestion/driveVerdict.ts', 'utf8'))
      .toContain("from './driveLectureFichier'");
    // 🔴 Le nom du dossier interdit n'est recopié dans AUCUNE des deux routes : une seconde copie divergerait.
    expect(code()).not.toContain('Documents clients scannés');
    expect(code('app/(admin)/api/admin/gestion/brouillons/[id]/pieces/route.ts'))
      .not.toContain('Documents clients scannés');
  });
});

describe('les autres garanties de la route', () => {
  it('le droit `gestion` est relu à chaque appel', () => {
    expect(code()).toContain("exigerCompteActif(request, 'gestion')");
  });

  /** 🔒 Le jeton est obtenu par DÉLÉGATION pour la personne connectée : Google applique SES droits. */
  it('le jeton vient de la délégation, et ne sort pas de la route', () => {
    const c = code();
    expect(c).toContain('jetonPourRequete');
    /**
     * ⚠️ ON CHERCHE LA VALEUR DU JETON (`jeton.jeton`), PAS LE MOT « jeton ». La route rend légitimement
     * `jeton.motif` — le message qui explique pourquoi le Drive est indisponible. Une assertion sur le simple mot
     * rougissait pour cette bonne raison ; c'est la VALEUR qui ne doit jamais sortir.
     */
    for (const ligne of c.split('\n')) {
      if (/\bjson\(|Response\.json\(/.test(ligne)) expect(ligne, ligne.trim()).not.toContain('jeton.jeton');
    }
    // Et le jeton ne part que dans un en-tête d'autorisation, jamais dans un corps de réponse.
    expect(c).not.toMatch(/corps[^\n]*jeton\.jeton/);
  });

  it('les réponses ne se mettent en cache nulle part', () => {
    expect(code()).toContain("'private, no-store'");
  });

  /** Un document Google natif n'a pas d'octets : on le DIT plutôt que de joindre un fichier vide. */
  it('un document Google natif est refusé avec une explication', () => {
    expect(code()).toContain('application/vnd.google-apps');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT EDITEUR-PJ — LA RECHERCHE PAR NOM, ET L'HISTORIQUE « RÉCENTS ».
 *
 * Deux ajouts qui touchent au Drive, et deux garanties à tenir :
 *   ① LA RECHERCHE NE CRÉE AUCUNE PORTE. Elle LIT des noms dans tout le Drive — comme la navigation, qui laisse
 *      déjà voir le contenu de « Documents clients scannés ». Le refus, lui, reste prononcé au même endroit :
 *      sur le FICHIER, avant de lire ses octets. Ce test vérifie que la recherche est bien AVANT ce contrôle dans
 *      le flux, et qu'elle n'y touche pas.
 *   ② L'HISTORIQUE N'ÉCRIT RIEN DANS LE DRIVE. Il vit dans notre base. Un test statique, parce que ce qu'on veut
 *      garantir est une NON-ACTION.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 la recherche par nom ne déplace aucune barrière', () => {
  it('elle n’utilise qu’une lecture : `chercherFichiers`, jamais une écriture', () => {
    const c = code();
    expect(c).toContain('chercherFichiers');
    expect(/files\.create|files\.update|files\.delete|permissions\.create/.test(c)).toBe(false);
  });

  /**
   * 🔴 L'ORDRE EST LA GARANTIE. La branche de recherche rend la liste et SORT ; elle ne peut donc pas atteindre
   * la lecture de contenu. Celle-ci reste gardée par `verdict(` comme avant — c'est déjà vérifié plus haut.
   */
  it('🔴 la branche de recherche ne lit JAMAIS le contenu d’un fichier', () => {
    const c = code();
    const debut = c.indexOf("recherche !== ''");
    const fin = c.indexOf('const meta = await lireMetadonnees');
    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    expect(c.slice(debut, fin)).not.toContain('lireContenuFichier');
  });

  /** La requête Google échappe le terme : une apostrophe dans un nom ne doit pas en changer le sens. */
  it('le terme cherché est échappé avant d’entrer dans la requête Google', () => {
    const drive = readFileSync('app/lib/gestion/drive.ts', 'utf8');
    const bloc = drive.slice(drive.indexOf('export async function chercherFichiers'));
    expect(bloc.slice(0, 1400)).toContain('echapperQ(terme)');
  });
});

describe('🔴🔴 l’historique « Récents » n’écrit rien dans le Drive', () => {
  it('sa route ne parle jamais à Google', () => {
    const c = code('app/(admin)/api/admin/gestion/pieces-recentes/route.ts');
    expect(/googleapis|drive\.google|jetonPourRequete|files\.list/.test(c)).toBe(false);
    expect(/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(c)).toBe(false);
    expect(c).toContain('export async function GET');
    expect(/export async function (POST|PUT|PATCH|DELETE)/.test(c)).toBe(false);
  });

  /** 🔒 Le compte vient de la SESSION, jamais d'un paramètre : l'historique d'autrui ne se demande pas. */
  it('🔒 le compte est lu dans la session, pas dans la requête', () => {
    const c = code('app/(admin)/api/admin/gestion/pieces-recentes/route.ts');
    expect(c).toContain('auteurDeLaRequete(request)');
    expect(c).not.toMatch(/searchParams\.get\(\s*'compte/);
  });
});

/**
 * 🔴 LE SÉLECTEUR À L'ÉCRAN N'EST PAS LA BARRIÈRE — mais il doit tout de même EXPLIQUER, et ne pas offrir un bouton
 * que la route refusera. Un bouton qui échoue au clic apprend à ignorer les refus.
 */
describe('🔴 l’écran n’offre pas « Joindre » là où la route refusera', () => {
  const ECRAN = 'app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx';

  it('« Joindre » est conditionné au verdict rendu par le serveur', () => {
    expect(code(ECRAN)).toContain('joindreAutorise &&');
  });

  it('…et le motif du refus est AFFICHÉ, pas seulement subi', () => {
    expect(code(ECRAN)).toContain('motifRefus');
  });

  /** « Insérer un lien » reste proposé PARTOUT : il ne lit rien, c'est toute la raison de son existence. */
  it('« Insérer un lien » n’est jamais conditionné', () => {
    const c = code(ECRAN);
    const i = c.indexOf('Insérer un lien');
    expect(i).toBeGreaterThan(0);
    // La ligne qui le rend ne dépend d'aucun verdict : on lit les 200 caractères qui la précèdent.
    expect(c.slice(Math.max(0, i - 200), i)).not.toContain('joindreAutorise');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — CE QUE LA ROUTE DES FICHIERS DIT DÉSORMAIS DE LA CRÉATION.
 *
 * Elle ne crée rien : elle dit seulement si l'on POURRAIT créer dans le dossier qu'elle affiche. Deux propriétés
 * comptent, et aucune n'est vérifiable en l'exécutant sans un vrai Drive.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 le droit de créer voyage AVEC le contenu du dossier', () => {
  /**
   * 🔴 RÈGLE TIRÉE D'UN DÉFAUT DE CE MODULE (lot COULEUR-ROUGE, 28/09/2026) : une sonde de schéma voyage avec la
   * donnée qu'elle conditionne, dans la MÊME réponse. Un appel séparé arrive plus tard, parfois jamais, et l'écran
   * prend alors sa valeur par défaut — ce jour-là, un `false` par défaut avait fait disparaître une fonction
   * pourtant en place, sans qu'aucune erreur ne s'affiche.
   */
  it('la sonde de la migration 272 est rendue dans la même réponse que les fichiers', () => {
    const c = code();
    expect(c).toContain('journalDossierDriveDisponible()');
    expect(c).toContain('journalDisponible');
    expect(c).toContain('creerAutorise');
  });

  /** ⚠️ La route continue de n'exposer que GET : dire qu'on pourrait créer n'est pas créer. */
  it('…et elle n’a toujours AUCUN verbe d’écriture', () => {
    expect(/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(code())).toBe(false);
    expect(/export async function (POST|PUT|PATCH|DELETE)/.test(code())).toBe(false);
  });

  /**
   * 🔴🔴 « LE BOUTON N'Y EST PAS AFFICHÉ » — demande d'Arno, mot pour mot, pour « Documents clients scannés ». Le
   * motif n'est donc renseigné QUE si la règle aurait permis de créer : sous l'archive, `creer` est faux et le
   * motif reste nul, donc l'écran n'affiche rien du tout. Un bouton grisé y laisserait croire qu'un réglage
   * pourrait un jour l'activer, alors que c'est une règle.
   */
  it('🔴🔴 le motif n’est donné que si la RÈGLE aurait permis de créer', () => {
    expect(code()).toContain('!journalDisponible && c.creer ? MOTIF_SANS_JOURNAL : null');
  });

  /** Une seule remontée de la chaîne des parents pour les deux verdicts : treize `files.get`, pas vingt-six. */
  it('les deux verdicts sont obtenus d’UNE SEULE remontée des parents', () => {
    const c = code();
    expect(c).toContain('verdictsDossier(');
    const partage = code('app/lib/gestion/driveVerdict.ts');
    expect(partage).toContain('peutCreerDossier');
    // Dans `verdictsDossier`, la chaîne n'est lue qu'une fois.
    /**
     * ⚠️ LOT APERCU-RAPIDE — LA REMONTÉE PASSE PAR LA MÉMOIRE COURTE (`chaineDuDossierMemo`), qui appelle
     * `chaineParents` pour son compte. La propriété protégée n'a pas changé : UNE SEULE remontée pour les deux
     * verdicts. Elle se lit désormais sur l'appel mémoïsé, qui est le seul chemin vers le réseau.
     *
     * ⚠️ BORNE RÉÉCRITE LE 29/09/2026 (lot DRIVE-DEPLACER). Cette découpe allait de `verdictsDossier` à la FIN DU
     * FICHIER — ce qui marchait tant que cette fonction était la dernière. `idsProteges`, ajoutée après elle,
     * remonte LÉGITIMEMENT une chaîne de parents pour situer l'archive, et faisait échouer un test qui ne parlait
     * pas d'elle. On borne donc à CE QUE LA PROPRIÉTÉ VISE : le corps de `verdictsDossier`, et rien de plus.
     */
    const debut = partage.indexOf('export async function verdictsDossier');
    const suite = partage.indexOf('\nexport ', debut + 1);
    const bloc = partage.slice(debut, suite === -1 ? undefined : suite);
    expect(bloc).toContain('verdictsDossier');
    expect(bloc.match(/chaineDuDossierMemo\(/g) ?? []).toHaveLength(1);
    expect(bloc).not.toContain('chaineParents(');
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT RANGER-ARBRE-2 — LE CHEMIN DU DOSSIER VOYAGE AVEC SON CONTENU
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴 MÊME RÈGLE QUE LA SONDE CI-DESSUS, ET POUR LA MÊME RAISON : ce qui conditionne l'affichage voyage avec la
   * donnée qu'il conditionne. Le chemin complet arrive DANS la réponse du listage — un appel séparé arriverait
   * plus tard, et le fil d'Ariane afficherait entre-temps un chemin faux.
   *
   * ⚠️ ET IL NE COÛTE RIEN : c'est la chaîne que `verdictsDossier` remontait DÉJÀ, et qu'elle jetait.
   */
  it('🔴 le chemin complet du dossier est rendu avec son contenu', () => {
    const c = code();
    expect(c).toContain('chaine');
    const partage = code('app/lib/gestion/driveVerdict.ts');
    expect(partage).toContain('chaine: await nommerLaRacine(');
  });

  /**
   * ══ 🔴🔴 « Drive » N'EST LE NOM DE RIEN — DÉFAUT MESURÉ LE 30/09/2026 SUR LE VRAI DRIVE ════════════════════
   *
   * Relevé, sur le Drive du cabinet :
   *     files.get(0AMcTtmCenCqoUk9PVA) → { name: "Drive" }            ← ce que voit la chaîne des parents
   *     drives.get(0AMcTtmCenCqoUk9PVA) → { name: "GESTION LOCATIVE" } ← le nom que tout le monde lit
   *
   * C'est la seconde moitié du constat d'Arno (« affiche “Google Drive › Drive” »), et c'était un piège pour ce
   * lot même : rendre la chaîne telle quelle aurait remplacé, dans le fil d'Ariane, « GESTION LOCATIVE » par
   * « Drive » — donc AGGRAVÉ ce qu'on venait corriger. Attrapé sur le vrai Drive, pas au test.
   *
   * ⚠️ LE SURCOÛT EST BORNÉ : l'appel n'est posé que si la tête de chaîne porte le nom générique, et son
   * résultat est mémorisé une heure (`nomDuDriveMemo`) — le nom d'un Drive d'équipe ne change pas deux fois par an.
   */
  it('🔴 la racine d’un Drive partagé est renommée avec son VRAI nom, et l’appel est mémorisé', () => {
    const partage = code('app/lib/gestion/driveVerdict.ts');
    /* ⚠️ RECADRÉ PAR LE LOT RENOMMER-PARTOUT-ET-FINITIONS : le mot générique ne vit plus ici, il vient de
       `drive.ts` — TROIS endroits en dépendent désormais (ce fil d'Ariane, la liste de la corbeille, et le nom
       de dossier que le nettoyage des fantômes écrit au registre). Trois copies auraient divergé, et la
       troisième, écrite en base, faisait afficher « Drive » dans le menu des emplacements d'une pièce. */
    expect(partage).toContain('NOM_GENERIQUE_RACINE_DRIVE');
    expect(code('app/lib/gestion/drive.ts')).toContain("export const NOM_GENERIQUE_RACINE_DRIVE = 'Drive';");
    expect(partage).toContain('nomDuDriveMemo(');
    // ⚠️ SEULEMENT POUR UNE TÊTE DE CHAÎNE GÉNÉRIQUE : un chemin dans « Mon Drive » ne déclenche aucun appel.
    expect(partage).toContain('tete.nom !== NOM_GENERIQUE_RACINE_DRIVE) return chaine');
    // 🔒 ET C'EST UNE LECTURE : `drives.get` avec le seul champ `name`.
    expect(code('app/lib/gestion/drive.ts')).toContain('?fields=name');
  });
});

describe('🔴 l’écran n’offre pas « Visualiser » là où la route refusera', () => {
  const ECRAN = 'app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx';

  /**
   * 🔴🔴 VISUALISER EST UNE LECTURE DE CONTENU. Afficher un avis d'imposition à l'écran, c'est le lire : le geste
   * tombe donc sous la même règle que « Joindre », et sous le même verdict — pas sous une variante.
   */
  /**
   * ⚠️ ASSERTION RÉÉCRITE LE 29/09/2026 (lot DRIVE-FACON-FINDER), et elle en sort plus forte.
   *
   * Elle cherchait le mot `joindreAutorise` dans les 900 caractères précédant le dernier « Visualiser » — une
   * PROXIMITÉ dans le texte, donc une mesure de mise en page autant que de logique. Le verdict est désormais lu
   * une fois, dans une constante nommée, et « Visualiser » s'atteint par CINQ chemins (le bouton de ligne, le
   * double-clic, la barre d'espace, la touche Entrée, le menu contextuel). Compter des caractères ne dit plus rien.
   *
   * 🔴 CE QU'ON VÉRIFIE MAINTENANT : il n'existe QU'UNE porte (`visualiser`), elle refuse d'elle-même quand le
   * verdict est négatif, et AUCUN appel ne lui passe autre chose que ce verdict. Un sixième chemin qu'on ajouterait
   * sans le verdict ferait échouer ce test.
   */
  it('🔴🔴 « Visualiser » passe par UNE porte, et cette porte porte le MÊME verdict que « Joindre »', () => {
    const c = code(ECRAN);
    // ① Le verdict est lu une fois, à la source, et il vient de la route.
    expect(c).toContain('const joindreOk = listing?.joindreAutorise === true;');
    /* ② LA PORTE REFUSE D'ELLE-MÊME : c'est elle, et pas l'appelant, qui tient la règle.
       ⚠️ ASSERTION RÉÉCRITE LE 29/09/2026 (lot DRIVE-DEPLACER) : le garde tenait en une ligne
       (`if (!autorise || f.dossier) return;`) et il en fait deux, parce qu'un troisième refus s'est intercalé
       entre elles — le fichier « ._ » de macOS, qui doit se DIRE (il renvoie au vrai fichier) là où les deux
       autres se taisent. La propriété protégée est la même : sans verdict, la porte ne s'ouvre pas. */
    expect(c).toContain('if (!autorise) return;');
    expect(c).toContain('if (f.dossier) return;');
    // ③ Et aucun appel ne lui passe autre chose que ce verdict — ou une version PLUS STRICTE de ce verdict.
    const appels = c.match(/visualiser\([^)]*\)/g) ?? [];
    expect(appels.length).toBeGreaterThan(2);
    for (const a of appels) {
      if (a.startsWith('visualiser(f,')) {
        expect(a).toMatch(/visualiser\(f, (joindreOk|lisible|listing\?\.joindreAutorise === true)\)/);
      }
    }
    /* 🔴 ET `lisible` EST BIEN UNE RESTRICTION DE `joindreOk`, jamais un verdict parallèle : si quelqu'un lui
       donnait une autre source, « Visualiser » s'ouvrirait là où la route refuse. */
    expect(c).toContain('const lisible = joindreOk && !systeme;');
  });

  /** Et la route de l'aperçu prononce le verdict elle-même : l'écran explique, le serveur protège. */
  /**
   * ⚠️ LOT APERCU-RAPIDE — LE VERDICT A CHANGÉ DE NOM, PAS DE NATURE. `verdictJoindreFichier` remonte la MÊME
   * chaîne (le fichier, puis les ancêtres de son dossier) et la soumet au MÊME module pur ; il rend en plus les
   * métadonnées, qu'il venait de lire pour connaître le parent. La propriété protégée est intacte : le refus est
   * prononcé AVANT qu'un seul octet de contenu ne soit demandé — flux, export et vignette compris.
   */
  it('…et la route de l’aperçu le prononce aussi, sur la chaîne des parents', () => {
    const c = code('app/(admin)/api/admin/gestion/drive/apercu/route.ts');
    expect(c).toContain('verdictJoindreFichier(');
    const partage = code('app/lib/gestion/driveVerdict.ts');
    expect(partage).toContain('peutJoindre');
    // Le refus vient AVANT toute lecture de contenu — les trois portes en sont en aval.
    const iVerdict = c.indexOf('verdictJoindreFichier(');
    for (const apres of ['ouvrirFluxFichier(', 'ouvrirFluxExportPdf(', 'ouvrirFluxVignette(']) {
      expect(iVerdict, apres).toBeLessThan(c.indexOf(apres));
    }
  });

  /**
   * 🔴🔴 LE TYPE SERVI EST LE NÔTRE. Le contenu sort sur notre origine, dans un cadre de notre page : un `.html`
   * rangé dans le Drive s'exécuterait avec nos cookies de session. L'en-tête porte donc la valeur de la LISTE
   * BLANCHE, jamais celle que le fichier prétend avoir.
   */
  it('🔴🔴 l’aperçu ne sert JAMAIS le type déclaré par le fichier', () => {
    const c = code('app/(admin)/api/admin/gestion/drive/apercu/route.ts');
    expect(c).toContain("'Content-Type': type");
    expect(c).toContain('typeServi(');
    // Le type du fichier n'est jamais recopié dans l'en-tête.
    expect(c).not.toMatch(/'Content-Type':\s*meta\.valeur\.typeMime/);
  });
});
