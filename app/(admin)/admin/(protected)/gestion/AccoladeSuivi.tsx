'use client';

import { useEffect, useRef, useState } from 'react';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
import { AIDE_PASTILLE_REPERE, type ComparatifRepere } from '../../../../lib/gestion/repereFenetre';
import { ModaleChangementSuivi, type MailDuRepere } from './ModaleChangementSuivi';

/**
 * ══ 🔴🔴 LOT ACCOLADE-PARTOUT — L'ACCOLADE ROUGE D'UN CHANGEMENT DE SUIVI RÉCURRENT, LE MODÈLE UNIQUE ═════════════════
 *
 * DÉCISION D'ARNO (11/10/2026) : « Ce visuel EXACT, sans aucune retouche graphique, est le modèle unique pour signaler
 * un changement de suivi récurrent […]. Il s'affiche partout où les mails concernés sont listés. »
 *
 * 🔴 CE COMPOSANT EST `LigneRepere` DE LA VUE CONVERSATION, DÉPLACÉ TEL QUEL — même JSX, mêmes classes (`cnv-repere…`),
 * même feuille (`CSS_ACCOLADE_SUIVI`, coupée de `CSS_CONVERSATION` sans un caractère de différence). Seul ce qu'il
 * AFFICHE devient un paramètre : le libellé après « À partir d'ici : », qui, quand, et l'avant / après de son « i ».
 * C'est ce qui le rend identique partout : il n'y a qu'un dessin.
 *
 * ⚠️ IL EST UN `<li>` ET MESURE SON VOISIN : posé dans une liste de mails (`ol`/`ul`), ses deux bras longent le mail
 * d'à côté jusqu'à mi-hauteur. Au-dessus du mail (`dessus`) le voisin est le SUIVANT, en dessous le PRÉCÉDENT.
 */
export function AccoladeSuivi({ cote, libelle, parLibelle, le, comparatif: c, mail, nbMails }: {
  cote: 'dessus' | 'dessous';
  /** Ce qui suit « À partir d'ici : » — « aucun bien », « 25 rue Edith Cavell… », « suivi aussi par ce bien »… */
  libelle: string;
  parLibelle: string | null;
  le: string | null;
  /** L'avant / après du « i ». `null` = on ne sait pas le composer : la pastille ne s'affiche pas. */
  comparatif: ComparatifRepere | null;
  /** Le mail qui ouvre la fenêtre, pour le pied de la modale. */
  mail: MailDuRepere | null;
  nbMails: number;
}) {
  const li = useRef<HTMLLIElement | null>(null);
  const [hauteur, setHauteur] = useState(0);
  const [ouverte, setOuverte] = useState(false);

  /**
   * 🔴 LA HAUTEUR DU MAIL VOISIN, MESURÉE. Au-dessus du mail, le voisin est le SUIVANT ; en dessous, le
   * PRÉCÉDENT. On ne devine pas : on lit ce que le navigateur a disposé.
   */
  useEffect(() => {
    const noeud = li.current;
    if (noeud === null || typeof ResizeObserver !== 'function') return undefined;
    const voisin = (cote === 'dessus' ? noeud.nextElementSibling : noeud.previousElementSibling) as HTMLElement | null;
    if (voisin === null) return undefined;
    const mesurer = (): void => setHauteur(voisin.getBoundingClientRect().height);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(voisin);
    return () => obs.disconnect();
  }, [cote]);

  return (
    <li className={`cnv-repere cnv-repere--${cote}${hauteur > 0 ? ' cnv-repere--mesure' : ''}`} ref={li}
      style={{ ['--cnv-repere-h' as string]: `${Math.round(hauteur)}px` }}>
      {/* LES DEUX BRAS DU CADRE — un seul trait chacun, sans coupure à l'angle, une flèche au bout (voir la feuille). */}
      <span className="cnv-repere-bras cnv-repere-bras--gauche" aria-hidden="true" />
      <span className="cnv-repere-phrase">
        <span className="cnv-repere-mot">À partir d’ici : {libelle}</span>
        {(parLibelle !== null || le !== null) && (
          <span className="cnv-repere-qui">
            {le !== null && dateHeureComplete(le)}
            {le !== null && parLibelle !== null ? ' · ' : ''}
            {parLibelle}
          </span>
        )}
        {/* LA PASTILLE « i » : un vrai bouton, ouvert au clic (et Entrée / Espace). Le survol ne fait que la nommer. */}
        {c !== null && (
          <button type="button" className="cnv-repere-i" aria-haspopup="dialog" aria-expanded={ouverte}
            title={AIDE_PASTILLE_REPERE} aria-label={AIDE_PASTILLE_REPERE}
            onClick={() => setOuverte(true)}>
            <span aria-hidden="true">i</span>
          </button>
        )}
        {/* ⚠️ LA MODALE EST RENDUE DANS LA LIGNE, mais son voile est `position:fixed` : centrée sur l'ÉCRAN. */}
        {c !== null && ouverte && (
          <ModaleChangementSuivi comparatif={c} mail={mail} nbMails={nbMails}
            onFermer={() => setOuverte(false)} />
        )}
      </span>
      <span className="cnv-repere-bras cnv-repere-bras--droite" aria-hidden="true" />
    </li>
  );
}

