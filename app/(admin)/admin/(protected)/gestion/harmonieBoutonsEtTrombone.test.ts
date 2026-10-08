import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT HARMONIE-BOUTONS-ET-TROMBONE (09/10/2026) ═══════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, en deux points :
 *   ① « “📎1” · “Auto” · “Événement en cours” · date. Le trombone et son chiffre passent juste à gauche de la
 *      capsule verte “Auto” (ou de la première étiquette présente s'il n'y a pas “Auto”). Rien d'autre ne
 *      change. »
 *   ② « UN SEUL FORMAT DE BOUTONS-FILTRES SUR LA PAGE GESTION. Référence : les boutons du panneau “Boîte de
 *      réception” […] Rends ce format commun (un seul composant ou une seule classe partagée) pour que les
 *      trois groupes ne divergent plus. Aucun comportement ne change (filtres, écriture de l'urgence, &tri=). »
 *
 * ⚠️ CE QUE CES CAS ÉPROUVENT, ET CE QU'ILS NE PEUVENT PAS ÉPROUVER. Ils lisent le SOURCE : ils tiennent donc
 * l'unicité du format (un seul endroit où le dessin est écrit, trois appelants qui l'emploient) et l'ordre des
 * étiquettes. Les HAUTEURS RÉELLES, elles, se mesurent à l'écran — c'est fait, et les chiffres sont dans
 * `app/.captures/harmonie-boutons-et-trombone/mesures.md`. Une épreuve qui prétendrait mesurer un pixel depuis
 * une chaîne de caractères mentirait.
 */

const PILULE = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonPilule.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const URGENCE = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurUrgence.tsx', 'utf8');
const LIGNE = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');

/** La feuille de la pilule, seule — pour ne pas confondre une règle CSS et le commentaire qui la raconte. */
const FEUILLE_PILULE = PILULE.slice(PILULE.indexOf('export const CSS_BOUTON_PILULE'));

