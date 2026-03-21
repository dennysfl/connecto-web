import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const msg = document.querySelector("#msg");
const listEl = document.querySelector("#servicesList");
const logoutLink = document.querySelector("#logoutLink");

const categorySel = document.querySelector("#categoryFilter");
const sortSel = document.querySelector("#sortService");
const filterText = document.querySelector("#searchText");
const clearBtn = document.querySelector("#clearFiltersBtn");
const filterBtn = document.querySelector("#runFiltersBtn");
const onlyFavsChk = document.querySelector("#onlyFavs");
const onlyMyServicesChk = document.querySelector("#myServices");
const onlyMyInactive = document.querySelector("#myInactive");

const savedCountEl = document.querySelector("#savedCount");
const totalServicesEl = document.querySelector("#totalServices");
const myServicesEl = document.querySelector("#totalMyServices");

// --------------------
// Helpers
// --------------------
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

// --------------------
// Estado local da página
// --------------------
let servicesState = [];
let favoriteSetState = new Set();
let myServiceSetState = new Set();
let myInactiveSetState = new Set();
let userIdState = null;

// --------------------
// Fetch / Data access
// --------------------
async function fetchServices(filters = {}, orders = {}) {
    // ✅ CORREÇÃO: se o usuário quer ver inativos, buscamos inativos.
    // Caso contrário, buscamos só os ativos (comportamento original).
    const isActiveFilter = filters.onlyInactive ? false : true;

    let q = supabase
        .from("services")
        .select("id,title,description,category,city,country,is_active,owner_id,created_at")
        .eq("is_active", isActiveFilter)

    if (orders.sortBy == "Newest") {
        q = q.order("created_at", { ascending: false });
    }
    else if (orders.sortBy == "Oldest") {
        q = q.order("created_at", { ascending: true });
    }
    else if (orders.sortBy == "AZ") {
        q = q.order("title", { ascending: true });
    }

    // quando buscamos inativos, já filtramos pelo dono aqui na query,
    // assim o banco faz o trabalho pesado em vez de trazer tudo pra memória.
    if (filters.onlyInactive) {
        q = q.eq("owner_id", userIdState);
    }

    if (filters.category) {
        q = q.eq("category", filters.category);
    }

    if (filters.filterDescription) {
        q = q.or(`title.ilike.%${filters.filterDescription}%, description.ilike.%${filters.filterDescription}%`)
    }

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
    return new Set((data ?? []).map((row) => row.service_id));
}

async function fetchMyServices(userId) {
    const { data, error } = await supabase
        .from("services")
        .select("id")
        .eq("owner_id", userId);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
}

async function fetchMyInactive(userId) {
    const { data, error } = await supabase
        .from("services")
        .select("id")
        .eq("owner_id", userId)
        .eq("is_active", false);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
}

