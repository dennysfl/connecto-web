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

import { escapeHTML } from "../utils/string.utils.js";
import { renderPhotosCard } from "../ui/photos-render.js";

// ─── Utilitários de rating ────────────────────────────────────

/**
 * Gera o HTML das 5 estrelas com preenchimento parcial (gradiente).
 * Reutilizável em qualquer entidade que tenha rating.
 *
 * @param {number|null} average - média de 0 a 5
 * @param {string}      size    - tamanho CSS da fonte (ex: "1rem", "2rem")
 * @returns {string} HTML string das 5 estrelas
 */
export function buildStarsHtml(average, size = "1rem") {
    const avg = average ?? 0;
    return [1, 2, 3, 4, 5]
        .map((n) => {
            const fill = Math.min(1, Math.max(0, avg - (n - 1))) * 100;
            return `<span style="
                font-size: ${size};
                background: linear-gradient(to right, #f5a623 ${fill}%, #ccc ${fill}%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                line-height: 1;
            ">&#9733;</span>`;
        })
        .join("");
}

/**
 * Gera o HTML de rating compacto (estrelas + "4.2 (10)") para usar nos cards da lista.
 * Recebe o array bruto do Supabase e calcula internamente.
 *
 * @param {Array<{rating: number}>} ratings - service.service_ratings
 * @returns {string} HTML string
 */
export function buildRatingHtml(ratingCount, ratingAverage) {
    if (!ratingCount) return `<span style="color:#aaa; font-size:0.85rem;">No ratings yet</span>`;
    return `
        <span>${buildStarsHtml(ratingAverage)}</span>
        <span style="color:#aaa; font-size:0.85rem;">
            ${ratingAverage} (${ratingCount} reviews) 
        </span>
    `;
}

// ─── Utilitários de comments  ────────────────────────────────────

/**
 * Gera o HTML de rating compacto (estrelas + "4.2 (10)") para usar nos cards da lista.
 * Recebe o array bruto do Supabase e calcula internamente.
 *
 * @param {Array<{rating: number}>} ratings - service.service_ratings
 * @returns {string} HTML string
 */
export function buildCommentHtml(commentCount) {
    if (!commentCount) {
        return `<span style="color:#aaa; font-size:0.85rem;">0 comments</span>`;
    } else if (commentCount == 1) {
        return `
            <span style="color:#aaa; font-size:0.85rem;">${commentCount} comment </span>
        `;
    } else {
        return `
            <span style="color:#aaa; font-size:0.85rem;">${commentCount} comments </span>
        `;
    }
}

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
export function renderServiceCard(service, isFav, isMine, isInactive) {
    const btnLabel = isFav ? "Unsave" : "Save";
    const ratingHtml = buildRatingHtml(service.rating_count, service.avg_rating);
    const commentHtml = buildCommentHtml(service.comment_count);

    // ⭐ NOVO
    const coverHtml = service.coverPhotoUrl
        ? `<img src="${service.coverPhotoUrl}" alt=""
                style="width:72px; height:72px; object-fit:cover; border-radius:6px; flex-shrink:0;" />`
        : "";

    return `
        <div class="card" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; gap:12px;">
                <div style="display:flex; gap:12px;">
                    ${coverHtml}
                    <div>
                        <h3 style="margin:0 0 4px 0;">
                            <a class="serviceLink"
                               href="/serviceDetails.html?id=${service.id}"
                               data-service-id="${service.id}">
                                ${escapeHTML(service.title)}
                            </a>
                        </h3>
                        <div style="margin-bottom:1px;">${ratingHtml}</div>
                        <div style="margin-bottom:10px;">🗨️ ${commentHtml}</div>
                        <div class="muted">
                            ${escapeHTML(service.subcategories?.categories?.name ?? "")}
                            · ${escapeHTML(service.subcategories?.name ?? "")}
                            <br>${escapeHTML(service.city ?? "")}
                            (${escapeHTML(service.country ?? "")})
                            ${isMine ? "· My service" : ""}
                            ${isInactive ? "· <strong>Inactive</strong>" : ""}
                        </div>
                        <p style="margin:10px 0 0 0;">
                            ${escapeHTML(service.description ?? "")}
                        </p>
                    </div>
                </div>
                <div style="min-width:110px; text-align:right;">
                    ${!isInactive ? `
                        <button class="favBtn" data-service-id="${service.id}" data-is-fav="${isFav}">
                            ${btnLabel}
                        </button>
                    ` : ""}
                    ${isInactive ? `
                        <button class="activateBtn" data-service-id="${service.id}">Activate</button>
                    ` : ""}
                </div>
            </div>
        </div>
    `;
}

// ─── Card de detalhes do serviço ──────────────────────────────

