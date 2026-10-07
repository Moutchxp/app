import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyserTerme } from '../../../../lib/gestion/annuaireRecherche';
import { motRoleSuggere } from '../../../../lib/gestion/suggestionAnnuaire';

/**
 * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — L'ÉCRAN `?ecran=annuaire`, RECONSTRUIT ══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (07/10/2026) : « l'écran Annuaire est à reconstruire, minimal, avec SEULEMENT :
 *   ① le titre de page “Annuaire”, au même niveau et dans le même style que “Gestion” sur l'écran partagé ;
 *   ② une seule phrase discrète d'explication, ajustée à ce que la recherche accepte réellement, sans rien
 *      promettre de faux ;
 *   ③ LE MÊME composant `BarreAnnuaire` que l'écran partagé (pas une copie), avec le focus sur le champ à
 *      l'ouverture de l'écran. »
 *
 * RETRAITS AUTORISÉS, SUR CET ÉCRAN SEULEMENT : le bouton « ← Retour », l'ancien libellé « Chercher un
 * propriétaire, un lot, un locataire » et son champ, la ligne d'aide « Tout est accepté : accents ou non… », et
 * l'encadré en pointillés « Tapez un nom, une adresse… L'annuaire répond par PERSONNE… ».
 *
 * 🔴 CE QUE CE FICHIER TIENT, ET QU'AUCUN AUTRE NE PEUT TENIR :
 *   · que la PHRASE NE MENT PAS — chaque porte d'entrée qu'elle promet est éprouvée sur le module de lecture du
 *     terme, pas sur une relecture de la phrase ;
 *   · que l'écran monte LE MÊME composant que l'écran partagé, et non une copie ;
 *   · que les quatre retraits sont faits, et RIEN DE PLUS — la branche d'une fiche est intacte.
 *
 * ⚠️ LE COMPORTEMENT DE LA BARRE (clic dehors, Échap, clic sur une suggestion, troncature, focus) est éprouvé
 * DANS UN DOM par `BarreAnnuaire.test.ts`. On ne le rejoue pas ici : deux épreuves de la même chose finissent par
 * se contredire.
 *
 * 🔒 Aucune base, aucun réseau, aucun DOM : ce fichier lit des sources et un module PUR.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CHEMIN = 'app/(admin)/admin/(protected)/gestion/Annuaire.tsx';
const SRC = readFileSync(CHEMIN, 'utf8');
/**
 * ⚠️ LE CODE SANS SES COMMENTAIRES. La convention de ce dépôt veut qu'un retrait LAISSE UN ENCADRÉ disant ce qui
 * vivait là et pourquoi c'est parti : les encadrés de ce lot citent donc le champ, la liste et la case disparus.
 * Un `not.toContain` sur le fichier entier serait tombé sur la trace écrite du retrait, et aurait obligé à
 * choisir entre la mémoire du lot et l'épreuve. On garde les deux.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const BARRE = readFileSync('app/(admin)/admin/(protected)/gestion/BarreAnnuaire.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const ENTETE = readFileSync('app/(admin)/admin/(protected)/_composants/EnTetePage.tsx', 'utf8');

/** L'état « aucune fiche ouverte », sans ses commentaires : c'est le seul que ce lot reconstruit. */
const SANS_FICHE = CODE.slice(CODE.indexOf('{fiche === null ? ('), CODE.indexOf('<div className="ann-entete">'));

