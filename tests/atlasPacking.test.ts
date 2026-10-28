import test from "node:test";
import assert from "node:assert/strict";
import { packAtlas } from "../scripts/extensions/canvas_modules/atlas/packing";

const items = [
  { id: "a", name: "hero.png", width: 20, height: 10, sourceWidth: 30, sourceHeight: 25, offsetX: 3, offsetY: 7 },
  { id: "b", name: "hero.png", width: 12, height: 16 },
  { id: "c", name: "tile.png", width: 8, height: 8 },
];

test("compact packing is deterministic, preserves trim data and never overlaps", () => {
  const options = { padding: 3, margin: 2, maxWidth: 64, maxHeight: 64 };
  const result = packAtlas(items, options);
  assert.deepEqual(packAtlas(items, options), result);
  assert.equal(result.frames.length, 3);
  assert.equal(result.frames.find(f => f.id === "a")!.offsetY, 7);
  assert.equal(result.frames.find(f => f.id === "a")!.sourceWidth, 30);
  for (const frame of result.frames) {
    assert.ok(frame.x >= 2 && frame.y >= 2);
    assert.ok(frame.x + frame.width <= result.width - 2);
    assert.ok(frame.y + frame.height <= result.height - 2);
    assert.equal(frame.rotated, false);
    for (const other of result.frames.filter(f => f.id !== frame.id))
      assert.ok(frame.x + frame.width + 3 <= other.x || other.x + other.width + 3 <= frame.x || frame.y + frame.height + 3 <= other.y || other.y + other.height + 3 <= frame.y);
  }
  assert.ok(result.occupancy > 0 && result.occupancy <= 1);
});

test("grid keeps source order in equal cells with margins", () => {
  const result = packAtlas(items, { layout: "grid", sizeMode: "fixed", width: 50, height: 50, padding: 2, margin: 2 });
  assert.deepEqual(result.frames.map(f => [f.id, f.x, f.y]), [["a", 2, 2], ["b", 24, 2], ["c", 2, 20]]);
  assert.equal(result.width, 50);
  assert.equal(result.height, 50);
});

test("automatic power-of-two dimensions stay within maximum bounds", () => {
  const result = packAtlas(items, { powerOfTwo: true, maxWidth: 64, maxHeight: 64 });
  assert.ok([1, 2, 4, 8, 16, 32, 64].includes(result.width));
  assert.ok([1, 2, 4, 8, 16, 32, 64].includes(result.height));
  assert.throws(() => packAtlas([{ id: "a", name: "a", width: 33, height: 1 }], { powerOfTwo: true, maxWidth: 50 }), /放不下/);
});

test("overflow, duplicate ids and invalid dimensions are explicit errors", () => {
  assert.throws(() => packAtlas(items, { sizeMode: "fixed", width: 10, height: 10 }), /放不下/);
  assert.throws(() => packAtlas([{ ...items[0], width: 0 }]), /尺寸/);
  assert.throws(() => packAtlas([items[0], items[0]]), /重复/);
  assert.throws(() => packAtlas(items, { padding: -1 }), /间距/);
});

test("empty atlas is valid and emits no frames", () => {
  assert.deepEqual(packAtlas([]), { width: 1, height: 1, frames: [], occupancy: 0 });
});

test("compact fills complementary rectangles rather than reserving uniform rows", () => {
  const rectangles = [[6, 4], [4, 6], [6, 6], [4, 4]].map(([width, height], index) => ({ id: String(index), name: String(index), width, height }));
  const result = packAtlas(rectangles, { sizeMode: "fixed", width: 10, height: 10, padding: 0 });
  assert.equal(result.occupancy, 1);
});

test("varied rectangle batches remain inside bounds with the required separation", () => {
  let seed = 123;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  for (let batch = 0; batch < 12; batch++) {
    const rectangles = Array.from({ length: 24 }, (_, index) => ({ id: String(index), name: String(index), width: 1 + random() % 40, height: 1 + random() % 40 }));
    const result = packAtlas(rectangles, { maxWidth: 256, maxHeight: 256, padding: 2, margin: 3 });
    for (const [index, frame] of result.frames.entries()) {
      assert.ok(frame.x >= 3 && frame.y >= 3 && frame.x + frame.width <= result.width - 3 && frame.y + frame.height <= result.height - 3);
      for (const other of result.frames.slice(index + 1)) assert.ok(frame.x + frame.width + 2 <= other.x || other.x + other.width + 2 <= frame.x || frame.y + frame.height + 2 <= other.y || other.y + other.height + 2 <= frame.y);
    }
  }
});