/**
 * Gera o HTML do bloco de detalhes de um serviço (serviceDetails.html).
 *
 * Botões gerados (event delegation em services-details.js):
 *   #editServiceBtn   → redireciona para serviceNew.html?id=...
 *   #deleteServiceBtn → confirma e deleta o serviço
 *   #commentServiceBtn → abre o formulário de comentário
 *
 * @param {object} service
 * @param {string} currentUserId
 * @returns {string} HTML string
 */
export function renderServiceDetails(service, currentUserId) {
    const isOwner = service.owner_id === currentUserId;

    return `
        <h2 style="margin-top:0;">${escapeHTML(service.title)}</h2>

        <div class="muted">
            ${escapeHTML(service.subcategories?.categories?.name ?? "")}
            · ${escapeHTML(service.subcategories?.name ?? "")}
            <br>${escapeHTML(service.city ?? "")}
            (${escapeHTML(service.country ?? "")})
        </div>

        <p style="margin-top:12px;">${escapeHTML(service.description ?? "")}</p>

        <p class="muted" style="margin-top:12px;">
            Status: ${service.is_active ? "Active" : "Inactive"}
        </p>

        ${isOwner
            ? `<div style="display:flex; gap:10px; margin-top:16px;">
                    <button id="editServiceBtn"   type="button">Edit</button>
                    <button id="deleteServiceBtn" type="button">Delete</button>
               </div>`
            : `<div style="display:flex; gap:10px; margin-top:16px;">
                    <button id="commentServiceBtn" type="button">Leave a Comment</button>
               </div>`
        }
    `;
}

// ─── Card de rating interativo ────────────────────────────────

/**
 * Gera o HTML da seção de rating interativo (serviceDetails.html).
 *
 * Estrelas geradas com class="star" e data-value para event delegation.
 * O orquestrador (services-details.js) é responsável pelos eventos
 * mouseover / mouseout / click nas estrelas.
 *
 * @param {object} summary     - { average, count } vindo de fetchRatingSummary
 * @param {number} myRating    - nota que o usuário já deu (0 = nenhuma)
 * @param {boolean} isOwner    - donos não podem avaliar o próprio serviço
 * @returns {string} HTML string
 */
export function renderRatingSection(summary, myRating, isOwner) {
    const starsHtml = [1, 2, 3, 4, 5]
        .map((n) => {
            const color = n <= myRating ? "#f5a623" : "#ccc";
            return `<span
                class="star"
                data-value="${n}"
                style="font-size:2rem; cursor:pointer; color:${color};"
            >&#9733;</span>`;
        })
        .join("");

    return `
        <p>Average: ${summary.average || "N/A"} (${summary.count} vote${summary.count !== 1 ? "s" : ""})</p>
        ${!isOwner
            ? `<div>${starsHtml}</div>
               <p id="ratingMsg" class="muted"></p>`
            : `<p class="muted">Owners cannot rate their own service.</p>`
        }
    `;
}

// ─── Card de comentário individual ────────────────────────────

/**
 * Gera o HTML de um único comentário.
 *
 * Botão gerado (event delegation em services-details.js):
 *   .delCommentBtn  → confirma e deleta o comentário
 *
 * @param {object} comment       - { id, user_id, created_at, comment_text, profiles }
 * @param {string} currentUserId
 * @returns {string} HTML string
 */
export function renderCommentCard(comment, currentUserId) {
    const isAuthor = comment.user_id === currentUserId;
    const name = escapeHTML(comment.profiles?.full_name ?? "Anonymous");
    const date = new Date(comment.created_at).toLocaleDateString();
    const text = escapeHTML(comment.content ?? "");

    return `
        <div style="padding:10px 0; border-bottom:1px solid #eee;">
            <div style="display:flex; justify-content:space-between;">
                <strong>${name}</strong>
                <span class="muted">${date}</span>
            </div>
            <p style="margin:6px 0 0 0;">${text}</p>
            ${isAuthor
            ? `<button class="delCommentBtn"
                           data-comment-id="${comment.id}"
                           style="margin-top:8px;">
                       Delete
                   </button>`
            : ""}
        </div>
    `;
}

/**
 * Gera o HTML da lista completa de comentários.
 * Usa renderCommentCard internamente — ponto único de mudança.
 *
 * @param {Array}  comments
 * @param {string} currentUserId
 * @returns {string} HTML string
 */
export function renderCommentsList(comments, currentUserId) {
    if (!comments.length) {
        return `<p class="muted">No comments yet.</p>`;
    }

    return comments
        .map((c) => renderCommentCard(c, currentUserId))
        .join("");
}

// ─── Card de Photos ────────────────────────────

export function renderServicePhotosCard(photos) {
    return renderPhotosCard(photos, "No photos added");
}