// ============================================================
// service-details.js  (serviceDetails.html)
//
// Responsabilidade: orquestrar a tela de detalhes do serviço,
// incluindo comentários e ratings.
//
// O que mudou em relação ao original:
//   ✅ Nenhuma função de fetch/supabase aqui
//   ✅ saveRating recebe userId como parâmetro (sem estado global na api)
//   ✅ escapeHTML vem de utils
// ============================================================

import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";
import { fetchServiceById, deleteService } from "./services.api.js";
import {
    fetchComments,
    createComment,
    deleteComment
} from "./services-comments.api.js";
import {
    fetchMyRating,
    fetchRatingSummary,
    saveRating
} from "./services-ratings.api.js";
import { escapeHTML } from "../utils/string.utils.js";

// ─── Elementos da página ─────────────────────────────────────
const msg = document.querySelector("#msg");
const msgCom = document.querySelector("#msgCom");
const detailsEl = document.querySelector("#details");
const addCommentsEl = document.querySelector("#addComments");
const commentsEl = document.querySelector("#comments");
const logoutLink = document.querySelector("#logoutLink");

// ─── Estado local ─────────────────────────────────────────────
let userIdState = null;
let serviceIdState = null;
let serviceState = null;
let isCommentFormOpenState = false;
let currentRatingState = 0;  // nota que o usuário JÁ salvou (0 = nenhuma ainda)
let hoverRatingState = 0;    // nota que o mouse está passando por cima

// ─── Helpers ─────────────────────────────────────────────────
function setMsg(text = "") { msg.textContent = text; }
function setMsgCom(text = "") { msgCom.textContent = text; }

function getServiceIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

// ─── Render: serviço ─────────────────────────────────────────
function renderServiceDetails(service, currentUserId) {
    const isOwner = service.owner_id === currentUserId;

    detailsEl.innerHTML = `
        <h2 style="margin-top:0;">${escapeHTML(service.title)}</h2>

        <div class="muted">
            ${escapeHTML(service.subcategories.categories.name ?? "")}
            · ${escapeHTML(service.subcategories.name ?? "")}
            <br>${escapeHTML(service.city ?? "")}
            (${escapeHTML(service.country ?? "")})
        </div>

        <p style="margin-top:12px;">${escapeHTML(service.description ?? "")}</p>

        <p class="muted" style="margin-top:12px;">
            Status: ${service.is_active ? "Active" : "Inactive"}
        </p>

        ${isOwner
            ? `<div style="display:flex; gap:10px; margin-top:16px;">
                    <button id="editServiceBtn" type="button">Edit</button>
                    <button id="deleteServiceBtn" type="button">Delete</button>
               </div>`
            : `<div style="display:flex; gap:10px; margin-top:16px;">
                    <button id="commentServiceBtn" type="button">Leave a Comment</button>
               </div>`
        }
    `;
}

