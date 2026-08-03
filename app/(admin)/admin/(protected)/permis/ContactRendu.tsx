import type { CSSProperties } from 'react';
import type { CanalContact } from '../../../../lib/sitadel/mairieContact';
import { CANAUX_ORDONNES, AIDE_CANAL, MENTION_TELESERVICE, EMAIL_TYPES, MENTION_ACCUEIL, problemeUrlOuverture } from './contactForm';

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
      {emailType === 'accueil' && <span style={{ ...styleAide, color: '#8a5a00' }}>{MENTION_ACCUEIL}</span>}
    </div>
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
