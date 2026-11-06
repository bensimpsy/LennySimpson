// Pixel art is drawn on the game's native grid: no filtered or rotated bitmaps.
export const palette = ['#182d26', '#426344', '#86a65c', '#d5e9ac'];
type Direction = { x: number; y: number };

function pixelPen(ctx: CanvasRenderingContext2D) {
  const rect = (x: number, y: number, w: number, h: number, shade: number) => {
    ctx.fillStyle = palette[shade];
    ctx.fillRect(x, y, w, h);
  };
  const line = (x: number, y: number, endX: number, endY: number, shade: number, width = 1) => {
    const dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
    const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      rect(x, y, width, width, shade);
      if (x === endX && y === endY) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  };
  return { rect, line };
}

export function drawCyclist(ctx: CanvasRenderingContext2D, x: number, y: number, direction: Direction, moving: boolean, frame: number) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const { rect, line } = pixelPen(ctx);
  const pedal = moving ? frame % 2 : 0;
  if (Math.abs(direction.x) > .5) {
    if (direction.x < 0) ctx.scale(-1, 1);
    // Side views reveal two tyres, spokes, and the diamond bicycle frame.
    for (const wheelX of [-10, 10]) {
      rect(wheelX - 3, 3, 7, 11, 0); rect(wheelX - 5, 5, 11, 7, 0);
      rect(wheelX - 3, 5, 7, 7, 3); rect(wheelX - 4, 6, 9, 5, 3);
      rect(wheelX - 2, 6, 5, 5, 1); rect(wheelX - 3, 7, 7, 3, 1);
      if (pedal) { line(wheelX - 2, 6, wheelX + 2, 10, 3); line(wheelX - 2, 10, wheelX + 2, 6, 3); }
      else { rect(wheelX, 5, 1, 7, 3); rect(wheelX - 3, 8, 7, 1, 3); }
      rect(wheelX, 8, 1, 1, 0);
    }
    line(-10, 8, -5, 0, 0, 2); line(-5, 0, 2, 8, 0, 2);
    line(-10, 8, 2, 8, 0, 2); line(-5, 0, 7, 0, 0, 2);
    line(7, 0, 2, 8, 0, 2); line(7, -3, 10, 8, 0, 2);
    line(-10, 8, -5, 0, 2); line(-5, 0, 2, 8, 3);
    line(-10, 8, 2, 8, 2); line(-5, 0, 7, 0, 3); line(7, 0, 2, 8, 2);
    line(7, -5, 10, 8, 3); rect(6, -6, 7, 2, 0); rect(-8, -2, 7, 2, 0);
    // Shorts, bent legs and alternating shoes sit over the frame.
    rect(-6, -2, 7, 4, 0);
    line(-2, 1, pedal ? 3 : -4, 4, 2, 2);
    line(pedal ? 3 : -4, 4, pedal ? 0 : 1, pedal ? 9 : 6, 2, 2);
    rect(pedal ? -1 : 0, pedal ? 10 : 7, 5, 2, 0);
    // A forward lean, sleeve, face, helmet vents, chin strap and tiny backpack.
    rect(-5, -9, 7, 7, 0); rect(-4, -8, 5, 5, 3); rect(-4, -6, 3, 2, 2);
    rect(-7, -8, 3, 5, 1); rect(-7, -7, 1, 3, 2);
    line(1, -6, 5, -3, 2, 2); line(5, -3, 9, -5, 2, 2);
    rect(0, -14, 7, 6, 0); rect(1, -12, 5, 4, 2); rect(6, -11, 2, 2, 2);
    rect(5, -12, 1, 1, 0); rect(1, -9, 4, 1, 0);
    rect(-1, -16, 9, 5, 0); rect(0, -15, 7, 3, 3); rect(1, -15, 1, 2, 1); rect(4, -15, 1, 2, 1);
    rect(6, -13, 3, 1, 3);
  } else {
    const down = direction.y > 0;
    // Front and rear views keep the rider upright instead of rotating the kid.
    const front = down ? 12 : -15, rear = down ? -13 : 10;
    for (const wheelY of [front, rear]) {
      rect(-2, wheelY, 5, 7, 0); rect(-1, wheelY + 1, 2, 5, 3); rect(1, wheelY + 2, 1, 3, 1);
    }
    rect(-1, -11, 3, 25, 0); rect(0, -10, 1, 23, 3);
    const barY = down ? 8 : -10;
    rect(-9, barY, 19, 2, 0); rect(-7, barY, 15, 1, 3);
    rect(-10, barY - 1, 3, 3, 0); rect(8, barY - 1, 3, 3, 0);
    rect(-6, 4, 12, 4, 0);
    rect(-6, pedal ? 7 : 5, 3, 5, 2); rect(4, pedal ? 5 : 7, 3, 5, 2);
    rect(-7, pedal ? 11 : 9, 4, 2, 0); rect(4, pedal ? 9 : 11, 4, 2, 0);
    rect(-6, -3, 13, 9, 0); rect(-5, -2, 11, 7, 3); rect(-4, 3, 9, 2, 2);
    line(-5, -1, -8, barY, 2, 2); line(5, -1, 8, barY, 2, 2);
    rect(-9, barY, 3, 2, 3); rect(7, barY, 3, 2, 3);
    if (!down) { rect(-3, -1, 7, 6, 1); rect(-2, 0, 5, 3, 2); rect(-2, 3, 5, 1, 0); }
    rect(-5, -9, 11, 7, 0); rect(-4, -8, 9, 5, 2);
    rect(-6, -12, 13, 6, 0); rect(-4, -11, 9, 4, 3); rect(-5, -9, 11, 2, 3);
    rect(-2, -11, 1, 3, 1); rect(2, -11, 1, 3, 1);
    if (down) { rect(-3, -5, 1, 1, 0); rect(3, -5, 1, 1, 0); rect(-2, -3, 5, 1, 0); }
    else rect(-4, -5, 9, 2, 0);
  }
  ctx.restore();
}

