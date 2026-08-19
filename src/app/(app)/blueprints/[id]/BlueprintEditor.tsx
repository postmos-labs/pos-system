"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Square,
  Circle as CircleIcon,
  Type,
  Minus,
  MousePointer2,
  Trash2,
  Download,
  LayoutTemplate,
  Rows,
  Dot,
  BringToFront,
  SendToBack,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import type { Profile } from "@/types";
import { AppSelect } from "@/components/ui/AppSelect";

type Tool = "select" | "rect" | "circle" | "text" | "line" | "group" | "point";

interface RectEl {
  id: string;
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  stroke: string;
  fill: string;
  textColor: string;
  fontSize: number;
  vertical: boolean;
}
interface CircleEl {
  id: string;
  type: "circle";
  x: number;
  y: number;
  r: number;
  stroke: string;
  fill: string;
}
interface TextEl {
  id: string;
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  vertical: boolean;
}
interface LineEl {
  id: string;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  dash: boolean;
  arrow: boolean;
  label: string;
}
interface GroupEl {
  id: string;
  type: "group";
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  titleColor: string;
}
interface PointEl {
  id: string;
  type: "point";
  x: number;
  y: number;
  color: string;
  label: string;
}
type Element = RectEl | CircleEl | TextEl | LineEl | GroupEl | PointEl;

const COLORS = ["#0f172a", "#dc2626", "#16a34a", "#2563eb", "#64748b", "#ea580c"];
const CANVAS_W = 2000;
const CANVAS_H = 1200;

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `el_${Date.now()}_${idCounter}`;
}

function makeDefault(type: Tool, x: number, y: number): Element | null {
  const id = newId();
  if (type === "rect")
    return {
      id,
      type: "rect",
      x,
      y,
      w: 160,
      h: 90,
      label: "장비",
      stroke: "#0f172a",
      fill: "#ffffff",
      textColor: "#0f172a",
      fontSize: 14,
      vertical: false,
    };
  if (type === "circle")
    return { id, type: "circle", x, y, r: 18, stroke: "#0f172a", fill: "#ffffff" };
  if (type === "text")
    return {
      id,
      type: "text",
      x,
      y,
      text: "텍스트",
      color: "#0f172a",
      fontSize: 16,
      vertical: false,
    };
  if (type === "group")
    return { id, type: "group", x, y, w: 360, h: 260, title: "구역", titleColor: "#dc2626" };
  if (type === "point") return { id, type: "point", x, y, color: "#dc2626", label: "" };
  return null;
}

function makeTemplate(): Element[] {
  const g = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    titleColor: string,
  ): GroupEl => ({ id: newId(), type: "group", x, y, w, h, title, titleColor });
  const box = (x: number, y: number, label: string): RectEl => ({
    id: newId(),
    type: "rect",
    x,
    y,
    w: 140,
    h: 80,
    label,
    stroke: "#0f172a",
    fill: "#ffffff",
    textColor: "#0f172a",
    fontSize: 14,
    vertical: false,
  });
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    label: string,
    dash = false,
  ): LineEl => ({ id: newId(), type: "line", x1, y1, x2, y2, stroke, dash, arrow: false, label });

  return [
    g(40, 40, 380, 200, "주방", "#dc2626"),
    box(160, 110, "주방 프린터"),
    g(40, 280, 620, 480, "카운터", "#2563eb"),
    box(300, 400, "POS 본체"),
    box(90, 400, "영수증 프린터"),
    box(300, 620, "사업장 공유기"),
    g(740, 280, 560, 480, "홀", "#16a34a"),
    box(820, 380, "테이블오더 #01"),
    box(820, 620, "테이블오더 #18"),
    line(230, 190, 370, 400, "#dc2626", "SERIAL (COM_02)"),
    line(160, 440, 300, 440, "#dc2626", "SERIAL (COM_01)"),
    line(370, 480, 370, 620, "#2563eb", "LAN (UTP)"),
    line(470, 660, 820, 420, "#16a34a", "Wi-Fi", true),
    line(470, 660, 820, 660, "#16a34a", "Wi-Fi", true),
  ];
}

