import { describe, it, expect } from 'vitest';
import {
  detailPartieDestinataire, motPartieDestinataire, partiesDestinataires,
  type CategoriePartie,
} from './historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — NOS ENVOIS : À QUELLE PARTIE ? ════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « pour toute pièce ENVOYÉE PAR NOUS, une ligne par partie destinataire : flèche
 * rouge "→ envoyé à la partie propriétaire", flèche verte "→ envoyé à la partie locataire", flèche bleue
 * "→ envoyé à la partie tiers indépendant" ; gris "→ envoyé à un destinataire non affecté" si besoin. Si
 * plusieurs parties sont destinataires, une ligne par partie. »
 *
 * Le jeu d'essai est celui de lot-146 : la propriétaire Blandine Piriou, les locataires en place, l'assureur,
 * et nos deux adresses.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const PROPRIO = 'blandine.piriou@gmail.com';
const PROPRIO2 = 'chloe.mangifesta@gtf.fr';
const LOCATAIRE = 'mathilde.brasset@gmail.com';
const TIERS = 'sinistres@assureur.test';
const INCONNU = 'voisin@ailleurs.test';
const NOUS = 'gestion@criterimmo.fr';
const NOUS2 = 'jb.pons@sansvisavis.com';

const CATS = new Map<string, CategoriePartie>([
  [PROPRIO, 'proprietaire'], [PROPRIO2, 'proprietaire'],
  [LOCATAIRE, 'locataire'], [TIERS, 'independant'],
]);

const estNous = (a: string): boolean =>
  [NOUS, NOUS2].includes(a.trim().toLowerCase());

const qui = (adresse: string, nom: string | null = null) => ({ nom, adresse });
const envoi = (a: string[], cc: string[] = []) =>
  ({ sens: 'envoye' as const, a: a.map((x) => qui(x)), cc: cc.map((x) => qui(x)) });

describe('🔴🔴 ① une ligne par partie, dans l’ordre des encarts', () => {
  it('🔴🔴 trois parties destinataires, trois lignes, rouge puis verte puis bleue', () => {
    const p = partiesDestinataires(envoi([PROPRIO, LOCATAIRE], [TIERS]), CATS, estNous);
    expect(p.map((x) => x.cle)).toEqual(['proprietaire', 'locataire', 'independant']);
    expect(p.map((x) => x.ton)).toEqual(['rouge', 'vert', 'bleu']);
    expect(p.map((x) => x.mot)).toEqual([
      '→ envoyé à la partie propriétaire',
      '→ envoyé à la partie locataire',
      '→ envoyé à la partie tiers indépendant',
    ]);
  });

  /**
   * 🔴🔴 UNE LIGNE PAR PARTIE, PAS PAR ADRESSE. Un couple propriétaire à deux adresses donnerait sinon deux
   * lignes rouges identiques — et la question posée est « à quelle PARTIE », pas « à quelle adresse ».
   */
  it('🔴🔴 deux adresses d’une MÊME partie ne font qu’une ligne', () => {
    const p = partiesDestinataires(envoi([PROPRIO, PROPRIO2]), CATS, estNous);
    expect(p).toHaveLength(1);
    expect(p[0].adresses.map((x) => x.adresse)).toEqual([PROPRIO, PROPRIO2]);
  });

  /** 🔴 LE QUATRIÈME CAS, et il ne dit pas « la partie » : « non affecté » veut dire qu'on ne sait pas encore. */
  it('🔴🔴 un destinataire qu’aucune catégorie ne range : gris, et la phrase le dit', () => {
    const p = partiesDestinataires(envoi([INCONNU]), CATS, estNous);
    expect(p).toHaveLength(1);
    expect(p[0].ton).toBe('gris');
    expect(p[0].mot).toBe('→ envoyé à un destinataire non affecté');
    expect(p[0].mot).not.toContain('la partie');
  });

  it('🔴 les quatre phrases, mot pour mot', () => {
    expect(motPartieDestinataire('proprietaire')).toBe('→ envoyé à la partie propriétaire');
    expect(motPartieDestinataire('locataire')).toBe('→ envoyé à la partie locataire');
    expect(motPartieDestinataire('independant')).toBe('→ envoyé à la partie tiers indépendant');
    expect(motPartieDestinataire('a_repartir')).toBe('→ envoyé à un destinataire non affecté');
  });
});

