import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AIDE_LOUPE, fermetureCopies, motCompteur, OCCURRENCES_MAX, phraseMethode, repereDe, SAUTS_MAX,
  surlignageDe, SURLIGNAGE_VIDE, type Occurrence,
} from './localisationDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « OÙ EST CE DOCUMENT ? », SANS RÉSEAU ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER TIENT :
 *   ① la fermeture du registre : les copies, les copies des copies, et la source elle-même ;
 *   ② 🔴🔴 LE SURLIGNAGE À CHAQUE NIVEAU — un document six niveaux plus bas surligne les six dossiers ;
 *   ③ plusieurs emplacements ⇒ plusieurs chemins, sans se gêner ;
 *   ④ 🔴 LE COMPTEUR DIT « CONNU(S) » : la méthode a des limites, et elles se lisent à l'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const occ = (id: string, chemin: string[], voie: 'registre' | 'empreinte' = 'registre'): Occurrence => ({
  id, nom: `${id}.pdf`, chemin: chemin.map((x) => ({ id: x, nom: x })), voie,
});

describe('🔴 la fermeture du registre', () => {
  /** 🔴 LA SOURCE EST UN EMPLACEMENT COMME UN AUTRE : l'oublier ferait annoncer « 1 » là où il y en a deux. */
  it('🔴 la source elle-même en fait partie', () => {
    expect(fermetureCopies('a', [])).toEqual(['a']);
  });

  it('elle suit les liens DANS LES DEUX SENS', () => {
    const liens = [{ source: 'a', copie: 'b' }];
    expect(fermetureCopies('a', liens).sort()).toEqual(['a', 'b']);
    // Depuis la COPIE, on retrouve l'original : c'est le même document.
    expect(fermetureCopies('b', liens).sort()).toEqual(['a', 'b']);
  });

  /** 🔴 UNE COPIE D'UNE COPIE EST LE MÊME DOCUMENT. Sans la fermeture, la troisième serait invisible. */
  it('🔴 elle remonte les copies de copies', () => {
    const liens = [{ source: 'a', copie: 'b' }, { source: 'b', copie: 'c' }, { source: 'c', copie: 'd' }];
    expect(fermetureCopies('a', liens).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  /**
   * ⚠️ UN CYCLE NE FIGE PAS LE PROGRAMME. Une table abîmée (ou un jour un lien posé à la main) ne doit pas faire
   * tourner la fenêtre sans fin : les identifiants déjà vus ne sont jamais repris.
   */
  it('⚠️ un cycle est borné, pas fatal', () => {
    const liens = [{ source: 'a', copie: 'b' }, { source: 'b', copie: 'a' }];
    expect(fermetureCopies('a', liens).sort()).toEqual(['a', 'b']);
  });

  /** ⚠️ ET LA PROFONDEUR EST BORNÉE : au-delà, la question n'est plus « où est-il ? ». */
  it('⚠️ au-delà de la profondeur, on s’arrête', () => {
    const liens = Array.from({ length: 12 }, (_, i) => ({ source: `n${i}`, copie: `n${i + 1}` }));
    const trouves = fermetureCopies('n0', liens);
    expect(trouves.length).toBeLessThanOrEqual(SAUTS_MAX + 1);
    expect(trouves).toContain('n0');
  });

  it('⚠️ le nombre d’emplacements est plafonné', () => {
    const liens = Array.from({ length: 200 }, (_, i) => ({ source: 'a', copie: `c${i}` }));
    expect(fermetureCopies('a', liens).length).toBeLessThanOrEqual(OCCURRENCES_MAX);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE SURLIGNAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 UN SEUL repère, sur le nœud visible le plus profond', () => {
  /**
   * ══ 🔴🔴 LE CONSTAT D'ARNO DU 03/10/2026 ═══════════════════════════════════════════════════════════════════
   *
   * La première version surlignait TOUS les ancêtres à la fois — « Test », « _MESURE dossier instantane »,
   * « _MESURE ligne arbre », le fichier. Trop de repères : l'arbre entier s'allume, et un arbre tout surligné
   * n'apprend plus rien. La règle devient : UN repère, sur le nœud VISIBLE le plus profond.
   */
  it('🔴🔴 dossier fermé : le repère est sur LUI, et sur lui seul', () => {
    // Seuls les deux premiers niveaux sont affichés : le reste est replié.
    const s = surlignageDe([occ('fichier', ['n3', 'n2', 'n1'])], new Set(['n1', 'n2']));
    expect([...s.reperes.keys()]).toEqual(['n2']);
    expect(s.reperes.get('n2')).toBe(1);
    // ⚠️ ET SURTOUT : l'ancêtre « n1 » n'est PAS marqué. C'est tout l'objet du lot.
    expect(s.reperes.has('n1')).toBe(false);
    expect(s.fichiers.size).toBe(0);
  });

  /** 🔴 ON OUVRE : le repère QUITTE le dossier et descend d'un cran. */
  it('🔴 on ouvre : le repère descend, il ne se duplique pas', () => {
    const chemin = ['n3', 'n2', 'n1'];
    const ferme = surlignageDe([occ('fichier', chemin)], new Set(['n1', 'n2']));
    expect([...ferme.reperes.keys()]).toEqual(['n2']);
    // On déplie « n2 » : « n3 » devient visible.
    const unCran = surlignageDe([occ('fichier', chemin)], new Set(['n1', 'n2', 'n3']));
    expect([...unCran.reperes.keys()]).toEqual(['n3']);
    // On déplie « n3 » : le FICHIER devient visible, et le repère arrive au bout du chemin.
    const auBout = surlignageDe([occ('fichier', chemin)], new Set(['n1', 'n2', 'n3', 'fichier']));
    expect([...auBout.reperes.keys()]).toEqual(['fichier']);
    expect(auBout.fichiers.has('fichier')).toBe(true);
  });

  /**
   * 🔴🔴 PLUSIEURS EMPLACEMENTS PAR LE MÊME DOSSIER FERMÉ : UN SEUL REPÈRE, AVEC SON NOMBRE (Arno : « un petit
   * nombre “2” »). Ils se séparent dès qu'on ouvre.
   */
  it('🔴🔴 deux emplacements derrière le même dossier fermé : un repère « 2 »', () => {
    const deux = [occ('f1', ['a1', 'Biens']), occ('f2', ['a2', 'Biens'])];
    const fusion = surlignageDe(deux, new Set(['Biens']));
    expect([...fusion.reperes.entries()]).toEqual([['Biens', 2]]);

    // On ouvre « Biens » : les deux sous-dossiers paraissent, et les repères se séparent.
    const separes = surlignageDe(deux, new Set(['Biens', 'a1', 'a2']));
    expect([...separes.reperes.entries()].sort()).toEqual([['a1', 1], ['a2', 1]]);
  });

  /** 🔴 DEUX BRANCHES DÉJÀ VISIBLES : deux repères, un par chemin — jamais plus. */
  it('🔴 deux branches visibles donnent deux repères', () => {
    const s = surlignageDe(
      [occ('f1', ['Travaux', 'Bien A']), occ('f2', ['Quittances', 'Bien B'])],
      new Set(['Bien A', 'Bien B']),
    );
    expect([...s.reperes.entries()].sort()).toEqual([['Bien A', 1], ['Bien B', 1]]);
  });

  /**
   * ⚠️ RIEN DE VISIBLE SUR LE CHEMIN ⇒ AUCUN REPÈRE, mais l'emplacement reste COMPTÉ. Marquer une ligne au hasard
   * serait pire que n'en marquer aucune ; ne pas le compter ferait mentir le compteur.
   */
  it('⚠️ un emplacement hors de vue est compté, sans repère', () => {
    const s = surlignageDe([occ('f1', ['ailleurs', 'tres-loin'])], new Set(['Biens']));
    expect(s.nombre).toBe(1);
    expect(s.reperes.size).toBe(0);
  });

  it('⚠️ une occurrence sans chemin : comptée, et marquée seulement si elle est elle-même visible', () => {
    expect(surlignageDe([occ('f1', [])], new Set()).nombre).toBe(1);
    expect(surlignageDe([occ('f1', [])], new Set()).reperes.size).toBe(0);
    expect([...surlignageDe([occ('f1', [])], new Set(['f1'])).reperes.keys()]).toEqual(['f1']);
  });

  it('⚠️ aucune occurrence : rien', () => {
    expect(surlignageDe([], new Set()).nombre).toBe(0);
    expect(SURLIGNAGE_VIDE.nombre).toBe(0);
    expect(SURLIGNAGE_VIDE.reperes.size).toBe(0);
  });

  /** ⚠️ `repereDe` SEULE : le premier élément affiché en partant du plus profond. */
  it('⚠️ `repereDe` rend le nœud visible le plus profond', () => {
    const o = occ('fichier', ['n3', 'n2', 'n1']);
    expect(repereDe(o, new Set(['n1', 'n2', 'n3', 'fichier']))).toBe('fichier');
    expect(repereDe(o, new Set(['n1', 'n2', 'n3']))).toBe('n3');
    expect(repereDe(o, new Set(['n1']))).toBe('n1');
    expect(repereDe(o, new Set())).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LES MOTS — ET LES LIMITES QU'ILS DOIVENT DIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le compteur et la méthode', () => {
  it('le libellé de la loupe est celui d’Arno', () => {
    expect(AIDE_LOUPE).toBe('Localiser dans le Drive');
  });

  /**
   * 🔴🔴 « CONNU(S) » N'EST PAS UNE PRÉCAUTION DE STYLE. L'API Drive ne sait pas chercher par empreinte : une
   * copie manuelle rangée dans un dossier qu'on n'a pas ouvert reste invisible. « 2 emplacements » ferait
   * conclure « il n'est nulle part ailleurs » — d'un balayage qui n'a pas eu lieu.
   */
  it('🔴🔴 le compteur dit « connu », jamais un total', () => {
    /**
     * ══ 🔴🔴 VERDICT CHANGÉ — LOT PASTILLE-COPIES-VIVANTES (07/10/2026) ════════════════════════════════════
     *
     * Il exigeait « Aucun emplacement connu ». DÉCISION D'ARNO : « À 0 : pas de pastille verte, et la loupe
     * affiche “Document inconnu du Drive” (aucun lien). » Le verdict change parce que la PHRASE change de
     * sujet : « aucun emplacement connu » parlait de notre savoir et laissait croire qu'on avait mal cherché ;
     * « Document inconnu du Drive » parle du document, et dit ce qui a été vérifié.
     *
     * ⚠️ AU-DESSUS DE ZÉRO, RIEN NE BOUGE : « connu(s) » reste, pour la raison dite ci-dessus.
     */
    expect(motCompteur(0)).toBe('Document inconnu du Drive');
    expect(motCompteur(-1)).toBe('Document inconnu du Drive');
    expect(motCompteur(1)).toBe('1 emplacement connu');
    expect(motCompteur(3)).toBe('3 emplacements connus');
  });

  it('🔴 la phrase dit par quelle voie, et ce qui n’a PAS été cherché', () => {
    const p = phraseMethode({
      nombre: 3, parRegistre: 2, parEmpreinte: 1, empreinteConnue: true, dossiersLus: 4,
    });
    expect(p).toContain('3 emplacements connus');
    expect(p).toContain('2 par le registre des copies');
    expect(p).toContain('1 par empreinte de contenu');
    expect(p).toContain('4 dossiers déjà ouverts');
    expect(p).toContain('le Drive n’est pas balayé');
  });

  /** 🔴 UN DOCUMENT GOOGLE NATIF N'A PAS D'EMPREINTE : la phrase le dit, au lieu de laisser croire à un échec. */
  it('🔴 sans empreinte, la phrase explique que seul le registre a répondu', () => {
    const p = phraseMethode({
      nombre: 1, parRegistre: 1, parEmpreinte: 0, empreinteConnue: false, dossiersLus: 9,
    });
    expect(p).toContain('pas d’empreinte de contenu');
    expect(p).toContain('document Google natif');
    expect(p).not.toContain('déjà ouvert');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔒 LECTURE SEULE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 ce module ne sait rien écrire', () => {
  it('🔒 pas un `fetch`, pas un verbe HTTP, pas une écriture Drive', () => {
    const src = readFileSync('app/lib/gestion/localisationDrive.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    for (const mot of ['fetch', 'googleapis', 'method:', 'DELETE', 'trashed', 'files.copy']) {
      expect(code).not.toContain(mot);
    }
  });
});