describe('🔴🔴 ① le titre, au niveau de « Gestion »', () => {
  /**
   * 🔴🔴 « AU MÊME NIVEAU ET DANS LE MÊME STYLE » SE TIENT PAR LES MÊMES RÈGLES, jamais par une taille recopiée
   * à l'œil. `EnTetePage` est l'en-tête standard des pages d'administration — celui qui écrit « Gestion » sur
   * l'écran partagé. On exige donc de l'écran Annuaire la MÊME structure de classes, lue dans `EnTetePage`.
   *
   * ⚠️ POURQUOI ON NE RÉUTILISE PAS `EnTetePage` LUI-MÊME : cet écran est un état du CLIENT (il change sans
   * recharger la page), et l'en-tête de la page est rendu par un composant SERVEUR qui a déjà écrit « Gestion ».
   * C'est pourquoi `GestionVue` le masque sur cet écran — on ne peut pas lui faire changer de titre.
   */
  it('🔴🔴 ce sont les classes de l’en-tête standard, celles de « Gestion »', () => {
    for (const classe of ['svv-page-head', 'svv-page-head-ligne', 'svv-page-title', 'svv-page-sub']) {
      expect(ENTETE, classe).toContain(classe);
      expect(SANS_FICHE, classe).toContain(classe);
    }
    /* 🔴 ET C'EST UN `h1`, comme celui de la page : un `h2` l'aurait rangé SOUS un titre absent. */
    expect(SANS_FICHE).toContain('<h1 className="svv-page-title">Annuaire</h1>');
    /* ⚠️ L'ANCIEN TITRE MAISON A DISPARU, lui et sa règle de style. */
    expect(CODE).not.toContain('ann-titre');
    expect(SRC).not.toContain('.ann-titre{');
  });

  /**
   * 🔴 L'EN-TÊTE DE L'ÉCRAN N'EST PAS MASQUÉ PAR LA RÈGLE DE `GestionVue`, et c'est une vraie question : cette
   * règle cache bien un `.svv-page-head` sur l'écran annuaire. Elle vise un enfant DIRECT de la page
   * (`.gst-page >`), et celui-ci vit dans `.ann` — deux niveaux plus bas.
   */
  it('🔴 la règle qui masque l’en-tête de la PAGE ne touche pas celui de l’écran', () => {
    /* 🔴 LA RÈGLE DE L'ÉCRAN ANNUAIRE EST LIMITÉE À UN ENFANT DIRECT : c'est le `>` qui épargne le nôtre. */
    expect(VUE).toContain('.gst-page > .svv-page-head{display:none}');
    /* Le nouvel en-tête est dans `.ann`, qui n'est pas `.gst-page` : il échappe donc à la règle. */
    expect(CODE).toContain('<div className="ann">');
    expect(SANS_FICHE).toContain('className="svv-page-head ann-tete-page"');

    /**
     * ══ 🔴 LA SECONDE RÈGLE, ET POURQUOI ELLE NE MORD PAS ICI ════════════════════════════════════════════════
     *
     * Le module en porte une AUTRE qui masque `.svv-page-head` SANS `>` — donc à n'importe quelle profondeur,
     * le nôtre compris : `:root[data-gst-plein="1"] .svv-page-head{display:none}`. Trouvée en écrivant ce test,
     * et vérifiée plutôt que supposée.
     *
     * 🔴 ELLE EST CONDITIONNÉE À UN ÉTAT QUE CET ÉCRAN N'ATTEINT PAS. L'attribut est posé par `ColonneMode`
     * quand elle est `actif` (plein écran), et RETIRÉ à son démontage. Or la branche `ecran === 'annuaire'` ne
     * monte aucune `ColonneMode` : venir du plein écran des Événements retire l'attribut en chemin.
     *
     * ⚠️ CE CAS EST DONC AUSSI UN GARDE-FOU : le jour où l'écran Annuaire gagnerait une colonne de mode, son
     * titre disparaîtrait en plein écran, et c'est ici qu'on le saurait.
     */
    for (const sel of [...VUE.matchAll(/([^;{}\n]*\.svv-page-head[^{]*)\{display:none\}/g)].map((m) => m[1])) {
      expect(sel, sel).toMatch(/>|\[data-gst-plein="1"\]/);
    }
    const brancheAnnuaire = VUE.slice(VUE.indexOf("ecran === 'annuaire' ? ("), VUE.indexOf("ecran === 'boite' ? ("));
    expect(brancheAnnuaire).not.toContain('<ColonneMode');
    /* Et l'attribut est bien retiré dès que le plein écran cesse — c'est ce qui rend le passage sûr. */
    const colonne = readFileSync('app/(admin)/admin/(protected)/gestion/ColonneMode.tsx', 'utf8');
    expect(colonne).toContain('racine.removeAttribute(ATTR_PLEIN_ECRAN)');
  });
});

describe('🔴🔴 ② la phrase ne promet rien de faux', () => {
  const phrase = (() => {
    const i = SRC.indexOf('const PHRASE_ANNUAIRE');
    return SRC.slice(i, SRC.indexOf(';', i));
  })();

  /** 🔴 UNE SEULE PHRASE, ET ELLE EST RENDUE DANS LE SOUS-TITRE de l'en-tête — pas un paragraphe de plus. */
  it('🔴 une seule phrase, dans le sous-titre de l’en-tête', () => {
    expect(SANS_FICHE).toContain('<p className="svv-page-sub">{PHRASE_ANNUAIRE}</p>');
    /* ⚠️ UN SEUL POINT FINAL : deux phrases ne seraient plus « une phrase discrète ». */
    expect((phrase.match(/\./g) ?? [])).toHaveLength(1);
  });

  /**
   * 🔴🔴 CHAQUE PORTE PROMISE EXISTE VRAIMENT, et c'est le module de lecture du terme qui le dit — pas une
   * relecture de la phrase. `analyserTerme` est exactement ce que la route applique avant d'interroger.
   *
   * MESURÉ LE 07/10/2026 SUR LA VRAIE BASE, en lecture seule, par `rechercherPersonnes` :
   *   · nom      « jullien »                 → 1 personne
   *   · adresse  « edith cavell »            → 3 personnes
   *   · commune  « courbevoie »              → 60 (plafonné, `tronque = true`)
   *   · tél.     « 06 10 53 52 12 », « 06.10.53.52.12 », « +33610535212 » → 1 personne, les trois fois
   *   · e-mail   « ISABELLE.MENN@WANADOO.FR » (majuscules) → 1 personne
   *   · n° lot   « 219 »                     → 3 personnes
   */
  it('🔴🔴 téléphone, e-mail et numéro de lot sont bien lus par le moteur', () => {
    expect(phrase).toContain('un téléphone');
    for (const forme of ['06 10 53 52 12', '06.10.53.52.12', '+33610535212']) {
      expect(analyserTerme(forme).telephone, forme).not.toBeNull();
    }
    expect(phrase).toContain('un e-mail');
    expect(analyserTerme('ISABELLE.MENN@WANADOO.FR').email).toBe('isabelle.menn@wanadoo.fr');
    expect(phrase).toContain('un numéro de lot');
    expect(analyserTerme('219').numeroLot).toBe('219');
  });

  /**
   * 🔴🔴 L'ADRESSE ET LA COMMUNE passent par les MOTS du terme, confrontés à l'adresse normalisée du lot et à
   * son code postal. C'est de là que « courbevoie » ramène des personnes, et c'est pour cela que la phrase a le
   * droit de citer la commune.
   */
  it('🔴🔴 l’adresse et la commune sont des portes du dépôt, pas une promesse en l’air', () => {
    expect(phrase).toContain('une adresse');
    expect(phrase).toContain('une commune');
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    const bloc = repo.slice(repo.indexOf('export async function rechercherPersonnes'));
    expect(bloc).toContain('lo.adresse_normalisee');
    expect(bloc).toContain("coalesce(lo.code_postal, '')");
  });

  /**
   * 🔴🔴 « UN ANCIEN LOCATAIRE » — AJOUTÉ À LA PHRASE D'ARNO, parce que c'est vrai : la recherche les rend, avec
   * leur mot à eux. Promettre seulement « un locataire » aurait laissé croire qu'un parti est introuvable.
   */
  it('🔴🔴 les trois rôles cités existent, et chacun porte son mot', () => {
    for (const mot of ['un propriétaire', 'un locataire', 'un ancien locataire']) {
      expect(phrase, mot).toContain(mot);
    }
    expect(motRoleSuggere('proprietaire')).toBe('Propriétaire');
    expect(motRoleSuggere('locataire')).toBe('Locataire');
    expect(motRoleSuggere('ancien_locataire')).toBe('Ancien locataire');
  });

  /**
   * 🔴🔴 ET ELLE NE PROMET PAS CE QUI N'EXISTE PAS. Cet annuaire ne connaît QUE des propriétaires et des
   * locataires : un syndic, un artisan, un gardien n'y ont pas de fiche. La phrase ne doit pas les nommer, sans
   * quoi on la croirait et l'on chercherait pour rien.
   */
  it('🔴🔴 aucun rôle que l’annuaire ne connaît pas', () => {
    for (const absent of ['syndic', 'artisan', 'gardien', 'partenaire', 'fournisseur', 'collègue']) {
      expect(phrase.toLowerCase(), absent).not.toContain(absent);
    }
  });

  /** 🔴 ET ELLE PROMET L'OUVERTURE DIRECTE, qui est ce que le clic fait vraiment (éprouvé dans la barre). */
  it('🔴 « ouvrez directement sa fiche » est bien ce que le clic fait', () => {
    expect(phrase).toContain('ouvrez directement sa fiche');
    expect(BARRE).toContain('onFiche(s.fiche)');
  });
});

describe('🔴🔴 ③ LE MÊME composant que l’écran partagé, pas une copie', () => {
  /**
   * 🔴🔴 C'EST LA GARANTIE CENTRALE DU LOT, et la raison d'être du lot tout entier : l'écran Annuaire avait sa
   * propre recherche, avec son propre débounce et sa propre liste. Deux recherches finissent par ne plus trouver
   * les mêmes gens, et l'on corrige alors celle qu'on a sous les yeux.
   */
  it('🔴🔴 les deux écrans importent le même fichier', () => {
    expect(CODE).toContain("import { BarreAnnuaire } from './BarreAnnuaire'");
    expect(VUE).toContain("import { BarreAnnuaire } from './BarreAnnuaire'");
    /* 🔴 ET IL N'EXISTE QU'UN SEUL `BarreAnnuaire` dans le module. */
    expect(CODE).not.toContain('function BarreAnnuaire');
  });

  /** 🔴🔴 LE FOCUS EST DEMANDÉ PAR L'ÉCRAN ANNUAIRE, et par lui seul. */
  it('🔴🔴 l’écran Annuaire demande le focus, l’écran partagé non', () => {
    expect(CODE).toContain('<BarreAnnuaire onFiche={onFiche} focusAuMontage />');
    const i = VUE.indexOf('<BarreAnnuaire');
    expect(VUE.slice(i, VUE.indexOf('/>', i))).not.toContain('focusAuMontage');
  });

  /**
   * 🔴 UNE SEULE REQUÊTE DE RECHERCHE DANS TOUT LE MODULE, et elle est dans la barre : l'écran n'en écrit plus
   * aucune. C'est ce qui rend la promesse « pas une copie » vérifiable, et pas seulement énoncée.
   */
  it('🔴 l’écran n’interroge plus l’annuaire lui-même', () => {
    expect(CODE).not.toContain('/api/admin/gestion/annuaire?q=');
    expect(BARRE).toContain('/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}');
  });
});

describe('🔴🔴 ④ les quatre retraits autorisés, et rien de plus', () => {
  /** 🔴 LE BOUTON « ← Retour » : parti de l'état sans fiche, GARDÉ sur une fiche. */
  it('🔴 « ← Retour » quitte l’état sans fiche, et reste sur une fiche', () => {
    expect(SANS_FICHE).not.toContain('← Retour');
    expect(CODE).toContain('← Retour');
    expect(CODE).toContain('ann-retour-haut');
  });

  /** 🔴 L'ANCIEN LIBELLÉ ET SON CHAMP, LA LIGNE D'AIDE, ET L'ENCADRÉ EN POINTILLÉS. */
  it('🔴 le libellé, le champ, la ligne d’aide et l’encadré ont disparu', () => {
    for (const mort of [
      'Chercher un propriétaire, un lot, un locataire',
      'nom, adresse, commune, téléphone, e-mail, n° de lot',
      'Tout est accepté',
      'L’annuaire répond par PERSONNE',
      'Tapez un nom, une adresse',
    ]) {
      expect(CODE, mort).not.toContain(mort);
    }
    /* Et leurs règles de style avec eux. */
    for (const regle of ['.ann-chercher{', '.ann-label{', '.ann-aide{', '.ann-champ--compact{']) {
      expect(SRC, regle).not.toContain(regle);
    }
  });

  /**
   * ⚠️ `.ann-champ` RESTE, ET CE N'EST PAS UN OUBLI : `VieDuBien` et `HistoriqueDuBien` s'en servent pour leurs
   * propres champs. La retirer aurait dépouillé deux écrans qui n'ont rien demandé.
   */
  it('⚠️ la règle `.ann-champ` reste, parce que deux autres écrans la rendent', () => {
    expect(SRC).toContain('.ann-champ{');
    const vdb = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
    const hdb = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
    expect(vdb).toContain('className="ann-champ');
    expect(hdb).toContain('className="ann-champ');
  });

  /**
   * 🔴🔴 LA BRANCHE D'UNE FICHE EST INTACTE — « seul l'état “aucune fiche ouverte” est reconstruit » (Arno).
   * `?ecran=annuaire&fiche=bien-315&evenement=1` passe par là, et chacune de ses propriétés doit y rester.
   */
  it('🔴🔴 les trois fiches et toutes leurs propriétés d’adresse sont intactes', () => {
    for (const vue of ['<VueProprietaire', '<VueLot', '<VueLocataire']) {
      expect(CODE, vue).toContain(vue);
    }
    for (const prop of ['evenementVise={evenementVise}', 'poserSurVieDuBien={vieDuBienVisee === detail.data.id}',
      'jetonHistorique={jetonHistorique}', 'filtreVie={filtreVie}', 'onPoserJeton={onPoserJeton}']) {
      expect(CODE, prop).toContain(prop);
    }
    /* 🔴 ET LA CLÉ WIPPIMMO CONTINUE DE RÉSOUDRE UNE FICHE DE BIEN (`fiche=bien-315`). */
    expect(CODE).toContain('ficheParCle');
  });

  /**
   * ⚠️ L'OPTION SERVEUR DES ARCHIVÉES N'EST PAS SUPPRIMÉE : seul son appelant d'écran disparaît, sur décision
   * d'Arno. Mesure en base au moment du retrait : six propriétaires archivés, dont cinq AUSSI supprimés — la
   * case ne changeait le résultat que pour une fiche d'essai.
   */
  it('⚠️ la route et le dépôt savent toujours rendre les archivées', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/annuaire/route.ts', 'utf8');
    expect(route).toContain("url.searchParams.get('archivees') === '1'");
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain('avecArchivees ? lignes : lignes.filter((x) => !x.archive)');
  });
});

