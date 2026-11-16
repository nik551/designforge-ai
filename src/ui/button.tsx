import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Local shadcn/ui-style primitive using CVA variants and merged utility classes.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:pointer-events-none disabled:opacity-50",
  { variants: { variant: {
    primary: "bg-violet-600 text-white hover:bg-violet-700",
    secondary: "border border-line bg-white text-ink hover:bg-slate-100",
    ghost: "text-muted hover:bg-slate-100 hover:text-ink",
  } }, defaultVariants: { variant: "secondary" } },
);
export function Button({ variant, className, type = "button", ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={twMerge(clsx(buttonVariants({ variant }), className))} {...props} />;
}
