import { projectForBudget } from "../player-session-budget";
import { withProjectSettings } from "../../packages/gal-settings/src/index";
import { mountWorldPlayerV1 } from "../../apps/player-shell/src/mount-player";
import css from "../../apps/player-shell/src/player-shell.css?inline";
import { applyWebPlayerAppearance,DEFAULT_WEB_PLAYER_APPEARANCE } from "../../packages/project-domain/src/index";

const style=document.createElement("style");style.textContent=css;document.head.append(style);
const count=Number(new URL(location.href).searchParams.get("count")??480);
if(!Number.isSafeInteger(count)||count<120||count>960)throw Error("Invalid long-story fixture size");
const project=applyWebPlayerAppearance(projectForBudget(count,2),DEFAULT_WEB_PLAYER_APPEARANCE);
mountWorldPlayerV1(document.getElementById("player-root")!,{project:{...project,settings:withProjectSettings(project.settings,{text:{revealMode:"instant",minimumDisplayMilliseconds:0},accessibility:{reduceMotion:true}})}});