export function drawMagpie(ctx: CanvasRenderingContext2D, x: number, y: number, direction: Direction, frame: number) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  // Quarter turns preserve the hard pixel edges in every flight direction.
  if (Math.abs(direction.x) > Math.abs(direction.y)) ctx.rotate(direction.x > 0 ? Math.PI / 2 : -Math.PI / 2);
  else if (direction.y > 0) ctx.rotate(Math.PI);
  const { rect, line } = pixelPen(ctx);
  const raised = frame % 2 === 0;
  for (const side of [-1, 1]) {
    const tipY = raised ? -6 : 6;
    line(side * 3, 0, side * 8, raised ? -3 : 2, 0, 4);
    line(side * 8, raised ? -3 : 2, side * 14, tipY, 0, 3);
    // Separate primary feathers and broad white shoulder patches.
    for (let feather = 0; feather < 3; feather++) line(side * (11 + feather * 2), tipY + feather, side * (11 + feather * 2), tipY + feather + 4, 0);
    line(side * 5, 1, side * 9, raised ? -1 : 4, 3, 2);
    line(side * 10, raised ? -3 : 5, side * 12, raised ? -4 : 6, 1);
  }
  // Long black tail, white nape and saddle: the Australian magpie silhouette.
  rect(-3, 7, 7, 6, 0); rect(-2, 13, 5, 5, 0); rect(-1, 17, 3, 2, 0);
  rect(-1, 10, 1, 7, 1); rect(1, 10, 1, 6, 1);
  rect(-4, -1, 9, 10, 0); rect(-3, 0, 7, 3, 3);
  rect(-3, 4, 2, 4, 3); rect(2, 4, 2, 4, 3);
  rect(-3, -7, 7, 6, 0); rect(-2, -2, 5, 2, 3);
  rect(-1, -11, 3, 4, 0); rect(0, -10, 1, 3, 3);
  rect(-2, -6, 1, 1, 3); rect(2, -6, 1, 1, 3);
  ctx.restore();
}
