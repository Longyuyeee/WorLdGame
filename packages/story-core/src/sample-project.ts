import type { StoryProject } from "./model";

export const campusStoryProject: StoryProject = {
  schemaVersion: 0,
  id: "prj_twilight_broadcast",
  title: "黄昏广播",
  entrySceneId: "scn_school_gate",
  characters: [
    { id: "char_yu", displayName: "陆雨", color: "#8B7CFF" },
    { id: "char_xia", displayName: "林夏", color: "#FF62A5" }
  ],
  scenes: [
    {
      id: "scn_school_gate",
      title: "放学后的校门",
      statements: [
        {
          id: "stmt_gate_bg",
          kind: "direction",
          command: "background",
          summary: "action=clear"
        },
        {
          id: "stmt_gate_001",
          kind: "dialogue",
          speakerId: "char_xia",
          textId: "txt_gate_001",
          text: "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
        },
        {
          id: "stmt_gate_002",
          kind: "dialogue",
          speakerId: "char_yu",
          textId: "txt_gate_002",
          text: "听见了。声音像是从很多年前传过来的。"
        },
        {
          id: "stmt_gate_choice",
          kind: "choice",
          prompt: "先去哪里调查？",
          options: [
            {
              id: "opt_broadcast",
              label: "去广播室",
              targetSceneId: "scn_broadcast_room"
            },
            {
              id: "opt_rooftop",
              label: "去天台",
              targetSceneId: "scn_rooftop"
            }
          ]
        }
      ]
    },
    {
      id: "scn_broadcast_room",
      title: "旧广播室",
      statements: [
        {
          id: "stmt_radio_bg",
          kind: "direction",
          command: "background",
          summary: "action=clear"
        },
        {
          id: "stmt_radio_001",
          kind: "dialogue",
          speakerId: "char_xia",
          textId: "txt_radio_001",
          text: "这盘磁带的日期，正好是学校建校纪念日。"
        },
        { id: "stmt_radio_end", kind: "end", endingName: "留在电波里的名字" }
      ]
    },
    {
      id: "scn_rooftop",
      title: "风中的天台",
      statements: [
        {
          id: "stmt_rooftop_bg",
          kind: "direction",
          command: "background",
          summary: "action=clear"
        },
        {
          id: "stmt_rooftop_001",
          kind: "dialogue",
          speakerId: "char_yu",
          textId: "txt_rooftop_001",
          text: "留言里提到的那颗星，也许只有从这里才能看见。"
        },
        { id: "stmt_rooftop_end", kind: "end", endingName: "晚风知道答案" }
      ]
    }
  ]
};
