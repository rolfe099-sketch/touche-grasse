import { D, display } from './model';
import { targetProgress } from './targets';

// Apply the same content limit as Screen; never clamp the user's text size.
export function readableLayout(width: number, fontScale: number) {
  const available = Number.isFinite(width) && width > 0 ? Math.min(width, 700) : 320;
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const compact = available / scale < 360;
  return { compact, formColumns: compact ? 1 : 2, nutrientColumns: compact ? 2 : 4 } as const;
}

export function nutrientDescription(label: string, value: string | null | undefined, progress: ReturnType<typeof targetProgress>, knownIntake: boolean, energy = false) {
  const unit = energy ? 'kcal' : 'grams', digits = energy ? 0 : 1;
  const consumed = !knownIntake ? 'no recorded intake' : value == null ? 'unknown' : `${display(value, digits)} ${unit}`;
  const parts = [`${label}: ${consumed}.`];
  if (progress) {
    parts.push(`Target ${display(progress.target, digits)} ${unit}.`);
    if (knownIntake) parts.push(progress.remaining === null ? 'Remaining amount is unknown.' : `${display(new D(progress.remaining).abs().toFixed(), digits)} ${unit} ${new D(progress.remaining).isNegative() ? 'over target' : 'left'}.`);
  }
  return parts.join(' ');
}
