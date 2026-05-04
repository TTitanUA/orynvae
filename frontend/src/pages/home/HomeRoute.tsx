import { useQuery } from "@tanstack/react-query";
import { BookOpen, Database, GitBranch, Waypoints } from "lucide-react";

import { healthQueries, HealthPanel } from "../../entities/health";
import { AppShell } from "../../widgets/app-shell";
import "./HomeRoute.css";

const foundations = [
  {
    icon: Database,
    title: "Локальное хранение",
    text: "SQLite и рабочие файлы проекта живут в data/.",
  },
  {
    icon: GitBranch,
    title: "API-скелет",
    text: "Первый endpoint уже проходит через /api.",
  },
  {
    icon: Waypoints,
    title: "AI-провайдеры",
    text: "Настройки моделей доступны в рабочем разделе.",
  },
  {
    icon: BookOpen,
    title: "Workspace вместо лендинга",
    text: "Интерфейс сразу ведет к рабочим разделам автора.",
  },
];

export function HomeRoute() {
  const healthQuery = useQuery(healthQueries.status());
  const error =
    healthQuery.error instanceof Error ? healthQuery.error.message : healthQuery.isError ? "Unknown backend error" : undefined;

  return (
    <AppShell>
      <div className="home-route">
        <header className="home-route__header">
          <div>
            <p className="home-route__eyebrow">MVP · этап 2</p>
            <h1>Локальный каркас Orynvae</h1>
          </div>
          <p>
            Основа приложения готова к настройке моделей: локальные и внешние
            провайдеры подключаются через единый backend-слой.
          </p>
        </header>

        <HealthPanel health={healthQuery.data} error={error} />

        <section className="home-route__grid" aria-label="Готовые элементы каркаса">
          {foundations.map((item) => (
            <article className="home-route__tile" key={item.title}>
              <item.icon size={18} aria-hidden="true" />
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
