// ============================================================
// services.js  (services.html)
//
// Responsabilidade: orquestrar a listagem de serviços.
//
// O que mudou em relação ao original:
//   ✅ Nenhuma função de fetch/supabase aqui — tudo em services.api.js
//   ✅ escapeHTML vem de utils (sem duplicação)
//   ✅ userIdState é passado como argumento onde necessário
// ============================================================

import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";
import {
    fetchServices,
    fetchCategories,
    fetchSubCategories,
    fetchFavorites,
    fetchMyServices,
    fetchMyInactive,
    addFavorite,
    removeFavorite,
    activateService
} from "./services.api.js";
import { escapeHTML } from "../utils/string.utils.js";

// ─── Elementos da página ─────────────────────────────────────
const msg = document.querySelector("#msg");
const listEl = document.querySelector("#servicesList");
const logoutLink = document.querySelector("#logoutLink");
const categorySel = document.querySelector("#categoryFilter");
const subCategorySel = document.querySelector("#subcategoryFilter");
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

// ─── Estado local ─────────────────────────────────────────────
let servicesState = [];
let favoriteSetState = new Set();
let myServiceSetState = new Set();
let myInactiveSetState = new Set();
let userIdState = null;
let currentPageState = 1;
let perPageState = 2;

// ─── Helpers de UI ───────────────────────────────────────────
function setMsg(text = "") {
    msg.textContent = text;
}

function fillCategoryDropdown(categories) {
    categorySel.innerHTML = `<option value="">All</option>`;

    const options = categories
        .map((c) => `<option value="${c.id}">${escapeHTML(c.name)}</option>`)
        .join("");

    categorySel.insertAdjacentHTML("beforeend", options);
}

function fillSubCategoryDropdown(subcategories) {
    subCategorySel.innerHTML = `<option value="">All</option>`;

    const options = subcategories
        .map((c) => `<option value="${c.id}">${escapeHTML(c.name)}</option>`)
        .join("");

    subCategorySel.insertAdjacentHTML("beforeend", options);
}

function getViewServices() {
    let view = [...servicesState];

    if (onlyMyInactive.checked) view = view.filter((s) => myInactiveSetState.has(s.id));
    if (onlyMyServicesChk.checked) view = view.filter((s) => myServiceSetState.has(s.id));
    if (onlyFavsChk.checked) view = view.filter((s) => favoriteSetState.has(s.id));

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

// Calcula média e total a partir do array de ratings vindo do Supabase.
function calcRatingSummary(ratings = []) {
    if (!ratings.length) return { average: null, count: 0 };

    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const average = sum / ratings.length;

    return {
        average,
        averageDisplay: average.toFixed(1),
        count: ratings.length,
    };
}

// Gera o HTML das 5 estrelas com suporte a fração (ex: 3.7).
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

function buildRatingHtml(ratings = []) {
    const { average, averageDisplay, count } = calcRatingSummary(ratings);

    if (!count) return `<span style="color:#aaa; font-size:0.85rem;">No ratings yet</span>`;

    return `
        <span>${buildStarsHtml(average)}</span>
        <span style="font-size:0.85rem; color:#666; margin-left:4px;">
            ${averageDisplay} (${count})
        </span>
    `;
}

function renderServices(services, favoriteSet, myServiceSet, myInactiveSet) {
    updateCounters(services, favoriteSet, myServiceSet);

    if (!services.length) {
        listEl.innerHTML = `<p class="muted">No services found.</p>`;
        return;
    }

    listEl.innerHTML = services
        .map((service) => {
            const isFav = favoriteSet.has(service.id);
            const isMine = myServiceSet.has(service.id);
            const isInactive = myInactiveSet.has(service.id);
            const btnLabel = isFav ? "Unsave" : "Save";
            const ratingHtml = buildRatingHtml(service.service_ratings ?? []);

            return `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; gap:12px;">
                        <div>
                            <h3 style="margin:0 0 4px 0;">
                                <a href="/serviceDetails.html?id=${service.id}">
                                    ${escapeHTML(service.title)}
                                </a>
                            </h3>

                            <div style="margin-bottom:6px;">${ratingHtml}</div>

                            <div class="muted">
                                ${escapeHTML(service.subcategories.categories.name ?? "")}
                                · ${escapeHTML(service.subcategories.name ?? "")}
                                <br>${escapeHTML(service.city ?? "")}
                                (${escapeHTML(service.country ?? "")})
                                ${isMine ? "· My service" : ""}
                                ${isInactive ? "· <strong>Inactive</strong>" : ""}
                            </div>

                            <p style="margin:10px 0 0 0;">
                                ${escapeHTML(service.description ?? "")}
                            </p>
                        </div>

                        <div style="min-width:110px; text-align:right;">
                            ${!isInactive ? `
                                <button class="favBtn" data-service-id="${service.id}" data-is-fav="${isFav}">
                                    ${btnLabel}
                                </button>
                            ` : ""}
                            ${isInactive ? `
                                <button class="activateBtn" data-service-id="${service.id}">
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

function renderPagination(total, perPage, currentPage) {
    const paginationEl = document.querySelector("#pagination");

    if (perPage === "All" || total <= Number(perPage)) {
        paginationEl.innerHTML = "";
        return;
    }

    const totalPages = Math.ceil(total / Number(perPage));

    paginationEl.innerHTML = Array.from({ length: totalPages }, (_, i) => {
        const page = i + 1;
        const active = page === currentPage ? "font-weight:bold;" : "";
        return `<button class="pageBtn" data-page="${page}" style="${active}">${page}</button>`;
    }).join("");
}

// ─── Reload / orquestração ────────────────────────────────────
async function reload() {
    setMsg("Loading...");

    const filters = {
        category: categorySel.value || "",
        subcategory: subCategorySel.value || "",
        onlyInactive: onlyMyInactive.checked,
        filterDescription: filterText.value.trim() || "",
        userId: userIdState, // necessário para o filtro onlyInactive
    };

    const orderBy = { sortBy: sortSel.value || "" };
    const pages = { perPage: perPageState, currentPage: currentPageState };

    const subcategories = await fetchSubCategories(filters.category);
    fillSubCategoryDropdown(subcategories);

    // Busca tudo em paralelo — mais rápido que sequencial
    const [{ data: services, total }, favoriteSet, myServiceSet, myInactiveSet] =
        await Promise.all([
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

// ─── Init ─────────────────────────────────────────────────────
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

    const subcategories = await fetchSubCategories(null);
    fillSubCategoryDropdown(subcategories);

    categorySel.addEventListener("change", reload);
    subCategorySel.addEventListener("change", reload);
    sortSel.addEventListener("change", reload);

    paginationSel.addEventListener("change", () => {
        perPageState = paginationSel.value;
        currentPageState = 1;
        reload();
    });

    clearBtn.addEventListener("click", () => {
        categorySel.value = "";
        subCategorySel.value = "";
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

    onlyFavsChk.addEventListener("change", () => { currentPageState = 1; reload(); });
    onlyMyServicesChk.addEventListener("change", () => { currentPageState = 1; reload(); });

    onlyMyInactive.addEventListener("change", () => {
        if (onlyMyInactive.checked) {
            onlyFavsChk.checked = false;
            onlyMyServicesChk.checked = true;
        }
        currentPageState = 1;

        reload();
    });

    document.querySelector("#pagination").addEventListener("click", (e) => {
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
                // userId passado como argumento — sem depender de estado global dentro da api
                await activateService(serviceId, userIdState);
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