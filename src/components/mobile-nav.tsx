"use client";

import { Menu } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * The menu on narrow screens (22 Nov styling pass): a button that opens the same links in a side sheet, stacked.
 * Closes after a link is followed.
 */
export function MobileNav({
  children,
  buttonClassName = "md:hidden",
}: {
  children: ReactNode;
  /** Hides the button where the links fit on one row. */
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={`ms-auto rounded-md p-2 text-white hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none ${buttonClassName}`}
      >
        <Menu aria-hidden="true" className="size-6" />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle className="text-lg font-semibold">Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Pages of the portal
        </SheetDescription>
        <nav
          aria-label="Main"
          className="flex flex-col items-start gap-4 pt-2 text-base [&_a]:text-white"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
