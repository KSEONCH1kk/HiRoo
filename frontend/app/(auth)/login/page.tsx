"use client";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { connectSocket } from "@/lib/socket";
import { QrLoginPanel } from "@/components/auth/QrLoginPanel";

const schema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

type Form = z.infer<typeof schema>;

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-0)" }} />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    try {
      const res = await authApi.login(data);
      setAuth(res.user, res.access_token);
      connectSocket();
      const pendingInvite = typeof window !== "undefined" ? sessionStorage.getItem("pendingInvite") : null;
      if (pendingInvite) {
        sessionStorage.removeItem("pendingInvite");
        router.push(`/invite/${pendingInvite}`);
      } else {
        const next = searchParams.get("next");
        router.push(next && next.startsWith("/") ? next : "/");
      }
    } catch (e: any) {
      setError("root", { message: e.response?.data?.detail ?? "Неверные данные" });
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-0)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 400, padding: 36, borderRadius: 16,
        background: "var(--bg-2)", border: "1px solid var(--line-strong)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "Instrument Serif", fontSize: 40, color: "var(--accent)", letterSpacing: -2 }}>
            H<span style={{ fontStyle: "italic", marginLeft: -3, opacity: 0.85 }}>r</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-0)", marginTop: 8, letterSpacing: -0.5 }}>
            С возвращением!
          </div>
          <div style={{ fontSize: 13.5, color: "var(--text-2)", marginTop: 4 }}>
            Рады снова тебя видеть
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input {...register("email")} type="email" autoComplete="email"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: "var(--bg-0)", border: "1px solid var(--line-strong)",
                color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit",
              }}
            />
            {errors.email && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{errors.email.message}</p>}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>
              Пароль
            </label>
            <input {...register("password")} type="password" autoComplete="current-password"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: "var(--bg-0)", border: "1px solid var(--line-strong)",
                color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit",
              }}
            />
            {errors.password && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{errors.password.message}</p>}
          </div>

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
            {isSubmitting ? "Входим…" : "Войти"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 16, textAlign: "center" }}>
          Нет аккаунта?{" "}
          <Link href="/register" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
            Зарегистрироваться
          </Link>
        </p>

        <div style={{ height: 1, background: "var(--line)", margin: "18px 0 0" }} />
        <QrLoginPanel />
      </div>
    </div>
  );
}
