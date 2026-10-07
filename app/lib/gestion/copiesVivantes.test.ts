import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MOT_INCONNU_DU_DRIVE, motCompteur, sqlCopieVivante } from './localisationDrive';

/**
 * ══ 🔴🔴 LOT PASTILLE-COPIES-VIVANTES — LA PASTILLE ET LA LOUPE COMPTENT LE MÊME ENSEMBLE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026, fil 36764 / message 57625, fenêtre « Ranger 2 pièces dans le Drive ») : « sur
 * 2035126.PDF, pas encore rangée, la loupe affiche “1 emplacement connu”, et la pastille verte “1” apparaît sur
 * les deux pièces. »
 *
 * ═══ 🔴🔴 CE QUE LA MESURE A DIT, ET IL FAUT LE DIRE EN PREMIER ═════════════════════════════════════════════════
 *
 * LE FICHIER EXISTE. Vérifié par le chemin de lecture de l'application, qui demande le fichier à Google (et
 * `lireMetadonnees` REFUSE un fichier à la corbeille) :
 *
 *     Drive › Documents clients scannés › 1 actifs › Bile › Huissier › « 2035126 (1).PDF »
 *     md5 856cbe59762dbd01d7f7f9fa4f109586 · 1 364 794 octets · déposé le 06/10/2026 à 16:31:08
 *
 * Même chose pour la seconde pièce (« 2035125 (1).PDF », md5 e6e122db…). Le « 1 » n'est donc NI une entrée
 * fantôme, NI une copie à la corbeille, NI un index périmé, NI la pièce qui se compterait elle-même : c'est un
 * vrai document, vivant, de contenu identique. La loupe dit vrai.
 *
 * ⚠️ MAIS `parRegistre: 0`, ET LA VOIE EST « empreinte » : cette application n'a JAMAIS rangé ces pièces. Le
 * rapprochement vient de l'index des empreintes, c'est-à-dire d'un fichier que quelqu'un a déposé à la main dans
 * l'archive. Mesuré sur toute la base : **35 pièces** sur 27 190 sont dans ce cas.
 *
 * ═══ 🔴 LES ENTRÉES FAUSSES EN BASE : IL N'Y EN A PAS ═══════════════════════════════════════════════════════════
 *
 * Mesuré le 07/10/2026 : sur **26 553** lignes vives du registre (`gestion_piece_drive`), **0** pointe vers un
 * fichier que l'index donne pour disparu, et **0** vers un fichier qu'il ne connaît pas. Rien à corriger —
 * la correction demandée au point 3 était conditionnelle, et sa condition n'est pas remplie.
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER TIENT ═════════════════════════════════════════════════════════════════════════════
 *
 * DÉCISION D'ARNO : « la pastille et la loupe ne comptent que les copies vivantes du Drive (hors corbeille, hors
 * fantômes). À 0 : pas de pastille verte, et la loupe affiche “Document inconnu du Drive” (aucun lien). »
 *
 * Les deux comptes partent des deux MÊMES tables — le registre des dépôts et l'index des empreintes — et chacune
 * écrivait sa propre condition de vie. Elles lisent maintenant UN seul fragment. L'égalité des deux compteurs est
 * donc vraie par CONSTRUCTION, et ce fichier interdit qu'une troisième écriture réapparaisse.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const EMPREINTE = readFileSync('app/lib/gestion/empreinteDriveRepo.ts', 'utf8');
const MOUVEMENT = readFileSync('app/lib/gestion/driveMouvementRepo.ts', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/drive/localiser/route.ts', 'utf8');

describe('« une copie vivante » n’est définie qu’une fois', () => {
  it('🔴 le fragment vaut pour l’alias demandé', () => {
    expect(sqlCopieVivante('d')).toBe('d.disparu_le IS NULL');
    expect(sqlCopieVivante('gestion_drive_empreinte')).toBe('gestion_drive_empreinte.disparu_le IS NULL');
  });

  /**
   * 🔴🔴 LES DEUX TABLES LE LISENT, et aucune ne réécrit la condition. C'est ce qui rend l'égalité « pastille =
   * loupe » vraie par construction : les deux comptes partent de ces deux requêtes-ci, et d'elles seules.
   */
  it('🔴🔴 les deux dépôts appellent le fragment, et n’écrivent plus la condition à la main', () => {
    expect(EMPREINTE).toContain("sqlCopieVivante('gestion_drive_empreinte')");
    expect(MOUVEMENT).toContain("sqlCopieVivante('d')");
    for (const src of [EMPREINTE, MOUVEMENT]) {
      // Aucune écriture à la main de la règle dans le SQL de ces deux dépôts.
      expect(src).not.toMatch(/\b\w+\.disparu_le IS NULL/);
    }
  });

  /**
   * ⚠️ L'INDEX NE REND QUE DES FICHIERS, jamais des dossiers : un dossier de même nom n'est pas une copie du
   * document, et le compter ferait annoncer un emplacement où il n'y a rien à ouvrir.
   */
  it('⚠️ et l’index écarte les dossiers en plus des disparus', () => {
    expect(EMPREINTE).toContain('AND NOT est_dossier');
  });
});

