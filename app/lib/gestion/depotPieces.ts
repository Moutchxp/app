/**
 * ══ 🔴🔴 GLISSER-DÉPOSER ET COLLER DES PIÈCES JOINTES DANS L'ÉCRITURE D'UN MAIL — LES RÈGLES, EN MODULE PUR (Arno, 23/10/2026) ══
 *
 * « Glisser un ou plusieurs fichiers […] n'importe où sur le bloc d'écriture […] les ajoute aux pièces jointes du mail, exactement
 * comme le bouton actuel “Joindre”. […] Rien ne se passe si on glisse du texte. […] Cmd+V d'une image ou d'un fichier copié ajoute
 * la pièce jointe (une capture d'écran collée devient “capture-AAAA-MM-JJ-HHMM.png”) ; coller du texte reste un collage de texte
 * normal. […] pas de doublon si le même fichier est déposé deux fois. »
 *
 * Les limites (taille totale, types refusés) restent celles du bouton : `verifierPiece` (`piecesEnvoi.ts`), appliquée par le même
 * chemin d'ajout. Ce module ne dit que ce qui est propre au dépôt et au collage. Aucun import : il se lit depuis un composant client.
 */

export const MOT_DEPOT = 'Déposer ici pour joindre';

/** Le glissement transporte-t-il des FICHIERS ? Un texte ou un lien glissé ne déclenche rien. */
export function transporteDesFichiers(types: readonly string[] | null | undefined): boolean {
  return (types ?? []).includes('Files');
}

/**
 * ══ UN COLLAGE : DES FICHIERS, OU DU TEXTE ? ══
 *
 * 🔴 LE PIÈGE : Word, Excel ou Pages posent dans le presse-papiers, À CÔTÉ du texte copié, une IMAGE de la sélection. La lire comme
 * une pièce jointe ferait de chaque copier-coller depuis Word une capture jointe au mail. La règle : il y a des fichiers, ET aucun
 * TEXTE dans le HTML copié (une capture d'écran n'a pas de HTML ; une image copiée d'une page web n'a qu'une balise `<img>` ; un
 * fichier copié dans le Finder n'a que son nom en texte brut, sans HTML). Sinon, c'est un collage de texte normal.
 */
export function natureDuCollage(o: { nbFichiers: number; html: string }): 'fichiers' | 'texte' {
  if (o.nbFichiers === 0) return 'texte';
  const texteDuHtml = o.html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return texteDuHtml === '' ? 'fichiers' : 'texte';
}

/**
 * LE NOM D'UNE IMAGE COLLÉE. Le navigateur nomme une capture « image.png » (ou rien) : elle devient
 * « capture-AAAA-MM-JJ-HHMM.png », à l'heure de Paris. Un fichier qui a un vrai nom (copié dans le Finder) le garde.
 */
export function nomDuCollage(nom: string, type: string, maintenant: Date = new Date()): string {
  const generique = nom.trim() === '' || /^image\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(nom.trim());
  if (!generique || !type.startsWith('image/')) return nom;
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(maintenant).map((x) => [x.type, x.value]));
  const ext = (type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace(/\+.*$/, '');
  return `capture-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}.${ext}`;
}

/**
 * PAS DE DOUBLON : un fichier de même nom et de même taille qu'une pièce déjà jointe — ou qu'un fichier du même dépôt — est
 * écarté, et DIT. Retirer la pièce puis la redéposer reste possible : la comparaison porte sur ce qui est joint maintenant.
 */
export function sansDoublons<F extends { name: string; size: number }>(
  fichiers: readonly F[], dejaJointes: readonly { nom: string; taille: number }[],
): { gardes: F[]; doublons: F[] } {
  const vus = new Set(dejaJointes.map((p) => `${p.nom}\u0000${p.taille}`));
  const gardes: F[] = [];
  const doublons: F[] = [];
  for (const f of fichiers) {
    const cle = `${f.name}\u0000${f.size}`;
    if (vus.has(cle)) { doublons.push(f); continue; }
    vus.add(cle);
    gardes.push(f);
  }
  return { gardes, doublons };
}

export function motDoublon(nom: string): string {
  return `« ${nom} » est déjà joint : il n’a pas été ajouté une seconde fois.`;
}
