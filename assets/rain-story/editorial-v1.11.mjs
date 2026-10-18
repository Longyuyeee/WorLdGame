// Editorial expectations only. The candidate itself is authored in the editor.
export const version = '1.11.0';
export const revision = {
  scene: '车窗与海', sceneId: 'scene_6948f058bf7b4347', statementId: 'stmt_ui_217', category: 'text',
  original: '约定见面的日期越来越近。小夏说车票买好了，问他是不是还记得雨天的第二个计划。林远把附近的店和去海边的路线都查了一遍，没有把晴天当成这一次值得见面的前提。他更想给她看那些在工作和生活里一点点增加的东西。',
  text: '约定见面的日期越来越近。小夏说车票买好了。两人商量先去海边，如果风雨太大，就在附近找家店坐下，把没说完的话接着讲。林远把附近的店和去海边的路线都查了一遍，没有把晴天当成这一次值得见面的前提。他更想给她看那些在工作和生活里一点点增加的东西。',
  reason: '远行路线直接提到“雨天的第二个计划”，但具体备用安排只在留下路线 stmt_ui_133 出现。于远行自己的见面筹备中明确海边与风雨时找店坐下两个安排，供后文 stmt_ui_234 回扣，不借用另一分支的经历。',
};
export const rainCue = { id: 'rain111_return_rain', kind: 'direction', command: 'audio', summary: 'action=play asset=soft_rain bus=ambient loop=true volume=0.06' };
export const issues = [revision, {
  scene: '再一次见面', sceneId: 'scene_9a1c57d3f36349f1', statementId: 'stmt_ui_246', category: 'stage',
  original: '列车走后，林远收到她的第一条消息：已经坐好，窗外有灯。他回，正在回家，雨比刚才小了。消息很普通，却把两个人的路线重新连在一起。之后仍然会有很多这样普通的晚上，故事正是在它们里面继续，而不是只停在最郑重的一次决定上。',
  reason: '送别后的正文明确“雨比刚才小了”，环境音却一直继承站台 10% 雨声。小夏退场后、此段前用同一 soft_rain 调整为 6%，夜间回房仍按原指令停止；不改九句配音或素材。实际自然听感仍待人工复核。',
}];
export function expectedScript(script) {
  return { ...script, statements: script.statements.flatMap(statement => {
    if (statement.id === revision.statementId) {
      if (statement.text !== revision.original) throw Error('Original paragraph changed');
      return [{ ...statement, text: revision.text }];
    }
    if (statement.id === 'stmt_ui_246') return [rainCue, statement];
    return [statement];
  }) };
}
export const stages = {
  stmt_ui_217: { background: 'morning_studio', portraits: [], ambient: null },
  stmt_ui_219: { background: 'night_studio', portraits: [], ambient: null },
  stmt_ui_234: { background: 'station_day', portraits: ['xia_smile'], ambient: 0.1 },
  stmt_ui_242: { background: 'sample_station', portraits: ['xia_thoughtful'], ambient: 0.1 },
  stmt_ui_244: { background: 'sample_station', portraits: ['xia_thoughtful'], ambient: 0.1 },
  stmt_ui_246: { background: 'sample_station', portraits: [], ambient: 0.06 },
  stmt_ui_248: { background: 'night_studio', portraits: [], ambient: null },
};
