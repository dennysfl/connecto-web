// ============================================================
// services/services-render.js
//
// Responsabilidade ÚNICA: gerar HTML dos cards do domínio "services".
//
// Regras deste arquivo:
//   ✅ Recebe dados como parâmetros e retorna HTML string
//   ✅ Pode importar utilitários puros (escapeHTML, buildStarsHtml)
//   ❌ Nunca acessa o DOM (nenhum document.querySelector)
//   ❌ Nunca faz fetch ou acessa o Supabase
//   ❌ Nunca manipula estado ou adiciona event listeners
//
// Funções exportadas:
//   renderServiceCard(service, isFav, isMine, isInactive)
//   renderServiceDetails(service, currentUserId)
//   renderCommentCard(comment, currentUserId)
//   renderCommentsList(comments, currentUserId)
//   renderRatingSection(summary, myRating, isOwner)
//   buildStarsHtml(average, size)          ← utilitário compartilhável
//   buildRatingHtml(ratings)               ← utilitário compartilhável
// ============================================================

import { escapeHTML } from "./utils/string.utils.js";
import { renderPhotosCard } from "./ui/photos-render.js"


// ─── Card da lista de serviços ────────────────────────────────

/**
 * Gera o HTML de um card de serviço para a lista (services.html).
 *
 * Botões gerados (usam data-attributes para event delegation em services.js):
 *   .serviceLink   → clique salva estado antes de navegar
 *   .favBtn        → salvar / remover favorito
 *   .activateBtn   → reativar serviço inativo
 *
 * @param {object}  service
 * @param {boolean} isFav      - o usuário salvou este serviço
 * @param {boolean} isMine     - o usuário é dono deste serviço
 * @param {boolean} isInactive - o serviço está inativo
 * @returns {string} HTML string do card
 */
export function renderCommunityCard(community) {

    const coverHtml = community.coverPhotoUrl
        ? `<img src="${community.coverPhotoUrl}" alt=""
                style="width:72px; height:72px; object-fit:cover; border-radius:6px; flex-shrink:0;" />`
        : "";

    const communityHtml = `
        <div class="card" style="margin-bottom:12px;">
            <div style="display:flex; gap:12px;">
                ${coverHtml}
                <div>
                    <h3 style="margin:0 0 4px 0;">
                        <a class="communityLink"
                           href="/communityDetails.html?id=${community.id}"
                           data-community-id="${community.id}">
                            ${escapeHTML(community.name)}
                        </a>
                    </h3>
                    <p style="margin:10px 0 0 0;">
                        ${escapeHTML(community.description ?? "")}
                    </p>
                </div>
            </div>
        </div>
    `;

    return communityHtml;
}

// ─── Card de Photos ────────────────────────────

export function renderCommunityPhotosCard(photos) {
    return renderPhotosCard(photos, "No photos added");
}