async function fetchCategories() {
    const { data, error } = await supabase
        .from("services")
        .select("category")
        .eq("is_active", true);

    if (error) throw error;

    const unique = [...new Set((data ?? []).map((row) => row.category).filter(Boolean))];
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
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

// --------------------
// UI
// --------------------
function fillCategoryDropdown(categories) {
    const options = categories
        .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        .join("");

    categorySel.insertAdjacentHTML("beforeend", options);
}

function getViewServices() {
    let view = [...servicesState];

    if (onlyMyInactive.checked) {
        view = view.filter((service) => myInactiveSetState.has(service.id));
    }

    if (onlyMyServicesChk.checked) {
        view = view.filter((service) => myServiceSetState.has(service.id));
    }

    if (onlyFavsChk.checked) {
        view = view.filter((service) => favoriteSetState.has(service.id));
    }

    return view;
}

function updateCounters(viewServices, favoriteSet, myServiceSet) {
    totalServicesEl.textContent = viewServices.length;

    let savedInView = 0;
    let myServicesInView = 0;

    for (const service of viewServices) {
        if (favoriteSet.has(service.id)) savedInView++;
        if (myServiceSet.has(service.id)) myServicesInView++;
    }

    savedCountEl.textContent = savedInView;
    myServicesEl.textContent = myServicesInView;
}

function renderServices(viewServices, favoriteSet, myServiceSet, myInactiveSet) {
    updateCounters(viewServices, favoriteSet, myServiceSet);

    if (!viewServices.length) {
        listEl.innerHTML = `<p class="muted">No services found.</p>`;
        return;
    }

    listEl.innerHTML = viewServices
        .map((service) => {
            const isFav = favoriteSet.has(service.id);
            const isMine = myServiceSet.has(service.id);
            const isInactive = myInactiveSet.has(service.id);
            const btnLabel = isFav ? "Unsave" : "Save";

            return `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; gap:12px;">
                        <div>
                            <h3 style="margin:0 0 6px 0;">
                                <a href="/serviceDetails.html?id=${service.id}">
                                    ${escapeHtml(service.title)}
                                </a>
                            </h3>

                            <div class="muted">
                                ${escapeHtml(service.category)}
                                · ${escapeHtml(service.city ?? "")}
                                ${escapeHtml(service.country ?? "")}
                                ${isMine ? "· My service" : ""}
                                ${isInactive ? "· <strong>Inactive</strong>" : ""}
                            </div>

                            <p style="margin:10px 0 0 0;">
                                ${escapeHtml(service.description ?? "")}
                            </p>
                        </div>

                        <div style="min-width:110px; text-align:right;">
                            ${!isInactive ? `
                                <button
                                    class="favBtn"
                                    data-service-id="${service.id}"
                                    data-is-fav="${isFav}"
                                >
                                    ${btnLabel}
                                </button>
                            ` : ""}

                            ${isInactive ? `
                                <button
                                    class="activateBtn"
                                    data-service-id="${service.id}"
                                >
                                    Activate
                                </button>
                            ` : ""}
                        </div>
                    </div>
                </div>
            `;
        })
        .join("");
}

// ✅ NOVO: reativa um serviço inativo
async function activateService(serviceId) {
    const { error } = await supabase
        .from("services")
        .update({ is_active: true })
        .eq("id", serviceId)
        .eq("owner_id", userIdState); // segurança: só o dono pode reativar

    if (error) throw error;
}

// --------------------
// Reload / orchestration
// --------------------
async function reload() {
    setMsg("Loading...");

    const filters = {
        category: categorySel.value || "",
        onlyInactive: onlyMyInactive.checked,               // passa o estado do checkbox pro fetch
        filterDescription: filterText.value.trim() || "",   // passa o search pro fetch
    };

    const orderBy = {
        sortBy: sortSel.value || "",
    }

    const [services, favoriteSet, myServiceSet, myInactiveSet] = await Promise.all([
        fetchServices(filters, orderBy),
        fetchFavorites(userIdState),
        fetchMyServices(userIdState),
        fetchMyInactive(userIdState),
    ]);

    servicesState = services;
    favoriteSetState = favoriteSet;
    myServiceSetState = myServiceSet;
    myInactiveSetState = myInactiveSet;

    setMsg("");
    renderServices(getViewServices(), favoriteSetState, myServiceSetState, myInactiveSetState);
}

// --------------------
// Init
// --------------------
async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;

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

    const categories = await fetchCategories();
    fillCategoryDropdown(categories);

    categorySel.addEventListener("change", reload);

    sortSel.addEventListener("change", reload);

    clearBtn.addEventListener("click", () => {
        categorySel.value = "";
        onlyFavsChk.checked = false;
        onlyMyServicesChk.checked = false;
        onlyMyInactive.checked = false;
        filterText.value = "";
        sortSel.value = "Newest";
        reload();
    });

    filterBtn.addEventListener("click", () => {
        reload();
    });

    onlyFavsChk.addEventListener("change", reload);
    onlyMyServicesChk.addEventListener("change", reload);

    // ✅ CORREÇÃO: ao marcar "My Inactive Services",
    // força os outros dois checkboxes para o estado correto antes de recarregar.
    onlyMyInactive.addEventListener("change", () => {
        if (onlyMyInactive.checked) {
            onlyFavsChk.checked = false;       // Favorites → false
            onlyMyServicesChk.checked = true;  // My Services → true
        }
        reload();
    });

    listEl.addEventListener("click", async (e) => {
        // --- favoritar / desfavoritar (lógica original) ---
        const favBtn = e.target.closest(".favBtn");
        if (favBtn) {
            const serviceId = favBtn.dataset.serviceId;
            const isFav = favBtn.dataset.isFav === "true";

            favBtn.disabled = true;
            setMsg("");

            try {
                if (isFav) {
                    await removeFavorite(userIdState, serviceId);
                    favoriteSetState.delete(serviceId);
                } else {
                    await addFavorite(userIdState, serviceId);
                    favoriteSetState.add(serviceId);
                }

                renderServices(getViewServices(), favoriteSetState, myServiceSetState, myInactiveSetState);
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Action failed");
            } finally {
                favBtn.disabled = false;
            }
        }

        // ✅ NOVO: reativar serviço inativo
        const activateBtn = e.target.closest(".activateBtn");
        if (activateBtn) {
            const serviceId = activateBtn.dataset.serviceId;

            const confirmed = window.confirm("Do you want to activate this service again?");
            if (!confirmed) return;

            activateBtn.disabled = true;
            setMsg("");

            try {
                await activateService(serviceId);
                await reload(); // recarrega a lista toda após reativar
                setMsg("Service activated successfully.");
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Failed to activate service.");
                activateBtn.disabled = false;
            }
        }
    });

    await reload();
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});