describe('🔴🔴 ① le trombone ouvre le groupe d’étiquettes', () => {
  /** Le bloc des trois étiquettes, de son ouverture jusqu'à la date qui le suit. */
  const marques = LIGNE.slice(LIGNE.indexOf('<span className="vdb-marques">'),
    LIGNE.indexOf('<span className="vdb-quand">'));

  /**
   * 🔴🔴 L'ORDRE DEMANDÉ : 📎 · statut (« Auto ») · « Événement en cours » · date.
   *
   * ⚠️ ON COMPARE DES PLACES DANS LE SOURCE, ET NON DES MOTS DE COMMENTAIRE : chacun des trois repères est un
   * MORCEAU DE CODE (la classe, l'appel), introuvable dans une phrase française.
   */
  it('🔴🔴 l’ordre est 📎 · statut · événement', () => {
    expect(marques.indexOf('className="vdb-trombone"')).toBeGreaterThan(-1);
    expect(marques.indexOf('className="vdb-trombone"')).toBeLessThan(marques.indexOf('tonCapsule'));
    expect(marques.indexOf('tonCapsule')).toBeLessThan(marques.indexOf('vdb-capsule--evt'));
  });

  /**
   * 🔴 « OU DE LA PREMIÈRE ÉTIQUETTE PRÉSENTE S'IL N'Y A PAS “Auto” » EST TENU SANS UNE SEULE CONDITION, et ce
   * cas le prouve : les trois étiquettes restent des frères, chacune sous SA propre condition d'affichage.
   * Le trombone posé en premier se colle donc à celle qui suit, quelle qu'elle soit — et reste seul s'il n'y en
   * a aucune. Une condition « s'il y a Auto, sinon… » aurait été du code pour une règle que la mise en page
   * donne gratuitement.
   */
  it('🔴 chaque étiquette garde sa propre condition, aucune n’en dépend d’une autre', () => {
    expect(marques).toContain('{motDuTrombone !== null && (');
    expect(marques).toContain('{l.statut !== null && (');
    expect(marques).toContain('{motEvenementEnCours(ouverts.length) !== null && (');
  });

  /**
   * ⚠️ « RIEN D'AUTRE NE CHANGE » (Arno) : mêmes mots, mêmes info-bulles, mêmes couleurs, même conteneur poussé
   * à droite. Seul l'ordre des frères a bougé.
   */
  it('⚠️ rien d’autre ne change dans la rangée', () => {
    expect(marques).toContain('title={motDuTrombone} aria-label={motDuTrombone}');
    expect(marques).toContain('<span aria-hidden="true">📎</span>{vraies.length}');
    expect(LIGNE).toContain('.vdb-marques{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin-left:auto;min-width:0}');
    expect(LIGNE).toContain('.vdb-trombone{font-size:.76rem;font-weight:600;color:var(--color-svv-ink);flex:0 0 auto}');
  });

  /**
   * 🔴 LA LIGNE REPLIÉE ET LA LIGNE DÉPLIÉE SONT LA MÊME, et c'est ce qui répond au « fermée ET ouverte »
   * d'Arno sans deuxième déplacement : l'en-tête `vdb-haut` est rendu dans les deux cas, le dépliage n'ajoutant
   * que `vdb-detail` EN DESSOUS. Si un jour quelqu'un conditionnait cet en-tête, ce cas le dirait.
   */
  it('🔴 un seul en-tête sert la ligne fermée et la ligne ouverte', () => {
    expect(LIGNE.indexOf('<span className="vdb-haut">'))
      .toBeLessThan(LIGNE.indexOf('<div className="vdb-detail">'));
    expect(LIGNE).toContain('aria-expanded={ouvert}');
  });

  /**
   * ⚠️ LES DEUX AUTRES LISTES L'AVAIENT DÉJÀ, et c'est pour cela que ce point était une CORRECTION et non une
   * invention. Si l'une d'elles repassait la capsule devant son trombone, les trois écrans divergeraient à
   * nouveau — ce cas le verrait.
   */
  it('⚠️ les trois listes du module montrent le trombone avant la capsule', () => {
    const boite = BOITE.slice(BOITE.indexOf('<span className="brc-bas">'), BOITE.indexOf('</button>\n            </li>'));
    expect(boite.indexOf('Trombone')).toBeLessThan(boite.indexOf('brc-capsule brc-capsule--'));
    const fil = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    const coin = fil.slice(fil.indexOf('<div className="cnv-coin">'), fil.indexOf('<div className="cnv-coin">') + 4000);
    expect(coin.indexOf('className="cnv-pieces"')).toBeLessThan(coin.indexOf('cnv-capsule'));
  });
});

