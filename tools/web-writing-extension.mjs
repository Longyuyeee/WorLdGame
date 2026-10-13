import assert from 'node:assert/strict';
const opening = [
  '车站的钟慢了三分钟。小夏把这件事记在旧车票背面，好像只要写下来，离别也能慢一点。',
  '她原本只来送还一本书。书页里夹着我们去年约好一起看的海，照片已经被雨打湿了边角。',
  '你真的决定今晚走吗？她问。售票窗口已经熄灯，站台上只剩自动售货机的低鸣。',
  '我说，工作通知不会等雨停。可我一直没有把行李箱拉到检票线后面。',
  '那至少把书收好。她把书递给我，又收了回去，认真擦掉封面上的水。',
  '去年夏天，我们在这里等过一班停运的车。那时谁也不急着知道明天会发生什么。',
  '广播响了。最后一班列车将在十分钟后进站，请乘客准备检票。',
  '小夏抬头看钟，没有再劝我。她只是把那张旧照片放进书里，留出了一个角。',
  '其实我也有一封信。她说，是给明年这个时候的我们。',
  '信里写了什么？我问。她摇头，说现在拆开就不算约定了。',
  '雨水顺着站台边缘落下。远处的信号灯从红色变成绿色，我们都看见了。',
  '去新的地方并不可怕。她说，我怕的是你把想做的事情留在这里，再也不回来拿。',
  '我想到那间租了三年、始终没有放进画架的房间，和桌上没写完的申请。',
  '列车的灯出现在弯道尽头。箱子的把手握在我手里，比刚才更重。',
  '小夏把信放在长椅上。你可以带走，也可以和我一起等雨停。',
  '这次不是选一座城市。我需要决定，要怎样认真对待眼前的人和自己还没完成的愿望。'
];
const stay = [
  '我松开箱子的把手。先找一家还开着的店吧，我说，信可以晚一点再读。',
  '小夏没有笑着宣布胜利。她问我，留下来是因为想好了，还是只是怕说再见。',
  '我说，明天仍会联系那家公司，也会把自己的画交给他们看。今晚不想再把话留到下一次。',
  '最后一班列车经过我们身边。风吹起她的头发，她终于伸手接过那本书。',
  '我们沿街找到了亮着灯的面馆。老板递来两条毛巾，把门口的伞桶推近了一点。',
  '她展开信。第一句话是：如果明年的你还是不敢说，就由今年的我先说。',
  '我想和你一起看海，也想听你讲那些画里的故事。不是只在你离开之前。',
  '我拿起笔，在车票背面写下明天要做的三件事。第一件，是把申请寄出去。',
  '第二件，是约好下一次见面的日期。第三件，我想了很久，写成：别再用忙来代替回答。',
  '小夏把那张车票夹进书里。我们没有给未来找一个容易的答案，只给它留了可以继续写的位置。',
  '天快亮时雨停了。街道映着第一班公交的灯，我们站在门口，决定各自回家好好睡一觉。',
  '再见不是结束。她说。明天下午，我带新的信纸来。'
];
const leave = [
  '我把信放进外套口袋。小夏，我会走，但这次不会把没有说完的话留在车站。',
  '她点头，把那本书交给我。路上记得吃饭。还有，不用等一切都顺利才告诉我。',
  '车门合上之前，我说出了下一次见面的日期。它不是含糊的以后，而是日历上能圈出来的一天。',
  '列车开始移动。小夏站在黄线外，直到站台的灯退进雨里，我才坐下来。',
  '信封里有那张海的照片，和一张空白的明信片。她把收件地址写好了，正文留给我。',
  '我在手机里找到她的名字，写道：已经上车。刚才没敢说，我也一直想和你一起看海。',
  '回复很快到了：那么你先替我们看一眼新的城市，回来再讲给我听。',
  '第二天，我带着画去见新的同事。他们问我为什么换方向，我第一次没有只说为了工作。',
  '我说，我想认真试一次，也有人愿意听我讲结果。',
  '周末的海边风很大。我买了一张新的明信片，把那张空白的留在书里，提醒自己还有更多要写。',
  '一个月后，我们在另一座车站碰面。小夏先看了看钟，然后问：这次还慢三分钟吗？',
  '我说，不慢。我们有足够的时间，把上次的故事继续讲完。'
];
async function insert(page, kind) {
  const tools = page.getByLabel('对白结构工具');
  if (!await tools.isVisible()) await page.getByText('插入与整理内容', { exact: false }).first().click();
  await tools.getByLabel('插入 P0 语句类型').selectOption(kind); await tools.getByRole('button', { name: '＋ 插入', exact: true }).click();
}
async function dialogue(page, text) {
  await insert(page, 'dialogue');
  await page.getByLabel('说话人', { exact: true }).selectOption({ label: /^我|^回复|^第二天|^周末|^一个月/.test(text) ? '旅人' : '小夏' });
  await page.getByLabel('对白内容', { exact: true }).fill(text); await page.getByLabel('对白内容', { exact: true }).blur();
}
export async function extendWriting(page, { ready, create, projectAction, checked, screen }) {
  await page.locator('.statement-card--dialogue').first().click();
  const before = await page.getByLabel('对白内容', { exact: true }).inputValue();
  await page.getByLabel('对白内容', { exact: true }).fill(before + ' 我想先把话说完。'); await page.getByLabel('对白内容', { exact: true }).blur();
  const role = await create('角色', '旅人'); await role.getByRole('button', { name: '创建角色', exact: true }).click(); await ready();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForFunction(text => document.getElementById('dialogue-editor')?.value === text, before);
  assert.equal(await page.getByLabel('对白内容', { exact: true }).inputValue(), before);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await page.waitForFunction(text => document.getElementById('dialogue-editor')?.value === text, before + ' 我想先把话说完。');
  assert.equal(await page.getByLabel('对白内容', { exact: true }).inputValue(), before + ' 我想先把话说完。');
  await projectAction('章节与角色'); await page.getByRole('button', { name: '返回创作', exact: true }).click(); await ready();
  assert.equal(await page.getByLabel('对白内容', { exact: true }).inputValue(), before + ' 我想先把话说完。');
  for (const text of opening) await dialogue(page, text);
  for (const [name, lines, ending] of [['留下', stay, '同行的约定'], ['远行', leave, '远行的约定']]) {
    await page.locator('.scene-rail').getByRole('button', { name: new RegExp(name) }).click();
    await page.locator('.statement-card--end').click(); await dialogue(page, lines[0]);
    await page.locator('.statement-card--end').click(); await page.getByLabel('对白结构工具').getByRole('button', { name: '删除所选', exact: true }).click();
    await page.locator('.statement-card--dialogue').click();
    for (const text of lines.slice(1)) await dialogue(page, text);
    await insert(page, 'end'); await page.getByLabel('结局名称', { exact: true }).fill(ending); await page.locator('.sequence-inspector').getByRole('button', { name: '应用修改', exact: true }).click();
  }
  await page.locator('.scene-rail').getByRole('button', { name: /车站的雨/ }).click(); await screen('extended-writing');
  checked('extend two connected routes through writing; create a role and return with undo/redo and selection intact');
  return { dialogueLines: opening.length + stay.length + leave.length + 1, characters: 2, authoredCharacters: [...opening, ...stay, ...leave].join('').length + before.length + ' 我想先把话说完。'.length, fullLengthWork: false };
}
export async function configureAppearance(page, { nav, screen, checked }) {
  await nav('游戏外观'); await page.getByLabel('玩家主题', { exact: true }).selectOption('paper'); await page.getByLabel('玩家强调色', { exact: true }).selectOption('rose');
  await page.getByLabel('标题简介', { exact: true }).fill('一场雨，两封信。留下或远行，都请把未说完的话认真说完。');
  await page.getByLabel('标题封面', { exact: true }).selectOption({ label: '雨后的车站（测试背景）' });
  assert.equal(await page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '故事', exact: true }).isEnabled(), false);
  await page.getByRole('button', { name: '应用玩家外观', exact: true }).click(); await page.getByLabel('设置分区').selectOption('text'); await page.getByLabel('字体缩放').fill('1.15');
  await page.getByRole('button', { name: '应用修改 · 1', exact: true }).click(); await page.getByRole('button', { name: '保存工程', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.local-save-button')?.textContent.includes('已保存')); await screen('appearance-settings');
  checked('configure cover, title copy, paper/rose palette and text scale with draft protection and real project saving');
}
export async function verifyTitle(player, screenPath) {
  await player.waitForFunction(() => document.querySelector('main')?.dataset.playerTheme === 'paper');
  assert.equal(await player.locator('main').getAttribute('data-player-accent'), 'rose');
  await player.getByText('一场雨，两封信。留下或远行，都请把未说完的话认真说完。', { exact: true }).waitFor();
  await player.waitForFunction(() => document.querySelector('.player-title-cover')?.naturalWidth > 0);
  assert.equal(await player.locator('main').evaluate(element => getComputedStyle(element).getPropertyValue('--gal-font-scale').trim()), '1.15');
  await player.screenshot({ path: screenPath, animations: 'disabled' });
}
