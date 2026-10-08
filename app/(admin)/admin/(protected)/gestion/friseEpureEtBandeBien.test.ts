/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LOT FRISE-EPURE-ET-BANDE-BIEN (08/10/2026) — LE CARRÉ S'ÉPURE, LA BANDE S'ALIGNE ════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   1. « L'horodatage reste enregistré et utilisé à la seconde près pour l'ordre chronologique et la règle
 *      vert/orange (rien ne change dans le calcul). Mais l'affichage sous chaque carte redevient : “créée le
 *      JJ/MM/AAAA” — sans heure ni secondes. Aucun affichage de l'heure ailleurs non plus. »
 *   2. « Dans chaque carré, il ne reste QUE la rangée de 3 pictos au pied : ✎ (modifier) · i (bulle) · … (menu).
 *      RETIRER les doublons du haut du carré : le ✎ rouge à côté du titre, et le “…” en haut à droite. Toutes
 *      les fonctions qu'ils portaient restent accessibles via les 3 pictos du bas […]. L'information “ajoutée à
 *      la main” / “venue de Monga” que portait le ✎ rouge (ou le ◆) n'est pas perdue : elle s'affiche en tête de
 *      la bulle du “i” […], avant le texte. La poignée ⠿ reste en haut à gauche. Le titre, la date et le montant
 *      restent centrés ligne par ligne. Mêmes règles sur Clôture / Réouverture / Clôture Monga. »
 *   3. « Elle doit avoir EXACTEMENT la même largeur et le même alignement que les boutons du pied de carte
 *      (“Historique”, “Dossier Drive du lot”) : toute la largeur utile, avec la même petite marge à gauche et à
 *      droite. Rien d'autre ne change (couleur, texte, puce, comportement au clic). »
 *
 * ⚠️ LE « … » DU HAUT N'EXISTAIT DÉJÀ PLUS quand ce lot a commencé : il est descendu dans la rangée du bas au lot
 * FRISE-HORODATAGE-SECONDE-ET-PICTOS, avec l'accord d'Arno pour ce déplacement. Le point 2 ne retire donc qu'une
 * chose, le ✎ rouge du titre — et ces épreuves tiennent les DEUX absences, pour qu'aucun des deux ne revienne.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EtapeAAfficher } from '../../../../lib/gestion/frise';
import { cartesHorsChronologie, mentionCreation, motOrigineCarte } from '../../../../lib/gestion/frise';

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
/** La feuille de la frise, isolée. */
const FEUILLE = (/const CSS_FRISE_AVANCEMENT = `([\s\S]*?)\n`;/.exec(FRISE)?.[1] ?? '');

let n = 0;
const etape = (p: Partial<EtapeAAfficher>): EtapeAAfficher => ({
  id: (n += 1), reference: null, type: 'devis_recu', survenuLe: '2026-10-11 00:00:00+02', heureConnue: false,
  heureFin: null, numero: null, rang: null, montantCents: null, texte: null, auteur: null,
  source: 'manuelle', certitude: 'fiable', messageId: null, aEuUnMail: false, filId: null,
  creeParLibelle: 'Arnaud', creeLe: '2026-10-08 21:26:38+02', titre: null, pieceNom: null,
  rangDevis: null, rangPose: 1, poseChoisie: false, ...p,
});

