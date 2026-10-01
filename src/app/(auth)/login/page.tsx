import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";
import { DemoLoginButtons } from "./demo-login-buttons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use your university account to book labs and equipment.
        </p>
      </div>

      <LoginForm next={params.next} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            or use a demo account
          </span>
        </div>
      </div>

      <DemoLoginButtons />

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
