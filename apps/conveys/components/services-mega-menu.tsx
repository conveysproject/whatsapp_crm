"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { COLUMNS, getServicesByColumn, ICONS } from "@/lib/services-data";

const NAV_ICONS: Record<string, string> = {
  "site-migration": ICONS.upload,
  "cloud-infrastructure-setup": ICONS.cloud,
  "whatsapp-business-api": ICONS.chat,
  "cloud-architecture-review": ICONS.cog,
  "devops-cicd": ICONS.refresh,
  "database-administration": ICONS.database,
  "mobile-app-development": ICONS.phone,
  "native-app-development": ICONS.chip,
  "custom-software-development": ICONS.code,
  "cross-platform-development": ICONS.cube,
  "iot-development": ICONS.wifi,
  "ui-ux-design": ICONS.pencil,
  "frontend-development": ICONS.globe,
  "backend-development": ICONS.server,
  "web-development": ICONS.globe,
  "digital-transformation": ICONS.bolt,
  "managed-it-services": ICONS.wrench,
  "digital-marketing": ICONS.broadcast,
  "whatsapp-marketing-automation": ICONS.chat,
  "crm-integration": ICONS.users,
  "managed-service-provider": ICONS.building,
  "whatsapp-crm": ICONS.sparkle,
  "ai-solutions": ICONS.sparkle,
  "saas-product-development": ICONS.cloud,
  "mvp-development": ICONS.rocket,
  "api-integration-development": ICONS.link,
  "ecommerce-solutions": ICONS.bag,
  "b2b-platform-design": ICONS.building,
  "whatsapp-commerce": ICONS.chat,
};

function NavIcon({ path }: { path: string }): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={path} />
    </svg>
  );
}

// ─── Desktop mega menu ────────────────────────────────────────────────────────

export function ServicesMegaMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 transition hover:text-blue-700"
      >
        Services
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="fixed inset-x-4 top-[65px] z-50 sm:inset-x-6 lg:inset-x-8"
        >
          <div className="mx-auto max-w-6xl rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
              {COLUMNS.map((column) => (
                <div key={column}>
                  <p className="mb-3 border-b border-blue-700/30 pb-2 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    {column}
                  </p>
                  <ul className="space-y-0.5">
                    {getServicesByColumn(column).map((service) => (
                      <li key={service.slug}>
                        <Link
                          href={`/services/${service.slug}`}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
                        >
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                            <NavIcon path={NAV_ICONS[service.slug] ?? ICONS.star} />
                          </span>
                          {service.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mobile accordion ─────────────────────────────────────────────────────────

export function ServicesMobileAccordion({ onClose }: { onClose: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [openColumn, setOpenColumn] = useState<string | null>(null);

  function toggleColumn(col: string) {
    setOpenColumn((prev) => (prev === col ? null : col));
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md py-2 text-left text-sm font-medium text-slate-700 hover:text-blue-700"
      >
        Services
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-1 space-y-2 pl-3 border-l-2 border-blue-100">
          {COLUMNS.map((column) => (
            <div key={column}>
              <button
                type="button"
                aria-expanded={openColumn === column}
                onClick={() => toggleColumn(column)}
                className="flex w-full items-center justify-between rounded-md py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-blue-700"
              >
                {column}
                <svg
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${openColumn === column ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {openColumn === column && (
                <ul className="mt-1 space-y-0.5 pl-2">
                  {getServicesByColumn(column).map((service) => (
                    <li key={service.slug}>
                      <Link
                        href={`/services/${service.slug}`}
                        onClick={onClose}
                        className="block rounded-md py-1.5 text-sm text-slate-600 hover:text-blue-700"
                      >
                        {service.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
