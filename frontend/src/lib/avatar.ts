// Deterministic, harmonious avatar gradient from a stable seed (group id / user
// name). Each entity gets its own hue; the two stops are analogous (base + 36°)
// so the gradient always reads as a single harmonious colour — never a clash of
// semantic green/pink.
export function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 36) % 360;
  return `linear-gradient(135deg, hsl(${a} 66% 54%), hsl(${b} 70% 45%))`;
}
