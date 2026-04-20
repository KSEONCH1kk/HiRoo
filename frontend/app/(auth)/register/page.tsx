"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { connectSocket } from "@/lib/socket";

const schema = z.object({
  username: z.string().min(2, "Минимум 2 символа").max(32, "Максимум 32 символа")
    .regex(/^[a-zA-Z0-9_.\-]+$/, "Только латиница, цифры, _ . -"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов")
    .regex(/[A-Za-z]/, "Нужна хотя бы одна буква")
    .regex(/[0-9]/, "Нужна хотя бы одна цифра"),
});

type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    try {
      const res = await authApi.register(data);
      setAuth(res.user, res.access_token);
      connectSocket();
      const pendingInvite = typeof window !== "undefined" ? sessionStorage.getItem("pendingInvite") : null;
      if (pendingInvite) {
        sessionStorage.removeItem("pendingInvite");
        router.push(`/invite/${pendingInvite}`);
      } else {
        router.push("/");
      }
    } catch (e: any) {
      const msg = e.response?.data?.detail ?? "Ошибка регистрации";
      setError("root", { message: msg });
    }
  };

  const field = (name: keyof Form, label: string, type = "text", autoComplete?: string) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <input {...register(name)} type={type} autoComplete={autoComplete}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 8,
          background: "var(--bg-0)", border: "1px solid var(--line-strong)",
          color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit",
        }}
      />
      {errors[name] && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{errors[name]!.message}</p>}
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-0)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 420, padding: 36, borderRadius: 16,
        background: "var(--bg-2)", border: "1px solid var(--line-strong)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "Instrument Serif", fontSize: 40, color: "var(--accent)", letterSpacing: -2 }}>
            H<span style={{ fontStyle: "italic", marginLeft: -3, opacity: 0.85 }}>r</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-0)", marginTop: 8, letterSpacing: -0.5 }}>
            Создать аккаунт
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {field("username", "Имя пользователя", "text", "username")}
          {field("email", "Email", "email", "email")}
          {field("password", "Пароль", "password", "new-password")}

          {errors.root && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,90,106,0.1)", border: "1px solid rgba(255,90,106,0.3)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
              {errors.root.message}
            </div>
          )}

          <button type="submit" disabled={isSubmitting} style={{
            width: "100%", height: 42, borderRadius: 8,
            background: "var(--accent)", color: "#fff",
            border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
            opacity: isSubmitting ? 0.7 : 1,
          }}>
            {isSubmitting ? "Регистрируемся…" : "Зарегистрироваться"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 16, textAlign: "center" }}>
          Уже есть аккаунт?{" "}
          <Link href="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
