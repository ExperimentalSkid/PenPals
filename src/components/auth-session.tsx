"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";

export function AuthSession() {
  useEffect(() => {
    const restoreSession = async () => {
      const supabase = createClient();
      
      // This ensures the session is restored from localStorage on page load
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        console.log("✅ Session restored for:", session.user.email);
        // Optionally set the auth state in your app
      } else {
        console.log("⏳ No session found");
      }
    };
    
    restoreSession();
  }, []);

  return null;
}
