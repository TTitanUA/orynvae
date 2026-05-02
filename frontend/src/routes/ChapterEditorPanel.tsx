import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CirclePlus,
  ClipboardPenLine,
  Lightbulb,
  Save,
  Sparkles,
  Square,
  Trash2,
  WandSparkles,
} from "lucide-react";

import {
  fetchChapterEditor,
  requestChapterAi,
  updateChapterEditor,
} from "../api/projects";
import type { Provider } from "../types/providers";
import type {
  ChapterAiAction,
  ChapterEditor,
  ChapterEditorState,
  SceneEditor,
} from "../types/projects";
import "./ChapterEditorPanel.css";

type ChapterEditorPanelProps = {
  projectId: string;
  providers: Provider[];
};

const aiActions: Array<{ id: ChapterAiAction; label: string; icon: typeof Sparkles }> = [
  { id: "continue", label: "Continue", icon: WandSparkles },
  { id: "rewrite", label: "Rewrite", icon: ClipboardPenLine },
  { id: "critique", label: "Critique", icon: Bot },
  { id: "brainstorm", label: "Brainstorm", icon: Lightbulb },
];

function text(value: string | null | undefined): string {
  return value ?? "";
}

function tempId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function defaultModelFor(provider?: Provider): string {
  return provider?.default_model_id || provider?.models[0]?.model_id || "";
}

