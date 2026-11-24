"use client";

import {
  BookOpenText,
  Boxes,
  Headset,
  LayoutDashboard,
  Menu,
  PackagePlus,
  Settings,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export type NavBadges = { tickets: number };
type NavUser = { name: string; role: "admin" | "cs" | "staff"; roleLabel: string };
type LlmInfo = { enabled: boolean; model: string; host: string };

const ITEMS = [
  { href: "/", label: "总览", icon: LayoutDashboard },
  { href: "/inventory", label: "库存总览", icon: Boxes },
  { href: "/replenishment", label: "补货计划", icon: PackagePlus },
  { href: "/assistant", label: "智能问答", icon: Sparkles },
  { href: "/tickets", label: "客服工单", icon: Headset, roles: ["admin", "cs"] },
  { href: "/knowledge", label: "知识库", icon: BookOpenText },
  { href: "/import", label: "数据导入", icon: Upload, roles: ["admin"] },
  { href: "/settings", label: "设置", icon: Settings, roles: ["admin"] },
] as const;

function NavLinks({ user, badges, onNavigate }: { user: NavUser; badges: NavBadges; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.filter((item) => !("roles" in item) || (item.roles as readonly string[]).includes(user.role)).map(
        (item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/tickets" && badges.tickets > 0 && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 tabular-nums">
                  {badges.tickets}
                </Badge>
              )}
            </Link>
          );
        },
      )}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Boxes className="size-4" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">跨境运营助手</div>
        <div className="text-[11px] text-muted-foreground">Amazon 美国站 · 欧洲站</div>
      </div>
    </Link>
  );
}

function Footer({ user, llm }: { user: NavUser; llm: LlmInfo }) {
  return (
    <div className="space-y-3 border-t px-3 pt-3">
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("size-2 rounded-full", llm.enabled ? "bg-emerald-500" : "bg-amber-500")} />
        <span className="text-muted-foreground">
          {llm.enabled ? `大模型：${llm.model}` : "模拟模式（未配置大模型）"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="text-xs text-muted-foreground">{user.roleLabel}</div>
        </div>
      </div>
    </div>
  );
}

export function SideNav({ user, llm, badges }: { user: NavUser; llm: LlmInfo; badges: NavBadges }) {
  return (
    <div className="flex h-full flex-col gap-6 py-4">
      <Brand />
      <div className="flex-1 overflow-y-auto px-2">
        <NavLinks user={user} badges={badges} />
      </div>
      <Footer user={user} llm={llm} />
    </div>
  );
}

export function MobileNav({ user, llm, badges }: { user: NavUser; llm: LlmInfo; badges: NavBadges }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="打开菜单" />}>
          <Menu />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>导航菜单</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col gap-6 py-4">
            <Brand />
            <div className="flex-1 px-2">
              <NavLinks user={user} badges={badges} onNavigate={() => setOpen(false)} />
            </div>
            <Footer user={user} llm={llm} />
          </div>
        </SheetContent>
      </Sheet>
      <span className="text-sm font-semibold">跨境运营助手</span>
    </header>
  );
}
