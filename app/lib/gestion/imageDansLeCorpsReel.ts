import { createHash } from 'node:crypto';
import { chargesImagesDuCorps } from './imageDansLeCorps';

/**
 * ══ 🔴 LOT ETOILE-SIGNATURES-PIECES — LE HACHAGE, À PART DU MODULE PUR ══════════════════════════════════════════
 *
 * ⚠️ `node:crypto` VIT ICI ET NULLE PART AILLEURS. `imageDansLeCorps.ts` est importé depuis la frontière client
 * (`lisibilite` le sera un jour) ; y faire entrer `crypto` ferait tomber le bundler sur un composant `'use client'`,
 * exactement comme `pg` l'a déjà fait le 24/09/2026. Le garde de graphe le vérifie.
 *
 * 🔒 AUCUN RÉSEAU, AUCUNE BASE : on hache ce qu'on nous donne.
 */

/** Les empreintes sha256 des images POSÉES DANS LE CORPS, en minuscules. */
export function empreintesDesImagesDuCorps(html: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const charge of chargesImagesDuCorps(html)) {
    /* ⚠️ UNE CHARGE ILLISIBLE NE FAIT PAS ÉCHOUER LA PASSE : `Buffer.from` rend simplement moins d'octets. Une
       empreinte fausse ne correspondra à aucune pièce, et la pièce restera comptée — l'erreur est du bon côté. */
    const octets = Buffer.from(charge, 'base64');
    if (octets.length > 0) out.add(createHash('sha256').update(octets).digest('hex').toLowerCase());
  }
  return out;
}
