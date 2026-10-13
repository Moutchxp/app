/**
 * ══ 🔴🔴 LOT REPONDRE-TRANSFERER-SANS-PERTE — CHANGER DE MODE SANS RIEN PERDRE DE CE QU'ON A ÉCRIT ═════════════════
 *
 * DEMANDE D'ARNO (13/10/2026) : « pendant que j'écris un mail non encore envoyé, je dois pouvoir passer librement entre
 * Répondre / Répondre à tous / Transférer, dans n'importe quel ordre et autant de fois que je veux, SANS JAMAIS perdre
 * ce que j'ai déjà écrit. »
 *
 * 🔴 CE QUI SE PASSAIT AVANT : chaque clic fabriquait un brouillon NEUF (`preparerBrouillon`) et REMPLAÇAIT celui qui
 * était ouvert. Texte, mise en forme, destinataires ajoutés, objet retouché, rattachement : tout partait.
 *
 * 🔴 LA RÈGLE, EN UNE PHRASE : on retire ce que l'application avait rempli pour l'ANCIEN mode, on garde TOUT le reste
 * (c'est ce que la personne a fait), puis on applique ce que l'application remplit pour le NOUVEAU mode.
 *   · « ce que l'application remplit » = `preparerBrouillon`, rejoué sur le MÊME message — aucune règle de
 *     destinataires n'est réécrite ici ;
 *   · le texte, la mise en forme, la citation, le rattachement, « Interne », le numéro du brouillon : intouchés ;
 *   · l'objet : seul le préfixe que l'application avait posé change (« Re: » ↔ « Tr: »), le reste est gardé tel quel.
 *
 * 🔴 UN RETRAIT EST UNE DÉCISION, ET IL EST MÉMORISÉ (`retiresALaMain`). Une adresse que l'application avait mise et
 * que la personne a retirée ne revient pas au changement de mode suivant : un Cc enlevé exprès dans « Répondre à
 * tous » ne réapparaît pas dans son dos en repassant par « Transférer ». La remettre à la main la sort de la liste.
 *
 * ⚠️ LES PIÈCES JOINTES NE SONT PAS ICI : elles vivent en base, sur le brouillon (voir `Redaction.tsx` et
 * `piecesEnvoiCablage.ts`). Celles que la personne a ajoutées restent ; celles que Transférer a reprises du message
 * d'origine ne sont montrées et envoyées qu'en mode Transférer.
 *
 * PUR : aucune base, aucun réseau, aucun écran.
 */
import {
  preparerBrouillon, type Brouillon, type ContexteRedaction, type MessageOrigine, type VoieRedaction,
} from './redaction';

/** Les trois modes entre lesquels on bascule. « Nouveau message » et « transférer en pièce jointe » n'en sont pas. */
export type VoieBasculable = 'repondre' | 'repondre_tous' | 'transferer';

export function estBasculable(voie: VoieRedaction): voie is VoieBasculable {
  return voie === 'repondre' || voie === 'repondre_tous' || voie === 'transferer';
}

/** Le message auquel le composeur répond, et ce qu'il faut pour rejouer `preparerBrouillon` dessus. */
export interface OrigineVoies {
  message: MessageOrigine;
  dateLisible?: string;
  /** Le HTML du message d'origine, DÉJÀ ASSAINI par le serveur (même règle que `preparerBrouillon`). */
  origineHtml?: string | null;
}

/** Ce que la bascule lit du brouillon courant. */
export type BrouillonBasculable = Pick<Brouillon,
  'voie' | 'a' | 'cc' | 'cci' | 'objet' | 'citation' | 'citationHtml' | 'destinatairesApproximatifs'>
  & { retiresALaMain?: readonly string[] };

/** Ce que la bascule change — et RIEN d'autre. Le reste du brouillon est conservé par l'appelant. */
export interface ChangementDeVoie {
  voie: VoieBasculable;
  a: string[];
  cc: string[];
  cci: string[];
  objet: string;
  citation: string | null;
  citationHtml: string | null;
  destinatairesApproximatifs: boolean;
  retiresALaMain: string[];
}

const minuscule = (x: string): string => x.trim().toLowerCase();

