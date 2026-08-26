import {
  MOTION_PREFERENCES,
  motionPreferenceDescriptor,
  type MotionPreferenceId
} from "./motion-preference";

export interface MotionPreferenceControlProps {
  readonly preference: MotionPreferenceId;
  readonly effectiveLevel: MotionPreferenceId;
  readonly systemReducedMotion: boolean;
  readonly onChange: (preference: MotionPreferenceId) => void;
}

export function MotionPreferenceControl({
  preference,
  effectiveLevel,
  systemReducedMotion,
  onChange
}: MotionPreferenceControlProps) {
  return (
    <div className="motion-preference" aria-label="动效级别">
      <div className="motion-preference__options" role="radiogroup" aria-label="动效级别">
        {MOTION_PREFERENCES.map((candidate) => (
          <button
            type="button"
            role="radio"
            aria-checked={candidate.id === preference}
            aria-label={`${candidate.label}动效`}
            className={candidate.id === preference ? "motion-preference__button is-active" : "motion-preference__button"}
            key={candidate.id}
            onClick={() => onChange(candidate.id)}
          >
            <span aria-hidden="true">{candidate.id === preference ? "✓" : "·"}</span>
            {candidate.label}
          </button>
        ))}
      </div>
      <output className="motion-preference__summary" aria-live="polite">
        {systemReducedMotion ? "系统减少动效已启用 · " : ""}
        {motionPreferenceDescriptor(effectiveLevel).summary}
      </output>
    </div>
  );
}
