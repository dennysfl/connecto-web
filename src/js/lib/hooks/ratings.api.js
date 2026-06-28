// ============================================================
// lib/hooks/ratings.api.js
//
// Responsabilidade ÚNICA: comunicação com o Supabase para ratings.
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM (nada de document.querySelector)
//   ❌ Nunca renderiza HTML
//   ❌ Nunca chama window.location
// ============================================================

import { supabase } from "../../supabaseClient.js";

// ─── RATINGS ─────────────────────────────────────────────────
/**
 * Busca a nota que o usuário atual já deu para este serviço.
 * Retorna 0 se ainda não avaliou.
 *
 * @param {string} entityId
 * @param {string} entityType
 * @param {string} userId
 * @returns {number} nota de 0 a 5
 */
export async function fetchMyRating(entityId, entityType, userId) {
    const { data, error } = await supabase
        .from("ratings")
        .select("rating")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .eq("user_id", userId)
        .maybeSingle(); // retorna null sem erro se não encontrar

    if (error) throw error;
    return data?.rating ?? 0;
}

/**
 * Busca a média de avaliações e o total de votos de um serviço.
 *
 * @param {string} entityId
 * @param {string} entityType
 * @returns {{ average: string, count: number }}
 *   average — média formatada com 1 casa decimal, ex: "3.7"
 *   count   — total de avaliações
 */
export async function fetchRatingSummary(entityId, entityType) {
    const { data, error } = await supabase
        .from("ratings")
        .select("rating")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType);

    if (error) throw error;

    const ratings = data ?? [];
    if (!ratings.length) return { average: 0, count: 0 };

    const sum = ratings.reduce((acc, row) => acc + row.rating, 0);
    return {
        average: (sum / ratings.length).toFixed(1),
        count: ratings.length,
    };
}

/**
 * Salva ou atualiza a avaliação do usuário para um serviço.
 *
 * Usa "upsert": se já existe uma linha com esse service_id + user_id,
 * atualiza. Se não existe, insere. Perfeito para o fluxo de rating.
 *
 * @param {string} entityId
 * @param {string} entityType
 * @param {string} userId
 * @param {number} rating - nota de 1 a 5
 */
export async function saveRating(entityId, entityType, userId, rating) {
    const { error } = await supabase
        .from("ratings")
        .upsert(
            { entity_id: entityId, entity_type: entityType, user_id: userId, rating },
            { onConflict: "entity_id, entity_type, user_id" } // chave única da tabela
        );

    if (error) throw error;
}