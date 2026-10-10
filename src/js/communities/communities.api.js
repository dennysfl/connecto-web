// ============================================================
// communitgies/communities.api.js
//
// Responsabilidade ÚNICA: toda comunicação com o Supabase
// relacionada às "communities".
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM (nada de document.querySelector)
//   ❌ Nunca renderiza HTML
//   ❌ Nunca chama window.location
// ============================================================

import { supabase } from "../supabaseClient.js";
import { fetchCoverPhotos } from "../lib/api/photos.api.js";

// ─── HELPERS INTERNOS ────────────────────────────────────────

// ─── COMMUNITIES ────────────────────────────────────────────────
/**
 * @returns {{ data: Array, count: number }}
 * Retorna `count` (não `total`) para o hook usePagination receber corretamente.
 */
export async function fetchMyCommunity(userId) {
    const { data: rows, count, error } = await supabase
        .from("user_communities")
        .select(
            "is_primary, joined_at, communities!inner (id, name, description, is_active)",
            { count: "exact" }
        )
        .eq("profile_id", userId)
        .order("is_primary", { ascending: false });

    if (error) throw error;

    if (!rows?.length) {
        return { data: [], count: count ?? 0 };
    }

    const communityIds = rows.map((r) => r.communities.id);
    const coverPhotosMap = await fetchCoverPhotos(communityIds, "community");

    const data = rows.map((r) => ({
        ...r.communities,
        isPrimary: r.is_primary,
        joinedAt: r.joined_at,
        coverPhotoUrl: coverPhotosMap.get(r.communities.id) ?? null,
    }));

    return { data, count: count ?? 0 };
}

/**
 * Busca comunidades ATIVAS das quais o usuário AINDA NÃO participa.
 * Estratégia: 2 queries (anti-join feito no client).
 *   1) pega os IDs das comunidades que o usuário já está
 *   2) busca todas as comunidades, exceto essas
 *
 * @param {string} userId
 * @returns {{ data: Array, count: number }}
 */
