import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const { data, error } = await supabase.auth.getSession();

if (error) console.error(error);

if (!data.session) {
    // não está logado
    window.location.href = "/login.html";
} else {
    // está logado; pode carregar dados do usuário
    console.log("User:", data.session.user);
}

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
            await supabase.auth.signOut();

            // Garantia extra: força reload completo
            window.location.replace("/Login.html");

        } catch (err) {
            console.error("Logout error:", err);
        }
    });
}

init();
