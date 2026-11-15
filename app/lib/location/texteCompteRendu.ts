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

/* ══ 🔴 Arno (15/11/2026) — LA PRÉSENCE À LA PRÉ-VISITE ══════════════════════════════════════════════════════════════════════════════════
 * Les personnes cochées « présentes » (locataires du préavis, et personnes ajoutées pour ce seul compte rendu) : en tête du compte rendu,
 * « En présence de Mme X, M. Y et de Mme Z. » — civilité abrégée, prénom, nom ; « d’ » devant une voyelle ; une seule personne : pas de « et ». */
export type Civilite = 'Madame' | 'Monsieur';
export interface PersonnePresente { civilite: string | null; prenom: string | null; nom: string }
export const PERSONNES_AJOUTEES_MAX = 10;
export const MOTIF_PRESENCE = 'Cochez au moins une personne présente à la pré-visite.';

/** « Mme », « M. », ou rien (civilité inconnue ou composée). PUR. */
export function abregerCivilite(c: string | null | undefined): string {
  const x = (c ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (x === 'madame' || x === 'mme' || x === 'mlle' || x === 'mademoiselle') return 'Mme';
  if (x === 'monsieur' || x === 'm' || x === 'mr') return 'M.';
  return '';
}
/** « Mme Jeanne Dupont », ou le nom tel qu'il est connu. PUR. */
export function nomPresent(p: PersonnePresente): string {
  const nom = p.nom.replace(/\s+/g, ' ').trim();
  const prenom = (p.prenom ?? '').replace(/\s+/g, ' ').trim();
  const complet = prenom !== '' && !nom.toLowerCase().includes(prenom.toLowerCase()) ? `${prenom} ${nom}` : nom;
  return [abregerCivilite(p.civilite), complet].filter(Boolean).join(' ');
}
const de = (x: string): string => (/^[aeiouyhàâäéèêëîïôöùûü]/i.test(x) ? `d’${x}` : `de ${x}`);
/** « En présence de Mme X, M. Y et de Mme Z. » ; aucune personne : chaîne vide. PUR. */
export function phrasePresence(personnes: readonly PersonnePresente[]): string {
  const noms = personnes.map(nomPresent).filter((x) => x !== '');
  if (noms.length === 0) return '';
  if (noms.length === 1) return `En présence ${de(noms[0])}.`;
  return `En présence ${de(noms[0])}${noms.slice(1, -1).map((n) => `, ${n}`).join('')} et ${de(noms[noms.length - 1])}.`;
}
/** Une personne ajoutée au formulaire, propre ; `null` si elle ne tient pas (nom obligatoire, civilité Madame / Monsieur). PUR. */
export function personneAjoutee(brut: unknown): (PersonnePresente & { civilite: Civilite }) | null {
  const o = (brut ?? {}) as { civilite?: unknown; nom?: unknown; prenom?: unknown };
  const propre = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const civilite = o.civilite === 'Madame' || o.civilite === 'Monsieur' ? o.civilite : null;
  const nom = propre(o.nom, 80);
  if (civilite === null || nom === '') return null;
  const prenom = propre(o.prenom, 80);
  return { civilite, nom, prenom: prenom === '' ? null : prenom };
}
