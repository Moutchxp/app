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

/**
 * ══ 🔴🔴 LOT GESTION-BULLES (Arno, 16/10/2026) — LA BULLE STRUCTURÉE, ÉCRITE UNE SEULE FOIS. PUR. ═════════════════════
 * « Un titre court en gras ; UNE LIGNE PAR BIEN : adresse, commune, puis “lot N · type du lot” si connu ; pour
 * l'exception, une dernière ligne distincte, plus discrète : “Différent du suivi de la conversation : <bien(s) du suivi>”. »
 * Même structure pour toutes les bulles de biens (liste, conversation, plein écran, historique du bien).
 */
export const TITRE_BIENS_RATTACHES = 'Biens rattachés';
export const TITRE_EXCEPTION = 'Exception au suivi';
export const DEBUT_PIED_EXCEPTION = 'Différent du suivi de la conversation';
/** 🔴 LOT GESTION-BULLES (Arno, 16/10/2026) — l'intertitre de la partie du bas : le suivi de fond actif en arrière-plan. */
export const TITRE_SUIVI_DE_FOND_ACTIF = 'Suivi de fond actif';
export const AUCUN_SUIVI_DE_FOND = 'Aucun';

export interface LigneStructuree {
  /** « 54 avenue du Puvis de Chavannes, COURBEVOIE » — l'adresse puis la commune (sans code postal). */
  adresse: string;
  /** « lot 21 · Appartement meublé · Type 1 » — le type seulement s'il est connu. */
  lot: string;
  /** Le propriétaire, information secondaire déjà présente dans la bulle avant ce lot ; `null` s'il est inconnu. */
  proprietaire: string | null;
}

export function ligneStructuree(b: BienDeLaBulle): LigneStructuree {
  const adresse = [utile(b.adresse), utile(b.commune)].filter((x): x is string => x !== null).join(', ');
  const type = typeDuBien(b);
  const proprietaire = (b.proprietaire ?? '').trim();
  return {
    adresse: adresse === '' ? `bien ${b.cle}` : adresse,
    lot: type === TYPE_NON_RENSEIGNE ? `lot ${b.cle}` : `lot ${b.cle} · ${type}`,
    proprietaire: proprietaire === '' ? null : proprietaire,
  };
}

/** La dernière ligne de la bulle d'exception : ce que dit le suivi de fond pour ce mail. PUR. */
export function piedException(fond: readonly string[] | 'interne' | 'hors_gestion' | null): string {
  const quoi = fond === null ? 'aucun suivi'
    : fond === 'interne' ? 'Interne'
      : fond === 'hors_gestion' ? 'Hors gestion'
        : fond.length === 0 ? 'aucun bien' : fond.map(bienCourtSansCodePostal).join(' ; ');
  return `${DEBUT_PIED_EXCEPTION} : ${quoi}`;
}

/** « 54 avenue …, 92400 COURBEVOIE — lot 345 » → « 54 avenue …, COURBEVOIE (lot 345) » : la forme des lignes au-dessus. PUR. */
export function bienCourtSansCodePostal(libelle: string): string {
  const t = (libelle ?? '').trim();
  if (t === '') return 'un bien sans nom';
  const parts = t.split(' — ').map((x) => x.trim()).filter((x) => x !== '');
  const dernier = parts[parts.length - 1];
  const court = parts.length > 1 && /^lot\s/i.test(dernier) ? `${parts[0]} (${dernier})` : parts[0];
  return court.replace(/,\s*\d{5}\s+/, ', ');
}
