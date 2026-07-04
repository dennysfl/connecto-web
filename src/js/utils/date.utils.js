// ============================================================
// utils/date.utils.js
// Responsabilidade: formatação e manipulação de datas.
// ============================================================

/**
 * Formata uma data ISO para o padrão brasileiro.
 * Exemplo: "2024-01-15T10:30:00Z" → "15/01/2024"
 */
export function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString("pt-BR");
}

/**
 * Retorna tempo relativo legível.
 * Exemplo: "há 3 minutos", "há 2 dias"
 */
export function timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);

    if (minutes < 1) return "agora mesmo";
    if (minutes < 60) return `há ${minutes} minuto${minutes > 1 ? "s" : ""}`;
    if (hours < 24) return `há ${hours} hora${hours > 1 ? "s" : ""}`;
    return `há ${days} dia${days > 1 ? "s" : ""}`;
}