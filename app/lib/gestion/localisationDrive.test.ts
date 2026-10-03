import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AIDE_LOUPE, fermetureCopies, motCompteur, OCCURRENCES_MAX, phraseMethode, SAUTS_MAX,
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

describe('🔴🔴 le surlignage, à chaque niveau', () => {
  /**
   * 🔴🔴 LA DEMANDE D'ARNO, MOT POUR MOT : « chaque dossier qui contient (directement ou plus bas) une occurrence
   * est surligné […] et ainsi de suite jusqu'à la ligne du fichier, surlignée elle aussi ». Sans la chaîne
   * ENTIÈRE, la loupe ne servirait qu'à ceux qui savent déjà où chercher.
   */
  it('🔴🔴 toute la chaîne de dossiers est surlignée, pas seulement le parent', () => {
    const s = surlignageDe([occ('fichier', ['n6', 'n5', 'n4', 'n3', 'n2', 'n1'])]);
    expect(s.fichiers.has('fichier')).toBe(true);
    for (const d of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']) expect(s.dossiers.has(d)).toBe(true);
    expect(s.nombre).toBe(1);
  });

  /** 🔴 « plusieurs emplacements → plusieurs chemins surlignés » (Arno). Les deux branches coexistent. */
  it('🔴 deux emplacements surlignent deux branches', () => {
    const s = surlignageDe([
      occ('f1', ['Travaux', 'Bien A', 'Biens']),
      occ('f2', ['Quittances', 'Bien B', 'Biens']),
    ]);
    expect(s.nombre).toBe(2);
    expect([...s.dossiers].sort()).toEqual(['Bien A', 'Bien B', 'Biens', 'Quittances', 'Travaux']);
    expect(s.fichiers.has('f1') && s.fichiers.has('f2')).toBe(true);
  });

  /**
   * ⚠️ UNE OCCURRENCE SANS CHEMIN EST COMPTÉE MAIS NE SURLIGNE RIEN. On n'a pas su remonter ses parents ;
   * inventer un emplacement serait pire que de n'en montrer aucun.
   */
  it('⚠️ une occurrence sans chemin compte, mais ne surligne aucun dossier', () => {
    const s = surlignageDe([occ('f1', [])]);
    expect(s.nombre).toBe(1);
    expect(s.dossiers.size).toBe(0);
  });

  it('⚠️ aucune occurrence : rien n’est surligné', () => {
    expect(surlignageDe([]).nombre).toBe(0);
    expect(SURLIGNAGE_VIDE.nombre).toBe(0);
  });

  /** ⚠️ UN MÊME DOSSIER PARTAGÉ PAR DEUX CHEMINS N'EST COMPTÉ QU'UNE FOIS : c'est un ensemble, pas une liste. */
  it('⚠️ les chemins qui se croisent ne doublent rien', () => {
    const s = surlignageDe([occ('f1', ['A', 'Racine']), occ('f2', ['B', 'Racine'])]);
    expect([...s.dossiers].sort()).toEqual(['A', 'B', 'Racine']);
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
    expect(motCompteur(0)).toBe('Aucun emplacement connu');
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
