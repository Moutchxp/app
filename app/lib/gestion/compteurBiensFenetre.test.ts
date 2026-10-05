import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motNbBiensRattaches, motNbMails } from './ficheRattachement';

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 2 — LE COMPTEUR EN TÊTE DE LA FENÊTRE ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « remplace “N mails dans la conversation” par “N bien(s) rattaché(s) à ce mail”.
 * Il se met à jour EN DIRECT pendant la modification : il compte les biens qui seront rattachés si l'on valide
 * (cartes du haut cochées + biens cochés dans les propositions ou la recherche). Après validation, il reflète
 * l'état enregistré. »
 *
 * 🔴 POURQUOI LE CHANGEMENT EST JUSTE. « N mails dans la conversation » répondait à une question qu'on ne se pose
 * pas dans cette fenêtre : elle parle d'UN mail, et de ses biens. C'était un reste de l'époque où elle montrait
 * « les biens de cet échange ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const RDF = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');

describe('🔴🔴 ① les mots du compteur', () => {
  it('🔴🔴 « N bien(s) rattaché(s) à ce mail », au pluriel juste', () => {
    expect(motNbBiensRattaches(1)).toBe('1 bien rattaché à ce mail');
    expect(motNbBiensRattaches(3)).toBe('3 biens rattachés à ce mail');
  });

  /** 🔴 ZÉRO EST UNE RÉPONSE, et elle se dit en toutes lettres — jamais « 0 bien », qui se lit comme un bogue. */
  it('🔴 zéro se dit en toutes lettres', () => {
    expect(motNbBiensRattaches(0)).toBe('Aucun bien rattaché à ce mail');
    expect(motNbBiensRattaches(-2)).toBe('Aucun bien rattaché à ce mail');
  });

  /** ⚠️ `motNbMails` RESTE : la fenêtre n'est pas seule à compter des mails, et rien d'autre n'est retiré. */
  it('⚠️ le mot des mails n’est pas supprimé, il n’est plus employé ici', () => {
    expect(motNbMails(1)).toBe('1 mail dans la conversation');
    expect(RDF).not.toContain('motNbMails(');
  });
});

describe('🔴🔴 ② il compte ce que « Valider » enverra', () => {
  /**
   * 🔴🔴 LA MÊME LISTE QUE LA VALIDATION, LUE AU MÊME ENDROIT. Un second calcul aurait donné, un jour, un
   * compteur qui annonce autre chose que ce que le bouton écrit — et c'est le genre d'écart qu'on ne voit
   * qu'après avoir validé.
   */
  it('🔴🔴 le compteur lit `selection`, celle qui part à la validation', () => {
    expect(RDF).toContain('motNbBiensRattaches((selection ?? clesDuMail).length)');
    /* 🔴 ET LA VALIDATION PART DE LA MÊME SOURCE : le menu rend la sélection qu'il a reçue.
       ⚠️ `onCochesChange` N'EST PLUS `setSelection` TOUT COURT depuis le lot CLASSER-PAR-LA-MODALE (point 3) :
       le menu rend aussi les NOMS des biens cochés, que la fenêtre mémorise pour préremplir le titre d'un
       événement (sans eux, elle écrivait la clé « 475 »). Ce qui compte pour ce garde n'a pas bougé — la
       sélection est posée par ce rappel, et par lui seul. */
    expect(RDF).toContain('cochesImposees={selection ?? clesDuMail}');
    expect(RDF).toMatch(/onCochesChange=\{\(cles, noms\) => \{\s*\n\s*setSelection\(cles\);/);
  });

  /**
   * ⚠️ HORS MODIFICATION, `selection` EST `null` et l'on compte l'état ENREGISTRÉ. Après une validation, la
   * fenêtre relit la base : le compteur reflète ce qui est écrit, sans que rien n'ait à le lui dire.
   */
  it('⚠️ après validation, la sélection est oubliée et la base reprend la main', () => {
    expect(RDF).toContain('setSelection(null);');
    expect(RDF).toContain('await charger();');
  });

  /** ⚠️ ON NE DIT PAS LA MÊME CHOSE DEUX FOIS : pas de compteur quand le bloc « aucun bien » est affiché. */
  it('⚠️ pas de doublon avec le bloc « aucun bien »', () => {
    expect(RDF).toContain("!(biens.length === 0 && panneau === 'aucun')");
  });
});
