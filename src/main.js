// ============================================================
// main.js
// Ponto de entrada da aplicação.
// Aqui você IMPORTA as funções e CONECTA as peças.
// Não tem lógica de negócio nem fetch direto aqui.
// ============================================================

// ✅ Import nomeado: só pega o que precisa
import { fetchServices, deleteService } from "./js/services/services.api.js";
import { fetchComments } from "./js/services/services-comments.api.js";
import { fetchRatingSummary } from "./js/services/services-ratings.api.js";

// ─── Inicializa a aplicação ──────────────────────────────────
async function init() {
    try {
        // Carrega dados em paralelo (mais rápido que um por um!)
        const [services, comments, ratings] = await Promise.all([
            fetchServices(),
            fetchComments(),
            fetchRatingSummary(),
        ]);

        console.log("Serviços:", services);
        console.log("Comentários:", comments);
        console.log("Ratings:", ratings);

        // Aqui você chamaria sua função de render da ui.js
        // renderServiceList(services);

    } catch (error) {
        // ⚠️ Erro centralizado: 1 lugar para tratar problemas de API
        console.error("Falha ao inicializar:", error.message);
    }
}

init();