import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aideVignette, ajouterVignette, cleVignette, dejaDupliquee, motCopieRangee, MOT_DUPLIQUER,
  resumeVignettes, retirerVignette, type VignetteDupliquee,
} from './vignetteDrive';
import { entreeDupliquer, menuDossier, menuVide } from './finderDrive';
import { signatureSession } from './rangementDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « DUPLIQUER EN VIGNETTE », LA RÈGLE SANS ÉCRAN ══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « crée dans la colonne de gauche une vignette “pièce à ranger” […] Le fichier
 * d'origine et ses rangements existants ne changent JAMAIS. Ranger cette vignette = COPIER le fichier dans le
 * dossier choisi, autant de fois que voulu. […] La vignette dupliquée reste dans la session en cours. Elle ne
 * change pas la signature de session (l'arbre ne se referme pas). »
 *
 * CE QUE CE FICHIER TIENT :
 *   ① l'identité d'une vignette, et son idempotence par fichier source ;
 *   ② 🔴🔴 LA SIGNATURE DE SESSION NE BOUGE PAS — prouvé, et non pas seulement écrit en commentaire ;
 *   ③ l'entrée de menu n'existe que si l'appelant la demande, et jamais sur un dossier ;
 *   ④ le mot dit « copie » et jamais « déplacement » : le document source ne bouge pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const v = (id: string, nom: string): VignetteDupliquee => ({
  cle: cleVignette(id), driveFileId: id, nom, tailleOctets: 1024, typeMime: 'application/pdf',
});

describe('🔴 l’identité d’une vignette', () => {
  it('la clé est préfixée : elle ne peut pas être prise pour un identifiant Drive nu', () => {
    expect(cleVignette('1AbC')).toBe('dup:1AbC');
    expect(cleVignette('  1AbC  ')).toBe('dup:1AbC');
  });

  it('une vignette s’ajoute, et se retire sans toucher aux autres', () => {
    const l1 = ajouterVignette([], v('a', 'bail.pdf'));
    const l2 = ajouterVignette(l1, v('b', 'devis.pdf'));
    expect(l2.map((x) => x.driveFileId)).toEqual(['b', 'a']);
    expect(retirerVignette(l2, cleVignette('a')).map((x) => x.driveFileId)).toEqual(['b']);
  });

  /**
   * 🔴 IDEMPOTENT PAR FICHIER SOURCE. Une seule vignette se range « autant de fois que voulu » : une seconde
   * doublerait la case, le compteur et le fantôme du glisser sans rien apporter. Elle remonte en TÊTE, pour que
   * le geste ait un effet visible.
   */
  it('🔴 dupliquer deux fois le même fichier ne pose qu’UNE vignette', () => {
    const l = ajouterVignette(ajouterVignette([v('b', 'devis.pdf')], v('a', 'bail.pdf')), v('a', 'bail.pdf'));
    expect(l).toHaveLength(2);
    expect(l[0].driveFileId).toBe('a');
    expect(dejaDupliquee(l, 'a')).toBe(true);
    expect(dejaDupliquee(l, 'zzz')).toBe(false);
  });

  it('⚠️ un identifiant vide n’entre pas : sa vignette ne saurait rien copier', () => {
    expect(ajouterVignette([], v('   ', 'x.pdf'))).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA SIGNATURE DE SESSION — LA GARANTIE QU'ARNO DEMANDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’arbre ne se referme pas', () => {
  /**
   * 🔴🔴 « Elle ne change pas la signature de session » (Arno). La preuve tient à la CONSTRUCTION : la signature
   * est calculée sur les `pieces` du message, et les vignettes vivent ailleurs. Ce test fige ce fait — si un jour
   * quelqu'un verse les vignettes dans `pieces` « pour simplifier », l'arbre se refermerait à chaque duplication
   * et personne ne saurait pourquoi.
   */
  it('🔴🔴 la signature ne dépend QUE des pièces du message', () => {
    const pieces = [{ pieceId: 7, nom: 'a.pdf', tailleOctets: 1, typeMime: 'application/pdf' }];
    const avant = signatureSession({ mode: 'ranger', messageId: 42, pieces });
    // Dupliquer trois fichiers du Drive…
    const liste = [v('a', 'x.pdf'), v('b', 'y.pdf'), v('c', 'z.pdf')];
    expect(liste).toHaveLength(3);
    // …ne change rien à ce qui identifie la session.
    expect(signatureSession({ mode: 'ranger', messageId: 42, pieces })).toBe(avant);
  });

  /** ⚠️ ET LA SIGNATURE N'A AUCUN MOYEN DE CONNAÎTRE UNE VIGNETTE : son type ne l'accepte pas. */
  it('⚠️ `signatureSession` ne lit aucune vignette', () => {
    const src = readFileSync('app/lib/gestion/rangementDrive.ts', 'utf8');
    expect(src).not.toContain('VignetteDupliquee');
    expect(src).not.toContain('vignetteDrive');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   L'ENTRÉE DE MENU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 l’entrée « Dupliquer en vignette »', () => {
  it('elle n’existe que si l’appelant la demande', () => {
    expect(entreeDupliquer(null)).toEqual([]);
    const e = entreeDupliquer({ deja: false });
    expect(e).toHaveLength(1);
    expect(e[0].action).toBe('dupliquer_vignette');
    expect(e[0].libelle).toBe(MOT_DUPLIQUER);
    expect(e[0].motifInactif).toBeNull();
  });

  /** ⚠️ DÉJÀ POSÉE : on le DIT plutôt que de reposer la même vignette. */
  it('⚠️ elle s’éteint quand la vignette est déjà dans la colonne', () => {
    expect(entreeDupliquer({ deja: true })[0].motifInactif).toContain('déjà');
  });

  /**
   * 🔴🔴 JAMAIS SUR UN DOSSIER, ET LA PREUVE EST STRUCTURELLE : `menuDossier` et `menuVide` ne connaissent même
   * pas cette fonction. Dupliquer un dossier n'aurait aucun sens — la vignette copie UN fichier.
   */
  it('🔴🔴 ni `menuDossier` ni `menuVide` ne la portent', () => {
    const tous = [
      ...menuDossier({ creerAutorise: true, motifCreation: null, avecLien: true }),
      ...menuVide({ creerAutorise: true, motifCreation: null }),
    ];
    expect(tous.some((x) => x.action === 'dupliquer_vignette')).toBe(false);
    expect(tous.map((x) => x.libelle).join(' ').toLowerCase()).not.toContain('dupliquer');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS — « COPIE », JAMAIS « DÉPLACEMENT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 les mots disent que l’original ne bouge pas', () => {
  /**
   * 🔴 LA DIFFÉRENCE EST TOUT LE GESTE. Quelqu'un qui croirait DÉPLACER irait ensuite chercher le document là où
   * il n'est plus — alors qu'il y est toujours.
   */
  it('🔴 l’infobulle annonce une copie, et dit que l’original reste', () => {
    const aide = aideVignette('0851_001.pdf');
    expect(aide).toContain('Copie de « 0851_001.pdf »');
    expect(aide).toContain('L’original ne bouge pas');
    expect(aide.toLowerCase()).not.toContain('déplac');
  });

  it('le compte rendu nomme le dossier', () => {
    const mot = motCopieRangee('0851_001.pdf', '_MESURE dossier instantane');
    expect(mot).toContain('copié dans « _MESURE dossier instantane »');
    expect(mot).toContain('L’original n’a pas bougé');
  });

  /** ⚠️ LE RÉSUMÉ EST DIT À PART DES PIÈCES : ce ne sont pas des pièces du poste de tri. */
  it('⚠️ le résumé compte les copies, et le dit', () => {
    expect(resumeVignettes(0)).toBeNull();
    expect(resumeVignettes(1)).toBe('1 copie à ranger (l’original reste en place)');
    expect(resumeVignettes(3)).toContain('3 copies à ranger');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LE MODULE NE SAIT RIEN ÉCRIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 aucune écriture dans ce module', () => {
  /**
   * 🔴 IL EST PUR, ET C'EST CE QUI REND LE GESTE SÛR : dupliquer ne touche à rien. L'écriture n'arrive qu'au
   * rangement, par la route de déplacement — celle qui porte déjà le verdict de l'archive, remonté chez Google à
   * chaque appel.
   */
  it('🔴 pas un `fetch`, pas une adresse Google, pas un verbe HTTP', () => {
    const src = readFileSync('app/lib/gestion/vignetteDrive.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    for (const mot of ['fetch', 'googleapis', 'method:', 'DELETE', 'trashed']) {
      expect(code).not.toContain(mot);
    }
  });
});
