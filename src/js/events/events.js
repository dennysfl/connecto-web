// ============================================================
// events.js  (events.html)
//
// Responsabilidade: orquestrar a listagem de eventos.
//
// O que mudou nesta versão:
//   ✅ HTML dos cards extraído para events-render.js
//   ✅ buildRatingHtml e calcRatingSummary removidos daqui
//   ✅ renderNewEvents agora delega para renderEventCard
// ============================================================

import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";
import {
    fetchEvents,
    fetchMyEvents,
    fetchMyInactive,
    activateEvent
} from "./events.api.js";
import {
    fetchFavorites,
    addFavorite,
    removeFavorite
} from "../lib/hooks/favorites.api.js";
import { fetchCategories, fetchSubCategories } from "../lib/hooks/general.api.js";
import { escapeHTML } from "../utils/string.utils.js";
import { renderEventCard } from "./events-render.js";  // ← NOVO

// ─── Chave do sessionStorage ──────────────────────────────────
const STATE_KEY = "events_listing_state";

// ─── Elementos da página ─────────────────────────────────────
const msg = document.querySelector("#msg");
const listEl = document.querySelector("#eventsList");
const logoutLink = document.querySelector("#logoutLink");
const categorySel = document.querySelector("#categoryFilter");
const subCategorySel = document.querySelector("#subcategoryFilter");
const sortSel = document.querySelector("#sortEvent");
const filterText = document.querySelector("#searchText");
const clearBtn = document.querySelector("#clearFiltersBtn");
const filterBtn = document.querySelector("#runFiltersBtn");
const onlyFavsChk = document.querySelector("#onlyFavs");
const onlyMyEventsChk = document.querySelector("#myEvents");
const onlyMyInactive = document.querySelector("#myInactive");
const savedCountEl = document.querySelector("#savedCount");
const totalEventsEl = document.querySelector("#totalEvents");
const myEventsEl = document.querySelector("#totalMyEvents");
const loadMoreBtn = document.querySelector("#loadMoreBtn");
const showingCountEl = document.querySelector("#showingCount");
const scrollTopBtn = document.querySelector("#scrollTopBtn");
const scrollBottomBtn = document.querySelector("#scrollBottomBtn");

// ─── Estado de paginação Load More ───────────────────────────
const PAGE_SIZE = 5;

let paginationState = { page: 0, total: 0, loading: false };

// ─── Estado de dados ──────────────────────────────────────────
let eventsState = [];
let favoriteSetState = new Set();
let myEventSetState = new Set();
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

function getViewEvents() {
    let view = [...eventsState];
    if (onlyMyEventsChk.checked) view = view.filter((s) => myEventSetState.has(s.id));
    if (onlyFavsChk.checked) view = view.filter((s) => favoriteSetState.has(s.id));
    return view;
}

// ─── Contadores ───────────────────────────────────────────────

function updateCounters(viewEvents) {
    totalEventsEl.textContent = viewEvents.length;

    let savedInView = 0;
    let myEventsInView = 0;

    for (const event of viewEvents) {
        if (favoriteSetState.has(event.id)) savedInView++;
        if (myEventSetState.has(event.id)) myEventsInView++;
    }

    savedCountEl.textContent = savedInView;
    myEventsEl.textContent = myEventsInView;
    showingCountEl.textContent = `Showing ${eventsState.length} of ${paginationState.total} events`;
}

// ─── Botão Load More ─────────────────────────────────────────
function updateLoadMoreBtn() {
    const hasMore = eventsState.length < paginationState.total;

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
 * Agora delega para renderEventCard — zero HTML aqui.
 */
function renderNewEvents(newEvents) {
    if (!newEvents.length) return;

    const html = newEvents
        .map((event) => renderEventCard(
            event,
            favoriteSetState.has(event.id),
            myEventSetState.has(event.id),
            myInactiveSetState.has(event.id)
        ))
        .join("");

    listEl.insertAdjacentHTML("beforeend", html);
}

function renderFilteredView() {
    const view = getViewEvents();
    listEl.innerHTML = "";
    if (view.length) renderNewEvents(view);
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
        myEvents: onlyMyEventsChk.checked,
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
    onlyMyEventsChk.checked = state.myEvents ?? false;
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
        onlyMyEventIds: onlyMyEventsChk.checked ? [...myEventSetState] : null,
    };
}

