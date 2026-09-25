/**
 * MODULE « GESTION » — LOT 5-PJ-ENVOI : CE QU'ON ACCEPTE DE JOINDRE. Module PUR : aucune base, aucun réseau.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEUX REFUS, ET DEUX SEULEMENT — mais chacun DIT pourquoi, avec le chiffre ou le nom en cause. Un refus muet
 * (« fichier invalide ») oblige à deviner, et on réessaie trois fois avant de comprendre.
 *   ① LA TAILLE TOTALE : 25 Mo, la limite de Gmail. On la vérifie sur le TOTAL, pièces déjà jointes comprises —
 *      vérifier fichier par fichier laisserait passer cinq fois 6 Mo, et c'est Gmail qui refuserait, à l'envoi,
 *      quand le message est déjà écrit ;
 *   ② LES TYPES DANGEREUX : les exécutables. Gmail les refuse de toute façon (et le dit mal) ; les refuser ICI
 *      épargne d'écrire un message entier pour rien. La liste est celle de Gmail, par EXTENSION — c'est elle que le
 *      système du destinataire regardera, pas le type MIME que l'expéditeur annonce.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** La limite de Gmail, en octets. Écrite une fois : deux valeurs dispersées finiraient par se contredire. */
export const TAILLE_MAX_TOTALE = 25 * 1024 * 1024;

/**
 * LES EXTENSIONS REFUSÉES — celles que Gmail bloque. On raisonne par EXTENSION et non par type MIME : c'est
 * l'extension que le système du destinataire regardera pour décider quoi exécuter, et c'est elle qu'un expéditeur
 * malveillant ne peut pas maquiller sans que ce soit visible.
 */
export const EXTENSIONS_REFUSEES: readonly string[] = [
  'ade', 'adp', 'apk', 'appx', 'appxbundle', 'bat', 'cab', 'chm', 'cmd', 'com', 'cpl', 'dll', 'dmg', 'ex', 'ex_',
  'exe', 'hta', 'ins', 'isp', 'iso', 'jar', 'js', 'jse', 'lib', 'lnk', 'mde', 'msc', 'msi', 'msix', 'msixbundle',
  'msp', 'mst', 'nsh', 'pif', 'ps1', 'scr', 'sct', 'shb', 'sys', 'vb', 'vbe', 'vbs', 'vxd', 'wsc', 'wsf', 'wsh',
];

/** L'extension d'un nom de fichier, en minuscules, sans le point. `''` si le nom n'en porte pas. PUR. */
export function extensionDe(nom: string): string {
  const m = /\.([A-Za-z0-9_]+)\s*$/.exec((nom ?? '').trim());
  return (m?.[1] ?? '').toLowerCase();
}

/** Une taille, écrite comme on la lit. « 26,4 Mo » plutôt que « 27682355 octets ». PUR. */
export function taillePourHumain(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

export type VerdictPiece = { ok: true } | { ok: false; motif: string };

/**
 * PEUT-ON JOINDRE CE FICHIER ? `dejaJoint` est le total des pièces déjà attachées au brouillon — c'est ce qui rend
 * la vérification juste quand on ajoute le cinquième fichier de 6 Mo. PUR.
 */
export function verifierPiece(
  o: { nom: string; taille: number; dejaJoint?: number },
): VerdictPiece {
  const nom = (o.nom ?? '').trim();
  if (nom === '') return { ok: false, motif: 'Ce fichier n’a pas de nom : impossible de le joindre.' };

  const ext = extensionDe(nom);
  if (EXTENSIONS_REFUSEES.includes(ext)) {
    return {
      ok: false,
      motif: `« ${nom} » ne peut pas être joint : les fichiers .${ext} sont refusés par Gmail (programmes exécutables). `
        + 'Pour l’envoyer quand même, placez-le dans le Drive et joignez son lien.',
    };
  }
  if (o.taille <= 0) return { ok: false, motif: `« ${nom} » est vide : il n’y a rien à joindre.` };

  const total = (o.dejaJoint ?? 0) + o.taille;
  if (total > TAILLE_MAX_TOTALE) {
    return {
      ok: false,
      motif: `« ${nom} » ferait ${taillePourHumain(total)} au total, au-delà de la limite de `
        + `${taillePourHumain(TAILLE_MAX_TOTALE)} de Gmail. Retirez une pièce, ou passez par le Drive.`,
    };
  }
  return { ok: true };
}

/** Ce que l'écran affiche pour une pièce jointe d'un brouillon. Jamais d'URL de stockage : nom, type, taille. */
export interface PieceBrouillonAffichee {
  id: number;
  nom: string;
  typeMime: string | null;
  taille: number;
  /** `reprise` = elle vient du message d'origine (transfert) ; `ajoutee` = un fichier pris sur l'ordinateur. */
  origine: 'ajoutee' | 'reprise';
}

/** Le total joint, pour l'écran comme pour la vérification. PUR. */
export function totalJoint(pieces: readonly { taille: number }[]): number {
  return pieces.reduce((n, p) => n + p.taille, 0);
}
