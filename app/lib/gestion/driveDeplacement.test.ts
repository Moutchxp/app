import { describe, expect, it } from 'vitest';
import {
  COPIE_RECURSIVE_MAX, descendDe, DUREE_ANNULATION_MS, empiler, estCoupe, estFichierSystemeMac,
  infobulleFichierSysteme, motColler, motMouvementFait, motProchaineAnnulation, MOT_FICHIER_SYSTEME, nomReelDe,
  peutMouvoir, verdictCopieRecursive, type ContexteMouvement,
} from './driveDeplacement';
import { DOSSIER_INTERDIT_LECTURE, indexerMaillons, type Maillon } from './driveLectureFichier';

/**
 * LOT DRIVE-DEPLACER — LA RÈGLE DU DÉPLACEMENT, REJOUÉE SANS RÉSEAU.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUI SE JOUE ICI. Décision d'Arno du 29/09/2026 : l'application peut DÉPLACER et COPIER dans le Drive du
 * cabinet. Le prix de cette permission est un garde exhaustif, et un garde ne vaut que s'il est rejoué :
 *   ① rien ne va VERS « Documents clients scannés », à aucune profondeur ;
 *   ② rien n'en SORT ;
 *   ③ le dossier lui-même ne bouge pas ;
 *   ④ aucun de ses ANCÊTRES ne bouge — l'interdit qu'on oublie, et le plus dangereux : déplacer « GESTION
 *      LOCATIVE » emporterait l'archive sans qu'aucune vérification portant sur l'archive ne s'en aperçoive.
 *
 * ⚠️ `sorte` NE CHANGE RIEN AUX INTERDITS : une copie tirée de l'archive serait exactement la fuite que l'archive
 * interdit. Chaque refus est donc éprouvé POUR LES DEUX GESTES.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * L'ARBORESCENCE D'ESSAI, celle du cabinet en réduction :
 *
 *   GESTION LOCATIVE (drive)
 *   ├── Documents clients scannés (archive)      ← protégée
 *   │   └── 1 actifs (a1)
 *   │       └── DUPONT (a2)
 *   │           └── avis.pdf (aFichier)
 *   ├── Base de données locative (base)
 *   │   ├── Travaux (travaux)
 *   │   │   └── Devis (devis)
 *   │   └── bail.pdf (bail)
 *   └── Divers (divers)
 */
const ARBRE: Maillon[] = [
  { id: 'drive', nom: 'GESTION LOCATIVE', parentId: null },
  { id: 'archive', nom: DOSSIER_INTERDIT_LECTURE, parentId: 'drive' },
  { id: 'a1', nom: '1 actifs', parentId: 'archive' },
  { id: 'a2', nom: 'DUPONT', parentId: 'a1' },
  { id: 'aFichier', nom: 'avis.pdf', parentId: 'a2' },
  { id: 'base', nom: 'Base de données locative', parentId: 'drive' },
  { id: 'travaux', nom: 'Travaux', parentId: 'base' },
  { id: 'devis', nom: 'Devis', parentId: 'travaux' },
  { id: 'bail', nom: 'bail.pdf', parentId: 'base' },
  { id: 'divers', nom: 'Divers', parentId: 'drive' },
];

const CTX: ContexteMouvement = {
  index: indexerMaillons(ARBRE),
  // 🔴 L'ARCHIVE ET SES ANCÊTRES : c'est la route qui les résout chez Google ; ici on les pose tels qu'elle les rend.
  proteges: new Set(['archive']),
  protegesEtAncetres: new Set(['archive', 'drive']),
};

const DEUX_GESTES = ['deplacer', 'copier'] as const;

function verdict(o: {
  source: string; cible: string; dossier?: boolean; parent?: string | null;
}, sorte: 'deplacer' | 'copier', ctx: ContexteMouvement = CTX) {
  return peutMouvoir({
    sourceId: o.source, cibleId: o.cible, sourceEstDossier: o.dossier ?? false,
    parentActuel: o.parent ?? null, sorte,
  }, ctx);
}

