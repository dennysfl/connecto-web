// ============================================================
// services/services-ratings.api.js
//
// Responsabilidade ÚNICA: comunicação com o Supabase para
// ratings (service_ratings).
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM
//   ❌ Nunca renderiza HTML
// ============================================================

import { supabase } from "../supabaseClient.js";

// ─── RATINGS ─────────────────────────────────────────────────
/**
 * Busca a nota que o usuário atual já deu para este serviço.
 * Retorna 0 se ainda não avaliou.
 *
 * @param {string} serviceId
 * @param {string} userId
 * @returns {number} nota de 0 a 5
 */
export async function fetchMyRating(serviceId, userId) {
    const { data, error } = await supabase
        .from("service_ratings")
        .select("rating")
        .eq("service_id", serviceId)
        .eq("user_id", userId)
        .maybeSingle(); // retorna null sem erro se não encontrar

    if (error) throw error;
    return data?.rating ?? 0;
}

/**
 * Busca a média de avaliações e o total de votos de um serviço.
 *
 * @param {string} serviceId
 * @returns {{ average: string, count: number }}
 *   average — média formatada com 1 casa decimal, ex: "3.7"
 *   count   — total de avaliações
 */
export async function fetchRatingSummary(serviceId) {
    const { data, error } = await supabase
        .from("service_ratings")
        .select("rating")
        .eq("service_id", serviceId);

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
 * @param {string} serviceId
 * @param {string} userId
 * @param {number} rating - nota de 1 a 5
 */
export async function saveRating(serviceId, userId, rating) {
    const { error } = await supabase
        .from("service_ratings")
        .upsert(
            { service_id: serviceId, user_id: userId, rating },
            { onConflict: "service_id,user_id" } // chave única da tabela
        );

    if (error) throw error;
}