"use client";

import { WorkspaceCacheProvider } from "@/pages/workspace-cache";
import { Header } from "@/components/app-shell/header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";
import { PageErrorBoundary } from "./page-error-boundary";
import { Sidebar } from "./sidebar";

export function Layout({ children }: PropsWithChildren) {
  return (
    <WorkspaceCacheProvider><SidebarProvider open={true}>
      <Sidebar />
      <SidebarInset className="bg-muted/25">
        <Header />
        <main
          // Full width like NocoProject (NocoSolution frontend standard §3.1): no width cap here, and the padding
          // comes from each page's PageContainer (p-6 md:p-8) so it is not doubled.
          className={cn("@container/main", "relative", "w-full", "min-w-0", "flex", "flex-col", "flex-1")}
        >
          <PageErrorBoundary>{children}</PageErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider></WorkspaceCacheProvider>
  );
}

Layout.displayName = "Layout";
