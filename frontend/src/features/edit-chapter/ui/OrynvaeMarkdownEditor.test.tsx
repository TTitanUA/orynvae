// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { OrynvaeEditorGateway } from "../model/editor-gateway";
import { OrynvaeMarkdownEditor } from "./OrynvaeMarkdownEditor";

afterEach(() => {
  cleanup();
});

function requireGateway(gateway: OrynvaeEditorGateway | null): OrynvaeEditorGateway {
  if (!gateway) {
    throw new Error("Gateway was not initialized");
  }
  return gateway;
}

describe("OrynvaeMarkdownEditor", () => {
  it("renders markdown and exposes gateway operations", async () => {
    let gateway: OrynvaeEditorGateway | null = null;
    let changedMarkdown = "";
    const { container } = render(
      <OrynvaeMarkdownEditor
        documentKey="doc-1"
        markdown={"# Глава\n\nСтарый текст."}
        onChange={(markdown) => {
          changedMarkdown = markdown;
        }}
        onGatewayReady={(nextGateway) => {
          gateway = nextGateway;
        }}
      />,
    );

    await waitFor(() => expect(gateway).not.toBeNull());
    expect(container.textContent).toContain("Старый текст.");

    act(() => {
      gateway?.replaceRange({ from: 9, to: 21, text: "Новый текст" });
    });

    await waitFor(() => expect(changedMarkdown).toContain("Новый текст"));
    expect(requireGateway(gateway).getMarkdown()).toContain("Новый текст");
  });

  it("blocks gateway mutations in read-only mode", async () => {
    let gateway: OrynvaeEditorGateway | null = null;
    let changedMarkdown = "";
    render(
      <OrynvaeMarkdownEditor
        documentKey="doc-readonly"
        markdown="Только чтение"
        onChange={(markdown) => {
          changedMarkdown = markdown;
        }}
        onGatewayReady={(nextGateway) => {
          gateway = nextGateway;
        }}
        readOnly
      />,
    );

    await waitFor(() => expect(gateway).not.toBeNull());

    act(() => {
      gateway?.replaceRange({ from: 0, to: 6, text: "Правка" });
    });

    expect(requireGateway(gateway).getMarkdown()).toBe("Только чтение");
    expect(changedMarkdown).toBe("");
  });

  it("shows and clears inline suggestion decorations", async () => {
    let gateway: OrynvaeEditorGateway | null = null;
    const { container } = render(
      <OrynvaeMarkdownEditor
        documentKey="doc-suggestion"
        markdown="Фрагмент для правки"
        onGatewayReady={(nextGateway) => {
          gateway = nextGateway;
        }}
      />,
    );

    await waitFor(() => expect(gateway).not.toBeNull());

    act(() => {
      gateway?.showInlineSuggestion({ id: "suggestion-1", from: 0, to: 8, text: "Новый фрагмент" });
    });

    await waitFor(() =>
      expect(container.querySelector(".orynvae-markdown-editor__suggestion")).not.toBeNull(),
    );

    act(() => {
      gateway?.clearInlineSuggestion("suggestion-1");
    });

    await waitFor(() =>
      expect(container.querySelector(".orynvae-markdown-editor__suggestion")).toBeNull(),
    );
  });
});
