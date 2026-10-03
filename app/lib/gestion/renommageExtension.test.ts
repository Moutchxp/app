import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { eclaterNom, verifierNom } from './renommagePiece';

/**
 * ══ 🔴🔴 LOT RENOMMAGE-UN-SEUL-NOM — L'EXTENSION TIENT AUSSI CÔTÉ SERVEUR ═══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 POURQUOI UN GARDE SUR LE SOURCE DE LA ROUTE, ET PAS SEULEMENT DES ÉPREUVES D'ÉCRAN.
 *
 * L'écran nettoie, affiche l'extension à côté du champ et la recolle — et c'est très bien pour la personne qui
 * tape. Mais l'écran SE CONTOURNE : une requête `PATCH` forgée à la main porte le nom qu'elle veut. Si la règle
 * « l'extension d'origine est TOUJOURS conservée » ne vivait que dans le navigateur, un « .pdf » devenu « .exe »
 * suffirait à poser dans un Drive partagé un fichier piégé portant le nom d'un document de l'agence.
 *
 * 🔴 LA ROUTE NE CROIT DONC JAMAIS LE NOM REÇU SUR SON EXTENSION : elle lit l'extension du nom ACTUEL de la
 * pièce (et, à défaut, du TYPE de la pièce), et c'est celle-là qu'elle recolle.
 *
 * ⚠️ ET LA RÈGLE ANTI-DOUBLON VIT DANS LE MODULE PUR, DONC AUX DEUX ENDROITS À LA FOIS. C'est le point du lot :
 * une seconde implémentation côté serveur aurait divergé le jour où l'une des deux change.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ROUTE = 'app/(admin)/api/admin/gestion/pieces/[id]/nom/route.ts';

describe('🔴🔴 la route recolle l’extension, et ne croit pas le navigateur', () => {
  const src = readFileSync(ROUTE, 'utf8');

  /** 🔴 L'EXTENSION VIENT DU NOM ACTUEL **ET DU TYPE** — c'est le second qui répare le cas d'Arno. */
  it('🔴🔴 l’extension est lue sur la pièce, type compris', () => {
    expect(src).toContain('eclaterNom(piece.nomAffiche, piece.typeMime)');
  });

  /**
   * 🔴🔴 LE NOM REÇU PART ENTIER DANS `verifierNom`, et c'est une correction de ce lot. L'ancienne ligne coupait
   * sa queue avec `eclaterNom` — ce qui effaçait en silence le « .03 » de « Bail 2026.03 ». Le retrait de
   * l'extension RETAPÉE est désormais fait par le module pur, qui ne retire que l'extension ATTENDUE.
   */
  it('🔴🔴 le nom reçu n’est plus charcuté avant d’être jugé', () => {
    expect(src).toContain('verifierNom(voulu, extension)');
    expect(src).not.toContain('eclaterNom(voulu)');
  });

  /** 🔒 ET C'EST BIEN LE NOM JUGÉ QUI PART AU RENOMMAGE, jamais celui du corps de la requête. */
  it('🔒 c’est `verdict.nom` qui part, pas `voulu`', () => {
    expect(src).toContain('nom: verdict.nom,');
    expect(src).not.toContain('nom: voulu,');
  });

  /** ⚠️ LA ROUTE N'A PAS SA PROPRE RECETTE D'EXTENSION : une seconde vérité aurait dérivé. */
  it('⚠️ aucune logique d’extension en double dans la route', () => {
    expect(src).not.toContain('lastIndexOf');
    expect(src).not.toContain("'.pdf'");
  });
});

describe('🔴 le registre rend le type de la pièce, puisque la route en a besoin', () => {
  const repo = readFileSync('app/lib/gestion/nomUsageRepo.ts', 'utf8');

  it('🔴 `lirePieceANommer` lit et rend `type_mime`', () => {
    expect(repo).toContain('typeMime: string | null;');
    expect(repo).toContain('p.type_mime');
    expect(repo).toContain('typeMime: rows[0].type_mime,');
  });
});

/**
 * ══ 🔴🔴 LE CAS D'ARNO, REJOUÉ TEL QUEL SUR LA CHAÎNE DU SERVEUR ═══════════════════════════════════════════════
 *
 * On ne monte pas la route (elle demande une session, une base et Google) : on rejoue les DEUX appels purs
 * qu'elle enchaîne, dans le même ordre et avec les mêmes valeurs qu'elle leur passe. C'est ce que fait le
 * serveur, à l'identique.
 */
describe('🔴🔴 ce que le serveur ferait du nom d’Arno', () => {
  /** La chaîne exacte de la route : extension de la pièce, puis jugement du nom reçu. */
  const commeLaRoute = (nomActuel: string, typeMime: string | null, recu: string): string => {
    const { extension } = eclaterNom(nomActuel, typeMime);
    return verifierNom(recu, extension).nom;
  };

  it('🔴🔴 « reco renomage » sur un « … .pdf [octets] » ressort avec son « .pdf »', () => {
    expect(commeLaRoute('_MESURE 1790804662784 0836_001.pdf [octets]', 'application/pdf', 'reco renomage'))
      .toBe('reco renomage.pdf');
  });

  /** 🔒 UNE REQUÊTE FORGÉE NE CHANGE PAS L'EXTENSION : « .exe » demandé, « .pdf » écrit. */
  it('🔒🔒 un « .exe » demandé par une requête forgée ressort en « .pdf »', () => {
    expect(commeLaRoute('0836_001.pdf', 'application/pdf', 'facture.exe')).toBe('facture.exe.pdf');
    expect(commeLaRoute('0836_001.pdf', 'application/pdf', 'facture.pdf.exe')).toBe('facture.pdf.exe.pdf');
  });

  /** 🔴 PAS DE DOUBLON quand le navigateur renvoie le nom complet — le chemin normal de l'écran. */
  it('🔴 le nom complet renvoyé par l’écran ne double pas l’extension', () => {
    expect(commeLaRoute('0836_001.pdf', 'application/pdf', 'Recommandé M Ahmed KHARRAT.pdf'))
      .toBe('Recommandé M Ahmed KHARRAT.pdf');
  });

  /** ⚠️ ET UN TYPE INCONNU NE FAIT RIEN APPARAÎTRE : on n'invente pas d'extension. */
  it('⚠️ sans extension au nom et sans type connu, le nom reste nu', () => {
    expect(commeLaRoute('document sans extension', 'application/octet-stream', 'Bail Dupont'))
      .toBe('Bail Dupont');
  });
});
