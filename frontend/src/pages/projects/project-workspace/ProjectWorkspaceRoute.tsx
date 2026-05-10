import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  Compass,
  ListFilter,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  acceptMemoryProposal,
  checkMemoryConflicts,
  createMemoryItem,
  memoryQueries,
  memoryQueryKeys,
  memoryStatusLabel,
  memoryStatusOptions,
  memoryStatusTone,
  memoryTypeLabel,
  memoryTypeOptions,
  rejectMemoryProposal,
  updateMemoryItem,
  updateMemoryItemStatus,
  type MemoryConflictCheckResult,
  type MemoryFilters,
  type MemoryItem,
  type MemoryItemStatus,
  type MemoryItemType,
  type MemoryProposal,
  type MemoryProposalAcceptPayload,
} from "../../../entities/memory";
import { ProjectAgentSettingsCard } from "../../../entities/project-ai-settings";
import { projectMutations, projectQueryKeys } from "../../../entities/project";
import { privacySettingsQueries } from "../../../entities/privacy-settings";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./ProjectWorkspaceRoute.css";

type ProjectWorkspaceRouteProps = {
  projectId: string;
};

type MemoryDraft = {
  type: MemoryItemType;
  title: string;
  summary: string;
  body: string;
  status: MemoryItemStatus;
  importance: number;
};

type ProposalPayloadDraft = {
  type: MemoryItemType;
  title: string;
  summary: string;
  body: string;
  targetStatus: MemoryItemStatus;
};

