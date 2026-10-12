/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LOT RUBANS-SCROLL-HORIZONTAL-BADGES-A-DROITE-MAILS-AGENCE (08/10/2026) ═════════════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   1. « Seul le défilement HORIZONTAL (deux doigts gauche/droite sur trackpad, Maj+molette, molette
 *      horizontale) déplace le ruban. Le défilement VERTICAL n'est plus intercepté : il fait défiler la PAGE
 *      ENTIÈRE, même curseur posé sur le ruban. Ne retire rien d'autre : flèches ‹ ›, glisser à la souris,
 *      poignée ⠿, défilement automatique aux bords pendant un glisser, tout reste. »
 *   2. « Le bloc d'étiquettes “Auto” · “Événement en cours” · “📎N” […] le déplacer à DROITE, juste avant la
 *      date/heure du mail […] dans le même ordre. […] Rien n'est retiré ni changé dans les badges eux-mêmes. »
 *   3. « Toute adresse d'un domaine de l'agence (@sansvisavis.com et @criterimmo.fr) est “nous / Notre
 *      agence”. Un mail dont l'expéditeur est de l'agence s'affiche comme les autres mails de l'agence (style
 *      “nous”), jamais “non affecté”. Un mail interne (agence → agence) idem. »
 *
 * La RÈGLE de la molette et celle du ton sont éprouvées sur les fonctions elles-mêmes (`defilementFrise.test.ts`,
 * `historiqueBien.test.ts`). Ce fichier-ci tient ce qui ne se voit QUE dans le câblage : qu'un seul crochet sert
 * les DEUX rubans, que les étiquettes forment un groupe poussé à droite, et que rien n'a été retiré au passage.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defilementMolette } from '../../../../lib/gestion/defilementFrise';
import { tonDeLExpediteur } from '../../../../lib/gestion/historiqueBien';
import type { CategoriePartie } from '../../../../lib/gestion/historiqueBien';

const LIGNE = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
const CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useDefilementFrise.ts', 'utf8');
const FRISE_ETAPES = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const FRISE_MAILS = readFileSync('app/(admin)/admin/(protected)/gestion/FriseDuBien.tsx', 'utf8');
const REGLE = readFileSync('app/lib/gestion/defilementFrise.ts', 'utf8');

const ETAT = { scrollLeft: 40, scrollWidth: 1200, clientWidth: 400 };

describe('🔴🔴 ① la molette verticale rend la page au lecteur', () => {
  /**
   * 🔴🔴 LE DÉFAUT D'ARNO, À TOUTES LES POSITIONS. La règle d'avant rendait la main « en butée » seulement : sur
   * un ruban de quarante mois, il fallait le dérouler entièrement avant de pouvoir dépasser la frise.
   */
  it('🔴🔴 au début, au milieu et au bout, le vertical va à la page', () => {
    for (const scrollLeft of [0, 40, 800]) {
      const e = { ...ETAT, scrollLeft };
      for (const deltaY of [-40, 40]) {
        expect(defilementMolette({ deltaX: 0, deltaY, shiftKey: false }, e), `${scrollLeft}/${deltaY}`)
          .toEqual({ dx: 0, prendreLaMain: false });
      }
    }
  });

  /** 🔴 ET LES DEUX GESTES HORIZONTAUX RESTENT : c'est tout ce qui change — ce qui est pris, et ce qui ne l'est plus. */
  it('🔴🔴 le trackpad horizontal et Maj+molette déplacent toujours le ruban', () => {
    expect(defilementMolette({ deltaX: 30, deltaY: 2, shiftKey: false }, ETAT))
      .toEqual({ dx: 30, prendreLaMain: true });
    expect(defilementMolette({ deltaX: 0, deltaY: 40, shiftKey: true }, ETAT))
      .toEqual({ dx: 40, prendreLaMain: true });
  });

  /**
   * 🔴🔴 UN SEUL CROCHET POUR LES DEUX RUBANS, et c'est ce qui rend la correction complète sans l'écrire deux
   * fois. Arno nomme les deux modules ; `useDefilementFrise` les sert tous les deux depuis le lot
   * FRISES-REPARATION, et la règle vit dans le module pur qu'il appelle.
   */
  it('🔴🔴 la frise des étapes et le ruban des mails lisent le même crochet', () => {
    expect(FRISE_ETAPES).toContain("import { useDefilementFrise } from './useDefilementFrise';");
    expect(FRISE_MAILS).toContain("import { useDefilementFrise } from './useDefilementFrise';");
    expect(CROCHET).toContain('const { dx, prendreLaMain } = defilementMolette(e, cible);');
    /* 🔴 ET LE CROCHET N'A AUCUNE RÈGLE À LUI : il pose un écouteur, il ne décide de rien. */
    expect(CROCHET).toContain('if (!prendreLaMain) return;');
  });

  /**
   * ⚠️ « NE RETIRE RIEN D'AUTRE » (Arno) — et ces quatre-là sont nommés dans sa demande : les flèches, le
   * glisser à la souris, la poignée ⠿, le défilement automatique aux bords. Aucun ne passe par la molette ;
   * cette épreuve est là pour qu'on s'en aperçoive si l'un disparaissait avec elle.
   */
  it('⚠️ les flèches, le glisser, la poignée et le défilement aux bords sont intacts', () => {
    expect(REGLE).toContain('export function pasDUnEcran');
    expect(REGLE).toContain('export function glisserCommence');
    expect(REGLE).toContain('export function clicAAvaler');
    expect(CROCHET).toContain('export function useDefilementFrise');
    expect(FRISE_ETAPES).toContain('<span aria-hidden="true">⠿</span>');
  });

  /** ⚠️ ET `peutDefiler` RESTE, parce que les flèches s'allument par lui : c'est la CONVERSION qui part. */
  it('⚠️ la mesure des bords survit au retrait de la conversion', () => {
    expect(REGLE).toContain('export function peutDefiler');
    expect(REGLE).toContain('export function bordsVisibles');
  });
});

