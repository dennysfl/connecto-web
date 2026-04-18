// ============================================================
// services/services.api.js
//
// Responsabilidade ÚNICA: toda comunicação com o Supabase
// relacionada à tabela "services" e "favorites".
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM (nada de document.querySelector)
//   ❌ Nunca renderiza HTML
//   ❌ Nunca chama window.location
// ============================================================

import { supabase } from "../supabaseClient.js";

// ─── HELPERS INTERNOS ────────────────────────────────────────

/**
 * Aplica os filtros em uma query Supabase.
 * Extraído como função separada para não duplicar lógica entre
 * fetchServices (que traz dados) e a contagem total.
 *
 * ⭐ BOA PRÁTICA: "Don't Repeat Yourself" (DRY).
 * Se o filtro mudar, você altera só aqui — não em dois lugares.
 *
 * @param {object} q       - query Supabase já iniciada
 * @param {object} filters - os mesmos filtros que vêm da página
 * @returns query com filtros aplicados
 */
function applyFilters(q, filters = {}) {
    const isActive = filters.onlyInactive ? false : true;

    q = q.eq("is_active", isActive);

    if (filters.onlyInactive && filters.userId) {
        q = q.eq("owner_id", filters.userId);
    }

    if (filters.category) {
        q = q.eq("subcategories.categories.id", filters.category);
    }

    if (filters.subcategory) {
        q = q.eq("subcategory_id", filters.subcategory);
    }

    if (filters.filterDescription) {
        q = q.or(
            `title.ilike.%${filters.filterDescription}%,description.ilike.%${filters.filterDescription}%`
        );
    }

    return q;
}

// ─── SERVICES ────────────────────────────────────────────────

/**
 * Busca a lista de serviços com suporte a filtros, ordenação e paginação Load More.
 *
 * ⭐ O QUE MUDOU em relação à versão anterior:
 *   - O terceiro parâmetro era `pages { perPage, currentPage }` (paginação por página).
 *   - Agora é `{ from, to }` — índices diretos que o hook usePagination calcula.
 *   - O count agora aplica os mesmos filtros, então o total exibido é sempre correto.
 *
 * @param {object} filters
 * @param {string}  filters.category          - filtra por categoria (id)
 * @param {boolean} filters.onlyInactive      - se true, busca apenas inativos do próprio user
 * @param {string}  filters.filterDescription - texto livre para buscar em title/description
 * @param {string}  filters.userId            - necessário quando onlyInactive = true
 *
 * @param {object} orders
 * @param {string}  orders.sortBy             - "Newest" | "Oldest" | "AZ"
 *
 * @param {object} range
 * @param {number}  range.from                - índice inicial (ex: 0, 10, 20...)
 * @param {number}  range.to                  - índice final   (ex: 9, 19, 29...)
 *
 * @returns {{ data: Array, count: number }}
 *   Retorna `count` (não `total`) para o hook usePagination receber corretamente.
 */
export async function fetchServices(filters = {}, orders = {}, range = {}) {

    // ── 1. Query principal: busca os dados paginados ──────────
    let q = supabase
        .from("services")
        .select(
            "id, title, description, subcategories!inner (name, categories!inner (name)), city, country, is_active, owner_id, created_at, service_ratings(rating)",
            // count: 'exact' aqui junto com o select de dados
            { count: "exact" }
        );

    // Aplica os filtros (função reutilizável definida acima)
    q = applyFilters(q, filters);

    // Ordenação
    if (orders.sortBy === "Newest") q = q.order("created_at", { ascending: false });
    else if (orders.sortBy === "Oldest") q = q.order("created_at", { ascending: true });
    else if (orders.sortBy === "AZ") q = q.order("title", { ascending: true });

    // Paginação: aplica o range que o hook calculou
    // from=0, to=9  → primeiros 10 itens
    // from=10, to=19 → próximos 10 itens (Load More)
    if (range.from !== undefined && range.to !== undefined) {
        q = q.range(range.from, range.to);
    }

    const { data, count, error } = await q;

    if (error) throw error;

    // Retorna `count` diretamente — é o que o hook usePagination espera
    return { data: data ?? [], count: count ?? 0 };
}

