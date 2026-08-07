import { describe, it, expect } from 'vitest';
import { analyserRapportRejet, normaliserMessageId } from './rapportRejet';

/**
 * R3d — analyse PURE d'un accusé de rejet (DSN). Deux voies : parties MIME structurées (message/rfc822 → Message-ID
 * d'origine) et repli sur le texte brut (mailparser replie souvent la partie delivery-status dans le corps).
 */
const DS_CORPS = [
  'Your message could not be delivered.',
  'Final-Recipient: rfc822; urba@mairie-aubervilliers.fr',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550 5.1.1 No such user',
].join('\n');

describe('R3d — analyserRapportRejet', () => {
  it('DSN avec partie message/rfc822 → Message-ID d’origine (normalisé) + Final-Recipient/Status/Diagnostic', () => {
    const r = analyserRapportRejet({
      corpsTexte: DS_CORPS,
      parties: [{ typeMime: 'message/rfc822', contenu: 'From: a@b\r\nMessage-ID: <ABC-154@Sansvisavis.COM>\r\n' }],
    });
    expect(r.messageIdOrigine).toBe('ABC-154@sansvisavis.com'); // chevrons retirés, domaine minuscule, local conservé
    expect(r.destinataireEchec).toBe('urba@mairie-aubervilliers.fr');
    expect(r.statut).toBe('5.1.1');
    expect(r.diagnostic).toBe('smtp; 550 5.1.1 No such user');
  });

  it('DSN sans partie rfc822 mais Message-ID dans le corps → extrait par le repli', () => {
    const r = analyserRapportRejet({ corpsTexte: `${DS_CORPS}\nOriginal Message-ID: <xyz-9@sansvisavis.com>` });
    expect(r.messageIdOrigine).toBe('xyz-9@sansvisavis.com');
    expect(r.destinataireEchec).toBe('urba@mairie-aubervilliers.fr');
  });

  it('DSN sans aucun Message-ID mais avec Final-Recipient → destinataireEchec extrait, messageIdOrigine vide', () => {
    const r = analyserRapportRejet({ corpsTexte: DS_CORPS });
    expect(r.messageIdOrigine).toBeUndefined();
    expect(r.destinataireEchec).toBe('urba@mairie-aubervilliers.fr');
    expect(r.statut).toBe('5.1.1');
  });

  it('message normal → tout undefined', () => {
    const r = analyserRapportRejet({ corpsTexte: 'Bonjour, voici les documents demandés.' });
    expect(r.messageIdOrigine).toBeUndefined();
    expect(r.destinataireEchec).toBeUndefined();
    expect(r.statut).toBeUndefined();
    expect(r.diagnostic).toBeUndefined();
  });

  it('normaliserMessageId : chevrons retirés, domaine en minuscules (local conservé)', () => {
    expect(normaliserMessageId('<Abc-1@EXEMPLE.FR>')).toBe('Abc-1@exemple.fr');
    expect(normaliserMessageId('  x@Y.Com ')).toBe('x@y.com');
  });
});
