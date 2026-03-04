import { useEffect, useState } from "react";
import {
  Loader2, UserPlus, Pencil, Trash2, Eye, EyeOff,
  Search, Shield, User as UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface UserRecord {
  user_id: string;
  full_name: string;
  email: string;
  address?: string;
  birth_date?: string;
  must_change_password: boolean;
  role: "admin" | "user";
}

const emptyForm = {
  full_name: "",
  email: "",
  address: "",
  birth_date: "",
  password: "",
  role: "user" as "admin" | "user",
};

export default function Usuarios() {
  const { company } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const fetchUsers = async () => {
    if (!company) return;
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, address, birth_date, must_change_password")
      .eq("company_id", company.id);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("company_id", company.id);

    if (profiles) {
      const roleMap = Object.fromEntries((roles ?? []).map((r) => [r.user_id, r.role]));
      setUsers(
        profiles.map((p) => ({
          ...p,
          role: (roleMap[p.user_id] ?? "user") as "admin" | "user",
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [company]);

  const openCreate = () => {
    setEditUser(null);
    setForm(emptyForm);
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (user: UserRecord) => {
    setEditUser(user);
    setForm({
      full_name: user.full_name,
      email: user.email,
      address: user.address ?? "",
      birth_date: user.birth_date ?? "",
      password: "",
      role: user.role,
    });
    setError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);

    try {
      if (editUser) {
        // Update profile
        const { error: pErr } = await supabase
          .from("profiles")
          .update({
            full_name: form.full_name,
            email: form.email,
            address: form.address || null,
            birth_date: form.birth_date || null,
          })
          .eq("user_id", editUser.user_id);
        if (pErr) throw new Error(pErr.message);

        // Update role
        const { error: rErr } = await supabase
          .from("user_roles")
          .update({ role: form.role })
          .eq("user_id", editUser.user_id)
          .eq("company_id", company!.id);
        if (rErr) throw new Error(rErr.message);

        // Update password via edge function if provided
        if (form.password) {
          const { error: fnErr } = await supabase.functions.invoke("update-user-password", {
            body: { user_id: editUser.user_id, password: form.password },
          });
          if (fnErr) throw new Error(fnErr.message);
        }

        await fetchUsers();
        setDialogOpen(false);
      } else {
        // Create new user
        if (!form.password || form.password.length < 6) {
          setError("A senha deve ter pelo menos 6 caracteres.");
          setSaving(false);
          return;
        }
        const { data, error: fnErr } = await supabase.functions.invoke("register", {
          body: {
            cnpj: company!.cnpj,
            companyName: company!.name,
            email: form.email,
            password: form.password,
            fullName: form.full_name,
          },
        });
        if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message);

        // Update role if admin
        if (form.role === "admin" && data?.userId) {
          await supabase
            .from("user_roles")
            .update({ role: "admin" })
            .eq("user_id", data.userId)
            .eq("company_id", company!.id);
        }

        // Update address / birth_date
        if (form.address || form.birth_date) {
          await supabase
            .from("profiles")
            .update({
              address: form.address || null,
              birth_date: form.birth_date || null,
              must_change_password: true,
            })
            .eq("user_id", data.userId);
        } else {
          await supabase
            .from("profiles")
            .update({ must_change_password: true })
            .eq("user_id", data.userId);
        }

        await fetchUsers();
        setDialogOpen(false);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    await supabase.functions.invoke("delete-user", { body: { user_id: deleteUser.user_id } });
    await fetchUsers();
    setDeleting(false);
    setDeleteUser(null);
  };

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
            <p className="text-muted-foreground mt-1">Gerencie os usuários da sua empresa</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <UserPlus className="h-4 w-4" /> Novo usuário
          </Button>
        </div>

        <Card className="shadow-card border-0">
          <CardHeader className="pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <UserIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p>Nenhum usuário encontrado</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((user) => (
                  <div key={user.user_id} className="flex items-center gap-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{user.full_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.role === "admin" ? (
                        <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/15">
                          <Shield className="h-3 w-3" /> Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <UserIcon className="h-3 w-3" /> Usuário
                        </Badge>
                      )}
                      {user.must_change_password && (
                        <Badge variant="outline" className="text-xs text-warning border-warning/30">
                          Trocar senha
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteUser(user)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editUser ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editUser
                ? "Altere os dados do usuário abaixo."
                : "Preencha os dados para criar um novo usuário. A senha deverá ser trocada no próximo acesso."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="João da Silva"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="joao@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Rua Exemplo, 123"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de nascimento</Label>
              <Input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Perfil (Role)</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as "admin" | "user" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{editUser ? "Nova senha (deixe em branco para não alterar)" : "Senha *"}</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editUser ? "••••••••" : "Mínimo 6 caracteres"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editUser ? "Salvar" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteUser?.full_name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
