'use client';

/**
 * ══ 🔴🔴 LA LÉGENDE DE CONFIDENTIALITÉ DES COORDONNÉES (Arno, 10/11/2026) — UN SEUL COMPOSANT, MÊME TEXTE PARTOUT ════════════════════
 *
 * Posée AU-DESSUS de chaque liste des coordonnées des intervenants d'une tâche ou d'une invitation : le formulaire (au-dessus du bloc
 * « Texte de la tâche — bloc Contacts (généré) » et des contacts copiés), la section « CONTACTS (n) » de la carte d'une tâche, le
 * récapitulatif avant envoi. Discrète : petit encadré gris, police réduite. Elle porte sa propre feuille (elle vit aussi dans une
 * modale rendue hors de la fenêtre). ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export const TITRE_CONFIDENTIALITE = '🔒 Coordonnées réservées à l’agence';
export const TEXTE_CONFIDENTIALITE = 'Les coordonnées des contacts ne sont communiquées qu’en interne, aux collaborateurs de l’agence concernés par '
  + 'cette tâche. Les contacts extérieurs (clients, locataires, propriétaires, tiers) ne reçoivent jamais les coordonnées des autres '
  + 'intervenants : seul le texte de la note leur est transmis.';

export function LegendeConfidentialite() {
  return (
    <div className="lcf" data-legende-confidentialite role="note">
      <style>{CSS_LEGENDE_CONFIDENTIALITE}</style>
      <p className="lcf-titre">{TITRE_CONFIDENTIALITE}</p>
      <p className="lcf-texte">{TEXTE_CONFIDENTIALITE}</p>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement (Clair et Sombre). */
const CSS_LEGENDE_CONFIDENTIALITE = `
.lcf{margin:0 0 6px;padding:6px 10px;border:1px solid var(--color-svv-line);border-radius:8px;
  background:color-mix(in srgb, var(--color-svv-line) 30%, transparent);min-width:0;box-sizing:border-box}
.lcf-titre{margin:0;font-size:.74rem;font-weight:800;color:var(--color-svv-ink)}
.lcf-texte{margin:2px 0 0;font-size:.72rem;line-height:1.4;color:var(--color-svv-muted);overflow-wrap:anywhere;text-transform:none;letter-spacing:normal}
`;