describe('🔴🔴 « Documents clients scannés » : rien n’y entre, rien n’en sort, il ne bouge pas', () => {
  for (const sorte of DEUX_GESTES) {
    it(`① ${sorte} VERS l’archive elle-même : refusé`, () => {
      const v = verdict({ source: 'bail', cible: 'archive' }, sorte);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motif).toContain(DOSSIER_INTERDIT_LECTURE);
    });

    it(`① ${sorte} VERS un sous-dossier de l’archive, à trois niveaux : refusé`, () => {
      for (const cible of ['a1', 'a2']) {
        const v = verdict({ source: 'bail', cible }, sorte);
        expect(v.ok, `cible ${cible}`).toBe(false);
      }
    });

    it(`② ${sorte} DEPUIS l’archive, à toute profondeur : refusé`, () => {
      for (const source of ['a1', 'a2', 'aFichier']) {
        const v = verdict({ source, cible: 'base', dossier: source !== 'aFichier' }, sorte);
        expect(v.ok, `source ${source}`).toBe(false);
        if (!v.ok) expect(v.motif).toContain('Rien n’en sort');
      }
    });

    it(`③ ${sorte} L’ARCHIVE ELLE-MÊME : refusé`, () => {
      const v = verdict({ source: 'archive', cible: 'base', dossier: true }, sorte);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motif).toContain('ne se déplace pas');
    });

    /**
     * 🔴🔴 L'INTERDIT ④, CELUI QU'ON OUBLIE. « GESTION LOCATIVE » ne contient pas de secret en propre — mais il
     * CONTIENT l'archive. Le déplacer l'emporterait, et une vérification qui ne regarde que l'archive ne verrait
     * jamais rien passer.
     */
    it(`④ ${sorte} un ANCÊTRE de l’archive : refusé`, () => {
      const v = verdict({ source: 'drive', cible: 'divers', dossier: true }, sorte);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motif).toContain('emporterait l’archive');
    });
  }

  it('un déplacement ORDINAIRE, loin de l’archive, reste permis — le garde n’interdit pas tout', () => {
    expect(verdict({ source: 'bail', cible: 'travaux', parent: 'base' }, 'deplacer').ok).toBe(true);
    expect(verdict({ source: 'travaux', cible: 'divers', dossier: true, parent: 'base' }, 'copier').ok).toBe(true);
  });
});

