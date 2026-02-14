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

(async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    const profile = await loadProfile(session.user.id);

    document.querySelector("#userEmail").textContent = session.user.email;
    document.querySelector("#fullName").textContent = profile.full_name ?? "(sem nome)";

    document.querySelector("#logoutBtn").addEventListener("click", async () => {
        await signOut();
        window.location.href = "/login.html";
    });
})();
