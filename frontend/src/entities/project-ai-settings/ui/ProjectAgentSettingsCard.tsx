import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, LoaderCircle, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { memoryQueryKeys } from "../../memory";
import { projectQueryKeys } from "../../project";
import { runtimeQueryKeys } from "../../runtime";
import { NoticeBlock } from "../../../shared/ui";
import { sourceLabel, topPEnabled } from "../model/project-ai-settings-helpers";
import { projectAiSettingsMutations } from "../model/project-ai-settings-mutations";
import { projectAiSettingsQueries } from "../model/project-ai-settings-queries";
import { projectAiSettingsQueryKeys } from "../model/project-ai-settings-query-keys";
import type {
  ProjectAgentKey,
  ProjectAgentSettingSource,
} from "../model/types";
import "./ProjectAgentSettingsCard.css";

type ProjectAgentSettingsCardProps = {
  agentKey: ProjectAgentKey;
  className?: string;
  description?: string;
  disabled?: boolean;
  projectId: string;
  title?: string;
};

type AgentDraft = {
  temperatureSource: ProjectAgentSettingSource;
  temperatureValue: number;
  topPSource: ProjectAgentSettingSource;
  topPValue: number;
};

const sourceOptions: ProjectAgentSettingSource[] = ["project", "agent_default", "custom"];

export function ProjectAgentSettingsCard({
  agentKey,
  className,
  description,
  disabled = false,
  projectId,
  title,
}: ProjectAgentSettingsCardProps) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(projectAiSettingsQueries.detail(projectId));
  const updateMutation = useMutation({
    ...projectAiSettingsMutations.update(projectId),
    onSuccess: (settings) => {
      queryClient.setQueryData(projectAiSettingsQueryKeys.detail(projectId), settings);
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: runtimeQueryKeys.status });
      void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
    },
  });
  const settings = settingsQuery.data;
  const agents = Array.isArray(settings?.agents) ? settings.agents : [];
  const agent = agents.find((item) => item.agent_key === agentKey);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const serverDraft = useMemo<AgentDraft | null>(() => {
    if (!settings || !agent) {
      return null;
    }
    return {
      temperatureSource: agent.temperature_source,
      temperatureValue: agent.temperature_value ?? agent.effective_temperature,
      topPSource: agent.top_p_source,
      topPValue: agent.top_p_value ?? agent.effective_top_p ?? settings.default_top_p,
    };
  }, [agent, settings]);
  const effectiveDraft = draft ?? serverDraft;

  const rootClassName = ["project-agent-settings", className].filter(Boolean).join(" ");
  const blocked = disabled || updateMutation.isPending;
  const canEditTopP = settings?.active_model ? topPEnabled(settings.active_model) : true;
  const displayTitle = title || agent?.label || "Настройки ассистента";
  const errors = [settingsQuery.error, updateMutation.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  function saveSettings() {
    if (!effectiveDraft) {
      return;
    }
    updateMutation.mutate({
      agents: [
        {
          agent_key: agentKey,
          temperature_source: effectiveDraft.temperatureSource,
          temperature_value:
            effectiveDraft.temperatureSource === "custom" ? effectiveDraft.temperatureValue : null,
          top_p_source: effectiveDraft.topPSource,
          top_p_value: effectiveDraft.topPSource === "custom" ? effectiveDraft.topPValue : null,
        },
      ],
    });
  }

  return (
    <section className={rootClassName} aria-label={displayTitle}>
      <div className="project-agent-settings__header">
        <div className="project-agent-settings__title">
          <Bot size={18} aria-hidden="true" />
          <h2>{displayTitle}</h2>
        </div>
        {agent && (
          <span className="project-agent-settings__effective">
            {agent.effective_temperature.toFixed(2)}
            {agent.effective_top_p !== null ? ` / ${agent.effective_top_p.toFixed(2)}` : ""}
          </span>
        )}
      </div>
      {description && <p className="project-agent-settings__help">{description}</p>}

      {settingsQuery.isPending && (
        <div className="project-agent-settings__loading" role="status">
          <LoaderCircle className="is-spinning" size={16} aria-hidden="true" />
          <span>Загрузка настроек</span>
        </div>
      )}
      {errors.map((error) => (
        <NoticeBlock key={error} tone="error">
          {error}
        </NoticeBlock>
      ))}
      {settings && !agent && (
        <NoticeBlock tone="error">Настройки этого ассистента не найдены.</NoticeBlock>
      )}

      {settings && agent && effectiveDraft && (
        <>
          <div className="project-agent-settings__grid">
            <AgentParameterField
              customValue={effectiveDraft.temperatureValue}
              disabled={blocked}
              effectiveValue={agent.effective_temperature}
              label="Температура"
              max={2}
              name={`${agentKey}-temperature`}
              onSourceChange={(source) =>
                setDraft((current) =>
                  current
                    ? { ...current, temperatureSource: source }
                    : effectiveDraft
                      ? { ...effectiveDraft, temperatureSource: source }
                      : current,
                )
              }
              onValueChange={(value) =>
                setDraft((current) =>
                  current
                    ? { ...current, temperatureValue: value }
                    : effectiveDraft
                      ? { ...effectiveDraft, temperatureValue: value }
                      : current,
                )
              }
              presetValue={agent.preset_temperature}
              projectValue={settings.default_temperature}
              source={effectiveDraft.temperatureSource}
            />
            <AgentParameterField
              customValue={effectiveDraft.topPValue}
              disabled={blocked || !canEditTopP}
              effectiveValue={agent.effective_top_p}
              label="Top P"
              max={1}
              name={`${agentKey}-top-p`}
              onSourceChange={(source) =>
                setDraft((current) =>
                  current
                    ? { ...current, topPSource: source }
                    : effectiveDraft
                      ? { ...effectiveDraft, topPSource: source }
                      : current,
                )
              }
              onValueChange={(value) =>
                setDraft((current) =>
                  current
                    ? { ...current, topPValue: value }
                    : effectiveDraft
                      ? { ...effectiveDraft, topPValue: value }
                      : current,
                )
              }
              presetValue={agent.preset_top_p}
              projectValue={settings.default_top_p}
              source={effectiveDraft.topPSource}
            />
          </div>
          {!canEditTopP && (
            <span className="project-agent-settings__muted">
              Текущая модель не объявляет поддержку Top P; значение сохранится, но не будет отправляться.
            </span>
          )}
          <button
            className="project-agent-settings__save"
            disabled={blocked}
            onClick={saveSettings}
            type="button"
          >
            {updateMutation.isPending ? (
              <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
            ) : (
              <Save size={15} aria-hidden="true" />
            )}
            Сохранить настройки
          </button>
        </>
      )}
    </section>
  );
}

