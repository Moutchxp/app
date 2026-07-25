/**
 * GABARIT partagé des pages éditoriales (« Qui sommes-nous », « Partenaires »). STRUCTURE uniquement — AUCUN contenu
 * éditorial ici : les textes vivent dans le `contenu.ts` de chaque page. Composants purs (rendus serveur), charte SVAV
 * (tokens `--color-svv-*` uniquement), aucune animation.
 */
import type { ReactNode } from "react";

// ── Chaînes STRUCTURELLES (pas du contenu éditorial : libellés d'habillage et états d'attente) ──
/** Texte alternatif du sceau de marque (bandeau). */
export const ALT_SCEAU = "Sceau Sans Vis-à-Vis®";
/** Marque affichée dans le bandeau (marque déposée). */
export const MARQUE = "SANS VIS·A·VIS®";
/** Lien de retour, en pied de page. */
export const LIB_RETOUR_ACCUEIL = "Retour à l’accueil";
/** État d'attente HONNÊTE là où un texte n'est pas encore fourni (jamais de faux paragraphe). */
export const MSG_CONTENU_A_VENIR = "Contenu à venir.";
/** État vide de la liste de partenaires (aucune entrée). */
export const MSG_AUCUN_PARTENAIRE = "Aucun partenaire pour le moment.";

/** Un partenaire. `nom` sert AUSSI de texte alternatif du logo (obligatoire). `lien` = URL https (ouverte en externe sûr). */
export interface Partenaire {
  nom: string;
  logo: string;
  description: string;
  lien: string;
}

/**
 * Section de texte suivi : titre (H2) + corps. Emplacements VIDES → on affiche « Contenu à venir » à la place du corps,
 * et le titre est omis s'il est vide (jamais de faux titre). `whitespace-pre-line` : préserve les sauts de ligne d'Arno.
 */
export function SectionEditoriale({ titre, corps }: { titre: string; corps: string }): ReactNode {
  return (
    <section className="flex flex-col gap-2">
      {titre.trim() !== "" ? (
        <h2 className="svv-verif-title text-lg font-extrabold text-svv-ink">{titre}</h2>
      ) : null}
      {corps.trim() !== "" ? (
        <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-svv-ink">{corps}</p>
      ) : (
        <p className="text-sm italic text-svv-muted">{MSG_CONTENU_A_VENIR}</p>
      )}
    </section>
  );
}

/** Carte d'UN partenaire : logo à taille contrainte + alt obligatoire, nom, description, lien externe SÛR. */
export function CartePartenaire({ partenaire }: { partenaire: Partenaire }): ReactNode {
  const { nom, logo, description, lien } = partenaire;
  return (
    <a
      href={lien}
      target="_blank"
      rel="noopener noreferrer"
      className="svv-card flex min-h-[44px] items-center gap-4"
    >
      {/* Logo de dimensions inconnues (fournies par Arno) → <img> borné en hauteur, largeur auto, sans distorsion.
          eslint-disable : next/image exigerait des dimensions intrinsèques qu'on n'a pas ; même parti que la home. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={nom} className="h-12 w-auto max-w-[120px] shrink-0 object-contain" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold text-svv-ink">{nom}</span>
        <span className="text-sm text-svv-muted">{description}</span>
      </span>
    </a>
  );
}

/** Liste de partenaires rendue depuis les données. VIDE → état vide propre et explicite (jamais une grille fantôme). */
export function ListePartenaires({ partenaires }: { partenaires: Partenaire[] }): ReactNode {
  if (partenaires.length === 0) {
    return <p className="text-sm italic text-svv-muted">{MSG_AUCUN_PARTENAIRE}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {partenaires.map((p) => (
        <li key={p.nom}>
          <CartePartenaire partenaire={p} />
        </li>
      ))}
    </ul>
  );
}
