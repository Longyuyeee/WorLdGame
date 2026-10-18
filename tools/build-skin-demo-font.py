"""Build a small web-only demo font; production font import does not need Python."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "evidence/web-player-customization/font-tools"))
from fontTools import subset
from fontTools.ttLib import TTFont

folder = root / "assets/skin-demo"
source = folder / "LXGWWenKaiLite-Regular.ttf"
output = folder / "letter-demo.woff2"
text = (root / "evidence/web-blank-short-story/story.txt").read_text(encoding="utf-8")
text += "".join(chr(code) for code in range(32, 127))
text += "打开回信继续故事设置制作名单附加内容历史存读档返回保存读取取消确认标题画面字体姓名按钮剧情选择自动已读预览静音请给明天写一封信。！？、：；（）【】《》‘’“”—…0123456789"
chars = "".join(sorted(set(text)))
(folder / "demo-characters.txt").write_text(chars, encoding="utf-8")
font = TTFont(source)
options = subset.Options()
options.flavor = "woff2"
options.name_IDs = ["*"]
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=chars)
subsetter.subset(font)
font.flavor = "woff2"
font.save(output)
report = {
    "upstream": "https://github.com/lxgw/LxgwWenKai-Lite/releases/tag/v1.522",
    "source": "https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.522/LXGWWenKaiLite-Regular.ttf",
    "license": "SIL Open Font License 1.1; unmodified license in OFL.txt",
    "operation": "Web-only WOFF2 subset for the short story and UI sample characters; other characters use the player's fallback stack.",
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "outputBytes": output.stat().st_size,
    "requestedCharacters": len(chars),
}
(folder / "source.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
