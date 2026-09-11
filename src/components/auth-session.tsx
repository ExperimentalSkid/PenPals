"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";

export function AuthSession() {
  useEffect(() => {
    const restoreSession = async () => {
      const supabase = createClient();
      
      // Trigger Supabase's client-side session restoration without logging
      // account identifiers or session state to the browser console.
      await supabase.auth.getSession();
    };
    
    restoreSession();
  }, []);

  return null;
}
