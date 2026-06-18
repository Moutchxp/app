/**
 * Point de contact de l'obstacle (Mode A) — LOGIQUE PURE, aucune DB.
 *
 * Localise OÙ commence l'obstruction sur le couloir principal, une fois établi
 * SI le bâtiment obstrue (faîtage nettoyé ≥ altitude de la fenêtre).
 *
 * Réf : SPEC_module_hauteurs_v3.md §3 bis « Localisation du point de contact ».
 * Marge de sûreté : d_contact = milieu (façade, franchissement) → raccourcit la
 * distance annoncée, ne sur-estime jamais le dégagement. Aucun arrondi.
 */

export interface ProfilPoint {
  /** Distance origine le long de l'axe (m). */
  distM: number;
  /** Altitude du toit nettoyée à ce point (NGF, m). */
  altM: number;
}

export interface ResultatContact {
  obstrue: boolean;
  dFacadeM: number;
  dFranchissementM: number | null;
  dContactM: number | null;
  raison: string;
}

export function pointDeContact(
  dFacadeM: number,
  profil: ProfilPoint[],
  altitudeFenetreM: number,
  faiteageM: number,
): ResultatContact {
  // Le bâtiment n'obstrue pas : faîtage sous la fenêtre.
  if (faiteageM < altitudeFenetreM) {
    return {
      obstrue: false,
      dFacadeM,
      dFranchissementM: null,
      dContactM: null,
      raison: "faîtage < fenêtre : n'obstrue pas",
    };
  }

  let dFranchissementM: number;
  let raison: string;

  if (profil.length === 0) {
    // Cas dégradé : profil manquant → repli façade (conservateur).
    dFranchissementM = dFacadeM;
    raison = "profil indisponible : repli façade (conservateur)";
  } else if (profil[0].altM >= altitudeFenetreM) {
    // Bord d'attaque (égout) déjà ≥ fenêtre → contact = façade (toit plat / égout haut).
    dFranchissementM = dFacadeM;
    raison = "égout/toit déjà ≥ fenêtre : contact = façade";
  } else {
    // Premier point du profil franchissant la hauteur de référence (proche → lointain).
    const franchi = profil.find((p) => p.altM >= altitudeFenetreM);
    if (franchi === undefined) {
      // Profil sous la fenêtre mais faîtage ≥ fenêtre (échantillons divergents) → repli façade.
      dFranchissementM = dFacadeM;
      raison = "profil sous la fenêtre mais faîtage ≥ fenêtre : repli façade (conservateur)";
    } else {
      // Garde-fou : le franchissement ne peut être en-deçà de la façade.
      dFranchissementM = Math.max(dFacadeM, franchi.distM);
      raison = "pente franchie en montant : contact à mi-chemin façade/franchissement";
    }
  }

  const dContactM = (dFacadeM + dFranchissementM) / 2;
  return { obstrue: true, dFacadeM, dFranchissementM, dContactM, raison };
}
