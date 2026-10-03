import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT CORBEILLE-DRIVE-REELLE-ET-SCROLL, POINT 2 — LE CÂBLAGE DE LA CORBEILLE ════════════════════════════
 *
 * Le CALCUL est éprouvé dans `corbeilleDriveListe.test.ts`, avec des données fabriquées. CE FICHIER éprouve ce que
 * seul le câblage peut dire : que la lecture ne demande QUE des métadonnées, que le garde-fou de l'archive est
 * prononcé par la ROUTE et pas seulement par l'écran, et qu'aucune suppression définitive n'existe nulle part sur
 * ce chemin.
 *
 * 🔴 POURQUOI STATIQUEMENT. Ce sont des propriétés DU CODE (« la route refuse », « aucun `files.delete` »), et
 * elles se lisent. Monter la route demanderait de doubler Google, et c'est alors la doublure qu'on éprouverait.
 */

const ROUTE = 'app/(admin)/api/admin/gestion/drive/corbeille/route.ts';
const route = readFileSync(ROUTE, 'utf8');
const drive = readFileSync('app/lib/gestion/drive.ts', 'utf8');
const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');
/** Le source SANS ses commentaires : une règle doit être dans le CODE, pas racontée au-dessus. */
/** Le corps de `reintegrerDeLaCorbeille`, borné par la fonction qui le suit dans le fichier. */
const geste_ecran = (): string => {
  const v = vif(ecran);
  const debut = v.indexOf('const reintegrerDeLaCorbeille = async (');
  expect(debut, 'reintegrerDeLaCorbeille introuvable').toBeGreaterThan(0);
  const fin = v.indexOf('const marquerEnVol = (', debut);
  expect(fin, 'borne de fin introuvable').toBeGreaterThan(debut);
  return v.slice(debut, fin);
};

