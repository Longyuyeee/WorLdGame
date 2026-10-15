import { refinedScenes } from './editorial-v1.6.mjs';

// Authoring plan, not a replacement for the editor's canonical source/export path.
const original = (scene, paragraph) => refinedScenes.find(item => item.name === scene).prose[paragraph];
export const voiceRevision = {
  scene: '留下', statementId: 'stmt_ui_113', assetId: 'voice_04',
  original: '明天还要出发，可今晚的回信不用再等。',
  text: '出发的事明早确认，今晚的回信不用再等。',
  file: 'voice-04-v1.7.wav', voice: 'Microsoft Kangkang', speaker: '林远'
};
export const textRevisions = [
  { scene: '车站的雨', paragraph: 8, statementId: 'stmt_ui_21',
    text: '走向候车室之前，林远给新公司的联系人写了一条消息，说列车晚点，预计到达时间会有变化。发送成功后，他收起手机，从长椅上捡起那封信。纸角已经有些湿了，他用掌心护着，抬头等小夏。',
    reason: '把拿信和邀请放在进门前，让配音成为当下的动作，不在走进候车室后再重复邀请。' },
  { scene: '车站的雨', paragraph: 9, statementId: 'stmt_ui_23',
    text: '广播再一次提醒乘客留意车次。小夏应了一声，走在他前面推开候车室的门。林远拉着箱子跟进去。雨声被挡在玻璃外，仍然清晰；她把伞收进门边的桶里，替他留住快要合上的门。',
    reason: '删除与紧邻角色对白重复的“进去读吧”，用动作承接入室。' },
  { scene: '候车室的旧信', paragraph: 7, statementId: 'stmt_ui_45',
    text: '林远从包里找到一支快没墨的笔，在纸袋上写了两个日期。一个是试合作结束的那天，另一个是试合作结束后的第一个周末。他们并排看着，发现第二个日期两个人都可以空出来。小夏把笔推回他手边，等他把约定记进日历。',
    reason: '先写日期，再由小夏说圈起日期，不让旁白先完成同一动作。' },
  { scene: '灯下的回信', paragraph: 5, statementId: 'stmt_ui_129',
    text: '十五分钟快到了，他的回信只写了半页。林远把纸转过来，小夏也放下笔，听他念已经写好的部分。念到最后一句，他慢下来：我愿意让你知道事情正在怎样发生，而不是等我变成一个更好的人以后，才来找你。小夏把那张纸按平，手指停在他划掉的字旁。',
    reason: '把抽象的总结落到念信、停笔和纸张动作，为小夏的回应留出节奏。' },
  { scene: '灯下的回信', paragraph: 6, statementId: 'stmt_ui_131',
    text: '林远先笑了，随后点头，把手机里的闹钟拨早了十分钟。他原本还在想，小夏会怎样回答刚才那句郑重的话；看见她重新拿起笔，才发现自己已经不再等一个同样郑重的答案。明早起来以后，还有可以接着做的事情。',
    reason: '对白已经提醒闹钟，旁白只写回应，不把同一句话再讲一次。' },
  { scene: '雨后的天明', paragraph: 3, statementId: 'stmt_ui_152',
    text: '下午，小夏带着新的信纸来了。她先看那些草稿，问一张画里的窗户为什么没有关。林远讲了很长一段，讲当时想画的人，讲后来改变的颜色，也讲自己一直不知道怎么收尾。小夏听完，说她喜欢这扇窗，但如果他现在想关上，也可以试一张新的。临走前，她问起之后的行程。林远说到岗日期还要等两周后确认，有消息就告诉她。',
    reason: '把到新城市后的联系叮嘱放在告别时，明确是未来行程，不在结局之后突然问“到了”。' },
  { scene: '远行', paragraph: 1, statementId: 'stmt_ui_176',
    text: '他们拥抱了一下，短得来不及被周围的人注意。小夏问他是否读完了信，他说还差最后一页，打算在车上认真读。她看了看他的背包，问里面有没有带吃的。林远翻出半包饼干，两个人都笑了；刚才那些郑重的话，一下子有了可以接住的地方。',
    reason: '让热饭叮嘱发生在登车前、小夏仍在场时，不在关屏睡下后突然插入她的声音。' },
  { scene: '车窗与海', paragraph: 4, statementId: 'stmt_ui_211',
    text: '第一次去海边时，林远一个人坐公交。海风很大，照片里几乎看不见他。他想寄一张漂亮的明信片，挑了很久，最后买了一张背面有足够空白的。他写下站牌的位置和那条陡得让人发怵的下坡，写到第二行，忍不住把给小夏的提醒轻声念了出来。',
    reason: '配音作为写卡片时的轻声试读，不在两周后到站接人时无缘由地再说上次的路。' },
  { scene: '再一次见面', paragraph: 3, statementId: 'stmt_ui_236',
    text: '店里的灯和那晚车站附近的灯很像。小夏把修好的书放在桌上，林远取出一张刚画完的纸。画面里有候车室的窗和两个并排的位置，没有画出他们的脸。他说，想让她看见那晚的窗后来被自己画成了什么样子。小夏把画转向光亮处，看了一会儿才开口。',
    reason: '把小夏的回应放在白天店内、画仍在手里时，不在她乘车离开后再播放现场对白。' }
].map(r => ({ ...r, original: original(r.scene, r.paragraph) }));

