"use client";
/* Signed storage URLs are runtime values and are intentionally rendered as native images. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type SupportAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string | null;
  signedUrl: string | null;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(attachment: SupportAttachment) {
  return attachment.mimeType.startsWith("image/");
}

function isInlineDocument(attachment: SupportAttachment) {
  return attachment.mimeType === "application/pdf" || attachment.mimeType === "text/plain";
}

export default function SupportAttachmentViewer({ attachments }: { attachments: SupportAttachment[] }) {
  const images = attachments.filter(isImage).filter((attachment) => attachment.signedUrl);
  const [activeImage, setActiveImage] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const modalOpen = activeImage !== null;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveImage(null);
        return;
      }
      if (images.length < 2) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveImage((current) => current === null ? 0 : (current + 1) % images.length);
        setZoom(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveImage((current) => current === null ? images.length - 1 : (current - 1 + images.length) % images.length);
        setZoom(1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, images.length]);

  useEffect(() => {
    if (activeImage !== null) return;
    lastTriggerRef.current?.focus();
  }, [activeImage]);

  if (!attachments.length) return null;

  const openImage = (index: number, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setZoom(1);
    setActiveImage(index);
  };
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const selectedImage = activeImage === null ? null : images[activeImage];

  return (
    <section className="mt-4 border-t border-black/10 pt-4" aria-label="Attachments">
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">Attachments</p>
      <div className="mt-3 space-y-3">
        {attachments.map((attachment) => {
          const imageIndex = images.findIndex((image) => image.id === attachment.id);
          if (isImage(attachment)) {
            return attachment.signedUrl ? (
              <button
                key={attachment.id}
                type="button"
                className="group flex max-w-full items-center gap-3 rounded-lg border border-black/10 bg-white/45 p-2 text-left transition hover:border-[#087456]/50 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087456]"
                onClick={(event) => openImage(imageIndex, event.currentTarget)}
                aria-label={`Preview image ${attachment.fileName}`}
              >
                <span className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#eef0e9]">
                  <img src={attachment.signedUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                </span>
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium text-[#10231d]">{attachment.fileName}</span>
                  <span className="mt-1 block text-xs text-black/45">{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</span>
                  <span className="mt-2 block text-xs font-semibold text-[#087456]">Open preview</span>
                </span>
              </button>
            ) : (
              <div key={attachment.id} className="rounded-lg border border-black/10 bg-white/45 px-3 py-3 text-sm">
                <p className="font-medium text-[#10231d]">{attachment.fileName}</p>
                <p className="mt-1 text-xs text-black/45">Preview unavailable · {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</p>
              </div>
            );
          }

          return (
            <div key={attachment.id} className="rounded-lg border border-black/10 bg-white/45 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-[#10231d]">{attachment.fileName}</p>
                  <p className="mt-1 text-xs text-black/45">{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</p>
                </div>
                {attachment.signedUrl && <a href={attachment.signedUrl} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-[#087456] hover:underline">Open securely</a>}
              </div>
              {attachment.signedUrl && isInlineDocument(attachment) && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-[#087456]">Preview inline</summary>
                  <iframe
                    title={`Preview ${attachment.fileName}`}
                    src={attachment.signedUrl}
                    sandbox=""
                    className="mt-3 h-64 w-full rounded-md border border-black/10 bg-white"
                  />
                </details>
              )}
              {!attachment.signedUrl && <p className="mt-2 text-xs text-red-700">Secure preview is temporarily unavailable.</p>}
            </div>
          );
        })}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#16251f]/75 p-4 sm:p-8"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveImage(null); }}
        >
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="support-image-preview-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/20 bg-[#f7f5ef] shadow-2xl" onMouseDown={(event) => event.stopPropagation()} onKeyDown={handleDialogKeyDown}>
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p id="support-image-preview-title" className="font-medium text-[#10231d]">Image preview</p>
                <p className="mt-1 truncate text-xs text-black/50">{selectedImage.fileName} · {selectedImage.mimeType} · {formatBytes(selectedImage.sizeBytes)}</p>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setActiveImage(null)} className="shrink-0 rounded-md border border-black/15 px-3 py-1.5 text-sm font-semibold text-[#10231d] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087456]" aria-label="Close image preview">Close</button>
            </header>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#16251f]/10 p-4 sm:p-8">
              {images.length > 1 && <button type="button" onClick={() => { setActiveImage((activeImage! - 1 + images.length) % images.length); setZoom(1); }} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-black/15 bg-[#f7f5ef]/95 px-3 py-2 text-lg text-[#10231d] shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087456]" aria-label="Previous image">←</button>}
              <img src={selectedImage.signedUrl!} alt={selectedImage.fileName} className="max-h-[68vh] max-w-full object-contain transition-transform duration-150" style={{ transform: `scale(${zoom})` }} />
              {images.length > 1 && <button type="button" onClick={() => { setActiveImage((activeImage! + 1) % images.length); setZoom(1); }} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-black/15 bg-[#f7f5ef]/95 px-3 py-2 text-lg text-[#10231d] shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087456]" aria-label="Next image">→</button>}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-4 py-3 text-sm sm:px-6">
              <span className="text-xs text-black/50">Image {activeImage! + 1} of {images.length}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))} className="rounded-md border border-black/15 px-2.5 py-1.5 text-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087456]" aria-label="Zoom out">−</button>
                <button type="button" onClick={() => setZoom(1)} className="rounded-md border border-black/15 px-2.5 py-1.5 text-xs hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087456]">Reset zoom</button>
                <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} className="rounded-md border border-black/15 px-2.5 py-1.5 text-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087456]" aria-label="Zoom in">+</button>
                <a href={selectedImage.signedUrl!} target="_blank" rel="noreferrer" className="ml-1 text-xs font-semibold text-[#087456] hover:underline">Open securely</a>
              </div>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
