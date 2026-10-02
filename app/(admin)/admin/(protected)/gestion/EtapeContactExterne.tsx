'use client';

import { useState } from 'react';
import {
  basculerEtape2, clePersonne, etape2Validable, libelleContactExterne, motRoleInstantane, motTypeContact,
  ordonnerEtape2, suiviContactRecu, tonRoleInstantane,
  BIEN_UNIQUEMENT, BIEN_UNIQUEMENT_AIDE, CHOIX_ETAPE2_VIDE, CHOIX_SUIVI_CONTACT, LIEN_ANCIENS_LOCATAIRES,
  SUIVI_CONTACT_DEFAUT, TITRE_ETAPE2, TITRE_INTERVIENT, TITRE_LOCATAIRES, TITRE_PROPRIETAIRES, TITRE_SUIVI,
  TYPES_CONTACT_EXTERNE,
  type ChoixEtape2, type PersonneEtape2, type SuiviContact, type TypeContactExterne,
} from '../../../../lib/gestion/contactExterne';
// ⚠️ `import type` SEULEMENT : ce dépôt tire `pg`, et un composant client qui l'importerait vraiment ferait
//   refuser le bundle (garde de graphe `clientBoundary.guard.test.ts`, incident du 24/09/2026).
import type { BienEtape2, ReponseEtape2 } from '../../../../lib/gestion/contactExterneRepo';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — L'ÉTAPE 2 : « CLASSER CE NOUVEAU CONTACT » ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (02/10/2026), et c'est sa maquette : « En tête : adresse et type du bien. Si plusieurs biens sont
 * cochés, une section par bien. “Ce contact intervient pour :” → “Le bien uniquement” (sous-titre « Artisan,
 * syndic, expert… aucune personne spécifique ») ; PROPRIÉTAIRE(S) ; LOCATAIRE(S) avec leur pastille de statut
 * CALCULÉE À LA DATE DE RÉCEPTION DU MAIL. Puis “Suivi des prochains échanges” (deux choix). Au bas : “Contact
 * externe : <adresse>”, plus les champs FACULTATIFS nom, téléphone et type. Bouton “Valider” en rouge. »
 *
 * ET : « Objectif : 2 à 3 gestes après le choix du bien. »
 *
 * ═══ 🔴 CE QUE CET ÉCRAN NE DÉCIDE PAS, ET C'EST PRESQUE TOUT ═══════════════════════════════════════════════════
 *
 * Il PLACE et il PEINT. Les mots (« Locataire occupant », « Locataire sortant », « Le bien uniquement »),
 * l'ORDRE (propriétaires actifs, occupants, dernier sortant, puis le dépliage), l'EXCLUSIVITÉ et la condition de
 * « Valider » viennent tous du module PUR `contactExterne.ts`. Rien n'est réécrit ici — une seconde décision
 * côté écran divergerait de la première au premier ajustement, et c'est celle qu'on regarde le moins qui
 * garderait l'erreur.
 *
 * ⚠️ IL N'ÉCRIT RIEN EN BASE. Il rend un CHOIX à son appelant (`onValider`), qui le pose par la porte qui existe
 * déjà — `POST /api/admin/gestion/suivi`, avec son journal, son auteur et ses périodes. Mêler les deux ici ferait
 * de cet écran un second chemin d'écriture, à côté des routes existantes.
 *
 * ⚠️ MOBILE D'ABORD (exigence transverse §15) : à 390 px chaque section occupe la largeur, les cases font 44 px
 * de cible, et AUCUNE action ne dépend du survol. La liste des personnes défile dans son bloc plutôt que de
 * pousser le pied hors de l'écran — c'est la leçon du lot MODALE-SUIVI-ET-DEFILEMENT (« Valider » coupé en bas).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que l'étape rend à son appelant quand on valide. */