export const voiceBeats = [
  { scene: '车站的雨', play: 'stmt_ui_8', line: 'stmt_ui_25', stop: 'stmt_ui_10', after: 'stmt_ui_21', background: 'sample_station', portrait: 'xia_thoughtful' },
  { scene: '候车室的旧信', play: 'stmt_ui_14', line: 'stmt_ui_51', stop: 'stmt_ui_16', after: 'stmt_ui_45', background: 'waiting_room', portrait: 'xia_letter' },
  { scene: '站台前的约定', play: 'stmt_ui_20', line: 'stmt_ui_81', stop: 'stmt_ui_22', after: 'stmt_ui_79', background: 'sample_station', portrait: 'xia_smile' },
  { scene: '留下', play: 'stmt_ui_26', line: 'stmt_ui_113', stop: 'stmt_ui_28', after: 'stmt_ui_109', background: 'night_cafe', portrait: 'xia_smile' },
  { scene: '灯下的回信', play: 'stmt_ui_34', line: 'stmt_ui_139', stop: 'stmt_ui_36', after: 'stmt_ui_129', background: 'night_cafe', portrait: 'xia_smile' },
  { scene: '雨后的天明', play: 'stmt_ui_46', line: 'stmt_ui_167', stop: 'stmt_ui_48', after: 'stmt_ui_152', background: 'morning_studio', portrait: 'xia_smile' },
  { scene: '远行', play: 'stmt_ui_52', line: 'stmt_ui_196', stop: 'stmt_ui_54', after: 'stmt_ui_176', background: 'sample_station', portrait: 'xia_letter' },
  { scene: '车窗与海', play: 'stmt_ui_62', line: 'stmt_ui_223', stop: 'stmt_ui_64', after: 'stmt_ui_211', background: 'coastal_morning', portrait: null },
  { scene: '再一次见面', play: 'stmt_ui_76', line: 'stmt_ui_250', stop: 'stmt_ui_78', after: 'stmt_ui_236', background: 'day_cafe', portrait: 'xia_smile' }
];
export const montageExit = { id: 'rain17_montage_exit', kind: 'direction', command: 'show', summary: 'action=hide slot=primary transition=fade duration=300ms' };

// Used only by strict audit expectations; actual candidate is edited and exported in the UI.
export function expectedScript(script) {
  const beat = voiceBeats.find(b => script.statements.some(s => s.id === b.line));
  if (!beat) throw Error(`Unknown rain scene: ${script.sceneId}`);
  const block = [beat.play, beat.line, beat.stop].map(id => {
    const statement = script.statements.find(s => s.id === id);
    if (!statement) throw Error(`Missing voice beat: ${id}`);
    return statement.id === voiceRevision.statementId ? { ...statement, text: voiceRevision.text } : statement;
  });
  const statements = script.statements.filter(s => !block.some(b => b.id === s.id)).flatMap(s => {
    const revision = textRevisions.find(r => r.statementId === s.id);
    const current = revision ? { ...s, text: revision.text } : s;
    return s.id === beat.after ? [current, ...block, ...(beat.line === 'stmt_ui_167' ? [montageExit] : [])] : [current];
  });
  return { ...script, statements };
}
