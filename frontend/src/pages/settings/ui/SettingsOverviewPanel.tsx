import { Eye, ServerCog } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import "./SettingsOverviewPanel.css";

type SettingsCard = {
  title: string;
  href: string;
  icon: LucideIcon;
};

const settingsCards: SettingsCard[] = [
  {
    title: "Приватность",
    href: "/settings/privacy",
    icon: Eye,
  },
  {
    title: "AI-провайдеры",
    href: "/settings/providers",
    icon: ServerCog,
  },
];

export function SettingsOverviewPanel() {
  return (
    <section className="settings-overview-panel" aria-label="Разделы настроек">
      {settingsCards.map((card) => {
        const Icon = card.icon;
        return (
          <Link className="settings-overview-panel__card" key={card.href} to={card.href}>
            <span className="settings-overview-panel__icon" aria-hidden="true">
              <Icon size={34} />
            </span>
            <span>{card.title}</span>
          </Link>
        );
      })}
    </section>
  );
}
