/**
 * G1 — logique PURE des alertes « contenu reçu d'une mairie, pas encore classé dans la GED du permis ». Aucune I/O, aucun
 * réseau (on ne SUIT JAMAIS un lien), aucun import pg/smtp. Décide QUELLES alertes sont dues, avec QUEL objet et QUEL corps.
 *
 * Décisions fondateur (verrouillées) : grain (réponse × permis) ; « classé » = une ligne dossier_document sur CE permis
 * (jamais satisfait_le) ; délai = expiration L1 si captée, sinon 7 j à compter de la réception (défaut, jamais un plafond) ;
 * deux seuils J-3 et 24 h, chacun UNE fois ; envoi à toute heure ; le corps met EN TÊTE ce qui périt (le lien) et dit que
 * les pièces sont déjà sauvegardées ; pièce > 20 Mo → lien signé (pas d'échec SMTP) ; retard rendu VISIBLE.
 */

export type TypeAlerteGed = 'j3' | 'h24';

const MS_JOUR = 86_400_000;
const MS_HEURE = 3_600_000;
/** Délai par DÉFAUT quand aucune expiration n'a été captée par L1 (jamais un plafond imposé à une mairie plus généreuse). */
export const DEFAUT_VALIDITE_JOURS = 7;
/** Seuil au-delà duquel une pièce n'est plus jointe mais liée (marge sous le plafond Gmail de 25 Mo, en-têtes + encodage compris). */
export const SEUIL_PIECE_LOURDE_OCTETS = 20 * 1024 * 1024;
/** Plancher de validité d'un lien signé : 72 h — sinon le lien meurt avant que le mail soit lu (la durée par défaut d'urlSignee est 900 s). */
export const DUREE_LIEN_SIGNE_MIN_S = 72 * 3600;
/** Au-delà de cette marge après le seuil, l'alerte est « en retard » (la passe launchd est à 15 min → 1 h ne flague jamais un envoi normal). */
export const MARGE_RETARD_MS = MS_HEURE;

/** Expiration EFFECTIVE d'une réponse : l'expiration L1 captée si elle existe, sinon réception + 7 j. */
export function expirationEffective(recuLe: Date, expireLeCapte: Date | null): Date {
  return expireLeCapte ?? new Date(recuLe.getTime() + DEFAUT_VALIDITE_JOURS * MS_JOUR);
}

/** Instant où une alerte est DUE : J-3 = expiration − 3 j ; 24 h = expiration − 24 h. */
export function seuilAlerte(expiration: Date, type: TypeAlerteGed): Date {
  return new Date(expiration.getTime() - (type === 'j3' ? 3 * MS_JOUR : MS_JOUR));
}

export interface DecisionAlerte { type: TypeAlerteGed; seuil: Date; enRetard: boolean }

/**
 * Les alertes DUES pour un couple (réponse × permis) : chaque type dont le seuil est passé, DANS la fenêtre [seuil, expiration),
 * NON déjà envoyé, et permis NON classé. `enRetard` si envoyée > 1 h après son seuil (rattrapage d'une passe manquée). Les deux
 * types sont INDÉPENDANTS : chacun part une fois ; si les deux seuils sont passés (longue interruption), les deux partent (chacun
 * marqué en retard). Au-delà de l'expiration → plus rien (fenêtre manquée, cf. `fenetreManquee`), on n'envoie pas une alerte inutile.
 */
export function alertesDues(params: { expiration: Date; classe: boolean; dejaEnvoyes: TypeAlerteGed[]; maintenant: Date }): DecisionAlerte[] {
  if (params.classe) return []; // permis classé en GED (dossier_document) → rebours ÉTEINT
  const out: DecisionAlerte[] = [];
  for (const type of ['j3', 'h24'] as const) {
    if (params.dejaEnvoyes.includes(type)) continue;
    const seuil = seuilAlerte(params.expiration, type);
    if (params.maintenant.getTime() < seuil.getTime()) continue;             // seuil pas encore atteint
    if (params.maintenant.getTime() >= params.expiration.getTime()) continue; // fenêtre passée → manquée
    out.push({ type, seuil, enRetard: params.maintenant.getTime() - seuil.getTime() > MARGE_RETARD_MS });
  }
  return out;
}

/** Fenêtre MANQUÉE (affichage) : le délai est passé et le permis n'est toujours pas classé — le lien est probablement mort. */
export function fenetreManquee(params: { expiration: Date; classe: boolean; maintenant: Date }): boolean {
  return !params.classe && params.maintenant.getTime() >= params.expiration.getTime();
}

/** Une pièce est « lourde » (à lier plutôt qu'à joindre) au-dessus du seuil. `null` (taille inconnue) → jointe (on tente). */
export function pieceEstLourde(tailleOctets: number | null): boolean {
  return tailleOctets !== null && tailleOctets > SEUIL_PIECE_LOURDE_OCTETS;
}

/** Durée d'un lien signé : le temps restant jusqu'à l'expiration, avec un PLANCHER de 72 h (jamais un lien mort à la lecture). */
export function dureeLienSigne(expiration: Date, maintenant: Date): number {
  const restantS = Math.floor((expiration.getTime() - maintenant.getTime()) / 1000);
  return Math.max(restantS, DUREE_LIEN_SIGNE_MIN_S);
}

export interface ContexteAlerte {
  numDau: string | null;    // n° du permis concerné, ou null (réponse non rattachée → permis inconnu)
  aLienPerissable: boolean; // un lien fort est en jeu → formulation « perte » ; sinon « à classer » (pièces déjà sauvegardées)
}

