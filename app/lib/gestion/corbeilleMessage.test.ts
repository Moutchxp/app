import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AIDE_CORBEILLE_MESSAGE, BANDEAU_MESSAGE_CORBEILLE, DELAI_BANDEAU_CORBEILLE_MS,
} from './brouillonEnAttente';

/**
 * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — LA GRANDE CORBEILLE DU BLOC D'EN-TÊTE ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Dans le bloc d'en-tête d'un message ouvert (De, À, Cc, Date), à DROITE, une grande
 * icône corbeille qui occupe toute la hauteur du bloc. aria-label et bulle “Mettre ce message à la corbeille”.
 * Clic : ce MESSAGE va à la corbeille (mécanisme de corbeille existant, synchronisé avec Gmail comme aujourd'hui).
 * Un bandeau “Message mis à la corbeille — Annuler” reste quelques secondes. Le message disparaît de la
 * conversation affichée […]. Jamais de suppression définitive. Restaurable depuis la Corbeille. »
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① le geste passe par la corbeille EXISTANTE — une seule route, un seul journal, une seule synchronisation ;
 *   ② la suppression définitive n'est atteignable d'ici en aucune façon ;
 *   ③ l'icône dit CE QU'ELLE JETTE, et le même mot sert la bulle et le lecteur d'écran ;
 *   ④ le bloc d'en-tête ne bouge pas : l'icône prend la place qui restait, toute la hauteur ;
 *   ⑤ le bandeau « Annuler » survit au geste — donc le geste ne ferme pas l'échange.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CONV = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const GESTES = readFileSync('app/(admin)/admin/(protected)/gestion/gestesLigne.ts', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/corbeille/route.ts', 'utf8');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA CORBEILLE EXISTANTE, ET RIEN D'AUTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① le mécanisme est celui qui existe', () => {
  /**
   * 🔴🔴 LA ROUTE TRAVAILLAIT DÉJÀ MESSAGE PAR MESSAGE (`agirSurUn`) : elle ne savait simplement pas en recevoir
   * la liste, elle la déduisait des échanges. On lui a donné la porte qui manquait — pas une seconde corbeille.
   */
  it('🔴🔴 la route accepte des messages, en plus des échanges', () => {
    expect(ROUTE).toContain('if (Array.isArray(corps.messageIds)) {');
    expect(ROUTE).toContain('messageIds?: unknown;');
    /* ⚠️ BORNÉ, comme les échanges : entiers positifs, dédoublonnés, plafonnés. */
    expect(ROUTE).toContain('const MESSAGES_MAX = 200;');
    expect(ROUTE).toContain('.slice(0, MESSAGES_MAX)');
  });

  /** 🔴 ET L'ÉCRAN PASSE PAR LA MÊME FONCTION que la corbeille d'une ligne : `appelerCorbeille`. */
  it('🔴🔴 un seul chemin vers la corbeille', () => {
    expect(GESTES).toContain('export async function gesteCorbeilleMessage(');
    const i = GESTES.indexOf('export async function gesteCorbeilleMessage(');
    const bloc = GESTES.slice(i, i + 400);
    expect(bloc).toContain('appelerCorbeille({');
    expect(bloc).toContain('messageIds: [messageId]');
  });

  /**
   * 🔴🔴 « JAMAIS DE SUPPRESSION DÉFINITIVE » (Arno). Les deux seules actions atteignables d'ici sont
   * « corbeille » et « reintegrer » — la troisième reste réservée à l'écran de la Corbeille, où elle est
   * confirmée.
   */
  it('🔴🔴 la suppression définitive n’est pas atteignable d’ici', () => {
    const i = GESTES.indexOf('export async function gesteCorbeilleMessage(');
    const bloc = GESTES.slice(i, i + 400);
    expect(bloc).not.toContain("'supprimer'");
    /* 🔴 ET LA CONVERSATION NE LA NOMME NULLE PART. */
    const code = CONV.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    expect(code).not.toContain("action: 'supprimer'");
    expect(code).not.toContain('supprimerDefinitivement');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 L'ICÔNE, ET CE QU'ELLE DIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② l’icône dans le bloc d’en-tête', () => {
  /** 🔴 UNE CORBEILLE DESSINÉE NE DIT PAS CE QU'ELLE JETTE : « ce message », et non l'échange, est tout l'écart. */
  it('🔴🔴 le même mot pour la bulle et pour le lecteur d’écran', () => {
    expect(AIDE_CORBEILLE_MESSAGE).toBe('Mettre ce message à la corbeille');
    expect(CONV).toContain('title={AIDE_CORBEILLE_MESSAGE} aria-label={AIDE_CORBEILLE_MESSAGE}');
  });

  /**
   * ══ 🔴🔴 RÉÉCRIT PAR LE LOT CORBEILLE-SANS-STATUT, POINT 1 — LES DEUX CASES, CÔTE À CÔTE ET CARRÉES ══════════
   *
   * ═══ CE QUE CETTE ÉPREUVE EXIGEAIT, ET POURQUOI CELA CHANGE ═════════════════════════════════════════════════
   *
   * Elle figeait une case POSITIONNÉE dans le `<dl>` (`position:absolute`), avec une gouttière réservée par un
   * `padding-right:62px`. C'était la forme des deux lots précédents : la corbeille entrée dans le bloc
   * (DRIVE-HABILLAGE, point 4), puis l'étoile EMPILÉE au-dessus d'elle (HISTORIQUE-BIEN-12, point 2).
   *
   * DEMANDE D'ARNO (06/10/2026) : « Mets-les CÔTE À CÔTE, à l'extrémité droite du bloc gris (même place). Chaque
   * case est environ deux fois plus grande : elle occupe toute la hauteur du bloc gris […] et reste carrée. »
   *
   * 🔴 LA GOUTTIÈRE FIXE NE POUVAIT PAS PORTER CELA : un carré de la hauteur du bloc a une largeur qui dépend du
   * nombre de lignes (De / À / Cc / Cci / Date). Le bloc gris est donc devenu une RANGÉE — le `<dl>` à gauche,
   * les deux cases à droite — et la largeur se réserve d'elle-même.
   *
   * 🔒 CE QUE L'ÉPREUVE PROTÈGE N'A PAS BOUGÉ, et c'est ce qui compte : **une seule surface** (les cases sont
   * DANS le bloc gris, pas à côté), **à l'extrême droite**, **en case de fond de carte** sur la trame grise, et
   * **sans déplacer les lignes** du `<dl>`, qui garde exactement sa grammaire.
   */
  it('🔴🔴 dans le bloc, à droite, côte à côte, carrées, sans rien déplacer', () => {
    /* 🔴 UNE SEULE SURFACE : le bloc gris porte la trame ET les deux cases. La rangée d'avant
       (`cnv-entete-rangee`) posait le bloc et le bouton EN FRÈRES, et le bloc perdait 52 px de largeur. */
    expect(CONV).toContain('.cnv-entete-bloc{display:flex;align-items:stretch;');
    expect(CONV).toContain('background:var(--color-svv-field);border-radius:.5rem;min-width:0}');
    expect(CONV).not.toContain('.cnv-entete-rangee{');
    expect(CONV).not.toContain('className="cnv-entete-rangee"');
    /* 🔴 LE `<dl>` PREND LA PLACE RESTANTE et garde sa grammaire : il ne porte plus ni la trame ni les cases. */
    expect(CONV).toContain('.cnv-entete{flex:1 1 auto;');
    expect(CONV).toContain('<dl className="cnv-entete">');
    /* 🔴 LES DEUX CASES, CÔTE À CÔTE, À L'EXTRÊME DROITE — un seul conteneur, et il ne grandit pas. */
    expect(CONV).toContain('.cnv-entete-cases{flex:0 0 auto;display:flex;align-items:center;gap:6px}');
    /* 🔴🔴 CARRÉES ET DEUX FOIS PLUS GRANDES : 68 px de côté, contre 44 x 34 avant. */
    expect(CONV).toContain('.cnv-entete-cases .cnv-corbeille{flex:0 0 auto;width:68px;height:68px;');
    /* 🔴 ET LES ICÔNES SUIVENT (Arno, « agrandies en proportion »). */
    expect(CONV).toContain('.cnv-entete-cases .cnv-corbeille svg{width:26px;height:26px}');
    expect(CONV).toContain('font-size:1.6rem}');
    /* 🔴 FOND DE CARTE (blanc en Clair, carte sombre en Sombre) sur le gris du bloc, et des coins arrondis. */
    expect(CONV).toContain('background:var(--color-svv-surface)');
    expect(CONV).toContain('border-radius:.5rem;cursor:pointer}');
    /* 🔴🔴 PLUS AUCUNE GOUTTIÈRE FIXE : elle mentait dès que le bloc grandissait. */
    expect(CONV).not.toContain('padding-right:62px');
    expect(CONV).not.toContain('cnv-entete--avec-corbeille');
    expect(CONV).not.toContain('cnv-entete--avec-etoile');
    /* ⚠️ ET PLUS DE POSITIONNEMENT ABSOLU : c'est la rangée qui place, désormais. */
    expect(CONV).not.toContain('.cnv-entete-corbeille{position:absolute');
  });

  /**
   * 🔴🔴 L'ORDRE EST CELUI D'ARNO : « Étoile à gauche, corbeille (ou “Réintégrer” dans la Corbeille) à droite. »
   *
   * ⚠️ ON LIT L'ORDRE DANS LA SOURCE, et non une classe : les deux boutons sont frères dans un conteneur en
   * rangée, et c'est leur ordre d'écriture qui décide de leur place. Une épreuve qui ne regarderait que les
   * classes aurait laissé passer une inversion.
   */
  it('🔴🔴 l’étoile est écrite AVANT la corbeille, donc à sa gauche', () => {
    const zone = CONV.slice(CONV.indexOf('<div className="cnv-entete-cases">'));
    const etoile = zone.indexOf('cnv-entete-etoile');
    const corbeille = zone.indexOf('title={AIDE_CORBEILLE_MESSAGE}');
    const reintegrer = zone.indexOf('aideIconeReintegrer(boiteDuMessage(message))');
    expect(etoile).toBeGreaterThan(-1);
    expect(etoile).toBeLessThan(reintegrer);
    expect(etoile).toBeLessThan(corbeille);
  });

  /**
   * ⚠️ ABSENTE LÀ OÙ LES GESTES NE SONT PAS PERMIS : comme l'étoile et « Répondre » juste au-dessus.
   *
   * 🔴🔴 ASSERTION RECADRÉE LE 04/10/2026 (lot REINTEGRER-PARTOUT-ET-BANDEAU, point 1). Elle figeait la FORME
   * `{onCorbeilleMessage !== undefined && (` ; la case porte désormais DEUX boutons possibles — la corbeille, ou
   * « Réintégrer » sur un mail déjà jeté —, donc un ternaire. La RÈGLE, elle, n'a pas bougé d'un cran : sans
   * rappel, pas de bouton. C'est elle qu'on fige, et non la ponctuation qui l'exprime.
   */
  it('⚠️ pas d’icône là où l’on ne peut pas agir', () => {
    expect(CONV).toContain('onCorbeilleMessage?: () => void;');
    expect(CONV).toContain(': onCorbeilleMessage !== undefined && (');
    expect(CONV).toContain('onCorbeilleMessage={barreActions ? () => void corbeilleDuMessage(m) : undefined}');
    /* 🔴 ET LA MÊME RÈGLE POUR LE GESTE INVERSE : `onReintegrerMessage` absent ⇒ la corbeille reste, plutôt
       qu'un bouton qui n'irait nulle part. */
    expect(CONV).toContain('{message.aLaCorbeille && onReintegrerMessage !== undefined ? (');
    expect(CONV).toContain('onReintegrerMessage?: () => void;');
  });

  /** 🔴 AUCUNE COULEUR EN DUR : les jetons basculent seuls en Clair et en Sombre. */
  it('🔴 l’icône et le bandeau ne passent que par les jetons', () => {
    const i = CONV.indexOf('.cnv-corbeille{');
    const bloc = CONV.slice(i, CONV.indexOf('.cnv-jete-qui') + 120);
    expect(bloc.match(/#[0-9a-fA-F]{3,8}|rgba?\(/g) ?? []).toEqual([]);
    expect(bloc).toContain('var(--color-svv-red)');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE BANDEAU, ET LE RETOUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ « Message mis à la corbeille — Annuler »', () => {
  it('🔴🔴 le bandeau, son mot et son bouton', () => {
    expect(BANDEAU_MESSAGE_CORBEILLE).toBe('Message mis à la corbeille');
    expect(CONV).toContain('{BANDEAU_MESSAGE_CORBEILLE}');
    expect(CONV).toContain('onClick={() => void annulerCorbeilleDuMessage(messageJete.messageId)}>Annuler</button>');
  });

  /** « Quelques secondes » (Arno) : dix, le même rythme que le bandeau de l'éditeur. */
  it('🔴 il s’efface de lui-même', () => {
    expect(DELAI_BANDEAU_CORBEILLE_MS).toBe(10_000);
    expect(CONV).toContain('setTimeout(() => setMessageJete(null), DELAI_BANDEAU_CORBEILLE_MS);');
  });

  /**
   * 🔴🔴 LE GESTE NE FERME PAS L'ÉCHANGE, ET C'EST CE QUI REND « ANNULER » POSSIBLE. `rechargerTout` ferme le fil
   * (`filOuvert: null`) : il aurait emporté le bandeau avec lui, et le geste ne serait plus défaisable. Les
   * compteurs, eux, suivent tout de suite (point 1 de ce lot).
   */
  it('🔴🔴 le geste n’emporte pas son propre bandeau', () => {
    const i = CONV.indexOf('async function corbeilleDuMessage');
    const bloc = CONV.slice(i, i + 1600);
    expect(bloc).toContain("onGeste('', { compteurs: DELTA_FIL_CORBEILLE });");
    expect(bloc).not.toContain('rechargerTout: true');
  });

  /** 🔴 « ANNULER » EST UN VRAI RETOUR : la même route dans l'autre sens, pas un simple masquage. */
  it('🔴🔴 « Annuler » rappelle la corbeille en sens inverse', () => {
    const i = CONV.indexOf('async function annulerCorbeilleDuMessage');
    const bloc = CONV.slice(i, i + 600);
    expect(bloc).toContain('gesteCorbeilleMessage(messageId, false)');
    expect(bloc).toContain("onGeste('Message rétabli.', { compteurs: DELTA_FIL_RESTAURE });");
  });

  /**
   * 🔴 LE MESSAGE DISPARAÎT DE LA CONVERSATION — et c'est l'ÉCRAN qui le retire. La lecture du fil rend tous les
   * messages de l'échange, et c'est ce qu'il faut : ouverte depuis la Corbeille, la conversation doit justement
   * montrer ce qui y est. On ne cache que ce que CE geste vient de jeter.
   */
  it('🔴🔴 le message jeté quitte l’affichage, sans toucher à la lecture du fil', () => {
    expect(CONV).toContain('const [jetes, setJetes] = useState<ReadonlySet<number>>(new Set());');
    expect(CONV).toContain('ordonnerMessages(messages.filter((m) => !jetes.has(m.messageId)), ordre)');
    /* ⚠️ UN ENSEMBLE, PAS UN SEUL : on peut en jeter trois avant que le premier bandeau s'efface. */
    expect(CONV).toContain('setJetes((s) => new Set(s).add(m.messageId));');
  });
});