/**
 * Busca um serviço pelo ID.
 * Usado tanto na tela de detalhes quanto na de edição.
 *
 * @param {string} serviceId
 * @returns {object} service
 */
export async function fetchServiceById(serviceId) {
    const { data, error } = await supabase
        .from("services")
        .select(`
            id,
            owner_id,
            title,
            description,
            subcategory_id,
            city,
            country,
            is_active,
            created_at,
            subcategories!inner (
                id,
                name,
                category_id,
                categories!inner (
                    id,
                    name
                )
            )
        `)
        .eq("id", serviceId)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Busca todas as categorias únicas de serviços ativos.
 * Usada para popular o dropdown de filtro/formulário.
 *
 * @returns {object[]} lista de categorias ordenadas por sort_order
 */
export async function fetchCategories() {
    const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function fetchSubCategories(categoryId) {
    let q = supabase
        .from("subcategories")
        .select("id, name")
        .eq("is_active", true);

    if (categoryId) {
        q = q.eq("category_id", categoryId);
    } else {
        return [];
    }

    q = q.order("sort_order", { ascending: true });

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
}

/**
 * Cria um novo serviço.
 *
 * @param {object} serviceData - { title, description, subcategory_id, city, country, is_active }
 * @returns {object} serviço criado (com o id gerado pelo banco)
 */
export async function createService(serviceData) {
    const { data, error } = await supabase
        .from("services")
        .insert([serviceData])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Atualiza um serviço existente.
 *
 * @param {string} serviceId
 * @param {object} serviceData - campos a atualizar
 * @returns {object} serviço atualizado
 */
export async function updateService(serviceId, serviceData) {
    const { data, error } = await supabase
        .from("services")
        .update(serviceData)
        .eq("id", serviceId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * "Deleta" um serviço — na prática, marca como inativo (soft delete).
 * Preserva o histórico no banco sem remover o registro.
 *
 * @param {string} serviceId
 */
export async function deleteService(serviceId) {
    const { error } = await supabase
        .from("services")
        .update({ is_active: false })
        .eq("id", serviceId)
        .select()
        .single();

    if (error) throw error;
}

/**
 * Reativa um serviço inativo.
 * Só o próprio dono pode fazer isso (restrição via owner_id).
 *
 * @param {string} serviceId
 * @param {string} userId
 */
export async function activateService(serviceId, userId) {
    const { error } = await supabase
        .from("services")
        .update({ is_active: true })
        .eq("id", serviceId)
        .eq("owner_id", userId);

    if (error) throw error;
}

// ─── FAVORITES ───────────────────────────────────────────────

/**
 * Busca todos os favoritos de um usuário.
 * Retorna um Set de IDs para facilitar a checagem (favoriteSet.has(id)).
 *
 * @param {string} userId
 * @returns {Set<string>}
 */
export async function fetchFavorites(userId) {
    const { data, error } = await supabase
        .from("favorites")
        .select("service_id")
        .eq("user_id", userId);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.service_id));
}

/**
 * Adiciona um serviço aos favoritos do usuário.
 *
 * @param {string} userId
 * @param {string} serviceId
 */
export async function addFavorite(userId, serviceId) {
    const { error } = await supabase
        .from("favorites")
        .insert([{ user_id: userId, service_id: serviceId }]);

    if (error) throw error;
}

/**
 * Remove um serviço dos favoritos do usuário.
 *
 * @param {string} userId
 * @param {string} serviceId
 */
export async function removeFavorite(userId, serviceId) {
    const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("service_id", serviceId);

    if (error) throw error;
}

/**
 * Busca todos os IDs de serviços que pertencem ao usuário.
 *
 * @param {string} userId
 * @returns {Set<string>}
 */
export async function fetchMyServices(userId) {
    const { data, error } = await supabase
        .from("services")
        .select("id")
        .eq("owner_id", userId);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
}

/**
 * Busca os IDs de serviços inativos do usuário.
 *
 * @param {string} userId
 * @returns {Set<string>}
 */
export async function fetchMyInactive(userId) {
    const { data, error } = await supabase
        .from("services")
        .select("id")
        .eq("owner_id", userId)
        .eq("is_active", false);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
}