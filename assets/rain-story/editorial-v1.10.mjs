// Editorial intent and strict audit expectations, never a production ZIP writer.
export const version = '1.10.0';
export const revision = {
  scene: '再一次见面', sceneId: 'scene_9a1c57d3f36349f1', statementId: 'stmt_ui_238', category: 'text',
  original: '小夏在画边放下一张新照片，是她课程里第一张真正完成的修复作业。照片背面写着可以继续用。林远摸着那个字，想起旧海边照片背面那句“没到的地方不必作废”。从那时拖着没有寄出的回信，到现在能坐在同一张桌前继续说话，他终于明白：故事不必按原来的样子保存，才能继续被使用。',
  text: '小夏在画边放下一张新拍的照片，里面是她在课程上修好的第一本书。照片背面写着“可以继续用”。林远看着这行字，想起旧海边照片背面那句“没到的地方不必作废”。从那时拖着没有寄出的回信，到现在能坐在同一张桌前继续说话，他终于明白：故事不必按原来的样子保存，才能继续被使用。',
  reason: '小夏学习的是旧书修复，前文已带来修好的书；结尾“照片是修复作业”容易被误读为照片修复课程。明确照片记录修好的第一本书，保留旧照片题字与分支记忆。',
};
export const choice = { id: 'stmt_ui_83', original: ['留下等雨停', '去追最后一班车'], labels: ['今晚留下，把回信写完', '今晚出发，在路上继续'] };
export const nightCue = { id: 'rain110_meeting_eve', kind: 'direction', command: 'background', summary: 'action=set asset=night_studio transition=fade duration=250ms' };
export const issues = [
  { scene: '车站的雨', sceneId: 'scene_87825610ea97b89eeea8', statementId: 'stmt_ui_5', category: 'stage', original: '售票员把窗口里的灯关掉时，雨正沿着站台的屋檐连成一条线。站台上的钟比手机慢了三分钟。林远核对了两次，没有走去询问值班员。他看见玻璃上自己的倒影，才发现他已经穿着这件外套站了很久。行李箱旁挂着新公司的地址，手机里存着一份还没签字的合同；这些东西都能说明他要去哪里，却没有一样能替他解释为什么迟迟不肯往前走。', reason: '开场林远独自等候，小夏在下一段才从街对面走来；立绘却已在第一段出现。将原 stmt_ui_4 出场指令移到 stmt_ui_7 前，保留指令 ID 和后续表情／配音。' },
  { scene: '车窗与海', sceneId: 'scene_6948f058bf7b4347', statementId: 'stmt_ui_219', category: 'stage', original: '见面前夜，他把房间整理到能够招待客人的程度，没有把未完成的画藏起来。桌边留出一个可以放书的位置，窗户也擦了。他知道小夏会看见他的新生活并没有处处整齐，但这正是他想邀请她来的地方，不是一张经过删改的展示照片。', reason: '“见面前夜”仍继承白天工作室背景。该段前使用已有夜间工作室，下一段仍按原指令切回次日早晨车站；不新增素材。' },
  revision,
  { scene: '站台前的约定', sceneId: 'scene_f3c19020bde744aa', statementId: 'stmt_ui_83', category: 'text', original: '最后一班车到了，你准备怎样继续这个约定？', reason: '“等雨停／追最后一班车”未清楚表达两条路线都继续回信与约定；列车此时已停靠。改为“今晚留下，把回信写完／今晚出发，在路上继续”，保留选项 ID、顺序和路线目标，不给其中一条增加正确答案暗示。' },
];
export const stages = {
  stmt_ui_5: { background: 'sample_station', portraits: [], ambient: 0.2 },
  stmt_ui_7: { background: 'sample_station', portraits: ['xia_letter'], ambient: 0.2 },
  stmt_ui_217: { background: 'morning_studio', portraits: [], ambient: null },
  stmt_ui_219: { background: 'night_studio', portraits: [], ambient: null },
  stmt_ui_221: { background: 'station_day', portraits: [], ambient: null },
  stmt_ui_238: { background: 'day_cafe', portraits: ['xia_smile'], ambient: 0.06 },
};
export function expectedScript(script) {
  const appearance = script.statements.find(statement => statement.id === 'stmt_ui_4');
  const statements = script.statements.flatMap(statement => {
    if (statement.id === 'stmt_ui_4') return [];
    if (statement.id === revision.statementId) { if (statement.text !== revision.original) throw Error('Original paragraph changed'); return [{ ...statement, text: revision.text }]; }
    if (statement.id === choice.id) { if (!statement.options.every((option, i) => option.label === choice.original[i])) throw Error('Original choices changed'); return [{ ...statement, options: statement.options.map((option, i) => ({ ...option, label: choice.labels[i] })) }]; }
    return [...(statement.id === 'stmt_ui_7' ? [appearance] : []), ...(statement.id === 'stmt_ui_219' ? [nightCue] : []), statement];
  });
  if (statements.includes(undefined)) throw Error('Missing original appearance instruction');
  return { ...script, statements };
}
