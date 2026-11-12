import { requireRole } from "@/lib/auth/guards";
import { smtpConfigFromEnv } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/admin/AdminShell";
import { SettingsForms } from "@/components/admin/SettingsForms";

export const metadata = { title: "Réglages" };

export default async function SettingsPage() {
  await requireRole("OWNER");
  const settings = await getSettings();
  return (
    <main>
      <PageHeader title="Réglages" intro="Réservé au propriétaire : identité, logos, e-mails, données personnelles et suivi." />
      <SettingsForms settings={settings} smtpEnv={smtpConfigFromEnv() !== null} />
    </main>
  );
}
