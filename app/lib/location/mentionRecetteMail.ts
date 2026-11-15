import { hostname } from 'node:os';
import { filtrerPourTest, perimetreCourant, type PerimetreTest } from './perimetreTest';
import { envoiReelPermis, etatEnvoiReel, politiqueCourante, type EtatEnvoiReel } from '../recette/garde';
import type { FamilleMail } from './famillesMails';

/**
 * ══ 🔴 Arno (15/11/2026) — CE QUI PART VRAIMENT, DIT SUR LA CARTE DU RÉCAPITULATIF ══════════════════════════════════════════════════════
 * En recette, ou pour un préavis de TEST, les destinataires affichés ne sont pas ceux qui recevront le mail : le verrou du préavis de test ne
 * laisse partir que l'adresse du créateur du test, et la recette intercepte tout mail qui n'est pas adressé à la seule adresse permise
 * (`RECETTE_ENVOI_REEL_VERS`). La carte le dit, pour éviter la confusion (« adresse remplacée en recette : envoyé à … au lieu de l'adresse du
 * locataire »). Mêmes règles que celles du transport et de la garde (`filtrerPourTest`, `envoiReelPermis`) : jamais une seconde vérité.
 * En production, sans préavis de test : rien à dire (null).
 */
export function mentionRecette(m: { a: readonly string[]; cc: readonly string[] }, famille: FamilleMail,
  o: { perimetre: PerimetreTest | null; recette: boolean; envoiReel: EtatEnvoiReel }): string | null {
  let vers = [...m.a, ...m.cc];
  let retires = 0;
  if (o.perimetre !== null) {
    const f = filtrerPourTest({ a: m.a, cc: m.cc, cci: [], objet: '' }, o.perimetre);
    if (!f.ok) return 'Préavis de test : ce mail ne part pas — seule l’adresse du créateur du test peut le recevoir.';
    vers = [...f.message.a];
    retires = f.retires;
  }
  if (o.recette && !envoiReelPermis(vers, o.envoiReel)) {
    return `En recette : intercepté (boîte de test) — il n’atteint pas ${famille === 'locataire' ? 'l’adresse du locataire' : 'ses destinataires'}.`;
  }
  if (o.perimetre === null) return null;
  const ou = o.recette ? 'en recette' : 'préavis de test';
  if (famille === 'locataire') return `Adresse remplacée ${o.recette ? 'en recette' : '(préavis de test)'} : envoyé à ${vers.join(', ')} au lieu de l’adresse du locataire.`;
  return retires > 0 ? `${ou.charAt(0).toUpperCase()}${ou.slice(1)} : seul ${vers.join(', ')} le reçoit (les autres destinataires sont retirés).` : null;
}

/** La mention pour la requête en cours (périmètre du préavis de test, politique et exception d'envoi réel de ce serveur). */
export function mentionRecetteCourante(m: { a: readonly string[]; cc: readonly string[] }, famille: FamilleMail): string | null {
  return mentionRecette(m, famille, { perimetre: perimetreCourant(), recette: politiqueCourante() === 'recette', envoiReel: etatEnvoiReel(process.env, hostname()) });
}
