import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  adresseValide, citerMessage, decouperAdresses, encoreAnnulable, extraireAdresse, nettoyerDestinataires,
  prefixerObjet, preparerBrouillon, pretAEnvoyer, secondesRestantes,
  type ContexteRedaction, type MessageOrigine,
} from './redaction';

/**
 * LOT 5e — QUI REÇOIT QUOI. Module PUR, donc éprouvé ENTIÈREMENT — et c'est exactement ce qu'on veut pour le geste le
 * plus dangereux d'une messagerie.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 TROIS FAÇONS DE SE TROMPER, ET CE QUE CHACUNE COÛTE :
 *   ① `gestion@` reste dans les destinataires → chaque réponse à tous se renvoie une copie, la relève la recapture,
 *      et le fil se dédouble jusqu'à devenir illisible ;
 *   ② un doublon, ou une adresse à la fois en À et en Cc → le correspondant reçoit deux fois le même mail et se
 *      demande lequel est le bon ;
 *   ③ les destinataires d'origine sont INCONNUS et l'on invente une liste → un locataire lit ce qu'on écrivait à
 *      l'artisan. C'est irréversible, et ça ne se voit pas de notre côté.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const NOUS = 'gestion@criterimmo.fr';
const ctx: ContexteRedaction = { adresseGestion: NOUS, signature: 'Service Gestion\nCRITERIMMO' };

const origine = (o: Partial<MessageOrigine> = {}): MessageOrigine => ({
  messageId: 900, de: 'martin@orange.fr', deNom: 'Mme Martin', objet: 'Fuite salle de bain',
  recuLe: '2026-09-20T12:00:00Z', corps: 'Bonjour,\nLe robinet fuit toujours.\n\nCordialement',
  destA: [{ adresse: NOUS, nom: 'Gestion' }], destCc: [], destReplyTo: null, destinatairesFondus: NOUS, ...o,
});

describe('🔴 ① NOTRE PROPRE ADRESSE NE SE RÉPOND JAMAIS À ELLE-MÊME', () => {
  it('répondre à tous : gestion@ est retirée de À comme de Cc', () => {
    const b = preparerBrouillon('repondre_tous', origine({
      destA: [{ adresse: NOUS }, { adresse: 'syndic@immo.fr' }],
      destCc: [{ adresse: NOUS }, { adresse: 'plombier@artisan.fr' }],
    }), ctx);
    expect(b.a).toEqual(['martin@orange.fr']);
    expect(b.cc).toEqual(['syndic@immo.fr', 'plombier@artisan.fr']);
    expect([...b.a, ...b.cc, ...b.cci]).not.toContain(NOUS);
  });

  it('…quelle que soit la casse ou la présentation « Nom <adresse> »', () => {
    const b = preparerBrouillon('repondre_tous', origine({
      destA: [{ adresse: 'Gestion@CRITERIMMO.fr' }, { adresse: 'a@b.fr' }],
      destCc: [{ adresse: 'Service <gestion@criterimmo.fr>' }],
    }), ctx);
    expect(b.cc).toEqual(['a@b.fr']);
  });

  it('🔴 répondre à NOTRE PROPRE envoi ne laisse pas la liste vide : on reprend les destinataires', () => {
    const b = preparerBrouillon('repondre', origine({
      de: NOUS, deNom: 'Gestion', destA: [{ adresse: 'martin@orange.fr' }],
    }), ctx);
    expect(b.a).toEqual(['martin@orange.fr']);
  });
});

describe('🔴 ② AUCUN DOUBLON, et jamais la même adresse en À et en Cc', () => {
  it('une adresse présente deux fois n’apparaît qu’une', () => {
    expect(nettoyerDestinataires(['a@b.fr', 'A@B.FR', ' a@b.fr '])).toEqual(['a@b.fr']);
  });

  it('l’ordre de saisie est CONSERVÉ : c’est celui qu’on relit', () => {
    expect(nettoyerDestinataires(['z@b.fr', 'a@b.fr', 'm@b.fr'])).toEqual(['z@b.fr', 'a@b.fr', 'm@b.fr']);
  });

  it('l’expéditeur ne se retrouve pas AUSSI en copie', () => {
    const b = preparerBrouillon('repondre_tous', origine({
      destA: [{ adresse: 'martin@orange.fr' }, { adresse: 'syndic@immo.fr' }], destCc: [{ adresse: 'martin@orange.fr' }],
    }), ctx);
    expect(b.a).toEqual(['martin@orange.fr']);
    expect(b.cc).toEqual(['syndic@immo.fr']);
  });

  it('le Reply-To PRIME sur l’expéditeur : c’est là qu’il a DEMANDÉ qu’on réponde', () => {
    const b = preparerBrouillon('repondre', origine({ destReplyTo: [{ adresse: 'contact@agence.fr' }] }), ctx);
    expect(b.a).toEqual(['contact@agence.fr']);
  });

  it('…et l’expéditeur passe alors en copie s’il était aussi destinataire, jamais en double', () => {
    const b = preparerBrouillon('repondre_tous', origine({
      destReplyTo: [{ adresse: 'contact@agence.fr' }],
      destA: [{ adresse: 'martin@orange.fr' }, { adresse: 'contact@agence.fr' }],
    }), ctx);
    expect(b.a).toEqual(['contact@agence.fr']);
    expect(b.cc).toEqual(['martin@orange.fr']);
  });
});

describe('🔴 ③ DESTINATAIRES NON DÉTAILLÉS : on le DIT, on n’invente pas', () => {
  it('colonnes NULL → on pré-remplit avec la liste fondue ET on lève le drapeau', () => {
    const b = preparerBrouillon('repondre_tous', origine({
      destA: null, destCc: null, destinatairesFondus: `${NOUS}, syndic@immo.fr, plombier@artisan.fr`,
    }), ctx);
    expect(b.destinatairesApproximatifs).toBe(true);
    expect(b.cc).toEqual(['syndic@immo.fr', 'plombier@artisan.fr']); // gestion@ retirée même là
  });

  it('🔴 une liste VIDE analysée n’est PAS une liste inconnue — c’est toute la migration 235', () => {
    const b = preparerBrouillon('repondre_tous', origine({ destA: [], destCc: [] }), ctx);
    expect(b.destinatairesApproximatifs).toBe(false);
    expect(b.cc).toEqual([]);
  });

  it('la phrase d’avertissement existe, et elle dit quoi faire', async () => {
    const { MENTION_DESTINATAIRES_APPROXIMATIFS } = await import('./redaction');
    expect(MENTION_DESTINATAIRES_APPROXIMATIFS).toContain('vérifie la liste avant d’envoyer');
  });
});

describe('LES QUATRE VOIES', () => {
  it('répondre : l’expéditeur SEUL, aucune copie', () => {
    const b = preparerBrouillon('repondre', origine({ destCc: [{ adresse: 'syndic@immo.fr' }] }), ctx);
    expect(b.a).toEqual(['martin@orange.fr']);
    expect(b.cc).toEqual([]);
  });

  it('🔴 transférer : AUCUN destinataire — personne ne peut deviner à qui l’on transfère', () => {
    const b = preparerBrouillon('transferer', origine(), ctx);
    expect(b.a).toEqual([]);
    expect(b.cc).toEqual([]);
    expect(b.objet).toBe('Tr: Fuite salle de bain');
    expect(b.citation).toContain('Le robinet fuit toujours');
  });

  it('nouveau : tout est vide, sauf la signature', () => {
    const b = preparerBrouillon('nouveau', null, ctx);
    expect(b).toMatchObject({ voie: 'nouveau', a: [], cc: [], cci: [], objet: '', citation: null });
    expect(b.corps).toContain('Service Gestion');
  });

  it('l’objet est préfixé UNE SEULE FOIS — « Re: Re: Re: » est le bruit qui rend un objet illisible', () => {
    expect(prefixerObjet('Fuite', 'repondre')).toBe('Re: Fuite');
    expect(prefixerObjet('Re: Fuite', 'repondre')).toBe('Re: Fuite');
    expect(prefixerObjet('RE: Fuite', 'repondre')).toBe('RE: Fuite');
    expect(prefixerObjet('Fwd: Fuite', 'transferer')).toBe('Fwd: Fuite');
    expect(prefixerObjet('Tr: Fuite', 'transferer')).toBe('Tr: Fuite');
    // …mais transférer une RÉPONSE se préfixe bien : ce ne sont pas les mêmes préfixes.
    expect(prefixerObjet('Re: Fuite', 'transferer')).toBe('Tr: Re: Fuite');
  });

  it('la citation porte qui a écrit, quand, et le texte préfixé de « > »', () => {
    const c = citerMessage(origine(), 'samedi 20 septembre 2026 à 14:00') ?? '';
    expect(c).toContain('Le samedi 20 septembre 2026 à 14:00, Mme Martin <martin@orange.fr> a écrit :');
    expect(c).toContain('> Le robinet fuit toujours.');
    expect(c).toContain('>\n'); // une ligne vide reste une ligne citée, pas un trou
  });
});

describe('LA SIGNATURE', () => {
  it('présente → elle est dans le corps, et le curseur reste AU-DESSUS (deux retours à la ligne devant)', () => {
    const b = preparerBrouillon('repondre', origine(), ctx);
    expect(b.corps).toBe('\n\nService Gestion\nCRITERIMMO');
  });

  it('absente → le corps est vide, et rien n’est inventé', () => {
    const b = preparerBrouillon('repondre', origine(), { adresseGestion: NOUS });
    expect(b.corps).toBe('');
  });
});

describe('LES ADRESSES : saisie libre, collage, validation', () => {
  it('découpe virgules, points-virgules, retours à la ligne — le collage d’une liste entière', () => {
    expect(decouperAdresses('a@b.fr, c@d.fr; e@f.fr\ng@h.fr')).toEqual(['a@b.fr', 'c@d.fr', 'e@f.fr', 'g@h.fr']);
  });

  it('accepte la forme « Nom <adresse> », et n’en garde que l’adresse', () => {
    expect(extraireAdresse('Mme Martin <Martin@Orange.FR>')).toBe('martin@orange.fr');
  });

  it('refuse ce qui n’est pas une adresse — une faute de frappe est mille fois plus probable qu’une adresse exotique', () => {
    for (const mauvaise of ['martin', 'martin@', '@orange.fr', 'martin@orange', 'a b@c.fr', '']) {
      expect(adresseValide(mauvaise), mauvaise).toBe(false);
    }
    for (const bonne of ['a@b.fr', 'prenom.nom+etiquette@sous.domaine.co.uk']) {
      expect(adresseValide(bonne), bonne).toBe(true);
    }
  });
});

describe('CE QU’ON REFUSE D’ENVOYER', () => {
  const base = { a: ['a@b.fr'], cc: [], cci: [], objet: 'Objet', corps: 'Bonjour' };

  it('un brouillon complet passe', () => {
    expect(pretAEnvoyer(base)).toEqual({ pret: true });
  });

  it('sans destinataire, sans objet, sans texte : chacun a son motif, en clair', () => {
    expect(pretAEnvoyer({ ...base, a: [] })).toMatchObject({ pret: false, motif: expect.stringContaining('destinataire') });
    expect(pretAEnvoyer({ ...base, objet: '  ' })).toMatchObject({ pret: false, motif: expect.stringContaining('objet') });
    expect(pretAEnvoyer({ ...base, corps: '\n' })).toMatchObject({ pret: false, motif: expect.stringContaining('vide') });
  });

  it('🔴 une adresse fautive bloque l’envoi, et le motif la NOMME', () => {
    const r = pretAEnvoyer({ ...base, cc: ['pasuneadresse'] });
    expect(r.pret).toBe(false);
    if (!r.pret) expect(r.motif).toContain('pasuneadresse');
  });

  it('une copie cachée SEULE suffit : c’est un destinataire comme un autre', () => {
    expect(pretAEnvoyer({ ...base, a: [], cci: ['a@b.fr'] })).toEqual({ pret: true });
  });
});

describe('LA FENÊTRE D’ANNULATION', () => {
  const clic = new Date('2026-09-24T12:00:00Z');
  const plus = (s: number) => new Date(clic.getTime() + s * 1000);

  it('annulable tant que le délai n’est pas écoulé, plus après', () => {
    expect(encoreAnnulable(clic, plus(0), 10)).toBe(true);
    expect(encoreAnnulable(clic, plus(9.9), 10)).toBe(true);
    expect(encoreAnnulable(clic, plus(10), 10)).toBe(false);
  });

  it('le compte à rebours s’arrondit AU-DESSUS : on n’affiche jamais « 0 » alors qu’il reste du temps', () => {
    expect(secondesRestantes(clic, plus(0), 10)).toBe(10);
    expect(secondesRestantes(clic, plus(0.1), 10)).toBe(10);
    expect(secondesRestantes(clic, plus(9.1), 10)).toBe(1);
    expect(secondesRestantes(clic, plus(10), 10)).toBe(0);
  });

  it('un délai de 0 part immédiatement — et c’est une valeur VALIDE', () => {
    expect(encoreAnnulable(clic, clic, 0)).toBe(false);
    expect(secondesRestantes(clic, clic, 0)).toBe(0);
  });
});

describe('garanties STATIQUES', () => {
  it('🔴 module PUR : aucun import, donc rien qui puisse tirer `pg` jusque dans le navigateur', () => {
    const src = readFileSync('app/lib/gestion/redaction.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });

  it('il ne sait ni envoyer, ni lire une base, ni parler à Google', () => {
    // Sur les lignes de CODE seulement : l'en-tête CITE Gmail et le Drive pour expliquer ce que ce lot ne fait PAS.
    const code = readFileSync('app/lib/gestion/redaction.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/fetch\(|query\(|googleapis|gmail/i.test(code)).toBe(false);
  });
});
