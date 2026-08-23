"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Edit2,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  UserCheck,
  UserCircle,
  Users,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { KpiCard } from "@/components/ui/kpi-card"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

type AdminUser = {
  id: string
  name: string
  email: string
  role: UserRole
  status: string
  phone?: string | null
  avatar?: string | null
  licenseNumber?: string | null
  vehicleId?: string | null
  createdAt: string
}

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  inactive: "bg-muted text-muted-foreground border-border",
}

export default function UsersPage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "sales" as UserRole,
    status: "active",
    phone: "",
    password: "",
    licenseNumber: "",
    vehicleId: "",
  })

  async function fetchUsers() {
    setLoading(true)
    try {
      const response = await fetch("/api/users")
      const payload = await response.json()
      if (payload.success) {
        setUsers(payload.data || [])
      }
    } catch (error) {
      console.error("Error fetching users:", error)
      toast({
        variant: "destructive",
        title: "Unable to load admin users",
        description: "Failed to connect to the user directory.",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const query = search.toLowerCase()
      const matchesSearch =
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        (user.phone || "").toLowerCase().includes(query)
      const matchesRole = roleFilter === "all" || user.role === roleFilter
      return matchesSearch && matchesRole
    })
  }, [users, search, roleFilter])

  function resetForm() {
    setFormData({
      name: "",
      email: "",
      role: "sales",
      status: "active",
      phone: "",
      password: "",
      licenseNumber: "",
      vehicleId: "",
    })
    setSelectedUser(null)
  }

  function openCreateDialog() {
    resetForm()
    setDialogOpen(true)
  }

  function openEditDialog(user: AdminUser) {
    setSelectedUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      phone: user.phone || "",
      password: "",
      licenseNumber: user.licenseNumber || "",
      vehicleId: user.vehicleId || "",
    })
    setDialogOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const url = selectedUser ? `/api/users/${selectedUser.id}` : "/api/users"
      const method = selectedUser ? "PATCH" : "POST"
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to save user")
      }

      toast({
        title: selectedUser ? "User updated" : "User created",
        description: `${formData.name} successfully saved.`,
      })
      setDialogOpen(false)
      resetForm()
      await fetchUsers()
    } catch (error) {
      console.error("Error saving user:", error)
      toast({
        variant: "destructive",
        title: "Failed to save user",
        description: error instanceof Error ? error.message : "Request failed",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user: AdminUser) {
    if (!window.confirm(`Delete user account "${user.name}"?`)) return
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to delete user")
      }
      toast({
        title: "User removed",
        description: `Account for ${user.name} deleted.`,
      })
      await fetchUsers()
    } catch (error) {
      console.error("Error deleting user:", error)
      toast({
        variant: "destructive",
        title: "Failed to delete user",
        description: error instanceof Error ? error.message : "Request failed",
      })
    }
  }

  const activeCount = users.filter((user) => user.status === "active").length
  const adminCount = users.filter((user) => user.role === "admin").length
  const driverCount = users.filter((user) => user.role === "driver").length

  return (
    <AppShell title="Users" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users & Team" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Team & Access Control"
          description="Manage operational accounts, field driver profiles, warehouse staff, and system administrators."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void fetchUsers()} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add User
              </Button>
            </div>
          }
        />

        {/* KPI Summary */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Total Users"
            value={users.length}
            icon={Users}
            description="Registered team accounts"
          />
          <KpiCard
            title="Active Status"
            value={activeCount}
            icon={UserCheck}
            description="Authorized to sign in"
          />
          <KpiCard
            title="Administrators"
            value={adminCount}
            icon={ShieldAlert}
            description="Full configuration access"
          />
          <KpiCard
            title="Field Drivers"
            value={driverCount}
            icon={Truck}
            description="Assigned delivery runs"
          />
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 text-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, or phone…"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter by Role:</span>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Roles</SelectItem>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role} className="text-xs">
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Users Table */}
        <Card className="border border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-foreground">User</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Role</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Phone</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Created</TableHead>
                  <TableHead className="w-12 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !users.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-xs text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading user directory…</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-xs text-muted-foreground">
                      No users match your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className="border-border hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-xs text-foreground">{user.name}</p>
                            <p className="text-[11px] text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {ROLE_LABELS[user.role] || user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusTone[user.status] || "bg-muted text-muted-foreground"}`}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{user.phone || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onClick={() => openEditDialog(user)} className="text-xs">
                              <Edit2 className="mr-2 h-3.5 w-3.5" />
                              Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive text-xs" onClick={() => void handleDelete(user)}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete Account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* User Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl border-border">
            <DialogHeader>
              <DialogTitle className="text-base">{selectedUser ? "Edit User Account" : "Add Team Member"}</DialogTitle>
              <DialogDescription className="text-xs">
                Create or modify staff accounts for administrative, warehouse, accounting, sales, and driver roles.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Work Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role Assignment</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_ROLES.map((role) => (
                        <SelectItem key={role} value={role} className="text-xs">
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Account Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active" className="text-xs">Active</SelectItem>
                      <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone Number</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="text-xs" placeholder="+61 400 000 000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{selectedUser ? "Reset Password" : "Password"}</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!selectedUser}
                    placeholder={selectedUser ? "Leave blank to keep current" : "Create password"}
                    className="text-xs"
                  />
                </div>
              </div>

              {formData.role === "driver" && (
                <div className="grid gap-3 md:grid-cols-2 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Driver License Number</Label>
                    <Input
                      value={formData.licenseNumber}
                      onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                      className="text-xs"
                      placeholder="e.g. DL-987654321"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Assigned Delivery Vehicle ID</Label>
                    <Input
                      value={formData.vehicleId}
                      onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                      className="text-xs"
                      placeholder="e.g. VAN-04 (Toyota HiAce)"
                    />
                  </div>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {selectedUser ? "Save Changes" : "Create Account"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}

