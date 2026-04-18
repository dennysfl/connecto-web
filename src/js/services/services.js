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
// Estas variáveis substituem currentPageState e perPageState.
// Elas controlam quantos itens já foram carregados e quantos existem no total.
const PAGE_SIZE = 5;   // quantos itens carregar por vez

let paginationState = {
    page: 0,         // próxima página a buscar (0 = primeira carga)
    total: 0,         // total de registros no banco (com os filtros ativos)
    loading: false,     // proteção contra cliques duplos
}

// ─── Estado de dados ──────────────────────────────────────────
let servicesState = [];          // lista acumulada dos serviços carregados
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
    if (onlyMyInactive.checked) view = view.filter((s) => myInactiveSetState.has(s.id));
    if (onlyMyServicesChk.checked) view = view.filter((s) => myServiceSetState.has(s.id));
    if (onlyFavsChk.checked) view = view.filter((s) => favoriteSetState.has(s.id));
    return view;
}

// ─── Contadores ───────────────────────────────────────────────

/**
 * Atualiza os 3 contadores do topo (Saved, My Services, Total visível)
 * e o contador "Mostrando X de Y" da paginação Load More.
 */
function updateCounters(viewServices) {
    // Total visível na tela (após filtros de checkbox)
    totalServicesEl.textContent = viewServices.length;

    let savedInView = 0;
    let myServicesInView = 0;

    for (const service of viewServices) {
        if (favoriteSetState.has(service.id)) savedInView++;
        if (myServiceSetState.has(service.id)) myServicesInView++;
    }

    savedCountEl.textContent = savedInView;
    myServicesEl.textContent = myServicesInView;

    // ⭐ Contador Load More: "Mostrando X de Y serviços"
    // servicesState.length = total já carregado e acumulado
    // paginationState.total = total real no banco (com filtros)
    showingCountEl.textContent =
        `Mostrando ${servicesState.length} de ${paginationState.total} serviços`;
}

// ─── Botão Load More ─────────────────────────────────────────

/**
 * Atualiza o estado visual do botão Load More.
 * - Se ainda há mais: mostra o botão habilitado
 * - Se está carregando: mostra botão desabilitado com texto de espera
 * - Se carregou tudo: esconde o botão
 */
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
        // Já carregou tudo — esconde o botão
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

/**
 * Renderiza um lote de services NOVOS no final da lista existente.
 *
 * ⭐ POR QUE insertAdjacentHTML em vez de innerHTML?
 * innerHTML = substitui tudo (apaga o que estava na tela).
 * insertAdjacentHTML("beforeend", ...) = ADICIONA no final, sem apagar nada.
 * Isso é o que cria o efeito "Load More" acumulando itens.
 *
 * @param {Array} newServices - apenas os services recém-carregados (não a lista toda)
 */
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

    // "beforeend" = insere APÓS o último filho — acumula sem apagar
    listEl.insertAdjacentHTML("beforeend", html);
}

// ─── Lógica principal de Load More ───────────────────────────

/**
 * Lê os filtros atuais da tela e retorna um objeto.
 * Centralizado aqui para não repetir em reload() e loadMore().
 */
function getCurrentFilters() {
    return {
        category: categorySel.value || "",
        subcategory: subCategorySel.value || "",
        onlyInactive: onlyMyInactive.checked,
        filterDescription: filterText.value.trim() || "",
        userId: userIdState,
    };
}

function getCurrentOrders() {
    return { sortBy: sortSel.value || "Newest" };
}

/**
 * Carrega o próximo bloco de serviços e acumula na tela.
 * Chamado na primeira carga e a cada clique em "Load More".
 */
async function loadMore() {
    // Proteção: não carrega se já está em andamento
    if (paginationState.loading) return;

    // Proteção: não carrega se já temos tudo
    // (total > 0 evita bloquear a carga inicial quando total ainda é 0)
    const hasMore = servicesState.length < paginationState.total;
    if (!hasMore && paginationState.total > 0) return;

    paginationState.loading = true;
    updateLoadMoreBtn();

    // Calcula os índices do próximo bloco
    const from = paginationState.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
        // Busca em paralelo: services + sets auxiliares
        // Na primeira carga (page 0) os sets são carregados juntos.
        // Nas cargas seguintes, só fetchServices é chamado (os sets já estão em memória).
        let newServices, count;

        if (paginationState.page === 0) {
            // Primeira carga: busca tudo em paralelo
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
            // Load More: só busca os services novos (sets já estão atualizados)
            const result = await fetchServices(
                getCurrentFilters(), getCurrentOrders(), { from, to }
            );
            newServices = result.data;
            count = result.count;
        }

        // Atualiza o total (importante na primeira carga)
        paginationState.total = count;

        // Acumula os novos services no estado local
        servicesState = [...servicesState, ...newServices];

        // Avança para a próxima página
        paginationState.page += 1;

        // Renderiza só os NOVOS items (não re-renderiza toda a lista)
        renderNewServices(newServices);

    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Error loading services.");
    } finally {
        paginationState.loading = false;
        updateCounters(getViewServices());
        updateLoadMoreBtn();

        // Esconde o "Loading..." inicial na primeira carga
        if (paginationState.page === 1) setMsg("");
    }
}

/**
 * Reload completo: chamado quando filtros ou ordenação mudam.
 * Limpa tudo e recomeça do zero.
 */
async function reload() {
    // Limpa a tela
    listEl.innerHTML = "";
    setMsg("Loading...");

    // Atualiza subcategorias quando a categoria muda
    const subcategories = await fetchSubCategories(categorySel.value || null);
    fillSubCategoryDropdown(subcategories);

    // Reseta o estado de paginação
    servicesState = [];
    paginationState = { page: 0, total: 0, loading: false };

    // Inicia do zero
    await loadMore();
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
    // reload() reseta a paginação e recomeça do zero

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

    // Checkboxes de view filtram localmente (sem ir ao banco)
    // Apenas re-renderizam o que já foi carregado
    onlyFavsChk.addEventListener("change", () => {
        updateCounters(getViewServices());
    });

    onlyMyServicesChk.addEventListener("change", () => {
        updateCounters(getViewServices());
    });

    onlyMyInactive.addEventListener("change", () => {
        if (onlyMyInactive.checked) {
            onlyFavsChk.checked = false;
            onlyMyServicesChk.checked = true;
        }
        reload();
    });

    // ── Botão Load More ───────────────────────────────────────
    loadMoreBtn.addEventListener("click", () => loadMore());

    // ── Botões de scroll ──────────────────────────────────────
    scrollTopBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    scrollBottomBtn.addEventListener("click", () => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });

    // ── Ações nos cards (favoritos e ativar) ──────────────────
    listEl.addEventListener("click", async (e) => {

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
                // Atualiza só os contadores — não re-renderiza os cards
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
                // Reload completo para refletir o novo status
                await reload();
                setMsg("Service activated successfully.");
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Failed to activate service.");
                activateBtn.disabled = false;
            }
        }
    });

    // ── Carga inicial ─────────────────────────────────────────
    await loadMore();
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});