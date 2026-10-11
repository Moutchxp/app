import { adresseComplete } from './ficheBien';

/**
 * ══ 🔴🔴 LOT BULLE-BIENS-RATTACHES — CE QUE DIT LA BULLE DE « N BIENS RATTACHÉS », ET OÙ ELLE SE POSE. Module PUR ══════
 *
 * DEMANDE D'ARNO (12/10/2026) : « La bulle liste chaque bien rattaché à CE mail, UNE LIGNE PAR BIEN : adresse complète
 * (n°, rue, CP, ville) — TYPE DE BIEN (avec la typologie si connue) — lot N …… NOM DU PROPRIÉTAIRE, aligné à droite.
 * Le type vient des données existantes ; s'il est inconnu, “type non renseigné” (ne rien inventer). La bulle s'élargit
 * pour que chaque bien tienne sur une seule ligne, jusqu'à la largeur de l'écran moins une marge ; jamais rognée ni
 * hors de l'écran (repositionnement haut / bas, gauche / droite). »
 */

/** Un bien de la bulle, tel que la base le rend (mêmes biens que la fenêtre « Bien(s) rattaché(s) à ce mail »). */
export interface BienDeLaBulle {
  cle: string;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  nature: string | null;
  typeBien: string | null;
  proprietaire: string | null;
}

export const TYPE_NON_RENSEIGNE = 'type non renseigné';
export const PROPRIETAIRE_INCONNU = 'propriétaire inconnu';

/** « À renseigner » et le vide ne sont pas un type : ils ne disent rien du bien. PUR. */
const utile = (brut: string | null): string | null => {
  const v = (brut ?? '').trim();
  if (v === '' || /^a\s*renseigner$/i.test(v.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return null;
  return v;
};

/** « Appartement meublé · Type 2 », « Parking », ou « type non renseigné ». PUR. */
export function typeDuBien(b: Pick<BienDeLaBulle, 'nature' | 'typeBien'>): string {
  const nature = utile(b.nature);
  const typologie = utile(b.typeBien);
  /* « Garage · Garage » ne dit rien de plus que « Garage » : une typologie identique à la nature n'est pas répétée. */
  const morceaux = [nature, typologie !== null && nature !== null && typologie.toLowerCase() === nature.toLowerCase()
    ? null : typologie].filter((x): x is string => x !== null);
  return morceaux.length === 0 ? TYPE_NON_RENSEIGNE : morceaux.join(' · ');
}

/** La ligne d'un bien : à gauche « adresse — type — lot N », à droite le propriétaire. PUR. */
export function ligneDeLaBulle(b: BienDeLaBulle): { bien: string; proprietaire: string } {
  const adresse = adresseComplete({ adresse: b.adresse, codePostal: b.codePostal, commune: b.commune });
  const bien = [adresse === '' ? null : adresse, typeDuBien(b), `lot ${b.cle}`].filter((x) => x !== null).join(' — ');
  const proprietaire = (b.proprietaire ?? '').trim();
  return { bien, proprietaire: proprietaire === '' ? PROPRIETAIRE_INCONNU : proprietaire };
}

/** La marge à garder entre la bulle et le bord de l'écran (« la largeur de l'écran moins une marge »). */
export const MARGE_BULLE = 12;
const ECART = 6;

/**
 * OÙ POSER LA BULLE. PUR. Elle s'ouvre SOUS le texte, son bord droit sur celui du texte (le compteur est aligné à
 * droite sous la date) ; elle glisse vers la gauche ou la droite pour rester dans l'écran ; si la place manque
 * dessous, elle passe au-dessus ; si elle ne tient nulle part en entier, elle prend le côté le plus haut et défile.
 */
export function placerBulleBiens(o: {
  declencheur: { gauche: number; haut: number; largeur: number; hauteur: number };
  bulle: { largeur: number; hauteur: number };
  fenetre: { largeur: number; hauteur: number };
}): { gauche: number; haut: number; hauteurMax: number; cote: 'dessous' | 'dessus' } {
  const { declencheur: d, bulle: b, fenetre: f } = o;
  const largeur = Math.min(b.largeur, f.largeur - 2 * MARGE_BULLE);
  const alignee = d.gauche + d.largeur - largeur;
  const gauche = Math.max(MARGE_BULLE, Math.min(alignee, f.largeur - MARGE_BULLE - largeur));
  const placeDessous = f.hauteur - MARGE_BULLE - (d.haut + d.hauteur + ECART);
  const placeDessus = d.haut - ECART - MARGE_BULLE;
  if (b.hauteur <= placeDessous || placeDessous >= placeDessus) {
    return { gauche, haut: d.haut + d.hauteur + ECART, hauteurMax: Math.max(placeDessous, 0), cote: 'dessous' };
  }
  const hauteur = Math.min(b.hauteur, placeDessus);
  return { gauche, haut: d.haut - ECART - hauteur, hauteurMax: Math.max(placeDessus, 0), cote: 'dessus' };
}
