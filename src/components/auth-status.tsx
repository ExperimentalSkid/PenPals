"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export function AuthStatus() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email || null);
      setLoading(false);
    };

    checkAuth();

    // Listen for auth changes (if user logs in/out in another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setIsAuthenticated(!!session);
        setUserEmail(session?.user?.email || null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm font-semibold">
        <span className="px-4 py-2 text-[#102A43]">Loading...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-3 text-sm font-semibold">
        <span className="px-4 py-2 text-[#102A43]">👋 {userEmail}</span>
        <Link
          href="/app"
          className="rounded-full bg-[#073A73] px-5 py-2.5 text-white shadow-sm hover:bg-[#052D59]"
        >
          Dashboard
        </Link>
        <button
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push("/");
            router.refresh();
          }}
          className="rounded-full px-4 py-2 text-[#102A43] hover:bg-white"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm font-semibold">
      <Link href="/sign-in" className="rounded-full px-4 py-2 text-[#102A43] hover:bg-white">
        Sign in
      </Link>
      <Link
        href="/sign-up"
        className="rounded-full bg-[#073A73] px-5 py-2.5 text-white shadow-sm hover:bg-[#052D59]"
      >
        Join pen-pals.net
      </Link>
    </div>
  );
}
