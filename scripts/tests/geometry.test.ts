import { test } from "node:test";
import assert from "node:assert/strict";
import { cropDrag, resizeDrag } from "../src/renderer/geometry";
test("crop movement stays within the image without changing dimensions", () => {
  assert.deepEqual(
    cropDrag(
      { left: 10, top: 20, width: 60, height: 30 },
      "move",
      500,
      -50,
      100,
      80
    ),
    { left: 40, top: 0, width: 60, height: 30 }
  );
});
test("crop handles clamp each edge and never invert the rectangle", () => {
  const initial = { left: 10, top: 20, width: 60, height: 30 };
  assert.deepEqual(cropDrag(initial, "nw", -100, -100, 100, 80), {
    left: 0,
    top: 0,
    width: 70,
    height: 50,
  });
  assert.deepEqual(cropDrag(initial, "se", 100, 100, 100, 80), {
    left: 10,
    top: 20,
    width: 90,
    height: 60,
  });
  assert.deepEqual(cropDrag(initial, "w", 200, 0, 100, 80), {
    left: 69,
    top: 20,
    width: 1,
    height: 30,
  });
});
test("resize drag preserves aspect ratio for corner and edge handles", () => {
  assert.deepEqual(resizeDrag(200, 100, 100, 0, "e", true), {
    width: 300,
    height: 150,
  });
  assert.deepEqual(resizeDrag(200, 100, 0, 50, "s", true), {
    width: 300,
    height: 150,
  });
  assert.deepEqual(resizeDrag(200, 100, -100, -10, "se", true), {
    width: 100,
    height: 50,
  });
});
test("unlocked resize changes dimensions independently and respects output limits", () => {
  assert.deepEqual(resizeDrag(200, 100, 100, 0, "e", false), {
    width: 300,
    height: 100,
  });
  const large = resizeDrag(1000, 1000, 999999, 999999, "se", true);
  assert.ok(
    large.width <= 32768 &&
      large.height <= 32768 &&
      large.width * large.height <= 100_000_000
  );
  const tiny = resizeDrag(200, 100, -9999, -9999, "se", true);
  assert.ok(tiny.width >= 1 && tiny.height >= 1);
});
