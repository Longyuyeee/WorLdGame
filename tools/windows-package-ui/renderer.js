const fields = document.getElementById('fields');
const status = document.getElementById('status');
const open = document.getElementById('open');
for (const button of document.querySelectorAll('[data-pick]')) button.onclick = async () => {
  const path = await window.packager.chooseDirectory();
  if (path) document.getElementById(button.dataset.pick).value = path;
};
window.packager.onProgress(message => { status.textContent = message; });
document.getElementById('form').onsubmit = async event => {
  event.preventDefault();
  fields.disabled = true; open.hidden = true;
  status.textContent = '正在检查游戏文件…';
  try {
    const result = await window.packager.build(Object.fromEntries(['source', 'parent', 'name'].map(id => [id, document.getElementById(id).value.trim()])));
    status.textContent = result.error ? `未完成：${result.error}\n修正后可再次点击“制作游戏包”。` : `游戏包已完成：${result.output}\n请打开文件夹，双击 WorLdPlayer.exe 试玩；分发时提供整个文件夹。`;
    open.hidden = !result.output;
  } catch { status.textContent = '打包连接中断，请重新打开工具后重试。'; }
  finally { fields.disabled = false; }
};
open.onclick = async () => { const error = await window.packager.openOutput(); if (error) status.textContent = `无法打开文件夹：${error}`; };