export interface ValidationEtape2 {
  /** Les personnes cochées, prêtes pour le `classement.personnes` de la route du suivi. */
  personnes: { sorte: 'proprietaire' | 'locataire'; cle: string; libelle: string }[];
  /** VRAI quand « Le bien uniquement » est coché : aucune relation vers une personne. */
  bienUniquement: boolean;
  /** Le choix de suivi, quand les deux choix étaient affichés. `null` = ils ne l'étaient pas. */
  suivi: SuiviContact | null;
  /** Les trois champs FACULTATIFS du contact externe. Jamais bloquants. */
  contact: { nom: string; telephone: string; type: TypeContactExterne | null };
}

export function EtapeContactExterne({
  data, occupe = false, erreur = null, onRetour, onValider,
}: {
  data: ReponseEtape2;
  occupe?: boolean;
  erreur?: string | null;
  /** « ← Retour » vers l'étape 1 — et elle GARDE les cases cochées (c'est l'appelant qui les lui rend). */
  onRetour: () => void;
  onValider: (v: ValidationEtape2) => void | Promise<void>;
}) {
  /**
   * 🔴 « Rien de pré-coché à la première fois » (Arno). La pré-coche ne vient donc QUE du serveur, et seulement
   * quand cette conversation a déjà classé un contact (`precoche`) — c'est le « Classement ponctuel » qui
   * propose la dernière configuration au mail suivant.
   */
  const [choix, setChoix] = useState<ChoixEtape2>(
    data.precoche === null
      ? CHOIX_ETAPE2_VIDE
      : { bienUniquement: data.precoche.bienUniquement, personnes: data.precoche.personnes },
  );
  const [suivi, setSuivi] = useState<SuiviContact>(
    data.precoche === null ? SUIVI_CONTACT_DEFAUT : suiviContactRecu(data.precoche.suivi),
  );
  /** 🔴 LES TROIS CHAMPS SONT PRÉ-REMPLIS QUAND L'ADRESSE EST DÉJÀ UN CONTACT CONNU (demande d'Arno). */
  const [nom, setNom] = useState<string>(data.contact?.nom ?? data.expediteurNom ?? '');
  const [telephone, setTelephone] = useState<string>(data.contact?.telephone ?? '');
  const [type, setType] = useState<TypeContactExterne | ''>(data.contact?.type ?? '');
  /** Le dépliage des anciens locataires, par bien : déplier l'un ne déplie pas les autres. */
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  /** Tous les libellés, pour composer `personnes` à la validation sans les redemander au serveur. */
  const parCle = new Map<string, PersonneEtape2>();
  for (const b of data.biens) for (const p of b.personnes) parCle.set(clePersonne(p), p);

  const validable = etape2Validable(choix);

  const valider = (): void => {
    if (!validable || occupe) return;
    void onValider({
      personnes: choix.bienUniquement ? [] : choix.personnes.flatMap((k) => {
        const p = parCle.get(k);
        return p === undefined ? [] : [{ sorte: p.sorte, cle: p.cle, libelle: p.nom }];
      }),
      bienUniquement: choix.bienUniquement,
      // 🔴 LES DEUX CHOIX NE COMPTENT QUE S'ILS ÉTAIENT AFFICHÉS : sinon c'est la conversation qui décide, et
      //   l'appelant garde la main (bloc à 3 choix existant, inchangé).
      suivi: data.premierClassement ? suivi : null,
      contact: { nom: nom.trim(), telephone: telephone.trim(), type: type === '' ? null : type },
    });
  };

  return (
    <div className="ece-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onRetour(); }}>
      <style>{CSS_ETAPE_CONTACT}</style>
      {/* 🔴 LE MÊME CADRE QUE L'ÉTAPE 1 (`rec`), au pixel près : c'est « la même modale », pas une seconde
          fenêtre par-dessus. Arno : « dans le même cadre », « esthétique de la modale actuelle ». */}
      <div className="ece" role="dialog" aria-modal="true" aria-labelledby="ece-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onRetour(); } }}>
        {/* ⚠️ PAS DE CROIX ICI, ET C'EST VOULU : à cette étape, la sortie nommée est « ← Retour ». Une croix
            laisserait croire qu'on peut classer le bien en sautant l'étape, alors que le geste n'est pas fini. */}
        {/* ⚠️ SA PROPRE CLASSE DE TITRE, et non `.mrt-titre` : cette feuille-là vit ailleurs, et l'étape 2 peut
            s'afficher alors que l'étape 1 est démontée — donc sa feuille avec. C'est exactement le défaut vu le
            30/09/2026 sur la fenêtre de rédaction : une classe écrite et jamais appliquée. */}
        <h2 className="ece-titre" id="ece-titre">{TITRE_ETAPE2}</h2>

        <div className="ece-corps">
          {/* ══ 🔴🔴 CE QUI MANQUE ENCORE À LA BASE, DIT AVANT DE CHOISIR ═══════════════════════════════════
              ⚠️ EN TÊTE, PAS EN PIED, et avant le premier geste : prévenir après avoir fait choisir serait une
              mauvaise surprise. Le classement du BIEN, lui, est enregistré dans tous les cas — c'est la règle
              n° 1 du lot : ne rien casser. */}
          {!data.disponible && (
            <p className="ece-avis" role="status">
              Mise à jour de la base à appliquer (293) : le classement du bien sera enregistré,
              les relations aux personnes ne le seront pas encore.
            </p>
          )}

          <p className="ece-intro">
            Cette adresse n’est connue d’aucune fiche des biens choisis.
            {data.dateMail !== null && <> Les statuts ci-dessous sont ceux du <strong>{dateFr(data.dateMail)}</strong>,
              date de réception du mail.</>}
          </p>

          <p className="ece-sous-titre">{TITRE_INTERVIENT}</p>

          {/* ══ 🔴 « LE BIEN UNIQUEMENT » — EXCLUSIF, ET EN PREMIER ════════════════════════════════════════
              Il est au-dessus des personnes parce que c'est la réponse la plus fréquente (un artisan, un
              syndic), et parce qu'un seul geste doit suffire quand c'est elle. */}
          <label className="ece-carte ece-exclusif">
            <input type="checkbox" checked={choix.bienUniquement}
              onChange={() => setChoix((c) => basculerEtape2(c, null))} />
            <span className="ece-corps">
              <span className="ece-mot">{BIEN_UNIQUEMENT}</span>
              <span className="ece-aide">{BIEN_UNIQUEMENT_AIDE}</span>
            </span>
          </label>

          {/* ══ 🔴 UNE SECTION PAR BIEN (demande d'Arno), avec son adresse et son type en tête ═════════════ */}
          {data.biens.map((b) => (
            <SectionBien key={b.cle} bien={b} choix={choix}
              /** ⚠️ PLUSIEURS BIENS ⇒ ON LE DIT. Avec un seul, un titre de bien serait du bruit : l'en-tête
                  de la modale et l'étape 1 disent déjà de quel logement il s'agit. */
              avecTitre={data.biens.length > 1}
              deplie={deplies.has(b.cle)}
              onDeplier={() => setDeplies((s) => new Set(s).add(b.cle))}
              onBasculer={(cle) => setChoix((c) => basculerEtape2(c, cle))} />
          ))}

          {/* ══ 🔴🔴 « SUIVI DES PROCHAINS ÉCHANGES » — SEULEMENT AU PREMIER CLASSEMENT DE CE CONTACT ══════
              Demande d'Arno : « Les 2 choix de l'étape 2 ne s'affichent qu'au PREMIER classement de ce contact
              externe dans cette conversation. » Ensuite, c'est le bloc à 3 choix existant qui arbitre la portée
              d'un changement — et il est inchangé. */}
          {data.premierClassement && (
            <fieldset className="ece-bloc">
              <legend className="ece-sous-titre">{TITRE_SUIVI}</legend>
              {CHOIX_SUIVI_CONTACT.map((c) => (
                <label className="ece-choix" key={c.cle}>
                  <input type="radio" name="ece-suivi" checked={suivi === c.cle}
                    onChange={() => setSuivi(c.cle)} />
                  <span className="ece-corps">
                    <span className="ece-mot">{c.mot}</span>
                    {/* 🔴 UNE PHRASE D'AIDE SOUS CHAQUE CHOIX, EN FRANÇAIS SIMPLE — la même règle que le bloc
                        « Suivi dans la conversation » : c'est la phrase qui fait le choix, pas le titre. */}
                    <span className="ece-aide">{c.aide}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {/* ══ 🔴 LE CONTACT EXTERNE : SON ADRESSE, ET TROIS CHAMPS QUI NE BLOQUENT JAMAIS ════════════════ */}
          <fieldset className="ece-bloc">
            <legend className="ece-sous-titre">{libelleContactExterne(data.expediteur)}</legend>
            <p className="ece-aide ece-aide--bloc">
              Facultatif, et jamais bloquant. Ce contact ne devient ni propriétaire ni locataire :
              il n’est ajouté à aucune fiche.
            </p>
            <div className="ece-champs">
              <label className="ece-champ">
                <span className="ece-libelle">Nom</span>
                <input className="ece-saisie" type="text" value={nom} maxLength={200} autoComplete="off"
                  placeholder="ex. « Me Martin »" onChange={(e) => setNom(e.target.value)} />
              </label>
              <label className="ece-champ">
                <span className="ece-libelle">Téléphone</span>
                <input className="ece-saisie" type="tel" value={telephone} maxLength={60} autoComplete="off"
                  placeholder="ex. « 01 45 00 00 00 »" onChange={(e) => setTelephone(e.target.value)} />
              </label>
              <label className="ece-champ">
                <span className="ece-libelle">Type</span>
                <select className="ece-saisie" value={type}
                  onChange={(e) => setType(e.target.value as TypeContactExterne | '')}>
                  <option value="">—</option>
                  {TYPES_CONTACT_EXTERNE.map((t) => (
                    <option key={t} value={t}>{motTypeContact(t)}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        </div>

        <div className="ece-pied">
          {/* 🔴 LE MOTIF DU BLOCAGE SE LIT, il ne se survole pas : au doigt, une infobulle n'existe pas
              (exigence transverse du dépôt). */}
          {!validable && (
            <p className="ece-bloque" role="status">
              Choisissez « {BIEN_UNIQUEMENT} » ou au moins une personne.
            </p>
          )}
          {erreur !== null && <p className="ece-bloque" role="alert">{erreur}</p>}
          {/* 🔴 « ← Retour » VERS L'ÉTAPE 1, QUI GARDE LES CASES COCHÉES (demande d'Arno). En gris : c'est le
              geste secondaire. */}
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe}
            onClick={onRetour}>← Retour</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn"
            disabled={!validable || occupe} onClick={valider}>
            {occupe ? 'Enregistrement…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ══ 🔴 UNE SECTION DE BIEN : SON EN-TÊTE, SES PROPRIÉTAIRES, SES LOCATAIRES ═══════════════════════════════════
 *
 * ⚠️ L'ORDRE ET LE DÉPLIAGE VIENNENT DU MODULE PUR (`ordonnerEtape2`). Cet écran ne trie rien : il rend deux
 * listes déjà décidées, et le lien entre les deux.
 */
function SectionBien({ bien, choix, avecTitre, deplie, onDeplier, onBasculer }: {
  bien: BienEtape2;
  choix: ChoixEtape2;
  avecTitre: boolean;
  deplie: boolean;
  onDeplier: () => void;
  onBasculer: (cle: string) => void;
}) {
  const { visibles, repliees } = ordonnerEtape2(bien.personnes);
  const proprios = visibles.filter((p) => p.sorte === 'proprietaire');
  const locataires = visibles.filter((p) => p.sorte === 'locataire');
  /** ⚠️ CE QUI EST DÉPLIÉ EST RANGÉ PAR SORTE AUSSI : un ancien propriétaire ne se cherche pas sous « locataires ». */
  const repliesProprios = repliees.filter((p) => p.sorte === 'proprietaire');
  const repliesLocataires = repliees.filter((p) => p.sorte === 'locataire');

  const ligne = (p: PersonneEtape2) => (
    <Personne key={clePersonne(p)} p={p} coche={choix.personnes.includes(clePersonne(p))}
      onBasculer={() => onBasculer(clePersonne(p))} />
  );

  return (
    <section className="ece-bloc" aria-label={`Personnes de ${bien.adresseComplete}`}>
      {/* 🔴 « adresse et type du bien » (Arno) : les deux, côte à côte, et la nature WIPPIMMO telle quelle. */}
      {avecTitre && (
        <p className="ece-bien">
          <span className="ece-bien-adresse">{bien.adresseComplete}</span>
          {typeDuBien(bien) !== '' && <span className="ece-bien-type">{typeDuBien(bien)}</span>}
        </p>
      )}

      {proprios.length + repliesProprios.length > 0 && (
        <>
          <p className="ece-groupe">{TITRE_PROPRIETAIRES}</p>
          <ul className="ece-liste">{proprios.map(ligne)}</ul>
        </>
      )}

      {locataires.length + repliesLocataires.length > 0 && (
        <>
          <p className="ece-groupe">{TITRE_LOCATAIRES}</p>
          <ul className="ece-liste">{locataires.map(ligne)}</ul>
        </>
      )}

      {/* ══ 🔴 « Voir tous les anciens locataires… » — LES MOTS D'ARNO, AU CARACTÈRE PRÈS ═══════════════════
          ⚠️ IL DIT COMBIEN IL CACHE : un lien qui n'annonce pas sa récolte ne se clique pas. (Et c'est la même
          règle que « voir plus (N) » de l'encart des biens.) */}
      {repliees.length > 0 && !deplie && (
        <button type="button" className="gst-lien-bouton ece-deplier" onClick={onDeplier}>
          {LIEN_ANCIENS_LOCATAIRES} ({repliees.length})
        </button>
      )}
      {repliees.length > 0 && deplie && (
        <>
          {repliesLocataires.length > 0 && <ul className="ece-liste">{repliesLocataires.map(ligne)}</ul>}
          {repliesProprios.length > 0 && (
            <>
              <p className="ece-groupe">ANCIEN(S) PROPRIÉTAIRE(S)</p>
              <ul className="ece-liste">{repliesProprios.map(ligne)}</ul>
            </>
          )}
        </>
      )}

      {bien.personnes.length === 0 && (
        <p className="ece-aide ece-aide--bloc">
          Aucune personne connue sur ce bien à ce jour — « {BIEN_UNIQUEMENT} » est la seule réponse possible.
        </p>
      )}
    </section>
  );
}

/** Une personne, sa case et sa pastille. Le MOT porte l'information, le ton ne fait que l'appuyer. */
function Personne({ p, coche, onBasculer }: {
  p: PersonneEtape2; coche: boolean; onBasculer: () => void;
}) {
  const periode = motOccupation(p);
  return (
    <li className="ece-item">
      <label className="ece-carte">
        <input type="checkbox" checked={coche} onChange={onBasculer} />
        <span className="ece-corps">
          <span className="ece-nom">
            {(p.civilite ?? '').trim() !== '' && <span className="ece-civ">{p.civilite}</span>}
            {p.nom}
          </span>
          <span className="ece-pastilles">
            <span className={`ece-pastille ece-pastille--${tonRoleInstantane(p.role)}`}>
              {motRoleInstantane(p.role)}
            </span>
            {p.actif === false && <span className="ece-pastille ece-pastille--gris">Ancien</span>}
            {periode !== null && <span className="ece-periode">{periode}</span>}
          </span>
        </span>
      </label>
    </li>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES PETITS MOTS DE CET ÉCRAN — ils ne décident rien, ils mettent en forme
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une date ISO en date française. ⚠️ Aucun `new Date` : un jour civil ne passe pas par un fuseau. PUR. */
export function dateFr(iso: string | null): string {
  if (iso === null) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? iso : `${m[3]}/${m[2]}/${m[1]}`;
}

/** La période d'occupation, dite en clair. `null` quand l'export ne donne aucune borne. PUR. */
export function motOccupation(p: PersonneEtape2): string | null {
  const d = (p.entree ?? '').trim();
  const f = (p.sortie ?? '').trim();
  if (d === '' && f === '') return null;
  if (f === '') return `depuis le ${dateFr(d)}`;
  if (d === '') return `jusqu’au ${dateFr(f)}`;
  return `du ${dateFr(d)} au ${dateFr(f)}`;
}

/** Le type du bien : la nature WIPPIMMO et le type, sans doublon ni tiret muet. PUR. */
export function typeDuBien(b: Pick<BienEtape2, 'nature' | 'typeBien'>): string {
  const bouts = [(b.nature ?? '').trim(), (b.typeBien ?? '').trim()].filter((x) => x !== '');
  return [...new Set(bouts)].join(' — ');
}

export const CSS_ETAPE_CONTACT = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne douze fois dans ce depot).

   ══ 🔴🔴 CETTE FEUILLE EST AUTOSUFFISANTE, ET CE N'EST PAS DE LA REDONDANCE ════════════════════════════════════
   L'etape 2 s'affiche alors que l'etape 1 est DEMONTEE, donc sa feuille (CSS_RATTACHER_EN_ECRIVANT) avec. On ne
   peut donc compter sur AUCUNE de ses classes : .rec-voile, .rec, .rec-corps, .rec-pied, .mrt-titre, .mrt-pied
   seraient ecrites et jamais appliquees. C'est exactement le defaut vu a l'ecran le 30/09/2026 sur la fenetre de
   redaction — une modale ouverte DANS un cadre de 494 px, derriere lui.
   🔴 LES VALEURS SONT LES MEMES QUE CELLES DE L'ETAPE 1, AU PIXEL : meme largeur (680), meme rayon (12), meme
   voile (45 % d'encre), meme hauteur bornee (92vh et 100dvh - 32). Arno demande « le meme cadre » ; il l'est a la
   mesure, pas par heritage. */
.ece-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
  padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);overflow-y:auto}
.ece{position:relative;max-width:680px;width:min(680px, 96vw);background:var(--color-svv-field);
  color:var(--color-svv-ink);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);
  display:flex;flex-direction:column;max-height:min(92vh, calc(100dvh - 32px));overflow:hidden}
/* ⚠️ min-height:0 SUR LE CORPS EST OBLIGATOIRE : sans lui, un enfant flex refuse de retrecir sous sa hauteur
   naturelle, le corps garde sa taille entiere et le pied repart hors cadre — « Valider » coupe en bas, le defaut
   corrige au lot MODALE-SUIVI-ET-DEFILEMENT. Seul le MILIEU defile. */
.ece-titre{margin:0 0 .6rem;font-size:1.02rem;font-weight:700;color:var(--color-svv-ink);flex:0 0 auto}
.ece-corps{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.ece-pied{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:.5rem;margin-top:.8rem;
  flex:0 0 auto}
.ece-bloque{flex:1 1 100%;margin:0;font-size:.82rem;font-weight:600;color:var(--color-svv-red)}
/* 🔴 LE VOILE D'ATTENTE, entre l'etape 1 qui se demonte et l'etape 2 qui se monte : le MEME cadre, une phrase,
   et surtout pas un ecran nu. Il ne porte aucune hauteur bornee — il n'a qu'une ligne a montrer. */
.ece--attente{max-height:none}
.ece-attente{margin:0;font-size:.88rem;color:var(--color-svv-ink)}

/* 🔴 CE QUI MANQUE A LA BASE SE LIT EN TETE, et le liseret n'est qu'un renfort : le MOT porte l'information. */
.ece-avis{margin:0 0 .6rem;padding:8px 10px;border-radius:0 .5rem .5rem 0;
  border-left:3px solid var(--color-svv-amber);background:var(--color-svv-amber-soft);
  color:var(--color-svv-ink);font-size:.82rem;line-height:1.4}
.ece-intro{margin:0 0 .7rem;font-size:.84rem;line-height:1.45;color:var(--color-svv-muted)}
.ece-sous-titre{margin:0 0 .4rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}

/* ══ LES BLOCS : des CARTES BLANCHES a bordure fine, comme la modale de l'etape 1 (demande d'Arno) ══════════ */
.ece-bloc{margin:0 0 10px;padding:10px 12px;background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.7rem;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:0}
.ece-groupe{margin:.5rem 0 .25rem;font-size:.68rem;font-weight:700;letter-spacing:.03em;
  color:var(--color-svv-muted)}
.ece-groupe:first-child{margin-top:0}
/* L'en-tete d'un bien : son adresse, puis son type. Les deux se lisent, aucun ne se tronque au point d'etre faux. */
.ece-bien{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .5rem;margin:0 0 .4rem;min-width:0}
.ece-bien-adresse{font-size:.86rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ece-bien-type{font-size:.76rem;color:var(--color-svv-muted)}

.ece-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.ece-item{min-width:0}
/* CIBLE TACTILE : la ligne entiere est cliquable, et la case ne descend pas sous 44 px de hauteur totale. */
.ece-carte{display:flex;align-items:flex-start;gap:.55rem;padding:7px 9px;min-height:44px;cursor:pointer;
  border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-field);min-width:0}
.ece-carte:hover{border-color:var(--color-svv-line-strong)}
.ece-carte:focus-within{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* 🔴 « Le bien uniquement » EST EXCLUSIF, et il se voit : il vit hors des sections, en pleine largeur. */
.ece-exclusif{margin:0 0 10px;background:var(--color-svv-surface)}
.ece-corps{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.ece-mot{font-size:.86rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ece-nom{font-size:.86rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ece-civ{font-size:.74rem;font-weight:400;color:var(--color-svv-muted);margin-right:.3rem}
.ece-aide{font-size:.76rem;line-height:1.35;color:var(--color-svv-muted)}
.ece-aide--bloc{margin:0 0 .5rem}
.ece-pastilles{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0}
.ece-periode{font-size:.72rem;color:var(--color-svv-muted)}

/* ══ LES PASTILLES DE STATUT — les MOTS d'Arno, et un ton qui les appuie ════════════════════════════════════
   « Locataire occupant » (vert), « Locataire sortant » (rouge). Le mot est ecrit en entier : un daltonien lit la
   meme chose que tout le monde, et la couleur ne lui cache rien. Regle du module depuis la premiere capsule. */
.ece-pastille{font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .5rem;
  border:1px solid transparent;flex:0 0 auto;white-space:nowrap}
.ece-pastille--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);
  border-color:var(--color-svv-green-soft)}
.ece-pastille--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);
  border-color:var(--color-svv-red-soft)}
.ece-pastille--gris{background:var(--color-svv-field);color:var(--color-svv-muted);
  border-color:var(--color-svv-line)}

.ece-deplier{font-weight:600;margin-top:.3rem}
.ece-choix{display:flex;align-items:flex-start;gap:.55rem;min-height:40px;padding:3px 0;cursor:pointer}

/* ══ LES TROIS CHAMPS FACULTATIFS — en rangee quand la place suffit, empiles sur un telephone ═══════════════ */
.ece-champs{display:flex;flex-wrap:wrap;gap:.5rem .6rem;min-width:0}
.ece-champ{display:flex;flex-direction:column;gap:.2rem;flex:1 1 11rem;min-width:0}
.ece-libelle{font-size:.72rem;font-weight:700;letter-spacing:.02em;color:var(--color-svv-muted)}
.ece-saisie{min-height:40px;padding:.35rem .5rem;font:inherit;font-size:.88rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.45rem;
  min-width:0;width:100%}
.ece-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

@media (max-width:520px){
  .ece{width:100%;max-width:100%}
  .ece-champ{flex:1 1 100%}
  /* Sur un telephone, les deux boutons prennent toute la largeur, l'un sous l'autre : deux pavés de 44 px
     cote a cote sous 520 px deviennent intouchables au pouce. */
  .ece-pied>.svv-btn{flex:1 1 100%}
}
`;
