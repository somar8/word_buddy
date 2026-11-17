"use client";

import { useEffect, useRef, useState } from "react";

const SIZE = 480; // canvas pixels; shown at any width
const COLORS = [
  { value: "#16181d", name: "Black" },
  { value: "#2346c8", name: "Blue" },
  { value: "#d23f3f", name: "Red" },
  { value: "#1f8a4c", name: "Green" },
  { value: "#e08a1e", name: "Orange" },
];
const PENS = [
  { value: 4, name: "Thin" },
  { value: 10, name: "Medium" },
  { value: 22, name: "Thick" },
];

type Stroke = { color: string; size: number; erase: boolean; points: [number, number][] };

/**
 * A small sketch pad: draw something that reminds you of the word.
 * Calls onChange with a PNG data URL after every stroke, or null when the pad is empty.
 */
export default function DrawingPad({ initial, onChange }: {
  initial?: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLImageElement | null>(null);
  const current = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [hasBase, setHasBase] = useState(false);
  const [color, setColor] = useState(COLORS[0].value);
  const [pen, setPen] = useState(PENS[1].value);
  const [erase, setErase] = useState(false);
  const [start] = useState(initial); // only the first value counts; later changes come from this pad

  function ctx() {
    return canvas.current?.getContext("2d") ?? null;
  }

  function paint(c: CanvasRenderingContext2D, s: Stroke) {
    c.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineWidth = s.size;
    c.lineCap = "round";
    c.lineJoin = "round";
    const [first, ...rest] = s.points;
    if (rest.length === 0) {
      c.beginPath();
      c.arc(first[0], first[1], s.size / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    c.beginPath();
    c.moveTo(first[0], first[1]);
    for (const [x, y] of rest) c.lineTo(x, y);
    c.stroke();
  }

  function redraw(list: Stroke[], withBase: boolean) {
    const c = ctx();
    if (!c) return;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, SIZE, SIZE);
    if (withBase && base.current) c.drawImage(base.current, 0, 0, SIZE, SIZE);
    list.forEach((s) => paint(c, s));
  }

  function emit(list: Stroke[], withBase: boolean) {
    if (list.length === 0 && !withBase) onChange(null);
    else onChange(canvas.current?.toDataURL("image/png") ?? null);
  }

  // Load an existing drawing as the bottom layer.
  useEffect(() => {
    if (!start) return;
    const img = new Image();
    img.onload = () => {
      base.current = img;
      setHasBase(true);
      const c = ctx();
      if (c) c.drawImage(img, 0, 0, SIZE, SIZE);
    };
    img.src = start;
  }, [start]);

  function point(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - rect.left) * SIZE) / rect.width, ((e.clientY - rect.top) * SIZE) / rect.height];
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { color, size: erase ? pen * 2 : pen, erase, points: [point(e)] };
    const c = ctx();
    if (c) paint(c, current.current);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = current.current;
    const c = ctx();
    if (!s || !c) return;
    const p = point(e);
    const last = s.points[s.points.length - 1];
    s.points.push(p);
    paint(c, { ...s, points: [last, p] });
  }

  function up() {
    const s = current.current;
    if (!s) return;
    current.current = null;
    const list = [...strokes, s];
    setStrokes(list);
    emit(list, hasBase);
  }

  function undo() {
    const list = strokes.slice(0, -1);
    setStrokes(list);
    redraw(list, hasBase);
    emit(list, hasBase);
  }

  function clear() {
    setStrokes([]);
    setHasBase(false);
    redraw([], false);
    onChange(null);
  }

  const empty = strokes.length === 0 && !hasBase;

  return (
    <div className="flex flex-col gap-3">
      <canvas ref={canvas} width={SIZE} height={SIZE}
        role="img" aria-label="Drawing pad. Draw with your finger or mouse."
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="aspect-square w-full touch-none rounded-xl border border-line bg-white"
        style={{
          backgroundImage: "radial-gradient(#e3e5ea 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          cursor: "crosshair",
        }} />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Pen color" className="flex gap-1.5">
          {COLORS.map((c) => (
            <button key={c.value} type="button" aria-label={c.name} aria-pressed={!erase && color === c.value}
              onClick={() => { setColor(c.value); setErase(false); }}
              className={`h-9 w-9 rounded-full border-2 ${!erase && color === c.value ? "border-ink" : "border-transparent"}`}>
              <span className="mx-auto block h-6 w-6 rounded-full" style={{ background: c.value }} />
            </button>
          ))}
        </div>
        <div role="group" aria-label="Pen size" className="flex gap-1">
          {PENS.map((p) => (
            <button key={p.value} type="button" aria-label={p.name} aria-pressed={pen === p.value}
              onClick={() => setPen(p.value)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border ${pen === p.value ? "border-ink bg-[#f0f1f4]" : "border-line bg-white"}`}>
              <span className="block rounded-full bg-ink" style={{ width: p.value / 2 + 3, height: p.value / 2 + 3 }} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn-small" aria-pressed={erase} onClick={() => setErase(!erase)}>
          {erase ? "Eraser on" : "Eraser"}
        </button>
        <button type="button" className="btn-small" onClick={undo} disabled={strokes.length === 0}>Undo</button>
        <button type="button" className="btn-small" onClick={clear} disabled={empty}>Clear</button>
      </div>
    </div>
  );
}
