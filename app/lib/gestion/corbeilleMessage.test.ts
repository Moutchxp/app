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
   * ══ 🔴🔴 RÉÉCRIT PAR LE LOT DRIVE-HABILLAGE, POINT 4 — LA CORBEILLE EST PASSÉE **DANS** LE BLOC ═══════════════
   *
   * CE QUI ÉTAIT EXIGÉ ICI : une RANGÉE (`cnv-entete-rangee`) posant le bloc gris et le bouton EN FRÈRES, avec
   * `align-items: stretch` pour la hauteur et `flex: 1` sur le `<dl>` pour la largeur restante.
   *
   * 🔴 POURQUOI CELA CHANGE. Arno, le 03/10/2026 : « le bloc gris De / À / Date reprend toute la largeur comme
   * avant. La corbeille est intégrée DANS ce bloc, à l'extrême DROITE, dans une case blanche (fond de carte du
   * thème) à coins arrondis, bien intégrée à la trame grise. » La rangée faisait perdre au bloc 52 px de largeur
   * sur toute sa hauteur, et laissait l'icône flotter à sa droite sur le fond de la page — deux surfaces là où il
   * n'en faut qu'une.
   *
   * 🔒 LA PROPRIÉTÉ GARDÉE PAR CETTE ÉPREUVE N'A PAS BOUGÉ, et c'est celle qui compte : « ne déplace pas les
   * autres éléments du bloc ». La case est POSITIONNÉE (absolue dans le bloc devenu `relative`), donc aucune
   * ligne du `<dl>` ne se décale — une ligne de plus dans le flux aurait poussé « De », « À » et « Date » vers le
   * bas. Et la place est RÉSERVÉE par un padding, sinon une adresse longue passerait sous la case.
   */
  it('🔴🔴 dans le bloc, à droite, sans rien déplacer', () => {
    // 🔴 LE BLOC PORTE LA CASE : il est `relative`, et il n'y a plus de rangée qui lui prenne de la largeur.
    expect(CONV).toContain('.cnv-entete{position:relative;');
    /* ⚠️ EN NÉGATIF SUR LA RÈGLE ET SUR LE BALISAGE, pas sur le MOT : les deux encadrés qui racontent ce retrait
       le nomment, et c'est leur raison d'être — on ne garde pas un historique en effaçant le nom de ce qu'on a
       retiré. Ce qui doit avoir disparu, c'est la rangée elle-même. */
    expect(CONV).not.toContain('.cnv-entete-rangee{');
    expect(CONV).not.toContain('className="cnv-entete-rangee"');
    // 🔴 LA CASE EST POSÉE À L'EXTRÊME DROITE, SUR TOUTE LA HAUTEUR UTILE, et hors du flux.
    expect(CONV).toContain('.cnv-entete-corbeille{position:absolute;top:6px;right:6px;bottom:6px;display:flex}');
    // 🔴 FOND DE CARTE (blanc en Clair, carte sombre en Sombre) sur le gris du bloc, et des coins arrondis.
    expect(CONV).toContain('background:var(--color-svv-surface)');
    expect(CONV).toContain('border-radius:.5rem;cursor:pointer}');
    // 🔴 ET LA PLACE EST RÉSERVÉE — mais SEULEMENT là où la corbeille existe.
    expect(CONV).toContain('.cnv-entete--avec-corbeille{padding-right:62px}');
    expect(CONV).toContain("onCorbeilleMessage !== undefined ? ' cnv-entete--avec-corbeille' : ''");
    // ⚠️ UN `<button>` NE PEUT PAS ÊTRE ENFANT DIRECT D'UN `<dl>` : il vit dans un `div`, comme chaque ligne.
    expect(CONV).toContain('<div className="cnv-entete-corbeille">');
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