describe('🔴🔴 ① la date de création perd son heure, le calcul la garde', () => {
  /** 🔴 L'AFFICHAGE : plus d'heure, plus de secondes, plus de point médian. */
  it('🔴🔴 la mention redevient « créée le JJ/MM/AAAA »', () => {
    expect(mentionCreation('2026-10-08 21:26:38.512+02').mot).toBe('créée le 08/10/2026');
    expect(mentionCreation('2026-10-08T21:26:38').mot).toBe('créée le 08/10/2026');
    /* ⚠️ ET AUCUN SÉPARATEUR ORPHELIN : une sortie qui garderait le « · » dirait qu'il manque quelque chose. */
    expect(mentionCreation('2026-10-08T21:26:38').mot).not.toContain('·');
  });

  /**
   * 🔴🔴 ET LA RÈGLE VERT/ORANGE N'A PAS BOUGÉ D'UN POUCE. C'est l'autre moitié de la demande, et la seule qui
   * puisse se casser en silence : si le calcul s'était mis à lire le jour, deux cartes posées dans la même
   * journée seraient devenues « à égalité », et aucune n'aurait plus jamais été signalée comme déplacée.
   */
  it('🔴🔴 deux cartes du même jour restent départagées par leurs secondes', () => {
    const tot = { cle: 'a', creeLe: '2026-10-08 09:00:01' };
    const tard = { cle: 'b', creeLe: '2026-10-08 09:00:02' };
    expect(mentionCreation(tot.creeLe).mot).toBe(mentionCreation(tard.creeLe).mot);
    expect([...cartesHorsChronologie([tard, tot])]).toEqual(['b']);
    expect([...cartesHorsChronologie([tot, tard])]).toEqual([]);
  });

  /**
   * 🔴 « Aucun affichage de l'heure ailleurs non plus » — la LIGNE SOUS LA CARTE est la seule que ce lot
   * touche, et elle n'écrit plus d'heure. L'écran n'en fabrique aucune autre : il n'y a pas de second endroit
   * où l'horodatage de création serait mis en forme.
   *
   * ⚠️ `motAjout` RESTE, ET IL GARDE SON HEURE (« ajoutée le 08/10 à 21:26 par Arnaud », dans la bulle de
   * survol). Ce n'est pas un oubli : Arno l'a demandé nommément au lot FRISE-CONSTRUCTIBLE, exemple chiffré à
   * l'appui, et le retirer serait supprimer un élément existant sans son accord pour CELUI-LÀ.
   */
  it('🔴 la mise en forme de l’horodatage n’existe qu’à un seul endroit', () => {
    const module = readFileSync('app/lib/gestion/frise.ts', 'utf8');
    const corps = module.slice(module.indexOf('export function mentionCreation'));
    expect(corps.slice(0, 400)).not.toContain('slice(11');
    /* 🔴 ET L'ÉCRAN NE RECOMPOSE RIEN : il affiche `creation.mot`, sans y ajouter de sa main. */
    expect(FRISE).toContain('<LigneCreation creation={creation}');
    expect(FRISE).not.toContain('creeLe.slice(11');
  });
});

describe('🔴🔴 ② le carré n’a plus qu’une rangée de pictos', () => {
  /**
   * 🔴🔴 LE ✎ ROUGE DU TITRE A DISPARU, et sa classe avec lui. Les deux : un balisage retiré sans sa règle de
   * feuille laisse du code mort, et une règle sans balisage se lit comme une règle en vigueur.
   */
  it('🔴🔴 le pictogramme de source n’est plus dans le titre', () => {
    expect(FRISE).not.toContain('pictoSource');
    expect(FRISE).not.toContain('className="fav-picto"');
    expect(FEUILLE).not.toContain('.fav-picto{');
    /* ⚠️ ET IL EST SORTI DE LA LISTE DE LA CARTE VERTE PLEINE : plus rien à y repeindre. */
    expect(FEUILLE).not.toContain('.fav-carre--close .fav-picto,');
  });

  /** 🔴 LE « … » DU HAUT N'EST PAS REVENU NON PLUS — il était descendu au lot précédent. */
  it('🔴 aucun bouton n’est posé en absolu dans un coin du carré, hors la poignée', () => {
    expect(FRISE).not.toContain('className="fav-menu"');
    expect(FEUILLE).not.toContain('.fav-menu{');
    /* 🔴 LA POIGNÉE ⠿ RESTE EN HAUT À GAUCHE (Arno) : c'est la seule chose en absolu dans le carré. */
    expect(FEUILLE).toContain('.fav-poignee{position:absolute;left:3px;top:2px');
    expect(FRISE).toContain('<span aria-hidden="true">⠿</span>');
  });

  /**
   * 🔴🔴 LES TROIS PICTOS DU PIED SONT INTACTS, et ce sont eux qui portent tout : le crayon ouvre le
   * formulaire, le « i » la bulle, le « … » le détail. Aucune action n'a disparu avec le pictogramme retiré —
   * celui-ci n'en portait aucune, il INFORMAIT, et son information est passée dans la bulle.
   */
  it('🔴🔴 les trois pictos du pied portent les trois gestes', () => {
    expect(FRISE).toContain('onClick={() => onModifier(e)}>✎</button>');
    expect(FRISE).toContain('>i</button>');
    expect(FRISE).toContain('onClick={() => onOuvrir(detailOuvert ? null : `c${e.id}`)}>…</button>');
  });

  /**
   * 🔴🔴 « L'information […] n'est pas perdue : elle s'affiche en tête de la bulle du “i” […], avant le
   * texte » (Arno). EN TÊTE : l'origine est rendue AVANT le texte dans le balisage, et elle y est toujours,
   * même quand la carte n'a pas de commentaire.
   */
  it('🔴🔴 la bulle du « i » dit d’où vient la carte, avant le texte', () => {
    expect(motOrigineCarte(etape({ source: 'monga' }))).toBe('Importée de Monga');
    expect(motOrigineCarte(etape({ source: 'manuelle', creeParLibelle: 'Arnaud' })))
      .toBe('Ajoutée à la main par Arnaud');
    const bulle = FRISE.slice(FRISE.indexOf('<span className="fav-commentaire-origine">'),
      FRISE.indexOf('</div>\n        )}', FRISE.indexOf('<span className="fav-commentaire-origine">')));
    expect(bulle).toContain('{commentaire.origine}');
    /* 🔴 L'ORIGINE EST POSÉE AVANT LE TEXTE, et avant l'aveu « Aucun commentaire ». */
    expect(bulle.indexOf('commentaire.origine')).toBeLessThan(bulle.indexOf('Aucun commentaire'));
    expect(bulle.indexOf('commentaire.origine')).toBeLessThan(bulle.indexOf('commentaire.texte'));
  });

  /** ⚠️ ET LE LECTEUR D'ÉCRAN GARDE SA PHRASE, celle qu'il avait déjà : rien ne lui est retiré. */
  it('⚠️ la source reste lue au lecteur d’écran, comme avant', () => {
    expect(FRISE).toContain('<span className="fav-sr">{motSource(e)}</span>');
  });

  /** 🔴 LE TITRE, LA DATE ET LE MONTANT RESTENT CENTRÉS LIGNE PAR LIGNE (Arno) — le centrage vient du conteneur. */
  it('🔴 les textes du carré restent centrés', () => {
    expect(FEUILLE).toContain('text-align:center;background:none;border:0;cursor:pointer');
    expect(FEUILLE).toContain('.fav-titre--centree{font-weight:700}');
  });
});

