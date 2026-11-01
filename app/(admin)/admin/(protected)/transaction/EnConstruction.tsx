/**
 * 🔴 LOT DX (Arno, 01/11/2026) — l'encadré d'une page de « Location & Gestion » pas encore construite : aucun chiffre, aucune donnée. Composant
 * SERVEUR, sans état ; jetons de couleur seulement (clair et sombre).
 */
export function EnConstruction() {
  return (
    <div className="svv-card" role="status" data-en-construction style={{ borderStyle: 'dashed', color: 'var(--color-svv-muted)' }}>
      <strong style={{ color: 'var(--color-svv-ink)' }}>En construction</strong> — cette page sera construite au prochain lot.
    </div>
  );
}
