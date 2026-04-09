// ============================================================
// services/comments.api.js
//
// Responsabilidade ÚNICA: comunicação com o Supabase para
// comentários (service_comments)
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM
//   ❌ Nunca renderiza HTML
// ============================================================

import { supabase } from "../supabaseClient.js";

// ─── COMMENTS ────────────────────────────────────────────────

/**
 * Busca todos os comentários de um serviço, do mais recente ao mais antigo.
 * Inclui o nome do autor via join com a tabela "profiles".
 *
 * @param {string} serviceId
 * @returns {Array} lista de comentários
 */
export async function fetchComments(serviceId) {
    const { data, error } = await supabase
        .from("service_comments")
        .select(`
            id,
            created_at,
            comment_text,
            user_id,
            profiles (
                full_name
            )
        `)
        .eq("service_id", serviceId)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

/**
 * Cria um novo comentário em um serviço.
 *
 * @param {string} serviceId
 * @param {string} commentText - texto do comentário
 * @returns {object} comentário criado
 */
export async function createComment(serviceId, commentText) {
    const { data, error } = await supabase
        .from("service_comments")
        .insert([{ service_id: serviceId, comment_text: commentText }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Remove um comentário pelo ID.
 * A permissão real deve ser garantida por RLS no Supabase.
 *
 * @param {string} commentId
 */
export async function deleteComment(commentId) {
    const { error } = await supabase
        .from("service_comments")
        .delete()
        .eq("id", commentId);

    if (error) throw error;
}