describe('🔴 ne pas savoir vaut interdit', () => {
  it('une chaîne TROUÉE (parent absent de l’index) est refusée', () => {
    const ctx: ContexteMouvement = {
      index: indexerMaillons([{ id: 'orphelin', nom: 'x', parentId: 'inconnu' }, ...ARBRE]),
      proteges: CTX.proteges, protegesEtAncetres: CTX.protegesEtAncetres,
    };
    const v = verdict({ source: 'orphelin', cible: 'base' }, 'deplacer', ctx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('par précaution');
  });

  it('un CYCLE est refusé, et ne fait pas boucler le programme', () => {
    const ctx: ContexteMouvement = {
      index: indexerMaillons([
        { id: 'x', nom: 'x', parentId: 'y' }, { id: 'y', nom: 'y', parentId: 'x' }, ...ARBRE,
      ]),
      proteges: CTX.proteges, protegesEtAncetres: CTX.protegesEtAncetres,
    };
    const v = verdict({ source: 'x', cible: 'base' }, 'deplacer', ctx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('incohérente');
  });

  it('une source ou une cible vide est refusée, sans rien tenter', () => {
    expect(verdict({ source: '', cible: 'base' }, 'deplacer').ok).toBe(false);
    expect(verdict({ source: 'bail', cible: '  ' }, 'copier').ok).toBe(false);
  });
});

describe('un dossier ne se perd pas dans lui-même', () => {
  it('dans lui-même : refusé', () => {
    const v = verdict({ source: 'travaux', cible: 'travaux', dossier: true }, 'deplacer');
    expect(v.ok).toBe(false);
  });

  it('dans sa propre descendance : refusé', () => {
    const v = verdict({ source: 'travaux', cible: 'devis', dossier: true, parent: 'base' }, 'deplacer');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('sous-dossiers');
  });

  it('un FICHIER homonyme d’un dossier n’est pas concerné par cette règle', () => {
    expect(verdict({ source: 'bail', cible: 'devis', parent: 'base' }, 'deplacer').ok).toBe(true);
  });

  /**
   * ⚠️ LES DEUX « JE NE SAIS PAS » NE SE RÉPONDENT PAS PAREIL, ET C'EST VOULU :
   *   · un CYCLE → VRAI, donc refus ici, avec le motif « dans sa propre descendance » — ce qu'un cycle EST ;
   *   · une chaîne INCONNUE → FAUX ici, et `peutMouvoir` la refuse juste après, par `situer`, avec le motif
   *     d'un emplacement qu'on n'a pas su lire. Répondre VRAI donnerait le bon refus pour la mauvaise raison,
   *     est ce qui fait chercher au mauvais endroit.
   */
  it('descendDe : le cycle refuse, la chaîne inconnue laisse `situer` refuser avec le bon motif', () => {
    expect(descendDe('devis', 'travaux', indexerMaillons(ARBRE))).toBe(true);
    expect(descendDe('divers', 'travaux', indexerMaillons(ARBRE))).toBe(false);
    expect(descendDe('fantome', 'travaux', indexerMaillons(ARBRE))).toBe(false);
    const cycle = indexerMaillons([{ id: 'x', nom: 'x', parentId: 'y' }, { id: 'y', nom: 'y', parentId: 'x' }]);
    expect(descendDe('x', 'travaux', cycle)).toBe(true);
    // Et le refus arrive bien, par l'autre porte, avec le motif de l'emplacement inconnu.
    const v = verdict({ source: 'travaux', cible: 'fantome', dossier: true, parent: 'base' }, 'deplacer');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('Emplacement');
  });
});

describe('déposer là où l’on est déjà', () => {
  it('un DÉPLACEMENT vers le dossier courant le dit, au lieu de ne rien faire en silence', () => {
    const v = verdict({ source: 'bail', cible: 'base', parent: 'base' }, 'deplacer');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('déjà dans ce dossier');
  });

  /**
   * ⚠️ UNE COPIE AU MÊME ENDROIT, ELLE, A UN SENS — c'est le doublon de Google Drive : les deux sont conservés,
   * rien n'est écrasé. C'est exactement ce qu'Arno a demandé pour les doublons de nom.
   */
  it('une COPIE vers le dossier courant est permise : c’est le doublon de Google Drive', () => {
    expect(verdict({ source: 'bail', cible: 'base', parent: 'base' }, 'copier').ok).toBe(true);
  });
});

describe('la mémoire tampon — couper, copier, coller', () => {
  it('un élément coupé est estompé ; un élément copié ne l’est pas', () => {
    const coupe = { mode: 'couper' as const, ids: ['a', 'b'], dossiers: [], parentSource: 'base' };
    expect(estCoupe(coupe, 'a')).toBe(true);
    expect(estCoupe(coupe, 'z')).toBe(false);
    expect(estCoupe({ ...coupe, mode: 'copier' }, 'a')).toBe(false);
    expect(estCoupe(null, 'a')).toBe(false);
  });

  it('le mot de « Coller » annonce ce qui va se passer, et combien', () => {
    expect(motColler(null)).toBe('Coller ici');
    expect(motColler({ mode: 'couper', ids: ['a'], dossiers: [], parentSource: null })).toContain('déplacer 1 élément');
    expect(motColler({ mode: 'copier', ids: ['a', 'b'], dossiers: ['b'], parentSource: null })).toContain('copier 2 éléments');
  });
});

describe('la copie récursive est BORNÉE, et refusée en bloc au-delà', () => {
  it('sous la borne : on annonce le nombre exact', () => {
    const v = verdictCopieRecursive(37, 'Travaux');
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.elements).toBe(37); expect(v.phrase).toContain('37 éléments'); }
  });

  it('exactement à la borne : encore permis', () => {
    expect(verdictCopieRecursive(COPIE_RECURSIVE_MAX, 'Travaux').ok).toBe(true);
  });

  /**
   * 🔴 ON REFUSE EN BLOC. Copier « les deux cents premiers » donnerait un dossier incomplet dont personne ne
   * saurait qu'il l'est — c'est pire qu'un refus, parce que ça ne se voit pas.
   */
  it('au-delà : refusé EN BLOC, jamais tronqué', () => {
    const v = verdictCopieRecursive(COPIE_RECURSIVE_MAX + 1, 'Travaux');
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.motif).toContain(String(COPIE_RECURSIVE_MAX));
      expect(v.motif).toContain('un par un');
    }
  });

  it('un dossier vide ou à un seul élément se dit sans nombre', () => {
    const v = verdictCopieRecursive(1, 'Travaux');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.phrase).not.toMatch(/\d/);
  });
});

