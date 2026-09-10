import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient(clientIp?: string | null) {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: clientIp ? { headers: { "Sb-Forwarded-For": clientIp } } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Defaults come first; ...options comes last so Supabase's own
              // per-cookie settings (e.g. a non-httpOnly PKCE code-verifier
              // cookie that the browser must read via document.cookie) always
              // win over these fallbacks instead of being silently overridden.
              cookieStore.set({
                name,
                value,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                domain: process.env.NODE_ENV === 'production' ? '.pen-pals.net' : undefined,
                ...options,
              });
            });
          } catch {
            // Server Components cannot write cookies
          }
        },
      },
    }
  );
}
