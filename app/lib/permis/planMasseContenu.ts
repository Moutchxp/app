import { estPageCartouche, type FamillePlan } from './planMasse';
import { cotesTableNivellement } from './extractionCaracteristiques';
import { estPieceCerfaPc } from './identifierCerfa';

/**
 * PROV-2 (a) — FAMILLE d'une pièce par son CONTENU, en REPLI quand le NOM ne classe rien (noms opaques, ex. 531). Même cause racine
 * et mêmes signaux que LECT-1 A/B. ⚠️ On n'utilise QUE des signaux PROPRES AU DESSIN / AU FORMULAIRE, jamais une mention en prose :
 * une NOTICE qui écrit « plan de masse » ou « niveau » dans son texte NE DOIT PAS être prise pour un plan (piège mesuré sur 531 :
 * `familleDePage` sur le texte complet classait 6 notices en « masse », 3 en « étage »). Les signaux retenus, du plus spécifique au
 * moins :
 *   · CERFA  ← `estPieceCerfaPc` (LECT-1 A : n° national 13409 + contexte cerfa/permis dans les 1res pages) — 0 faux positif ;
 *   · coupe  ← une TABLE DE NIVELLEMENT (LECT-1 B : suite de cotes appariées à RDC/R+n/Égout/Faîtage) — propre à une coupe/section,
 *             jamais à une notice ;
 *   · masse  ← le CARTOUCHE réglementaire (« PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER », `estPageCartouche`) — titre de
 *             planche, jamais une prose.
 * ⚠️ Fragilité assumée (à redire au porteur) : (a) la famille 'etage' n'a PAS de signal de contenu FIABLE (le motif « plan du R+n »
 *   est trop bruité en prose) → non reconnue par le contenu ici, à défaut d'un cartouche d'étage propre ; (b) une pièce MUETTE
 *   (scan sans couche texte) n'a aucun signal → non classée (elle reste dans « autres », atteignable au repli). Mesuré sur 531 :
 *   1 cerfa + 3 coupes surfacés (0 faux positif), là où le nom seul donnait 0.
 * PUR (aucune I/O). Vit CÔTÉ SERVEUR (importe l'extraction) : n'est appelé que par la route emprise, jamais bundlé côté client.
 */
export function familleDeContenu(pagesTexte: readonly string[]): FamillePlan | null {
  if (pagesTexte.length === 0) return null;                                             // pièce muette (scan) → non classée par le contenu
  if (estPieceCerfaPc(pagesTexte.slice(0, 3))) return 'cerfa';                          // LECT-1 A
  if (pagesTexte.some((t) => cotesTableNivellement(t).length > 0)) return 'coupe';      // LECT-1 B : table de nivellement = coupe
  if (pagesTexte.some((t) => estPageCartouche(t))) return 'masse';                      // cartouche réglementaire = plan de masse
  return null;
}