describe('🔴🔴 ③ la bande « Événement en cours » s’aligne sur les boutons', () => {
  /**
   * 🔴🔴 MESURÉ AVANT CORRECTION (08/10/2026, fiche proprietaire-1, carte du lot 315) : carte 274→669,
   * bande 275→668 (393 px), bouton « Historique » 289→654 (365 px). La bande était donc 28 px plus large que
   * les boutons et collée aux deux bords de la carte, par-dessus les coins arrondis.
   *
   * 🔴 LA MARGE EST CELLE DES VOISINES, PAS UN CHIFFRE CHOISI : `.ann-carte-faits` et `.ann-carte-pied`
   * portent déjà 14 px de padding latéral. La bande les reprend, donc elle ne peut pas diverger d'elles.
   */
  it('🔴🔴 dans une carte de bien, la bande prend la marge du pied', () => {
    expect(ANNUAIRE).toContain('.ann-carte > .ann-cartouche{width:auto;margin:0 14px .35rem}');
    expect(ANNUAIRE).toContain('.ann-carte-pied{display:flex;flex-wrap:wrap;gap:.8rem;padding:0 14px 10px');
    expect(ANNUAIRE).toContain('.ann-carte-faits{display:grid;grid-template-columns:1fr;gap:.2rem;padding:11px 14px 8px}');
  });

  /**
   * ⚠️ `box-sizing:border-box` SUR LA RÈGLE DE BASE, et c'est l'autre moitié du défaut : avec `width:100%`,
   * un padding de .6rem et une bordure d'un pixel S'AJOUTENT à la largeur. Aucune règle globale ne pose
   * `border-box` dans ce dépôt — vérifié —, donc la bande débordait partout où elle valait 100 %.
   */
  it('🔴🔴 la bande ne peut plus dépasser sa place', () => {
    const regle = ANNUAIRE.slice(ANNUAIRE.indexOf('.ann-cartouche{'), ANNUAIRE.indexOf('.ann-cartouche:hover'));
    expect(regle).toContain('box-sizing:border-box');
    expect(regle).toContain('width:100%');
  });

  /**
   * 🔴🔴 ET LE MÊME CARTOUCHE EN TÊTE DE LA FICHE DU BIEN N'EST PAS TOUCHÉ. Il n'est pas dans une carte : la
   * règle nouvelle est bornée à `.ann-carte >`, et sa règle à lui garde sa marge. Toucher la règle de base
   * aurait décalé les deux, et Arno ne demande que la carte.
   */
  it('🔴🔴 le cartouche de la fiche du bien garde sa place', () => {
    expect(ANNUAIRE).toContain('.ann-tete + .ann-cartouche{margin:.1rem 0 .2rem;padding:.55rem .7rem;font-size:.85rem}');
  });

  /** 🔴 « Rien d'autre ne change » : la couleur, la puce, le texte et le clic sont ceux d'avant. */
  it('🔴 la couleur, la puce, le mot et le clic sont inchangés', () => {
    expect(ANNUAIRE).toContain('border:1px solid var(--color-svv-amber);background:var(--color-svv-amber-soft);color:var(--color-svv-amber);');
    expect(ANNUAIRE).toContain('<span aria-hidden="true" className="ann-cartouche-point">●</span>');
    expect(ANNUAIRE).toContain("const mot = nb > 1 ? `${nb} événements en cours` : 'Événement en cours';");
    expect(ANNUAIRE).toContain('<button type="button" className="ann-cartouche" onClick={onOuvrir}');
  });
});
