import { Eye, ServerCog } from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/templates/AppShell";
import "./SettingsRoute.css";

const settingsCards = [
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

export function SettingsRoute() {
  return (
    <AppShell>
      <div className="settings-route">
        <header className="settings-route__header">
          <p className="settings-route__eyebrow">Orynvae</p>
          <h1>Настройки</h1>
        </header>

        <section className="settings-card-list" aria-label="Разделы настроек">
          {settingsCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link className="settings-card" key={card.href} to={card.href}>
                <span className="settings-card__icon" aria-hidden="true">
                  <Icon size={34} />
                </span>
                <span>{card.title}</span>
              </Link>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
