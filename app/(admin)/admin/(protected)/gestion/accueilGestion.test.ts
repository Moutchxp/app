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

describe('🔴🔴 ③ la barre Annuaire est au-dessus des deux colonnes', () => {
  it('🔴🔴 elle est rendue juste avant `gst-deux`', () => {
    const b = VUE.indexOf('<BarreAnnuaire ');
    const d = VUE.indexOf('<div className="gst-deux">');
    expect(b).toBeGreaterThan(-1);
    expect(b).toBeLessThan(d);
  });

  /** 🔴 ET SON CLIC OUVRE LA FICHE PAR LE CHEMIN EXISTANT : le même `fiche` que l'écran Annuaire reçoit. */
  it('🔴 le clic passe par l’écran Annuaire et sa fiche', () => {
    expect(VUE).toContain("aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: f })");
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
