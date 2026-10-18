// Editorial intent only. The candidate is applied and exported through the editor.
export const continuityVersion = '1.8.0';
export const continuityTextRevisions = [
  { scene: '车站的雨', sceneId: 'scene_87825610ea97b89eeea8', statementId: 'stmt_ui_9',
    original: '照片上是一片没有拍到人的海。去年他们各自请了半天假，到了车站才知道列车停运，只能在便利店买两杯热饮，坐着听了一下午雨。那张照片后来由小夏寄来，背面写着：没到的地方不必作废。林远把它夹进书里，每次搬家都带着，却一次也没有认真回复。',
    text: '照片上是一片没有拍到人的海。去年他们各自请了半天假，到了车站才知道列车停运，只能在便利店买两杯热饮，坐着听了一下午雨。后来小夏独自去了那片海，把拍下的照片寄给他，背面写着：没到的地方不必作废。林远把它夹进书里，每次搬家都带着，却一次也没有认真回复。',
    reason: '明确没能同行与后来寄来海边照片之间的因果，也保留小夏独立行动的生活。' },
  { scene: '灯下的回信', sceneId: 'scene_57cb9677c3e74e68', statementId: 'stmt_ui_135',
    original: '关门前，他们把餐桌擦干，向老板道谢。小夏拿走自己的信封，林远留下回信给她；那张旧照片仍放在书中。他们没有交换一件用来抵押未来的东西，只交换了今天认真说过的话，以及之后还愿意联系的地址。',
    text: '关门前，他们把餐桌擦干，向老板道谢。小夏把林远的回信收进包里，林远将她的信装回那个有些软的信封；旧照片仍夹在书中。他们没有交换一件用来抵押未来的东西，只交换了今天认真说过的话，以及之后还愿意联系的地址。',
    reason: '两封信分别由收信人保管，旧照片留在林远的书中，避免信封被拿回而信的去向不明。' },
  { scene: '雨后的天明', sceneId: 'scene_9f0052a9d0d84faa', statementId: 'stmt_ui_164',
    original: '留下没有让路消失。林远仍然去过新的城市，小夏也开始了她的课程；他们仍有各自的工作和需要独自作出的决定。但每当故事走到一个需要停下来说明的地方，他们都知道可以把信拿出来，坐到灯下，把未说完的话继续写完。',
    text: '这次旅行以后，林远按谈妥的安排去了新的城市，小夏也继续她的课程。留下没有让路消失，只让他们在出发前把话说清楚。他们仍有各自的工作和需要独自作出的决定；每当生活又需要调整，就把信拿出来，坐到灯下，把未说完的话继续写完。',
    reason: '明确海边旅行之后才按协商安排远行，结束回顾前人物退场并回到日常室内，不让海边画面承担跨日总结。' },
  { scene: '再一次见面', sceneId: 'scene_9a1c57d3f36349f1', statementId: 'stmt_ui_234',
    original: '下午开始下雨，去海边的车仍然开着，但风已经很大。他们站在站牌旁看了一会儿，决定按第二个计划找一间店坐下。林远没有再把改计划当成辜负准备的证据；小夏也没有说反正去哪里都一样。他们承认想看海，又认真选择今天更舒服的安排。',
    text: '吃完早餐，他们先回房间放下行李。午后再到车站时，雨比早晨密了，去海边的列车仍照常开着。风把屋檐边的雨丝吹到脚边，他们看了一会儿，决定按第二个计划回店里坐下。林远没有把改计划当成辜负准备，小夏也没有说去哪里都一样；他们承认想看海，又认真选择今天更舒服的安排。',
    reason: '衔接有雨的早餐背景，补齐住处到午后站台的时间和地点，使用现有站台画面而不是让人物一直留在店内。' },
  { scene: '再一次见面', sceneId: 'scene_9a1c57d3f36349f1', statementId: 'stmt_ui_236',
    original: '店里的灯和那晚车站附近的灯很像。小夏把修好的书放在桌上，林远取出一张刚画完的纸。画面里有候车室的窗和两个并排的位置，没有画出他们的脸。他说，想让她看见那晚的窗后来被自己画成了什么样子。小夏把画转向光亮处，看了一会儿才开口。',
    text: '早晨坐过的那张桌子还空着，灯和那晚车站附近的灯很像。小夏把修好的书放在桌上，林远取出一张刚画完的纸。画面里有候车室的窗和两个并排的位置，没有画出他们的脸。他说，想让她看见那晚的窗后来被自己画成了什么样子。小夏把画转向光亮处，看了一会儿才开口。',
    reason: '明确回到同一间店，转场和雨声转为室内后再接原有看画对白，九句配音不重写。' },
];

export const continuityCues = [
  { before: 'stmt_ui_164', cues: [
    { id: 'rain18_epilogue_exit', kind: 'direction', command: 'show', summary: 'action=hide slot=primary transition=fade duration=300ms' },
    { id: 'rain18_epilogue_room', kind: 'direction', command: 'background', summary: 'action=set asset=morning_studio transition=fade duration=300ms' },
  ] },
  { before: 'stmt_ui_232', cues: [
    { id: 'rain18_breakfast_rain', kind: 'direction', command: 'audio', summary: 'action=play asset=soft_rain bus=ambient loop=true volume=0.06' },
  ] },
  { before: 'stmt_ui_234', cues: [
    { id: 'rain18_afternoon_station', kind: 'direction', command: 'background', summary: 'action=set asset=station_day transition=fade duration=300ms' },
  ] },
  { before: 'stmt_ui_236', cues: [
    { id: 'rain18_return_cafe', kind: 'direction', command: 'background', summary: 'action=set asset=day_cafe transition=fade duration=300ms' },
    { id: 'rain18_indoor_rain', kind: 'direction', command: 'audio', summary: 'action=play asset=soft_rain bus=ambient loop=true volume=0.06' },
  ] },
  { before: 'stmt_ui_242', cues: [
    { id: 'rain18_departure_rain', kind: 'direction', command: 'audio', summary: 'action=play asset=soft_rain bus=ambient loop=true volume=0.1' },
  ] },
];

export const continuityStages = {
  stmt_ui_164: { background: 'morning_studio', portraits: [], ambient: null },
  stmt_ui_232: { background: 'day_cafe', portraits: ['xia_smile'], ambient: 0.06 },
  stmt_ui_234: { background: 'station_day', portraits: ['xia_smile'], ambient: 0.1 },
  stmt_ui_236: { background: 'day_cafe', portraits: ['xia_smile'], ambient: 0.06 },
  stmt_ui_242: { background: 'sample_station', portraits: ['xia_thoughtful'], ambient: 0.1 },
  stmt_ui_248: { background: 'night_studio', portraits: [], ambient: null },
};

/** Strict expected delta for audit only, never a production source writer. */
export function expectedContinuityScript(script) {
  const statements = script.statements.flatMap(statement => {
    const revision = continuityTextRevisions.find(item => item.statementId === statement.id);
    if (revision && statement.text !== revision.original) throw Error(`Original paragraph changed: ${statement.id}`);
    const cues = continuityCues.find(item => item.before === statement.id)?.cues ?? [];
    return [...cues, revision ? { ...statement, text: revision.text } : statement];
  });
  return { ...script, statements };
}
