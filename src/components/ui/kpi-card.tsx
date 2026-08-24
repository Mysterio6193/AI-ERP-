import * as React from "react"
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  change?: {
    value: number | string
    label?: string
    isPositive?: boolean
  }
  variant?: "default" | "primary" | "warning" | "success" | "danger" | "purple"
}

export function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  change,
  variant = "default",
  className,
  ...props
}: KpiCardProps) {
  const variantStyles = {
    default: {
      border: "hover:border-primary/40",
      glow: "from-primary/10 via-transparent to-transparent",
      iconBg: "bg-primary/10 text-primary ring-1 ring-primary/20",
    },
    primary: {
      border: "hover:border-blue-500/40",
      glow: "from-blue-500/15 via-transparent to-transparent",
      iconBg: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/25",
    },
    success: {
      border: "hover:border-emerald-500/40",
      glow: "from-emerald-500/15 via-transparent to-transparent",
      iconBg: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/25",
    },
    warning: {
      border: "hover:border-amber-500/40",
      glow: "from-amber-500/15 via-transparent to-transparent",
      iconBg: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25",
    },
    danger: {
      border: "hover:border-rose-500/40",
      glow: "from-rose-500/15 via-transparent to-transparent",
      iconBg: "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/25",
    },
    purple: {
      border: "hover:border-purple-500/40",
      glow: "from-purple-500/15 via-transparent to-transparent",
      iconBg: "bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/25",
    },
  }[variant]

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card/90 to-card/60 backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5",
        variantStyles.border,
        className
      )}
      {...props}
    >
      {/* Subtle top radial gradient */}
      <div className={cn("pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-50 blur-2xl transition-opacity group-hover:opacity-100", variantStyles.glow)} />

      <CardContent className="p-5 relative z-10">
        <div className="flex items-center justify-between space-y-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
          {Icon && (
            <div className={cn("flex h-8.5 w-8.5 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110", variantStyles.iconBg)}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div className="text-2xl font-extrabold tracking-tight text-foreground">{value}</div>
          {change && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                change.isPositive
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              )}
            >
              {change.isPositive ? (
                <TrendingUp className="h-3 w-3 shrink-0" />
              ) : (
                <TrendingDown className="h-3 w-3 shrink-0" />
              )}
              {change.value}
            </span>
          )}
        </div>
        {(description || (change && change.label)) && (
          <p className="mt-2 text-xs text-muted-foreground/80 font-medium line-clamp-1">
            {change?.label || description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
