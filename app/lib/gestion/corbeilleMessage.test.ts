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

  /**
   * 🔴 ET L'ÉCRAN PASSE PAR LA MÊME FONCTION que la corbeille d'une ligne : `appelerCorbeille`.
   *
   * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — `appelerCorbeille({` EST DEVENU `appelerCorbeille(` ══════
   *
   * CETTE ÉPREUVE EXIGEAIT L'ACCOLADE COLLÉE, c'est-à-dire un appel à UN seul argument littéral. Elle a changé de
   * forme, pas de verdict : l'appel prend maintenant un troisième argument (le fil que ce message vide, pour
   * l'annonce seule — voir `signalCorbeille`), donc le corps littéral est sur la ligne suivante.
   *
   * 🔴 CE QUI EST ÉPROUVÉ RESTE EXACTEMENT « UN SEUL CHEMIN » : l'appel à `appelerCorbeille`, et la désignation
   * par message. L'accolade n'était qu'un détail de mise en page — le genre de chose qu'une épreuve ne doit pas
   * figer, sous peine de se croire cassée quand seul un argument s'ajoute.
   */
  it('🔴🔴 un seul chemin vers la corbeille', () => {
    expect(GESTES).toContain('export async function gesteCorbeilleMessage(');
    const i = GESTES.indexOf('export async function gesteCorbeilleMessage(');
    const bloc = GESTES.slice(i, i + 1400);
    expect(bloc).toContain('appelerCorbeille(');
    expect(bloc).toContain('messageIds: [messageId]');
    /* ⚠️ ET TOUJOURS AUCUN `fetch` À LUI : la porte d'écriture reste unique. */
    expect(bloc.slice(0, bloc.indexOf('\n}'))).not.toContain('fetch(');
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
    /**
     * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — LA FENÊTRE DE LECTURE S'EST ÉLARGIE ══════════════════
     *
     * 1 600 caractères ne suffisaient plus : la fonction porte désormais le calcul « ce message est-il le dernier
     * de son fil hors corbeille ? », et son encadré. Le VERDICT ne change pas d'un iota — le delta de compteurs
     * part toujours, et `rechargerTout` reste interdit ici parce qu'il fermerait l'échange et emporterait le
     * bandeau « Annuler ». C'est la fenêtre qui était trop courte, pas la règle.
     */
    const i = CONV.indexOf('async function corbeilleDuMessage');
    const bloc = CONV.slice(i, CONV.indexOf('\n  }', i));
    /**
     * ⚠️ LE DELTA PORTE MAINTENANT `avantEcriture` (lot INSTANTANE-ETOILE-CORBEILLE, point 2) : il part AVANT
     * l'écriture, pour que le compteur bouge dans la même image que la ligne. La confirmation suit, sans delta,
     * une fois l'écriture revenue — d'où les DEUX appels. Le verdict est inchangé : le geste n'emporte pas son
     * bandeau, et `rechargerTout` reste interdit ici parce qu'il fermerait l'échange.
     */
    expect(bloc).toContain("onGeste('', { compteurs: DELTA_FIL_CORBEILLE, avantEcriture: true });");
    expect(bloc).toContain("onGeste('');");
    expect(bloc).not.toContain('rechargerTout: true');
  });

  /**
   * 🔴 « ANNULER » EST UN VRAI RETOUR : la même route dans l'autre sens, pas un simple masquage.
   *
   * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — UN TROISIÈME ARGUMENT, ET IL COMPTE ═══════════════════════
   *
   * L'appel était `gesteCorbeilleMessage(messageId, false)` ; il est maintenant
   * `gesteCorbeilleMessage(messageId, false, filId)`. Le fil est RÉCLAMÉ SANS CONDITION dans ce sens-ci, et c'est
   * la règle d'Arno lue à l'envers : un échange qui n'avait plus rien hors de la corbeille en a de nouveau un dès
   * qu'un message y rentre, donc sa LIGNE doit revenir dans sa boîte — dans la même image, comme elle en était
   * partie. Le conditionner (comme on le fait à l'aller) aurait laissé la ligne absente de sa boîte jusqu'à une
   * relecture, c'est-à-dire le défaut d'origine dans l'autre sens.
   *
   * ⚠️ `false` RESTE LE SENS DU GESTE : rien de ce que cette épreuve garantissait n'a été relâché.
   */
  it('🔴🔴 « Annuler » rappelle la corbeille en sens inverse', () => {
    const i = CONV.indexOf('async function annulerCorbeilleDuMessage');
    const bloc = CONV.slice(i, i + 900);
    expect(bloc).toContain('gesteCorbeilleMessage(messageId, false, filId)');
    /* ⚠️ MÊME DISCIPLINE AU RETOUR : le delta anticipe, la confirmation suit. */
    expect(bloc).toContain("onGeste('Message rétabli.', { compteurs: DELTA_FIL_RESTAURE, avantEcriture: true });");
  });

  /**
   * 🔴 LE MESSAGE DISPARAÎT DE LA CONVERSATION — et c'est l'ÉCRAN qui le retire. La lecture du fil rend tous les
   * messages de l'échange, et c'est ce qu'il faut : ouverte depuis la Corbeille, la conversation doit justement
   * montrer ce qui y est. On ne cache que ce que CE geste vient de jeter.
   */
  it('🔴🔴 le message jeté quitte l’affichage, sans toucher à la lecture du fil', () => {
    expect(CONV).toContain('const [jetes, setJetes] = useState<ReadonlySet<number>>(new Set());');
    expect(CONV).toContain('ordonnerMessages(messages.filter((m) => !jetes.has(m.messageId)), ordre)');
    /**
     * ⚠️ UN ENSEMBLE, PAS UN SEUL : on peut en jeter trois avant que le premier bandeau s'efface.
     *
     * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — QUI POSE `jetes` A CHANGÉ, PAS CE QU'IL CONTIENT ══════
     *
     * CETTE ÉPREUVE EXIGEAIT `setJetes((s) => new Set(s).add(m.messageId))` DANS `corbeilleDuMessage` — c'est-à-dire
     * un masquage posé à la main, APRÈS la réponse du serveur. C'était exactement le défaut qu'Arno signale : les
     * listes apprenaient le départ par le signal (avant l'écriture), la conversation par ce `setJetes` (après),
     * donc un mail encore lisible dans sa conversation alors que sa ligne avait déjà quitté la boîte.
     *
     * 🔴 `jetes` EST DÉSORMAIS PILOTÉ PAR L'ÉCOUTE DU SIGNAL, et par elle seule — une source, un moment, pour la
     * conversation comme pour les listes. L'ensemble reste un ENSEMBLE, et c'est ce que cette épreuve protégeait :
     * on peut en jeter trois d'affilée, et l'annulation n'en retire qu'un.
     */
    expect(CONV).toContain('useEffect(() => ecouterCorbeille((s) => {');
    expect(CONV).toContain('for (const id of s.messageIds) { if (revient) n.delete(id); else n.add(id); }');
    /* 🔴 ET PLUS AUCUN AUTRE POSEUR : un second ferait revivre les deux moments. */
    expect([...CONV.matchAll(/setJetes\(/g)]).toHaveLength(1);
  });
});