/* ⚠️ COUPE TELLE QUELLE DE CSS_CONVERSATION (lot ACCOLADE-PARTOUT) : aucune retouche graphique. */
export const CSS_ACCOLADE_SUIVI = `
/* ══ 🔴🔴 LE REPERE ENCADRE SON MAIL — UN SEUL TRAIT PAR COTE, ANGLES ARRONDIS ═══════════════════════════════════
   Demande d'Arno (lot VISUALISER-MAIL-ET-REPERE-FENETRE, puis BROUILLON-REPONSE-ET-REPERE) : « phrase en ROUGE,
   CENTREE ; de chaque cote part un lisere rouge fin, qui longe le mail concerne et s'arrete a MI-HAUTEUR de la
   ligne de ce mail », et « lisere CONTINU, sans coupure aux angles, avec des angles ARRONDIS ».

   🔴 CHAQUE BRAS EST UNE SEULE BOITE, et c'est ce qui supprime la coupure. Elle porte DEUX bordures — celle du
   haut (ou du bas) et celle du cote — plus un rayon sur l'angle qui les joint : le trait est continu PAR
   CONSTRUCTION, et arrondi. La version d'avant dessinait quatre traits independants, et il restait un decroche
   d'un pixel au coin, visible a l'oeil.

   🔴 LES BRAS NE PESENT RIEN DANS LA MISE EN PAGE : hauteur zero, et c'est leur ::before qui deborde. Sans cela,
   une boite de la moitie de la hauteur d'un mail deplie ferait une ligne de repere haute de plusieurs centimetres.

   ⚠️ LE SENS SUIT LE COTE : au-dessus du mail le trait DESCEND (bordure du haut, boite vers le bas), en dessous
   il MONTE. Un seul dessin aurait encadre le mauvais mail dans l'un des deux tris.

   ⚠️ --cnv-repere-h PORTE LA HAUTEUR MESUREE DU MAIL (voir le ResizeObserver de LigneRepere) : un mail deplie
   fait dix fois la hauteur d'un mail replie, et une valeur figee aurait trace un trait trop court ou debordant.

   ⚠️ COULEUR : var(--color-svv-red), un JETON — lisible en Clair comme en Sombre, jamais une couleur en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
/* 🔴 LE REPERE SE SERRE : il remplace un trait de 1 px, il ne vient pas s'ajouter a lui. Les marges d'avant
   (.6rem / .4rem) creusaient un trou la ou il n'y avait qu'une ligne. */
.cnv-repere{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
  margin:.1rem 0;padding:0;list-style:none;--cnv-repere-h:0px}
.cnv-repere-phrase{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:.2rem .5rem;
  padding:0 .6rem;text-align:center;min-width:0}
/* 🔴 LA PHRASE EST ROUGE, et le reste de la mention la suit en plus discret : c'est une seule information. */
.cnv-repere-mot{font-size:.76rem;font-weight:700;letter-spacing:.01em;color:var(--color-svv-red);
  overflow-wrap:anywhere}
.cnv-repere-qui{font-size:.72rem;color:var(--color-svv-red);opacity:.75}
/* 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — LA PASTILLE "i" EST UN BOUTON, et elle OUVRE une fenetre.
   Meme dessin que la pastille des biens (.ifb-pastille), au rouge du repere pres : c'est la meme promesse ("il y a
   plus a lire ici"), donc le meme objet a l'oeil. Elle n'est plus une bulle au survol : voir ModaleChangementSuivi. */
.cnv-repere-i{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;
  margin:0 0 0 .1rem;font:inherit;font-size:.68rem;font-weight:700;font-style:italic;line-height:1;
  color:var(--color-svv-red);background:transparent;border:1px solid var(--color-svv-red);border-radius:50%;
  cursor:pointer;flex:0 0 auto;opacity:.8}
.cnv-repere-i:hover{opacity:1}
.cnv-repere-i:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;opacity:1}
/* ⚠️ CIBLE TACTILE : 24 px au doigt, comme partout dans le module. */
@media (pointer:coarse){.cnv-repere-i{width:24px;height:24px;font-size:.78rem}}
/* Les bras : hauteur zero dans la grille, le trace vit dans leur ::before. */
.cnv-repere-bras{position:relative;height:0;min-width:0}
.cnv-repere-bras::before{content:"";position:absolute;left:0;right:0;
  height:calc(var(--cnv-repere-h) / 2);border:0 solid var(--color-svv-red)}
/* AU-DESSUS DU MAIL : le trait part de la phrase et DESCEND le long du mail. */
.cnv-repere--dessus .cnv-repere-bras::before{top:0;border-top-width:1px}
.cnv-repere--dessus .cnv-repere-bras--gauche::before{border-left-width:1px;border-top-left-radius:10px}
.cnv-repere--dessus .cnv-repere-bras--droite::before{border-right-width:1px;border-top-right-radius:10px}
/* EN DESSOUS DU MAIL : le trait part de la phrase et MONTE le long du mail. */
.cnv-repere--dessous .cnv-repere-bras::before{bottom:0;border-bottom-width:1px}
.cnv-repere--dessous .cnv-repere-bras--gauche::before{border-left-width:1px;border-bottom-left-radius:10px}
.cnv-repere--dessous .cnv-repere-bras--droite::before{border-right-width:1px;border-bottom-right-radius:10px}
/* ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 3 — UNE PETITE FLECHE AU BOUT DE CHAQUE BRANCHE ═════════════
   Demande d'Arno (04/10/2026) : « tout reste identique. Ajoute seulement une petite fleche rouge a l'extremite de
   chaque branche (gauche et droite), qui pointe vers le cote de la conversation concerne par le changement. Les
   fleches suivent l'ordre d'affichage : elles s'inversent avec Plus recent d'abord / Plus ancien d'abord. »

   🔴 LES FLECHES NE CONNAISSENT PAS LE TRI, ET C'EST TOUT L'INTERET. Elles pendent des memes variantes --dessus /
   --dessous que le trace, et c'est deja coteDuRepere(ordre) qui decide de ce cote : l'inversion est donc acquise
   PAR CONSTRUCTION. Une seconde regle qui aurait relu l'ordre d'affichage aurait fait une deuxieme verite a tenir,
   et le point 4 de ce meme lot dit assez ce que deux verites coutent (la modale disait le contraire de la liste).

   🔴 LA FLECHE POINTE DANS LE SENS OU LA BRANCHE VA : vers le BAS quand le repere est au-dessus du mail (sa
   branche descend le long de ce mail), vers le HAUT quand il est en dessous. C'est donc toujours le mail concerne
   par le changement qu'elle designe, dans les deux tris, sans cas particulier.

   LE DESSIN : le triangle CSS — une boite de taille nulle, quatre bordures transparentes, une seule coloree. Le
   ::before du bras portant deja le trace de la branche, c'est son ::after qui porte la pointe.

   ⚠️ LA POINTE TOMBE EXACTEMENT AU BOUT DU TRAIT. Un triangle de bordure a son sommet au CENTRE de la boite, pas
   sur son bord : la boite commence donc 5 px (sa demi-taille) avant la mi-hauteur du mail. Sans ce retrait, la
   fleche depassait la branche de 5 px.
   ⚠️ ELLE EST CENTREE SUR LE TRAIT D'1 PX : -4,5 px, soit la demi-largeur du triangle moins la demi-bordure. A
   gauche on compte depuis le bord gauche du bras, a droite depuis son bord droit — d'ou les deux regles.

   ⚠️ ET CE CENTRAGE DEBORDE DE 4,5 PX DE CHAQUE COTE DE LA COLONNE, c'est assume et c'est mesure. Un trait pose
   sur le bord d'une boite ne peut pas porter une pointe SYMETRIQUE sans la depasser d'une demi-largeur : la seule
   autre facon etait de rentrer la fleche de 5 px, et a l'ecran elle se lit alors comme un fanion accroche a cote
   du trait, plus comme une pointe. Mesure sur le fil 3490 (fleche seule, retiree puis remise) : la colonne passe
   de 1232 a 1237 px de contenu, et la PAGE ne defile pas pour autant (scrollWidth = clientWidth = 1512). En
   largeur telephone, le debordement mesure est le MEME avec et sans la fleche : elle n'en ajoute aucun.
   ⚠️ ELLE N'APPARAIT QU'AVEC SA BRANCHE (.cnv-repere--mesure) : voir le commentaire du JSX.
   ⚠️ COULEUR : var(--color-svv-red), le MEME jeton que le trace — lisible en Clair comme en Sombre, jamais une
   couleur en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.cnv-repere-bras::after{content:"";position:absolute;width:0;height:0;border:5px solid transparent}
.cnv-repere--mesure.cnv-repere--dessus .cnv-repere-bras::after{top:calc(var(--cnv-repere-h) / 2 - 5px);
  border-top-color:var(--color-svv-red)}
.cnv-repere--mesure.cnv-repere--dessous .cnv-repere-bras::after{bottom:calc(var(--cnv-repere-h) / 2 - 5px);
  border-bottom-color:var(--color-svv-red)}
.cnv-repere-bras--gauche::after{left:-4.5px}
.cnv-repere-bras--droite::after{right:-4.5px}
`;
