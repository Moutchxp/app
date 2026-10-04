import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cibleDeposerIci, RACINE_DRIVES_PARTAGES, RACINE_PARTAGES_AVEC_MOI } from './cibleDepot';
import { motDeposerIci } from './rangementDrive';
import { motProchaineAnnulation } from './driveDeplacement';

/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 5 — « DÉPOSER ICI » ET « ANNULER LE DERNIER DÉPLACEMENT » ═══════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « éprouve-les pour de vrai dans “Test”, en arborescence ET en liste, avec un dossier
 * sélectionné et sans dossier sélectionné. Le bouton inactif doit l'afficher clairement et dire pourquoi. Vérifie le
 * registre et le picto après chaque geste. Corrige ce qui ne marche pas, puis remets “Test” dans son état d'origine. »
 *
 * ═══ 🔴🔴 CE QUE L'ÉPREUVE RÉELLE A TROUVÉ — QUATRE DÉFAUTS, TOUS INVISIBLES AUX TESTS D'AVANT ═══════════════════
 *
 *   ① « Déposer ici » ÉTAIT MORT EN ARBORESCENCE. « Test » déplié par son triangle ET sélectionné : le bouton
 *      restait éteint, en disant « ouvrez-le et choisissez un dossier dedans » — c'est-à-dire ce qu'on venait de
 *      faire. La cible était le dossier AFFICHÉ, qui en arborescence est la racine, donc un REGROUPEMENT.
 *   ② LE MOT DE L'ANNULATION MENTAIT après un « Couper » suivi d'un changement de dossier : « Remettre «  » dans
 *      “Test creation dossier drive” » — nom VIDE, et le dossier d'ARRIVÉE donné pour l'origine.
 *   ③ LE BANDEAU DISAIT « déplacé vers “Drive” » pour un déplacement vers la racine du Drive partagé « Test ».
 *   ④ LE DÉPÔT ÉCRIVAIT « Drive » DANS LE REGISTRE, pour la même raison — et celui-là s'écrit, donc il mentirait
 *      pour toujours. C'est la cinquième apparition de ce piège dans ce module.
 *
 * Et un cinquième, qui n'était pas du ressort de ce point mais que le dépôt réel a révélé : la migration 301 avait
 * cassé les deux `ON CONFLICT` du registre. Voir `conflitRegistreCopies.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SFD = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');

const TEST = { id: '0AJbf9smGcnxEUk9PVA', nom: 'Test' };
const SOUS = { id: '1dCY-AXEVs3zAaxvhb3dbkUAK6mDp34LP', nom: 'Test creation dossier drive' };
const REGROUPEMENT = { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' };

describe('🔴🔴 ① où « Déposer ici » pose — les quatre cas d’Arno', () => {
  /**
   * 🔴 EN LISTE, SANS SÉLECTION : le dossier affiché, exactement comme avant ce point. C'est l'assertion qui
   * garantit que le correctif n'a RIEN re-ciblé — personne ne verra son dépôt partir ailleurs qu'hier.
   */
  it('🔴 en liste, dans « Test », sans sélection → « Test »', () => {
    const c = cibleDeposerIci(TEST, []);
    expect(c.cible).toEqual(TEST);
    expect(c.refus).toBeNull();
    expect(c.parLaSelection).toBe(false);
    expect(motDeposerIci(1, null)).toBe('Déposer ici');
  });

  /**
   * 🔴🔴 EN LISTE, AVEC UNE SÉLECTION : LE DOSSIER AFFICHÉ GAGNE QUAND MÊME. C'est le cœur de la prudence du
   * correctif : dans « Test », sélectionner un sous-dossier ne détourne pas un geste qui marchait. Si la
   * sélection l'emportait, quelqu'un qui a cliqué une ligne au passage verrait son dépôt partir ailleurs — et il
   * ne s'en apercevrait qu'en cherchant le document.
   */
  it('🔴🔴 en liste, avec un sous-dossier sélectionné → toujours « Test », pas la sélection', () => {
    const c = cibleDeposerIci(TEST, [SOUS]);
    expect(c.cible).toEqual(TEST);
    expect(c.parLaSelection).toBe(false);
  });

  /**
   * 🔴🔴 EN ARBORESCENCE, AVEC LE DOSSIER DÉPLIÉ ET SÉLECTIONNÉ : LE BOUTON VIT, ET IL NOMME SA CIBLE.
   * C'est le défaut ① réparé. Mesuré à l'écran après correction : le bouton affiche « Déposer dans “Test” » et
   * n'est plus désactivé.
   */
  it('🔴🔴 en arborescence, « Test » sélectionné sous un regroupement → « Déposer dans “Test” »', () => {
    const c = cibleDeposerIci(REGROUPEMENT, [TEST]);
    expect(c.cible).toEqual(TEST);
    expect(c.refus).toBeNull();
    expect(c.parLaSelection).toBe(true);
    expect(motDeposerIci(1, c.cible?.nom)).toBe('Déposer dans « Test »');
    expect(motDeposerIci(3, c.cible?.nom)).toBe('Déposer dans « Test » (3)');
  });

  /**
   * 🔴 LE BOUTON ÉTEINT DIT POURQUOI — dans les trois cas où il l'est. Arno : « le bouton inactif doit l'afficher
   * clairement et dire pourquoi ». Mesuré à l'écran, les trois infobulles sont celles-ci.
   */
  it('🔴 éteint à la racine, sur un regroupement, et sur deux dossiers — avec son motif', () => {
    expect(cibleDeposerIci(null, []).refus)
      .toBe('Entrez dans un dossier du Drive, ou sélectionnez-en un.');
    const r = cibleDeposerIci(REGROUPEMENT, []).refus ?? '';
    expect(r).toContain('n’est pas un dossier, c’est un regroupement');
    /* 🔴 ET LE MOT EST COMPLÉTÉ : il disait seulement « ouvrez-le », ce qui laissait croire qu'une sélection ne
       suffisait pas. Elle suffit, depuis ce point. */
    expect(r).toContain('déplier un dossier et le sélectionner');
    /* ⚠️ DEUX DOSSIERS SÉLECTIONNÉS NE DONNENT PAS DE CIBLE : choisir pour la personne serait deviner, et un
       dépôt ne se défait pas. Le refus dit leur nombre. */
    const deux = cibleDeposerIci(REGROUPEMENT, [TEST, SOUS]);
    expect(deux.cible).toBeNull();
    expect(deux.refus).toContain('2 dossiers sont sélectionnés');
  });

  /** ⚠️ UN REGROUPEMENT SÉLECTIONNÉ N'EST PAS UNE CIBLE NON PLUS : il n'existe pas chez Google. */
  it('⚠️ « Partagés avec moi » sélectionné ne devient pas une cible', () => {
    const c = cibleDeposerIci(REGROUPEMENT, [{ id: RACINE_PARTAGES_AVEC_MOI, nom: 'Partagés avec moi' }]);
    expect(c.cible).toBeNull();
    expect(c.refus).not.toBeNull();
  });

  /** 🔴 LE BOUTON LIT CE MODULE, il ne tranche plus lui-même — et la sélection vient de l'arbre APLATI. */
  it('🔴 l’écran délègue la cible au module pur, et lit l’arbre entier', () => {
    expect(SFD).toContain('const cibleDepot = cibleDeposerIci(dossierCourant, dossiersChoisis);');
    expect(SFD).toContain('disabled={cibleDepot.cible === null}');
    expect(SFD).toContain('title={cibleDepot.refus ?? undefined}');
    /* ⚠️ `lignes` ET NON `visibles` : un dossier sélectionné puis sorti du champ par un défilement reste
       sélectionné. Le lire dans la fenêtre virtualisée aurait fait disparaître la cible en défilant. */
    expect(SFD).toContain('const dossiersChoisis = lignes\n    .filter((l) => l.entree.dossier '
      + '&& selection.ids.includes(l.entree.id))');
    expect(SFD).not.toContain('const dossiersChoisis = visibles');
  });
});

describe('🔴🔴 ② le mot de « Annuler le dernier déplacement »', () => {
  /** 🔴 LA PILE VIDE DIT AUSSI POURQUOI une copie n'y entre jamais : c'est la question qu'on se pose. */
  it('🔴 pile vide : le motif explique, et il parle des copies', () => {
    const m = motProchaineAnnulation([]);
    expect(m).toContain('Aucun geste à annuler');
    expect(m).toContain('Une copie ne s’annule pas');
  });

  /** 🔴 ET IL DIT CE QUE LE CLIC VA FAIRE, avec le nom du fichier et son dossier d'ORIGINE. */
  it('🔴 un déplacement : « Remettre « … » dans « … » »', () => {
    expect(motProchaineAnnulation([{
      sorte: 'deplacer', mouvements: [184], nom: '_MESURE multipart 0.txt', nombre: 1, origineNom: 'Test',
    }])).toBe('Remettre « _MESURE multipart 0.txt » dans « Test »');
  });

  /**
   * ══ 🔴🔴 LE NOM ET L'ORIGINE VIENNENT DE LA PRISE, PAS DU DOSSIER AFFICHÉ ═════════════════════════════════
   *
   * DÉFAUT ② MESURÉ À L'ÉCRAN. Après « Couper » dans « Test », navigation dans le sous-dossier, puis « Coller
   * ici », le bouton annonçait « Remettre «  » dans “Test creation dossier drive” ». Deux mensonges dans une
   * phrase : le nom était vide, et le dossier d'ARRIVÉE était donné pour l'origine.
   *
   * LA CAUSE : l'élément coupé n'étant plus à l'écran, il était reconstruit « minimal » — sans nom ni parent — et
   * `mouvoir` se rabat alors sur le dossier AFFICHÉ pour l'origine. Le déplacement, lui, était juste : seul le
   * mot mentait, c'est-à-dire la seule chose qu'on lit avant de cliquer.
   *
   * 🔴 LA PRISE RETIENT DONC LES NOMS, comme elle retenait déjà « lesquels sont des dossiers » — et pour
   * exactement la même raison, écrite au même endroit.
   */
  it('🔴🔴 la prise retient les noms, et le collage les utilise avec le parent d’origine', () => {
    expect(SFD).toContain('noms: Object.fromEntries(pris.map((x) => [x.id, x.nom])),');
    /* ⚠️ LES DEUX PORTES DE LA PRISE (clavier ⌘X et menu contextuel) le font : deux chemins qui différeraient
       feraient mentir le bouton une fois sur deux. */
    expect((SFD.match(/noms: Object\.fromEntries/g) ?? [])).toHaveLength(2);
    expect(SFD).toContain('nom: presse.noms?.[id] ?? \'\', dossier: presse.dossiers.includes(id),');
    expect(SFD).toContain('parentId: presse.parentSource,');
  });
});

describe('🔴🔴 ③ le nom générique de racine, cinquième apparition', () => {
  /**
   * 🔴🔴 `files.get` SUR LA RACINE D'UN DRIVE PARTAGÉ REND « Drive ». Ce piège a déjà coûté le fil d'Ariane,
   * l'index des empreintes et le nettoyage des fantômes. Ce point en a trouvé deux de plus : le bandeau d'un
   * déplacement, et — plus grave, parce qu'il s'écrit — le `dossier_nom` du registre à chaque dépôt.
   *
   * ⚠️ LA FONCTION EST EXPORTÉE, PAS RECOPIÉE : une quatrième copie aurait été celle qu'on oublie de corriger.
   */
  it('🔴🔴 la route de déplacement nomme sa cible par `nommerLaRacine`', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/drive/deplacer/route.ts', 'utf8');
    expect(route).toContain("const nomCible = (await nommerLaRacine(jeton.jeton, chaineCible))[0]?.nom ?? 'ce dossier'");
    expect(route).toContain('nommerLaRacine }');
    const verdict = readFileSync('app/lib/gestion/driveVerdict.ts', 'utf8');
    expect(verdict).toContain('export async function nommerLaRacine(');
  });

  /**
   * 🔴🔴 ET LE DÉPÔT CORRIGE LE NOM AVANT DE L'ÉCRIRE. Mesuré en base après un dépôt réel dans « Test » :
   * `dossier_nom` valait « Drive » (ligne 26557), et vaut « Test » après correction (ligne 26558).
   *
   * ⚠️ UN SEUL APPEL DE PLUS, ET SEULEMENT SUR LE NOM GÉNÉRIQUE : la garde est dans la condition.
   */
  it('🔴🔴 le dépôt n’écrit plus « Drive » dans le registre', () => {
    const d = readFileSync('app/lib/gestion/depotDriveReel.ts', 'utf8');
    expect(d).toContain('if (d.valeur.nom !== NOM_GENERIQUE_RACINE_DRIVE || d.valeur.driveId === null)');
    expect(d).toContain('const vrai = await nomDuDrive(jeton, d.valeur.driveId, { fetch }).catch(() => null);');
    expect(d).toContain('return { nom: vrai ?? d.valeur.nom, driveId: d.valeur.driveId };');
    /* ⚠️ ET SON ÉCHEC NE FAIT PAS ÉCHOUER LE DÉPÔT : `catch` rend `null`, et l'on garde le nom générique —
       vague, mais pas faux. Un dépôt ne doit pas se perdre pour un nom d'affichage. */
  });
});
