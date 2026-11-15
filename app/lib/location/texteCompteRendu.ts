/**
 * ══ 🔴 Arno (15/11/2026) — LE TEXTE DU COMPTE RENDU : RETOURS À LA LIGNE ET TIRETS — MODULE PUR ══════════════════════════════════════════
 * RÈGLE DES TIRETS : toute NOUVELLE ligne (après « Entrée », après le retour à la ligne du clavier, ou au début d'une dictée qui arrive sur
 * une ligne vide) commence par « - » dès qu'on y écrit ; jamais de tiret sur la toute première ligne ; jamais de double tiret (une ligne qui
 * commence déjà par « - » est laissée telle quelle) ; une ligne laissée vide ne garde pas de tiret. Le tiret fait partie du texte enregistré
 * (et donc du mail). Le curseur suit : il reste au même endroit du texte écrit. ⚠️ AUCUN IMPORT.
 */
export const TIRET = '- ';

/** Le texte avec ses tirets, et le curseur déplacé d'autant. PUR. */
export function appliquerTirets(texte: string, curseur: number | null): { texte: string; curseur: number | null } {
  const lignes = texte.split('\n');
  let debutAncien = 0; let debutNouveau = 0;
  let nouveauCurseur = curseur;
  const sortie = lignes.map((ligne, i) => {
    let l = ligne; let decaleAuDebut = 0; let retires = 0;
    if (i > 0) {
      if (/^[ \t]*-[ \t]*$/.test(l)) { retires = l.length; l = ''; } // une ligne vide ne garde pas de tiret
      else if (l.trim() !== '' && !/^[ \t]*-/.test(l)) {
        retires = l.length - l.replace(/^[ \t]+/, '').length;
        l = `${TIRET}${l.slice(retires)}`; decaleAuDebut = TIRET.length;
      }
    }
    if (curseur !== null && curseur >= debutAncien && curseur <= debutAncien + ligne.length) {
      const colonne = curseur - debutAncien;
      nouveauCurseur = debutNouveau + Math.min(l.length, Math.max(0, colonne - retires) + decaleAuDebut);
    }
    debutAncien += ligne.length + 1; debutNouveau += l.length + 1;
    return l;
  });
  return { texte: sortie.join('\n'), curseur: nouveauCurseur };
}

/** « Entrée » : un retour à la ligne À L'ENDROIT DU CURSEUR (ou à la fin), puis la règle des tirets. PUR. */
export function insererEntree(texte: string, curseur: number | null): { texte: string; curseur: number | null } {
  const p = curseur === null || curseur < 0 || curseur > texte.length ? texte.length : curseur;
  return appliquerTirets(`${texte.slice(0, p)}\n${texte.slice(p)}`, p + 1);
}

/** La bascule clair / sombre : le thème inverse de celui qu'on VOIT (le thème « système » suit l'appareil). PUR. */
export function themeBascule(pref: 'light' | 'dark' | 'system', systemeSombre: boolean): 'light' | 'dark' {
  const vu = pref === 'system' ? (systemeSombre ? 'dark' : 'light') : pref;
  return vu === 'dark' ? 'light' : 'dark';
}
