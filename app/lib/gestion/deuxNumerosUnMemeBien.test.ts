import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ficheDepuisTexte, ficheParCle, texteFiche, SORTES_FICHE_PAR_CLE } from './ecranUrl';
import { cibleDepuisTexte, texteCible } from './historique';
import { cibleLot } from './rattachement';

/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 6 — DEUX NUMÉROS POUR UN MÊME BIEN ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (04/10/2026) : « DEUX NUMÉROS POUR UN MÊME BIEN (fiche=lot-336 vs cible=lot-478) : les deux
 * adresses doivent mener au même bien. Correction INVISIBLE : aucun libellé ni affichage ne change, aucun lien
 * existant ne casse. »
 *
 * ═══ 🔴🔴 CE QUE J'AI MESURÉ AVANT DE TOUCHER QUOI QUE CE SOIT ════════════════════════════════════════════════════
 *
 * Les deux adresses de son exemple mènent DÉJÀ au même bien : ce bien-là porte l'identifiant interne 336 ET la clé
 * WIPPIMMO 478. Le défaut n'est pas qu'elles divergent, c'est qu'un même bien se désigne par DEUX nombres selon
 * l'écran — et que le nombre qu'on LIT (« lot 478 ») ne marche que dans l'une des deux.
 *
 * 🔴 ET LE NOMBRE NU EST IRRÉMÉDIABLEMENT AMBIGU. Mesuré sur les 365 lots du 04/10/2026 :
 *   · identifiants internes 1→365 · clés WIPPIMMO 2→516 ;
 *   · **AUCUN** lot n'a `id = clé` ;
 *   · **228** nombres sont valides dans LES DEUX espaces, et dans les **228** cas ils désignent des biens
 *     DIFFÉRENTS.
 *
 * ⚠️ J'AI DONC ÉCARTÉ LE REPLI (« si l'identifiant n'existe pas, essayer la clé »). Il marche pour les clés 366 à
 * 516 et se trompe SILENCIEUSEMENT pour les 228 autres. Un raccourci juste la moitié du temps est pire que pas de
 * raccourci : on finit par s'y fier, et le jour où il se trompe, il ouvre la fiche de quelqu'un d'autre.
 *
 * 🔴 LA CORRECTION EST UNE FORME QUI DIT CE QU'ELLE PORTE : `bien-478` désigne le bien par son NUMÉRO DE LOT.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴🔴 ① un seul nombre marche dans les deux adresses', () => {
  /**
   * 🔴🔴 C'EST LA DEMANDE D'ARNO, TENUE : le nombre qu'il lit à l'écran — 478 — ouvre la fiche ET l'historique du
   * même bien. Avant ce point, 478 ne marchait que dans `cible=`, et `fiche=` réclamait 336.
   */
  it('🔴🔴 478 ouvre la fiche et l’historique du même bien', () => {
    expect(ficheDepuisTexte('bien-478')).toEqual({ sorte: 'bien', id: 478 });
    expect(cibleDepuisTexte('lot-478')).toEqual({ sorte: 'lot', cle: '478', id: null });
    /* Et les deux formes se réécrivent à l'identique : une adresse partagée revient sur le même bien. */
    expect(texteFiche({ sorte: 'bien', id: 478 })).toBe('bien-478');
    expect(texteCible(cibleLot('478'))).toBe('lot-478');
  });

  /**
   * 🔴🔴 ET `lot-<id>` N'A PAS BOUGÉ D'UN CRAN — condition absolue d'Arno (« aucun lien existant ne casse »).
   * Tous les liens déjà posés — `adresseHistoriqueDuBien`, les cartes de biens, les signets — désignent
   * exactement le même bien qu'avant.
   */
  it('🔴🔴 `fiche=lot-336` désigne toujours l’identifiant interne 336', () => {
    expect(ficheDepuisTexte('lot-336')).toEqual({ sorte: 'lot', id: 336 });
    expect(texteFiche({ sorte: 'lot', id: 336 })).toBe('lot-336');
  });

  /** 🔴 LES TROIS SORTES D'AVANT RESTENT INTACTES, forme et sens. */
  it('🔴 propriétaire, lot et locataire ne changent pas', () => {
    expect(ficheDepuisTexte('proprietaire-12')).toEqual({ sorte: 'proprietaire', id: 12 });
    expect(ficheDepuisTexte('locataire-457')).toEqual({ sorte: 'locataire', id: 457 });
    expect(ficheDepuisTexte('lot-7')).toEqual({ sorte: 'lot', id: 7 });
  });

  /** ⚠️ LECTURE TOLÉRANTE, comme tout ce fichier : une valeur inconnue ne fait jamais d'écran blanc. */
  it('⚠️ une sorte inconnue ou un nombre absurde rend `null`', () => {
    expect(ficheDepuisTexte('biens-478')).toBeNull();
    expect(ficheDepuisTexte('bien-0')).toBeNull();
    expect(ficheDepuisTexte('bien-')).toBeNull();
    expect(ficheDepuisTexte('bien-abc')).toBeNull();
    expect(ficheDepuisTexte(null)).toBeNull();
  });
});

