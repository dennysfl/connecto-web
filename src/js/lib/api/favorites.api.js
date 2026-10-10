// ============================================================
// lib/api/favorites.api.js
//
// Responsabilidade ÚNICA: toda comunicação com o Supabase
// relacionada à tabela "favorites".
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM (nada de document.querySelector)
//   ❌ Nunca renderiza HTML
//   ❌ Nunca chama window.location
// ============================================================

import { supabase } from "../../supabaseClient.js";

// ─── Serviços e Eventos ──────────────────────────────────────────
/**
 * Busca todos os favoritos de um usuário.
 * Retorna um Set de IDs para facilitar a checagem (favoriteSet.has(id)).
 *
 * @param {string} userId
 * @param {string} entityType
 * @returns {Set<string>}
 */
export async function fetchFavorites(userId, entityType) {
    const { data, error } = await supabase
        .from("favorites")
        .select("entity_id")
        .eq("user_id", userId)
        .eq('entity_type', entityType);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.entity_id));
}

/**
 * Adiciona um serviço aos favoritos do usuário.
 *
 * @param {string} userId
 * @param {string} entityID
 * @param {string} entityType
 */
export async function addFavorite(userId, entityID, entityType) {
    const { error } = await supabase
        .from("favorites")
        .insert([{ user_id: userId, entity_id: entityID, entity_type: entityType }]);

    if (error) throw error;
}

/*
 * Remove um serviço dos favoritos do usuário.
 *
 * @param {string} userId
 * @param {string} entityID
 * @param {string} entityType
 */
export async function removeFavorite(userId, entityID, entityType) {
    const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("entity_id", entityID)
        .eq("entity_type", entityType);

    if (error) throw error;
}

// ─── Comunidades ──────────────────────────────────────────
/**
 * Busca todos as comunidades favoritas de um usuário.
 * Retorna um Set de IDs para facilitar a checagem (favoriteSet.has(id)).
 *
 * @param {string} userId
 * @returns {Set<string>}
 */
export async function fetchFavoritesCommunity(userId) {
    const { data, error } = await supabase
        .from("user_communities")
        .select("community_id")
        .eq("profile_id", userId)
        .eq("is_primary", true);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.community_id));
}

/**
 * Define uma comunidade como a "primary" (favorita) do usuário,
 * removendo automaticamente o status de qualquer outra comunidade
 * que fosse primary antes.
 *
 * Regra de negócio: cada usuário tem NO MÁXIMO 1 comunidade primary.
 *
 * @param {string} userId
 * @param {string} communityID - comunidade que vai virar a nova favorita
 */
export async function setPrimaryCommunity(userId, communityID) {
    // 1º passo: zera is_primary de TODAS as comunidades do usuário
    const { error: clearError } = await supabase
        .from("user_communities")
        .update({ is_primary: false })
        .eq("profile_id", userId);

    if (clearError) throw clearError;

    // 2º passo: marca a comunidade escolhida como primary
    const { error: setError } = await supabase
        .from("user_communities")
        .update({ is_primary: true })
        .eq("profile_id", userId)
        .eq("community_id", communityID);

    if (setError) throw setError;
}