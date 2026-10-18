import { scenes } from './story.mjs';

// Apply through the editor; retain the original 1.2–1.5 text for historical reports.
export const revisions = [
  { scene: '车站的雨', paragraph: 0,
    text: scenes[0].prose[0].replace('林远看见玻璃上自己的倒影', '站台上的钟比手机慢了三分钟。林远核对了两次，没有走去询问值班员。他看见玻璃上自己的倒影'),
    reason: '补上两条结局共同呼应的车站慢钟，避免结尾突然引入未交代的细节。' },
  { scene: '候车室的旧信', paragraph: 5,
    text: scenes[1].prose[5].replace('第一堂课就在下个月', '第一堂课就在这个周末'),
    reason: '修书课程与远行路线第一周/第二周的时间顺序一致。' },
  { scene: '留下', paragraph: 5,
    text: scenes[3].prose[5] + '林远又给联系人发了一条消息，确认先在线上开始试合作，谈清驻地安排后再改签明早的车票。',
    reason: '明确为何留下路线第二天仍在家里线上碰面，而不是搭此前计划的早班车。' },
  { scene: '车窗与海', paragraph: 1,
    text: scenes[7].prose[1].replace('小夏说她的第一堂课也很慢。', '周末，小夏发来消息，说她的第一堂课也很慢。'),
    reason: '把第一天到达、周末上课、第二周工作变化的时间推进说清楚。' }
].map(revision => ({ ...revision, original: scenes.find(scene => scene.name === revision.scene).prose[revision.paragraph] }));

export const editedScenes = scenes.map(scene => ({ ...scene, prose: scene.prose.map((text, paragraph) => revisions.find(revision => revision.scene === scene.name && revision.paragraph === paragraph)?.text ?? text) }));
