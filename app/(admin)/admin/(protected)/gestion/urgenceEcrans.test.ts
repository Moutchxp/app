import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ecrireEtatUrl, ETAT_DEFAUT } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 LOT URGENCE-EVENEMENT — LE CÂBLAGE DES DEUX ÉCRANS ══════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce fichier éprouve ce que les ÉPREUVES DE COMPOSANT ne peuvent pas atteindre : le branchement de `GestionVue`
 * (quelle carte est visée, où mène le double-clic) et celui du bloc « Événements » de la fiche du bien.
 *
 * ⚠️ IL LIT DU TEXTE DE SOURCE, et c'est assumé pour ces deux-là : `GestionVue` monte tout le module (relève,
 * battement, six écrans) et ne se rend pas dans une épreuve de navigateur. Le COMPORTEMENT de la carte, lui, est
 * éprouvé pour de vrai dans `CarteVive.urgence.test.ts` — c'est là que vivent les clics.
 *
 * 🔒 Aucun réseau, aucune base, aucun mail ni événement RÉEL.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const BLOC = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
const REPO = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 BLOC RENVERSÉ LE 08/10/2026 — LOT CARTES-EVENEMENT-MEME-GESTE ═══════════════════════════════════════

   IL EXIGEAIT que l'écran partagé MÈNE au plein écran sur double-clic, en écrivant `?ecran=evenements&evenement=`.
   ARNO : « Le double-clic de l'écran partagé N'OUVRE PLUS l'écran Événements centré. On passe à l'écran Événements
   UNIQUEMENT par le bouton “Plein écran” de la colonne Événements. »

   🔴 L'ADRESSE RESTE, LE GESTE PART — et c'est exactement ce que ces deux cas vérifient désormais, chacun d'un
   côté de la nuance : plus aucun geste ne l'écrit, et le bouton « Plein écran » est le seul chemin.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① A — plus aucun geste ne mène à l’écran Événements centré', () => {
  it('🔴🔴 le saut par double-clic a été retiré, fonction et branchement', () => {
    expect(VUE).not.toContain('const ouvrirPleinEcranSurEvenement');
    expect(VUE).not.toContain('onPleinEcranSurEvenement=');
    const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    expect(CARTE).not.toContain('onPleinEcranSurEvenement');
  });

  /**
   * 🔴 LE SEUL CHEMIN QUI RESTE, ET IL NE BOUGE PAS : le bouton « Plein écran » de la colonne Événements. Il
   * garde l'étiquette courante, comme avant ce lot.
   */
  it('🔴 le bouton « Plein écran » est le seul chemin, et il est intact', () => {
    /* ⚠️ LOT FILTRES-EVENEMENTS-NEW — le bouton transporte désormais le TRI choisi (`tri: etatUrl.tri`),
       pour que le choix soit conservé entre les deux écrans. Le chemin, lui, ne change pas. */
    expect(VUE).toContain("onClick={() => aller({ ecran: 'evenements', etiquette, filOuvert: null, tri: etatUrl.tri })}");
    expect(VUE).toContain('Plein écran');
  });

  /**
   * 🔴 ET L'ADRESSE, ELLE, RESTE VALIDE : « Le lien &evenement=<id> […] peut rester comme fonction d'adresse »
   * (Arno). On le prouve par ce que `ecrireEtatUrl` produit, et non par le code qui l'appellerait.
   */
  it('🔴 `?ecran=evenements&evenement=<id>` reste une adresse valide', () => {
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'evenements', evenementVise: 12 }))
      .toBe('?ecran=evenements&evenement=12');
  });
});

describe('🔴🔴 ① B — en plein écran, la carte visée est mise en évidence', () => {
  /**
   * 🔴🔴 LA COMPARAISON EST FAITE PAR L'ÉCRAN, à partir de l'adresse — et BORNÉE au plein écran. Dans l'écran
   * partagé, `evenementVise` n'est pas lu de l'adresse (`lireEtatUrl`), mais le `!partage` le dit en toutes
   * lettres plutôt que de s'appuyer sur cette propriété d'un autre fichier.
   */
  it('🔴🔴 `vise` ne vaut qu’en plein écran, et seulement pour l’événement de l’adresse', () => {
    expect(VUE).toContain('vise={!partage && (etatUrl.evenementVise ?? null) === e.evenementId}');
  });
});

describe('🔴🔴 ② la fiche du bien porte le MÊME sélecteur, près de l’en-tête', () => {
  /**
   * 🔴 JUSTE SOUS L'EN-TÊTE, ET NON DEDANS : `evb-tete` EST un `<button>`, et trois boutons dans un bouton
   * seraient du HTML invalide et injouables au clavier. « Près de » est tenu à la lettre : première chose sous le
   * titre, AVANT la frise.
   */
  it('🔴🔴 il est la première chose sous le titre, avant la frise', () => {
    const i = BLOC.indexOf('{ouvert && (');
    expect(i).toBeGreaterThan(-1);
    const corps = BLOC.slice(i, BLOC.indexOf('</>)}', i));
    expect(corps).toContain('<SelecteurUrgence ');
    expect(corps.indexOf('<SelecteurUrgence ')).toBeLessThan(corps.indexOf('<FriseAvancement'));
  });

  /** 🔴 ET IL ÉCRIT PAR LA PORTE QUE CE BLOC EMPLOYAIT DÉJÀ : `ecrire` → `PATCH /evenements/[id]`. */
  it('🔴 il écrit par `ecrire`, la porte existante — aucune porte neuve', () => {
    expect(BLOC).toContain("onUrgence={(u) => void ecrire(e.id, { urgence: u },");
    expect(BLOC).toContain("await fetch(`/api/admin/gestion/evenements/${id}`, {");
    /* ⚠️ UNE SEULE PORTE D'ÉCRITURE DANS CE FICHIER : deux auraient écrit deux histoires dans le journal. */
    expect((BLOC.match(/method: 'PATCH'/g) ?? [])).toHaveLength(1);
  });

  /** ⚠️ `compact` : la fiche est plus serrée que la vue de l'événement. Le pas se réduit, pas la cible tactile. */
  it('⚠️ il y est rendu en mode compact', () => {
    expect(BLOC).toContain('compact');
  });

  /**
   * 🔴 LE NIVEAU LUI ARRIVE DE LA BASE, sans quoi le sélecteur ne saurait pas lequel mettre en évidence — et
   * remettrait à zéro, à l'œil, un niveau pourtant enregistré.
   */
  it('🔴 le niveau est lu par le dépôt, et sert le sélecteur', () => {
    expect(REPO).toContain("${avecUrgence ? 'e.urgence' : 'NULL::text AS urgence'}");
    expect(REPO).toContain('const avecUrgence = await evenementQualifieDisponible();');
    expect(REPO).toContain('urgence: r.urgence,');
    expect(BLOC).toContain('urgence={e.urgence}');
  });
});