/**
 * Objet de l'alerte. Un SEUL n° de permis dans l'objet (décision fondateur) — les autres permis sont dans le corps.
 *  - lien en jeu : objets EXACTS du fondateur (n° substitué). Le 24 h reçoit aussi le n° (distinction en boîte du grain par permis).
 *  - pièces seules : « à classer », JAMAIS annoncer une perte qui n'aura pas lieu.
 *  - non rattachée (permis inconnu) : sujet dédié « contenu non rattaché qui va expirer ».
 */
export function sujetAlerte(type: TypeAlerteGed, ctx: ContexteAlerte): string {
  if (ctx.numDau === null) {
    return type === 'h24'
      ? 'URGENT 24H — CONTENU NON RATTACHÉ QUI VA EXPIRER (permis à identifier)'
      : 'ALERTE — CONTENU NON RATTACHÉ QUI VA EXPIRER (permis à identifier)';
  }
  if (ctx.aLienPerissable) {
    return type === 'h24'
      ? `URGENT PERMIS DE CONSTRUIRE N°${ctx.numDau} 24H POUR TELECHARGER EN GED AVANT PERTES DES DOCUMENTS`
      : `ALERTE PERMIS DE CONSTRUIRE N°${ctx.numDau} - DOSSIER A TELECHARGER DANS LA GED`;
  }
  return type === 'h24'
    ? `RAPPEL PERMIS DE CONSTRUIRE N°${ctx.numDau} - DOCUMENTS À CLASSER EN GED`
    : `PERMIS DE CONSTRUIRE N°${ctx.numDau} - DOCUMENTS À CLASSER DANS LA GED`;
}

/** Une pièce dans le forward : jointe (petite) OU liée par URL signée (lourde). */
export interface PieceForward { nomFichier: string; jointe: boolean; lienSigne: string | null }

export interface CorpsForwardEntree {
  type: TypeAlerteGed;
  ctx: ContexteAlerte;
  liensPerissables: { url: string; mention: string }[]; // liens forts (mention datée L1)
  autresPermis: string[];        // autres n° de permis couverts par le même message
  communeNom: string | null;
  pieces: PieceForward[];
  deAdresse: string; deNom: string | null; objet: string | null; recuLe: string; corpsTexte: string | null;
  enRetard: boolean;
}

/**
 * Corps TEXTE du forward. Décision 8 : ce qui PÉRIT en tête (le lien de la mairie + à-faire) ; puis les pièces avec la mention
 * explicite qu'elles sont déjà sauvegardées (ne jamais faire courir pour rien) ; puis le(s) permis ; puis le message d'origine.
 * PUR (aucune I/O — les URL signées et le choix joindre/lier sont résolus en amont par l'orchestrateur).
 */
export function composerCorpsForward(e: CorpsForwardEntree): string {
  const L: string[] = [];
  const urgent = e.type === 'h24';

  if (e.ctx.aLienPerissable) {
    L.push(urgent
      ? '⚠ URGENT — il reste moins de 24 h pour télécharger ce contenu avant que le lien de la mairie n’expire.'
      : '⚠ Il reste environ 3 jours pour télécharger ce contenu avant que le lien de la mairie n’expire.', '');
    L.push('Lien(s) de téléchargement de la mairie :');
    for (const l of e.liensPerissables) L.push(`  → ${l.url}   (${l.mention})`);
    L.push('', 'À FAIRE : télécharger les documents via ce lien, puis les téléverser dans la GED du permis.', '');
  } else {
    L.push(urgent
      ? 'RAPPEL — des documents reçus de la mairie ne sont pas encore classés dans la GED du permis.'
      : 'Des documents reçus de la mairie ne sont pas encore classés dans la GED du permis.', '');
    L.push('Aucune perte à craindre : les pièces jointes sont déjà sauvegardées de notre côté. Il reste seulement à les CLASSER en GED.', '');
  }

  if (e.pieces.length > 0) {
    L.push('Pièces reçues (déjà sauvegardées chez nous — aucune perte possible) :');
    for (const p of e.pieces) {
      L.push(p.jointe ? `  · ${p.nomFichier} — jointe à ce mail` : `  · ${p.nomFichier} — trop volumineuse pour être jointe, lien de téléchargement : ${p.lienSigne}`);
    }
    L.push('');
  }

  if (e.ctx.numDau !== null) {
    L.push(`Permis concerné : N°${e.ctx.numDau}${e.communeNom ? ` (${e.communeNom})` : ''}.`);
  } else {
    L.push('Ce message n’a PAS pu être rattaché à un permis : à identifier et rattacher dans l’onglet « Réponses » avant l’expiration du lien.');
  }
  if (e.autresPermis.length > 0) L.push(`Autres permis couverts par le même message : ${e.autresPermis.map((n) => `N°${n}`).join(', ')}.`);
  L.push('');

  if (e.enRetard) L.push('⚠ Cette alerte est partie EN RETARD (la surveillance ne tournait pas au moment prévu) — vérifiez qu’il reste du temps.', '');

  L.push('----- Message d’origine de la mairie -----');
  L.push(`De : ${e.deNom ? `${e.deNom} <${e.deAdresse}>` : e.deAdresse}`);
  L.push(`Objet : ${e.objet ?? '(sans objet)'}`);
  L.push(`Reçu le : ${e.recuLe}`);
  L.push('');
  L.push(e.corpsTexte && e.corpsTexte.trim() !== '' ? e.corpsTexte : '(message d’origine en HTML — à consulter dans l’espace d’administration)');

  return L.join('\n');
}
