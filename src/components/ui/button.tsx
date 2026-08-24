import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[14px] font-medium tracking-[-0.01em] transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "border border-primary/20 bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-110",
        destructive:
          "border border-destructive/20 bg-destructive text-white shadow-sm shadow-destructive/20 hover:brightness-110 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-border/80 bg-card/60 text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-border",
        secondary:
          "border border-border/60 bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent/80 hover:text-accent-foreground dark:hover:bg-accent/80",
        link: "rounded-md px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9.5 px-4 py-2 has-[>svg]:px-3.5 text-sm",
        sm: "h-8.5 gap-1.5 px-3 has-[>svg]:px-2.5 text-xs rounded-lg",
        lg: "h-11 px-6 text-base has-[>svg]:px-5 rounded-xl",
        icon: "size-9 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