describe('🔴🔴 ② les étiquettes passent à droite, contre la date', () => {
  /**
   * 🔴🔴 UN GROUPE, ET NON TROIS MARGES. Les trois étiquettes étaient des frères directs de la rangée flex :
   * pousser « la dernière » à droite les aurait séparées. Réunies, elles se déplacent ensemble.
   */
  it('🔴🔴 les trois étiquettes sont dans un seul conteneur', () => {
    const bloc = LIGNE.slice(LIGNE.indexOf('<span className="vdb-marques">'),
      LIGNE.indexOf('<span className="vdb-quand">'));
    expect(bloc).toContain('vdb-capsule vdb-capsule--${tonCapsule(l.statut as CapsuleStatut)}');
    expect(bloc).toContain('vdb-capsule vdb-capsule--evt');
    expect(bloc).toContain('className="vdb-trombone"');
  });

  /**
   * 🔴 DANS L'ORDRE D'ARNO : le trombone, puis le statut (« Auto »), puis l'événement.
   *
   * ⚠️ CETTE ÉPREUVE A CHANGÉ D'AVIS, ET IL FAUT DIRE POURQUOI. Elle exigeait l'ordre INVERSE — statut, puis
   * événement, puis trombone — qui était celui du lot RUBANS-SCROLL… : à ce moment-là, Arno demandait de
   * DÉPLACER le bloc à droite « dans le même ordre », et l'ordre d'alors était celui-là.
   * Le lot HARMONIE-BOUTONS-ET-TROMBONE (point 1) range l'ordre lui-même : « “📎1” · “Auto” · “Événement en
   * cours” · date. Le trombone et son chiffre passent juste à gauche de la capsule verte “Auto” (ou de la
   * première étiquette présente s'il n'y a pas “Auto”). » C'est aussi l'ordre que la liste de la boîte
   * (`BoiteReception`) et le fil (`Conversation`) écrivaient déjà : cette rangée était la dernière à l'écrire
   * à l'envers. Le verdict change donc parce que la demande a changé, et dans le sens des deux autres écrans.
   */
  it('🔴🔴 l’ordre est celui qu’Arno écrit', () => {
    const bloc = LIGNE.slice(LIGNE.indexOf('<span className="vdb-marques">'),
      LIGNE.indexOf('<span className="vdb-quand">'));
    expect(bloc.indexOf('vdb-trombone')).toBeLessThan(bloc.indexOf('tonCapsule'));
    expect(bloc.indexOf('tonCapsule')).toBeLessThan(bloc.indexOf('vdb-capsule--evt'));
  });

  /**
   * 🔴🔴 UNE SEULE MARGE AUTOMATIQUE DANS LA RANGÉE, ET C'EST LE GROUPE QUI LA PORTE. Deux marges `auto` se
   * PARTAGENT l'espace libre : les étiquettes se seraient posées à mi-chemin du nom et de la date, ce qui
   * n'est ni l'avant ni l'après demandé.
   */
  it('🔴🔴 le groupe pousse à droite, et la date ne pousse plus', () => {
    expect(LIGNE).toContain('.vdb-marques{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin-left:auto;min-width:0}');
    expect(LIGNE).toContain('.vdb-quand{font-size:.76rem;color:var(--color-svv-muted);flex:0 0 auto}');
    expect(LIGNE).not.toContain('.vdb-quand{margin-left:auto');
  });

  /** ⚠️ ET LES ÉTIQUETTES ELLES-MÊMES NE CHANGENT PAS : mêmes conditions, mêmes mots, mêmes info-bulles. */
  it('⚠️ rien n’est retiré ni changé dans les badges', () => {
    expect(LIGNE).toContain('{motCapsule(l.statut as CapsuleStatut)}');
    expect(LIGNE).toContain('{motEvenementEnCours(ouverts.length)}');
    expect(LIGNE).toContain('<span aria-hidden="true">📎</span>{vraies.length}');
    expect(LIGNE).toContain('title={motDuTrombone} aria-label={motDuTrombone}');
  });
});

