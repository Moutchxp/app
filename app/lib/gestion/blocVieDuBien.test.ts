import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ecrireEtatUrl, ETAT_DEFAUT, lireEtatUrl } from './ecranUrl';
import { adresseHistoriqueDuBien } from './ficheRattachement';

/**
 * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 0 — « HISTORIQUE DU BIEN » SE POSE SUR « VIE DU BIEN » ══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026), en réponse à la question du lot précédent : « oui, “Historique du bien” pose la
 * page directement sur le bloc “Vie du bien” de la fiche (paramètre d'adresse + défilement). La flèche retour
 * reste inchangée. »
 *
 * 🔴 CE QUI MANQUAIT. Le bouton s'appelle « Historique du bien » et déposait en haut de la fiche — c'est-à-dire
 * sur les coordonnées du propriétaire. L'historique y était, deux écrans plus bas.
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① le bouton porte `&bloc=vie`, et l'adresse se relit à l'identique ;
 *   ② `bloc` ne vaut rien sans sa fiche, et toute autre valeur vaut « par le haut » — jamais une erreur ;
 *   ③ les DEUX chemins (le cartouche de la fiche, et l'adresse) se rejoignent sur le MÊME état de défilement ;
 *   ④ changer de fiche à la main efface le paramètre : il ne colle pas aux fiches suivantes ;
 *   ⑤ la flèche retour n'est pas touchée.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
/** Le code SEUL : un mot cité dans un encadré ne prouve rien. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
  .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 L'ADRESSE DU BOUTON
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① « Historique du bien » vise le bloc', () => {
  it('🔴🔴 l’adresse porte la fiche ET le bloc', () => {
    expect(adresseHistoriqueDuBien(287)).toBe('/admin/gestion?ecran=annuaire&fiche=lot-287&bloc=vie');
  });

  /** ⚠️ ET ELLE RESTE SANS LIEN quand le bien n'a pas d'identifiant : le bouton s'éteint, il ne vise rien. */
  it('⚠️ pas d’identifiant, pas d’adresse — donc pas de bloc non plus', () => {
    expect(adresseHistoriqueDuBien(null)).toBeNull();
    expect(adresseHistoriqueDuBien(0)).toBeNull();
  });

  /**
   * 🔴 ELLE SE RELIT EXACTEMENT. C'est tout l'intérêt de la mettre dans l'adresse plutôt que dans un état : elle
   * survit à un rechargement, et elle s'envoie à un collègue.
   */
  it('🔴🔴 lue puis réécrite, c’est la même adresse', () => {
    const q = '?ecran=annuaire&fiche=lot-287&bloc=vie';
    expect(lireEtatUrl(q).bloc).toBe('vie');
    expect(lireEtatUrl(q).fiche).toEqual({ sorte: 'lot', id: 287 });
    expect(ecrireEtatUrl(lireEtatUrl(q))).toBe(q);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 UNE ADRESSE ABÎMÉE OUVRE LA FICHE PAR LE HAUT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② ce que l’adresse ne dit pas, elle ne l’invente pas', () => {
  /** ⚠️ ORPHELIN : un `?bloc=vie` sans fiche ne désigne aucun endroit — comme `?message=` sans `?fil=`. */
  it('🔴 un `bloc` sans fiche ne vaut rien, ni à la lecture ni à l’écriture', () => {
    expect(lireEtatUrl('?ecran=annuaire&bloc=vie').bloc).toBeNull();
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: null, bloc: 'vie' }))
      .toBe('?ecran=annuaire');
  });

  /** ⚠️ HORS DE L'ANNUAIRE non plus : le traîner mettrait deux adresses dans l'historique pour un seul écran. */
  it('🔴 il n’existe que dans l’annuaire', () => {
    expect(lireEtatUrl('?fil=9&bloc=vie').bloc).toBeNull();
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, filOuvert: 9, bloc: 'vie' })).toBe('?fil=9');
  });

  /** ⚠️ UNE VALEUR INCONNUE VAUT « par le haut » : une adresse abîmée ne doit jamais faire écran blanc. */
  it('⚠️ une valeur inconnue ouvre la fiche normalement', () => {
    for (const v of ['', 'oui', '1', 'VIE', 'proprietaire']) {
      expect(lireEtatUrl(`?ecran=annuaire&fiche=lot-287&bloc=${v}`).bloc, v).toBeNull();
    }
    /* 🔴 ET LA FICHE, ELLE, S'OUVRE QUAND MÊME : on ne perd pas l'écran pour un paramètre de trop. */
    expect(lireEtatUrl('?ecran=annuaire&fiche=lot-287&bloc=oui').fiche).toEqual({ sorte: 'lot', id: 287 });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LES DEUX CHEMINS, UN SEUL DÉFILEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ le cartouche et l’adresse se rejoignent', () => {
  /**
   * 🔴🔴 UN SEUL ÉTAT COMMANDE LE DÉFILEMENT (`vieDuBienVisee`), et les deux chemins l'alimentent. Deux
   * mécanismes auraient fini par se poser deux fois — ou pas du tout.
   */
  it('🔴🔴 l’adresse passe par le MÊME état que le cartouche', () => {
    const c = code(ANNUAIRE);
    expect(c).toContain('poserSurVie = false,');
    expect(c).toContain('poserSurVie?: boolean;');
    /* 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 6 — la garde accueille `bien`, l'autre nom de la MÊME fiche de
       bien (adressée par la clé WIPPIMMO au lieu de l'identifiant interne). Sans elle, « Vie du bien » ne se
       serait posée que sur l'une des deux adresses, pour un seul et même écran. */
    expect(c).toContain(
      "if (!poserSurVie || fiche === null || (fiche.sorte !== 'lot' && fiche.sorte !== 'bien')) return;",
    );
    expect(c).toContain('setVieDuBienVisee(fiche.id);');
    /**
     * ⚠️ L'EFFET DE DÉFILEMENT RESTE CELUI D'ORIGINE, inchangé — on lui donne une seconde source, pas un second
     * mécanisme. (Le fichier porte un autre `scrollIntoView` : celui du cartouche « événements ouverts » en tête
     * de la fiche, qui se pose au même endroit sans passer par l'état. Il n'est pas touché non plus.)
     */
    expect(c).toContain('ancreVie.current?.scrollIntoView({ block: \'start\' });');
    expect(c).toContain('if (!poserSurVieDuBien) return;');
  });

  /** 🔴 L'ÉCRAN LIT LE PARAMÈTRE ET LE DONNE À L'ANNUAIRE — nulle part ailleurs. */
  it('🔴 `bloc=vie` arrive jusqu’à la fiche', () => {
    expect(code(VUE)).toContain("poserSurVie={etatUrl.bloc === 'vie'}");
  });

  /**
   * 🔴🔴 CHANGER DE FICHE À LA MAIN EFFACE LE PARAMÈTRE. Sans cela, `bloc=vie` collerait à toutes les fiches
   * ouvertes ensuite depuis l'annuaire, et chacune sauterait sur son historique sans qu'on l'ait demandé.
   */
  it('🔴🔴 une autre fiche s’ouvre par le haut', () => {
    expect(code(VUE)).toContain('onFiche={(f) => aller({ ...etatUrl, fiche: f, bloc: null })}');
  });

  /**
   * ⚠️ LA FLÈCHE RETOUR N'EST PAS TOUCHÉE (Arno : « la flèche retour reste inchangée »). Elle ne dépend que de
   * l'historique du navigateur, que ce lot n'écrit pas : `bloc` n'entre pas dans `memeEtat`, donc il n'ajoute ni
   * ne retire aucune entrée.
   */
  it('⚠️ rien n’est ajouté à la comparaison des écrans', () => {
    const src = readFileSync('app/lib/gestion/ecranUrl.ts', 'utf8');
    const i = src.indexOf('export function memeEtat');
    expect(src.slice(i, i + 700)).not.toContain('bloc');
  });
});
