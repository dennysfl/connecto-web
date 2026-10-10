// ============================================================
// communities/communities-render.js
//
// Responsabilidade ÚNICA: gerar HTML dos cards do domínio "communities".
//
// Regras deste arquivo:
//   ✅ Recebe dados como parâmetros e retorna HTML string
//   ✅ Pode importar utilitários puros (escapeHTML, buildStarsHtml)
//   ❌ Nunca acessa o DOM (nenhum document.querySelector)
//   ❌ Nunca faz fetch ou acessa o Supabase
//   ❌ Nunca manipula estado ou adiciona event listeners
//
// Funções exportadas:
//   renderMyCommunities(communities)
//   renderCommunityCard(community)
// ============================================================

import { escapeHTML } from "../utils/string.utils.js";
import { renderPhotosCard } from "../ui/photos-render.js";

export function renderMyCommunities(communities) {
    const headerHtml = '<br><br><b> My Communities</b><br>';

    if (!communities.length) {

        return headerHtml + `
             <div class="card" style="margin-bottom:12px;">
                 <div style="display:flex; gap:12px;">
                     <p class="muted">You aren't part of any community yet.<br>
                     Select your community below!</p>
                 </div>
             </div>`;
    }

    const html = communities.map((c) => renderMyCommunityCard(c)).join("");
    return headerHtml + html; // ✅ idem
}

export function renderMyCommunityCard(community) {
    const isFav = community.isPrimary ? "true" : "false"; // ✅

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
                <div style="min-width:110px; text-align:right;">
                    ${!community.isPrimary ? `
                        <button class="favBtn" data-community-id="${community.id}" data-is-fav="${isFav}">
                            flag favorite
                        </button>
                    ` : "favorite"}
                        <button class="leaveBtn" data-community-id="${community.id}">
                            Leave
                        </button>
                </div>
            </div>
        </div>
    `;

    return communityHtml;
}

export function renderAvailableCommunities(communities) {
    const headerHtml = '<br><br><b>Available Communities</b><br>'; // declarada primeiro, usável em qualquer branch

    if (!communities.length) {
        return headerHtml + `
             <div class="card" style="margin-bottom:12px;">
                 <div style="display:flex; gap:12px;">
                     <p class="muted">You are already a member of all available communities!<br>
                     <a href="/communityFind.html">Click here if you are looking for a specific community!</a></p>
                 </div>
             </div>`;
    }

    const html = communities.map((c) => renderAvailableCommunityCard(c)).join("");
    return headerHtml + html;
}

export function renderAvailableCommunityCard(community) {
    return `
        <div class="card" style="margin-bottom:12px;">
            <div style="display:flex; gap:12px;">
                <div>
                    <h3 style="margin:0 0 4px 0;">
                        <a href="/communityDetails.html?id=${community.id}">
                            ${escapeHTML(community.name)}
                        </a>
                    </h3>
                    <p style="margin:10px 0 0 0;">
                        ${escapeHTML(community.description ?? "")}
                    </p>
                </div>
                <div style="min-width:110px; text-align:right;">
                    <button class="joinBtn" data-community-id="${community.id}">
                        Join
                    </button>
                    <button class="viewBtn" data-community-id="${community.id}">
                        View
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Renderiza uma seção horizontal genérica — reaproveitada por
 * Services, Events e (futuramente) News.
 *
 * @param {string} title - título da seção, ex: "Services"
 * @param {string} seeAllHref - link pra página completa filtrada por comunidade
 * @param {Array} items - itens já buscados do banco
 * @param {(item: object) => string} renderItem - função que sabe desenhar 1 item deste domínio
 */
export function renderHorizontalSection(title, seeAllHref, items, renderItem) {
    const header = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <b>${title}</b>
            <a href="${seeAllHref}">see all</a>
        </div>
    `;

    if (!items.length) {
        return header + `<p class="muted">Nothing here yet.</p>`;
    }

    return header + `
        <div class="horizontalCard">
            ${items.map(renderItem).join("")}
        </div>
    `;
}

/** Desenha 1 card de serviço dentro da seção horizontal. */
export function renderServiceItem(service) {
    return `
        <a class="item" href="/serviceDetails.html?id=${service.id}">
            <strong>${escapeHTML(service.title)}</strong>
            ${service.price != null ? `<p>£${service.price}</p>` : ""}
        </a>
    `;
}

/** Desenha 1 card de evento dentro da seção horizontal. */
export function renderEventItem(event) {
    const when = event.starts_at
        ? new Date(event.starts_at).toLocaleDateString()
        : "";

    return `
        <a class="item" href="/eventDetails.html?id=${event.id}">
            <strong>${escapeHTML(event.title)}</strong>
            <p>${[when, event.venue_name].filter(Boolean).join(" · ")}</p>
        </a>
    `;
}