export function ChapterEditorPanel({ projectId, providers }: ChapterEditorPanelProps) {
  const [editor, setEditor] = useState<ChapterEditorState>();
  const [selectedChapterId, setSelectedChapterId] = useState<string>();
  const [selectedSceneId, setSelectedSceneId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [persona, setPersona] = useState("Development editor focused on continuity and character arcs.");
  const [instructions, setInstructions] = useState("");
  const [selection, setSelection] = useState("");
  const [action, setAction] = useState<ChapterAiAction>("continue");
  const [suggestion, setSuggestion] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProviderId, setAiProviderId] = useState("");
  const [aiModelId, setAiModelId] = useState("");
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    let isCurrent = true;
    fetchChapterEditor(projectId)
      .then((nextEditor) => {
        if (!isCurrent) {
          return;
        }
        setEditor(nextEditor);
        setSelectedChapterId(nextEditor.chapters[0]?.id || undefined);
        setAiProviderId(nextEditor.project.provider_id || "");
        setAiModelId(nextEditor.project.model_id || "");
      })
      .catch((reason) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : "Chapter editor could not be loaded.");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
      abortRef.current?.abort();
    };
  }, [projectId]);

  const selectedChapter = useMemo(
    () => editor?.chapters.find((chapter) => chapter.id === selectedChapterId) || editor?.chapters[0],
    [editor, selectedChapterId],
  );
  const selectedScene = useMemo(
    () => selectedChapter?.scenes.find((scene) => scene.id === selectedSceneId),
    [selectedChapter, selectedSceneId],
  );
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === aiProviderId),
    [aiProviderId, providers],
  );
  const draftText = selectedScene ? selectedScene.body : selectedChapter?.body || "";

  function replaceChapter(chapterId: string | null | undefined, patch: Partial<ChapterEditor>) {
    setEditor((current) => {
      if (!current) {
        return current;
      }
      const nextChapters = current.chapters.map((chapter, index) => {
        const matches = chapterId ? chapter.id === chapterId : index === 0;
        return matches ? { ...chapter, ...patch } : chapter;
      });
      return { ...current, chapters: nextChapters };
    });
  }

  function replaceScene(sceneId: string | null | undefined, patch: Partial<SceneEditor>) {
    if (!selectedChapter) {
      return;
    }
    replaceChapter(selectedChapter.id, {
      scenes: selectedChapter.scenes.map((scene, index) => {
        const matches = sceneId ? scene.id === sceneId : index === 0;
        return matches ? { ...scene, ...patch } : scene;
      }),
    });
  }

  function addChapter() {
    const chapter: ChapterEditor = {
      id: tempId("chapter"),
      title: "New chapter",
      summary: "",
      status: "draft",
      position: editor?.chapters.length || 0,
      body: "",
      scenes: [],
    };
    setEditor((current) =>
      current ? { ...current, chapters: [...current.chapters, chapter] } : current,
    );
    setSelectedChapterId(chapter.id || undefined);
    setSelectedSceneId(undefined);
  }

  function removeChapter(chapterId: string | null | undefined) {
    setEditor((current) => {
      if (!current || !chapterId) {
        return current;
      }
      const chapters = current.chapters.filter((chapter) => chapter.id !== chapterId);
      setSelectedChapterId(chapters[0]?.id || undefined);
      setSelectedSceneId(undefined);
      return { ...current, chapters };
    });
  }

  function addScene() {
    if (!selectedChapter) {
      return;
    }
    const scene: SceneEditor = {
      id: tempId("scene"),
      chapter_id: selectedChapter.id,
      title: "New scene",
      summary: "",
      body: "",
      position: selectedChapter.scenes.length,
    };
    replaceChapter(selectedChapter.id, { scenes: [...selectedChapter.scenes, scene] });
    setSelectedSceneId(scene.id || undefined);
  }

  function removeScene(sceneId: string | null | undefined) {
    if (!selectedChapter || !sceneId) {
      return;
    }
    const scenes = selectedChapter.scenes.filter((scene) => scene.id !== sceneId);
    replaceChapter(selectedChapter.id, { scenes });
    setSelectedSceneId(undefined);
  }

  function updateDraft(value: string) {
    if (selectedScene) {
      replaceScene(selectedScene.id, { body: value });
      return;
    }
    replaceChapter(selectedChapter?.id, { body: value });
  }

  async function saveEditor() {
    if (!editor) {
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const saved = await updateChapterEditor(projectId, { chapters: editor.chapters });
      setEditor(saved);
      setNotice("Chapter draft saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chapter draft could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function runAi(nextAction: ChapterAiAction) {
    if (!editor || !selectedChapter) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAction(nextAction);
    setSuggestion("");
    setError(undefined);
    setAiRunning(true);
    try {
      await requestChapterAi(
        projectId,
        {
          action: nextAction,
          chapter_id: selectedChapter.id,
          scene_id: selectedScene?.id,
          selected_text: selection || null,
          draft_text: draftText,
          instructions: instructions || null,
          provider_id: aiProviderId || null,
          model_id: aiModelId || null,
          persona,
          stream: true,
        },
        (chunk) => setSuggestion((current) => current + chunk),
        controller.signal,
      );
    } catch (reason) {
      if (controller.signal.aborted) {
        setNotice("AI request stopped.");
      } else {
        setError(reason instanceof Error ? reason.message : "AI request failed.");
      }
    } finally {
      setAiRunning(false);
    }
  }

  if (loading) {
    return <div className="chapter-editor__state">Loading chapter editor...</div>;
  }

  if (!editor) {
    return <div className="chapter-editor__state is-error">{error || "Chapter editor unavailable."}</div>;
  }

  return (
    <section className="chapter-editor">
      <div className="chapter-editor__toolbar">
        <div>
          <h2>Chapter Editor</h2>
          <p>
            {editor.chapters.length} chapters - {wordCount(draftText)} words in focus
          </p>
        </div>
        <div className="chapter-editor__actions">
          <button type="button" onClick={addChapter} title="Add chapter">
            <CirclePlus size={16} aria-hidden="true" />
            Chapter
          </button>
          <button type="button" disabled={saving} onClick={() => void saveEditor()} title="Save draft">
            <Save size={16} aria-hidden="true" />
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className={`chapter-editor__message ${error ? "is-error" : "is-ready"}`}>
          {error || notice}
        </div>
      )}

      <div className="chapter-editor__layout">
        <aside className="chapter-editor__chapter-list" aria-label="Chapters">
          {editor.chapters.map((chapter) => (
            <button
              aria-current={chapter.id === selectedChapter?.id ? "true" : undefined}
              key={chapter.id}
              onClick={() => {
                setSelectedChapterId(chapter.id || undefined);
                setSelectedSceneId(undefined);
              }}
              type="button"
            >
              <strong>{chapter.title}</strong>
              <span>{chapter.status}</span>
            </button>
          ))}
        </aside>

        <main className="chapter-editor__draft">
          {selectedChapter ? (
            <>
              <div className="chapter-editor__meta">
                <label>
                  Chapter title
                  <input
                    value={selectedChapter.title}
                    onChange={(event) => replaceChapter(selectedChapter.id, { title: event.target.value })}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={selectedChapter.status}
                    onChange={(event) => replaceChapter(selectedChapter.id, { status: event.target.value })}
                  >
                    <option value="planned">Planned</option>
                    <option value="draft">Draft</option>
                    <option value="revising">Revising</option>
                    <option value="done">Done</option>
                  </select>
                </label>
                <button
                  type="button"
                  aria-label="Remove chapter"
                  title="Remove chapter"
                  onClick={() => removeChapter(selectedChapter.id)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>

              <label>
                Chapter summary
                <textarea
                  rows={3}
                  value={text(selectedChapter.summary)}
                  onChange={(event) => replaceChapter(selectedChapter.id, { summary: event.target.value })}
                />
              </label>

              <div className="chapter-editor__scene-row">
                <button
                  aria-current={!selectedScene ? "true" : undefined}
                  onClick={() => setSelectedSceneId(undefined)}
                  type="button"
                >
                  Full chapter
                </button>
                {selectedChapter.scenes.map((scene) => (
                  <button
                    aria-current={scene.id === selectedScene?.id ? "true" : undefined}
                    key={scene.id}
                    onClick={() => setSelectedSceneId(scene.id || undefined)}
                    type="button"
                  >
                    {scene.title || "Untitled scene"}
                  </button>
                ))}
                <button type="button" onClick={addScene} title="Add scene">
                  <CirclePlus size={16} aria-hidden="true" />
                </button>
              </div>

              {selectedScene && (
                <div className="chapter-editor__meta">
                  <label>
                    Scene title
                    <input
                      value={text(selectedScene.title)}
                      onChange={(event) => replaceScene(selectedScene.id, { title: event.target.value })}
                    />
                  </label>
                  <label>
                    Scene summary
                    <input
                      value={text(selectedScene.summary)}
                      onChange={(event) => replaceScene(selectedScene.id, { summary: event.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Remove scene"
                    title="Remove scene"
                    onClick={() => removeScene(selectedScene.id)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              )}

              <label className="chapter-editor__prose">
                Draft
                <textarea
                  rows={18}
                  value={draftText}
                  onChange={(event) => updateDraft(event.target.value)}
                />
              </label>
            </>
          ) : (
            <div className="chapter-editor__state">Create a chapter to start drafting.</div>
          )}
        </main>

        <aside className="chapter-editor__ai" aria-label="AI chapter assistance">
          <div className="chapter-editor__ai-head">
            <h3>AI Assist</h3>
            {aiRunning && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                title="Stop generation"
              >
                <Square size={14} aria-hidden="true" />
                Stop
              </button>
            )}
          </div>
          <label>
            Provider
            <select
              value={aiProviderId}
              onChange={(event) => {
                const provider = providers.find((item) => item.id === event.target.value);
                setAiProviderId(event.target.value);
                setAiModelId(defaultModelFor(provider));
              }}
            >
              <option value="">Fallback editor</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model
            <select
              disabled={!selectedProvider}
              value={aiModelId}
              onChange={(event) => setAiModelId(event.target.value)}
            >
              <option value="">No model</option>
              {selectedProvider?.models.map((model) => (
                <option key={model.id} value={model.model_id}>
                  {model.display_name}
                </option>
              ))}
              {selectedProvider?.default_model_id &&
                !selectedProvider.models.some(
                  (model) => model.model_id === selectedProvider.default_model_id,
                ) && (
                  <option value={selectedProvider.default_model_id}>
                    {selectedProvider.default_model_id}
                  </option>
                )}
            </select>
          </label>
          <label>
            Persona
            <textarea rows={3} value={persona} onChange={(event) => setPersona(event.target.value)} />
          </label>
          <label>
            Selection / passage
            <textarea rows={4} value={selection} onChange={(event) => setSelection(event.target.value)} />
          </label>
          <label>
            Instruction
            <textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
          </label>
          <div className="chapter-editor__ai-actions">
            {aiActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-pressed={action === item.id}
                  disabled={aiRunning || !selectedChapter}
                  key={item.id}
                  onClick={() => void runAi(item.id)}
                  title={item.label}
                  type="button"
                >
                  <Icon size={16} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <label className="chapter-editor__suggestion">
            AI output
            <textarea rows={12} readOnly value={suggestion} />
          </label>
        </aside>
      </div>
    </section>
  );
}
