const fields = document.getElementById('fields');
const status = document.getElementById('status');
const open = document.getElementById('open');
const play = document.getElementById('play');
const playStatus = document.getElementById('play-status');
window.packager.onPreviewEnded(() => { play.disabled = false; playStatus.textContent = '游戏已退出，可以再次试玩。'; });
play.onclick = async () => {
  play.disabled = true;
  try {
    const error = await window.packager.playOutput();
    playStatus.textContent = error || '游戏已启动，请切换到游戏窗口。退出前记得保存进度。';
    if (error) play.disabled = false;
  } catch { play.disabled = false; playStatus.textContent = '启动连接中断，请重新打开工具。'; }
};
for (const button of document.querySelectorAll('[data-pick]')) button.onclick = async () => {
  const path = await window.packager.chooseDirectory();
  if (path) document.getElementById(button.dataset.pick).value = path;
};
window.packager.onProgress(message => { status.textContent = message; });
document.getElementById('form').onsubmit = async event => {
  event.preventDefault();
  fields.disabled = true; open.hidden = true; play.hidden = true;
  status.textContent = '正在检查游戏文件…';
  try {
    const result = await window.packager.build(Object.fromEntries(['source', 'parent', 'name'].map(id => [id, document.getElementById(id).value.trim()])));
    status.textContent = result.error ? `未完成：${result.error}\n修正后可再次点击“制作游戏包”。` : `游戏包已完成：${result.output}\n点击“立即试玩”检查作品；分发时提供整个文件夹。`;
    open.hidden = !result.output;
    play.hidden = !result.output;
  } catch { status.textContent = '打包连接中断，请重新打开工具后重试。'; }
  finally { fields.disabled = false; }
};
open.onclick = async () => { const error = await window.packager.openOutput(); if (error) status.textContent = `无法打开文件夹：${error}`; };
