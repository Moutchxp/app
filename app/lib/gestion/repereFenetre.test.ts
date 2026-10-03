import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AUCUN_BIEN, AUCUNE_PERSONNE, CHOIX_CONVERSATION, CHOIX_SUITE,
  comparatifRepere, coteDuRepere, etatDuClassement, motChoixFenetre, phraseRepere,
} from './repereFenetre';
import { reperesDuFil, type Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE, POINT 2 — LE REPÈRE « À PARTIR D'ICI » ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), fil 3490 : « le repère “À partir d'ici : aucun bien · jeudi 1 octobre 2026 à 20:12
 * · a.jorel@…” n'est pas placé au bon endroit. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ EN BASE PUIS À L'ÉCRAN ═══════════════════════════════════════════════════════════
 *
 * ① EN BASE. Six mails — 5495 (23/09 15:25), 5499 (23/09 15:55), 57122 (28/09), 57368 (01/10 12:46), 57472
 *    (03/10 14:31), 57473 (03/10 15:00) — et deux fenêtres vivantes : la 23836 depuis le mail 5495 (lot 484), la
 *    23812 depuis le mail 57368 (« aucun bien », 01/10 20:12, a.jorel@). La première ne produit AUCUN repère —
 *    elle commence au premier mail. La seconde est celle qu'Arno voit, et elle commence bien au mail **57368**.
 *
 * ② À L'ÉCRAN, liste en « Plus récent d'abord » :
 *      03/10 15:00 · 03/10 14:31 · **[REPÈRE]** · 01/10 12:46 · 28/09 · 23/09 15:55 · 23/09 15:25
 *    Le repère était rendu JUSTE AU-DESSUS de son mail — exact dans l'ordre ancien → récent, FAUX dans celui-ci :
 *    au-dessus veut dire « plus tard », et la ligne paraissait appartenir au mail du 03/10 14:31.
 *
 * 🔴 LA CAUSE TIENT EN UNE LIGNE : le repère était rendu AVANT son mail dans le DOM, quel que soit le tri. Le mail
 * visé, lui, a toujours été le bon — ni la date du geste ni le calcul n'étaient en cause.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les six mails du fil 3490, dans l'ordre chronologique. */
const MAILS = [5495, 5499, 57122, 57368, 57472, 57473];

const PERIODE = (id: number, depuis: number, c: Periode['classement'], o: Partial<Periode> = {}): Periode =>
  ({ id, depuisMessageId: depuis, classement: c, ...o });

/** Les deux fenêtres vivantes du fil 3490, telles qu'elles sont en base. */
const PERIODES: Periode[] = [
  PERIODE(23836, 5495, { sorte: 'biens', biens: [{ cle: '484', libelle: '2 Square Henri Régnault, Courbevoie — lot 484' }] }),
  PERIODE(23812, 57368, { sorte: 'biens', biens: [] },
    { parLibelle: 'a.jorel@sansvisavis.com', le: '2026-10-01T20:12:36+02:00' }),
];

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LE CÔTÉ — C'EST TOUT LE CORRECTIF
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① le repère se pose du côté qui précède CHRONOLOGIQUEMENT', () => {
  it('🔴🔴 au-dessus en ordre ancien → récent, en dessous en ordre récent → ancien', () => {
    expect(coteDuRepere('ancien')).toBe('dessus');
    expect(coteDuRepere('recent')).toBe('dessous');
  });

  /**
   * 🔴 LE MAIL VISÉ N'A JAMAIS CHANGÉ, et ce test le fige : c'est bien le 57368, dans les deux tris. Le défaut
   * n'était pas dans le choix du mail — seulement dans le côté où la ligne était rendue.
   */
  it('🔴 le repère du fil 3490 vise le mail 57368, et lui seul', () => {
    const r = reperesDuFil(MAILS, PERIODES);
    expect(r).toHaveLength(1);
    expect(r[0].avantMessageId).toBe(57368);
    expect(r[0].id).toBe(23812);
  });

  /** ⚠️ ET LA FENÊTRE DU PREMIER MAIL NE PRODUIT TOUJOURS RIEN : « À partir d'ici » en tête ne sépare rien. */
  it('⚠️ la fenêtre qui commence au premier mail ne pose aucun repère', () => {
    expect(reperesDuFil(MAILS, PERIODES).some((r) => r.id === 23836)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 CE QUE LA PASTILLE EXPLIQUE : L'AVANT / APRÈS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② le comparatif avant / après', () => {
  it('🔴🔴 le cas d’Arno, à la virgule près', () => {
    const c = comparatifRepere({ mails: MAILS, periodes: PERIODES, periodeId: 23812 });
    expect(c).not.toBeNull();
    expect(c?.avant).toEqual({
      statut: 'Classé',
      biens: '2 Square Henri Régnault, Courbevoie — lot 484',
      personnes: AUCUNE_PERSONNE,
    });
    expect(c?.apres).toEqual({ statut: 'Classé', biens: AUCUN_BIEN, personnes: AUCUNE_PERSONNE });
    expect(c?.choix).toBe(CHOIX_SUITE);
    expect(c?.qui).toBe('a.jorel@sansvisavis.com');
    expect(c?.quand).toBe('2026-10-01T20:12:36+02:00');
  });

  /**
   * 🔴 L'« AVANT » EST LA FENÊTRE QUI COUVRAIT LE MAIL PRÉCÉDENT, et non la dernière créée dans le temps : la
   * question posée est « qu'est-ce qui change À CET ENDROIT du fil ? ».
   */
  it('🔴 l’avant est la fenêtre qui couvrait le mail d’avant, pas la plus récente', () => {
    const periodes = [
      ...PERIODES,
      /* Posée APRÈS dans le temps, mais plus LOIN dans le fil : elle ne précède pas le mail 57368. */
      PERIODE(99999, 57472, { sorte: 'interne', biens: [] }),
    ];
    const c = comparatifRepere({ mails: MAILS, periodes, periodeId: 23812 });
    expect(c?.avant?.biens).toBe('2 Square Henri Régnault, Courbevoie — lot 484');
  });

  it('⚠️ rien avant : la première fenêtre du fil le dit', () => {
    const c = comparatifRepere({ mails: MAILS, periodes: PERIODES, periodeId: 23836 });
    expect(c?.avant).toBeNull();
    expect(c?.choix).toBe(CHOIX_CONVERSATION);
  });

  it('⚠️ une fenêtre inconnue ne rend rien, sans lever', () => {
    expect(comparatifRepere({ mails: MAILS, periodes: PERIODES, periodeId: 123 })).toBeNull();
  });

  it('🔴 les trois statuts s’écrivent en toutes lettres', () => {
    expect(etatDuClassement({ sorte: 'interne', biens: [] }).statut).toBe('Interne');
    expect(etatDuClassement({ sorte: 'hors_gestion', biens: [] }).statut).toBe('Hors gestion');
    expect(etatDuClassement({ sorte: 'biens', biens: [] }).statut).toBe('Classé');
  });

  it('🔴 les personnes du classement sont nommées quand il y en a', () => {
    const e = etatDuClassement({
      sorte: 'biens', biens: [{ cle: '1', libelle: 'A' }],
      personnes: [{ sorte: 'proprietaire', cle: 'p1', libelle: 'FORERO Marie-Yvonne' }],
    });
    expect(e.personnes).toBe('FORERO Marie-Yvonne');
  });

  it('🔴 le type de choix se déduit du rang du mail', () => {
    expect(motChoixFenetre(0)).toBe(CHOIX_CONVERSATION);
    expect(motChoixFenetre(3)).toBe(CHOIX_SUITE);
  });

  /** ⚠️ LA PHRASE EST CELLE D'AVANT CE LOT, mot pour mot : seul son DESSIN change. */
  it('⚠️ la phrase du repère est inchangée', () => {
    expect(phraseRepere({ sorte: 'biens', biens: [] })).toBe('À partir d’ici : aucun bien');
    expect(phraseRepere({ sorte: 'interne', biens: [] })).toBe('À partir d’ici : Interne');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE DESSIN, ET CE QU'IL NE TOUCHE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ ce que l’écran dessine', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

  /** 🔴🔴 LES DEUX CÔTÉS SONT RENDUS, chacun du bon côté du message. C'est le correctif, dans le JSX. */
  it('🔴🔴 le repère est rendu avant OU après le message, selon le tri', () => {
    expect(src).toContain("coteDuRepere(ordre) === 'dessus' && reperes");
    expect(src).toContain("coteDuRepere(ordre) === 'dessous' && reperes");
  });

  /** 🔴 LA PHRASE EST ROUGE ET CENTRÉE, et les traits partent de ses deux côtés (demande d'Arno). */
  it('🔴 phrase rouge, centrée, encadrée de deux liserés', () => {
    expect(src).toContain('justify-content:center');
    expect(src).toContain('.cnv-repere-mot{font-size:.76rem;font-weight:700;letter-spacing:.01em;color:var(--color-svv-red)');
    expect(src).toContain('.cnv-repere::before,.cnv-repere::after{content:"";flex:1 1 auto;height:1px;background:var(--color-svv-red)}');
  });

  /** 🔴 LES MONTANTS LONGENT LE MAIL SUR LA MOITIÉ DE SA HAUTEUR, mesurée — jamais une valeur figée. */
  it('🔴🔴 les montants font la moitié de la hauteur MESURÉE du mail', () => {
    expect(src).toContain('height:calc(var(--cnv-repere-h) / 2)');
    expect(src).toContain('new ResizeObserver(mesurer)');
    expect(src).toContain(".cnv-repere--dessus > .cnv-repere-montant{top:100%}");
    expect(src).toContain(".cnv-repere--dessous > .cnv-repere-montant{bottom:100%}");
  });

  /** 🔴 LA PASTILLE EST CELLE DES BIENS, pas un jumeau : c'est `InfoBien`, avec un contenu fourni. */
  it('🔴🔴 la pastille est le composant des biens', () => {
    expect(src).toContain('<InfoBien cle=""');
    expect(src).toContain('lignes={lignesBulle}');
    expect(src).toContain('AIDE_PASTILLE_REPERE');
  });

  /**
   * 🔴🔴 AUCUNE RÈGLE DE FENÊTRE N'EST TOUCHÉE — « affichage seulement » (Arno). Le module du repère ne sait ni
   * créer, ni fermer, ni déplacer une période : il décide d'un côté et compose des mots.
   */
  it('🔴🔴 le module du repère n’écrit rien et n’appelle rien', () => {
    const pur = readFileSync('app/lib/gestion/repereFenetre.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    for (const mot of ['fetch(', 'query(', 'INSERT', 'UPDATE', 'DELETE', 'projeter', 'periodeRepo']) {
      expect(pur, mot).not.toContain(mot);
    }
  });

  /** ⚠️ UN REPÈRE PAR FENÊTRE, JAMAIS EMPILÉ : la clé reste celle de la PÉRIODE, pas celle du mail. */
  it('⚠️ la clé du repère reste celle de la période', () => {
    expect((src.match(/key=\{`rep-\$\{r\.id\}`\}/g) ?? [])).toHaveLength(2);
  });
});
