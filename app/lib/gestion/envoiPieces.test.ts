import { describe, it, expect } from 'vitest';
import { simpleParser } from 'mailparser';
import { construireRfc822, frontiere, parametreNomFichier, type PieceAEnvoyer } from './envoiGmail';
import {
  EXTENSIONS_REFUSEES, TAILLE_MAX_TOTALE, extensionDe, taillePourHumain, totalJoint, verifierPiece,
} from './piecesEnvoi';
import { nomEml, piecesDeLEnvoi, type DepsPiecesEnvoi } from './piecesEnvoiReel';
import type { DemandeEnvoi } from './envoi';

/**
 * LOT 5-PJ-ENVOI — LES PIÈCES JOINTES D'UN ENVOI.
 *
 * 🔴 LE MIME EST PARSÉ PAR UNE BIBLIOTHÈQUE (`mailparser`), JAMAIS PAR UNE EXPRESSION RÉGULIÈRE. Un message qui
 * « ressemble » à du multipart n'est pas du multipart : une frontière mal fermée, un `Content-Transfer-Encoding`
 * oublié, et le correspondant reçoit une bouillie que nos propres regex trouveraient pourtant parfaite. Ici, c'est
 * un vrai analyseur de courrier qui relit ce que nous fabriquons — celui-là même que nous employons à la capture.
 *
 * 🔒 AUCUN APPEL RÉSEAU : Gmail est injecté, le stockage aussi. Rien ne sort de ces épreuves.
 */

const base = {
  de: 'gestion@criterimmo.fr', deNom: 'Gestion CRITERIMMO',
  a: ['locataire@exemple.fr'], cc: [], cci: [],
  objet: 'Votre quittance', corps: 'Bonjour,\nVoici le document.\n',
  messageId: '<20260925.abc@criterimmo.fr>',
};

const piece = (nom: string, contenu: string, typeMime: string | null = 'application/pdf'): PieceAEnvoyer =>
  ({ nom, typeMime, octets: Buffer.from(contenu, 'utf8') });

describe('🔴 le message SANS pièce ne change pas', () => {
  it('reste un text/plain simple — envelopper tous les envois pour quelques-uns serait payer pour rien', async () => {
    const brut = construireRfc822(base);
    expect(brut).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(brut).not.toContain('multipart');
    const lu = await simpleParser(brut);
    expect(lu.text?.trim()).toBe('Bonjour,\nVoici le document.');
    expect(lu.attachments).toHaveLength(0);
  });
});