/**
 * Le préfixe que l'application a posé devant l'objet du message d'origine (« Re: », « Tr: », ou rien quand l'objet en
 * portait déjà un). Déduit de `preparerBrouillon`, jamais réécrit : une seconde règle de préfixe finirait par diverger.
 */
function prefixePose(objetPrepare: string, objetOrigine: string): string {
  return objetPrepare.endsWith(objetOrigine) ? objetPrepare.slice(0, objetPrepare.length - objetOrigine.length) : '';
}

/**
 * CHANGE LE MODE d'un brouillon en cours. Voir l'encadré du module. PUR.
 *
 * ⚠️ MÊME MODE = AUCUN CHANGEMENT : rejouer la règle sur le mode déjà choisi rend le brouillon tel quel (aux
 * minuscules près des adresses, que `preparerBrouillon` emploie déjà).
 */
export function changerDeVoie(
  courant: BrouillonBasculable, nouvelle: VoieBasculable, origine: OrigineVoies, ctx: ContexteRedaction,
): ChangementDeVoie {
  const o = { dateLisible: origine.dateLisible, origineHtml: origine.origineHtml };
  const ancien = preparerBrouillon(courant.voie, origine.message, ctx, o);
  const nouveau = preparerBrouillon(nouvelle, origine.message, ctx, o);

  const autoAncien = new Set([...ancien.a, ...ancien.cc, ...ancien.cci].map(minuscule));
  const presentes = new Set([...courant.a, ...courant.cc, ...courant.cci].map(minuscule));

  // Ce qui a été RETIRÉ à la main : l'application l'avait mis, il n'y est plus. Ajouté aux retraits déjà connus ;
  //   une adresse remise à la main en sort.
  const retires = [...new Set([
    ...(courant.retiresALaMain ?? []).map(minuscule),
    ...[...autoAncien].filter((x) => !presentes.has(x)),
  ])].filter((x) => x !== '' && !presentes.has(x));

  // Ce qui a été AJOUTÉ à la main : tout ce qui n'était pas rempli par l'application, à sa place (À, Cc ou Cci).
  const manuel = (l: readonly string[]): string[] => l.filter((x) => !autoAncien.has(minuscule(x)));
  const manuels = { a: manuel(courant.a), cc: manuel(courant.cc), cci: manuel(courant.cci) };

  // La part de l'application pour le nouveau mode, MOINS ce qui est déjà là à la main (la place choisie par la
  //   personne prime) et MOINS ce qu'elle a retiré. Une adresse n'apparaît qu'une fois, tous champs confondus.
  const prises = new Set([...manuels.a, ...manuels.cc, ...manuels.cci].map(minuscule).concat(retires));
  const auto = (l: readonly string[]): string[] => l.filter((x) => {
    const k = minuscule(x);
    if (prises.has(k)) return false;
    prises.add(k);
    return true;
  });
  const autoA = auto(nouveau.a);
  const autoCc = auto(nouveau.cc);
  const autoCci = auto(nouveau.cci);

  // L'objet : inchangé ⇒ celui du nouveau mode ; retouché ⇒ seul le préfixe posé par l'application est remplacé.
  const base = (origine.message.objet ?? '').trim();
  let objet = nouveau.objet;
  if (courant.objet !== ancien.objet) {
    const p = prefixePose(ancien.objet, base);
    const reste = p !== '' && courant.objet.startsWith(p) ? courant.objet.slice(p.length) : courant.objet;
    objet = `${prefixePose(nouveau.objet, base)}${reste}`;
  }

  return {
    voie: nouvelle,
    a: [...autoA, ...manuels.a],
    cc: [...autoCc, ...manuels.cc],
    cci: [...autoCci, ...manuels.cci],
    objet,
    // La citation est la même pour les trois modes : on garde celle du brouillon, sauf s'il n'en avait pas.
    citation: courant.citation ?? nouveau.citation,
    citationHtml: courant.citation == null ? (nouveau.citationHtml ?? null) : (courant.citationHtml ?? null),
    destinatairesApproximatifs: nouveau.destinatairesApproximatifs,
    retiresALaMain: retires,
  };
}
