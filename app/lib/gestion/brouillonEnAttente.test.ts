import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AIDE_BROUILLON_EN_ATTENTE, MENTION_BROUILLON_VOIR_EN_BAS, PICTO_BROUILLON,
} from './brouillonEnAttente';

/**
 * ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE, POINT 1 — LA ZONE DE RÉPONSE SUIT SON MAIL ═════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « j'ouvre un mail reçu, je clique Répondre : la zone d'écriture s'ouvre sous le
 * mail (OK) ; je ferme le MAIL sans fermer la zone de réponse : la zone reste affichée dans la LISTE, intercalée
 * entre les lignes, sous la ligne du mail. C'est faux. »
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE : `piedMessage` était rendu HORS du bloc `{ouvert && …}` de `MessageConversation`.
 * Replier le mail laissait donc l'éditeur accroché sous une LIGNE repliée, au milieu des autres lignes.
 *
 * ═══ 🔴🔴 CE QUI EST TENU ICI ════════════════════════════════════════════════════════════════════════════════════
 *   ① replier le mail FERME sa zone — et par la MÊME porte que la croix, donc avec la règle d'enregistrement ;
 *   ② rouvrir le mail ROUVRE la zone sur LE MÊME brouillon, jamais un doublon ;
 *   ③ rien de saisi ⇒ rien de gardé : c'est `fermer()` qui le décide, et il n'a pas été réécrit ;
 *   ④ le picto « brouillon en attente » est aux TROIS endroits demandés, avec son nom et sa bulle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CONV = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const REDACTION = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA ZONE NE TRAÎNE JAMAIS DANS UNE LISTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① replier le mail ferme sa zone de réponse', () => {
  /**
   * 🔴🔴 CACHÉE, PAS DÉMONTÉE — et la nuance est tout. Un démontage sec sauterait `fermer()`, c'est-à-dire la
   * règle qui enregistre ce qui a été saisi et abandonne un brouillon resté vide. C'est exactement ce que fait
   * déjà `reduite` dans `Redaction`, et pour la même raison.
   */
  it('🔴🔴 l’éditeur est caché quand le mail est replié', () => {
    expect(CONV).toContain('<div hidden={!deplies.has(m.messageId)}>');
  });

  /** 🔴 ET SA FERMETURE PASSE PAR LA MÊME PORTE QUE LA CROIX : `fermetureDemandee`, jamais un retrait brutal. */
  it('🔴🔴 replier DEMANDE la fermeture, il ne l’impose pas', () => {
    expect(CONV).toContain('if (ouvert && brouillonSous === m.messageId) setFermetureReponse((n) => n + 1);');
    expect(CONV).toContain('fermetureDemandee={fermetureReponse}');
  });

  /**
   * 🔴🔴 LA RÈGLE « RIEN DE SAISI ⇒ RIEN DE GARDÉ » N'A PAS ÉTÉ RÉÉCRITE : elle vit dans `fermer()`, qui
   * enregistre d'abord puis abandonne le brouillon resté vide. On la vérifie là où elle est.
   */
  it('🔴🔴 fermer enregistre ce qui a été saisi, et abandonne ce qui est resté vide', () => {
    expect(REDACTION).toContain('await enregistrerMaintenant();');
    expect(REDACTION).toContain("if (!touche && brouillon.repris !== true && id !== null)");
    expect(REDACTION).toContain("method: 'DELETE'");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② ROUVRIR LE MAIL ROUVRE LE MÊME BROUILLON
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② rouvrir le mail rouvre la zone, sur le même brouillon', () => {
  /**
   * ══ 🔴 REQUALIFIÉ LE 07/10/2026 — LOT BROUILLON-ACCES-SUPPRESSION ══════════════════════════════════════════════
   *
   * LA RÈGLE N'A PAS BOUGÉ : on REPREND le brouillon vivant du mail, on n'en ouvre pas un neuf. Ce qui a bougé,
   * c'est l'endroit : la reprise vivait À L'INTÉRIEUR du dépliage (`basculer`), et c'était la CAUSE du clic mort
   * de la pastille — un mail déplié d'office n'avait jamais d'éditeur sous lui. Elle est devenue une fonction,
   * `reprendreLeBrouillonDe(messageId, { amener })`, que la pastille et la mention appellent aussi.
   *
   * 🔴 ON MESURE DONC LA MÊME CHOSE SUR LA FONCTION : le brouillon est cherché parmi les VIVANTS de l'échange, et
   * repris avec son identifiant. Le dépliage reste l'un de ses appelants, et il le reste nommément.
   */
  it('🔴🔴 le brouillon vivant de CE mail est repris, pas recréé', () => {
    expect(CONV).toContain('const sien = brouillonsDuFil.find((b) => b.repondAMessageId === messageId);');
    expect(CONV).toContain('setBrouillon(reprendreBrouillon(sien))');
    /* 🔴 ET LE DÉPLIAGE PASSE TOUJOURS PAR LÀ, sans amener la page à l'éditeur (lot VISUALISER-UNIFIE). */
    expect(CONV).toContain('reprendreLeBrouillonDe(m.messageId, { amener: false })');
  });

  /**
   * 🔴 PAS DE DOUBLON : `reprendreBrouillon` emporte l'identifiant, donc l'enregistrement suivant écrit la MÊME
   * ligne. Rouvrir dix fois n'en crée pas dix.
   */
  it('🔴 le brouillon repris garde son identifiant', () => {
    const src = readFileSync('app/lib/gestion/brouillonReprise.ts', 'utf8');
    expect(src).toContain('id:');
    expect(src).toContain('repris: true');
  });

  /** ⚠️ ON NE REMPLACE JAMAIS CE QU'ON EST EN TRAIN D'ÉCRIRE : la reprise n'a lieu qu'éditeur fermé. */
  it('⚠️ aucune reprise si un éditeur est déjà ouvert', () => {
    expect(CONV).toContain('if (!ouvert && brouillon === null && redaction !== null)');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE PICTO, AUX TROIS ENDROITS DEMANDÉS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ le picto « brouillon en attente »', () => {
  it('🔴 un seul vocabulaire pour les trois écrans', () => {
    expect(PICTO_BROUILLON).toBe('✎');
    expect(AIDE_BROUILLON_EN_ATTENTE).toBe('Brouillon de réponse en attente');
    expect(MENTION_BROUILLON_VOIR_EN_BAS).toBe('Brouillon de réponse en attente — voir en bas');
  });

  /** 🔴 ① LA LIGNE DE LISTE, « juste à GAUCHE du bloc trombone / nombre / statut » (Arno). */
  it('🔴🔴 sur la ligne de liste, juste avant le trombone', () => {
    const iPicto = BOITE.indexOf('bte-marque--brouillon');
    const iTrombone = BOITE.indexOf('LE TROMBONE, COLLÉ À LA CAPSULE');
    expect(iPicto).toBeGreaterThan(0);
    expect(iTrombone).toBeGreaterThan(iPicto);
    expect(BOITE).toContain('{l.brouillonEnAttente && (');
    expect(BOITE).toContain('aria-label={AIDE_BROUILLON_EN_ATTENTE}>{PICTO_BROUILLON}');
  });

  /**
   * 🔴 ② LA LIGNE DU MAIL DANS LA CONVERSATION.
   *
   * ⚠️ REQUALIFIÉ LE 07/10/2026 — LOT BROUILLON-ACCES-SUPPRESSION. La mention est devenue CLIQUABLE (elle ouvre le
   * brouillon, demande d'Arno), et sa bulle dit donc l'ACTION quand le geste est branché : « Brouillon de réponse
   * en attente » décrit un état, « Ouvrir le brouillon de réponse » décrit ce que le clic fait. Les deux mots
   * viennent toujours de ce module — c'est cela que ce fichier garde, et non la forme exacte du `title`.
   */
  it('🔴 sur la ligne du mail concerné, dans la conversation', () => {
    expect(CONV).toContain('<span className="cnv-brouillon"');
    expect(CONV).toContain('AIDE_BROUILLON_EN_ATTENTE : AIDE_OUVRIR_BROUILLON');
  });

  /** 🔴 ③ EN HAUT DU MAIL OUVERT, et elle EMMÈNE : « voir en bas » est une promesse que l'écran tient. */
  it('🔴🔴 en haut du mail ouvert, et elle fait défiler jusqu’à la réponse', () => {
    expect(CONV).toContain('{MENTION_BROUILLON_VOIR_EN_BAS}');
    expect(CONV).toContain("pied.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })");
    expect(CONV).toContain('<div ref={pied}>{piedMessage}</div>');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ CE QUE LA BASE RÉPOND — ET QUAND LE PICTO DISPARAÎT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
let avecRedaction = true;
let avecCorbeille = true;
vi.mock('./schema', () => ({
  redactionDisponible: async () => avecRedaction,
  corbeilleBrouillonDisponible: async () => avecCorbeille,
}));

const { filsAvecBrouillonEnAttente } = await import('./brouillonEnAttenteRepo');

describe('🔴🔴 ④ quels échanges portent une réponse commencée', () => {
  beforeEach(() => {
    avecRedaction = true; avecCorbeille = true;
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  /**
   * 🔴🔴 « EN ATTENTE » VEUT DIRE VIVANT, et les trois conditions comptent : ni envoyé, ni abandonné, ni à la
   * corbeille. C'est la règle d'Arno — « il disparaît quand le brouillon est envoyé ou supprimé ».
   */
  it('🔴🔴 ni envoyé, ni abandonné, ni à la corbeille', async () => {
    await filsAvecBrouillonEnAttente([1, 2]);
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('envoye_le IS NULL');
    expect(sql).toContain('abandonne_le IS NULL');
    expect(sql).toContain('corbeille_le IS NULL');
  });

  it('🔴 il rend les échanges, en NOMBRES (piège `bigint` de pg)', async () => {
    queryMock.mockResolvedValue({ rows: [{ fil_id: '3490' }] });
    const r = await filsAvecBrouillonEnAttente([3490, 1]);
    expect(r.has(3490)).toBe(true);
    expect(r.has(1)).toBe(false);
  });

  /** ⚠️ SANS LA MIGRATION 276, `corbeille_le` n'est NOMMÉE NULLE PART : la requête est celle d'avant. */
  it('⚠️ sans la migration 276, la colonne n’est pas nommée', async () => {
    avecCorbeille = false;
    await filsAvecBrouillonEnAttente([1]);
    expect(String(queryMock.mock.calls[0][0])).not.toContain('corbeille_le');
  });

  /** 🔴 SANS LES BROUILLONS, aucune requête : la liste est celle d'avant ce lot. */
  it('🔴 sans la migration des brouillons, aucune requête', async () => {
    avecRedaction = false;
    expect(await filsAvecBrouillonEnAttente([1])).toEqual(new Set());
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('⚠️ aucun échange à regarder ⇒ aucune requête', async () => {
    expect(await filsAvecBrouillonEnAttente([])).toEqual(new Set());
    expect(await filsAvecBrouillonEnAttente([0, -2])).toEqual(new Set());
    expect(queryMock).not.toHaveBeenCalled();
  });
});