describe('🔴 le message AVEC pièces, relu par un vrai analyseur', () => {
  it('le texte ET la pièce arrivent, chacun à sa place', async () => {
    const brut = construireRfc822({ ...base, pieces: [piece('quittance.pdf', '%PDF-1.4 essai')] }, 'alea1');
    const lu = await simpleParser(brut);
    expect(lu.subject).toBe('Votre quittance');
    expect(lu.text?.trim()).toBe('Bonjour,\nVoici le document.');
    expect(lu.attachments).toHaveLength(1);
    expect(lu.attachments[0].filename).toBe('quittance.pdf');
    expect(lu.attachments[0].contentType).toBe('application/pdf');
    expect(lu.attachments[0].content.toString('utf8')).toBe('%PDF-1.4 essai');
  });

  it('plusieurs pièces, dans l’ordre, sans se mélanger', async () => {
    const brut = construireRfc822({
      ...base,
      pieces: [piece('un.pdf', 'AAA'), piece('deux.txt', 'BBB', 'text/plain'), piece('trois.bin', 'CCC', null)],
    }, 'alea2');
    const lu = await simpleParser(brut);
    expect(lu.attachments.map((a) => a.filename)).toEqual(['un.pdf', 'deux.txt', 'trois.bin']);
    expect(lu.attachments.map((a) => a.content.toString('utf8'))).toEqual(['AAA', 'BBB', 'CCC']);
    // Sans type annoncé, on ne devine pas : au destinataire de décider quoi en faire.
    expect(lu.attachments[2].contentType).toBe('application/octet-stream');
  });

  /** 🔴 LE CAS QUI CASSE LES IMPLÉMENTATIONS NAÏVES : un nom accentué, que la RFC 2047 n'a PAS le droit d'encoder. */
  it('un nom ACCENTUÉ arrive intact — RFC 2231, jamais « Re?u de loyer.pdf »', async () => {
    const brut = construireRfc822({ ...base, pieces: [piece('Reçu de loyer — août.pdf', 'X')] }, 'alea3');
    expect(brut).toContain("filename*=UTF-8''");
    const lu = await simpleParser(brut);
    expect(lu.attachments[0].filename).toBe('Reçu de loyer — août.pdf');
  });

  it('un nom purement ASCII n’est PAS encodé : un en-tête lisible se diagnostique à l’œil', () => {
    expect(parametreNomFichier('bail.pdf')).toBe('filename="bail.pdf"');
    expect(parametreNomFichier('Reçu.pdf')).toContain('filename*=UTF-8');
    // …avec un repli translittéré pour les clients qui ignorent la RFC 2231.
    expect(parametreNomFichier('Reçu.pdf')).toContain('filename="Recu.pdf"');
  });

  it('un nom vide ou piégé ne casse pas l’en-tête (ni guillemet, ni retour à la ligne)', () => {
    expect(parametreNomFichier('')).toBe('filename="piece-jointe"');
    expect(parametreNomFichier('a"b\r\nSubject: faux.pdf')).not.toContain('\r');
    expect(parametreNomFichier('a"b.pdf')).toBe('filename="ab.pdf"');
  });

  it('un contenu BINAIRE traverse intact — c’est tout l’intérêt du base64', async () => {
    const octets = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x0a, 0x0d, 0x1b]);
    const brut = construireRfc822({ ...base, pieces: [{ nom: 'b.bin', typeMime: null, octets }] }, 'alea4');
    const lu = await simpleParser(brut);
    expect(Buffer.compare(lu.attachments[0].content, octets)).toBe(0);
  });

  it('les en-têtes de fil (In-Reply-To, References) survivent au passage en multipart', async () => {
    const brut = construireRfc822({
      ...base, inReplyTo: '<origine@x>', references: '<racine@x> <origine@x>', pieces: [piece('a.pdf', 'A')],
    }, 'alea5');
    const lu = await simpleParser(brut);
    expect(lu.inReplyTo).toBe('<origine@x>');
    expect(brut).toContain('References: <racine@x> <origine@x>');
  });

  it('la frontière est fermée, et ne peut pas apparaître par hasard dans un contenu', () => {
    const f = frontiere('abc-123');
    expect(f).toBe('----svav-abc123');
    const brut = construireRfc822({ ...base, pieces: [piece('a.pdf', 'A')] }, 'abc-123');
    expect(brut).toContain(`--${f}--`);
  });
});

describe('🔴 le .eml de la 5ᵉ voie', () => {
  const original = Buffer.from('From: client@exemple.fr\r\nSubject: Fuite\r\n\r\nBonjour', 'utf8');

  function deps(o: Partial<DepsPiecesEnvoi> = {}): DepsPiecesEnvoi {
    return {
      jeton: async () => 'JETON',
      duBrouillon: async () => [],
      octets: async () => Buffer.from('X'),
      ancre: async () => '<origine@x>',
      original: async () => original,
      objet: async () => 'Fuite salle de bain',
      ...o,
    };
  }
  const demande = (o: Partial<DemandeEnvoi> = {}): DemandeEnvoi => ({
    cleIdempotence: 'k', brouillonId: null, filId: null, repondAMessageId: 7,
    a: [], cc: [], cci: [], objet: '', corps: '', voie: 'transferer_piece', ...o,
  });

  it('l’original est joint EN ENTIER, en message/rfc822, et le message reste lisible', async () => {
    const pieces = await piecesDeLEnvoi(demande(), deps());
    expect(pieces).toHaveLength(1);
    expect(pieces[0].typeMime).toBe('message/rfc822');
    const lu = await simpleParser(construireRfc822({ ...base, pieces }, 'alea6'));
    expect(lu.attachments[0].contentType).toBe('message/rfc822');
    expect(Buffer.compare(lu.attachments[0].content, original)).toBe(0);
  });

  it('le .eml porte l’objet du message d’origine : on le reconnaît dans la liste des pièces', async () => {
    expect((await piecesDeLEnvoi(demande(), deps()))[0].nom).toBe('Fuite salle de bain.eml');
    expect(nomEml(null)).toBe('message.eml');
    expect(nomEml('a/b:c*d')).toBe('a b c d.eml');
  });

  /** Un transfert dont la pièce manque, parti quand même, ne se découvre que chez le correspondant. */
  it('🔴 si l’original est introuvable, ON LÈVE — jamais un message amputé', async () => {
    await expect(piecesDeLEnvoi(demande(), deps({ original: async () => null })))
      .rejects.toThrow(/retrouvé dans Gmail/);
    await expect(piecesDeLEnvoi(demande(), deps({ jeton: async () => null })))
      .rejects.toThrow(/connexion Google/);
    await expect(piecesDeLEnvoi(demande(), deps({ ancre: async () => null })))
      .rejects.toThrow(/Message-ID/);
  });

  it('les AUTRES voies ne joignent aucun original — et n’appellent même pas Gmail', async () => {
    let appels = 0;
    const d = deps({ original: async () => { appels += 1; return original; } });
    for (const voie of ['repondre', 'repondre_tous', 'transferer', 'nouveau'] as const) {
      expect(await piecesDeLEnvoi(demande({ voie }), d)).toEqual([]);
    }
    expect(appels).toBe(0);
  });
});

