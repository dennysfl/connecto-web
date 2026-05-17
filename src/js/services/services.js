// ============================================================
// services.js  (services.html)
//
// Responsabilidade: orquestrar a listagem de serviços.
//
// ⭐ O QUE MUDOU EM RELAÇÃO À VERSÃO ANTERIOR:
//   ✅ Paginação por páginas removida (sem mais currentPage, perPage, renderPagination)
//   ✅ Padrão "Load More" implementado — items acumulam na tela
//   ✅ Contador "Mostrando X de Y serviços" sempre atualizado
//   ✅ Botões de scroll ↑ Topo e ↓ Final
//   ✅ Filtros e ordenação resetam a lista ao mudar (reload completo)
//   ✅ Fetch paralelo mantido (mais rápido que sequencial)
//   ✅ [NOVO] State persistence via sessionStorage — ao voltar do serviceDetails,
//      os filtros, paginação e posição de scroll são restaurados automaticamente.
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

// ─── Chave do sessionStorage ──────────────────────────────────
// Usamos uma chave única para não colidir com outros estados
// que você vai implementar em outras páginas (events, etc.)
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

// Elementos novos (Load More + scroll)
const loadMoreBtn = document.querySelector("#loadMoreBtn");
const showingCountEl = document.querySelector("#showingCount");   // "Mostrando X de Y"
const scrollTopBtn = document.querySelector("#scrollTopBtn");
const scrollBottomBtn = document.querySelector("#scrollBottomBtn");

// ─── Estado de paginação Load More ───────────────────────────
const PAGE_SIZE = 5;   // quantos itens carregar por vez

let paginationState = {
    page: 0,
    total: 0,
    loading: false,
}

// ─── Estado de dados ──────────────────────────────────────────
let servicesState = [];
let favoriteSetState = new Set();
let myServiceSetState = new Set();
let myInactiveSetState = new Set();
let userIdState = null;

// ─── Helpers de UI ────────────────────────────────────────────

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
    // "My Services" filtra client-side para mostrar apenas os do usuário logado
    if (onlyMyServicesChk.checked) view = view.filter((s) => myServiceSetState.has(s.id));
    // "Only Favorites" filtra client-side para mostrar apenas favoritos
    if (onlyFavsChk.checked) view = view.filter((s) => favoriteSetState.has(s.id));
    // "My Inactive": o backend já trouxe ativos + inativos do usuário — sem filtro extra aqui
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

    showingCountEl.textContent =
        `Mostrando ${servicesState.length} de ${paginationState.total} serviços`;
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

// ─── Rating helpers ───────────────────────────────────────────

function calcRatingSummary(ratings = []) {
    if (!ratings.length) return { average: null, count: 0 };
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const average = sum / ratings.length;
    return { average, averageDisplay: average.toFixed(1), count: ratings.length };
}

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

// ─── Renderização ─────────────────────────────────────────────