const vif = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔒🔒 LIRE LA CORBEILLE — DES MÉTADONNÉES, ET RIEN D'AUTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 la lecture de la corbeille', () => {
  /**
   * 🔴 CHAQUE DÉTAIL DE CETTE REQUÊTE VIENT D'UNE MESURE SUR LE VRAI DRIVE (04/10/2026) :
   *   · `corpora=allDrives` rend « Mon Drive » ET chaque Drive partagé accessible — c'est la demande d'Arno ;
   *   · `trashedTime` existe et est renseigné sur les 100 entrées lues ;
   *   · `explicitlyTrashed` distingue un fichier jeté lui-même d'un fichier emporté par son dossier.
   */
  it('🔴 elle demande les deux corpus, et les champs mesurés', () => {
    const f = vif(drive).slice(vif(drive).indexOf('export async function listerCorbeille'));
    expect(f).toContain("q: 'trashed = true'");
    expect(f).toContain("corpora: 'allDrives'");
    expect(f).toContain('trashedTime');
    expect(f).toContain('explicitlyTrashed');
  });

  /**
   * 🔴🔴 AUCUN TRI DEMANDÉ À GOOGLE SUR LA DATE DE JET : `orderBy=trashedTime` rend HTTP 400 (mesuré). Et
   * `orderBy=recency`, qui PASSE, aurait donné un ordre plausible et FAUX — c'est la date du dernier accès. Le
   * tri se fait donc chez nous, et ce test interdit de « corriger » cela un jour.
   */
  it('🔴🔴 elle ne demande aucun `orderBy` — Google refuse celui qu’il faudrait', () => {
    const f = vif(drive).slice(vif(drive).indexOf('export async function listerCorbeille'),
      vif(drive).indexOf('export async function lireEntreeCorbeille'));
    expect(f).not.toContain('orderBy');
    expect(vif(route)).toContain('parJetLePlusRecent(lignes)');
  });

  /** 🔒 AUCUN OCTET DE CONTENU : pas d'`alt=media`, nulle part sur ce chemin. */
  it('🔒 aucun contenu n’est lu', () => {
    const f = vif(drive).slice(vif(drive).indexOf('export async function listerCorbeille'),
      vif(drive).indexOf('export interface MetaFichier'));
    expect(f).not.toContain('alt=media');
    expect(vif(route)).not.toContain('alt=media');
  });

  /**
   * ⚠️ LA PAGE EST BORNÉE, ET LA LISTE LE DIT. Mesuré : 21,5 SECONDES à 50 lignes avec des remontées en file,
   * parce que chaque ligne demande le CHEMIN de son dossier. À 25 lignes et 8 remontées en parallèle : 4,9 s.
   */
  it('⚠️ la page est bornée, et les remontées se font en parallèle', () => {
    expect(vif(route)).toContain('const CORBEILLE_PAR_PAGE = 25;');
    expect(vif(route)).toContain('const REMONTEES_EN_PARALLELE = 8;');
    expect(vif(route)).toContain('await Promise.all(parentsDistincts.slice(i, i + REMONTEES_EN_PARALLELE)');
    expect(vif(route)).toContain('tronque: r.valeur.pageSuivante !== null');
  });

  /**
   * 🔴🔴 « Drive » N'EST LE NOM DE RIEN — même mesure que `nommerLaRacine` au lot RANGER-ARBRE-2 : `files.get`
   * sur la racine d'un Drive partagé rend le mot générique. Sans ce rattrapage, la colonne « emplacement
   * d'origine » affichait « Drive » pour la moitié de la corbeille du cabinet — constaté à l'écran.
   */
  it('🔴🔴 la racine d’un Drive partagé porte son VRAI nom', () => {
    expect(vif(route)).toContain("tete.nom === 'Drive'");
    expect(vif(route)).toContain('nomDuDriveMemo(');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE GARDE-FOU EST PRONONCÉ PAR LA ROUTE, PAS PAR L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 « Documents clients scannés » — le garde-fou', () => {
  const geste = vif(route).slice(vif(route).indexOf('async function reintegrer('),
    vif(route).indexOf('async function restaurer('));

  /**
   * 🔴🔴 L'ARCHIVE EST RÉSOLUE AVANT TOUT, ET SON ÉCHEC ARRÊTE LE GESTE. Ne pas savoir où elle est, c'est ne pas
   * pouvoir affirmer qu'un fichier n'en vient pas — et une écriture ne se prend pas sur un doute.
   */
  it('🔴🔴 sans l’archive située, rien n’est réintégré', () => {
    expect(geste).toContain('const proteges = await idsProteges(');
    expect(geste).toContain('if (proteges === null)');
  });

  /**
   * 🔴🔴 LE VERDICT EST PRONONCÉ SUR LA CHAÎNE RÉELLE, remontée chez Google à CHAQUE appel — et avec
   * `inclureCorbeille`, parce que le fichier EST à la corbeille par définition. C'est exactement le défaut
   * corrigé pour « Annuler » le 03/10/2026 : sans ce drapeau la chaîne revient vide, et « ne pas savoir vaut
   * interdit » rendait le geste impossible.
   */
  it('🔴🔴 la chaîne est remontée chez Google, corbeille incluse', () => {
    expect(geste).toContain('await chaineParents(jeton.jeton, id, { fetch }, 32, { inclureCorbeille: true })');
    expect(geste).toContain('peutMettreCorbeille(');
    expect(geste).toContain("sorte: 'restaurer'");
  });

  /**
   * 🔴 LE MÊME MODULE PUR QUE L'ÉCRAN (`peutReintegrer`), et c'est tout l'intérêt : le bouton absent à l'écran et
   * le refus de la route disent la MÊME phrase, parce qu'ils viennent du même endroit.
   *
   * ⚠️ ET `protege` EST RECALCULÉ ICI sur la chaîne qu'on vient de remonter, jamais pris du navigateur.
   */
  it('🔴 la route rejoue le verdict de la ligne, sur sa propre lecture', () => {
    expect(geste).toContain('const protege = chaine.some((m) => proteges.proteges.has(m.id));');
    expect(geste).toContain('peutReintegrer({');
    expect(geste).toContain('jeteDirectement: entree.valeur.jeteDirectement');
  });

  /**
   * 🔴🔴 `explicitlyTrashed` VIENT DE GOOGLE, JAMAIS D'UNE DÉDUCTION. J'avais d'abord déduit cette réponse de la
   * longueur de la chaîne de parents : c'était FAUX, parce que `lireMetadonnees` refuse un fichier à la corbeille
   * et rend donc toujours un échec ici — la déduction se réduisait à « il a un parent », vrai de presque tout.
   */
  it('🔴🔴 « jeté lui-même » est lu, pas déduit', () => {
    expect(geste).toContain('await lireEntreeCorbeille(jeton.jeton, id, { fetch })');
    expect(geste).not.toContain('chaine.length > 1');
  });

  /** 🔴 L'ÉCRAN N'AFFICHE PAS DE BOUTON LÀ OÙ LA RÈGLE DIT NON — c'est du confort, et il vient du même module. */
  it('🔴 l’écran consulte le même verdict', () => {
    expect(vif(ecran)).toContain('const v = peutReintegrer(corbeille.archiveSituee ? l : { ...l, protege: true });');
    expect(vif(ecran)).toContain('? MENTION_DOSSIER_PROTEGE');
  });

  /**
   * ⚠️ ET LA LIGNE PROTÉGÉE EST AFFICHÉE, avec son aperçu. La masquer aurait été pire : on chercherait un
   * document qu'on ne voit pas, sans savoir pourquoi. L'aperçu est une LECTURE, et sa route la vérifie elle-même.
   */
  it('⚠️ une ligne protégée reste visible, et garde son aperçu', () => {
    const panneau = ecran.slice(ecran.indexOf('{corbeilleOuverte ? ('), ecran.indexOf(') : montrerRecents ? ('));
    expect(panneau).toContain('sfd-corbeille-oeil');
    expect(panneau).toContain('sfd-corbeille-motif');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴 RÉINTÉGRER MET LE REGISTRE À JOUR, ET LA LIGNE PART TOUT DE SUITE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ce que « Réintégrer » met à jour', () => {
  const geste = vif(route).slice(vif(route).indexOf('async function reintegrer('),
    vif(route).indexOf('async function restaurer('));

  /**
   * 🔴 LE REGISTRE ET L'INDEX SUIVENT, par le MÊME chemin que « Annuler » (`refletCorbeille`). Sans cela la
   * pastille verte resterait éteinte sur un document parfaitement revenu — un compteur qui ne sait que baisser
   * finit à zéro et ne dit plus rien.
   */
  it('🔴 le registre et l’index sont mis à jour, et le journal écrit', () => {
    expect(geste).toContain('await refletCorbeille([id], false);');
    expect(geste).toContain('await inscrireMouvement({');
    expect(geste).toContain("action: 'restaurer'");
    expect(geste).toContain('(réintégration)');
  });

  /** 🔴 ET L'ÉCRAN LE SAIT : la pastille et le picto se relisent, comme après « Annuler ». */
  it('🔴 l’écran relit les compteurs et prévient les autres écrans', () => {
    const cote = geste_ecran();
    expect(cote).toContain('relireComptes();');
    expect(cote).toContain('annoncerPiecesDrive();');
    expect(cote).toContain('oublierRetraitsDe([l.id]);');
    expect(cote).toContain('revaliderEnSilence(');
  });

  /** 🔴 LA LIGNE QUITTE LA CORBEILLE TOUT DE SUITE : attendre Google ferait croire que le geste n'a pas porté. */
  it('🔴 la ligne disparaît de la liste sans attendre Google', () => {
    expect(geste_ecran()).toContain('lignes: c.lignes.filter((x) => x.id !== l.id)');
  });

  /** ⚠️ UN FICHIER DÉJÀ SORTI LE DIT, au lieu de rejouer un geste sans objet — c'est la leçon du point 1. */
  it('⚠️ un fichier qui n’est plus à la corbeille le dit', () => {
    expect(geste).toContain('if (!entree.valeur.aLaCorbeille)');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔒🔒 AUCUNE SUPPRESSION DÉFINITIVE, NULLE PART SUR CE CHEMIN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 ce que ce chemin ne sait pas faire', () => {
  /**
   * 🔴 ARNO : « pas de suppression définitive, pas de “vider la corbeille” ». Ce n'est pas qu'on ne l'affiche pas
   * — c'est qu'AUCUN code de ce chemin ne sait le faire. Un bouton caché se retrouve ; une capacité absente, non.
   */
  it('🔒🔒 ni `files.delete`, ni `emptyTrash`, ni dans la route ni dans l’écran', () => {
    for (const mot of ['files.delete', 'emptyTrash', "method: 'DELETE'"]) {
      expect(vif(route), `route / ${mot}`).not.toContain(mot);
      expect(vif(ecran), `écran / ${mot}`).not.toContain(mot);
    }
  });

  /** 🔒 LA SEULE ÉCRITURE GOOGLE DE CETTE ROUTE RESTE `basculerCorbeille`, et elle n'a qu'un verbe. */
  it('🔒 une seule écriture Google, la même qu’avant ce lot', () => {
    /* ⚠️ SUR LE CODE VIF : ce module NOMME `files.delete` et `emptyTrash` dans son encadré, précisément pour
       dire qu'il ne les émet pas. Lire les commentaires ferait rougir le test sur la phrase qui le rassure. */
    const reel = vif(readFileSync('app/lib/gestion/driveCorbeilleReel.ts', 'utf8'));
    expect(reel).not.toContain('files.delete');
    expect(reel).not.toContain('emptyTrash');
    expect((vif(route).match(/basculerCorbeille\(/g) ?? []).length).toBe(3);
  });

  /** 🔒🔒 ET LA LECTURE DE LA CORBEILLE N'ÉCRIT RIEN DU TOUT : ni Drive, ni base. */
  it('🔒🔒 la lecture de la liste n’écrit rien', () => {
    /* ⚠️ LA BORNE EST `POST`, ET PAS `reintegrer` : dans le fichier, `mettre` vient entre les deux. Une borne
       trop lointaine aurait fait passer ce test pour le code d'une AUTRE fonction. */
    const liste = vif(route).slice(vif(route).indexOf('async function listeCorbeille('),
      vif(route).indexOf('export async function POST('));
    for (const mot of ['basculerCorbeille', 'inscrireMouvement', 'refletCorbeille', 'marquerCopie']) {
      expect(liste, mot).not.toContain(mot);
    }
  });
});
