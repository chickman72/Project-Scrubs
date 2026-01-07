"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Faculty Profiles", href: "/faculty-profiles" },
  { label: "Reports", href: "/reports", disabled: true },
  { label: "Settings", href: "/settings", disabled: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white px-6 py-8">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          School of Nursing
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          Publication Tracker
        </h1>
      </div>
      <nav className="space-y-3 text-sm font-medium text-slate-600">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const baseClasses = "block w-full rounded-lg px-4 py-2 text-left";
          const activeClasses = isActive
            ? "bg-slate-900 text-slate-50"
            : "hover:bg-slate-100";
          const disabledClasses = item.disabled ? "cursor-not-allowed opacity-50" : "";
          const classes = `${baseClasses} ${activeClasses} ${disabledClasses}`;

          if (item.disabled) {
            return (
              <div key={item.href} className={classes} aria-disabled="true">
                {item.label}
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={classes}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