describe('les pièces du brouillon', () => {
  it('les fichiers ajoutés ET les pièces reprises sont lus depuis NOS octets', async () => {
    const lues: string[] = [];
    const pieces = await piecesDeLEnvoi(
      { cleIdempotence: 'k', brouillonId: 5, filId: null, repondAMessageId: null, a: [], cc: [], cci: [], objet: '', corps: '' },
      {
        jeton: async () => 'J',
        duBrouillon: async () => [
          { nom: 'ajoute.pdf', typeMime: 'application/pdf', cleStockage: 'cle/ajout', cleStockagePiece: null },
          { nom: 'repris.pdf', typeMime: 'application/pdf', cleStockage: null, cleStockagePiece: 'cle/piece' },
          { nom: 'sans-octets.pdf', typeMime: null, cleStockage: null, cleStockagePiece: null },
        ],
        octets: async (cle) => { lues.push(cle); return Buffer.from(cle); },
        ancre: async () => null, original: async () => null, objet: async () => null,
      },
    );
    expect(pieces.map((p) => p.nom)).toEqual(['ajoute.pdf', 'repris.pdf']);
    expect(lues).toEqual(['cle/ajout', 'cle/piece']);
  });
});

describe('ce qu’on refuse de joindre, et pourquoi', () => {
  it('la limite est celle de Gmail, et elle porte sur le TOTAL', () => {
    expect(TAILLE_MAX_TOTALE).toBe(25 * 1024 * 1024);
    // Quatre fois 6 Mo passent ; le cinquième dépasse — c'est exactement le cas qu'une vérification fichier par
    //   fichier laisserait filer jusqu'au refus de Gmail, quand le message est déjà écrit.
    const six = 6 * 1024 * 1024;
    expect(verifierPiece({ nom: 'a.pdf', taille: six, dejaJoint: 3 * six }).ok).toBe(true);
    const refus = verifierPiece({ nom: 'e.pdf', taille: six, dejaJoint: 4 * six });
    expect(refus.ok).toBe(false);
    if (!refus.ok) {
      expect(refus.motif).toContain('e.pdf');
      expect(refus.motif).toContain('25,0 Mo');   // la limite, dite en clair
      expect(refus.motif).toContain('30,0 Mo');   // et ce que ça ferait
    }
  });

  it('les exécutables sont refusés AVEC leur extension nommée, et une sortie proposée', () => {
    const r = verifierPiece({ nom: 'facture.exe', taille: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motif).toContain('facture.exe');
      expect(r.motif).toContain('.exe');
      expect(r.motif).toContain('Drive');
    }
    for (const ext of ['bat', 'js', 'vbs', 'msi', 'jar']) {
      expect(verifierPiece({ nom: `x.${ext}`, taille: 10 }).ok).toBe(false);
    }
    expect(EXTENSIONS_REFUSEES).toContain('exe');
  });

  it('les fichiers ordinaires passent — y compris ceux que la boîte n’accepterait pas EN RÉCEPTION', () => {
    for (const nom of ['bail.pdf', 'tableau.xlsx', 'note.docx', 'photo.jpg', 'archive.zip']) {
      expect(verifierPiece({ nom, taille: 1024 }).ok).toBe(true);
    }
  });

  it('un fichier vide ou sans nom est refusé, et le DIT', () => {
    expect(verifierPiece({ nom: 'vide.pdf', taille: 0 }).ok).toBe(false);
    expect(verifierPiece({ nom: '  ', taille: 10 }).ok).toBe(false);
  });

  it('les tailles se lisent comme on les dit', () => {
    expect(taillePourHumain(512)).toBe('512 o');
    expect(taillePourHumain(2048)).toBe('2 Ko');
    expect(taillePourHumain(3 * 1024 * 1024)).toBe('3,0 Mo');
  });

  it('l’extension est lue en minuscules, sans le point', () => {
    expect(extensionDe('Facture.PDF')).toBe('pdf');
    expect(extensionDe('sans-extension')).toBe('');
    expect(totalJoint([{ taille: 10 }, { taille: 5 }])).toBe(15);
  });
});