const emptyMemoryDraft: MemoryDraft = {
  type: "note",
  title: "",
  summary: "",
  body: "",
  status: "draft",
  importance: 0,
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "нет данных";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function itemToDraft(item: MemoryItem): MemoryDraft {
  return {
    type: item.type,
    title: item.title,
    summary: item.summary || "",
    body: item.body || "",
    status: item.status,
    importance: item.importance,
  };
}

function draftToPayload(draft: MemoryDraft) {
  return {
    type: draft.type,
    title: draft.title.trim(),
    summary: draft.summary.trim() || null,
    body: draft.body.trim() || null,
    status: draft.status,
    importance: draft.importance,
  };
}

function payloadText(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function payloadType(payload: Record<string, unknown>): MemoryItemType {
  const value = payload.type;
  return memoryTypeOptions.some((option) => option.value === value) ? (value as MemoryItemType) : "note";
}

export function ProjectWorkspaceRoute({ projectId }: ProjectWorkspaceRouteProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<MemoryFilters>({});
  const [createDraft, setCreateDraft] = useState<MemoryDraft>(emptyMemoryDraft);
  const [editingItem, setEditingItem] = useState<MemoryItem | null>(null);
  const [editDraft, setEditDraft] = useState<MemoryDraft>(emptyMemoryDraft);
  const [conflictText, setConflictText] = useState("");
  const [conflictResult, setConflictResult] = useState<MemoryConflictCheckResult | null>(null);

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const memoryQuery = useQuery(memoryQueries.list(projectId, filters));
  const proposalsQuery = useQuery(memoryQueries.proposals(projectId, "pending"));
  const privacyQuery = useQuery(privacySettingsQueries.detail());

  const summary = summaryQuery.data;
  const project = summary?.project;
  const readOnly = Boolean(summary?.runtime.read_only);
  const busy = summaryQuery.isPending || memoryQuery.isPending;
  const errors = [summaryQuery.error, memoryQuery.error, proposalsQuery.error, privacyQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  const pendingAttention = useMemo(() => {
    const proposed = summary?.memory_counts.proposed || 0;
    const proposals = summary?.memory_counts.pending_proposals || 0;
    return proposed + proposals;
  }, [summary]);

  function invalidateMemory() {
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
  }

  const projectVisibilityMutation = useMutation({
    ...projectMutations.update(projectId),
    onSuccess: (updatedProject) => {
      queryClient.setQueryData(memoryQueryKeys.workspaceSummary(projectId), (current: typeof summary) =>
        current ? { ...current, project: { ...current.project, ...updatedProject } } : current,
      );
      queryClient.setQueryData(projectQueryKeys.detail(projectId), updatedProject);
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
      if (updatedProject.is_hidden && !privacyQuery.data?.show_hidden_items) {
        navigate("/projects");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
    },
  });
  const createMutation = useMutation({
    mutationFn: () => createMemoryItem(projectId, draftToPayload(createDraft)),
    onSuccess: () => {
      setCreateDraft(emptyMemoryDraft);
      invalidateMemory();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ itemId, draft }: { itemId: string; draft: MemoryDraft }) =>
      updateMemoryItem(projectId, itemId, draftToPayload(draft)),
    onSuccess: () => {
      setEditingItem(null);
      setEditDraft(emptyMemoryDraft);
      invalidateMemory();
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: MemoryItemStatus }) =>
      updateMemoryItemStatus(projectId, itemId, status),
    onSuccess: invalidateMemory,
  });
  const acceptProposalMutation = useMutation({
    mutationFn: ({ proposalId, payload }: { proposalId: string; payload: MemoryProposalAcceptPayload }) =>
      acceptMemoryProposal(projectId, proposalId, payload),
    onSuccess: invalidateMemory,
  });
  const rejectProposalMutation = useMutation({
    mutationFn: ({ proposalId, status }: { proposalId: string; status: "rejected" | "deferred" }) =>
      rejectMemoryProposal(projectId, proposalId, { status }),
    onSuccess: invalidateMemory,
  });
  const conflictMutation = useMutation({
    mutationFn: () => checkMemoryConflicts(projectId, { content: conflictText }),
    onSuccess: setConflictResult,
  });

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createDraft.title.trim() || readOnly) {
      return;
    }
    createMutation.mutate();
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem || !editDraft.title.trim() || readOnly) {
      return;
    }
    updateMutation.mutate({ itemId: editingItem.id, draft: editDraft });
  }

  function beginEdit(item: MemoryItem) {
    setEditingItem(item);
    setEditDraft(itemToDraft(item));
  }

  function runConflictCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conflictText.trim() || readOnly) {
      return;
    }
    conflictMutation.mutate();
  }

  function changeProjectHidden(isHidden: boolean) {
    if (readOnly || projectVisibilityMutation.isPending) {
      return;
    }
    projectVisibilityMutation.mutate({ is_hidden: isHidden });
  }

  return (
    <AppShell>
      <div className="workspace-route">
        <header className="workspace-route__header">
          <div>
            <Link className="workspace-route__back" to="/projects">
              <ChevronLeft size={16} aria-hidden="true" />
              Проекты
            </Link>
            <h1>{project?.title || "Проект"}</h1>
          </div>
          {summary && (
            <div className="workspace-route__header-status">
              <StatusPill
                label={summary.runtime.read_only ? "Только чтение" : "AI доступен"}
                tone={summary.runtime.read_only ? "warning" : "ready"}
              />
              <span>{summary.runtime.active_model?.display_name || summary.runtime.reason || "Модель не выбрана"}</span>
            </div>
          )}
        </header>

        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {summary?.warnings.map((warning) => <NoticeBlock key={warning}>{warning}</NoticeBlock>)}
        {busy && <NoticeBlock>Загрузка рабочего пространства</NoticeBlock>}

        {summary && (
          <>
            <section className="workspace-hero" aria-label="Обзор проекта">
              <article className="workspace-panel workspace-panel--synopsis">
                <div className="workspace-panel__title">
                  <BookOpen size={18} aria-hidden="true" />
                  <h2>Синопсис</h2>
                </div>
                <p>{summary.project.synopsis || "Синопсис пока пуст."}</p>
              </article>

              <aside className="workspace-panel workspace-panel--next">
                <div className="workspace-next">
                  <Compass size={20} aria-hidden="true" />
                  <div>
                    <span>Следующий шаг</span>
                    <strong>{summary.next_step.label}</strong>
                    {summary.next_step.detail && <p>{summary.next_step.detail}</p>}
                  </div>
                </div>
                {summary.next_step.href && (
                  <Link className="workspace-primary-link" to={summary.next_step.href}>
                    {summary.next_step.label}
                  </Link>
                )}
                <dl className="workspace-facts">
                  <div>
                    <dt>Статус</dt>
                    <dd>{summary.project.status}</dd>
                  </div>
                  <div>
                    <dt>Расширение мира</dt>
                    <dd>{summary.project.expansion_policy}</dd>
                  </div>
                  <div>
                    <dt>Обновлен</dt>
                    <dd>{formatTimestamp(summary.project.updated_at)}</dd>
                  </div>
                </dl>
              </aside>
            </section>

            <section className="workspace-grid" aria-label="Состояние истории">
              <article className="workspace-panel">
                <div className="workspace-panel__title">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <h2>Где мы сейчас</h2>
                </div>
                <dl className="workspace-facts workspace-facts--stacked">
                  <div>
                    <dt>Глава</dt>
                    <dd>{summary.latest_chapter?.title || summary.planned_chapter?.title || "глав еще нет"}</dd>
                  </div>
                  <div>
                    <dt>Сессия</dt>
                    <dd>{summary.active_session?.status || "нет активной сессии"}</dd>
                  </div>
                  <div>
                    <dt>Память</dt>
                    <dd>
                      {summary.memory_counts.canon} канон, {summary.memory_counts.draft} черновик,{" "}
                      {summary.memory_counts.proposed} предложено
                    </dd>
                  </div>
                  <div>
                    <dt>Линии</dt>
                    <dd>{summary.active_story_lines.length || "нет активных линий"}</dd>
                  </div>
                </dl>
                <Link className="workspace-secondary-link" to={`/projects/${projectId}/chapters`}>
                  Открыть главы
                </Link>
              </article>

              <article className="workspace-panel">
                <div className="workspace-panel__title">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <h2>Память требует внимания</h2>
                </div>
                <strong className="workspace-attention-count">{pendingAttention}</strong>
                <div className="workspace-attention-list">
                  {summary.pending_memory_items.map((item) => (
                    <button key={item.id} onClick={() => beginEdit(item)} type="button">
                      {item.title}
                    </button>
                  ))}
                  {summary.pending_proposals.map((proposal) => (
                    <span key={proposal.id}>{proposal.reason || proposal.proposal_type}</span>
                  ))}
                  {pendingAttention === 0 && <span>нет ожидающих решений</span>}
                </div>
              </article>

              <article className="workspace-panel">
                <div className="workspace-panel__title">
                  <Sparkles size={18} aria-hidden="true" />
                  <h2>Активные линии</h2>
                </div>
                <div className="workspace-lines">
                  {summary.active_story_lines.map((line) => (
                    <div key={line.id}>
                      <strong>{line.title}</strong>
                      <span>{line.current_state || line.description || line.type}</span>
                    </div>
                  ))}
                  {summary.active_story_lines.length === 0 && <span>линии появятся на следующем этапе</span>}
                </div>
                <Link className="workspace-secondary-link" to={`/projects/${projectId}/story-lines`}>
                  Открыть линии
                </Link>
              </article>

              <article className="workspace-panel workspace-panel--settings" aria-label="Настройки проекта">
                <div className="workspace-panel__title">
                  <Settings2 size={18} aria-hidden="true" />
                  <h2>Настройки проекта</h2>
                </div>
                <label className="workspace-hidden-toggle">
                  <span>Скрытый проект</span>
                  <input
                    checked={summary.project.is_hidden}
                    disabled={readOnly || projectVisibilityMutation.isPending}
                    name="project-is-hidden"
                    onChange={(event) => changeProjectHidden(event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <span className="workspace-empty-line">
                  {summary.project.is_hidden ? "скрыт из обычных списков" : "показывается в списке проектов"}
                </span>
              </article>
            </section>
          </>
        )}

        <section className="workspace-memory" aria-label="Память истории">
          <div className="workspace-section-heading">
            <div>
              <h2>Память истории</h2>
              <p>{readOnly ? "режим чтения" : "канон меняется только после подтверждения"}</p>
            </div>
          </div>

          <div className="workspace-memory__layout">
            <div className="workspace-memory__main">
              <MemoryFiltersBar filters={filters} onChange={setFilters} />

              <div className="memory-list">
                {(memoryQuery.data || []).map((item) => (
                  <MemoryItemCard
                    item={item}
                    key={item.id}
                    onEdit={beginEdit}
                    onStatus={(status) => statusMutation.mutate({ itemId: item.id, status })}
                    readOnly={readOnly}
                    updating={statusMutation.isPending}
                  />
                ))}
                {!memoryQuery.isPending && (memoryQuery.data || []).length === 0 && (
                  <NoticeBlock>Память по этим фильтрам пуста</NoticeBlock>
                )}
              </div>
            </div>

            <aside className="workspace-memory__side">
              <MemoryDraftForm
                draft={editingItem ? editDraft : createDraft}
                mode={editingItem ? "edit" : "create"}
                onCancel={
                  editingItem
                    ? () => {
                        setEditingItem(null);
                        setEditDraft(emptyMemoryDraft);
                      }
                    : undefined
                }
                onChange={editingItem ? setEditDraft : setCreateDraft}
                onSubmit={editingItem ? submitEdit : submitCreate}
                readOnly={readOnly}
                submitting={editingItem ? updateMutation.isPending : createMutation.isPending}
              />

              <section className="workspace-panel workspace-panel--queue" aria-label="Предложения памяти">
                <div className="workspace-panel__title">
                  <ListFilter size={18} aria-hidden="true" />
                  <h2>Очередь канона</h2>
                </div>
                {(proposalsQuery.data || []).map((proposal) => (
                  <ProposalReviewCard
                    busy={acceptProposalMutation.isPending || rejectProposalMutation.isPending}
                    key={proposal.id}
                    onAccept={(payload) =>
                      acceptProposalMutation.mutate({ proposalId: proposal.id, payload })
                    }
                    onReject={(status) =>
                      rejectProposalMutation.mutate({ proposalId: proposal.id, status })
                    }
                    proposal={proposal}
                    readOnly={readOnly}
                  />
                ))}
                {!proposalsQuery.isPending && (proposalsQuery.data || []).length === 0 && (
                  <span className="workspace-empty-line">ожидающих предложений нет</span>
                )}
              </section>

              <ProjectAgentSettingsCard
                agentKey="contradiction_checker"
                className="workspace-panel"
                description="Применяется к проверке новой информации на противоречия с памятью."
                disabled={readOnly}
                projectId={projectId}
                title="Настройки проверки"
              />

              <section className="workspace-panel" aria-label="Проверка противоречий">
                <div className="workspace-panel__title">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <h2>Противоречия</h2>
                </div>
                <form className="workspace-form" onSubmit={runConflictCheck}>
                  <textarea
                    disabled={readOnly}
                    onChange={(event) => setConflictText(event.target.value)}
                    placeholder="Новая информация для проверки"
                    rows={4}
                    value={conflictText}
                  />
                  <button disabled={readOnly || conflictMutation.isPending || !conflictText.trim()} type="submit">
                    Проверить
                  </button>
                </form>
                {conflictMutation.error instanceof Error && (
                  <NoticeBlock tone="error">{conflictMutation.error.message}</NoticeBlock>
                )}
                {conflictResult && (
                  <div className="workspace-conflicts">
                    {conflictResult.contradictions.map((item) => (
                      <div key={`${item.title}-${item.description}`}>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                        {item.suggestion && <em>{item.suggestion}</em>}
                      </div>
                    ))}
                    {conflictResult.contradictions.length === 0 && <span>несостыковок не найдено</span>}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function MemoryFiltersBar({
  filters,
  onChange,
}: {
  filters: MemoryFilters;
  onChange: (filters: MemoryFilters) => void;
}) {
  return (
    <div className="memory-filters">
      <input
        aria-label="Поиск по памяти"
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        placeholder="Поиск"
        type="search"
        value={filters.search || ""}
      />
      <select
        aria-label="Тип памяти"
        onChange={(event) => onChange({ ...filters, type: event.target.value as MemoryItemType | "" })}
        value={filters.type || ""}
      >
        <option value="">Все типы</option>
        {memoryTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Статус памяти"
        onChange={(event) => onChange({ ...filters, status: event.target.value as MemoryItemStatus | "" })}
        value={filters.status || ""}
      >
        <option value="">Все статусы</option>
        {memoryStatusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label>
        <input
          checked={Boolean(filters.requires_confirmation)}
          onChange={(event) =>
            onChange({
              ...filters,
              requires_confirmation: event.target.checked ? true : undefined,
            })
          }
          type="checkbox"
        />
        Требует решения
      </label>
    </div>
  );
}

function MemoryItemCard({
  item,
  onEdit,
  onStatus,
  readOnly,
  updating,
}: {
  item: MemoryItem;
  onEdit: (item: MemoryItem) => void;
  onStatus: (status: MemoryItemStatus) => void;
  readOnly: boolean;
  updating: boolean;
}) {
  return (
    <article className="memory-card">
      <div className="memory-card__header">
        <div>
          <span>{memoryTypeLabel(item.type)}</span>
          <h3>{item.title}</h3>
        </div>
        <StatusPill label={memoryStatusLabel(item.status)} tone={memoryStatusTone(item.status)} />
      </div>
      {item.summary && <p>{item.summary}</p>}
      {item.body && <p className="memory-card__body">{item.body}</p>}
      <div className="memory-card__meta">
        <span>{item.source_type || "источник не указан"}</span>
        <span>{formatTimestamp(item.updated_at)}</span>
      </div>
      <div className="memory-card__actions">
        <button disabled={readOnly} onClick={() => onEdit(item)} type="button">
          <Pencil size={15} aria-hidden="true" />
          Правка
        </button>
        <button disabled={readOnly || updating} onClick={() => onStatus("canon")} type="button">
          <Check size={15} aria-hidden="true" />
          Канон
        </button>
        <button disabled={readOnly || updating} onClick={() => onStatus("draft")} type="button">
          Черновик
        </button>
        <button disabled={readOnly || updating} onClick={() => onStatus("rejected")} type="button">
          <X size={15} aria-hidden="true" />
          Отклонить
        </button>
      </div>
    </article>
  );
}

function MemoryDraftForm({
  draft,
  mode,
  onCancel,
  onChange,
  onSubmit,
  readOnly,
  submitting,
}: {
  draft: MemoryDraft;
  mode: "create" | "edit";
  onCancel?: () => void;
  onChange: (draft: MemoryDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readOnly: boolean;
  submitting: boolean;
}) {
  return (
    <section className="workspace-panel" aria-label={mode === "create" ? "Добавить память" : "Правка памяти"}>
      <div className="workspace-panel__title">
        <Plus size={18} aria-hidden="true" />
        <h2>{mode === "create" ? "Добавить память" : "Правка памяти"}</h2>
      </div>
      <form className="workspace-form" onSubmit={onSubmit}>
        <select
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, type: event.target.value as MemoryItemType })}
          value={draft.type}
        >
          {memoryTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, status: event.target.value as MemoryItemStatus })}
          value={draft.status}
        >
          {memoryStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="Название"
          value={draft.title}
        />
        <textarea
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, summary: event.target.value })}
          placeholder="Краткое описание"
          rows={3}
          value={draft.summary}
        />
        <textarea
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, body: event.target.value })}
          placeholder="Детали"
          rows={5}
          value={draft.body}
        />
        <div className="workspace-form__actions">
          <button disabled={readOnly || submitting || !draft.title.trim()} type="submit">
            {mode === "create" ? "Добавить" : "Сохранить"}
          </button>
          {onCancel && (
            <button onClick={onCancel} type="button">
              Отмена
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function ProposalReviewCard({
  busy,
  onAccept,
  onReject,
  proposal,
  readOnly,
}: {
  busy: boolean;
  onAccept: (payload: MemoryProposalAcceptPayload) => void;
  onReject: (status: "rejected" | "deferred") => void;
  proposal: MemoryProposal;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<ProposalPayloadDraft>({
    type: payloadType(proposal.suggested_payload),
    title: payloadText(proposal.suggested_payload, "title"),
    summary: payloadText(proposal.suggested_payload, "summary"),
    body: payloadText(proposal.suggested_payload, "body"),
    targetStatus: "canon",
  });
  const requiresTitle = !proposal.target_item_id;

  function accept() {
    const suggestedPayload: Record<string, unknown> = {
      type: draft.type,
      summary: draft.summary.trim() || null,
      body: draft.body.trim() || null,
    };
    if (draft.title.trim()) {
      suggestedPayload.title = draft.title.trim();
    }
    onAccept({ suggested_payload: suggestedPayload, target_status: draft.targetStatus });
  }

  return (
    <article className="proposal-card">
      <div className="proposal-card__header">
        <strong>{proposal.reason || proposal.proposal_type}</strong>
        <StatusPill label="ожидает" tone="warning" />
      </div>
      <select
        disabled={readOnly}
        onChange={(event) => setDraft({ ...draft, type: event.target.value as MemoryItemType })}
        value={draft.type}
      >
        {memoryTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        disabled={readOnly}
        onChange={(event) => setDraft({ ...draft, targetStatus: event.target.value as MemoryItemStatus })}
        value={draft.targetStatus}
      >
        <option value="canon">Принять в канон</option>
        <option value="draft">Оставить черновиком</option>
        <option value="proposed">Оставить предложением</option>
      </select>
      <input
        disabled={readOnly}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        placeholder="Название"
        value={draft.title}
      />
      <textarea
        disabled={readOnly}
        onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
        placeholder="Описание"
        rows={3}
        value={draft.summary}
      />
      <div className="proposal-card__actions">
        <button disabled={readOnly || busy || (requiresTitle && !draft.title.trim())} onClick={accept} type="button">
          Принять
        </button>
        <button disabled={readOnly || busy} onClick={() => onReject("deferred")} type="button">
          Отложить
        </button>
        <button disabled={readOnly || busy} onClick={() => onReject("rejected")} type="button">
          Отклонить
        </button>
      </div>
    </article>
  );
}
