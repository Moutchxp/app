import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE — CE QUE L'ACCUEIL GESTION N'AFFICHE PLUS, ET CE QU'IL AFFICHE ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ACCORD D'ARNO (07/10/2026), et SEULEMENT pour ces retraits-là :
 *
 *   ① le bloc d'état quitte l'accueil : le paragraphe d'explication, le cadre « Dernière relève… » avec ses
 *      boutons « Relever maintenant », « Annuaire », « À rattacher », la ligne « Relève automatique… » et la
 *      ligne « Copie des pièces… ». Seul « Rafraîchir » est conservé, devenu le bouton rond (point 2) ;
 *   ② le bouton rond, le MÊME composant que la boîte en plein écran, à droite de l'en-tête de la colonne ;
 *   ④ le gros bouton rouge fait partie de sa capsule dépliée ;
 *   ⑤ le compteur « N échange(s) » quitte la carte d'événement.
 *
 * 🔴 CHAQUE FONCTION RETIRÉE A ÉTÉ RETROUVÉE AILLEURS AVANT LE RETRAIT, et ce fichier le VÉRIFIE dans le code —
 * c'est la garde qui empêche qu'un lot suivant retire le dernier chemin sans s'en apercevoir :
 *     Relever maintenant → bouton rond « Relever et actualiser » de la boîte en plein écran ;
 *     Rafraîchir        → conservé ici même, en bouton rond ;
 *     Annuaire          → entrée de la colonne de la boîte, ET la barre de recherche de l'accueil ;
 *     À rattacher       → entrée de la colonne de la boîte, avec son compteur ;
 *     relève / copie    → la colonne de la boîte les porte (lot ERGO-BOITE).
 *
 * ⚠️ LES MÉCANISMES NE SONT PAS TOUCHÉS : la relève automatique et la reprise de copie Drive continuent de
 * tourner. On retire un AFFICHAGE, jamais un rouage — et aucune de ces épreuves ne parle de leur code.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const RECEPTION = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');
const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
const ROND = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonRond.tsx', 'utf8');

describe('🔴🔴 ① le bloc d’état ne s’affiche plus sur l’accueil', () => {
  /**
   * 🔴🔴 LE BANDEAU ET SES BOUTONS. La condition d'affichage écarte désormais `partage` — c'est-à-dire l'accueil.
   * Il RESTE sur « Événements » et « À rattacher », où il est encore le seul moyen de relever.
   */
  it('🔴🔴 le bandeau est écarté de l’écran partagé', () => {
    expect(VUE).toContain("{ecran !== 'boite' && ecran !== 'annuaire' && ecran !== 'partage' && (");
    /* ⚠️ ET IL N'EST PLUS JAMAIS RENDU EN VERSION « LARGE » : la seule qui reste est la compacte. */
    expect(VUE).not.toContain("gst-bandeau${ecran === 'partage' ? '' : ' gst-bandeau--compact'}");
  });

  /** 🔴 LA LIGNE ORDINAIRE DE RELÈVE ET CELLE DE LA COPIE quittent l'accueil elles aussi. */
  it('🔴 « Relève automatique » et « Copie des pièces » ordinaires quittent l’accueil', () => {
    expect(VUE).toContain("ecran !== 'boite' && ecran !== 'annuaire' && ecran !== 'partage' && (\n"
      + '        /* 🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 1');
    expect(VUE).toContain("copie.niveau === 'calme' && ecran !== 'boite' && ecran !== 'annuaire' "
      + "&& ecran !== 'partage' && (");
  });

  /**
   * 🔴🔴 LES ALERTES NE SONT PAS TOUCHÉES, et c'est la limite du retrait : « relève arrêtée », « copie arrêtée »
   * et « envoi en échec » restent affichées sur TOUS les écrans. Masquer une sécurité pour gagner de la place,
   * c'est la retirer.
   */
  it('🔴🔴 les ALERTES restent sur tous les écrans, accueil compris', () => {
    expect(VUE).toContain('{veille.niveau !== \'ok\' ? (\n        <p className="gst-veille gst-veille--alerte" role="alert">');
    expect(VUE).toContain("{copie.niveau === 'alerte' && (");
    expect(VUE).toContain("{suite.niveau === 'echec' && (");
    expect(VUE).toContain('<BandeauEnvois sauf={filOuvert} />');
  });

  /**
   * 🔴🔴 RIEN N'EST PERDU — LA GARDE QUI LE PROUVE. Chaque fonction retirée du bandeau existe ailleurs, et c'est
   * la colonne de la boîte en plein écran qui les porte.
   */
  it('🔴🔴 « Relever », « Annuaire » et « À rattacher » restent dans la colonne de la boîte', () => {
    expect(BOITE).toContain('mot="Relever et actualiser"');
    expect(VUE).toContain("aller({ ...ETAT_DEFAUT, ecran: 'annuaire' })");
    expect(VUE).toContain("ecran: 'a_trier'");
  });
});

