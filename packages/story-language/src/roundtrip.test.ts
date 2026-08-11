import { describe, expect, it } from "vitest";
import { formatStory, parseStory, semanticSnapshot } from "./index";

const referenceStory = `# 天台场景：注释必须跟随原位置
scene "序章 · 天台" @id(scn_rooftop) chapter=prologue

@background rooftop transition=fade duration=800ms future=value
@show lin expression=smile position=center
@weather.set kind=snow intensity=0.7

lin: 如果明天真的下雪，你还会来这里吗？ @id(txt_rooftop_001)
choice "要怎么回答？" @id(choice_rooftop_001)
  "我答应你，一定会来。" -> promise @id(opt_promise)
  "你是不是有事瞒着我？" -> ask_truth @id(opt_truth)

label promise
set promised = true
lin: 那就说好了。雪停之前，谁都不许失约。 @id(txt_promise_001)
end "约定之雪" @id(end_promise)
`;

function expectRoundTrip(source: string): void {
  const first = parseStory(source);
  const formatted = formatStory(first);
  const second = parseStory(formatted);
  expect(semanticSnapshot(second)).toEqual(semanticSnapshot(first));
}

describe("canonical .world round-trip", () => {
  it("parses the reference grammar without diagnostics", () => {
    const document = parseStory(referenceStory);

    expect(document.diagnostics).toEqual([]);
    expect(document.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "scene", id: "scn_rooftop" }),
        expect.objectContaining({ kind: "dialogue", textId: "txt_rooftop_001" }),
        expect.objectContaining({ kind: "choice", id: "choice_rooftop_001" }),
        expect.objectContaining({ kind: "choice-option", id: "opt_promise" }),
        expect.objectContaining({ kind: "set", expressionRaw: "true" }),
        expect.objectContaining({ kind: "end", id: "end_promise" })
      ])
    );
    expectRoundTrip(referenceStory);
  });

  it("preserves comments, blank segmentation, unknown commands and raw strings", () => {
    const first = parseStory(referenceStory);
    const unknown = first.nodes.find(
      (node) => node.kind === "opaque" && node.reason === "unknown-command"
    );

    expect(unknown).toEqual(
      expect.objectContaining({ raw: "@weather.set kind=snow intensity=0.7" })
    );
    expect(formatStory(first)).toContain("# 天台场景：注释必须跟随原位置");
    expect(formatStory(first)).toContain("\n\n@background");
    expect(formatStory(first)).toContain('choice "要怎么回答？"');
  });

  it("reports precise diagnostics but keeps malformed input as opaque nodes", () => {
    const source = `scene "没有闭合 @id(scn_bad)
choice "缺少箭头"
  "选项" target @id()
this is not syntax
`;
    const document = parseStory(source);

    expect(document.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "MISSING_SCENE_HEADER",
        "MALFORMED_SCENE",
        "MALFORMED_CHOICE_OPTION",
        "UNRECOGNIZED_SYNTAX"
      ])
    );
    expect(document.diagnostics.every((item) => item.range.start.line >= 1)).toBe(true);
    expect(document.nodes).toHaveLength(4);
    expect(document.nodes.filter((node) => node.kind === "opaque")).toHaveLength(3);
    expect(document.nodes[1]).toEqual(
      expect.objectContaining({ kind: "choice", promptRaw: '"缺少箭头"' })
    );
    expect(formatStory(document)).toContain("this is not syntax");
  });

  it("detects duplicate stable IDs without dropping either statement", () => {
    const document = parseStory(`scene "测试" @id(scn_test)
lin: 第一行 @id(txt_same)
lin: 第二行 @id(txt_same)
`);

    expect(document.diagnostics).toEqual([
      expect.objectContaining({ code: "DUPLICATE_ID", range: expect.any(Object) })
    ]);
    expect(document.nodes.filter((node) => node.kind === "dialogue")).toHaveLength(2);
  });

  it("diagnoses malformed directives, labels and assignments without evaluating them", () => {
    const document = parseStory(`scene "防御样本" @id(scn_hostile)
@
label two words
set dangerous = globalThis.process.exit()
set missing
`);

    expect(document.diagnostics.map((item) => item.code)).toEqual([
      "MALFORMED_DIRECTIVE",
      "MALFORMED_LABEL",
      "MALFORMED_SET"
    ]);
    expect(document.nodes[3]).toEqual(
      expect.objectContaining({
        kind: "set",
        variable: "dangerous",
        expressionRaw: "globalThis.process.exit()"
      })
    );
    expect(formatStory(document)).toContain("set dangerous = globalThis.process.exit()");
  });

  it("normalizes CRLF and canonical whitespace without changing semantics", () => {
    const source =
      'scene   "换行测试"    @id(scn_line)\r\n\r\n  lin  :  保留文本空格   @id(txt_line)\r\n';
    expectRoundTrip(source);
    const formatted = formatStory(parseStory(source));
    expect(formatted).not.toContain("\r");
    expect(formatted).toContain('scene "换行测试" @id(scn_line)');
  });

  it("holds semantic equivalence for 100 deterministic whitespace variants", () => {
    let state = 0x5f3759df;
    const next = (maximum: number) => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state % maximum;
    };
    const spaces = () => " ".repeat(next(5) + 1);

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const source = [
        `scene${spaces()}"随机 ${iteration}"${spaces()}@id(scn_${iteration})`,
        "",
        `@background${spaces()}school_gate${spaces()}transition=fade`,
        `narrator${spaces()}:${spaces()}第 ${iteration} 行${spaces()}@id(txt_${iteration})`,
        `choice${spaces()}"选择"${spaces()}@id(choice_${iteration})`,
        `${spaces()}"继续"${spaces()}->${spaces()}next${spaces()}@id(opt_${iteration})`,
        `label${spaces()}next`,
        `set${spaces()}visited${spaces()}=${spaces()}true`,
        `end${spaces()}"结束"${spaces()}@id(end_${iteration})`
      ].join("\n");

      const parsed = parseStory(source);
      expect(parsed.diagnostics, `iteration ${iteration}`).toEqual([]);
      expectRoundTrip(source);
    }
  });
});