function getCurrentOrders() {
    return { sortBy: sortSel.value || "Newest" };
}

async function loadMore() {
    if (paginationState.loading) return;

    const hasMore = eventsState.length < paginationState.total;
    if (!hasMore && paginationState.total > 0) return;

    paginationState.loading = true;
    updateLoadMoreBtn();

    const from = paginationState.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
        let newEvents, count;

        if (paginationState.page === 0) {
            const [result, favoriteSet, myEventSet, myInactiveSet] = await Promise.all([
                fetchEvents(getCurrentFilters(), getCurrentOrders(), { from, to }),
                fetchFavorites(userIdState, "event"),
                fetchMyEvents(userIdState),
                fetchMyInactive(userIdState),
            ]);

            newEvents = result.data;
            count = result.count;
            favoriteSetState = favoriteSet;
            myEventSetState = myEventSet;
            myInactiveSetState = myInactiveSet;

        } else {
            const result = await fetchEvents(
                getCurrentFilters(), getCurrentOrders(), { from, to }
            );
            newEvents = result.data;
            count = result.count;
        }

        paginationState.total = count;
        eventsState = [...eventsState, ...newEvents];
        paginationState.page += 1;

        renderNewEvents(newEvents);

    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Error loading events.");
    } finally {
        paginationState.loading = false;
        updateCounters(getViewEvents());
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

    eventsState = [];
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

    const categories = await fetchCategories('event');
    console.log(categories);
    fillCategoryDropdown(categories);

    categorySel.addEventListener("change", reload);
    subCategorySel.addEventListener("change", reload);
    sortSel.addEventListener("change", reload);
    filterBtn.addEventListener("click", () => reload());

    clearBtn.addEventListener("click", () => {
        categorySel.value = "";
        subCategorySel.value = "";
        onlyFavsChk.checked = false;
        onlyMyEventsChk.checked = false;
        onlyMyInactive.checked = false;
        filterText.value = "";
        sortSel.value = "Newest";
        reload();
    });

    onlyFavsChk.addEventListener("change", () => reload());
    onlyMyEventsChk.addEventListener("change", () => reload());
    onlyMyInactive.addEventListener("change", () => reload());
    loadMoreBtn.addEventListener("click", () => loadMore());

    scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    scrollBottomBtn.addEventListener("click", () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));

    // ── Ações nos cards (event delegation) ───────────────────
    listEl.addEventListener("click", async (e) => {

        // Salva estado antes de navegar para os detalhes
        const eventLink = e.target.closest(".eventLink");
        if (eventLink) {
            e.preventDefault();
            saveListingState();
            window.location.href = eventLink.href;
            return;
        }

        // Save / Unsave favorito
        const favBtn = e.target.closest(".favBtn");
        if (favBtn) {
            const eventId = favBtn.dataset.eventId;
            const isFav = favBtn.dataset.isFav === "true";

            favBtn.disabled = true;
            setMsg("");

            try {
                if (isFav) {
                    await removeFavorite(userIdState, eventId);
                    favoriteSetState.delete(eventId);
                    favBtn.textContent = "Save";
                    favBtn.dataset.isFav = "false";
                } else {
                    await addFavorite(userIdState, eventId);
                    favoriteSetState.add(eventId);
                    favBtn.textContent = "Unsave";
                    favBtn.dataset.isFav = "true";
                }
                updateCounters(getViewEvents());
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
            const eventId = activateBtn.dataset.eventId;
            const confirmed = window.confirm("Do you want to activate this event again?");
            if (!confirmed) return;

            activateBtn.disabled = true;
            setMsg("");

            try {
                await activateEvent(eventId, userIdState);
                await reload();
                setMsg("Event activated successfully.");
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Failed to event event.");
                activateBtn.disabled = false;
            }
        }
    });

    // ── Verifica se deve restaurar estado (voltou do eventDetails) ──
    const savedState = loadListingState();

    if (savedState && savedState.pagesLoaded > 0) {
        setMsg("Loading...");
        await applyRestoredFilters(savedState);

        listEl.innerHTML = "";
        eventsState = [];
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