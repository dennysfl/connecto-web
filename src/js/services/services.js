// ============================================================
// services.js  (services.html)
//
// Responsabilidade: orquestrar a listagem de serviços.
//
// O que mudou nesta versão:
//   ✅ HTML dos cards extraído para services-render.js
//   ✅ buildRatingHtml e calcRatingSummary removidos daqui
//   ✅ renderNewServices agora delega para renderServiceCard
// ============================================================

import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";
import {
    fetchServices,
    fetchMyServices,
    fetchMyInactive,
    activateService
} from "./services.api.js";
import {
    fetchFavorites,
    addFavorite,
    removeFavorite
} from "../lib/api/favorites.api.js";
import { fetchCategories, fetchSubCategories } from "../lib/api/general.api.js";
import { escapeHTML } from "../utils/string.utils.js";
import { renderServiceCard } from "./services-render.js";  // ← NOVO

// ─── Chave do sessionStorage ──────────────────────────────────
const STATE_KEY = "services_listing_state";

// ─── Elementos da página ─────────────────────────────────────
const msg = document.querySelector("#msg");
const listEl = document.querySelector("#servicesList");
const logoutLink = document.querySelector("#logoutLink");
const categorySel = document.querySelector("#categoryFilter");
const subCategorySel = document.querySelector("#subcategoryFilter");
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
const loadMoreBtn = document.querySelector("#loadMoreBtn");
const showingCountEl = document.querySelector("#showingCount");
const scrollTopBtn = document.querySelector("#scrollTopBtn");
const scrollBottomBtn = document.querySelector("#scrollBottomBtn");

// ─── Estado de paginação Load More ───────────────────────────
const PAGE_SIZE = 5;

let paginationState = { page: 0, total: 0, loading: false };

// ─── Estado de dados ──────────────────────────────────────────
let servicesState = [];
let favoriteSetState = new Set();
let myServiceSetState = new Set();
let myInactiveSetState = new Set();
let userIdState = null;

// ─── Helpers de UI ────────────────────────────────────────────

function setMsg(text = "") { msg.textContent = text; }

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
    if (onlyMyServicesChk.checked) view = view.filter((s) => myServiceSetState.has(s.id));
    if (onlyFavsChk.checked) view = view.filter((s) => favoriteSetState.has(s.id));
    return view;
}

// ─── Contadores ───────────────────────────────────────────────

function updateCounters(viewServices) {
    totalServicesEl.textContent = viewServices.length;

    let savedInView = 0;
    let myServicesInView = 0;

    for (const service of viewServices) {
        if (favoriteSetState.has(service.id)) savedInView++;
        if (myServiceSetState.has(service.id)) myServicesInView++;
    }

    savedCountEl.textContent = savedInView;
    myServicesEl.textContent = myServicesInView;
    showingCountEl.textContent = `Mostrando ${servicesState.length} de ${paginationState.total} serviços`;
}

// ─── Botão Load More ─────────────────────────────────────────

function updateLoadMoreBtn() {
    const hasMore = servicesState.length < paginationState.total;

    if (paginationState.loading) {
        loadMoreBtn.style.display = "block";
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = "Loading...";
        return;
    }

    if (hasMore) {
        loadMoreBtn.style.display = "block";
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = "Load More";
    } else {
        loadMoreBtn.style.display = "none";
    }
}

// ─── Renderização ─────────────────────────────────────────────

/**
 * Acrescenta os novos cards ao final da lista (Load More acumula).
 * Agora delega para renderServiceCard — zero HTML aqui.
 */
function renderNewServices(newServices) {
    if (!newServices.length) return;

    const html = newServices
        .map((service) => renderServiceCard(
            service,
            favoriteSetState.has(service.id),
            myServiceSetState.has(service.id),
            myInactiveSetState.has(service.id)
        ))
        .join("");

    listEl.insertAdjacentHTML("beforeend", html);
}

function renderFilteredView() {
    const view = getViewServices();
    listEl.innerHTML = "";
    if (view.length) renderNewServices(view);
    updateCounters(view);
}

// ─── SessionStorage: salvar e restaurar estado ────────────────

