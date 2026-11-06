export function keyboardOverlap(windowHeight: number, frame?: { height: number; screenY: number }) {
  if (!frame || ![windowHeight, frame.height, frame.screenY].every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(frame.height, windowHeight - frame.screenY));
}
export function labelReviewLayout(width: number, height: number, fontScale: number, inset = 0, editing = false) {
  const scale = Math.max(1, fontScale), visible = Math.max(160, height - Math.max(0, inset));
  return {
    columns: width / scale < 280 ? 1 : 2,
    chipColumns: width / scale < 280 ? 3 : 5,
    photoHeight: Math.round(editing ? Math.max(88, Math.min(180, visible - 420 * scale)) : Math.max(120, Math.min(220, visible * .32))),
  };
}
