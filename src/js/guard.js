import { supabase } from "./supabaseClient.js";

export async function requireAuthOrRedirect() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = "/login.html";
        return null;
    }
    return session;
}