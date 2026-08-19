import { AuthScreen } from "@/components/auth-screen";

type LoginPageProps = {
  searchParams: Promise<{ mode?: string; next?: string; error?: string; account?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <AuthScreen
      initialMode={params.mode === "signup" ? "signup" : "signin"}
      initialRole={params.account === "business" ? "business" : "customer"}
      next={params.next}
      initialError={params.error === "callback" ? "Doğrulama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeniden giriş yap." : undefined}
    />
  );
}
