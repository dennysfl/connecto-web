// ============================================================
// utils/string.utils.js
// Responsabilidade: funções puras de manipulação de texto.
//
// 💡 "Função pura" = mesmo input, sempre mesmo output.
//     Não acessa DOM, não faz fetch, não tem efeito colateral.
// ============================================================

// ─── Segurança ───────────────────────────────────────────────

/**
 * Escapa caracteres HTML para evitar XSS.
 * @param {string} str - texto que veio do usuário ou da API
 * @returns {string} texto seguro para inserir no DOM
 *
 * ⚠️ Sempre use isso antes de fazer innerHTML com dados externos!
 */
export function escapeHTML(str) {
    // Cria um elemento temporário só para usar o escape nativo do browser
    const div = document.createElement("div");
    div.textContent = str; // textContent escapa automaticamente
    return div.innerHTML;  // retorna já escapado
}

// ─── Formatação de texto ─────────────────────────────────────

/**
 * Trunca um texto longo e adiciona "..." no final.
 * @param {string} str
 * @param {number} maxLength - limite de caracteres
 * @returns {string}
 *
 * Exemplo: truncate("Olá mundo cruel", 7) → "Olá mun..."
 */
export function truncate(str, maxLength) {
    if (str.length <= maxLength) return str; // já é curto, não faz nada
    return str.slice(0, maxLength) + "...";
}

/**
 * Capitaliza a primeira letra de cada palavra.
 * Exemplo: "corte de cabelo" → "Corte De Cabelo"
 */
export function capitalize(str) {
    return str
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}