describe('🔴🔴 ② quelle sorte s’adresse par quel nombre — écrit à un seul endroit', () => {
  /**
   * 🔴🔴 UNE SEULE LISTE DÉCIDE, et elle sert aux DEUX usages : le paramètre envoyé à la route et le rendu de la
   * fiche. Deux listes auraient fini par ne plus dire la même chose, et une fiche se serait demandée par la clé
   * pour s'afficher comme une autre sorte.
   */
  it('🔴🔴 `bien` est la seule sorte qui s’adresse par la clé WIPPIMMO', () => {
    expect([...SORTES_FICHE_PAR_CLE]).toEqual(['bien']);
    expect(ficheParCle('bien')).toBe(true);
    expect(ficheParCle('lot')).toBe(false);
    expect(ficheParCle('proprietaire')).toBe(false);
    expect(ficheParCle('locataire')).toBe(false);
  });

  const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

  /**
   * 🔴 AUCUNE REQUÊTE DE PLUS, ET AUCUNE SECONDE LECTURE DE « LA FICHE D'UN BIEN ». La route sait demander par la
   * clé depuis le lot MODALE-RATTACHER-PROPRE (`?lotCle=`, qui résout la clé puis appelle la MÊME `ficheLot`).
   * Seule l'adresse gagne une porte.
   */
  it('🔴 l’écran traduit `bien` en `?lotCle=`, et rien d’autre ne change', () => {
    expect(ANNUAIRE).toContain("const parametre = ficheParCle(fiche.sorte) ? 'lotCle' : fiche.sorte;");
    expect(ANNUAIRE).toContain('`/api/admin/gestion/annuaire?${parametre}=${fiche.id}`');
    /* ⚠️ ET PLUS AUCUN APPEL QUI COLLE LA SORTE DIRECTEMENT : c'est la forme qui enverrait `?bien=478`, que la
       route ne connaît pas — un « Fiche illisible » silencieux. */
    expect(ANNUAIRE).not.toContain('annuaire?${fiche.sorte}=');
  });

  /**
   * 🔴🔴 `bien` REND LA MÊME FICHE QUE `lot`. C'est le même écran, demandé par l'autre numéro : les rendre
   * différemment aurait créé un second écran de fiche de bien, et donc une seconde vérité sur ce qu'un bien est.
   */
  it('🔴🔴 `bien` et `lot` s’affichent par le même rendu', () => {
    expect(ANNUAIRE).toContain("else if (fiche.sorte === 'lot' || fiche.sorte === 'bien') {");
    /* Et « Vie du bien » se pose sur les deux : c'est la même fiche, le même bloc. */
    expect(ANNUAIRE).toContain(
      "if (!poserSurVie || fiche === null || (fiche.sorte !== 'lot' && fiche.sorte !== 'bien')) return;",
    );
  });
});