function saveListingState() {
    const state = {
        searchText: filterText.value,
        category: categorySel.value,
        subcategory: subCategorySel.value,
        sortBy: sortSel.value,
        onlyFavs: onlyFavsChk.checked,
        myServices: onlyMyServicesChk.checked,
        myInactive: onlyMyInactive.checked,
        pagesLoaded: paginationState.page,
        total: paginationState.total,
        scrollY: window.scrollY,
    };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadListingState() {
    try {
        const raw = sessionStorage.getItem(STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function clearListingState() {
    sessionStorage.removeItem(STATE_KEY);
}

async function applyRestoredFilters(state) {
    filterText.value = state.searchText ?? "";
    categorySel.value = state.category ?? "";
    sortSel.value = state.sortBy ?? "Newest";
    onlyFavsChk.checked = state.onlyFavs ?? false;
    onlyMyServicesChk.checked = state.myServices ?? false;
    onlyMyInactive.checked = state.myInactive ?? false;

    const subcategories = await fetchSubCategories(state.category || null);
    fillSubCategoryDropdown(subcategories);
    subCategorySel.value = state.subcategory ?? "";
}

// ─── Lógica principal de Load More ───────────────────────────

function getCurrentFilters() {
    return {
        category: categorySel.value || "",
        subcategory: subCategorySel.value || "",
        onlyInactive: onlyMyInactive.checked,
        filterDescription: filterText.value.trim() || "",
        userId: userIdState,
        onlyFavoriteIds: onlyFavsChk.checked ? [...favoriteSetState] : null,
        onlyMyServiceIds: onlyMyServicesChk.checked ? [...myServiceSetState] : null,
    };
}

function getCurrentOrders() {
    return { sortBy: sortSel.value || "Newest" };
}

async function loadMore() {
    if (paginationState.loading) return;

    const hasMore = servicesState.length < paginationState.total;
    if (!hasMore && paginationState.total > 0) return;

    paginationState.loading = true;
    updateLoadMoreBtn();

    const from = paginationState.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
        let newServices, count;

        if (paginationState.page === 0) {
            const [result, favoriteSet, myServiceSet, myInactiveSet] = await Promise.all([
                fetchServices(getCurrentFilters(), getCurrentOrders(), { from, to }),
                fetchFavorites(userIdState, 'service'),
                fetchMyServices(userIdState),
                fetchMyInactive(userIdState),
            ]);

            newServices = result.data;
            count = result.count;
            favoriteSetState = favoriteSet;
            myServiceSetState = myServiceSet;
            myInactiveSetState = myInactiveSet;

        } else {
            const result = await fetchServices(
                getCurrentFilters(), getCurrentOrders(), { from, to }
            );
            newServices = result.data;
            count = result.count;
        }

        paginationState.total = count;
        servicesState = [...servicesState, ...newServices];
        paginationState.page += 1;

        renderNewServices(newServices);

    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Error loading services.");
    } finally {
        paginationState.loading = false;
        updateCounters(getViewServices());
        updateLoadMoreBtn();
        if (paginationState.page === 1) setMsg("");
    }
}

async function reload() {
    clearListingState();
    listEl.innerHTML = "";
    setMsg("Loading...");

    const previousSubcategory = subCategorySel.value;
    const subcategories = await fetchSubCategories(categorySel.value || null);
    fillSubCategoryDropdown(subcategories);

    if (previousSubcategory && subcategories.some(s => s.id === previousSubcategory)) {
        subCategorySel.value = previousSubcategory;
    }

    servicesState = [];
    paginationState = { page: 0, total: 0, loading: false };

    await loadMore();
}

async function restorePages(pagesLoaded) {
    for (let i = 0; i < pagesLoaded; i++) {
        await loadMore();
    }
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

    const categories = await fetchCategories('service');
    fillCategoryDropdown(categories);

    categorySel.addEventListener("change", reload);
    subCategorySel.addEventListener("change", reload);
    sortSel.addEventListener("change", reload);
    filterBtn.addEventListener("click", () => reload());

    clearBtn.addEventListener("click", () => {
        categorySel.value = "";
        subCategorySel.value = "";
        onlyFavsChk.checked = false;
        onlyMyServicesChk.checked = false;
        onlyMyInactive.checked = false;
        filterText.value = "";
        sortSel.value = "Newest";
        reload();
    });

    onlyFavsChk.addEventListener("change", () => reload());
    onlyMyServicesChk.addEventListener("change", () => reload());
    onlyMyInactive.addEventListener("change", () => reload());
    loadMoreBtn.addEventListener("click", () => loadMore());

    scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    scrollBottomBtn.addEventListener("click", () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));

    // ── Ações nos cards (event delegation) ───────────────────
    listEl.addEventListener("click", async (e) => {

        // Salva estado antes de navegar para os detalhes
        const serviceLink = e.target.closest(".serviceLink");
        if (serviceLink) {
            e.preventDefault();
            saveListingState();
            window.location.href = serviceLink.href;
            return;
        }

        // Save / Unsave favorito
        const favBtn = e.target.closest(".favBtn");
        if (favBtn) {
            const serviceId = favBtn.dataset.serviceId;
            const isFav = favBtn.dataset.isFav === "true";

            favBtn.disabled = true;
            setMsg("");

            try {
                if (isFav) {
                    await removeFavorite(userIdState, serviceId, 'service');
                    favoriteSetState.delete(serviceId);
                    favBtn.textContent = "Save";
                    favBtn.dataset.isFav = "false";
                } else {
                    await addFavorite(userIdState, serviceId, 'service');
                    favoriteSetState.add(serviceId);
                    favBtn.textContent = "Unsave";
                    favBtn.dataset.isFav = "true";
                }
                updateCounters(getViewServices());
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Action failed");
            } finally {
                favBtn.disabled = false;
            }
        }

        // Reativar serviço inativo
        const activateBtn = e.target.closest(".activateBtn");
        if (activateBtn) {
            const serviceId = activateBtn.dataset.serviceId;
            const confirmed = window.confirm("Do you want to activate this service again?");
            if (!confirmed) return;

            activateBtn.disabled = true;
            setMsg("");

            try {
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

    // ── Verifica se deve restaurar estado (voltou do serviceDetails) ──
    const savedState = loadListingState();

    if (savedState && savedState.pagesLoaded > 0) {
        setMsg("Loading...");
        await applyRestoredFilters(savedState);

        listEl.innerHTML = "";
        servicesState = [];
        paginationState = { page: 0, total: 0, loading: false };

        await restorePages(savedState.pagesLoaded);

        requestAnimationFrame(() => {
            window.scrollTo({ top: savedState.scrollY ?? 0, behavior: "instant" });
        });

        clearListingState();

    } else {
        await loadMore();
    }
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});