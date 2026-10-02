// Ported from every-app/open-seo db8bde1 src/client/components/CardShell.tsx (MIT); uses NocoReach's Card.
import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card with a header row and a divided body, for data overview cards. It fills its grid cell, and the body grows so
 * the stamp sits at the bottom of equal-height cards.
 */
export function CardShell({
  title,
  aside,
  stamp,
  action,
  className,
  children,
  ...rest
}: {
  title: ReactNode;
  /** Muted text after the title, for example the repository name. */
  aside?: ReactNode;
  stamp?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string>) {
  return (
    <Card className={cn("h-full", className)} {...rest}>
      <CardHeader className="border-b">
        <CardTitle className="flex min-w-0 items-baseline gap-2">
          <h2 className="leading-tight">{title}</h2>
          {aside ? <span className="truncate text-xs font-normal text-muted-foreground">{aside}</span> : null}
        </CardTitle>
        {action ? <CardAction className="self-center">{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {children}
        {stamp ? <p className="mt-auto pt-4 text-xs text-muted-foreground">{stamp}</p> : null}
      </CardContent>
    </Card>
  );
}
