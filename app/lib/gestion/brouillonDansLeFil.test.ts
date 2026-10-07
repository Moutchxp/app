import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ecrireEtatUrl, lireEtatUrl, memeEtat, ETAT_DEFAUT } from './ecranUrl';

/**
 * LOT BROUILLONS-GMAIL — UN BROUILLON DE RÉPONSE S'OUVRE DANS SA CONVERSATION.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT, DIT PAR ARNO : un clic sur « Re: État des lieux de sortie - Bastien Jonqueur » ouvrait la
 * conversation, mais SANS l'éditeur — « le brouillon est introuvable ».
 *
 * Il partait en réalité dans une fenêtre flottante, détachée du fil auquel il répond : on ne voyait plus à quoi on
 * répondait, et la fenêtre se confondait avec un message neuf.
 *
 * CE QUI EST VOULU, et ce que ce fichier garde : la conversation s'ouvre, défile jusqu'au message auquel on
 * répondait, et l'éditeur est posé JUSTE EN DESSOUS de ce message, pré-rempli de tout ce qui a été enregistré.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴 le brouillon voyage dans l’adresse, avec son échange', () => {
  it('il s’écrit et se relit', () => {
    const etat = { ...ETAT_DEFAUT, filOuvert: 36224, messageOuvert: 56802, brouillonOuvert: 14 };
    const texte = ecrireEtatUrl(etat);
    expect(texte).toContain('brouillon=14');
    expect(lireEtatUrl(texte).brouillonOuvert).toBe(14);
  });

  /** ⚠️ IL NE VAUT RIEN SANS SON ÉCHANGE : un `?brouillon=` orphelin ne désigne aucune conversation. */
  it('⚠️ sans échange ouvert, il n’est ni écrit ni lu', () => {
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, filOuvert: null, brouillonOuvert: 14 })).not.toContain('brouillon=');
    expect(lireEtatUrl('?brouillon=14').brouillonOuvert).toBeNull();
  });

  /**
   * ⚠️ DEUX BROUILLONS DIFFÉRENTS DU MÊME ÉCHANGE SONT DEUX ENDROITS DIFFÉRENTS. Sans cela, passer de l'un à
   * l'autre écraserait l'entrée d'historique, et « Précédent » ne ramènerait pas d'où l'on vient.
   */
  it('⚠️ il entre dans la comparaison des états', () => {
    const a = { ...ETAT_DEFAUT, filOuvert: 10, brouillonOuvert: 1 };
    const b = { ...ETAT_DEFAUT, filOuvert: 10, brouillonOuvert: 2 };
    expect(memeEtat(a, b)).toBe(false);
    expect(memeEtat(a, { ...a })).toBe(true);
  });

  it('une valeur illisible retombe sur « aucun », jamais sur un écran blanc', () => {
    expect(lireEtatUrl('?fil=10&brouillon=abc').brouillonOuvert).toBeNull();
    expect(lireEtatUrl('?fil=10&brouillon=-3').brouillonOuvert).toBeNull();
  });
});

