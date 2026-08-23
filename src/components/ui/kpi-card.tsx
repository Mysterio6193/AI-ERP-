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
  variant?: "default" | "primary" | "warning" | "success" | "danger"
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
  return (
    <Card className={cn("overflow-hidden border border-border shadow-sm transition-all hover:shadow-md", className)} {...props}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between space-y-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          {Icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
          {change && (
            <span
              className={cn(
                "inline-flex items-center text-xs font-medium",
                change.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}
            >
              {change.isPositive ? (
                <TrendingUp className="mr-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <TrendingDown className="mr-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              {change.value}
            </span>
          )}
        </div>
        {(description || (change && change.label)) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {change?.label || description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
