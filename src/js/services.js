import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const msg = document.querySelector("#msg");
const listEl = document.querySelector("#servicesList");
const logoutLink = document.querySelector("#logoutLink");

function setMsg(text = "") {
    msg.textContent = text;
}

function renderServices(services, favoriteSet) {
    if (!services.length) {
        listEl.innerHTML = `<p class="muted">No services found.</p>`;
        return;
    }

    listEl.innerHTML = services
        .map((s) => {
            const isFav = favoriteSet.has(s.id);
            const btnLabel = isFav ? "Unsave" : "Save";
            return `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; gap:12px;">
            <div>
              <h3 style="margin:0 0 6px 0;">${escapeHtml(s.title)}</h3>
              <div class="muted">${escapeHtml(s.category)} · ${escapeHtml(s.city ?? "")} ${escapeHtml(s.country ?? "")}</div>
              <p style="margin:10px 0 0 0;">${escapeHtml(s.description ?? "")}</p>
            </div>

            <div style="min-width:110px; text-align:right;">
              <button class="favBtn" data-service-id="${s.id}" data-is-fav="${isFav}">
                ${btnLabel}
              </button>
            </div>
          </div>
        </div>
      `;
        })
        .join("");
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function fetchServices() {
    // services_select_active_or_own policy filtra corretamente
    const { data, error } = await supabase
        .from("services")
        .select("id,title,description,category,city,country,is_active,owner_id,created_at")
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

async function fetchFavorites(userId) {
    const { data, error } = await supabase
        .from("favorites")
        .select("service_id")
        .eq("user_id", userId);

    if (error) throw error;
    return new Set((data ?? []).map((r) => r.service_id));
}

async function addFavorite(userId, serviceId) {
    const { error } = await supabase
        .from("favorites")
        .insert([{ user_id: userId, service_id: serviceId }]);

    if (error) throw error;
}

async function removeFavorite(userId, serviceId) {
    const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("service_id", serviceId);

    if (error) throw error;
}

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    const userId = session.user.id;

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            await signOut();
            window.location.replace("/login.html");
        } catch (err) {
            console.error(err);
            setMsg(err?.message ?? "Logout failed");
        }
    });

    setMsg("Loading...");
    const [services, favoriteSet] = await Promise.all([
        fetchServices(),
        fetchFavorites(userId),
    ]);

    setMsg("");
    renderServices(services, favoriteSet);

    // Delegation: um listener só para todos os botões
    listEl.addEventListener("click", async (e) => {
        const btn = e.target.closest(".favBtn");
        if (!btn) return;

        const serviceId = btn.dataset.serviceId;
        const isFav = btn.dataset.isFav === "true";

        // UI otimista simples
        btn.disabled = true;
        setMsg("");

        try {
            if (isFav) {
                await removeFavorite(userId, serviceId);
                favoriteSet.delete(serviceId);
            } else {
                await addFavorite(userId, serviceId);
                favoriteSet.add(serviceId);
            }

            // re-render rápido (mantém consistente)
            renderServices(services, favoriteSet);
        } catch (err) {
            console.error(err);
            setMsg(err?.message ?? "Action failed");
            btn.disabled = false; // fallback
        }
    });
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});