// ─── Render: formulário de comentário ─────────────────────────
function renderCommentForm(service, currentUserId, isOpen) {
    const isOwner = service.owner_id === currentUserId;

    if (isOwner || !isOpen) {
        addCommentsEl.innerHTML = "";
        return;
    }

    addCommentsEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
            <form id="serviceCommentForm">
                <label for="serviceCommentInput">Enter comment:</label>
                <textarea id="serviceCommentInput" rows="4" style="width:100%;" required></textarea>

                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button type="button" id="closeCommentBtn">Close</button>
                    <button type="submit" id="saveCommentBtn">Save</button>
                </div>
            </form>
        </div>
    `;
}

// ─── Render: lista de comentários ─────────────────────────────
function renderComments(comments, currentUserId) {
    if (!comments.length) {
        commentsEl.innerHTML = `<p class="muted">No comments yet.</p>`;
        return;
    }

    commentsEl.innerHTML = comments
        .map((c) => {
            const isAuthor = c.user_id === currentUserId;
            const name = escapeHTML(c.profiles?.full_name ?? "Anonymous");
            const date = new Date(c.created_at).toLocaleDateString();
            const text = escapeHTML(c.comment_text ?? "");

            return `
                <div style="padding:10px 0; border-bottom:1px solid #eee;">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${name}</strong>
                        <span class="muted">${date}</span>
                    </div>
                    <p style="margin:6px 0 0 0;">${text}</p>
                    ${isAuthor
                    ? `<button class="delCommentBtn" data-comment-id="${c.id}" style="margin-top:8px;">
                               Delete
                           </button>`
                    : ""}
                </div>
            `;
        })
        .join("");
}

// ─── Render: rating ───────────────────────────────────────────
function renderRating(service, currentUserId, myRating, summary) {
    const ratingEl = document.querySelector("#ratingSection");
    const isOwner = service.owner_id === currentUserId;

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

    ratingEl.innerHTML = `
        <p>Average: ${summary.average || "N/A"} (${summary.count} vote${summary.count !== 1 ? "s" : ""})</p>
        ${!isOwner
            ? `<div>${starsHtml}</div>
               <p id="ratingMsg" class="muted"></p>`
            : `<p class="muted">Owners cannot rate their own service.</p>`
        }
    `;
}

function updateStarColors(activeRating) {
    document.querySelectorAll(".star").forEach((star) => {
        const val = Number(star.dataset.value);
        star.style.color = val <= activeRating ? "#f5a623" : "#ccc";
    });
}

// ─── Reload de comentários ────────────────────────────────────
async function reloadComments() {
    const comments = await fetchComments(serviceIdState);
    renderComments(comments, userIdState);
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;
    serviceIdState = getServiceIdFromUrl();

    if (!serviceIdState) {
        setMsg("Missing service id in URL.");
        return;
    }

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            await signOut();
            window.location.replace("/login.html");
        } catch (err) {
            console.error(err);
            setMsg(err?.message ?? "Logout failed.");
        }
    });

    // ── Event delegation: detalhes do serviço ──────────────────
    detailsEl.addEventListener("click", async (e) => {
        if (e.target.closest("#editServiceBtn")) {
            e.preventDefault();
            window.location.replace(`/serviceNew.html?id=${serviceIdState}`);
            return;
        }

        if (e.target.closest("#deleteServiceBtn")) {
            e.preventDefault();
            const confirmed = window.confirm("Do you really want to delete this service?");
            if (!confirmed) return;

            const deleteBtn = e.target.closest("#deleteServiceBtn");
            deleteBtn.disabled = true;
            setMsg("Deleting...");

            try {
                await deleteService(serviceIdState);
                window.location.replace("/services.html");
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Failed to delete service.");
            }
            return;
        }

        if (e.target.closest("#commentServiceBtn")) {
            e.preventDefault();
            isCommentFormOpenState = true;
            renderCommentForm(serviceState, userIdState, isCommentFormOpenState);
            setMsgCom("");
        }
    });

    // ── Event delegation: formulário de comentário ─────────────
    addCommentsEl.addEventListener("click", (e) => {
        if (!e.target.closest("#closeCommentBtn")) return;
        e.preventDefault();
        isCommentFormOpenState = false;
        renderCommentForm(serviceState, userIdState, isCommentFormOpenState);
        setMsgCom("");
    });

    addCommentsEl.addEventListener("submit", async (e) => {
        const form = e.target.closest("#serviceCommentForm");
        if (!form) return;
        e.preventDefault();
        setMsgCom("");

        const input = document.querySelector("#serviceCommentInput");
        const commentText = input.value.trim();

        if (!commentText) { setMsgCom("Comment is required."); return; }

        const saveBtn = document.querySelector("#saveCommentBtn");
        saveBtn.disabled = true;

        try {
            await createComment(serviceIdState, commentText);
            input.value = "";
            isCommentFormOpenState = false;
            renderCommentForm(serviceState, userIdState, isCommentFormOpenState);
            await reloadComments();
            setMsgCom("Comment saved successfully.");
        } catch (err) {
            console.error(err);
            setMsgCom(err?.message ?? "Failed to save comment.");
        } finally {
            saveBtn.disabled = false;
        }
    });

    // ── Event delegation: excluir comentário ───────────────────
    commentsEl.addEventListener("click", async (e) => {
        const delBtn = e.target.closest(".delCommentBtn");
        if (!delBtn) return;
        e.preventDefault();

        const confirmed = window.confirm("Do you really want to delete this comment?");
        if (!confirmed) return;

        const commentId = delBtn.dataset.commentId;

        try {
            delBtn.disabled = true;
            setMsgCom("Deleting comment...");
            await deleteComment(commentId);
            await reloadComments();
            setMsgCom("Comment deleted successfully.");
        } catch (err) {
            console.error(err);
            setMsgCom(err?.message ?? "Failed to delete comment.");
            delBtn.disabled = false;
        }
    });

    // ── Eventos de rating ──────────────────────────────────────
    const ratingEl = document.querySelector("#ratingSection");

    ratingEl.addEventListener("mouseover", (e) => {
        const star = e.target.closest(".star");
        if (!star) return;
        const hovered = Number(star.dataset.value);
        if (hovered > currentRatingState) {
            hoverRatingState = hovered;
            updateStarColors(hoverRatingState);
        }
    });

    ratingEl.addEventListener("mouseout", (e) => {
        if (!e.target.closest(".star")) return;
        hoverRatingState = 0;
        updateStarColors(currentRatingState);
    });

    ratingEl.addEventListener("click", async (e) => {
        const star = e.target.closest(".star");
        if (!star) return;

        const clicked = Number(star.dataset.value);
        if (serviceState.owner_id === userIdState) return;
        if (clicked <= currentRatingState) return;

        const ratingMsg = document.querySelector("#ratingMsg");

        try {
            ratingMsg.textContent = "Saving...";

            // userId agora é passado como argumento — api.js não depende de estado global
            await saveRating(serviceIdState, userIdState, clicked);

            currentRatingState = clicked;
            hoverRatingState = 0;

            const summary = await fetchRatingSummary(serviceIdState);
            renderRating(serviceState, userIdState, currentRatingState, summary);

            const newMsg = document.querySelector("#ratingMsg");
            if (newMsg) newMsg.textContent = "Rating saved!";
        } catch (err) {
            console.error(err);
            if (ratingMsg) ratingMsg.textContent = err?.message ?? "Failed to save rating.";
        }
    });

    // ── Carregamento inicial ───────────────────────────────────
    setMsg("Loading...");

    try {
        const service = await fetchServiceById(serviceIdState);
        serviceState = service;

        renderServiceDetails(serviceState, userIdState);
        renderCommentForm(serviceState, userIdState, isCommentFormOpenState);
        await reloadComments();

        const [myRating, summary] = await Promise.all([
            fetchMyRating(serviceIdState, userIdState),
            fetchRatingSummary(serviceIdState),
        ]);
        currentRatingState = myRating;
        renderRating(serviceState, userIdState, currentRatingState, summary);

        setMsg("");
        setMsgCom("");
    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Failed to load service.");
    }
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error.");
});