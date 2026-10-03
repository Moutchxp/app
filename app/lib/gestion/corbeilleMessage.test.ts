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
   * 🔴🔴 « À DROITE, TOUTE LA HAUTEUR DU BLOC », ET « NE DÉPLACE PAS LES AUTRES ÉLÉMENTS » (Arno). La rangée est
   * nouvelle, le `<dl>` garde exactement sa grammaire et sa mise en colonnes : c'est `align-items: stretch` qui
   * donne la hauteur, et `flex: 1` sur le `<dl>` qui lui laisse la largeur qui restait.
   */
  it('🔴🔴 toute la hauteur, à droite, sans rien déplacer', () => {
    expect(CONV).toContain('.cnv-entete-rangee{display:flex;align-items:stretch;gap:8px;min-width:0}');
    expect(CONV).toContain('.cnv-entete-rangee>.cnv-entete{flex:1 1 auto;min-width:0}');
    expect(CONV).toContain('<div className="cnv-entete-rangee">');
  });

  /** ⚠️ ABSENTE LÀ OÙ LES GESTES NE SONT PAS PERMIS : comme l'étoile et « Répondre » juste au-dessus. */
  it('⚠️ pas d’icône là où l’on ne peut pas agir', () => {
    expect(CONV).toContain('onCorbeilleMessage?: () => void;');
    expect(CONV).toContain('{onCorbeilleMessage !== undefined && (');
    expect(CONV).toContain('onCorbeilleMessage={barreActions ? () => void corbeilleDuMessage(m) : undefined}');
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
