// ============================================================
// lib/hooks/favorites.api.js
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

/**
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
