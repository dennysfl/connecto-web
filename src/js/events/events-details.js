// ============================================================
// events-details.js  (eventDetails.html)
//
// Responsabilidade: orquestrar a tela de detalhes do evento,
// incluindo comentários e ratings.
// ============================================================

import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";
import { fetchEventById, deleteEvent } from "./events.api.js";
import { fetchComments, createComment, deleteComment } from "../lib/hooks/comments.api.js";
import { fetchMyRating, fetchRatingSummary, saveRating } from "../lib/hooks/ratings.api.js";
import { renderEventDetails, renderCommentsList, renderRatingSection } from "./events-render.js";

// ─── Elementos da página ─────────────────────────────────────
const msg = document.querySelector("#msg");
const msgCom = document.querySelector("#msgCom");
const detailsEl = document.querySelector("#details");
const addCommentsEl = document.querySelector("#addComments");
const commentsEl = document.querySelector("#comments");
const ratingEl = document.querySelector("#ratingSection");
const logoutLink = document.querySelector("#logoutLink");
const entityType = "event";

// ─── Estado local ─────────────────────────────────────────────
let userIdState = null;
let eventIdState = null;
let eventState = null;
let isCommentFormOpenState = false;
let currentRatingState = 0;
let hoverRatingState = 0;

// ─── Helpers ─────────────────────────────────────────────────
function setMsg(text = "") { msg.textContent = text; }
function setMsgCom(text = "") { msgCom.textContent = text; }

function getEventIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

// ─── Render: formulário de comentário ─────────────────────────
function renderCommentForm(event, currentUserId, isOpen) {
    const isOwner = event.owner_id === currentUserId;

    if (isOwner || !isOpen) {
        addCommentsEl.innerHTML = "";
        return;
    }

    addCommentsEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
            <form id="eventCommentForm">
                <label for="eventCommentInput">Enter comment:</label>
                <textarea id="eventCommentInput" rows="4" style="width:100%;" required></textarea>

                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button type="button" id="closeCommentBtn">Close</button>
                    <button type="submit"  id="saveCommentBtn">Save</button>
                </div>
            </form>
        </div>
    `;
}

// ─── Helpers de render ────────────────────────────────────────

function updateStarColors(activeRating) {
    document.querySelectorAll(".star").forEach((star) => {
        const val = Number(star.dataset.value);
        star.style.color = val <= activeRating ? "#f5a623" : "#ccc";
    });
}

async function reloadComments() {
    const comments = await fetchComments(eventIdState, entityType);
    commentsEl.innerHTML = renderCommentsList(comments, userIdState);
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;
    eventIdState = getEventIdFromUrl();

    if (!eventIdState) {
        setMsg("Missing event id in URL.");
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

    // ── Event delegation: detalhes do evento ──────────────────
    detailsEl.addEventListener("click", async (e) => {
        if (e.target.closest("#editEventBtn")) {
            e.preventDefault();
            window.location.replace(`/eventNew.html?id=${eventIdState}`);
            return;
        }

        if (e.target.closest("#deleteEventBtn")) {
            e.preventDefault();
            const confirmed = window.confirm("Do you really want to delete this event?");
            if (!confirmed) return;

            const deleteBtn = e.target.closest("#deleteEventBtn");
            deleteBtn.disabled = true;
            setMsg("Deleting...");

            try {
                await deleteEvent(eventIdState);
                window.location.replace("/events.html");
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Failed to delete event.");
            }
            return;
        }

        if (e.target.closest("#commentEventBtn")) {
            e.preventDefault();
            isCommentFormOpenState = true;
            renderCommentForm(eventState, userIdState, isCommentFormOpenState);
            setMsgCom("");
        }
    });

    // ── Event delegation: formulário de comentário ─────────────
    addCommentsEl.addEventListener("click", (e) => {
        if (!e.target.closest("#closeCommentBtn")) return;
        e.preventDefault();
        isCommentFormOpenState = false;
        renderCommentForm(eventState, userIdState, isCommentFormOpenState);
        setMsgCom("");
    });

    addCommentsEl.addEventListener("submit", async (e) => {
        const form = e.target.closest("#eventCommentForm");
        if (!form) return;
        e.preventDefault();
        setMsgCom("");

        const input = document.querySelector("#eventCommentInput");
        const commentText = input.value.trim();
        if (!commentText) { setMsgCom("Comment is required."); return; }

        const saveBtn = document.querySelector("#saveCommentBtn");
        saveBtn.disabled = true;

        try {
            await createComment(eventIdState, entityType, userIdState, commentText);
            input.value = "";
            isCommentFormOpenState = false;
            renderCommentForm(eventState, userIdState, isCommentFormOpenState);
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
        if (eventState.owner_id === userIdState) return;
        if (clicked <= currentRatingState) return;

        const ratingMsg = document.querySelector("#ratingMsg");

        try {
            ratingMsg.textContent = "Saving...";
            await saveRating(eventIdState, entityType, userIdState, clicked);

            currentRatingState = clicked;
            hoverRatingState = 0;

            const summary = await fetchRatingSummary(eventIdState, entityType);
            ratingEl.innerHTML = renderRatingSection(
                summary,
                currentRatingState,
                eventState.owner_id === userIdState
            );

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
        const event = await fetchEventById(eventIdState);
        eventState = event;

        detailsEl.innerHTML = renderEventDetails(eventState, userIdState);
        renderCommentForm(eventState, userIdState, isCommentFormOpenState);
        await reloadComments();

        const [myRating, summary] = await Promise.all([
            fetchMyRating(eventIdState, entityType, userIdState),
            fetchRatingSummary(eventIdState, entityType),
        ]);
        currentRatingState = myRating;
        ratingEl.innerHTML = renderRatingSection(
            summary,
            currentRatingState,
            eventState.owner_id === userIdState
        );

        setMsg("");
        setMsgCom("");
    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Failed to load event.");
    }
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error.");
});
