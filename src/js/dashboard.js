import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

async function loadProfile(userId) {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, country, city")
        .eq("id", userId)
        .single();

    if (error) throw error;
    return data;
}

async function init() {
    // Verifica sessão
    const session = await requireAuthOrRedirect();
    if (!session) return;

    // Mostra email
    document.querySelector("#userEmail").textContent = session.user.email;

    // Logout
    const logoutLink = document.querySelector("#logoutLink");

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();

        try {
            await signOut();

            // Garantia extra: força reload completo
            window.location.replace("/Index.html");

        } catch (err) {
            console.error("Logout error:", err);
        }
    });
}

init();
