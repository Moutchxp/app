import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — L'ŒIL OUVRE LA VISIONNEUSE, PARTOUT ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026) : « dans le résumé des pièces, l'œil ouvre le document directement en plein écran
 * au lieu de la visionneuse habituelle (fenêtre avec le document, le renommage au-dessus, la navigation et la
 * fermeture). »
 *
 * 🔴 LA CAUSE, TROUVÉE DANS `git log` : commit `801e9133` — lot HISTORIQUE-BIEN-1, point 2, celui qui a CRÉÉ le
 * bloc « Historique du bien ». Ce n'était pas un accident de code mais un ARBITRAGE, écrit en toutes lettres à
 * côté du geste : la visionneuse « a besoin du TOUR des pièces de l'ÉCHANGE », et le résumé rassemble les pièces
 * de plusieurs échanges, donc « un tour qui les mélangerait franchirait la frontière que ce parent existe pour
 * tenir ». L'œil ouvrait donc `window.open(lienDocumentEntier(pieceId))`.
 *
 * 🔴 L'ARBITRAGE ÉTAIT FAUX. Le parent inventé (`PARENT_PIECES_CONVERSATION`) tient UNE frontière : qu'aucun
 * fichier du DRIVE n'entre dans le tour d'une pièce de courrier. Il n'a jamais borné le tour à un échange — c'est
 * la LISTE passée en voisinage qui le borne, et elle vaut ce qu'on lui donne.
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER PROTÈGE, ET POURQUOI IL EST ÉCRIT SUR LE TEXTE DES SOURCES ═══════════════════════════
 *
 * Le défaut n'est pas « la visionneuse ne s'ouvre pas » — elle s'ouvrait très bien dans la conversation. Il est
 * que le MÊME œil, dans le MÊME composant, faisait deux choses selon l'écran qui le monte. C'est un défaut de
 * CÂBLAGE entre quatre écrans, et aucune épreuve montée sur un seul d'entre eux ne l'aurait vu : chacun passait.
 *
 * On éprouve donc ce qu'aucun rendu ne montre — que les quatre portes mènent à la MÊME fenêtre, et qu'aucune ne
 * retombe sur un onglet.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ECRAN = 'app/(admin)/admin/(protected)/gestion';
const lire = (f: string): string => readFileSync(`${ECRAN}/${f}`, 'utf8');

/** Le texte sans les commentaires : un encadré qui PARLE de `window.open` ne doit pas faire échouer un garde. */
function codeSeul(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Les quatre endroits qu'Arno nomme, et le composant qu'ils doivent tous monter. */
const PORTES = [
  { fichier: 'HistoriqueDuBien.tsx', quoi: 'le résumé des pièces de l’Historique du bien, et son mail déplié' },
  { fichier: 'Conversation.tsx', quoi: 'le résumé des pièces d’une conversation' },
  { fichier: 'SelecteurFichierDrive.tsx', quoi: 'la fenêtre Drive' },
] as const;

describe('🔴🔴 ① les quatre portes mènent à LA visionneuse, jamais à un onglet', () => {
  for (const { fichier, quoi } of PORTES) {
    it(`🔴🔴 ${quoi} monte ApercuFichierDrive`, () => {
      const code = codeSeul(lire(fichier));
      expect(code, fichier).toContain('<ApercuFichierDrive');
    });
  }

  /**
   * 🔴🔴 LE GARDE QUI AURAIT ATTRAPÉ LE DÉFAUT D'ARNO. C'est la ligne exacte que `801e9133` avait écrite : l'œil
   * du résumé rendant la main à `window.open`. Elle ne doit jamais revenir.
   */
  it('🔴🔴 `onVoir` n’ouvre JAMAIS un onglet — c’est le défaut signalé par Arno', () => {
    for (const { fichier } of PORTES) {
      const code = codeSeul(lire(fichier));
      expect(code, fichier).not.toMatch(/onVoir:\s*\([^)]*\)\s*=>\s*\{?\s*window\.open/);
    }
  });

  /**
   * 🔴 ET L'ŒIL DU RÉSUMÉ POSE BIEN LA PIÈCE VUE. Sans cela le composant serait importé et jamais atteint —
   * une visionneuse montée dans le fichier ne prouve pas que l'œil y mène.
   */
  it('🔴🔴 l’œil du résumé de l’Historique du bien pose la pièce à voir', () => {
    const code = codeSeul(lire('HistoriqueDuBien.tsx'));
    expect(code).toContain('onVoir: (pieceId) => setPieceVue(pieceId)');
    expect(code).toContain('{pieceVue !== null && (');
  });

  /** 🔴 LE MAIL DÉPLIÉ A SON ŒIL, et il ouvre LA MÊME fenêtre : `PiecesJointes` ne l'affiche qu'avec ce rappel. */
  it('🔴🔴 le mail déplié de l’Historique du bien ouvre la même visionneuse', () => {
    const code = codeSeul(lire('HistoriqueDuBien.tsx'));
    expect(code).toContain('onVisualiser={setPieceVue}');
    expect(codeSeul(lire('VieDuBien.tsx'))).toContain('onVisualiser={onVisualiser}');
  });
});

describe('🔴🔴 ② la visionneuse n’est JAMAIS recopiée', () => {
  /**
   * 🔴 ARNO L'ÉCRIT : « même composant, AUCUNE COPIE ». Un seul fichier définit cette fenêtre ; tous les autres
   * l'importent. Deux visionneuses auraient divergé au premier correctif — et c'est précisément en voulant
   * éviter d'en écrire une seconde que l'œil du résumé avait été branché sur un onglet.
   */
  it('🔴🔴 un seul fichier la DÉFINIT, les autres l’IMPORTENT', () => {
    expect(lire('ApercuFichierDrive.tsx')).toContain('export function ApercuFichierDrive(');
    for (const { fichier } of PORTES) {
      expect(codeSeul(lire(fichier)), fichier)
        .toMatch(/import \{[^}]*ApercuFichierDrive[^}]*\} from '\.\/ApercuFichierDrive'/);
      expect(codeSeul(lire(fichier)), fichier).not.toContain('function ApercuFichierDrive(');
    }
  });

  /**
   * 🔴 LA FENÊTRE PORTE CE QU'ARNO ÉNUMÈRE : « le document, le RENOMMAGE au-dessus, la NAVIGATION et la
   * FERMETURE ». Le résumé de l'Historique du bien les passe toutes — sans le renommage, la fenêtre rétablie
   * n'aurait pas été « la visionneuse habituelle », seulement un cadre.
   */
  it('🔴 le résumé de l’Historique du bien passe le renommage, le tour et la fermeture', () => {
    const code = codeSeul(lire('HistoriqueDuBien.tsx'));
    expect(code).toContain('renommage={(idAffiche) =>');
    expect(code).toContain('voisinage={voisinagePiecesConversation(piecesVisionnables)}');
    expect(code).toContain('onFermer={() => setPieceVue(null)}');
  });
});
