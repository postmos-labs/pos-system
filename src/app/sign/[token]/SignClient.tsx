"use client";

import { useRef, useState, useEffect } from "react";
import { usePdfPreviewImage } from "@/hooks/usePdfPreviewImage";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ratioToPixel, isRatioRect, type RatioRect } from "@/lib/pdf/zoneCoords";

// 모바일 서명 단계에서 서명란으로 확대해서 이동할 때 사용하는 배율.
const MOBILE_ZONE_ZOOM = 1.8;

interface SignedItem extends RatioRect {
  id: string;
  type: "signature";
  dataUrl: string;
  pageNumber: number;
}

interface Zone extends RatioRect {
  id: string;
  label: string;
  required: boolean;
}

interface Contract {
  id: string;
  title: string;
  pdf_url: string;
  signer_name: string;
  status: string;
  sign_token: string;
  token_expires_at: string;
  signature_zones?: unknown[];
  signer_phone?: string;
}

interface Props {
  contract: Contract;
  previewImageDataUrl: string | null;
}

function SignaturePadModal({
  onComplete,
  onClose,
}: {
  onComplete: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasStroke(true);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    setDrawing(false);
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  }

  function complete() {
    if (!hasStroke) return;
    onComplete(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <p className="font-bold text-gray-900">서명하기</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="p-4">
          <canvas
            ref={canvasRef}
            width={460}
            height={200}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <p className="text-xs text-gray-400 text-center mt-2">위 공간에 서명을 그려주세요</p>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={clear}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
          >
            지우기
          </button>
          <button
            onClick={complete}
            disabled={!hasStroke}
            className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignClient({ contract, previewImageDataUrl }: Props) {
  const zones: Zone[] = (contract.signature_zones ?? [])
    .filter(isRatioRect)
    .map((z) => ({ ...z, required: (z as Partial<Zone>).required ?? true })) as Zone[];
  const requiredZones = zones.filter((z) => z.required);

  const [signedZones, setSignedZones] = useState<Record<string, string>>({});
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  const [showPad, setShowPad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(contract.status === "signed");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const [mobileStep, setMobileStep] = useState<"review" | "sign" | "complete">("review");
  const [currentZoneIndex, setCurrentZoneIndex] = useState(0);
  const [reviewedToEnd, setReviewedToEnd] = useState(false);

  const {
    imgRef,
    renderedWidth,
    renderedHeight,
    error: pdfError,
  } = usePdfPreviewImage(previewImageDataUrl);

  // 검토 단계: PDF를 끝까지 스크롤했거나(또는 로드 실패/한 화면에 다 들어오는 경우) 다음 단계로 넘어갈 수 있게 한다.
  useEffect(() => {
    if (!isMobile || mobileStep !== "review") return;
    const el = scrollAreaRef.current;
    const alreadyFits = !!el && el.scrollHeight <= el.clientHeight + 24;
    if (pdfError || alreadyFits) setReviewedToEnd(true);
  }, [isMobile, mobileStep, pdfError, renderedWidth, renderedHeight]);

  function handleReviewScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!isMobile || mobileStep !== "review" || reviewedToEnd) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setReviewedToEnd(true);
  }

  // 서명 단계: 현재 서명란이 화면 중앙에 오도록 확대 위치로 이동한다.
  useEffect(() => {
    if (!isMobile || mobileStep !== "sign") return;
    if (!renderedWidth || !renderedHeight) return;
    const zone = zones[currentZoneIndex];
    const containerEl = containerRef.current;
    const scrollEl = scrollAreaRef.current;
    if (!zone || !containerEl || !scrollEl) return;
    const px = ratioToPixel(zone, renderedWidth, renderedHeight);
    const targetX = containerEl.offsetLeft + px.x + px.width / 2;
    const targetY = containerEl.offsetTop + px.y + px.height / 2;
    scrollEl.scrollTo({
      left: Math.max(0, targetX - scrollEl.clientWidth / 2),
      top: Math.max(0, targetY - scrollEl.clientHeight / 2),
      behavior: "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, mobileStep, currentZoneIndex, renderedWidth, renderedHeight]);

  function goToNextZone() {
    if (currentZoneIndex < zones.length - 1) setCurrentZoneIndex((i) => i + 1);
    else setMobileStep("complete");
  }

  function goToPrevZone() {
    setCurrentZoneIndex((i) => Math.max(0, i - 1));
  }

  function handleSignatureComplete(dataUrl: string) {
    setShowPad(false);
    if (!activeZoneId) return;
    setSignedZones((prev) => ({ ...prev, [activeZoneId]: dataUrl }));
    setActiveZoneId(null);
    if (isMobile && mobileStep === "sign") goToNextZone();
  }

  async function handleSubmit() {
    const missingRequired = requiredZones.filter((z) => !signedZones[z.id]);
    if (missingRequired.length > 0) {
      alert(`아직 서명하지 않은 칸이 있습니다:\n${missingRequired.map((z) => z.label).join(", ")}`);
      return;
    }

    const missingOptional = zones.filter((z) => !z.required && !signedZones[z.id]);
    const confirmMessage =
      missingOptional.length > 0
        ? `다음 선택 항목에는 서명하지 않았습니다: ${missingOptional.map((z) => z.label).join(", ")}.\n이대로 제출하시겠습니까? 이후 수정이 불가합니다.`
        : "서명을 완료하시겠습니까? 이후 수정이 불가합니다.";
    if (!confirm(confirmMessage)) return;
    setSubmitting(true);

    const submitItems: SignedItem[] = zones
      .filter((z) => signedZones[z.id])
      .map((z) => ({
        id: z.id,
        type: "signature",
        dataUrl: signedZones[z.id],
        xRatio: z.xRatio,
        yRatio: z.yRatio,
        widthRatio: z.widthRatio,
        heightRatio: z.heightRatio,
        pageNumber: 1,
      }));

    const signRes = await fetch("/api/contracts/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: contract.sign_token, items: submitItems }),
    });

    if (!signRes.ok) {
      const json = await signRes.json().catch(() => ({}));
      alert("서명 저장 실패: " + (json.error ?? "알 수 없는 오류"));
      setSubmitting(false);
      return;
    }

    fetch("/api/contracts/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 로그인이 없는 화면이라 서명 토큰으로 확인한다. 수신번호는 서버가 DB에서 읽는다.
      body: JSON.stringify({
        type: "sign_complete",
        signToken: contract.sign_token,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          console.error("서명 완료 알림톡 발송 실패:", json.error);
        }
      })
      .catch((err) => console.error("서명 완료 알림톡 발송 실패:", err));

    setSubmitting(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-sm px-6">
          <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <polyline
                points="20 6 9 17 4 12"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">서명이 완료되었습니다</h1>
          <p className="text-sm text-gray-500">감사합니다.</p>
        </div>
      </div>
    );
  }

  const isExpired = new Date(contract.token_expires_at) < new Date();
  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-sm px-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">링크가 만료되었습니다</h1>
          <p className="text-sm text-gray-500">담당자에게 재발송을 요청해주세요.</p>
        </div>
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-sm px-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            서명 위치가 지정되지 않았습니다
          </h1>
          <p className="text-sm text-gray-500">담당자에게 문의해주세요.</p>
        </div>
      </div>
    );
  }

  const currentZone = zones[currentZoneIndex];
  const isMobileSignStep = isMobile && mobileStep === "sign";
  const zoomActive = isMobileSignStep && !!currentZone && !!renderedWidth && !!renderedHeight;
  const currentZonePx = zoomActive
    ? ratioToPixel(currentZone, renderedWidth!, renderedHeight!)
    : null;

  return (
    <div className="h-screen overflow-hidden bg-white flex flex-col lg:h-auto lg:min-h-screen lg:overflow-visible lg:flex-row">
      {}
      <div className="hidden lg:flex lg:w-72 bg-gray-50 lg:border-r border-gray-100 flex-col">
        <div className="h-14 flex items-center gap-2.5 px-6 border-b border-gray-100">
          <div className="w-2 h-2 rounded-full bg-gray-900" />
          <span className="text-sm font-semibold text-gray-900">POS 전산</span>
        </div>
        <div className="flex-1 px-6 py-6 space-y-5">
          <div>
            <p className="text-xs text-gray-400 mb-1">계약서</p>
            <h1 className="text-base font-semibold text-gray-900">{contract.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {contract.signer_name}님께 서명을 요청드립니다
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              서명 위치 ({Object.keys(signedZones).length}/{zones.length})
            </p>
            <ul className="space-y-1.5">
              {zones.map((zone, i) => (
                <li
                  key={zone.id}
                  className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 border ${signedZones[zone.id] ? "bg-green-50 border-green-200 text-green-700" : "bg-white border-gray-100 text-gray-500"}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="truncate">{zone.label}</span>
                    <span
                      className={`flex-shrink-0 text-[9px] px-1 py-0.5 rounded ${zone.required ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"}`}
                    >
                      {zone.required ? "필수" : "선택"}
                    </span>
                  </span>
                  {signedZones[zone.id] ? (
                    <span className="flex-shrink-0">✓ 완료</span>
                  ) : (
                    <span className="text-gray-300 flex-shrink-0">미서명</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-3">PDF의 점선 박스를 클릭해서 서명하세요</p>
          </div>
        </div>

        <div className="px-6 py-5 border-t border-gray-100">
          <button
            onClick={handleSubmit}
            disabled={submitting || requiredZones.some((z) => !signedZones[z.id])}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {submitting ? "처리 중..." : "서명 완료"}
          </button>
          {requiredZones.some((z) => !signedZones[z.id]) && (
            <p className="text-xs text-gray-400 text-center mt-2">
              필수 서명 칸을 모두 완료해주세요
            </p>
          )}
        </div>
      </div>

      {}
      <div className="lg:hidden flex-shrink-0 bg-gray-50 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-center gap-1.5 mb-2">
          {(["review", "sign", "complete"] as const).map((step, idx, arr) => {
            const stepLabel = step === "review" ? "검토" : step === "sign" ? "서명" : "완료";
            const currentIdx = arr.indexOf(mobileStep);
            const isDone = idx < currentIdx;
            const isActive = step === mobileStep;
            return (
              <div key={step} className="flex items-center gap-1.5">
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${isActive ? "bg-gray-900 text-white" : isDone ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}
                >
                  {isDone ? "✓" : idx + 1} {stepLabel}
                </span>
                {idx < arr.length - 1 && <span className="w-3 h-px bg-gray-300" />}
              </div>
            );
          })}
        </div>
        <p className="text-sm font-semibold text-gray-900 truncate text-center">{contract.title}</p>
        {mobileStep === "review" && (
          <p className="text-xs text-gray-500 text-center mt-0.5">
            계약 내용을 끝까지 확인해주세요
          </p>
        )}
        {mobileStep === "sign" && currentZone && (
          <p className="text-xs text-gray-500 text-center mt-0.5">
            {currentZoneIndex + 1} / {zones.length} · {currentZone.label}
          </p>
        )}
        {mobileStep === "complete" && (
          <p className="text-xs text-gray-500 text-center mt-0.5">
            서명 내용을 확인하고 제출해주세요
          </p>
        )}
        {mobileStep === "complete" && (
          <ul className="mt-2 space-y-1 max-h-24 overflow-y-auto">
            {zones.map((zone, i) => (
              <li
                key={zone.id}
                className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 border ${signedZones[zone.id] ? "bg-green-50 border-green-200 text-green-700" : "bg-white border-gray-100 text-gray-400"}`}
              >
                <span className="truncate">
                  {i + 1}. {zone.label}
                </span>
                <span>{signedZones[zone.id] ? "✓ 완료" : "미서명"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {}
      <div
        ref={scrollAreaRef}
        onScroll={handleReviewScroll}
        className="flex-1 min-h-0 overflow-auto bg-gray-100 relative p-4 pb-36 lg:pb-4"
      >
        <div
          ref={containerRef}
          className="relative bg-white shadow-lg mx-auto"
          style={{
            maxWidth: 900,
            minWidth: 320,
            transform: zoomActive ? `scale(${MOBILE_ZONE_ZOOM})` : undefined,
            transformOrigin:
              zoomActive && currentZonePx
                ? `${currentZonePx.x + currentZonePx.width / 2}px ${currentZonePx.y + currentZonePx.height / 2}px`
                : undefined,
            transition: "transform 0.3s ease",
          }}
        >
          {previewImageDataUrl && (
            <img
              ref={imgRef}
              src={previewImageDataUrl}
              alt="계약서"
              draggable={false}
              className="block w-full h-auto select-none"
            />
          )}
          {pdfError && (
            <p className="p-4 text-sm text-red-500">계약서를 불러오지 못했습니다: {pdfError}</p>
          )}

          {}
          {renderedWidth && renderedHeight && !(isMobile && mobileStep === "review") && (
            <div className="absolute inset-0 pointer-events-none">
              {zones.map((zone, i) => {
                const px = ratioToPixel(zone, renderedWidth, renderedHeight);
                const isCurrent = isMobileSignStep && i === currentZoneIndex;
                const hideWhileZooming = isMobileSignStep && !isCurrent && !signedZones[zone.id];
                if (hideWhileZooming) return null;
                const clickable =
                  mobileStep !== "complete" && (!isMobile || !isMobileSignStep || isCurrent);
                return (
                  <div
                    key={zone.id}
                    style={{
                      position: "absolute",
                      left: px.x,
                      top: px.y,
                      width: px.width,
                      height: px.height,
                      pointerEvents: clickable ? "auto" : "none",
                    }}
                    className={`border-2 border-dashed flex items-center justify-center transition-colors ${
                      signedZones[zone.id]
                        ? "border-green-400 bg-green-50/60"
                        : isCurrent
                          ? "border-blue-500 bg-blue-50/70 ring-4 ring-blue-300/50 cursor-pointer"
                          : "border-blue-400 bg-blue-50/40 hover:bg-blue-100/60 cursor-pointer"
                    }`}
                    onClick={() => {
                      if (clickable && !signedZones[zone.id]) {
                        setActiveZoneId(zone.id);
                        setShowPad(true);
                      }
                    }}
                  >
                    {signedZones[zone.id] ? (
                      <img
                        src={signedZones[zone.id]}
                        alt="서명"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-sm select-none">
                        {i + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-gray-50 border-t border-gray-100 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {mobileStep === "review" && (
          <button
            onClick={() => setMobileStep("sign")}
            disabled={!reviewedToEnd}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {reviewedToEnd ? "동의하고 계속하기" : "계약서를 끝까지 확인해주세요"}
          </button>
        )}

        {mobileStep === "sign" && currentZone && (
          <div className="flex gap-2">
            <button
              onClick={goToPrevZone}
              disabled={currentZoneIndex === 0}
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 disabled:opacity-30 transition"
            >
              이전
            </button>
            {signedZones[currentZone.id] ? (
              <button
                onClick={goToNextZone}
                className="flex-1 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
              >
                {currentZoneIndex < zones.length - 1 ? "다음 서명란" : "완료 확인하기"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setActiveZoneId(currentZone.id);
                    setShowPad(true);
                  }}
                  className="flex-1 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
                >
                  여기에 서명하기
                </button>
                {!currentZone.required && (
                  <button
                    onClick={goToNextZone}
                    className="px-3 text-xs text-gray-400 underline flex-shrink-0"
                  >
                    건너뛰기
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {mobileStep === "complete" && (
          <>
            <button
              onClick={handleSubmit}
              disabled={submitting || requiredZones.some((z) => !signedZones[z.id])}
              className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
            >
              {submitting ? "처리 중..." : "서명 완료"}
            </button>
            <button
              onClick={() => setMobileStep("sign")}
              className="w-full text-xs text-gray-400 text-center mt-2 underline"
            >
              서명 내용 다시 확인하기
            </button>
          </>
        )}
      </div>

      {showPad && (
        <SignaturePadModal onComplete={handleSignatureComplete} onClose={() => setShowPad(false)} />
      )}
    </div>
  );
}
