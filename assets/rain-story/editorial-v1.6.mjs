import { editedScenes } from './editorial-v1.5.1.mjs';

// Changes are applied through the editor; old authored sources and candidates stay intact.
const original = (scene, paragraph) => editedScenes.find(item => item.name === scene).prose[paragraph];
export const revisions = [
  { scene: '候车室的旧信', paragraph: 7, statementId: 'stmt_ui_45',
    text: original('候车室的旧信', 7).replace('小夏第一堂课后的周末', '试合作结束后的第一个周末'),
    reason: '见面安排应在两周试合作之后，避免第一堂课的下个周末早于远行路线的试合作收尾。' },
  { scene: '留下', paragraph: 5, statementId: 'stmt_ui_101',
    text: original('留下', 5).replace('谈清驻地安排后再改签明早的车票', '并把明早的车票退掉，等驻地安排确定后再买票'),
    reason: '明确取消次晨乘车，避免前面说搭明早列车、后面却在家线上工作的行程断裂。' },
  { scene: '雨后的天明', paragraph: 1, statementId: 'stmt_ui_148',
    text: original('雨后的天明', 1) + '双方约好这两周先远程合作，结束后再确认到岗日期。',
    reason: '补齐留下路线实际远程安排，不把线上碰面误解为已经搬到新城市。' },
  { scene: '雨后的天明', paragraph: 4, statementId: 'stmt_ui_154',
    text: original('雨后的天明', 4).replace('昨天的谈话', '那晚的谈话'),
    reason: '此段已概述数日的联系，不继续以“昨天”固定整个蒙太奇的时间。' },
  { scene: '雨后的天明', paragraph: 5, statementId: 'stmt_ui_156',
    text: original('雨后的天明', 5).replace('约好的周末终于到了', '两周后，约好的周末终于到了'),
    reason: '显式承接共同确定的两周后见面，不让课程和试合作发生在含糊的一周内。' }
].map(change => ({ ...change, original: original(change.scene, change.paragraph) }));

export const refinedScenes = editedScenes.map(scene => ({ ...scene,
  prose: scene.prose.map((text, paragraph) => revisions.find(change => change.scene === scene.name && change.paragraph === paragraph)?.text ?? text)
}));

export const newBackgrounds = [
  { assetId: 'station_day', file: 'station-day.png', name: '雨后白天站台', reference: 'station-night-v2.png' },
  { assetId: 'day_cafe', file: 'day-cafe.png', name: '白天的面馆', reference: 'night-cafe.png' },
  { assetId: 'night_studio', file: 'night-studio.png', name: '夜归的画室', reference: 'morning-studio.png' }
];
export const backgroundChanges = [
  { scene: '雨后的天明', statementId: 'stmt_ui_40', anchor: 'stmt_ui_158', from: 'sample_station', to: 'station_day' },
  { scene: '车窗与海', statementId: 'stmt_ui_60', anchor: 'stmt_ui_221', from: 'sample_station', to: 'station_day' },
  { scene: '再一次见面', statementId: 'stmt_ui_227', anchor: 'stmt_ui_230', from: 'sample_station', to: 'station_day' },
  { scene: '再一次见面', statementId: 'stmt_ui_66', anchor: 'stmt_ui_232', from: 'night_cafe', to: 'day_cafe' },
  { scene: '再一次见面', statementId: 'stmt_ui_74', anchor: 'stmt_ui_248', from: 'morning_studio', to: 'night_studio' }
];
export const audioChanges = [
  { scene: '再一次见面', after: 'stmt_ui_232', before: 'stmt_ui_234', action: 'play', asset: 'soft_rain', bus: 'ambient', volume: '0.10', loop: true },
  { scene: '再一次见面', after: 'stmt_ui_74', before: 'stmt_ui_248', action: 'stop', bus: 'ambient' }
];