describe('🔴🔴 ② ce qui n’est PAS une partie destinataire', () => {
  /** 🔴 LA QUESTION NE SE POSE QUE POUR NOS ENVOIS : « pour toute pièce ENVOYÉE PAR NOUS » (Arno). */
  it('🔴🔴 un mail REÇU ne produit aucune ligne', () => {
    const recu = { sens: 'recu' as const, a: [qui(PROPRIO)], cc: [qui(LOCATAIRE)] };
    expect(partiesDestinataires(recu, CATS, estNous)).toEqual([]);
  });

  /**
   * 🔴🔴 NOS PROPRES ADRESSES SONT ÉCARTÉES. Nous mettre en copie de notre propre envoi — ce que fait la moitié
   * de nos messages — n'est pas « envoyer à une partie ». Les compter aurait posé une ligne grise sous presque
   * chaque pièce sortante, et l'on aurait cessé de lire les trois lignes utiles.
   */
  it('🔴🔴 nous mettre en copie de notre propre envoi ne crée aucune ligne', () => {
    const p = partiesDestinataires(envoi([PROPRIO], [NOUS, NOUS2]), CATS, estNous);
    expect(p).toHaveLength(1);
    expect(p[0].cle).toBe('proprietaire');
    /* ⚠️ ET SURTOUT PAS DE LIGNE GRISE : nos adresses ne tombent pas dans « non affecté ». */
    expect(p.some((x) => x.cle === 'a_repartir')).toBe(false);
  });

  it('⚠️ un envoi qui ne part qu’à nous ne dit rien du tout', () => {
    expect(partiesDestinataires(envoi([NOUS], [NOUS2]), CATS, estNous)).toEqual([]);
  });

  it('⚠️ une adresse vide ou en blancs ne compte pas', () => {
    expect(partiesDestinataires(envoi(['', '   ']), CATS, estNous)).toEqual([]);
  });
});

describe('🔴 ③ le détail, pour l’info-bulle du « i »', () => {
  /** 🔴 « À » AVANT « Cc » : c'est l'ordre d'un en-tête, et le destinataire direct d'abord. */
  it('🔴 « À » d’abord, puis « Cc », avec le nom et l’adresse', () => {
    const m = {
      sens: 'envoye' as const,
      a: [qui(PROPRIO, 'Blandine Piriou')],
      cc: [qui(PROPRIO2, 'Chloé MANGIFESTA')],
    };
    const [p] = partiesDestinataires(m, CATS, estNous);
    expect(p.adresses.map((x) => x.champ)).toEqual(['À', 'Cc']);
    expect(detailPartieDestinataire(p))
      .toBe(`À : Blandine Piriou <${PROPRIO}>\nCc : Chloé MANGIFESTA <${PROPRIO2}>`);
  });

  /** ⚠️ SANS NOM, L'ADRESSE SEULE — jamais un « (sans nom) » inventé. */
  it('⚠️ sans nom, l’adresse seule', () => {
    const [p] = partiesDestinataires(envoi([PROPRIO]), CATS, estNous);
    expect(detailPartieDestinataire(p)).toBe(`À : ${PROPRIO}`);
    const [q] = partiesDestinataires(
      { sens: 'envoye', a: [qui(PROPRIO, '   ')], cc: [] }, CATS, estNous);
    expect(detailPartieDestinataire(q)).toBe(`À : ${PROPRIO}`);
  });

  /**
   * ⚠️ UNE ADRESSE EN « À » **ET** EN « Cc » N'EST COMPTÉE QU'UNE FOIS, au premier champ où elle paraît :
   * l'info-bulle liste des gens, pas des lignes d'en-tête.
   */
  it('⚠️ une adresse répétée n’est listée qu’une fois', () => {
    const [p] = partiesDestinataires(envoi([PROPRIO], [PROPRIO]), CATS, estNous);
    expect(p.adresses).toHaveLength(1);
    expect(p.adresses[0].champ).toBe('À');
  });

  it('⚠️ la casse de l’en-tête ne change pas la catégorie', () => {
    const [p] = partiesDestinataires(envoi([PROPRIO.toUpperCase()]), CATS, estNous);
    expect(p.cle).toBe('proprietaire');
    /* ⚠️ MAIS L'ADRESSE EST AFFICHÉE TELLE QU'ELLE EST DANS L'EN-TÊTE : on ne réécrit pas le courrier. */
    expect(p.adresses[0].adresse).toBe(PROPRIO.toUpperCase());
  });
});
