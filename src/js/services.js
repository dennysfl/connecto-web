import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const msg = document.querySelector("#msg");
const listEl = document.querySelector("#servicesList");
const logoutLink = document.querySelector("#logoutLink");

const categorySel = document.querySelector("#categoryFilter");
const sortSel = document.querySelector("#sortService");
const paginationSel = document.querySelector("#paginationService");
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

let currentPageState = 1;
let perPageState = 2;

// --------------------
// Fetch / Data access
// --------------------
async function fetchServices(filters = {}, orders = {}, pages = {}) {
    const isActiveFilter = filters.onlyInactive ? false : true;

    let q = supabase
        .from("services")
        .select("id,title,description,category,city,country,is_active,owner_id,created_at", { count: "exact" })
        .eq("is_active", isActiveFilter);

    if (orders.sortBy === "Newest") q = q.order("created_at", { ascending: false });
    else if (orders.sortBy === "Oldest") q = q.order("created_at", { ascending: true });
    else if (orders.sortBy === "AZ") q = q.order("title", { ascending: true });

    if (filters.onlyInactive) q = q.eq("owner_id", userIdState);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.filterDescription) {
        q = q.or(`title.ilike.%${filters.filterDescription}%,description.ilike.%${filters.filterDescription}%`);
    }

    // paginacao com .range() - so aplica se nao for "All"
    if (pages.perPage !== "All") {
        const perPage = Number(pages.perPage);
        const from = (pages.currentPage - 1) * perPage;
        const to = from + perPage - 1;
        q = q.range(from, to);
    }

    const { data, error, count } = await q;
    if (error) throw error;

    return { data: data ?? [], total: count ?? 0 };
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

// BUG 5 CORRIGIDO: renderPagination so monta o HTML.
// O event listener fica no init(), fora daqui, para nao se acumular a cada reload.
function renderPagination(total, perPage, currentPage) {
    const paginationEl = document.querySelector("#pagination");

    if (perPage === "All" || total <= perPage) {
        paginationEl.innerHTML = "";
        return;
    }

    const totalPages = Math.ceil(total / perPage);

    paginationEl.innerHTML = `
        <button class="pageBtn" data-page="1"                  ${currentPage === 1 ? "disabled" : ""}>First</button>
        <button class="pageBtn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
        <span>Page ${currentPage} of ${totalPages}</span>
        <button class="pageBtn" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
        <button class="pageBtn" data-page="${totalPages}"      ${currentPage === totalPages ? "disabled" : ""}>Last</button>
    `;
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

async function activateService(serviceId) {
    const { error } = await supabase
        .from("services")
        .update({ is_active: true })
        .eq("id", serviceId)
        .eq("owner_id", userIdState);

    if (error) throw error;
}

// --------------------
// Reload / orchestration
// --------------------
async function reload() {
    setMsg("Loading...");

    const filters = {
        category: categorySel.value || "",
        onlyInactive: onlyMyInactive.checked,
        filterDescription: filterText.value.trim() || "",
    };

    const orderBy = {
        sortBy: sortSel.value || "",
    };

    // BUG 1+2+3 CORRIGIDOS:
    // - pages passa perPageState e currentPageState corretamente
    // - fetchServices retorna { data, total } -- desestruturamos aqui
    // - total fica disponivel para o renderPagination logo abaixo
    const pages = {
        perPage: perPageState,
        currentPage: currentPageState,
    };

    const [{ data: services, total }, favoriteSet, myServiceSet, myInactiveSet] = await Promise.all([
        fetchServices(filters, orderBy, pages),
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
    renderPagination(total, perPageState, currentPageState);
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

    // BUG 4 CORRIGIDO: era perPageSel (inexistente) -> paginationSel
    //                  e faltava o ) para fechar o addEventListener
    paginationSel.addEventListener("change", () => {
        perPageState = paginationSel.value;  // "2", "5", "10" ou "All"
        currentPageState = 1;                // volta pro inicio ao mudar itens por pagina
        reload();
    });

    clearBtn.addEventListener("click", () => {
        categorySel.value = "";
        onlyFavsChk.checked = false;
        onlyMyServicesChk.checked = false;
        onlyMyInactive.checked = false;
        filterText.value = "";
        sortSel.value = "Newest";
        paginationSel.value = "2";
        perPageState = 2;       // reseta o estado tambem, nao so o dropdown
        currentPageState = 1;
        reload();
    });

    filterBtn.addEventListener("click", () => {
        currentPageState = 1;   // ao aplicar filtro, volta pra pagina 1
        reload();
    });

    onlyFavsChk.addEventListener("change", () => {
        currentPageState = 1;
        reload();
    });

    onlyMyServicesChk.addEventListener("change", () => {
        currentPageState = 1;
        reload();
    });

    onlyMyInactive.addEventListener("change", () => {
        if (onlyMyInactive.checked) {
            onlyFavsChk.checked = false;
            onlyMyServicesChk.checked = true;
        }
        currentPageState = 1;
        reload();
    });

    // BUG 5 CORRIGIDO: listener da paginacao fica aqui no init(),
    // registrado uma unica vez -- nunca se acumula.
    const paginationEl = document.querySelector("#pagination");
    paginationEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".pageBtn");
        if (!btn) return;

        currentPageState = Number(btn.dataset.page);
        reload();
    });

    listEl.addEventListener("click", async (e) => {
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

        const activateBtn = e.target.closest(".activateBtn");
        if (activateBtn) {
            const serviceId = activateBtn.dataset.serviceId;

            const confirmed = window.confirm("Do you want to activate this service again?");
            if (!confirmed) return;

            activateBtn.disabled = true;
            setMsg("");

            try {
                await activateService(serviceId);
                await reload();
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