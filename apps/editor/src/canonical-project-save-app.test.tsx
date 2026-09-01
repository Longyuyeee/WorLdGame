import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { campusStoryProject, type StoryProject } from "@world-studio/story-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

afterEach(() => vi.unstubAllGlobals());

describe("canonical project content save bridge", () => {
  it("publishes committed Script edits to the lifecycle host when the creator saves", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const canonical = projectCanonicalFromStory(campusStoryProject, "content-save-bridge");
    const onProjectChange = vi.fn<(project: StoryProject) => void>();
    const onProjectSave = vi.fn(async (_project: StoryProject) => undefined);
    render(<App initialProject={canonical} onProjectChange={onProjectChange} onProjectSave={onProjectSave} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "保存到本机" })).toBeEnabled());
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const editor = screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: editor.value.replace("声音像是从很多年前传过来的。", "声音从保存后的工程里传来。") } });
    fireEvent.blur(editor);

    await waitFor(() => expect(onProjectChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "黄昏广播" })));
    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    await waitFor(() => expect(onProjectSave).toHaveBeenCalledTimes(1));
    expect(onProjectSave.mock.calls[0]?.[0].scenes[0]?.statements).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "dialogue", text: "听见了。声音从保存后的工程里传来。" })
    ]));
  });
});