describe('🔴🔴 ② le bouton rond, le même des deux côtés', () => {
  /**
   * 🔴🔴 « MÊME COMPOSANT, PAS UNE COPIE » (Arno). Le balisage ET la feuille vivent dans un seul fichier, et les
   * deux écrans l'importent. Une classe partagée dont la feuille ne l'est pas n'est pas partagée : la feuille est
   * donc exportée et injectée par les deux.
   */
  it('🔴🔴 un seul composant, une seule feuille, deux écrans', () => {
    expect(ROND).toContain('export function BoutonRond(');
    expect(ROND).toContain('export const CSS_BOUTON_ROND');
    for (const [nom, src] of [['boîte', BOITE], ['réception', RECEPTION]] as const) {
      expect(src, nom).toContain("from './BoutonRond'");
      expect(src, nom).toContain('<BoutonRond ');
    }
    /* 🔴 ET LA FEUILLE EST INJECTÉE DES DEUX CÔTÉS : la boîte dans sa feuille, l'accueil dans la sienne. */
    for (const [nom, src] of [['boîte', BOITE], ['écran partagé', VUE]] as const) {
      expect(src, nom).toContain('${CSS_BOUTON_ROND}');
    }
    /* ⚠️ ET PLUS AUCUN BALISAGE RECOPIÉ : la flèche circulaire n'est dessinée qu'une fois. */
    expect(BOITE).not.toContain('M20 12a8 8 0 1 1-2.34-5.66');
  });

  /**
   * 🔴🔴 LES DEUX ACTIONS SONT DIFFÉRENTES, ET AUCUNE N'EST TOUCHÉE (Arno : « n'en change aucune des deux ») :
   * la boîte RELÈVE puis actualise, l'accueil ACTUALISE seulement — c'est ce que faisait « Rafraîchir ».
   */
  it('🔴🔴 deux actions distinctes : « Relever et actualiser » et « Rafraîchir »', () => {
    expect(BOITE).toContain('mot="Relever et actualiser"');
    expect(RECEPTION).toContain('<BoutonRond mot="Rafraîchir" onClick={onRafraichir} />');
    expect(VUE).toContain('onRafraichir={() => void charger()}');
  });

  /** 🔴 À DROITE DE L'EN-TÊTE « Boîte de réception · … · N mails reçus » (Arno) : dans le `h2` du titre. */
  it('🔴 il est posé dans l’en-tête de la colonne, après le compteur', () => {
    const i = RECEPTION.indexOf('{etat.v === \'ok\' && etat.total !== null && (');
    const j = RECEPTION.indexOf('<BoutonRond mot="Rafraîchir"');
    const k = RECEPTION.indexOf('</h2>', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(j).toBeLessThan(k);
  });
});

describe('🔴🔴 ③ l’Annuaire est un BLOC DÉDIÉ, au-dessus des deux colonnes', () => {
  /**
   * ══ 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 1 — UN OUTIL À PART ═══════════════════════════════════════════════════
   *
   * Arno : « l'Annuaire devient un bloc à part, sous le titre “Gestion” et au-dessus de l'écran partagé. Le bloc
   * a son propre cadre et une marge franche. AUCUN cadre commun avec les colonnes. Sépare visuellement ce bloc de
   * l'écran partagé, par l'espacement et/ou un trait horizontal discret. »
   */
  it('🔴🔴 le bloc est rendu HORS du conteneur des deux colonnes, et avant lui', () => {
    const bloc = VUE.indexOf('<section className="gst-bloc-annuaire"');
    const barre = VUE.indexOf('<BarreAnnuaire');
    const trait = VUE.indexOf('<hr className="gst-separation" />');
    const deux = VUE.indexOf('<div className="gst-deux">');
    expect(bloc).toBeGreaterThan(-1);
    /* 🔴 LA BARRE EST DANS LE BLOC, et le bloc se ferme AVANT les colonnes : aucun cadre commun. */
    expect(barre).toBeGreaterThan(bloc);
    expect(VUE.indexOf('</section>', barre)).toBeLessThan(deux);
    /* 🔴 ET UN TRAIT DISCRET SÉPARE LES DEUX ZONES. */
    expect(trait).toBeGreaterThan(bloc);
    expect(trait).toBeLessThan(deux);
  });

  it('🔴 le bloc a son propre cadre, et le trait sa règle', () => {
    expect(VUE).toContain('.gst-bloc-annuaire{margin:0 0 14px;padding:14px;'
      + 'border:1px solid var(--color-svv-line-strong);border-radius:14px;');
    /* 🔴 UN LISERÉ, PAS UNE OMBRE : la feuille de ce module n'admet aucune couleur en dur, et une ombre portée
       en demande une. Arno laisse le choix (« légère ombre ou liseré ») ; le second anneau donne le même relief
       et suit le thème Sombre. */
    expect(VUE).toContain('background:var(--color-svv-surface);box-shadow:0 0 0 3px var(--color-svv-field)}');
    expect(VUE).toContain('.gst-separation{height:0;margin:0 0 16px;border:0;'
      + 'border-top:1px solid var(--color-svv-line)}');
  });

  /**
   * 🔴🔴 AUCUN ÉTAT PARTAGÉ (demande explicite d'Arno) : la barre ne reçoit QUE `onFiche`. Elle ne connaît ni la
   * liste des mails, ni les événements, ni les filtres, ni le rafraîchissement — elle ne peut donc rien leur
   * faire, et aucune relecture de l'écran ne la touche.
   */
  it('🔴🔴 le bloc ne partage aucun état avec la boîte ni les événements', () => {
    const BARRE = readFileSync('app/(admin)/admin/(protected)/gestion/BarreAnnuaire.tsx', 'utf8');
    /**
     * ══ ⚠️ RÈGLE RÉÉCRITE LE 07/10/2026 — LOT ECRAN-ANNUAIRE-MINIMAL ═══════════════════════════════════════════
     *
     * ELLE FIGEAIT LA SIGNATURE ENTIÈRE (`{ onFiche }: { onFiche: (f: FicheUrl) => void }`), pour dire « une
     * seule propriété, et c'est une SORTIE ». La barre en a désormais une seconde, `focusAuMontage`, parce que
     * l'écran Annuaire la monte seule et demande le focus là où l'écran partagé ne le veut pas.
     *
     * 🔴 CE QUE LA RÈGLE PROTÉGEAIT N'A PAS BOUGÉ, et c'est exactement ce qu'on éprouve maintenant : la barre ne
     * reçoit AUCUN état de l'écran partagé. `onFiche` est une sortie, `focusAuMontage` un booléen de présentation
     * — ni l'un ni l'autre ne porte une liste de mails, un filtre, une sélection ou un rafraîchissement. Figer la
     * signature au caractère près faisait échouer la garantie au premier réglage d'affichage, ce qui n'est pas
     * ce qu'Arno a demandé de garder.
     */
    expect(BARRE).toContain('export function BarreAnnuaire({ onFiche, focusAuMontage = false }: {');
    const signature = BARRE.slice(BARRE.indexOf('export function BarreAnnuaire('), BARRE.indexOf('}) {'));
    /* 🔴 LES SEULES PROPRIÉTÉS ADMISES, et chacune pour la raison écrite ci-dessus. */
    expect([...signature.matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]))
      .toEqual(['onFiche', 'focusAuMontage']);
    /* 🔴 ET ELLE N'IMPORTE AUCUN DES ÉCRANS DE L'ÉCRAN PARTAGÉ : un composant qui en tire un état le partage. */
    for (const voisin of ['./BoiteMail', './BoiteReception', './GestionVue', './CarteVive']) {
      expect(BARRE, voisin).not.toContain(voisin);
    }
    /* ⚠️ ET L'ÉCRAN NE LUI PASSE QUE `onFiche` — aucun filtre, aucune sélection, aucun rafraîchissement. */
    const i = VUE.indexOf('<BarreAnnuaire');
    expect(VUE.slice(i, VUE.indexOf('/>', i))).not.toMatch(/\s(?!onFiche)[a-zA-Z]+=\{/);
  });

  /** 🔴 ET SON CLIC OUVRE LA FICHE PAR LE CHEMIN EXISTANT : le même `fiche` que l'écran Annuaire reçoit. */
  it('🔴 le clic passe par l’écran Annuaire et sa fiche', () => {
    expect(VUE).toContain("aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: f })");
  });
});

describe('🔴🔴 ⑥ « en gestion » n’est écrit qu’une fois', () => {
  /**
   * 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — Arno : « réutilise ce calcul, pas de seconde requête qui recompte à
   * sa façon ». La règle vit dans le module PUR `bienEnGestion`, et la fiche propriétaire comme la barre la
   * lisent. Deux écritures auraient fini par diverger.
   */
  it('🔴🔴 la fiche propriétaire et les suggestions lisent le MÊME module', () => {
    const ANN = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    const SUG = readFileSync('app/lib/gestion/suggestionAnnuaire.ts', 'utf8');
    expect(ANN).toContain("from '../../../../lib/gestion/bienEnGestion'");
    expect(ANN).toContain('f.biens.filter(bienEnGestion)');
    expect(SUG).toContain("from './bienEnGestion'");
    expect(SUG).toContain('compterBiensEnGestion(p.biens)');
    /* ⚠️ ET PLUS AUCUNE ÉCRITURE À LA MAIN DE LA RÈGLE DANS L'ÉCRAN. */
    expect(ANN).not.toContain('f.biens.filter((b) => b.fin === null)');
  });
});

describe('🔴🔴 ④ le gros bouton fait partie de sa capsule', () => {
  /**
   * 🔴🔴 « AUCUN VIDE ENTRE LA CARTE ET LE BOUTON, un écart net avec l'événement suivant, et il doit se lire
   * clairement comme faisant partie de sa capsule » (Arno). Trois règles, et chacune répare une chose vue :
   * le corps colle à la carte, le bloc du bouton perd son cadre, l'écart passe SOUS le bouton.
   */
  it('🔴🔴 le corps de la capsule colle à la carte, et le bloc du bouton n’a plus de cadre', () => {
    expect(CARTE).toContain("<div className={`gst-corps${partage ? ' gst-corps--partage' : ''}`}>");
    expect(VUE).toContain('.gst-corps--partage{padding:0;gap:0;margin-bottom:10px}');
    expect(VUE).toContain('.gst-corps--partage .gst-bloc{background:transparent;border:0;'
      + 'border-radius:0;padding:8px 0 0}');
  });

  /** ⚠️ EN PLEIN ÉCRAN, RIEN NE CHANGE : là, les blocs ONT besoin de leur cadre pour se distinguer. */
  it('⚠️ le plein écran garde ses blocs encadrés', () => {
    expect(VUE).toContain('.gst-bloc{display:flex;flex-direction:column;gap:8px;'
      + 'background:var(--color-svv-field);border:1px solid var(--color-svv-line)');
  });
});

describe('🔴🔴 ⑤ plus de compteur d’échanges sur la carte', () => {
  it('🔴🔴 « N échange(s) » a quitté la vignette', () => {
    expect(CARTE).not.toContain("{carte.nbFils} échange{carte.nbFils > 1 ? 's' : ''}");
  });

  /** 🔴 LA LIGNE « Ouvert depuis N jours · dernier échange il y a N jours » RESTE (Arno). */
  it('🔴 les deux anciennetés restent', () => {
    expect(CARTE).toContain('Ouvert depuis {motJours(ouvertDepuis)}');
    expect(CARTE).toContain('dernier échange il y a {motJours(dernier)}');
  });

  /** ⚠️ ET LA LIGNE DU TYPE DISPARAÎT QUAND ELLE N'A PLUS RIEN À PORTER, plutôt que de laisser un vide. */
  it('⚠️ sans type, la ligne entière ne se rend pas', () => {
    expect(CARTE).toContain('{typeEvenement !== null && (\n                <span className="gst-carte-bas">');
  });
});
