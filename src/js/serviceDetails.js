import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const msg = document.querySelector("#msg");
const detailsEl = document.querySelector("#details");
const logoutLink = document.querySelector("#logoutLink");

function setMsg(t = "") { msg.textContent = t; }

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function fetchServiceById(id) {
    const { data, error } = await supabase
        .from("services")
        .select("id,title,description,category,city,country,created_at,owner_id,is_active")
        .eq("id", id)
        .single();

    if (error) throw error;
    return data;
}

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await signOut();
        window.location.replace("/login.html");
    });

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
        setMsg("Missing service id in URL.");
        return;
    }

    setMsg("Loading...");
    try {
        const s = await fetchServiceById(id);
        setMsg("");

        detailsEl.innerHTML = `
      <h2 style="margin-top:0;">${escapeHtml(s.title)}</h2>
      <div class="muted">${escapeHtml(s.category)} · ${escapeHtml(s.city ?? "")} ${escapeHtml(s.country ?? "")}</div>
      <p style="margin-top:12px;">${escapeHtml(s.description ?? "")}</p>
    `;
    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Failed to load service.");
    }
}

init();