import { barrePagination } from '../../../../lib/gestion/pagination';

/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — LA BARRE « 1–25 sur N · ‹ › », ÉCRITE UNE SEULE FOIS ═══════════════════════════
 *
 * Demande d'Arno : « Même pagination pour toutes les listes : Réception, Envoyés, Brouillons, Spam, Corbeille,
 * Sans événement, À rattacher, filtre étoile, résultats de recherche, courrier automatique. »
 *
 * 🔴 « MÊME » VEUT DIRE LE MÊME COMPOSANT, PAS « QUI SE RESSEMBLE ». Ces listes ne sont pas toutes servies par le
 * même écran — la boîte, la file à rattacher, les brouillons et les échanges sans événement sont quatre composants
 * distincts, avec quatre façons de charger leurs lignes. Recopier la barre dans chacun l'aurait fait diverger au
 * premier ajustement : c'est exactement ce que le module a déjà payé une fois avec les lignes de liste (lot
 * RECHERCHE-LIGNES, où l'on a cru à deux composants alors qu'il n'y en avait qu'un mal alimenté).
 *
 * ⚠️ CE COMPOSANT NE SAIT PAS CHARGER UNE PAGE, et c'est voulu : chaque liste a sa propre façon de le faire —
 * curseur pour la boîte, `OFFSET` pour la file à rattacher, découpe en mémoire pour les listes courtes. Il reçoit
 * où l'on en est, et rend ce qui se clique. L'arithmétique, elle, vit dans le module PUR `pagination.ts`.
 *
 * ⚠️ LES DEUX CHEVRONS SONT DES CIBLES TACTILES (32 px), pas des caractères : l'exigence transverse mobile du
 * projet. Et « éteint » se dit par `disabled` autant que par la couleur — la couleur seule ne dit rien à qui ne
 * la voit pas.
 */
export function BarrePages({
  ou, page, lignes, total, suite, occupe = false, onPage, nom = 'la liste',
}: {
  /** En haut de la liste ou en bas : seul le filet change de côté. */
  ou: 'haut' | 'bas';
  /** Rang de la page affichée, à partir de 0. */
  page: number;
  /** Combien de lignes la page affiche vraiment. */
  lignes: number;
  /** Le nombre d'ÉCHANGES (ou de mails, ou de brouillons) de la liste entière. `null` = non compté. */
  total: number | null;
  /** Y a-t-il une page après ? Rendu par la source, jamais déduit du total (voir `barrePagination`). */
  suite: boolean;
  /** Un chargement est en cours : les deux chevrons sont éteints le temps qu'il finisse. */
  occupe?: boolean;
  onPage: (vers: number) => void;
  /** Ce que la barre parcourt, DIT au lecteur d'écran (« Pages de la liste », « Pages des brouillons »…). */
  nom?: string;
}) {
  const b = barrePagination({ page, lignes, total, suite });
  if (!b.visible) return null;
  return (
    <nav className={`bpg bpg--${ou}`} aria-label={`Pages de ${nom} (${ou === 'haut' ? 'haut' : 'bas'})`}>
      {/* ⚠️ `aria-live` POLI : le changement de page s'annonce, sans voler le focus au chevron qu'on vient de
          cliquer — sans quoi on ne pourrait pas en cliquer deux de suite au clavier. */}
      <span className="bpg-mot" aria-live="polite">{b.mot}</span>
      <button type="button" className="bpg-chevron" disabled={!b.reculer || occupe}
        aria-label="Page précédente" title="Page précédente" onClick={() => onPage(page - 1)}>‹</button>
      <button type="button" className="bpg-chevron" disabled={!b.avancer || occupe}
        aria-label="Page suivante" title="Page suivante" onClick={() => onPage(page + 1)}>›</button>
    </nav>
  );
}

/**
 * La feuille de style de la barre, à poser UNE fois par écran qui l'emploie.
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS LES COMMENTAIRES CI-DESSOUS : ils vivent dans un litteral de gabarit, qu'un seul
 * accent grave terminerait — piege consigne plusieurs fois dans ce depot, et qui s'est referme deux fois pendant
 * ce lot meme.
 */
export const CSS_BARRE_PAGES = `
/* Le FILET demande par Arno est la BORDURE de cette barre, pas un element de plus : un trait qui n'existerait que
   pour separer se decalerait du contenu au premier ajustement de marge. En haut il est SOUS la barre (elle suit le
   champ de recherche) ; en bas il est AU-DESSUS (elle suit la liste). Dans les deux cas il separe la barre de la
   LISTE, jamais de ce qui est de l'autre cote. */
.bpg{display:flex;align-items:center;justify-content:flex-end;gap:2px;
  font-size:.78rem;color:var(--color-svv-muted)}
.bpg--haut{padding:6px 0 8px;border-bottom:1px solid var(--color-svv-line);margin-bottom:4px}
.bpg--bas{padding:10px 0 4px;border-top:1px solid var(--color-svv-line);margin-top:8px}
.bpg-mot{margin-right:8px;white-space:nowrap}
/* Les chevrons sont des CIBLES TACTILES, pas des caracteres : 32 px de cote, au-dessus du texte qui les entoure.
   Un chevron de la taille d'une lettre est injouable au doigt — exigence transverse mobile du projet. */
.bpg-chevron{min-width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;
  border:0;background:none;cursor:pointer;border-radius:999px;
  font-size:1.15rem;line-height:1;color:var(--color-svv-ink)}
.bpg-chevron:hover:not(:disabled){background:var(--color-svv-field)}
/* ETEINT = GRIS **ET** NON CLIQUABLE. La couleur seule ne dit rien a qui ne la voit pas : l'attribut disabled
   porte l'information pour le clavier et les lecteurs d'ecran, la couleur ne fait que l'appuyer. */
.bpg-chevron:disabled{color:var(--color-svv-muted);opacity:.45;cursor:default}
`;