function AgentParameterField({
  customValue,
  disabled,
  effectiveValue,
  label,
  max,
  name,
  onSourceChange,
  onValueChange,
  presetValue,
  projectValue,
  source,
}: {
  customValue: number;
  disabled: boolean;
  effectiveValue: number | null;
  label: string;
  max: number;
  name: string;
  onSourceChange: (source: ProjectAgentSettingSource) => void;
  onValueChange: (value: number) => void;
  presetValue: number | null;
  projectValue: number;
  source: ProjectAgentSettingSource;
}) {
  return (
    <div className="project-agent-parameter">
      <label className="project-agent-parameter__source">
        <span>{label}</span>
        <select
          disabled={disabled}
          name={`${name}-source`}
          onChange={(event) => onSourceChange(event.target.value as ProjectAgentSettingSource)}
          value={source}
        >
          {sourceOptions.map((option) => (
            <option key={option} value={option}>
              {sourceLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="project-agent-parameter__range">
        <span>Значение</span>
        <input
          disabled={disabled || source !== "custom"}
          max={max}
          min={0}
          name={`${name}-value`}
          onChange={(event) => onValueChange(Number(event.target.value))}
          step={0.05}
          type="range"
          value={customValue}
        />
        <output>{customValue.toFixed(2)}</output>
      </label>
      <small>{parameterHelp(source, effectiveValue, presetValue, projectValue)}</small>
    </div>
  );
}

function parameterHelp(
  source: ProjectAgentSettingSource,
  effectiveValue: number | null,
  presetValue: number | null,
  projectValue: number,
): string {
  if (source === "project") {
    return `Берет проектное значение ${projectValue.toFixed(2)}.`;
  }
  if (source === "agent_default") {
    return presetValue === null
      ? `Пресет не задан, используется ${projectValue.toFixed(2)}.`
      : `Берет пресет ${presetValue.toFixed(2)}.`;
  }
  return `Используется ${effectiveValue?.toFixed(2) ?? "свое значение"}.`;
}