describe('⚠️ ⑤ les gardes d’écriture de ce fichier', () => {
  /**
   * 🔴 AUCUNE COULEUR EN DUR DANS LA FEUILLE DE LA BARRE : c'est l'exigence transverse du module, et la ligne
   * d'avertissement ajoutée par ce lot s'y plie comme le reste.
   */
  it('🔴 la ligne « d’autres correspondent » n’apporte aucune couleur en dur', () => {
    const i = BARRE.indexOf('const CSS_BARRE_ANNUAIRE');
    const feuille = BARRE.slice(i);
    expect(feuille).toContain('.gst-annuaire-tronque{');
    expect(feuille.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });

  /**
   * ⚠️ AUCUN ACCENT GRAVE DANS UN COMMENTAIRE DE FEUILLE : les feuilles de ce module vivent dans des littéraux
   * gabarits, qu'un seul accent grave terminerait. Piège consigné quatorze fois dans ce dépôt, et quatorze fois
   * dans un commentaire — il a mordu encore pendant cette série de lots.
   */
  it('⚠️ aucun accent grave dans les feuilles de style des deux fichiers', () => {
    for (const [nom, src, debut] of [
      ['BarreAnnuaire', BARRE, 'const CSS_BARRE_ANNUAIRE'],
      ['Annuaire', SRC, 'export const CSS_ANNUAIRE'],
    ] as const) {
      const feuille = src.slice(src.indexOf(debut));
      /* La feuille est un littéral gabarit : le PREMIER accent grave l'ouvre, le SECOND la fermerait. */
      expect((feuille.match(/`/g) ?? []).length, nom).toBe(2);
    }
  });
});
