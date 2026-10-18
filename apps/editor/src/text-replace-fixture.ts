import { projectCanonicalFromStory } from './canonical-project-adapter';
export function textReplaceFixture() {
  return projectCanonicalFromStory({ schemaVersion: 0, id: 'replace_story', title: '文字定稿', entrySceneId: 'entry', characters: [{ id: 'guide', displayName: '小雨', color: '#888888' }], scenes: [
    { id: 'entry', title: '车站', statements: [
      { id: 'intro', kind: 'narration', textId: 'intro_text', text: '小雨在车站等小雨。' },
      { id: 'talk', kind: 'dialogue', speakerId: 'guide', textId: 'talk_text', text: '小雨说：Hello [A].' },
      { id: 'pick', kind: 'choice', prompt: '小雨去哪里？', options: [{ id: 'left', label: '陪小雨留下', targetSceneId: 'scene_a' }, { id: 'right', label: '让小雨远行', targetSceneId: 'scene_b' }] }
    ] },
    { id: 'scene_a', title: '留下', statements: [{ id: 'line_a', kind: 'narration', textId: 'text_a', text: '小雨留下了。' }, { id: 'end_a', kind: 'end', endingName: '小雨的约定' }] },
    { id: 'scene_b', title: '远行', statements: [{ id: 'line_b', kind: 'narration', textId: 'text_b', text: '小雨启程。' }, { id: 'end_b', kind: 'end', endingName: '远行' }] }
  ] }, 'replace_project');
}