describe('🔴🔴 ② un seul format de boutons-filtres', () => {
  /**
   * 🔴🔴 UN SEUL ENDROIT OÙ LE DESSIN EST ÉCRIT. C'est la demande elle-même (« un seul composant ou une seule
   * classe partagée »), et c'est la seule forme qui empêche la divergence de revenir.
   *
   * 🔴 ON COMPTE LES DÉCLARATIONS, PAS LES MENTIONS : `.gpil{` ouvert une seule fois dans tout le dépôt. Une
   * seconde déclaration ailleurs — « juste pour ajuster » — est exactement le geste qui a fait les trois
   * dessins d'avant.
   */
  it('🔴🔴 la pilule est déclarée une seule fois, dans son fichier', () => {
    expect(FEUILLE_PILULE).toContain('.gpil{min-height:44px;padding:.25rem .7rem;font:inherit;font-size:.8rem;');
    for (const [nom, source] of [['BoiteReception', BOITE], ['GestionVue', VUE], ['SelecteurUrgence', URGENCE]] as const) {
      expect((source.match(/\.gpil\{/g) ?? []).length, nom).toBe(0);
    }
  });

  /** 🔴 ET LES TROIS GROUPES L'EMPLOIENT — le composant, pas une classe recopiée à la main. */
  it('🔴🔴 les trois groupes rendent le même composant', () => {
    expect(BOITE).toContain('<BoutonPilule key={f.cle} mot={f.mot} aide={f.aide}');
    expect(VUE).toContain('<BoutonPilule key={t} mot={motTri(t)} actif={tri === t}');
    expect(URGENCE).toContain('<BoutonPilule');
  });

  /**
   * 🔴🔴 LA FEUILLE VOYAGE AVEC CHACUN DES TROIS, et ce n'est pas une ceinture de plus : chaque écran monte un
   * sous-ensemble différent du module. L'écran « Événements » en plein écran montre « New » et « Urgent » SANS
   * la boîte de réception ; le sélecteur d'urgence est rendu dans `CarteVive` (feuille dans `GestionVue`) comme
   * dans le bloc « Événements » de la fiche du bien (feuille dans `EvenementsDuBien`).
   * ⚠️ LA LEÇON EST ÉCRITE DANS `BoutonRond` : « une classe partagée dont la feuille ne l'est pas n'est pas
   * partagée » — le bouton arrive nu dans l'écran qui n'injecte rien.
   */
  it('🔴🔴 chacun des trois injecte la feuille commune', () => {
    for (const [nom, source] of [['BoiteReception', BOITE], ['GestionVue', VUE], ['SelecteurUrgence', URGENCE]] as const) {
      expect(source, nom).toContain('CSS_BOUTON_PILULE');
      expect(source.slice(source.indexOf('`\n')), nom).toContain('${CSS_BOUTON_PILULE}');
    }
  });

  /**
   * 🔴 LE FORMAT EST CELUI DE LA RÉFÉRENCE, ATTRIBUT PAR ATTRIBUT — ce sont les mots d'Arno, repris un par un :
   * « même forme de pilule, hauteur, marges intérieures, bordure, police, taille, graisse, état actif (fond
   * sombre / texte blanc) et état inactif (fond blanc / bordure grise) ».
   *
   * ⚠️ LA SEULE VALEUR QUI N'EST PAS CELLE DE `.brc-filtre` EST LA HAUTEUR : 44 px et non 36. Les deux autres
   * groupes la tenaient déjà au titre du §15 (cible tactile), et `urgenceEvenement.test.ts` l'écrit « non
   * négociable ». On unifie donc par le haut : identique partout, conforme partout.
   */
  it('🔴 le format reprend la référence, attribut par attribut', () => {
    /* forme, marges, police, taille, graisse (celle du texte courant : aucune déclaration de poids) */
    expect(FEUILLE_PILULE).toContain('padding:.25rem .7rem;font:inherit;font-size:.8rem');
    expect(FEUILLE_PILULE).toContain('border-radius:999px');
    expect(FEUILLE_PILULE).not.toContain('font-weight');
    /* inactif : fond blanc, bordure grise, texte d'encre */
    expect(FEUILLE_PILULE).toContain('color:var(--color-svv-ink);\n  background:var(--color-svv-surface);border:1px solid var(--color-svv-line)');
    /* actif : fond sombre, texte blanc */
    expect(FEUILLE_PILULE).toContain('.gpil--actif{color:var(--color-svv-surface);background:var(--color-svv-ink);border-color:var(--color-svv-ink)}');
    /* la hauteur commune, et le §15 */
    expect(FEUILLE_PILULE).toContain('min-height:44px');
  });

  /**
   * 🔴🔴 L'EXCEPTION D'ARNO, ET ELLE SEULE : « le bouton ACTIF garde sa couleur de sens (Normal = vert,
   * Intermédiaire = orange, Urgent = rouge — mêmes teintes que sur les cartes d'événement), en fond plein avec
   * texte blanc ».
   *
   * 🔴 « MÊMES TEINTES QUE SUR LES CARTES » SE VÉRIFIE, ET C'EST LE CŒUR DE CE CAS : les trois jetons employés
   * en FOND par le bouton actif sont EXACTEMENT les trois jetons que la capsule de la carte emploie en TEXTE
   * (`.gst-type-capsule--urg-*`, feuille de `GestionVue`). La paire est inversée, la famille est la même.
   */
  it('🔴🔴 l’actif de l’urgence reprend les teintes des cartes, en fond plein', () => {
    const feuille = URGENCE.slice(URGENCE.indexOf('const CSS_SELECTEUR_URGENCE'));
    expect(feuille).toContain('.gurg-voie.gpil--actif{border-color:transparent;color:var(--color-svv-surface)}');
    expect(feuille).toContain('.gurg-voie--vert.gpil--actif{background:var(--color-svv-green-ink)}');
    expect(feuille).toContain('.gurg-voie--orange.gpil--actif{background:var(--color-svv-orange)}');
    expect(feuille).toContain('.gurg-voie--rouge.gpil--actif{background:var(--color-svv-red-dark)}');
    /* 🔴 LES MÊMES TROIS JETONS, CÔTÉ CARTE — si l'une des deux listes bougeait seule, ce cas le dirait. */
    expect(VUE).toContain('.gst-type-capsule--urg-vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}');
    expect(VUE).toContain('.gst-type-capsule--urg-orange{background:var(--color-svv-orange-soft);color:var(--color-svv-orange)}');
    expect(VUE).toContain('.gst-type-capsule--urg-rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark)}');
  });

  /**
   * 🔴 « TEXTE BLANC » S'ÉCRIT `--color-svv-surface`, JAMAIS UN BLANC EN DUR. En thème Sombre les trois teintes
   * deviennent CLAIRES : un `#fff` figé y serait illisible, alors que le jeton devient sombre en même temps.
   * C'est la règle de tout le module — aucune couleur en dur — et ici elle a une conséquence visible.
   */
  it('🔴 aucune couleur en dur, ni dans la pilule ni dans l’exception', () => {
    expect(FEUILLE_PILULE).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
    expect(URGENCE.slice(URGENCE.indexOf('const CSS_SELECTEUR_URGENCE'))).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });

  /**
   * ⚠️ LE SURVOL A SON PENDANT AU CLAVIER, AU CARACTÈRE PRÈS. Le garde §15 de `GestionVue.parts.test.ts` retire
   * « :hover » du sélecteur et cherche `<base>:focus-visible` tel quel : `.gpil:focus-visible` aurait laissé
   * passer un survol sans pendant clavier, et la feuille de la pilule est injectée DANS celle de GestionVue.
   */
  it('⚠️ le survol de la pilule a son pendant clavier, au caractère près', () => {
    expect(FEUILLE_PILULE).toContain('.gpil:hover:not(:disabled){');
    expect(FEUILLE_PILULE).toContain('.gpil:not(:disabled):focus-visible{');
  });

  /**
   * 🔴🔴 AUCUN COMPORTEMENT NE CHANGE (Arno) — et c'est la moitié du lot. Les trois gestes sont nommément
   * vérifiés : le filtre de la boîte, le tri qui écrit `&tri=` dans l'adresse (« New » en RETIRANT le
   * paramètre), et l'urgence qui remonte à l'appelant sans écrire elle-même.
   */
  it('🔴🔴 les trois gestes sont intacts', () => {
    expect(BOITE).toContain('actif={filtre === f.cle} onClick={() => setFiltre(f.cle)}');
    expect(VUE).toContain("onClick={() => aller({ ...etatUrl, tri: t === 'new' ? null : t })}");
    expect(URGENCE).toContain('onClick={() => onUrgence(n.cle)}');
    /* ⚠️ LE SÉLECTEUR D'URGENCE N'A TOUJOURS AUCUNE PORTE D'ÉCRITURE : il ne connaît ni fetch ni route. */
    expect(URGENCE).not.toContain('fetch(');
  });

  /**
   * ⚠️ LE MODE COMPACT N'EST PAS SUPPRIMÉ : il resserre toujours la RANGÉE de la fiche du bien. Ce sont les
   * BOUTONS qui cessent de rétrécir — « même hauteur et même taille que “Tous” », partout.
   */
  it('⚠️ le mode compact resserre la rangée, plus les boutons', () => {
    const feuille = URGENCE.slice(URGENCE.indexOf('const CSS_SELECTEUR_URGENCE'));
    expect(feuille).toContain('.gurg--compact{margin:6px 0 0;gap:.35rem}');
    expect(feuille).not.toContain('.gurg--compact .gurg-voie{');
    expect(URGENCE).toContain('compact?: boolean;');
  });
});
