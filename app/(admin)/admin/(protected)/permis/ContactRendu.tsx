import type { CSSProperties } from 'react';
import type { CanalContact } from '../../../../lib/sitadel/mairieContact';
import { CANAUX_ORDONNES, AIDE_CANAL, MENTION_TELESERVICE, EMAIL_TYPES, MENTION_ACCUEIL, problemeUrlOuverture, origineContact, originePrada, libelleEmailType, libelleStatut, libelleSource, libelleCanal, type FicheCommune } from './contactForm';

/**
 * Rendu PUR du sélecteur de canal de l'éditeur de contact mairie — aucun état, aucun effet → testable en Node via
 * `renderToStaticMarkup`. Options par préférence décroissante (téléservice → e-mail → courrier → inconnu), mention de
 * suggestion quand un téléservice est connu, et aide contextuelle (dont la conséquence « courrier/inconnu = 0 demande »).
 */
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };
const styleAide: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 };

/**
 * Champs de PROTOCOLE (S18) : date de dernière vérification en LECTURE SEULE (quand elle existe — un protocole qui date se
 * repère ainsi), + saisies éditables du téléphone et du responsable du service urbanisme. La date est mise à jour
 * automatiquement à l'enregistrement (côté serveur), donc non éditable ici.
 */
export function ChampsProtocole({ telephone, telephoneStandard, responsableNom, protocoleVerifieLe, onTelephone, onTelephoneStandard, onResponsable }: {
  telephone: string; telephoneStandard: string; responsableNom: string; protocoleVerifieLe: string | null;
  onTelephone: (v: string) => void; onTelephoneStandard: (v: string) => void; onResponsable: (v: string) => void;
}) {
  const styleLabel = { ...styleAide, display: 'flex', flexDirection: 'column', gap: '.15rem' } as CSSProperties;
  const styleSaisie = { ...styleChamp, width: '100%', boxSizing: 'border-box' } as CSSProperties;
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0, flex: '1 1 100%' }}>
      {protocoleVerifieLe && (
        <span style={styleAide}>Protocole vérifié le <strong>{protocoleVerifieLe}</strong> (mis à jour automatiquement à l’enregistrement).</span>
      )}
      <label style={styleLabel}>
        Téléphone du service urbanisme
        <input type="tel" value={telephone} placeholder="01 23 45 67 89" onChange={(e) => onTelephone(e.target.value)}
          style={styleSaisie} aria-label="Téléphone du service urbanisme" />
      </label>
      <label style={styleLabel}>
        Standard de la mairie
        <input type="tel" value={telephoneStandard} placeholder="01 23 45 67 00" onChange={(e) => onTelephoneStandard(e.target.value)}
          style={styleSaisie} aria-label="Standard de la mairie" />
      </label>
      <label style={styleLabel}>
        Responsable du service (si publié)
        <input type="text" value={responsableNom} placeholder="Prénom Nom" onChange={(e) => onResponsable(e.target.value)}
          style={styleSaisie} aria-label="Responsable du service" />
      </label>
    </div>
  );
}

