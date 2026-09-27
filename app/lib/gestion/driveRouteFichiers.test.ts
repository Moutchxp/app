import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT REDACTION-GMAIL — LA ROUTE QUI LIT DES FICHIERS DU DRIVE, ÉPROUVÉE SUR SON SOURCE.
 *
 * POURQUOI SUR LE SOURCE, et pas en l'exécutant. Ce qu'on veut garantir est une NON-ACTION : « cette route n'écrit
 * jamais dans le Drive », « elle ne lit jamais le contenu d'un fichier sous “Documents clients scannés” ». Constater
 * une non-action en l'exécutant demanderait un vrai Drive et une attente infinie — on ne prouve pas une absence par
 * un essai. On la lit donc dans le code, comme le dépôt le fait déjà pour « ce dépôt ne fait QUE lire »
 * (`boiteRepo.test.ts`) et pour la commande de vidage.
 *
 * ⚠️ SUR LES LIGNES DE CODE SEULEMENT : les encadrés CITENT `files.create` et « Documents clients scannés » pour dire
 * qu'on ne s'en sert pas. Une assertion sur la prose rougirait pour une bonne explication.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CHEMIN = 'app/(admin)/api/admin/gestion/drive/fichiers/route.ts';

/** Le code SEUL, commentaires retirés. */
function code(chemin = CHEMIN): string {
  return readFileSync(chemin, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim()))
    .join('\n');
}

describe('🔴🔴 la route des fichiers Drive n’écrit JAMAIS dans le Drive', () => {
  it('aucune création, modification, suppression ni partage', () => {
    const c = code();
    expect(/files\.create|files\.update|files\.delete|permissions\.create|deposerFichier|API_TELEVERSEMENT/.test(c))
      .toBe(false);
  });

  it('aucune méthode HTTP d’écriture n’est posée', () => {
    expect(/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(code())).toBe(false);
  });

  /** Elle n'expose QU'UN verbe : `GET`. Un `POST` exporté ici serait une porte ouverte sans raison. */
  it('elle n’expose que GET', () => {
    const c = code();
    expect(c).toContain('export async function GET');
    expect(/export async function (POST|PUT|PATCH|DELETE)/.test(c)).toBe(false);
  });
});

describe('🔴🔴 le garde-fou est posé AVANT toute lecture de contenu', () => {
  /**
   * 🔴 L'ORDRE EST LA GARANTIE. Télécharger d'abord et vérifier ensuite reviendrait à lire un fichier qu'on n'avait
   * pas le droit de lire — le mal serait fait, même si l'on jetait ensuite les octets.
   */
  it('🔴 le verdict est demandé AVANT `lireContenuFichier`', () => {
    const c = code();
    expect(c.indexOf('verdict(')).toBeLessThan(c.indexOf('lireContenuFichier('));
    expect(c).toContain('peutJoindre');
  });

  it('le refus est explicite, et rendu en 403', () => {
    const c = code();
    expect(c).toMatch(/etat:\s*'refus'/);
    expect(c).toContain('403');
  });

  /** ⚠️ Le verdict vient d'un module PUR, sans réseau : c'est ce qui permet de l'éprouver exhaustivement. */
  it('la règle vient du module PUR, elle n’est pas réécrite ici', () => {
    const src = readFileSync(CHEMIN, 'utf8');
    expect(src).toContain("from '../../../../../../lib/gestion/driveLectureFichier'");
    // Le nom du dossier interdit n'est PAS recopié dans la route : une seconde copie finirait par diverger.
    expect(code()).not.toContain('Documents clients scannés');
  });

  it('la chaîne des parents est réellement remontée — on ne juge pas sur le dossier immédiat', () => {
    expect(code()).toContain('chaineParents');
  });
});

describe('les autres garanties de la route', () => {
  it('le droit `gestion` est relu à chaque appel', () => {
    expect(code()).toContain("exigerCompteActif(request, 'gestion')");
  });

  /** 🔒 Le jeton est obtenu par DÉLÉGATION pour la personne connectée : Google applique SES droits. */
  it('le jeton vient de la délégation, et ne sort pas de la route', () => {
    const c = code();
    expect(c).toContain('jetonPourRequete');
    /**
     * ⚠️ ON CHERCHE LA VALEUR DU JETON (`jeton.jeton`), PAS LE MOT « jeton ». La route rend légitimement
     * `jeton.motif` — le message qui explique pourquoi le Drive est indisponible. Une assertion sur le simple mot
     * rougissait pour cette bonne raison ; c'est la VALEUR qui ne doit jamais sortir.
     */
    for (const ligne of c.split('\n')) {
      if (/\bjson\(|Response\.json\(/.test(ligne)) expect(ligne, ligne.trim()).not.toContain('jeton.jeton');
    }
    // Et le jeton ne part que dans un en-tête d'autorisation, jamais dans un corps de réponse.
    expect(c).not.toMatch(/corps[^\n]*jeton\.jeton/);
  });

  it('les réponses ne se mettent en cache nulle part', () => {
    expect(code()).toContain("'private, no-store'");
  });

  /** Un document Google natif n'a pas d'octets : on le DIT plutôt que de joindre un fichier vide. */
  it('un document Google natif est refusé avec une explication', () => {
    expect(code()).toContain('application/vnd.google-apps');
  });
});

/**
 * 🔴 LE SÉLECTEUR À L'ÉCRAN N'EST PAS LA BARRIÈRE — mais il doit tout de même EXPLIQUER, et ne pas offrir un bouton
 * que la route refusera. Un bouton qui échoue au clic apprend à ignorer les refus.
 */
describe('🔴 l’écran n’offre pas « Joindre » là où la route refusera', () => {
  const ECRAN = 'app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx';

  it('« Joindre » est conditionné au verdict rendu par le serveur', () => {
    expect(code(ECRAN)).toContain('joindreAutorise &&');
  });

  it('…et le motif du refus est AFFICHÉ, pas seulement subi', () => {
    expect(code(ECRAN)).toContain('motifRefus');
  });

  /** « Insérer un lien » reste proposé PARTOUT : il ne lit rien, c'est toute la raison de son existence. */
  it('« Insérer un lien » n’est jamais conditionné', () => {
    const c = code(ECRAN);
    const i = c.indexOf('Insérer un lien');
    expect(i).toBeGreaterThan(0);
    // La ligne qui le rend ne dépend d'aucun verdict : on lit les 200 caractères qui la précèdent.
    expect(c.slice(Math.max(0, i - 200), i)).not.toContain('joindreAutorise');
  });
});
