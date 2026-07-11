// ============================================================
// events/events.api.js
//
// Responsabilidade ÚNICA: toda comunicação com o Supabase
// relacionada à tabela "events".
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM (nada de document.querySelector)
//   ❌ Nunca renderiza HTML
//   ❌ Nunca chama window.location
// ============================================================

import { supabase } from "../supabaseClient.js";
import { fetchCoverPhotos } from "../lib/api/photos.api.js";

// ─── HELPERS INTERNOS ─────────────────────────────────────────────────────────

/**
 * Aplica os filtros em uma query Supabase.
 * Extraído como função separada para não duplicar lógica entre
 * fetchEvents (dados) e a contagem total.
 *
 * ⭐ BOA PRÁTICA: "Don't Repeat Yourself" (DRY).
 * Se o filtro mudar, você altera só aqui.
 */
function applyFilters(q, filters = {}) {
    if (filters.onlyInactive && filters.userId) {
        q = q.eq("is_active", false);
    } else {
        q = q.eq("is_active", true);
    }

    if (filters.onlyFavoriteIds?.length) {
        q = q.in("id", filters.onlyFavoriteIds);
    }

    if (filters.onlyMyEventIds?.length) {
        q = q.in("id", filters.onlyMyEventIds);
    }

    // Se subcategoria está selecionada, ela já implica a categoria —
    // aplicar os dois filtros ao mesmo tempo conflita no join do Supabase.
    if (filters.subcategory) {
        q = q.eq("subcategory_id", filters.subcategory);
    } else if (filters.category) {
        q = q.eq("subcategories.categories.id", filters.category);
    }

    if (filters.filterDescription) {
        q = q.or(
            `title.ilike.%${filters.filterDescription}%,description.ilike.%${filters.filterDescription}%`
        );
    }

    return q;
}

// ─── FUNÇÕES PÚBLICAS ─────────────────────────────────────────────────────────

/**
 * Busca a lista de eventos com suporte a filtros, ordenação e paginação.
 *
 * @param {object} filters
 * @param {object} orders
 * @param {object} range  - { from: number, to: number }
 * @returns {{ data: Array, count: number }}
 */
export async function fetchEvents(filters = {}, orders = {}, range = {}) {
    let q = supabase
        .from("events")
        .select(
            "id, title, description, subcategories!inner (name, categories!inner (name)), venue_name, city, country, event_type, starts_at, is_free, price_amount, price_currency, is_active, is_cancelled,  owner_id, created_at",
            { count: "exact" }
        );

    q = applyFilters(q, filters);

    if (orders.sortBy === "Newest") q = q.order("created_at", { ascending: false });
    else if (orders.sortBy === "Oldest") q = q.order("created_at", { ascending: true });
    else if (orders.sortBy === "AZ") q = q.order("title", { ascending: true });
    else if (orders.sortBy === "ZA") q = q.order("title", { ascending: false });

    if (range.from !== undefined && range.to !== undefined) {
        q = q.range(range.from, range.to);
    }

    const { data: events, count, error } = await q;
    if (error) throw error;

    if (events?.length > 0) {
        const eventIds = events.map((e) => e.id);

        // ⭐ NOVO — busca summary e cover photos em paralelo
        const [summaryResult, coverPhotosMap] = await Promise.all([
            supabase
                .from("events_summary")
                .select("id, avg_rating, rating_count, comment_count")
                .in("id", eventIds),
            fetchCoverPhotos(eventIds, "event"),
        ]);

        const { data: summaries, error: summaryError } = summaryResult;
        if (summaryError) throw summaryError;

        const data = events.map((e) => {
            const summary = summaries?.find((s) => s.id === e.id);
            return {
                ...e,
                avg_rating: summary?.avg_rating ?? 0,
                rating_count: summary?.rating_count ?? 0,
                comment_count: summary?.comment_count ?? 0,
                coverPhotoUrl: coverPhotosMap.get(e.id) ?? null, // ⭐ NOVO
            };
        });

        return { data, count: count ?? 0 };
    }

    return { data: [], count: count ?? 0 };
}

/**
 * Busca um evento pelo ID.
 * Usado na tela de detalhes e na de edição.
 *
 * @param {string} eventId
 * @returns {object} event
 */
export async function fetchEventById(eventId) {
    const { data, error } = await supabase
        .from("events")
        .select(`
            id,
            owner_id,
            title,
            description,
            subcategory_id,
            event_type,
            venue_name,
            address,
            city,
            country,
            online_url,
            starts_at,
            ends_at,
            timezone,
            is_recurring,
            recurrence_rule,
            recurrence_ends_at,
            max_capacity,
            is_free,
            price_amount,
            price_currency,
            is_active,
            is_cancelled,
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
        .eq("id", eventId)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Cria um novo evento.
 *
 * 🐛 BUG CORRIGIDO: owner_id não era enviado no insert.
 *    A camada de API é responsável por anexar o owner_id —
 *    o formulário nunca deve conhecer detalhes de sessão.
 *
 * 💡 Por que getUser() e não session.user?
 *    getUser() valida o token com o servidor Supabase.
 *    session.user lê apenas do localStorage — pode estar desatualizado
 *    se a sessão expirou entre abrir e submeter o formulário.
 *
 * @param {object} eventData - campos vindos do getFormData()
 * @returns {object} evento criado (com o id gerado pelo banco)
 */
export async function createEvent(eventData) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    const { data, error } = await supabase
        .from("events")
        .insert([{
            ...eventData,
            owner_id: user.id, // ← anexado aqui, nunca vem do formulário
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Atualiza um evento existente.
 *
 * 💡 Não enviamos owner_id no update — o RLS já garante que
 *    só o dono pode atualizar (USING owner_id = auth.uid()).
 *    Reenviar owner_id seria redundante e poderia abrir
 *    brecha se a política de UPDATE não tivesse WITH CHECK.
 *
 * @param {string} eventId
 * @param {object} eventData - campos a atualizar
 * @returns {object} evento atualizado
 */
export async function updateEvent(eventId, eventData) {
    const { data, error } = await supabase
        .from("events")
        .update(eventData)
        .eq("id", eventId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Soft delete — marca o evento como inativo em vez de apagar.
 * Preserva o histórico no banco sem remover o registro.
 *
 * @param {string} eventId
 */
export async function deleteEvent(eventId) {
    const { error } = await supabase
        .from("events")
        .update({ is_active: false })
        .eq("id", eventId);

    if (error) throw error;
}

/**
 * Reativa um evento inativo.
 *
 * @param {string} eventId
 * @param {string} userId
 */
export async function activateEvent(eventId, userId) {
    const { error } = await supabase
        .from("events")
        .update({ is_active: true })
        .eq("id", eventId)
        .eq("owner_id", userId);

    if (error) throw error;
}

/**
 * Busca todos os IDs de eventos que pertencem ao utilizador.
 *
 * @param {string} userId
 * @returns {Set<string>}
 */
export async function fetchMyEvents(userId) {
    const { data, error } = await supabase
        .from("events")
        .select("id")
        .eq("owner_id", userId);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
}

/**
 * Busca os IDs de eventos inativos do utilizador.
 *
 * @param {string} userId
 * @returns {Set<string>}
 */
export async function fetchMyInactive(userId) {
    const { data, error } = await supabase
        .from("events")
        .select("id")
        .eq("owner_id", userId)
        .eq("is_active", false);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
}