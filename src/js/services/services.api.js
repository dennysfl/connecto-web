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

// ─── SERVICES ────────────────────────────────────────────────
/**
 * Busca a lista de serviços com suporte a filtros, ordenação e paginação.
 *
 * @param {object} filters
 * @param {string} filters.category        - filtra por categoria exata
 * @param {boolean} filters.onlyInactive   - se true, busca apenas inativos do próprio user
 * @param {string} filters.filterDescription - texto livre para buscar em title/description
 * @param {string} filters.userId          - necessário quando onlyInactive = true
 *
 * @param {object} orders
 * @param {string} orders.sortBy           - "Newest" | "Oldest" | "AZ"
 *
 * @param {object} pages
 * @param {number|string} pages.perPage    - número de itens por página ou "All"
 * @param {number} pages.currentPage       - página atual (começa em 1)
 *
 * @returns {{ data: Array, total: number }}
 */
export async function fetchServices(filters = {}, orders = {}, pages = {}) {
    const isActiveFilter = filters.onlyInactive ? false : true;

    // Monta a query base — sempre filtra por is_active
    let q = supabase
        .from("services")
        .select(
            "id, title, description, subcategories!inner (name, categories!inner (name)), city, country, is_active, owner_id, created_at, service_ratings(rating)",
            { count: "exact" }
        )
        .eq("is_active", isActiveFilter);

    // Ordenação
    if (orders.sortBy === "Newest") q = q.order("created_at", { ascending: false });
    else if (orders.sortBy === "Oldest") q = q.order("created_at", { ascending: true });
    else if (orders.sortBy === "AZ") q = q.order("title", { ascending: true });

    // Filtros opcionais
    if (filters.onlyInactive) q = q.eq("owner_id", filters.userId);
    if (filters.category) q = q.eq("subcategories.categories.id", filters.category);
    if (filters.subcategory) q = q.eq("subcategory_id", filters.subcategory);
    if (filters.filterDescription) {
        q = q.or(
            `title.ilike.%${filters.filterDescription}%,description.ilike.%${filters.filterDescription}%`
        );
    }

    // Paginação — só aplica range se não for "All"
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
 * @returns {string[]} lista de categorias ordenadas A-Z
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