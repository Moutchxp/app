'use client';

import type { ReactNode } from 'react';
import { ETIQUETTE_FAMILLE_MAIL, rappelFamilles, type FamilleMail } from '../../../../lib/location/famillesMails';

/**
 * ══ 🔴🔴 Arno (15/11/2026) — LES CARTES DE MAIL D'UN RÉCAPITULATIF, PAR FAMILLE ══════════════════════════════════════════════════════════
 * Chaque carte porte en tête son ÉTIQUETTE (« MAIL AUX LOCATAIRES », « MAIL INTERNE À L'AGENCE », « MAIL AUX PROPRIÉTAIRES »…) et sa barre
 * latérale gauche prend la couleur de la famille : locataire VERT, interne GRIS, propriétaire ROUGE, partenaires BLEU (les couleurs déjà
 * portées par ces familles dans l'application). Sous le titre : le locataire destinataire (une carte par locataire) ou les collaborateurs
 * destinataires ; la mention de recette quand les destinataires affichés ne sont pas ceux qui recevront le mail. Le reste (objet, adresses,
 * copies, pièces jointes, texte, « Modifier le texte ») est celui de la carte d'avant : rien n'est retiré.
 */
export function RappelFamilles({ mails }: { mails: readonly { famille: FamilleMail }[] }) {
  const texte = rappelFamilles(mails);
  return texte === '' ? null : <p className="mfa-rappel" data-rappel-familles>{texte}</p>;
}

export function CarteMailFamille({ famille, sorte, titre, objet, a, cc, destinataire, pieces, recette, children }: {
  famille: FamilleMail; sorte: string; titre: string; objet: string | null; a: readonly string[]; cc: readonly string[];
  /** le ou les locataires (propriétaires) que vise CE mail — leur nom */
  destinataire?: string;
  /** les pièces jointes de CE mail ; absent : la ligne n'est pas montrée */
  pieces?: readonly string[] | null;
  recette?: string | null; children?: ReactNode;
}) {
  return (
    <li className={`cev-mail mfa-carte mfa-carte--${famille}`} data-mail-prevu={sorte} data-famille-mail={famille}>
      <p className="mfa-etiquette" data-etiquette-famille={famille}>{ETIQUETTE_FAMILLE_MAIL[famille]}</p>
      <p className="cev-mail-titre">{titre}</p>
      {famille === 'interne'
        ? <div className="mfa-dest" data-collaborateurs-destinataires><span className="mfa-dest-mot">Collaborateurs destinataires :</span>
          {a.length === 0 ? <span> —</span> : <ul className="mfa-liste">{a.map((x) => <li key={x}>{x}</li>)}</ul>}</div>
        : destinataire !== undefined && destinataire !== '' && <p className="mfa-dest" data-destinataire-famille><span className="mfa-dest-mot">Destinataire :</span> {destinataire}</p>}
      {recette && <p className="mfa-recette" role="note" data-recette-remplacement>{recette}</p>}
      <dl className="cev-dl"><dt>Objet</dt><dd data-objet>{objet}</dd><dt>{famille === 'interne' ? 'Adresses' : 'Destinataires'}</dt><dd data-a>{a.join(', ') || '—'}</dd>
        <dt>En copie</dt><dd data-cc>{cc.length > 0 ? cc.join(', ') : 'aucune'}</dd>
        {pieces !== undefined && pieces !== null && <><dt>Pièces jointes</dt><dd data-pieces-famille>{pieces.length === 0 ? 'aucune'
          : <ul className="mfa-liste">{pieces.map((p, i) => <li key={`${i}-${p}`} data-piece-jointe>{/\.ics$/i.test(p) ? `${p} (invitation d’agenda)` : p}</li>)}</ul>}</dd></>}
      </dl>
      {children}
    </li>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; texte de l'etiquette sur fond de famille (contraste >= 4,5:1 en clair et en sombre). */
export const CSS_FAMILLES_MAILS = `
.mfa-rappel{margin:0;padding:8px 12px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:800}
.cev-mail.mfa-carte{--mfa-couleur:var(--color-svv-gray);border-left:8px solid var(--mfa-couleur);display:flex;flex-direction:column;gap:6px;min-width:0}
.cev-mail.mfa-carte--locataire{--mfa-couleur:var(--color-svv-green-ink)}
.cev-mail.mfa-carte--interne{--mfa-couleur:var(--color-svv-gray)}
.cev-mail.mfa-carte--proprietaire{--mfa-couleur:var(--color-svv-red)}
.cev-mail.mfa-carte--partenaires{--mfa-couleur:var(--color-svv-blue)}
.mfa-etiquette{align-self:flex-start;margin:0;padding:5px 12px;border-radius:999px;background:var(--mfa-couleur);color:var(--color-svv-surface);font-size:.86rem;font-weight:900;letter-spacing:.06em;line-height:1.25}
.mfa-carte .cev-mail-titre{margin:0}
.mfa-dest{margin:0;font-weight:700;overflow-wrap:anywhere}
.mfa-dest-mot{color:var(--color-svv-muted);font-weight:700}
.mfa-liste{margin:2px 0 0;padding-left:18px}
.mfa-recette{margin:0;padding:8px 10px;border-radius:10px;border:2px dashed var(--color-svv-urgence-orange);background:color-mix(in srgb, var(--color-svv-urgence-orange) 10%, var(--color-svv-surface));color:var(--color-svv-ink);font-weight:700;overflow-wrap:anywhere}
.mfa-bloc{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink);display:flex;flex-direction:column;gap:4px}
.mfa-bloc-titre{margin:0;font-weight:800}
`;