describe('🔴🔴 ③ un mail de l’agence n’est jamais « non affecté »', () => {
  const CAT = new Map<string, CategoriePartie>([
    ['proprio@fictif.test', 'proprietaire'],
    ['locataire@fictif.test', 'locataire'],
  ]);

  /**
   * 🔴🔴 LE CAS EXACT D'ARNO : le mail du 17/09 sur le bien 315, de a.dasilva@sansvisavis.com à
   * gestion@criterimmo.fr. Il est REÇU, et l'adresse d'une collègue n'est pas une PARTIE du bien : la carte
   * des catégories ne la connaît pas, donc l'ancien calcul rendait « gris » — « non affecté », bordure en
   * pointillés, alors qu'il n'y a aucun geste à faire.
   */
  it('🔴🔴 un mail reçu d’une collègue est « nous », pas « gris »', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: 'a.dasilva@sansvisavis.com' }, CAT)).toBe('nous');
    expect(tonDeLExpediteur({ sens: 'recu', de: 'gestion@criterimmo.fr' }, CAT)).toBe('nous');
  });

  /** 🔴 LES DEUX DOMAINES, LEURS SOUS-DOMAINES, ET NOS ADRESSES NOMMÉES — la définition du dépôt, pas une copie. */
  it('🔴🔴 les deux domaines de l’agence, sous-domaines compris', () => {
    for (const a of [
      'a.jorel@sansvisavis.com', 'quelquun@criterimmo.fr',
      'robot@mail.criterimmo.fr', 'gestion.criterimmo@gmail.com',
    ]) expect(tonDeLExpediteur({ sens: 'recu', de: a }, CAT), a).toBe('nous');
  });

  /** ⚠️ LA CASSE NE CHANGE RIEN : « A.DaSilva@SansVisAvis.com » est la même collègue. */
  it('⚠️ la casse ne change pas le ton', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: 'A.DaSilva@SansVisAvis.COM' }, CAT)).toBe('nous');
  });

  /**
   * 🔴🔴 ET LE GRIS GARDE SON SENS POUR LES AUTRES. C'est la moitié qu'on casserait sans s'en apercevoir : si
   * « nous » attrapait tout, un tiers inconnu passerait pour un collègue, et la marque « non affecté » —
   * qui dit « il reste un geste à faire » — ne désignerait plus personne.
   */
  it('🔴🔴 un expéditeur extérieur inconnu reste gris', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: 'inconnu@ailleurs.test' }, CAT)).toBe('gris');
    expect(tonDeLExpediteur({ sens: 'recu', de: 'proprio@fictif.test' }, CAT)).toBe('rouge');
  });

  /**
   * ⚠️ L'ADRESSE VIDE RESTE GRISE, ET C'EST UNE GARDE, PAS UN DÉTAIL. `estAdresseInterne('')` rend `true` — sa
   * question à elle est « peut-on s'en servir pour désigner une partie ? », et une chaîne vide ne désigne
   * personne. Sans la garde, un mail sans expéditeur lisible serait affirmé des nôtres.
   */
  it('⚠️ une adresse vide ou illisible reste grise, jamais « nous »', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: '' }, CAT)).toBe('gris');
    expect(tonDeLExpediteur({ sens: 'recu', de: '   ' }, CAT)).toBe('gris');
  });

  /** 🔴 ET LA RÈGLE VIENT DE LA DÉFINITION CENTRALE, jamais d'une liste recopiée dans ce module. */
  it('🔴 le module lit `estAdresseInterne`, il ne redéfinit aucun domaine', () => {
    const src = readFileSync('app/lib/gestion/historiqueBien.ts', 'utf8');
    expect(src).toContain("import { estAdresseInterne } from './adresseInterne';");
    const corps = src.slice(src.indexOf('export function tonDeLExpediteur'));
    expect(corps.slice(0, 1200)).not.toContain('sansvisavis.com');
    expect(corps.slice(0, 1200)).not.toContain('criterimmo.fr');
  });
});
