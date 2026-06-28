// ============================================================
// lib/hooks/general.api.js
//
// Responsabilidade ÚNICA: toda comunicação com o Supabase
// relacionada à listas, dropdowns, ou qualquer dado generico.
//
// Regras deste arquivo:
//   ✅ Pode importar { supabase }
//   ❌ Nunca acessa o DOM (nada de document.querySelector)
//   ❌ Nunca renderiza HTML
//   ❌ Nunca chama window.location
// ============================================================

import { supabase } from "../../supabaseClient.js";

/**
 * Busca todas as categorias únicas de serviços ativos.
 * Usada para popular o dropdown de filtro/formulário.
 *
 * @returns {object[]} lista de categorias ordenadas por sort_order
 */
export async function fetchCategories(entityType) {

    let q = supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true);

    q = q.eq("entity_type", entityType);

    q = q.order("sort_order", { ascending: true });

    const { data, error } = await q;
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