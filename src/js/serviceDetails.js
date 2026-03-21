import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const msg = document.querySelector("#msg");
const msgCom = document.querySelector("#msgCom");
const detailsEl = document.querySelector("#details");
const addCommentsEl = document.querySelector("#addComments");
const commentsEl = document.querySelector("#comments");
const logoutLink = document.querySelector("#logoutLink");

let userIdState = null;
let serviceIdState = null;
let serviceState = null;
let isCommentFormOpenState = false;

function setMsg(text = "") {
    msg.textContent = text;
}

function setMsgCom(text = "") {
    msgCom.textContent = text;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getStatusToChange(isActive) {
    return {
        is_active: isActive,
    };
}

function getServiceIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

async function fetchServiceById(id) {
    const { data, error } = await supabase
        .from("services")
        .select("id,title,description,category,city,country,created_at,owner_id,is_active")
        .eq("id", id)
        .single();

    if (error) throw error;
    return data;
}

async function deleteService(serviceId) {
    const { error } = await supabase
        .from("services")
        .update(getStatusToChange(false))
        .eq("id", serviceId)
        .select()
        .single();

    if (error) throw error;
}

async function fetchComments(serviceId) {
    const { data, error } = await supabase
        .from("service_comments")
        .select(`
            id,
            created_at,
            comment_text,
            user_id,
            profiles (
                full_name
            )
        `)
        .eq("service_id", serviceId)
        //.eq("is_active", true)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

async function createComment(serviceId, commentText) {
    const { data, error } = await supabase
        .from("service_comments")
        .insert([
            {
                service_id: serviceId,
                comment_text: commentText,
            },
        ])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ✅ NOVO: função de exclusão de comentário
async function deleteComment(commentId) {
    const { error } = await supabase
        .from("service_comments")
        .delete()
        .eq("id", commentId);

    if (error) throw error;
}

function renderServiceDetails(service, currentUserId) {
    const isOwner = service.owner_id === currentUserId;

    detailsEl.innerHTML = `
        <h2 style="margin-top:0;">${escapeHtml(service.title)}</h2>

        <div class="muted">
            ${escapeHtml(service.category)}
            · ${escapeHtml(service.city ?? "")}
            ${escapeHtml(service.country ?? "")}
        </div>

        <p style="margin-top:12px;">
            ${escapeHtml(service.description ?? "")}
        </p>

        <p class="muted" style="margin-top:12px;">
            Status: ${service.is_active ? "Active" : "Inactive"}
        </p>
        
        ${isOwner
            ? `
                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button id="editServiceBtn" type="button">Edit</button>
                    <button id="deleteServiceBtn" type="button">Delete</button>
                </div>
                `
            : `
                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button id="commentServiceBtn" type="button">Leave a Comment</button>
                </div>
                `
        }
    `;
}

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
                <textarea
                    id="serviceCommentInput"
                    rows="4"
                    style="width:100%;"
                    required
                ></textarea>

                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button type="button" id="closeCommentBtn">Close</button>
                    <button type="submit" id="saveCommentBtn">Save</button>
                </div>
            </form>
        </div>
    `;
}

function renderComments(comments) {
    if (!comments.length) {
        commentsEl.innerHTML = `<p class="muted">No comments yet.</p>`;
        return;
    }

    commentsEl.innerHTML = comments
        .map((comment) => {
            const isOwnComment = comment.user_id === userIdState;
            const authorName = comment.profiles?.full_name ?? "User";

            return `
                <div style="padding:10px 0; border-bottom:1px solid #ddd;">
                    <div class="muted" style="margin-bottom:6px;">
                        <b>${escapeHtml(authorName)} · ${new Date(comment.created_at).toLocaleString()}</b>
                    </div>

                    <div>${escapeHtml(comment.comment_text)}</div>

                    ${isOwnComment
                    // ✅ data-comment-id guarda o ID para o event listener recuperar
                    ? `<div style="text-align:right; margin-top:8px;">
                               <button
                                   type="button"
                                   class="delCommentBtn"
                                   data-comment-id="${escapeHtml(comment.id)}">
                               Delete</button>
                           </div>`
                    : ""
                }
                </div>
            `;
        })
        .join("");
}

async function reloadComments() {
    const comments = await fetchComments(serviceIdState);
    renderComments(comments);
}

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;
    serviceIdState = getServiceIdFromUrl();

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

    // Event delegation — detalhes do serviço
    detailsEl.addEventListener("click", async (e) => {
        const editBtn = e.target.closest("#editServiceBtn");
        const deleteBtn = e.target.closest("#deleteServiceBtn");
        const commentBtn = e.target.closest("#commentServiceBtn");

        if (editBtn) {
            e.preventDefault();
            window.location.replace(`/serviceNew.html?id=${serviceIdState}`);
            return;
        }

        if (deleteBtn) {
            e.preventDefault();

            const confirmed = window.confirm("Do you really want to delete this service?");
            if (!confirmed) return;

            try {
                deleteBtn.disabled = true;
                setMsg("Deleting...");

                await deleteService(serviceIdState);

                window.location.replace("/services.html");
            } catch (err) {
                console.error(err);
                setMsg(err?.message ?? "Failed to delete service.");
            }
            return;
        }

        if (commentBtn) {
            e.preventDefault();
            isCommentFormOpenState = true;
            renderCommentForm(serviceState, userIdState, isCommentFormOpenState);
            setMsgCom("");
        }
    });

    // Event delegation — formulário de comentário
    addCommentsEl.addEventListener("click", (e) => {
        const closeBtn = e.target.closest("#closeCommentBtn");
        if (!closeBtn) return;

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

        if (!commentText) {
            setMsgCom("Comment is required.");
            return;
        }

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

    // ✅ NOVO: event delegation — exclusão de comentário
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

    if (!serviceIdState) {
        setMsg("Missing service id in URL.");
        return;
    }

    setMsg("Loading...");

    try {
        const service = await fetchServiceById(serviceIdState);
        serviceState = service;

        renderServiceDetails(serviceState, userIdState);
        renderCommentForm(serviceState, userIdState, isCommentFormOpenState);
        await reloadComments();

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