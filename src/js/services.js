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
// Estado local da pagina
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
        .select("id, title, description, category, city, country, is_active, owner_id, created_at, service_ratings(rating)", { count: "exact" })
        .eq("is_active", isActiveFilter);

    if (orders.sortBy === "Newest") q = q.order("created_at", { ascending: false });
    else if (orders.sortBy === "Oldest") q = q.order("created_at", { ascending: true });
    else if (orders.sortBy === "AZ") q = q.order("title", { ascending: true });

    if (filters.onlyInactive) q = q.eq("owner_id", userIdState);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.filterDescription) {
        q = q.or(`title.ilike.%${filters.filterDescription}%,description.ilike.%${filters.filterDescription}%`);
    }

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

// Calcula media e total a partir do array de ratings vindo do Supabase.
function calcRatingSummary(ratings = []) {
    if (!ratings.length) return { average: null, count: 0 };
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const average = sum / ratings.length;
    return {
        average,                             // numero puro ex: 3.7  (usado no calculo das estrelas)
        averageDisplay: average.toFixed(1),  // string para exibir  ex: "3.7"
        count: ratings.length,
    };
}

// Gera o HTML das 5 estrelas com suporte a fracao (ex: 3.7).
//
// Tecnica: cada estrela e um caractere Unicode colorido com um gradiente
// linear que vai de amarelo para cinza no ponto exato da fracao.
// background-clip:text aplica o gradiente somente no texto da estrela.
//
// Exemplo com average = 3.7:
//   estrela 1 -> fill = min(1, max(0, 3.7 - 0)) = 1.0 -> 100% amarela
//   estrela 2 -> fill = min(1, max(0, 3.7 - 1)) = 1.0 -> 100% amarela
//   estrela 3 -> fill = min(1, max(0, 3.7 - 2)) = 1.0 -> 100% amarela
//   estrela 4 -> fill = min(1, max(0, 3.7 - 3)) = 0.7 ->  70% amarela
//   estrela 5 -> fill = min(1, max(0, 3.7 - 4)) = 0.0 ->   0% amarela (cinza)
//
// Parametros:
//   average -> numero com a media (ex: 3.7). null = sem avaliacoes (todas cinzas).
//   size    -> tamanho da fonte (ex: "1rem", "0.9rem", "2rem")
function buildStarsHtml(average, size = "1rem") {
    const avg = average ?? 0;

    return [1, 2, 3, 4, 5]
        .map((n) => {
            const fill = Math.min(1, Math.max(0, avg - (n - 1))) * 100;

            return `<span style="
                font-size: ${size};
                background: linear-gradient(to right, #f5a623 ${fill}%, #ccc ${fill}%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                line-height: 1;
            ">&#9733;</span>`;
        })
        .join("");
}

// Gera o bloco completo de rating para cada card da listagem.
// Retorna HTML pronto — NAO use escapeHtml ao inserir no template.
function buildRatingHtml(ratings = []) {
    const { average, averageDisplay, count } = calcRatingSummary(ratings);

    if (count === 0) {
        return `<span class="muted" style="font-size:0.8rem;">Sem avaliacoes</span>`;
    }

    const stars = buildStarsHtml(average, "0.9rem");

    return `
        <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.8rem;">
            ${stars}
            <span class="muted">${averageDisplay} (${count})</span>
        </span>
    `;
}

function updateStarColors(activeRating) {
    const stars = document.querySelectorAll(".star");
    stars.forEach((star) => {
        const val = Number(star.dataset.value);
        star.style.color = val <= activeRating ? "#f5a623" : "#ccc";
    });
}

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

            // buildRatingHtml retorna HTML pronto.
            // NAO passe por escapeHtml — isso converteria as tags em texto visivel.
            const ratingHtml = buildRatingHtml(service.service_ratings ?? []);

            return `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; gap:12px;">
                        <div>
                            <h3 style="margin:0 0 4px 0;">
                                <a href="/serviceDetails.html?id=${service.id}">
                                    ${escapeHtml(service.title)}
                                </a>
                            </h3>

                            <div style="margin-bottom:6px;">${ratingHtml}</div>

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

    paginationSel.addEventListener("change", () => {
        perPageState = paginationSel.value;
        currentPageState = 1;
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
        perPageState = 2;
        currentPageState = 1;
        reload();
    });

    filterBtn.addEventListener("click", () => {
        currentPageState = 1;
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