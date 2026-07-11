// ============================================================
// lib/api/comments.api.js
//
// Responsabilidade ÚNICA: comunicação com o Supabase para
// comentários (comments)
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM
//   ❌ Nunca renderiza HTML
// ============================================================

import { supabase } from "../../supabaseClient.js";

// ─── COMMENTS ────────────────────────────────────────────────

/**
 * Busca todos os comentários de um serviço, do mais recente ao mais antigo.
 * Inclui o nome do autor via join com a tabela "profiles".
 *
 * @param {string} entityID
 * @param {string} entityType
 * @returns {Array} lista de comentários
 */
export async function fetchComments(entityID, entityType) {
    const { data, error } = await supabase
        .from("comments")
        .select(`
            id,
            created_at,
            content,
            user_id,
            profiles (
                full_name
            )
        `)
        .eq("entity_id", entityID)
        .eq("entity_type", entityType)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

/**
 * Cria um novo comentário em um serviço.
 *
 * @param {string} entityID
 * @param {string} entityType
 * @param {string} userID
 * @param {string} commentText - texto do comentário
 * @returns {object} comentário criado
 */
export async function createComment(entityID, entityType, userID, commentText) {
    const { data, error } = await supabase
        .from("comments")
        .insert([{
            entity_id: entityID,
            entity_type: entityType,
            content: commentText,
            user_id: userID
        }])
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
        .from("comments")
        .delete()
        .eq("id", commentId);

    if (error) throw error;
}
