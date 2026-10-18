// Expectations for actual Editor authoring. Never used to fabricate the source ZIP.
export const version = '1.12.0';
export const roomAssets = [
  { assetId: 'new_city_room_day', file: 'new-city-room-day-v1.12.png', displayName: '新城市的房间（日间）' },
  { assetId: 'new_city_room_night', file: 'new-city-room-night-v1.12.png', displayName: '新城市的房间（夜间）' },
].map(asset => ({ ...asset, source: `assets/rain-story/${asset.file}；2026-10-18 内置 imagegen ${asset.assetId.endsWith('night') ? '以本批日间背景为编辑目标，仅调整夜间照明，保留房间布局' : '新生成，无输入图像'}；完整提示词、输入依赖和摘要见 assets/rain-story/source-manifest-v1.12.json。仅记录生成事实，发行条件与公开声明仍待所有者核实。` }));
export const replacements = [
  { scene: '车窗与海', sceneId: 'scene_6948f058bf7b4347', id: 'stmt_ui_200', from: 'morning_studio', to: 'new_city_room_day' },
  { scene: '车窗与海', sceneId: 'scene_6948f058bf7b4347', id: 'stmt_ui_58', from: 'morning_studio', to: 'new_city_room_day' },
  { scene: '车窗与海', sceneId: 'scene_6948f058bf7b4347', id: 'rain110_meeting_eve', from: 'night_studio', to: 'new_city_room_night' },
  { scene: '再一次见面', sceneId: 'scene_9a1c57d3f36349f1', id: 'stmt_ui_74', from: 'night_studio', to: 'new_city_room_night' },
  { scene: '雨后的天明', sceneId: 'scene_9f0052a9d0d84faa', id: 'rain18_epilogue_room', from: 'morning_studio', to: 'new_city_room_day' },
];
export const issues = [
  { scene: '车窗与海', sceneId: 'scene_6948f058bf7b4347', statementId: 'stmt_ui_203', category: 'stage', reason: '远行到达新城市后仍使用留下路线家中画室；旅馆／新生活与旧画室的画架、墙上旧画和窗外同一景物冲突。为新城市导入可辨认的日夜房间背景，替换本场开头、海边归来及见面前夜背景，保留全部文字、人物退场、配音和指令ID。' },
  { scene: '再一次见面', sceneId: 'scene_9a1c57d3f36349f1', statementId: 'stmt_ui_248', category: 'stage', reason: '送别后回到新城市房间，却又显示留下路线旧画室的夜景。使用与本路线日间房间同一布局的夜景，保留小夏退场、室内停雨和原结局演出；不把夜景换成另一间房。' },
  { scene: '雨后的天明', sceneId: 'scene_9f0052a9d0d84faa', statementId: 'stmt_ui_164', category: 'stage', reason: '留下路线结尾已明确旅行后按安排去了新城市，画面却回到旧家。仅在这段后日谈切换新城市日间房间；之前晨间远程合作、旧家整理和小夏来访仍保留旧画室，不让留下与远行的时间安排混同。' },
];
export const stages = {
  stmt_ui_146: { background: 'morning_studio', portraits: [], ambient: null },
  stmt_ui_152: { background: 'morning_studio', portraits: ['xia_smile'], ambient: null },
  stmt_ui_160: { background: 'coastal_morning', portraits: ['xia_smile'], ambient: null },
  stmt_ui_164: { background: 'new_city_room_day', portraits: [], ambient: null },
  stmt_ui_203: { background: 'new_city_room_day', portraits: [], ambient: null },
  stmt_ui_211: { background: 'coastal_morning', portraits: [], ambient: null },
  stmt_ui_213: { background: 'new_city_room_day', portraits: [], ambient: null },
  stmt_ui_219: { background: 'new_city_room_night', portraits: [], ambient: null },
  stmt_ui_221: { background: 'station_day', portraits: [], ambient: null },
  stmt_ui_246: { background: 'sample_station', portraits: [], ambient: 0.06 },
  stmt_ui_248: { background: 'new_city_room_night', portraits: [], ambient: null },
};
export function expectedScript(script) {
  return { ...script, statements: script.statements.map(statement => {
    const change = replacements.find(row => row.sceneId === script.sceneId && row.id === statement.id);
    if (!change) return statement;
    if (statement.kind !== 'direction' || statement.command !== 'background' || !statement.summary.split(' ').includes(`asset=${change.from}`)) throw Error(`Original room cue changed: ${statement.id}`);
    return { ...statement, summary: statement.summary.replace(`asset=${change.from}`, `asset=${change.to}`) };
  }) };
}
