"use client";
import type { ActionResult } from "@/lib/cms/result";
import { ActionButton, Card } from "./ui";

export interface RevisionRow {
  id: string;
  createdAt: string; // preformatted (Europe/Paris)
  author: string | null;
}

export function RevisionList({ revisions, restore }: { revisions: RevisionRow[]; restore: (id: string) => Promise<ActionResult> }) {
  return (
    <Card title="Historique des versions">
      {revisions.length === 0 ? (
        <p className="text-sm text-charcoal/70">Aucune version enregistrée.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-charcoal/60">Restaurer reprend le contenu et le référencement d’une version ; l’état de publication et l’adresse ne changent pas.</p>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {revisions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {r.createdAt}
                  {r.author ? <span className="block text-xs text-charcoal/60">{r.author}</span> : null}
                </span>
                <ActionButton run={() => restore(r.id)} confirm={{ title: "Restaurer cette version ?", message: "Le contenu actuel sera remplacé (une nouvelle version est conservée dans l’historique).", confirmLabel: "Restaurer" }}>
                  Restaurer
                </ActionButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
