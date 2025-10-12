import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-border-focus/50 focus-visible:ring-[3px] aria-invalid:ring-destructive-text/20 aria-invalid:border-destructive-text transition-all overflow-hidden border-0 shadow-2layer-sm",
  {
    variants: {
      variant: {
        default:
          "bg-primary-2 text-text-on-primary [a&]:hover:bg-primary-3",
        secondary:
          "bg-bg-layer-3 text-text-body [a&]:hover:bg-bg-layer-4",
        destructive:
          "bg-destructive-bg text-destructive-text [a&]:hover:bg-destructive-hover",
        outline:
          "bg-bg-layer-2 text-text-body [a&]:hover:bg-bg-layer-3",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
