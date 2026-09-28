import { describe, expect, it } from 'vitest';
import {
  APERCU_TAILLE_MAX, PREFIXE_GOOGLE, messageSansApercu, motifTropGros, passeParExport, sorteApercu, typeNu, typeServi,
} from './apercuDrive';

/**
 * LOT DRIVE-VISUALISER-ET-DOSSIERS — CE DONT ON PEUT MONTRER UN APERÇU, ET SURTOUT CE DONT ON NE PEUT PAS.
 *
 * 🔴🔴 CES TESTS PORTENT UNE RÈGLE DE SÉCURITÉ, PAS UN CONFORT. L'aperçu sert le fichier depuis NOTRE origine, dans
 * un cadre de NOTRE page : un type mal choisi s'exécuterait avec nos cookies de session. La liste blanche est donc la
 * barrière, et ces tests sont ce qui l'empêche de s'élargir « pour dépanner ».
 */

describe('🔴🔴 la liste blanche — on énumère ce qu’on accepte, jamais ce qu’on refuse', () => {
  it('accepte le PDF, les images matricielles et le texte brut', () => {
    expect(sorteApercu('application/pdf')).toBe('pdf');
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic']) {
      expect(sorteApercu(t)).toBe('image');
    }
    expect(sorteApercu('text/plain')).toBe('texte');
    expect(sorteApercu('text/csv')).toBe('texte');
  });

  /**
   * 🔴 LE SVG EST DEHORS, ET CE N'EST PAS UN OUBLI. C'est une image pour l'œil et un document à scripts pour le
   * navigateur : un `<script>` y est parfaitement légal. C'est le seul format de la famille « image » capable
   * d'exécuter du code, donc le seul à exclure — et le message le DIT, pour qu'on ne le rajoute pas un jour par
   * réflexe de complétude.
   */
  it('REFUSE le SVG, et explique pourquoi', () => {
    expect(sorteApercu('image/svg+xml')).toBe('aucun');
    expect(typeServi('image/svg+xml')).toBeNull();
    expect(messageSansApercu('image/svg+xml')).toContain('code');
  });

  it('REFUSE tout ce qui s’interprète, et les formats dont le navigateur ne fait rien', () => {
    for (const t of [
      'text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/xml', 'text/xml',
      'application/zip', 'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]) {
      expect(sorteApercu(t), t).toBe('aucun');
      expect(typeServi(t), t).toBeNull();
    }
  });

  /**
   * 🔴 LA LIGNE QUI PORTE LA SÉCURITÉ : le type SERVI est celui de la liste, jamais celui que le fichier prétend
   * avoir. Un fichier déclaré `text/html` dans le Drive ne peut donc pas sortir en `text/html`.
   */
  it('le type servi vient de la LISTE, pas du fichier', () => {
    expect(typeServi('application/pdf')).toBe('application/pdf');
    expect(typeServi('text/csv')).toBe('text/plain; charset=utf-8');
    expect(typeServi('text/html')).toBeNull();
    // `image/jpg` n'est pas un type réel : on sert le vrai.
    expect(typeServi('image/jpg')).toBe('image/jpeg');
  });

  it('un paramètre de type (charset) ne trompe pas le tri', () => {
    expect(typeNu('TEXT/Plain; charset=ISO-8859-1')).toBe('text/plain');
    expect(sorteApercu('text/plain; charset=ISO-8859-1')).toBe('texte');
    // Et un `text/html` déguisé par un paramètre reste refusé.
    expect(sorteApercu('text/html; charset=utf-8')).toBe('aucun');
  });
});

describe('les documents Google — pas d’octets, donc un export en PDF', () => {
  it('Docs, Sheets, Slides et Drawings passent par l’export', () => {
    for (const t of ['document', 'spreadsheet', 'presentation', 'drawing']) {
      expect(sorteApercu(`${PREFIXE_GOOGLE}.${t}`), t).toBe('export_pdf');
      expect(passeParExport(`${PREFIXE_GOOGLE}.${t}`), t).toBe(true);
      expect(typeServi(`${PREFIXE_GOOGLE}.${t}`), t).toBe('application/pdf');
    }
  });

  /** Un dossier, un raccourci, un formulaire : Google refuse de les exporter. On ne demande pas ce qu'on sait refusé. */
  it('un dossier, un raccourci ou un formulaire ne s’exportent pas — et le message le dit', () => {
    for (const t of ['folder', 'shortcut', 'form', 'site']) {
      expect(sorteApercu(`${PREFIXE_GOOGLE}.${t}`), t).toBe('aucun');
      expect(passeParExport(`${PREFIXE_GOOGLE}.${t}`), t).toBe(false);
    }
    expect(messageSansApercu(`${PREFIXE_GOOGLE}.form`)).toContain('document Google');
  });

  it('un fichier ordinaire ne passe jamais par l’export', () => {
    expect(passeParExport('application/pdf')).toBe(false);
    expect(passeParExport('image/png')).toBe(false);
  });
});

describe('les messages — « aperçu indisponible » est une RÉPONSE, pas une panne', () => {
  /** La phrase exacte demandée par Arno, et la SORTIE juste derrière : un constat sans issue laisse en cul-de-sac. */
  it('emploie la formule demandée et propose toujours une suite', () => {
    const m = messageSansApercu('application/zip');
    expect(m).toContain('Aperçu indisponible pour ce type de fichier');
    expect(m).toMatch(/joindre/i);
  });

  it('le refus pour cause de taille donne le chiffre, en français', () => {
    const m = motifTropGros(18.4 * 1024 * 1024);
    expect(m).toContain('18,4 Mo');
    expect(m).toContain(String(APERCU_TAILLE_MAX / (1024 * 1024)));
  });

  /**
   * ⚠️ PLUS BAS QUE LA LIMITE DE PIÈCE JOINTE, exprès : un aperçu se regarde, il ne se garde pas. Tirer 20 Mo pour
   * jeter un œil ferait attendre l'écran sans rien apporter.
   */
  it('le plafond de l’aperçu est inférieur à celui d’une pièce jointe', () => {
    expect(APERCU_TAILLE_MAX).toBeLessThan(20 * 1024 * 1024);
  });
});