export async function fetchAvailableCommunities(userId) {
    // 1) IDs das comunidades que o usuário JÁ participa
    const { data: joinedRows, error: joinedError } = await supabase
        .from("user_communities")
        .select("community_id")
        .eq("profile_id", userId);

    if (joinedError) throw joinedError;

    const joinedIds = (joinedRows ?? []).map((r) => r.community_id);

    // 2) Monta a query base de comunidades disponíveis
    let query = supabase
        .from("communities")
        .select("id, name, description, is_active", { count: "exact" })
        .eq("is_active", true)
        .order("name", { ascending: true });

    // Só aplica o filtro NOT IN se a lista não estiver vazia.
    // .not('id', 'in', '()') com lista vazia gera SQL inválido no PostgREST
    // (usuário novo, sem nenhuma comunidade ainda, cairia nesse caso)
    if (joinedIds.length > 0) {
        query = query.not("id", "in", `(${joinedIds.join(",")})`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return { data: data ?? [], count: count ?? 0 };
}

/**
 * @returns {{ data: Array, count: number }}
 * Retorna `count` (não `total`) para o hook usePagination receber corretamente.
 */
export async function fetchCommunityDetails(communityId) {
    const { data: rows, count, error } = await supabase
        .from("communities")
        /*.select(
            "id, name, description, is_active, created_at, updated_at, cover_photo_id, cover_photo_url, countries!inner (id, name, code), languages!inner (id, name, code), photos!left (id, url, created_at)",
            { count: "exact" }
        )*/
        .select(
            "id, name, description, is_active, created_at, updated_at",
            { count: "exact" }
        )
        .eq("id", communityId);

    if (error) throw error;

    if (!rows?.length) {
        return { data: [], count: count ?? 0 };
    }

    const communityIds = rows.map((r) => r.id);
    const coverPhotosMap = await fetchCoverPhotos(communityIds, "community");

    const data = rows.map((r) => ({
        ...r,
        isPrimary: r.is_primary,
        joinedAt: r.joined_at,
        coverPhotoUrl: coverPhotosMap.get(r.id) ?? null,
    }));

    return { data, count: count ?? 0 };
}

/**
 * Busca os últimos serviços ativos de uma comunidade.
 * Vínculo indireto: services -> providers -> community_id
 */
export async function fetchCommunityServices(communityID, limit = 10) {
    const { data, error } = await supabase
        .from("services")
        .select(`
            id,
            title,
            price,
            created_at,
            providers!inner ( id, name, community_id )
        `)
        // 👆 "!inner" é essencial aqui: sem ele, o Supabase NÃO filtra
        // pela coluna da tabela relacionada — ele só embeda o dado,
        // ignorando o .eq() abaixo silenciosamente.
        .eq("providers.community_id", communityID)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data ?? [];
}

/**
 * Busca os últimos eventos de uma comunidade.
 * Vínculo direto: events.community_id
 */
export async function fetchCommunityEvents(communityID, limit = 10) {
    const { data, error } = await supabase
        .from("events")
        .select("id, title, starts_at, venue_name, created_at")
        .eq("community_id", communityID)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data ?? [];
}

/**
 * Adiciona o usuário a uma comunidade (cria a linha em user_communities).
 *
 * Regra de negócio: se essa for a PRIMEIRA comunidade do usuário,
 * ela já nasce como is_primary = true (não faz sentido o usuário ter
 * que "favoritar" a única comunidade que ele tem).
 * Se ele já participa de outras, entra como is_primary = false —
 * quem decide trocar o favorito é o botão "flag favorite".
 *
 * @param {string} userId
 * @param {string} communityID
 */
export async function joinCommunity(userId, communityID) {
    // 1) checa se o usuário já tem alguma comunidade
    const { count, error: countError } = await supabase
        .from("user_communities")
        .select("*", { count: "exact", head: true }) // head: true → não traz linhas, só a contagem (mais leve)
        .eq("profile_id", userId);

    if (countError) throw countError;

    const isFirstCommunity = (count ?? 0) === 0;

    // 2) insere o vínculo usuário-comunidade
    const { error: insertError } = await supabase
        .from("user_communities")
        .insert([{
            profile_id: userId,
            community_id: communityID,
            is_primary: isFirstCommunity, // true só se for a primeira
        }]);

    if (insertError) throw insertError;
}

/**
 * Remove o usuário de uma comunidade.
 *
 * Regra de negócio: se a comunidade removida era a PRIMARY do usuário,
 * promove automaticamente outra comunidade restante (a mais antiga,
 * por joined_at) para manter a invariante "sempre existe 1 primary
 * quando o usuário tem ≥1 comunidade".
 *
 * @param {string} userId
 * @param {string} communityID
 */
export async function leaveCommunity(userId, communityID) {
    // 1) checa se a comunidade que está saindo é a primary
    const { data: current, error: currentError } = await supabase
        .from("user_communities")
        .select("is_primary")
        .eq("profile_id", userId)
        .eq("community_id", communityID)
        .single();

    if (currentError) throw currentError;

    const wasPrimary = current?.is_primary === true;

    // 2) remove o vínculo
    const { error: deleteError } = await supabase
        .from("user_communities")
        .delete()
        .eq("profile_id", userId)
        .eq("community_id", communityID);

    if (deleteError) throw deleteError;

    // 3) se era a primary, promove a mais antiga das que sobraram
    if (wasPrimary) {
        const { data: remaining, error: remainingError } = await supabase
            .from("user_communities")
            .select("community_id")
            .eq("profile_id", userId)
            .order("joined_at", { ascending: true })
            .limit(1);

        if (remainingError) throw remainingError;

        // se não sobrou nenhuma, não tem o que promover — tudo bem, lista fica vazia
        if (remaining?.length) {
            const { error: promoteError } = await supabase
                .from("user_communities")
                .update({ is_primary: true })
                .eq("profile_id", userId)
                .eq("community_id", remaining[0].community_id);

            if (promoteError) throw promoteError;
        }
    }
}