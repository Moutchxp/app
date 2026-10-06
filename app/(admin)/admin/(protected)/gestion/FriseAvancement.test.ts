import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motNbReperes } from './FriseAvancement';
import { jourFr } from './EvenementsDuBien';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINTS 3 ET 4 — CE QUE LES DEUX ÉCRANS DOIVENT TENIR ═══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce fichier éprouve les RÈGLES des deux composants — ce qu'ils affichent, ce qu'ils refusent, et la frontière
 * client/serveur qu'ils ne doivent jamais franchir. Le rendu lui-même est vérifié à l'écran, dans le navigateur,
 * et les mesures sont consignées dans les captures.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const BLOC = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const ROUTE_FRISE = readFileSync(
  'app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
const ROUTE_ETAPE = readFileSync('app/(admin)/api/admin/gestion/etapes/[id]/route.ts', 'utf8');

describe('① la frontière client/serveur', () => {
  /**
   * 🔴🔴 LA RÈGLE DU DÉPÔT DEPUIS L'INCIDENT DU 24/09/2026 : un composant `'use client'` qui importe un dépôt
   * remonte jusqu'à `pg`, donc `dns`, et webpack refuse de construire TOUTE l'application — page de connexion
   * comprise, avec 8 800 tests au vert. Le garde de graphe l'attrape aussi ; ceci le dit à l'endroit où l'on
   * écrirait l'import de trop.
   */
  it('🔴🔴 aucun des deux écrans n’importe un dépôt', () => {
    for (const [nom, src] of [['FriseAvancement', FRISE], ['EvenementsDuBien', BLOC]] as const) {
      expect(src.startsWith("'use client';"), nom).toBe(true);
      expect(src, nom).not.toMatch(/from '.*mongaEtapeRepo'/);
      expect(src, nom).not.toMatch(/^import .*Repo';$/m);
      expect(src, nom).not.toContain("from 'pg'");
    }
  });
});

describe('② la frise : ce qu’Arno a demandé, pièce par pièce', () => {
  it('🔴 les étapes attendues s’affichent en pointillé', () => {
    expect(FRISE).toContain('frs-case--attendue');
    expect(FRISE).toContain('frs-pastille--attendue');
    /* ⚠️ LE POINTILLÉ SE LIT SANS COULEUR : `dashed`, et non une teinte plus pâle. */
    expect(FRISE).toContain('border:2px dashed var(--color-svv-muted)');
  });

  /**
   * 🔴🔴 « Acceptation du devis » VALIDABLE EN UN CLIC (décision d'Arno du 06/10). C'est la SEULE étape attendue
   * qui porte un bouton : les autres arrivent par mail, celle-là n'arrive jamais — **0 cas mesuré sur 120 mails**.
   */
  it('🔴🔴 le pointillé « Acceptation du devis » porte son bouton, et lui seul', () => {
    expect(FRISE).toContain("c.type === 'devis_accepte' && (");
    expect(FRISE).toContain('Le devis est accepté');
  });

  /**
   * 🔴🔴 LE MONTANT SE COMPLÈTE À LA MAIN, SUR UNE ÉTAPE MONGA. L'audit a mesuré qu'il n'est jamais dans le mail
   * (2 sur 120, et ce sont des phrases humaines) ; le mail « Devis envoyé » dit seulement que le devis est
   * disponible derrière le lien.
   */
  it('🔴🔴 une case de devis porte un champ de montant', () => {
    expect(FRISE).toContain("e.type === 'devis_recu' && (");
    expect(FRISE).toContain('Montant du devis');
    /* ⚠️ EN CENTIMES, ARRONDIS : un montant en flottant finirait par afficher 885,4999999. */
    expect(FRISE).toContain('Math.round(v * 100)');
  });

  it('🔴 les étapes « à confirmer » portent la mention et les deux boutons', () => {
    expect(FRISE).toContain('à confirmer');
    expect(FRISE).toContain("onConfirmer(e.id, 'confirmer')");
    expect(FRISE).toContain("onConfirmer(e.id, 'ecarter')");
  });

  /** 🔴 LA PHRASE QUI JUSTIFIE TOUT LE POINT 2 — elle vient du module pur, elle n'est pas réécrite ici. */
  it('🔴🔴 « mail supprimé — étape conservée » vient du module pur', () => {
    expect(FRISE).toContain('motMailDOrigine');
    expect(FRISE).not.toContain('mail supprimé — étape conservée');
    const pur = readFileSync('app/lib/gestion/frise.ts', 'utf8');
    expect(pur).toContain('mail supprimé — étape conservée');
  });

  /** 🔴 LA CLÔTURE EST PROPOSÉE, JAMAIS APPLIQUÉE (Arno : « jamais automatique »). */
  it('🔴 la clôture est une proposition, et elle passe par la porte existante', () => {
    expect(FRISE).toContain('Clôturer cet événement ?');
    expect(FRISE).toContain('onProposerCloture');
    /* 🔴 DANS LA CARTE, elle emprunte `agir({ etat: 'traite' })` — le même journal que le bouton d'état. */
    expect(CARTE).toContain("onProposerCloture={() => void agir({ etat: 'traite' }");
  });

  /**
   * 🔴 LA PROPOSITION DE PASSAGE EN FIABLE (Arno) : « propose-moi (sans l'appliquer) ». Le mot « rien n'est
   * appliqué » est à l'écran, pour qu'on ne croie pas que le clic a changé quelque chose.
   */
  it('🔴 le passage en automatique fiable est proposé, et le dit', () => {
    expect(FRISE).toContain('passagesEnFiableProposes');
    expect(FRISE).toContain('rien n’est appliqué');
  });

  /**
   * ⚠️ AUCUNE FONCTION AU SURVOL SEUL (CLAUDE.md §15). Les repères RÉVÈLENT un texte au survol, mais ce sont des
   * `<button>` : le clavier et le tactile y accèdent par un clic.
   */
  it('⚠️ les repères sont des boutons, pas des zones de survol', () => {
    expect(FRISE).toContain('className={`frs-repere frs-repere--${r.type}`}');
    expect(FRISE).toMatch(/type="button"[\s\S]{0,120}frs-repere/);
    expect(FRISE).toContain('aria-expanded={ouvert === `r${r.id}`}');
  });

  /** 🔴 LA FRISE EST UNE SÉQUENCE : une liste ORDONNÉE, et c'est ce qu'un lecteur d'écran doit entendre. */
  it('🔴 les étapes majeures sont une liste ordonnée', () => {
    expect(FRISE).toContain('<ol className="frs-liste">');
  });

  /** 🔴 « + Ajouter une étape » est TOUJOURS offert — c'est lui qui rend la frise utilisable sans Monga. */
  it('🔴 « + Ajouter une étape » existe sans condition de Monga', () => {
    expect(FRISE).toContain('+ Ajouter une étape');
    expect(FRISE).toContain('TYPES_AJOUTABLES.map');
  });
});

describe('③ le bloc « Événements » de la fiche du bien', () => {
  /**
   * 🔴🔴 « UNIQUEMENT SI LE BIEN A AU MOINS UN ÉVÉNEMENT » + « Rien d'autre ne bouge dans la fiche (preuve
   * d'empreintes sur une fiche sans événement : identique) ».
   *
   * Le composant rend `null` — rien, pas même un conteneur vide — tant que la liste est vide OU en cours de
   * lecture. Un `<section>` vide, même sans texte, déplacerait ce qui suit d'une marge.
   */
  it('🔴🔴 rien du tout sur un bien sans événement, ni pendant la lecture', () => {
    expect(BLOC).toContain('if (evenements === null || evenements.length === 0) return null;');
  });

  /** 🔴 LES EN COURS DÉPLIÉS, LES CLOS REPLIÉS (Arno). */
  it('🔴 les événements en cours arrivent dépliés', () => {
    expect(BLOC).toContain('setDeplies(new Set(evenements.filter((e) => !e.clos).map((e) => e.id)));');
  });

  /** 🔴 UNE LIGNE POUR UN CLOS : titre, dates, dernière étape. */
  it('🔴 la ligne repliée porte le titre, les dates et la dernière étape', () => {
    expect(BLOC).toContain('evb-objet');
    expect(BLOC).toContain('ouvert le {jourFr(e.ouvertLe)}');
    expect(BLOC).toContain('clos le {jourFr(e.traiteLe)}');
    expect(BLOC).toContain('motEtape(e.derniereEtapeType)');
  });

  /**
   * 🔴🔴 IL EST POSÉ **HORS** DE `ancreVie`, et c'est une nécessité : cette enveloppe est la cible de
   * `?bloc=vie` et du cartouche « Événement en cours ». Y glisser un second bloc ferait viser le défilement
   * au-dessus du moteur, et « on arrive sur l'historique » cesserait de tenir.
   */
  it('🔴🔴 il est juste AU-DESSUS du moteur, et hors de son ancre', () => {
    const i = ANNUAIRE.indexOf('<EvenementsDuBien');
    const j = ANNUAIRE.indexOf('<div ref={ancreVie}>');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(0);
    expect(i, 'le bloc précède le moteur').toBeLessThan(j);
  });

  it('🔴 la date se découpe, elle ne passe pas par un objet Date', () => {
    expect(jourFr('2026-09-23T17:02:00+02:00')).toBe('23/09/2026');
    expect(BLOC).not.toContain('new Date(');
  });
});

describe('④ les routes', () => {
  /**
   * 🔴 LE TYPE EST VÉRIFIÉ CONTRE LA LISTE DU MODULE PUR, et non contre le `CHECK` de la base. Les deux listes
   * ne disent pas la même chose : la base accepte `commentaire` (Monga en écrit), la main ne doit pas pouvoir en
   * poser. Se fier au `CHECK` aurait laissé passer un commentaire fabriqué.
   */
  it('🔴🔴 un type d’étape ajouté à la main est borné par TYPES_AJOUTABLES', () => {
    expect(ROUTE_FRISE).toContain('TYPES_AJOUTABLES.includes(type)');
    expect(ROUTE_ETAPE).toContain('TYPES_AJOUTABLES.includes(type)');
  });

  it('🔒 les deux routes exigent un compte actif et ne se mettent pas en cache', () => {
    for (const [nom, src] of [['frise', ROUTE_FRISE], ['etapes', ROUTE_ETAPE]] as const) {
      expect(src, nom).toContain("exigerCompteActif(request, 'gestion')");
      expect(src, nom).toContain("export const runtime = 'nodejs'");
    }
    expect(ROUTE_FRISE).toContain("'Cache-Control': 'private, no-store'");
  });

  /**
   * 🔴 LE REFUS DIT LA RÈGLE, et ne se contente pas d'un code : c'est ainsi qu'on apprend qu'une étape Monga ne
   * se modifie pas, au lieu de croire à une panne.
   */
  it('🔴 un refus de modification explique pourquoi', () => {
    expect(ROUTE_ETAPE).toContain('une étape venue de Monga ne se modifie pas');
    expect(ROUTE_ETAPE).toContain('une étape venue de Monga ne se retire pas');
  });

  /** ⚠️ `null` EST UNE VALEUR POUR LE MONTANT : effacer un montant saisi par erreur doit être possible. */
  it('⚠️ le montant accepte d’être effacé', () => {
    expect(ROUTE_ETAPE).toContain('Montant retiré.');
  });
});

describe('⑤ les mots', () => {
  it('🔴 le compteur de repères s’accorde', () => {
    expect(motNbReperes(0)).toBe('0 repère');
    expect(motNbReperes(1)).toBe('1 repère');
    expect(motNbReperes(12)).toBe('12 repères');
  });
});

describe('⑥ la feuille', () => {
  /**
   * 🔴 AUCUNE COULEUR EN DUR : jetons `--color-svv-*` uniquement, commentaires compris. C'est ce qui fait que
   * Clair et Sombre suivent sans une ligne de plus — et le garde de feuille du dépôt le refuse de toute façon.
   */
  it('🔴🔴 ni hexadécimal ni rgba dans les deux feuilles', () => {
    for (const [nom, src] of [['FriseAvancement', FRISE], ['EvenementsDuBien', BLOC]] as const) {
      const i = src.indexOf('const CSS_');
      const feuille = src.slice(i);
      expect(feuille, nom).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(feuille, nom).not.toContain('rgba(');
      expect(feuille, nom).toContain('var(--color-svv-');
    }
  });

  /**
   * ⚠️ CIBLES TACTILES ≥ 44 px sur ce qui porte une action principale, et un écran étroit qui tasse au lieu de
   * déborder (exigence transverse du dépôt, CLAUDE.md §15).
   */
  it('⚠️ les cibles et l’écran étroit sont prévus', () => {
    expect(FRISE).toContain('@media (max-width:600px)');
    expect(FRISE).toContain('min-height:44px');
    expect(BLOC).toContain('min-height:44px');
  });
});
