import { mountWorldPlayerV1, type WorldPlayerHandleV1 } from "@world-studio/player-shell";
import { createPlayerMediaMultichannelDemoV1 } from "./media-demo";
import "./embed-shell.css";

const container = document.getElementById("player-root");
const observation = document.getElementById("embed-observation");
const activityButton = document.getElementById("toggle-activity") as HTMLButtonElement | null;
const mountButton = document.getElementById("toggle-mount") as HTMLButtonElement | null;
if (container === null || observation === null || activityButton === null || mountButton === null) {
  throw new Error("WORLD_PLAYER_EMBED_HOST_INCOMPLETE");
}
const playerContainer = container;
const observationLabel = observation;
const activityControl = activityButton;
const mountControl = mountButton;

const demo = createPlayerMediaMultichannelDemoV1();
let handle: WorldPlayerHandleV1 | null = null;
let suspended = false;

function updateObservation() {
  const current = handle?.getObservation();
  observationLabel.textContent = handle === null
    ? "mounted=false"
    : `mounted=true · ${current!.status} · ${current!.hostActivity} · ${current!.playback.mode}/${current!.playback.activation ?? "none"}/${current!.playback.speed} · active=${current!.playback.active} · stop=${current!.playback.stopReason ?? "none"}`;
}

const playerObservation = new MutationObserver(updateObservation);
playerObservation.observe(playerContainer, {
  attributes: true,
  attributeFilter: ["data-player-status", "data-host-activity", "data-playback-mode", "data-playback-activation", "data-playback-speed", "data-playback-stop-reason", "data-skip-active", "data-auto-playback"],
  childList: true,
  subtree: true
});

function mount() {
  handle = mountWorldPlayerV1(playerContainer, {
    project: demo.project,
    mediaAssets: demo.mediaAssets,
    hostActivity: suspended ? "suspended" : "active"
  });
  mountControl.textContent = "卸载 Player";
  activityControl.disabled = false;
  updateObservation();
}

activityControl.addEventListener("click", () => {
  if (handle === null) return;
  suspended = !suspended;
  handle.setHostActivity(suspended ? "suspended" : "active");
  activityControl.textContent = suspended ? "恢复宿主" : "暂停宿主";
  updateObservation();
});

mountControl.addEventListener("click", () => {
  if (handle === null) {
    mount();
    return;
  }
  handle.unmount();
  handle = null;
  mountControl.textContent = "重新挂载 Player";
  activityControl.disabled = true;
  updateObservation();
});

mount();
