import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const logoutLink = document.querySelector("#logoutLink");

async function loadProfile(userId) {
    const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

    if (error) throw error;
    return data;
}

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    try {
        const profile = await loadProfile(session.user.id);

        document.querySelector("#userName").textContent =
            profile.full_name ?? session.user.email;
    } catch (err) {
        console.error("Profile load error:", err);
        document.querySelector("#userName").textContent = session.user.email;
    }

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();

        try {
            await signOut();
            window.location.replace("/login.html");
        } catch (err) {
            console.error("Logout error:", err);
        }
    });
}

init();