/** Sélecteur « Nature de cette adresse » (S19). Mention d'information quand l'adresse est un accueil général (jamais bloquant). */
export function SelecteurEmailType({ emailType, onEmailType }: { emailType: string; onEmailType: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <label style={{ ...styleAide, display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        Nature de cette adresse
        <select value={emailType} onChange={(e) => onEmailType(e.target.value)} style={styleChamp} aria-label="Nature de cette adresse">
          {EMAIL_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {emailType === 'accueil' && <span style={{ ...styleAide, color: 'var(--color-svv-amber)' }}>{MENTION_ACCUEIL}</span>}
    </div>
  );
}

const styleOrigine: CSSProperties = { fontSize: 10, color: 'var(--color-svv-muted)', fontStyle: 'italic' };
const hrefProtocole = (s: string): string => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

/** Une ligne « label : valeur (origine) » de la fiche. Valeur absente → « non renseigné » (jamais un champ vide ambigu). */
function LigneFiche({ label, valeur, origine, lien }: { label: string; valeur: string | null; origine?: string; lien?: boolean }) {
  const vide = (valeur ?? '').trim() === '';
  return (
    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'baseline', fontSize: 12 }}>
      <span style={{ color: 'var(--color-svv-muted)', minWidth: '9rem' }}>{label}</span>
      {vide
        ? <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>non renseigné</span>
        : lien
          ? <a href={hrefProtocole(valeur!)} target="_blank" rel="noopener noreferrer" className="svv-link" style={{ wordBreak: 'break-all' }}>{valeur} ↗</a>
          : <span style={{ wordBreak: 'break-word' }}>{valeur}</span>}
      {!vide && origine && <span style={styleOrigine}>· {origine}</span>}
    </div>
  );
}

/**
 * Bloc LECTURE SEULE « Ce que l'on sait de cette commune » (S21 / S22). MIROIR de ce qui est ENREGISTRÉ EN BASE : le
 * destinataire actuel, le canal, le statut/source, les téléphones et le responsable (les champs éditables, vus côté base),
 * puis l'adresse postale, le protocole et les infos PRADA (annuaire CADA). ⚠️ Cette fiche ne suit JAMAIS l'état d'édition :
 * `fiche` est construite depuis la ligne en base (`construireFiche`), pas depuis le formulaire — éditer un champ ne change
 * aucune valeur affichée ici. Chaque info porte son ORIGINE en TEXTE (jamais la couleur seule). Mobile-first.
 */
export function BlocFicheCommune({ fiche }: { fiche: FicheCommune }) {
  const oc = origineContact(fiche.contactStatut);
  const aPrada = (fiche.pradaCourriel ?? fiche.pradaNom ?? fiche.pradaAdresse) !== null;
  const opr = originePrada(fiche.pradaOrigine, fiche.pradaRapprochement);
  return (
    <section role="group" aria-label="Ce que l'on sait de cette commune" className="svv-card flex flex-col gap-1"
      style={{ flex: '1 1 100%', background: 'var(--color-svv-field)', minWidth: 0 }}>
      <strong style={{ fontSize: 12 }}>Ce que l’on sait de cette commune (lecture seule, état enregistré en base)</strong>
      <LigneFiche label="Destinataire actuel" valeur={fiche.destinataireActuel} origine={oc} />
      <LigneFiche label="Canal enregistré" valeur={fiche.canalEnregistre ? libelleCanal(fiche.canalEnregistre) : null} origine={oc} />
      <LigneFiche label="Statut" valeur={fiche.contactStatut ? libelleStatut(fiche.contactStatut) : null} />
      <LigneFiche label="Source" valeur={fiche.contactSource ? libelleSource(fiche.contactSource) : null} />
      <LigneFiche label="Téléphone du service" valeur={fiche.telephone} origine={oc} />
      <LigneFiche label="Standard de la mairie" valeur={fiche.telephoneStandard} origine={oc} />
      <LigneFiche label="Responsable du service" valeur={fiche.responsableNom} origine={oc} />
      <LigneFiche label="Adresse postale" valeur={fiche.adressePostale} origine={oc} />
      <LigneFiche label="Protocole vérifié le" valeur={fiche.protocoleVerifieLe} origine={oc} />
      <LigneFiche label="Source du protocole" valeur={fiche.protocoleSource} origine={oc} lien />
      <LigneFiche label="Nature de l’adresse" valeur={fiche.emailType ? libelleEmailType(fiche.emailType) : null} origine={oc} />
      {aPrada ? (
        <>
          <LigneFiche label="PRADA (nom)" valeur={fiche.pradaNom} origine={opr} />
          <LigneFiche label="PRADA (courriel)" valeur={fiche.pradaCourriel} origine={opr} />
          <LigneFiche label="PRADA (adresse)" valeur={fiche.pradaAdresse} origine={opr} />
          <LigneFiche label="PRADA (millésime)" valeur={fiche.pradaMillesime} origine={opr} />
        </>
      ) : <LigneFiche label="PRADA" valeur={null} />}
    </section>
  );
}

/** Bouton « Ouvrir le lien » (S19) : lien réel si l'URL est ouvrable, sinon bouton DÉSACTIVÉ + raison affichée (jamais mort). */
export function BoutonOuvrirLien({ url }: { url: string }) {
  const probleme = problemeUrlOuverture(url);
  if (probleme === null) {
    return <a href={url.trim()} target="_blank" rel="noopener noreferrer" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', fontSize: 13 }}>Ouvrir le lien ↗</a>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', fontSize: 13, opacity: 0.5, cursor: 'not-allowed' }} disabled>Ouvrir le lien</button>
      <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>désactivé : {probleme}</span>
    </span>
  );
}

export function SelecteurCanal({ canal, suggestionTeleservice, onCanal }: {
  canal: CanalContact; suggestionTeleservice: boolean; onCanal: (c: CanalContact) => void;
}) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <select value={canal} onChange={(e) => onCanal(e.target.value as CanalContact)} style={styleChamp} aria-label="Canal de contact">
        {CANAUX_ORDONNES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {suggestionTeleservice && <span style={{ ...styleAide, color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>{MENTION_TELESERVICE}</span>}
      <span style={styleAide}>{AIDE_CANAL}</span>
    </div>
  );
}