describe('la loupe et la pastille partent du même ensemble', () => {
  /**
   * 🔴🔴 UN SEUL CALCUL D'IDENTIFIANTS, PUIS DEUX SORTIES. `?compte=1` s'arrête APRÈS `ids` et rend
   * `nombre: ids.length` ; la loupe continue et vérifie chaque identifiant chez Google. Si la route calculait
   * `ids` deux fois — une par mode —, les deux chiffres pourraient diverger sans que rien ne le signale.
   */
  it('🔴🔴 la route ne calcule les identifiants qu’UNE fois, pour les deux modes', () => {
    expect(ROUTE.split('const ids = [...voieDe.keys()]').length - 1).toBe(1);
    expect(ROUTE).toContain('nombre: ids.length');
    // Et le mode « compte » s'arrête bien là : il ne refait pas sa propre lecture.
    expect(ROUTE.indexOf('if (compteSeul)')).toBeGreaterThan(ROUTE.indexOf('const ids = [...voieDe.keys()]'));
  });

  /**
   * ══ 🔴🔴 LE SEUL ÉCART QUI SUBSISTE, ET IL EST ÉCRIT NOIR SUR BLANC ════════════════════════════════════════
   *
   * La LOUPE demande chaque fichier à Google, et `lireMetadonnees` refuse un fichier à la corbeille ; la
   * PASTILLE ne fait aucun appel Google — c'est ce qui la rend gratuite sur une colonne de dix vignettes. Une
   * copie mise à la corbeille APRÈS le dernier relevé de l'index est donc encore comptée par la pastille, et
   * déjà écartée par la loupe. L'écart se referme au relevé suivant.
   *
   * 🔴 ON NE LE CORRIGE PAS EN FAISANT APPELER GOOGLE À LA PASTILLE : ce serait un `files.get` par vignette à
   * chaque ouverture de la fenêtre, pour un chiffre. On l'ÉCRIT, à l'endroit où quelqu'un le cherchera.
   */
  it('🔴🔴 le refus de la corbeille vit dans la lecture Google, et la route s’y fie', () => {
    const lecture = readFileSync('app/lib/gestion/drive.ts', 'utf8');
    expect(lecture).toContain("return { ok: false, motif: 'Ce fichier est à la corbeille du Drive.' };");
    // La loupe écarte tout ce qu'elle ne sait plus lire — donc aussi ce qui est à la corbeille.
    expect(ROUTE).toContain('if (!l.meta.ok) continue;');
  });
});

describe('ce que l’écran dit à zéro', () => {
  it('🔴 à zéro : « Document inconnu du Drive », et le mot vient du module pur', () => {
    expect(motCompteur(0)).toBe(MOT_INCONNU_DU_DRIVE);
    expect(MOT_INCONNU_DU_DRIVE).toBe('Document inconnu du Drive');
  });

  it('🔴 au-dessus de zéro, « connu(s) » reste — l’exhaustivité n’est jamais promise', () => {
    expect(motCompteur(1)).toBe('1 emplacement connu');
    expect(motCompteur(2)).toBe('2 emplacements connus');
  });

  /**
   * 🔴 LA PASTILLE VERTE EST MASQUÉE À ZÉRO, et c'est une règle, pas un détail d'affichage : un « 0 » vert se
   * lirait comme une bonne nouvelle alors qu'il dit exactement le contraire.
   */
  it('🔴 la pastille verte ne paraît pas à zéro', () => {
    const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');
    expect(ecran).toContain('(comptesRanges.get(`piece:${x.pieceId}`) ?? 0) > 0 && (');
  });
});
