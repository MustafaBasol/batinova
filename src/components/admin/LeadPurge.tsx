"use client";
import { purgeExpiredLeadsAction } from "@/app/admin/(panel)/_actions/leads";
import { ActionButton } from "./ui";

/** OWNER-only retention purge button (the server action re-checks the role). */
export function LeadPurgeButton() {
  return (
    <ActionButton
      size="normal"
      variant="danger"
      run={() => purgeExpiredLeadsAction()}
      confirm={{
        title: "Purger les demandes arrivées à échéance ?",
        message: "Les demandes dont la durée de conservation est dépassée (ainsi que le spam et les demandes supprimées depuis plus de 30 jours) seront effacées définitivement avec leurs pièces jointes. Cette action est irréversible et consignée dans le journal.",
        confirmLabel: "Purger",
        danger: true,
      }}
    >
      Purger les demandes arrivées à échéance
    </ActionButton>
  );
}