export default function BlueprintEditor({
  profile,
  blueprint,
  merchants,
}: {
  profile: Profile;
  blueprint: { id: string; title: string; merchant_id: string | null; elements: Element[] };
  merchants: { id: string; business_name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement>(null);

  const [title, setTitle] = useState(blueprint.title);
  const [merchantId, setMerchantId] = useState(blueprint.merchant_id ?? "");
  const [elements, setElements] = useState<Element[]>(blueprint.elements ?? []);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<{
    mode: "move" | "resize" | "draw-line" | "line-endpoint";
    id?: string;
    endpoint?: "x1y1" | "x2y2";
    startX: number;
    startY: number;
    orig?: Element;
  } | null>(null);
  const drawingLineRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [, forceRender] = useState(0);
  const lastSavedRef = useRef<string>(JSON.stringify(blueprint.elements ?? []));
  const lastDeletedRef = useRef<{ element: Element; index: number } | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const pointerPos = useCallback((e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const updateElement = useCallback((id: string, patch: Partial<Element>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? ({ ...el, ...patch } as Element) : el)));
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (!window.confirm("선택한 요소를 삭제하시겠습니까?")) return;
    setElements((prev) => {
      const index = prev.findIndex((el) => el.id === selectedId);
      if (index !== -1) lastDeletedRef.current = { element: prev[index], index };
      return prev.filter((el) => el.id !== selectedId);
    });
    setSelectedId(null);
    toast.success("삭제했습니다. (Ctrl+Z로 복구)");
  }, [selectedId, toast]);

  const bringToFront = useCallback((id: string) => {
    setElements((prev) => {
      const index = prev.findIndex((el) => el.id === id);
      if (index === -1 || index === prev.length - 1) return prev;
      const next = [...prev];
      const [el] = next.splice(index, 1);
      next.push(el);
      return next;
    });
  }, []);

  const sendToBack = useCallback((id: string) => {
    setElements((prev) => {
      const index = prev.findIndex((el) => el.id === id);
      if (index <= 0) return prev;
      const next = [...prev];
      const [el] = next.splice(index, 1);
      next.unshift(el);
      return next;
    });
  }, []);

  const undoDelete = useCallback(() => {
    const last = lastDeletedRef.current;
    if (!last) return;
    setElements((prev) => {
      const next = [...prev];
      const index = Math.min(last.index, next.length);
      next.splice(index, 0, last.element);
      return next;
    });
    setSelectedId(last.element.id);
    lastDeletedRef.current = null;
    toast.success("삭제를 취소했습니다.");
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isEditable = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        if (isEditable) return;
        e.preventDefault();
        deleteSelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (isEditable) return;
        if (lastDeletedRef.current) {
          e.preventDefault();
          undoDelete();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, deleteSelected, undoDelete]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedChanges = JSON.stringify(elements) !== lastSavedRef.current;
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [elements]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const { x, y } = pointerPos(e);
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    if (tool === "line") {
      drawingLineRef.current = { x1: x, y1: y, x2: x, y2: y };
      dragRef.current = { mode: "draw-line", startX: x, startY: y };
      forceRender((n) => n + 1);
      return;
    }
    const el = makeDefault(tool, x, y);
    if (el) {
      setElements((prev) => [...prev, el]);
      setSelectedId(el.id);
      setTool("select");
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const { x, y } = pointerPos(e);
    const drag = dragRef.current;
    if (drag?.mode === "draw-line" && drawingLineRef.current) {
      drawingLineRef.current = { ...drawingLineRef.current, x2: x, y2: y };
      forceRender((n) => n + 1);
      return;
    }
    if (!drag) return;
    if (drag.mode === "move" && drag.id && drag.orig) {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const orig = drag.orig;
      if (
        orig.type === "rect" ||
        orig.type === "circle" ||
        orig.type === "text" ||
        orig.type === "group"
      ) {
        updateElement(drag.id, { x: orig.x + dx, y: orig.y + dy } as any);
      } else if (orig.type === "line") {
        updateElement(drag.id, {
          x1: orig.x1 + dx,
          y1: orig.y1 + dy,
          x2: orig.x2 + dx,
          y2: orig.y2 + dy,
        } as any);
      }
    } else if (
      drag.mode === "resize" &&
      drag.id &&
      (drag.orig?.type === "rect" || drag.orig?.type === "group")
    ) {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const orig = drag.orig as RectEl | GroupEl;
      updateElement(drag.id, { w: Math.max(40, orig.w + dx), h: Math.max(30, orig.h + dy) });
    } else if (drag.mode === "resize" && drag.id && drag.orig?.type === "circle") {
      const dx = x - drag.startX;
      const orig = drag.orig as CircleEl;
      updateElement(drag.id, { r: Math.max(6, orig.r + dx) });
    } else if (
      drag.mode === "line-endpoint" &&
      drag.id &&
      drag.orig?.type === "line" &&
      drag.endpoint
    ) {
      if (drag.endpoint === "x1y1") updateElement(drag.id, { x1: x, y1: y } as any);
      else updateElement(drag.id, { x2: x, y2: y } as any);
    }
  };

  const handleCanvasMouseUp = () => {
    const drag = dragRef.current;
    if (drag?.mode === "draw-line" && drawingLineRef.current) {
      const { x1, y1, x2, y2 } = drawingLineRef.current;
      if (Math.hypot(x2 - x1, y2 - y1) > 5) {
        const line: LineEl = {
          id: newId(),
          type: "line",
          x1,
          y1,
          x2,
          y2,
          stroke: "#0f172a",
          dash: false,
          arrow: false,
          label: "",
        };
        setElements((prev) => [...prev, line]);
        setSelectedId(line.id);
      }
      drawingLineRef.current = null;
      setTool("select");
    }
    dragRef.current = null;
  };

  const startMove = (e: React.MouseEvent, el: Element) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(el.id);
    const { x, y } = pointerPos(e);
    dragRef.current = { mode: "move", id: el.id, startX: x, startY: y, orig: { ...el } };
  };

  const startResize = (e: React.MouseEvent, el: Element) => {
    e.stopPropagation();
    const { x, y } = pointerPos(e);
    dragRef.current = { mode: "resize", id: el.id, startX: x, startY: y, orig: { ...el } };
  };

  const startLineEndpoint = (e: React.MouseEvent, el: LineEl, endpoint: "x1y1" | "x2y2") => {
    e.stopPropagation();
    setSelectedId(el.id);
    dragRef.current = {
      mode: "line-endpoint",
      id: el.id,
      endpoint,
      startX: 0,
      startY: 0,
      orig: { ...el },
    };
  };

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("install_blueprints")
      .update({
        title: title || "제목 없는 설계도",
        merchant_id: merchantId || null,
        elements,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", blueprint.id);
    setSaving(false);
    if (error) {
      toast.error("저장하지 못했습니다.");
      return;
    }
    lastSavedRef.current = JSON.stringify(elements);
    toast.success("저장했습니다.");
  };

  const handleExportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", String(CANVAS_W));
    bg.setAttribute("height", String(CANVAS_H));
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${title || "blueprint"}.png`;
        a.click();
      });
    };
    img.src = url;
  };

  const insertTemplate = () => {
    if (
      elements.length > 0 &&
      !window.confirm("현재 캔버스에 네트워크 구성 템플릿을 추가할까요? (기존 요소는 유지됩니다)")
    )
      return;
    setElements((prev) => [...prev, ...makeTemplate()]);
  };

  const drawingLine = drawingLineRef.current;

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
        <button
          onClick={() => router.push("/blueprints")}
          className="text-slate-400 hover:text-slate-600"
        >
          <ArrowLeft size={18} />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-sm font-medium text-slate-800 border-none focus:outline-none focus:ring-1 focus:ring-orange-300 rounded px-1.5 py-1 min-w-0 flex-1 max-w-xs"
          placeholder="설계도 제목"
        />
        <AppSelect
          value={merchantId}
          onValueChange={setMerchantId}
          aria-label="연결할 가맹점"
          className="h-auto max-w-[160px] px-2 py-1.5 text-xs text-slate-500"
          options={[
            { value: "", label: "가맹점 연결 안함" },
            ...merchants.map((m) => ({ value: m.id, label: m.business_name })),
          ]}
        />
        <div className="flex-1" />
        <button
          onClick={insertTemplate}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-md hover:bg-slate-50"
        >
          <LayoutTemplate size={14} /> 네트워크 템플릿 삽입
        </button>
        <button
          onClick={handleExportPng}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-md hover:bg-slate-50"
        >
          <Download size={14} /> PNG로 내보내기
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          <Save size={15} /> 저장
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-14 border-r border-slate-200 bg-white flex flex-col items-center py-3 gap-1.5">
          <ToolButton
            icon={MousePointer2}
            active={tool === "select"}
            onClick={() => setTool("select")}
            label="선택"
          />
          <ToolButton
            icon={Square}
            active={tool === "rect"}
            onClick={() => setTool("rect")}
            label="박스"
          />
          <ToolButton
            icon={CircleIcon}
            active={tool === "circle"}
            onClick={() => setTool("circle")}
            label="원"
          />
          <ToolButton
            icon={Type}
            active={tool === "text"}
            onClick={() => setTool("text")}
            label="글씨"
          />
          <ToolButton
            icon={Minus}
            active={tool === "line"}
            onClick={() => setTool("line")}
            label="선"
          />
          <ToolButton
            icon={Dot}
            active={tool === "point"}
            onClick={() => setTool("point")}
            label="꼭짓점"
          />
          <ToolButton
            icon={Rows}
            active={tool === "group"}
            onClick={() => setTool("group")}
            label="구역 박스"
          />
          <div className="flex-1" />
          <ToolButton
            icon={Trash2}
            active={false}
            disabled={!selectedId}
            onClick={deleteSelected}
            label="삭제"
          />
        </div>

        <div className="flex-1 overflow-auto bg-slate-100">
          <svg
            ref={svgRef}
            width={CANVAS_W}
            height={CANVAS_H}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className="bg-white block"
            style={{ cursor: tool === "select" ? "default" : "crosshair" }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            <defs>
              <marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="context-stroke" />
              </marker>
            </defs>

            {elements.map((el) => {
              if (el.type === "group")
                return (
                  <g key={el.id} onMouseDown={(e) => startMove(e, el)} style={{ cursor: "move" }}>
                    <rect
                      x={el.x}
                      y={el.y}
                      width={el.w}
                      height={el.h}
                      fill="none"
                      stroke={el.titleColor}
                      strokeWidth={2}
                      rx={6}
                    />
                    <rect
                      x={el.x}
                      y={el.y - 26}
                      width={Math.max(70, el.title.length * 16 + 24)}
                      height={32}
                      fill={el.titleColor}
                      rx={4}
                    />
                    <text
                      x={el.x + Math.max(70, el.title.length * 16 + 24) / 2}
                      y={el.y - 10}
                      fill="#ffffff"
                      fontSize={15}
                      fontWeight={700}
                      textAnchor="middle"
                      style={{ userSelect: "none" }}
                    >
                      {el.title}
                    </text>
                    {selectedId === el.id && (
                      <>
                        <rect
                          x={el.x - 3}
                          y={el.y - 3}
                          width={el.w + 6}
                          height={el.h + 6}
                          fill="none"
                          stroke="#f97316"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          rx={8}
                        />
                        <rect
                          x={el.x + el.w - 8}
                          y={el.y + el.h - 8}
                          width={16}
                          height={16}
                          fill="#f97316"
                          rx={3}
                          style={{ cursor: "nwse-resize" }}
                          onMouseDown={(e) => startResize(e, el)}
                        />
                      </>
                    )}
                  </g>
                );
              if (el.type === "rect")
                return (
                  <g key={el.id} onMouseDown={(e) => startMove(e, el)} style={{ cursor: "move" }}>
                    <rect
                      x={el.x}
                      y={el.y}
                      width={el.w}
                      height={el.h}
                      fill={el.fill}
                      stroke={el.stroke}
                      strokeWidth={2}
                      rx={4}
                    />
                    <text
                      x={el.x + el.w / 2}
                      y={el.y + el.h / 2}
                      fill={el.textColor}
                      fontSize={el.fontSize}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={
                        el.vertical
                          ? `rotate(-90 ${el.x + el.w / 2} ${el.y + el.h / 2})`
                          : undefined
                      }
                      style={{ userSelect: "none" }}
                    >
                      {el.label}
                    </text>
                    {selectedId === el.id && (
                      <rect
                        x={el.x + el.w - 8}
                        y={el.y + el.h - 8}
                        width={16}
                        height={16}
                        fill="#f97316"
                        rx={3}
                        style={{ cursor: "nwse-resize" }}
                        onMouseDown={(e) => startResize(e, el)}
                      />
                    )}
                    {selectedId === el.id && (
                      <rect
                        x={el.x - 3}
                        y={el.y - 3}
                        width={el.w + 6}
                        height={el.h + 6}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        rx={6}
                      />
                    )}
                  </g>
                );
              if (el.type === "circle")
                return (
                  <g key={el.id} onMouseDown={(e) => startMove(e, el)} style={{ cursor: "move" }}>
                    <circle
                      cx={el.x}
                      cy={el.y}
                      r={el.r}
                      fill={el.fill}
                      stroke={el.stroke}
                      strokeWidth={2}
                    />
                    {selectedId === el.id && (
                      <>
                        <circle
                          cx={el.x}
                          cy={el.y}
                          r={el.r + 5}
                          fill="none"
                          stroke="#f97316"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                        />
                        <rect
                          x={el.x + el.r - 6}
                          y={el.y - 6}
                          width={12}
                          height={12}
                          fill="#f97316"
                          rx={3}
                          style={{ cursor: "ew-resize" }}
                          onMouseDown={(e) => startResize(e, el)}
                        />
                      </>
                    )}
                  </g>
                );
              if (el.type === "text")
                return (
                  <g key={el.id} onMouseDown={(e) => startMove(e, el)} style={{ cursor: "move" }}>
                    <text
                      x={el.x}
                      y={el.y}
                      fill={el.color}
                      fontSize={el.fontSize}
                      transform={el.vertical ? `rotate(-90 ${el.x} ${el.y})` : undefined}
                      style={{ userSelect: "none" }}
                    >
                      {el.text}
                    </text>
                    {selectedId === el.id && (
                      <rect
                        x={el.x - 4}
                        y={el.y - el.fontSize}
                        width={Math.max(30, el.text.length * el.fontSize * 0.6) + 8}
                        height={el.fontSize + 8}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                      />
                    )}
                  </g>
                );
              if (el.type === "point")
                return (
                  <g key={el.id} onMouseDown={(e) => startMove(e, el)} style={{ cursor: "move" }}>
                    <circle
                      cx={el.x}
                      cy={el.y}
                      r={5}
                      fill={el.color}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    {el.label && (
                      <text
                        x={el.x + 9}
                        y={el.y + 4}
                        fill={el.color}
                        fontSize={12}
                        style={{ userSelect: "none" }}
                      >
                        {el.label}
                      </text>
                    )}
                    {selectedId === el.id && (
                      <circle
                        cx={el.x}
                        cy={el.y}
                        r={10}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                      />
                    )}
                  </g>
                );
              if (el.type === "line")
                return (
                  <g key={el.id}>
                    <line
                      x1={el.x1}
                      y1={el.y1}
                      x2={el.x2}
                      y2={el.y2}
                      stroke={el.stroke}
                      strokeWidth={2.5}
                      strokeDasharray={el.dash ? "8 6" : undefined}
                      markerEnd={el.arrow ? "url(#arrow)" : undefined}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (tool === "select") setSelectedId(el.id);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <line
                      x1={el.x1}
                      y1={el.y1}
                      x2={el.x2}
                      y2={el.y2}
                      stroke="transparent"
                      strokeWidth={14}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (tool === "select") setSelectedId(el.id);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    {el.label && (
                      <text
                        x={(el.x1 + el.x2) / 2}
                        y={(el.y1 + el.y2) / 2 - 6}
                        fill={el.stroke}
                        fontSize={13}
                        textAnchor="middle"
                        style={{ userSelect: "none" }}
                      >
                        {el.label}
                      </text>
                    )}
                    {selectedId === el.id && (
                      <>
                        <circle
                          cx={el.x1}
                          cy={el.y1}
                          r={6}
                          fill="#f97316"
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => startLineEndpoint(e, el, "x1y1")}
                        />
                        <circle
                          cx={el.x2}
                          cy={el.y2}
                          r={6}
                          fill="#f97316"
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => startLineEndpoint(e, el, "x2y2")}
                        />
                      </>
                    )}
                  </g>
                );
              return null;
            })}

            {drawingLine && (
              <line
                x1={drawingLine.x1}
                y1={drawingLine.y1}
                x2={drawingLine.x2}
                y2={drawingLine.y2}
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            )}
          </svg>
        </div>

        {selected && (
          <div className="w-64 border-l border-slate-200 bg-white p-4 overflow-y-auto">
            <PropertyPanel
              element={selected}
              onChange={(patch) => updateElement(selected.id, patch)}
              onDelete={deleteSelected}
              onBringToFront={() => bringToFront(selected.id)}
              onSendToBack={() => sendToBack(selected.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  icon: Icon,
  active,
  onClick,
  label,
  disabled,
}: {
  icon: any;
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-orange-100 text-orange-600" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      <Icon size={17} />
    </button>
  );
}

const inputCls = "w-full text-[13px] border border-slate-200 rounded-md px-2 py-1.5";

function PropertyPanel({
  element,
  onChange,
  onDelete,
  onBringToFront,
  onSendToBack,
}: {
  element: Element;
  onChange: (patch: Partial<Element>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">속성</h3>

      <div className="flex gap-2">
        <button
          onClick={onBringToFront}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg py-1.5"
        >
          <BringToFront size={13} /> 맨 앞으로
        </button>
        <button
          onClick={onSendToBack}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg py-1.5"
        >
          <SendToBack size={13} /> 맨 뒤로
        </button>
      </div>

      {element.type === "point" && (
        <>
          <Field label="라벨 (선택)">
            <input
              value={element.label}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className={inputCls}
            />
          </Field>
          <Field label="색">
            <ColorPicker value={element.color} onChange={(c) => onChange({ color: c } as any)} />
          </Field>
        </>
      )}

      {element.type === "group" && (
        <>
          <Field label="구역 이름">
            <input
              value={element.title}
              onChange={(e) => onChange({ title: e.target.value } as any)}
              className={inputCls}
            />
          </Field>
          <Field label="헤더 색">
            <ColorPicker
              value={element.titleColor}
              onChange={(c) => onChange({ titleColor: c } as any)}
            />
          </Field>
        </>
      )}

      {element.type === "rect" && (
        <>
          <Field label="이름">
            <input
              value={element.label}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className={inputCls}
            />
          </Field>
          <Field label="글씨 색">
            <ColorPicker
              value={element.textColor}
              onChange={(c) => onChange({ textColor: c } as any)}
            />
          </Field>
          <Field label="테두리 색">
            <ColorPicker value={element.stroke} onChange={(c) => onChange({ stroke: c } as any)} />
          </Field>
          <Field label="채우기 색">
            <ColorPicker value={element.fill} onChange={(c) => onChange({ fill: c } as any)} />
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={element.vertical}
              onChange={(e) => onChange({ vertical: e.target.checked } as any)}
            />
            세로 글씨
          </label>
        </>
      )}

      {element.type === "circle" && (
        <>
          <Field label="테두리 색">
            <ColorPicker value={element.stroke} onChange={(c) => onChange({ stroke: c } as any)} />
          </Field>
          <Field label="채우기 색">
            <ColorPicker value={element.fill} onChange={(c) => onChange({ fill: c } as any)} />
          </Field>
        </>
      )}

      {element.type === "text" && (
        <>
          <Field label="내용">
            <textarea
              value={element.text}
              onChange={(e) => onChange({ text: e.target.value } as any)}
              className={`${inputCls} h-16 resize-none`}
            />
          </Field>
          <Field label="색">
            <ColorPicker value={element.color} onChange={(c) => onChange({ color: c } as any)} />
          </Field>
          <Field label="크기">
            <input
              type="number"
              value={element.fontSize}
              min={10}
              max={48}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) } as any)}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={element.vertical}
              onChange={(e) => onChange({ vertical: e.target.checked } as any)}
            />
            세로 글씨
          </label>
        </>
      )}

      {element.type === "line" && (
        <>
          <Field label="라벨 (예: TO: SEI.COM_01)">
            <input
              value={element.label}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className={inputCls}
            />
          </Field>
          <Field label="색">
            <ColorPicker value={element.stroke} onChange={(c) => onChange({ stroke: c } as any)} />
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={element.dash}
              onChange={(e) => onChange({ dash: e.target.checked } as any)}
            />
            점선
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={element.arrow}
              onChange={(e) => onChange({ arrow: e.target.checked } as any)}
            />
            화살표
          </label>
        </>
      )}

      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg py-2 mt-2"
      >
        <Trash2 size={13} /> 삭제
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border"
          style={{
            backgroundColor: c,
            borderColor: value === c ? "#f97316" : "#e2e8f0",
            borderWidth: value === c ? 2 : 1,
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded border border-slate-200 p-0"
      />
    </div>
  );
}
