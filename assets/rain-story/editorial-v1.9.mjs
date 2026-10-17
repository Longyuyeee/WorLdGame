// Editorial intent and strict audit expectations, not a production ZIP writer.
export const continuityVersion = '1.9.0';
export const continuityTextRevisions = [{
  scene: '再一次见面', sceneId: 'scene_9a1c57d3f36349f1', statementId: 'stmt_ui_238',
  original: '小夏在画边放下一张新照片，是她课程里第一张真正完成的修复作业。照片背面写着可以继续用。林远摸着那个字，想起他们给旧海边照片留下的那行空白。故事并没有因为搬到新的城市就作废，也不必永远按原来的样子保存，才能继续被使用。',
  text: '小夏在画边放下一张新照片，是她课程里第一张真正完成的修复作业。照片背面写着可以继续用。林远摸着那个字，想起旧海边照片背面那句“没到的地方不必作废”。从那时拖着没有寄出的回信，到现在能坐在同一张桌前继续说话，他终于明白：故事不必按原来的样子保存，才能继续被使用。',
  reason: '远行路线没有发生共同去海边、在照片日期旁留白的经历；回扣两条路线共享的旧照片题字，不能借用留下路线的记忆。', category: 'text',
}];
export const continuityIssues = [
  ...continuityTextRevisions,
  { scene: '候车室的旧信', sceneId: 'scene_fff36353633c42d1', statementId: 'stmt_ui_31', category: 'stage',
    original: '候车室里只剩一排灯还亮着。小夏选了靠窗的两张椅子，隔着玻璃能看见站台上的信号灯。林远把箱子放在脚边，拆信前先问她是否介意读出声。她摇头，说如果有哪句让他不知道怎么接，也可以先停下来。信不是考试，不要求谁立刻给出正确答案。',
    reason: '从站台进入隔着玻璃的候车室后仍沿用室外雨声音量；进门降低到 8%，返回站台时恢复 20%，对应人物所在位置。' },
  { scene: '灯下的回信', sceneId: 'scene_57cb9677c3e74e68', statementId: 'stmt_ui_137', category: 'stage',
    original: '走出店门，雨只剩细细的一层。林远把刚才没写完的句子记进手机，又把屏幕关掉，陪小夏走到公交站。他终于能够让一件事情暂时没有完成，而不把暂时理解成永远；也能够说今晚就到这里，不必用拖延把不舍藏起来。',
    reason: '走出面馆送到公交站时背景仍在店内；新增独立夜雨公交站画面，保留小夏立绘，雨已减弱时改用 6% 雨声。' },
];
export const continuityCues = [
  { before: 'stmt_ui_31', cues: [{ id: 'rain19_waiting_rain', kind: 'direction', command: 'audio', summary: 'action=play asset=soft_rain bus=ambient loop=true volume=0.08' }] },
  { before: 'stmt_ui_61', cues: [{ id: 'rain19_platform_rain', kind: 'direction', command: 'audio', summary: 'action=play asset=soft_rain bus=ambient loop=true volume=0.2' }] },
  { before: 'stmt_ui_137', cues: [
    { id: 'rain19_bus_stop', kind: 'direction', command: 'background', summary: 'action=set asset=bus_stop_night transition=fade duration=300ms' },
    { id: 'rain19_farewell_rain', kind: 'direction', command: 'audio', summary: 'action=play asset=soft_rain bus=ambient loop=true volume=0.06' },
  ] },
];
export const continuityStages = {
  stmt_ui_31: { background: 'waiting_room', portraits: ['xia_thoughtful'], ambient: 0.08 },
  stmt_ui_61: { background: 'sample_station', portraits: ['xia_thoughtful'], ambient: 0.2 },
  stmt_ui_137: { background: 'bus_stop_night', portraits: ['xia_smile'], ambient: 0.06 },
  stmt_ui_146: { background: 'morning_studio', portraits: [], ambient: null },
  stmt_ui_238: { background: 'day_cafe', portraits: ['xia_smile'], ambient: 0.06 },
};
export const addedAsset = {
  assetId: 'bus_stop_night', displayName: '夜雨中的公交站', kind: 'background',
  digest: 'a1e6e500aa1ca5d4b0dcdca821070f1b17f617a14227f76a83eb0257e128847b', byteLength: 2788367,
  source: 'assets/rain-story/bus-stop-night.png；2026-10-17 内置 imagegen 新生成，未使用输入图像；完整提示词和摘要见 assets/rain-story/source-manifest-v1.9.json。仅记录制作来源，适用条款、公开声明及发行条件仍待所有者核实。',
};
export function expectedContinuityScript(script) {
  return { ...script, statements: script.statements.flatMap(statement => {
    const revision = continuityTextRevisions.find(item => item.statementId === statement.id);
    if (revision && statement.text !== revision.original) throw Error(`Original paragraph changed: ${statement.id}`);
    return [...(continuityCues.find(item => item.before === statement.id)?.cues ?? []), revision ? { ...statement, text: revision.text } : statement];
  }) };
}
