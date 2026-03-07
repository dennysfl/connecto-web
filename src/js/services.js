import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const msg = document.querySelector("#msg");
const listEl = document.querySelector("#servicesList");
const logoutLink = document.querySelector("#logoutLink");

const categorySel = document.querySelector("#categoryFilter");
const clearBtn = document.querySelector("#clearFiltersBtn");
const onlyFavsChk = document.querySelector("#onlyFavs");
const onlyMyService = document.querySelector("#myServices");

const savedCountEl = document.querySelector("#savedCount");
const totalServicesEl = document.querySelector("#totalServices");
const myServicesEl = document.querySelector("#totalMyServices");

function setMsg(text = "") {
    msg.textContent = text;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function updateCounters(viewServices, favoriteSet, myServiceSet) {
    totalServicesEl.textContent = viewServices.length;

    let savedInView = 0;
    let myServicesInView = 0;

    for (const s of viewServices) {
        if (favoriteSet.has(s.id)) savedInView++;
        if (myServiceSet.has(s.id)) myServicesInView++;
    }

    savedCountEl.textContent = savedInView;
    myServicesEl.textContent = myServicesInView;
}

function renderServices(viewServices, favoriteSet, myServiceSet) {
    updateCounters(viewServices, favoriteSet, myServiceSet);

    if (!viewServices.length) {
        listEl.innerHTML = `<p class="muted">No services found.</p>`;
        return;
    }

    listEl.innerHTML = viewServices
        .map((s) => {
            const isFav = favoriteSet.has(s.id);
            const isMine = myServiceSet.has(s.id);
            const btnLabel = isFav ? "Unsave" : "Save";

            return `
        <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; gap:12px;">
            <div>
            <h3 style="margin:0 0 6px 0;">
                <a href="/serviceDetails.html?id=${s.id}">${escapeHtml(s.title)}</a>
            </h3>
            <div class="muted">
                ${escapeHtml(s.category)} · ${escapeHtml(s.city ?? "")} ${escapeHtml(s.country ?? "")}
                ${isMine ? "· My service" : ""}
            </div>
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

async function fetchServices(filters = {}) {
    let q = supabase
        .from("services")
        .select("id,title,description,category,city,country,is_active,owner_id,created_at")
        .order("created_at", { ascending: false });

    if (filters.category) q = q.eq("category", filters.category);

    const { data, error } = await q;
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

async function fetchMyServices(userId) {
    const { data, error } = await supabase
        .from("services")
        .select("id")
        .eq("owner_id", userId);

    if (error) throw error;
    return new Set((data ?? []).map((r) => r.id));
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

async function fetchCategories() {
    const { data, error } = await supabase.from("services").select("category");
    if (error) throw error;

    const unique = [...new Set((data ?? []).map(r => r.category).filter(Boolean))];
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
}

function fillCategoryDropdown(categories) {
    const options = categories
        .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
        .join("");

    categorySel.insertAdjacentHTML("beforeend", options);
}

// Estado local (evita gambiarras)
let servicesState = [];
let favoriteSetState = new Set();
let myServiceSetState = new Set();
let userIdState = null;

function getViewServices() {
    let view = servicesState;

    // only favorites = filtra local usando o Set
    if (onlyMyService.checked) {
        view = view.filter((s) => myServiceSetState.has(s.id));
    }

    if (onlyFavsChk.checked) {
        view = view.filter((s) => favoriteSetState.has(s.id));
    }

    return view;
}

async function reload() {
    setMsg("Loading...");

    const filters = {
        category: categorySel.value || "",
    };

    // Recarrega serviços e favoritos sempre que algo muda
    // (mantém contadores corretos e evita “estado velho”)
    const [services, favSet, myServSet] = await Promise.all([
        fetchServices(filters),
        fetchFavorites(userIdState),
        fetchMyServices(userIdState),
    ]);

    servicesState = services;
    favoriteSetState = favSet;
    myServiceSetState = myServSet;

    setMsg("");
    renderServices(getViewServices(), favoriteSetState, myServiceSetState);
}

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;

    // Logout
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

    // Dropdown categories
    const categories = await fetchCategories();
    fillCategoryDropdown(categories);

    // LISTENERS: UMA VEZ SÓ (corrige o seu item 2)
    categorySel.addEventListener("change", reload);

    clearBtn.addEventListener("click", () => {
        categorySel.value = "";
        onlyFavsChk.checked = false;
        onlyMyService.checked = false;
        reload();
    });

    onlyFavsChk.addEventListener("change", () => {
        // Não precisa refazer query; mas como a gente refaz no reload,
        // fica consistente (e mantém contadores sempre corretos).
        reload();
    });

    onlyMyService.addEventListener("change", () => {
        reload();
    });

    // Clique Save/Unsave (event delegation)
    listEl.addEventListener("click", async (e) => {
        const btn = e.target.closest(".favBtn");
        if (!btn) return;

        const serviceId = btn.dataset.serviceId;
        const isFav = btn.dataset.isFav === "true";
        const isMyService = btn.dataset.isMyService === "false";

        btn.disabled = true;
        setMsg("");

        try {
            if (isFav) {
                await removeFavorite(userIdState, serviceId);
                favoriteSetState.delete(serviceId);
            } else {
                await addFavorite(userIdState, serviceId);
                favoriteSetState.add(serviceId);
            }

            // Re-render com o estado atualizado (contadores corretos)
            renderServices(getViewServices(), favoriteSetState);
        } catch (err) {
            console.error(err);
            setMsg(err?.message ?? "Action failed");
        } finally {
            btn.disabled = false;
        }
    });

    // Primeira carga
    await reload();
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});