describe('le bandeau « Annuler »', () => {
  it('dix secondes : le temps de s’apercevoir qu’on s’est trompé', () => {
    expect(DUREE_ANNULATION_MS).toBe(10_000);
  });

  it('un déplacement et une copie ne se disent pas du même mot', () => {
    expect(motMouvementFait('deplacer', 3, 'Travaux')).toContain('3 éléments déplacés vers « Travaux »');
    expect(motMouvementFait('copier', 1, 'Travaux')).toContain('1 élément copié');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT DRIVE-RETOUCHES-2 — LA PILE DES DÉPLACEMENTS DE LA SESSION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 « Annuler le dernier déplacement » — la pile', () => {
  const pas = (n: number, nom = 'Sous-dossier', nombre = 1, origineNom = 'Destination') =>
    ({ mouvements: [n], nom, nombre, origineNom });

  it('empile dans l’ordre, et chaque clic défera le plus récent', () => {
    const p = empiler(empiler([], pas(1, 'A')), pas(2, 'B'));
    expect(p.map((x) => x.nom)).toEqual(['A', 'B']);
    expect(motProchaineAnnulation(p)).toContain('« B »');
  });

  /**
   * 🔴🔴 UNE COPIE N'ENTRE JAMAIS DANS LA PILE, et c'est ce qui fait que le bouton les « saute » sans avoir à le
   * savoir : l'annuler voudrait dire la SUPPRIMER, et l'application ne supprime rien. Une copie n'a donc aucune
   * ligne de journal annulable — `mouvements` y est vide, et c'est ce vide qui la tient dehors.
   */
  it('🔴🔴 une copie (aucune ligne de journal) n’entre pas dans la pile', () => {
    const p = empiler([], { mouvements: [], nom: 'Copie', nombre: 1, origineNom: 'X' });
    expect(p).toEqual([]);
  });

  it('un lot compte pour UN pas, et le mot le dit', () => {
    expect(motProchaineAnnulation([pas(7, 'bail.pdf', 5, 'Travaux')]))
      .toBe('Remettre les 5 éléments déplacés dans « Travaux »');
  });

  it('un seul élément est nommé', () => {
    expect(motProchaineAnnulation([pas(7, 'bail.pdf', 1, 'Travaux')]))
      .toBe('Remettre « bail.pdf » dans « Travaux »');
  });

  /** ⚠️ PILE VIDE : le bouton est grisé, et son infobulle dit POURQUOI — y compris le cas qui surprend. */
  it('🔴 pile vide : l’infobulle explique, et nomme le cas de la copie', () => {
    const mot = motProchaineAnnulation([]);
    /**
     * ⚠️ « déplacement » EST DEVENU « geste » LE 03/10/2026 (lot DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE) : la pile
     * contient désormais aussi des mises à la corbeille, et annoncer « aucun déplacement » aurait laissé croire
     * qu'une corbeille, elle, serait peut-être annulable ailleurs.
     */
    expect(mot).toContain('Aucun geste à annuler');
    expect(mot).toContain('copie');
    expect(mot).toContain('supprimer définitivement');
  });

  /**
   * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — UNE CORBEILLE SE DÉFAIT, ET LE MOT LE DIT ════════════════
   *
   * Arno : « “Annuler le dernier déplacement” sait aussi annuler une mise à la corbeille (restauration). » Les
   * deux pas vivent dans la même pile ; seul le MOT change, parce que le geste change.
   */
  it('🔴🔴 un pas de corbeille annonce une SORTIE de corbeille, pas un déplacement', () => {
    const corbeille = { ...pas(9, '0851_001.pdf', 1, 'Test'), sorte: 'corbeille' as const };
    const mot = motProchaineAnnulation([corbeille]);
    expect(mot).toBe('Sortir « 0851_001.pdf » de la corbeille du Drive');
    expect(mot).not.toContain('Remettre');
    expect(motProchaineAnnulation([{ ...corbeille, nombre: 3 }]))
      .toContain('les 3 fichiers mis à la corbeille');
  });

  /** ⚠️ ET UN PAS SANS `sorte` RESTE UN DÉPLACEMENT : tout ce qui existait avant ce lot est inchangé. */
  it('⚠️ un pas sans `sorte` se lit comme un déplacement', () => {
    expect(motProchaineAnnulation([pas(7, 'bail.pdf', 1, 'Travaux')]))
      .toBe('Remettre « bail.pdf » dans « Travaux »');
  });

  it('empiler ne modifie pas la pile reçue', () => {
    const avant = [pas(1)];
    empiler(avant, pas(2));
    expect(avant).toHaveLength(1);
  });
});

/**
 * ══ 🔴 LES FICHIERS « ._ » — les AppleDouble de macOS ════════════════════════════════════════════════════════════
 *
 * Ils RESTENT AFFICHÉS (demande d'Arno) : les masquer ferait croire que le Drive a moins de fichiers qu'il n'en a.
 * Mais ils ne contiennent pas le document — les joindre enverrait une pièce jointe qui MENT, portant presque le nom
 * d'un vrai document et ne pesant que quelques kilooctets.
 */
describe('les fichiers système de macOS', () => {
  it('reconnus par leur préfixe, et par lui seul', () => {
    expect(estFichierSystemeMac('._bail.pdf')).toBe(true);
    expect(estFichierSystemeMac('  ._bail.pdf')).toBe(true);
    expect(estFichierSystemeMac('bail.pdf')).toBe(false);
    // ⚠️ Un point initial seul (.DS_Store, .gitignore) n'est PAS un AppleDouble : la règle est « ._ », pas « . ».
    expect(estFichierSystemeMac('.DS_Store')).toBe(false);
    expect(estFichierSystemeMac('bail._2024.pdf')).toBe(false);
  });

  it('leur type le DIT, et leur infobulle renvoie au vrai fichier, par son nom', () => {
    expect(MOT_FICHIER_SYSTEME).toBe('Fichier système Mac');
    expect(nomReelDe('._avis 2024.pdf')).toBe('avis 2024.pdf');
    const bulle = infobulleFichierSysteme('._avis 2024.pdf');
    expect(bulle).toContain('avis 2024.pdf');
    expect(bulle).toContain('ne contient pas le document');
  });
});