describe('🔴🔴 le câblage : de la liste jusque sous le bon message', () => {
  const sansCommentaires = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
  const ecran = sansCommentaires(readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8'));
  const conv = sansCommentaires(readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8'));
  const liste = sansCommentaires(readFileSync('app/(admin)/admin/(protected)/gestion/Brouillons.tsx', 'utf8'));

  /**
   * 🔴 DEUX CHEMINS, ET C'EST VOULU : un brouillon RATTACHÉ À UN ÉCHANGE va dans sa conversation ; un message NEUF
   * garde sa fenêtre flottante, qui est sa place naturelle — il n'y a pas de conversation où le poser.
   */
  it('🔴 un brouillon de réponse part vers sa conversation, un message neuf vers sa fenêtre', () => {
    expect(ecran).toContain('if (b.filId !== null) { onOuvrir(b.filId, b.repondAMessageId, b.id); return; }');
    expect(ecran).toContain('ouvrirRedaction(cleFenetreBrouillon(b.id), reprendreBrouillon(b))');
  });

  it('🔴 « Voir la conversation » emmène AUSSI le brouillon', () => {
    expect(ecran).toContain("onOuvrir={(f, b) => onOuvrir(f, b?.repondAMessageId ?? null, b?.id ?? null)}");
    expect(liste).toContain('onOuvrir(b.filId as number, b)');
  });

  it('🔴 la conversation reçoit le brouillon et le relit par son identifiant', () => {
    expect(ecran).toContain('brouillonRepris={brouillonOuvert}');
    expect(conv).toContain('/api/admin/gestion/brouillons?id=${brouillonRepris}');
  });

  /** 🔴 SOUS LE MESSAGE AUQUEL IL RÉPOND — c'est toute la demande d'Arno. */
  it('🔴🔴 l’éditeur se pose sous le message auquel le brouillon répond', () => {
    expect(conv).toContain('setBrouillonSous(d.brouillon.repondAMessageId)');
    expect(conv).toContain('setBrouillon(reprendreBrouillon(d.brouillon))');
  });

  /**
   * 🔴 UN SEUL ÉDITEUR PAR BROUILLON. Sans ce garde, chaque rendu rouvrirait l'éditeur et écraserait ce qu'on est
   * en train d'y écrire ; et recliquer le même brouillon en poserait un second.
   */
  it('🔴 un seul éditeur par brouillon : la reprise ne se rejoue pas', () => {
    expect(conv).toContain('if (repriseFaite.current === brouillonRepris) return;');
  });

  /**
   * 🔴 LA MENTION ROUGE « Brouillon », comme dans Gmail, et elle vient de la BASE — pas de l'état d'écran. C'est
   * ce qui la fait apparaître même quand on arrive par la Réception, sans être passé par la liste des brouillons.
   */
  it('🔴🔴 le message porte la mention « Brouillon », lue en base', () => {
    expect(conv).toContain('/api/admin/gestion/brouillons?fil=${filId}');
    expect(conv).toContain('brouillonsDuFil.some((x) => x.repondAMessageId === m.messageId)');
    /**
     * 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — LE MOT S'ACCOMPAGNE DÉSORMAIS D'UN PICTO. Arno le demande sur les
     * trois écrans, avec son `aria-label` et sa bulle. Le MOT reste : un crayon seul ne se lit ni en niveaux de
     * gris ni au lecteur d'écran — c'est la règle de ce fichier depuis le début, et elle n'a pas changé.
     */
    /* ⚠️ REQUALIFIÉ LE 07/10/2026 — LOT BROUILLON-ACCES-SUPPRESSION : la mention est devenue cliquable (elle
       ouvre le brouillon), donc sa bulle dit l'action. Le MOT et le PICTO, eux, sont exactement les mêmes — et
       c'est ce que ce fichier garde. */
    expect(conv).toContain('<span className="cnv-brouillon"');
    expect(conv).toContain('aria-label={AIDE_BROUILLON_EN_ATTENTE}>{PICTO_BROUILLON}');
    expect(conv).toContain('Brouillon');
    // ⚠️ Un MOT, pas seulement une couleur : il se lit en niveaux de gris et au lecteur d'écran.
    expect(conv).toContain('.cnv-brouillon{');
    expect(conv).toContain('color:var(--color-svv-red)}');
  });

  /** ⚠️ Elle s'efface quand l'éditeur est ouvert sur ce message : le brouillon est alors sous les yeux. */
  it('⚠️ la mention s’efface là où l’éditeur est ouvert', () => {
    expect(conv).toContain('avecBrouillon={brouillonSous !== m.messageId');
  });
});

describe('🔴 la route sait rendre un brouillon précis, et ceux d’un échange', () => {
  const route = readFileSync('app/(admin)/api/admin/gestion/brouillons/route.ts', 'utf8');
  const repo = readFileSync('app/lib/gestion/redactionRepo.ts', 'utf8').replace(/\s+/g, ' ');

  it('`?id=` rend UN brouillon', () => {
    expect(route).toContain("const idBrut = parametres.get('id')");
    expect(route).toContain('await lireBrouillon(id)');
  });

  it('`?fil=` rend AUSSI la liste des brouillons vivants de l’échange', () => {
    expect(route).toContain('listerBrouillonsDuFil(filId)');
  });

  /** ⚠️ ON NE ROUVRE JAMAIS un brouillon abandonné ou déjà envoyé : une adresse d'hier ne ressuscite rien. */
  it('⚠️ ni les abandonnés, ni les envoyés', () => {
    expect(repo).toContain('WHERE id = $1 AND abandonne_le IS NULL AND envoye_le IS NULL');
    expect(repo).toContain('WHERE fil_id = $1 AND abandonne_le IS NULL AND envoye_le IS NULL');
  });
});