function renderNewServices(newServices) {
    if (!newServices.length) return;

    const html = newServices
        .map((service) => {
            const isFav = favoriteSetState.has(service.id);
            const isMine = myServiceSetState.has(service.id);
            const isInactive = myInactiveSetState.has(service.id);
            const btnLabel = isFav ? "Unsave" : "Save";
            const ratingHtml = buildRatingHtml(service.service_ratings ?? []);

            return `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; gap:12px;">
                        <div>
                            <h3 style="margin:0 0 4px 0;">
                                <a class="serviceLink" href="/serviceDetails.html?id=${service.id}" data-service-id="${service.id}">
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

    listEl.insertAdjacentHTML("beforeend", html);
}

// ─── SessionStorage: salvar e restaurar estado ────────────────

/**
 * Salva o estado atual (filtros + paginação + scroll) no sessionStorage.
 * Chamado ANTES de navegar para o serviceDetails.
 */
function saveListingState() {
    const state = {
        // Filtros
        searchText: filterText.value,
        category: categorySel.value,
        subcategory: subCategorySel.value,
        sortBy: sortSel.value,
        onlyFavs: onlyFavsChk.checked,
        myServices: onlyMyServicesChk.checked,
        myInactive: onlyMyInactive.checked,

        // Paginação: quantas páginas foram carregadas
        pagesLoaded: paginationState.page,
        total: paginationState.total,

        // Scroll: posição atual para restaurar depois
        scrollY: window.scrollY,
    };

    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/**
 * Lê o estado salvo do sessionStorage.
 * Retorna null se não houver nada salvo.
 */
function loadListingState() {
    try {
        const raw = sessionStorage.getItem(STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Limpa o estado salvo.
 * Chamado quando o usuário muda filtros manualmente (reload normal).
 */
function clearListingState() {
    sessionStorage.removeItem(STATE_KEY);
}

/**
 * Aplica os valores do estado salvo nos campos da tela.
 * Só mexe nos dropdowns/checkboxes — o loadMore vai cuidar dos dados.
 */
async function applyRestoredFilters(state) {
    filterText.value = state.searchText ?? "";
    categorySel.value = state.category ?? "";
    sortSel.value = state.sortBy ?? "Newest";
    onlyFavsChk.checked = state.onlyFavs ?? false;
    onlyMyServicesChk.checked = state.myServices ?? false;
    onlyMyInactive.checked = state.myInactive ?? false;

    // Recarrega as subcategorias para a categoria salva
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

        // Passa os IDs para filtrar no banco
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
                fetchFavorites(userIdState),
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

/**
 * Re-renderiza a lista com base nos filtros client-side (onlyFavs, myServices).
 * Não vai ao banco — trabalha com servicesState que já está em memória.
 */
function renderFilteredView() {
    const view = getViewServices();
    listEl.innerHTML = "";
    if (view.length) {
        renderNewServices(view);
    }
    updateCounters(view);
}

/**
 * Reload completo: chamado quando filtros mudam manualmente.
 * Limpa o estado salvo, pois o usuário está escolhendo novos filtros.
 */
async function reload() {
    clearListingState(); // usuário mudou filtros = descarta o estado antigo

    listEl.innerHTML = "";
    setMsg("Loading...");

    const previousSubcategory = subCategorySel.value;
    const subcategories = await fetchSubCategories(categorySel.value || null);
    fillSubCategoryDropdown(subcategories);

    // Restaura o valor selecionado se ainda existir no novo dropdown
    // (ex: usuário mudou a subcategoria — não a categoria)
    if (previousSubcategory && subcategories.some(s => s.id === previousSubcategory)) {
        subCategorySel.value = previousSubcategory;
    }

    console.log(subcategories);

    servicesState = [];
    paginationState = { page: 0, total: 0, loading: false };

    await loadMore();
}

/**
 * Restauração de estado: carrega múltiplos "Load More" de uma vez
 * para reconstruir exatamente quantas páginas o usuário tinha visto.
 *
 * Por exemplo: se o usuário tinha carregado 3 páginas (15 itens),
 * este método chama loadMore() 3 vezes em sequência.
 */
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

    // Popula categorias
    const categories = await fetchCategories();
    fillCategoryDropdown(categories);

    // ── Listeners de filtros — todos chamam reload() ──────────
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

    // ── Botão Load More ───────────────────────────────────────
    loadMoreBtn.addEventListener("click", () => loadMore());

    // ── Botões de scroll ──────────────────────────────────────
    scrollTopBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    scrollBottomBtn.addEventListener("click", () => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });

    // ── Ações nos cards ───────────────────────────────────────
    listEl.addEventListener("click", async (e) => {

        // ── Intercepta clique no link do serviço para salvar estado ANTES de navegar
        const serviceLink = e.target.closest(".serviceLink");
        if (serviceLink) {
            e.preventDefault(); // segura a navegação por um instante
            saveListingState(); // salva tudo no sessionStorage
            window.location.href = serviceLink.href; // aí navega
            return;
        }

        // Botão Save / Unsave
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
                    favBtn.textContent = "Save";
                    favBtn.dataset.isFav = "false";
                } else {
                    await addFavorite(userIdState, serviceId);
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

        // Botão Activate
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
        // Veio do serviceDetails — restaura filtros e recarrega as páginas
        setMsg("Loading...");

        await applyRestoredFilters(savedState);

        // Limpa a lista antes de recarregar (evita duplicatas)
        listEl.innerHTML = "";
        servicesState = [];
        paginationState = { page: 0, total: 0, loading: false };

        // Recarrega todas as páginas que o usuário havia carregado
        await restorePages(savedState.pagesLoaded);

        // Restaura a posição de scroll após tudo renderizado
        // Usamos requestAnimationFrame para garantir que o DOM já foi pintado
        requestAnimationFrame(() => {
            window.scrollTo({ top: savedState.scrollY ?? 0, behavior: "instant" });
        });

        // Limpa o estado — próxima visita será carga normal
        clearListingState();

    } else {
        // Carga normal (primeira visita ou usuário veio de outro lugar)
        await loadMore();
    }
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});