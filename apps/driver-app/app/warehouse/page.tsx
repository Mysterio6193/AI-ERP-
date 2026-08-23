import { redirect } from "next/navigation"

export default function WarehouseRedirectPage() {
  redirect("/?mode=warehouse")
}
