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
let currentRatingState = 0;             // nota que o usuário JÁ salvou (0 = nenhuma ainda)
let hoverRatingState = 0;               // nota que o mouse está passando por cima

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

/* ------------------------------------------------------------------------------------------------------------------------
    SERVICES
-------------------------------------------------------------------------------------------------------------------------- */
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

/* ------------------------------------------------------------------------------------------------------------------------
    COMMENTS
-------------------------------------------------------------------------------------------------------------------------- */
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

// NOVO: função de exclusão de comentário
async function deleteComment(commentId) {
    const { error } = await supabase
        .from("service_comments")
        .delete()
        .eq("id", commentId);

    if (error) throw error;
}

/* ------------------------------------------------------------------------------------------------------------------------
    RATING 
-------------------------------------------------------------------------------------------------------------------------- */
async function fetchMyRating(serviceId) {
    const { data, error } = await supabase
        .from("service_ratings")
        .select("rating")
        .eq("service_id", serviceId)
        .eq("user_id", userIdState)
        .maybeSingle();  // retorna null sem erro se não encontrar

    if (error) throw error;
    return data?.rating ?? 0;
}

// Busca a média de avaliações e o total de votos do serviço.
async function fetchRatingSummary(serviceId) {
    const { data, error } = await supabase
        .from("service_ratings")
        .select("rating")
        .eq("service_id", serviceId);

    if (error) throw error;

    const ratings = data ?? [];
    if (!ratings.length) return { average: 0, count: 0 };

    const sum = ratings.reduce((acc, row) => acc + row.rating, 0);
    return {
        average: (sum / ratings.length).toFixed(1),  // ex: "3.7"
        count: ratings.length,
    };
}

// Salva ou atualiza a avaliação do usuário.
// Usa "upsert": se já existe uma linha com esse service_id + user_id,
// ele ATUALIZA. Se não existe, ele INSERE. Perfeito para o nosso caso.
async function saveRating(serviceId, rating) {
    const { error } = await supabase
        .from("service_ratings")
        .upsert(
            {
                service_id: serviceId,
                user_id: userIdState,
                rating: rating,
            },
            {
                onConflict: "service_id,user_id",  // chave única da tabela
            }
        );

    if (error) throw error;
}

/* ------------------------------------------------------------------------------------------------------------------------
    UI
-------------------------------------------------------------------------------------------------------------------------- */
// SERVICES ------------------------------------------------------------------------------------------------------------------------
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

// COMMENTS ------------------------------------------------------------------------------------------------------------------------
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
// --------------------------------------------------------------------------------------------------------------------------------

/* RATINGS ------------------------------------------------------------------------------------------------------------------------
Desenha o bloco de avaliação completo.
 - service: o objeto do serviço (para saber se o usuário é o dono)
 - currentUserId: o id do usuário logado
 - myRating: nota já salva pelo usuário (0 se nenhuma)
 - summary: { average, count } com a média geral do serviço   */
function renderRating(service, currentUserId, myRating, summary) {
    const ratingEl = document.querySelector("#ratingSection");
    const isOwner = service.owner_id === currentUserId;

    // Monta a linha de média sempre visível (ex: "★ 3.7 (5 avaliações)")
    const summaryHtml = summary.count > 0
        ? `<p class="muted" style="margin:8px 0;">
               &#9733; ${summary.average} &mdash; ${summary.count} avaliação(ões)
           </p>`
        : `<p class="muted" style="margin:8px 0;">Nenhuma avaliação ainda.</p>`;

    // Dono não avalia o próprio serviço
    if (isOwner) {
        ratingEl.innerHTML = summaryHtml;
        return;
    }

    // Monta as 5 estrelas como spans com data-value
    // O estilo inline base deixa as estrelas grandes e com cursor de clique
    const starsHtml = [1, 2, 3, 4, 5]
        .map((n) => `
            <span
                class="star"
                data-value="${n}"
                style="
                    font-size: 2rem;
                    cursor: pointer;
                    color: ${n <= myRating ? "#f5a623" : "#ccc"};
                    transition: color 0.1s;
                "
            >&#9733;</span>
        `)
        .join("");

    const labelHtml = myRating > 0
        ? `<p class="muted" style="margin:6px 0;">Sua nota: <strong>${myRating}</strong> — clique para alterar</p>`
        : `<p class="muted" style="margin:6px 0;">Clique em uma estrela para avaliar</p>`;

    ratingEl.innerHTML = `
        ${summaryHtml}
        <div id="starsContainer" style="display:flex; gap:4px; margin:8px 0;">
            ${starsHtml}
        </div>
        ${labelHtml}
        <p id="ratingMsg" class="muted" style="margin:4px 0;"></p>
    `;
}

// Atualiza a cor das estrelas na tela sem re-renderizar tudo.
// "activeRating" é quantas estrelas devem ficar amarelas agora.
function updateStarColors(activeRating) {
    const stars = document.querySelectorAll(".star");
    stars.forEach((star) => {
        const val = Number(star.dataset.value);
        star.style.color = val <= activeRating ? "#f5a623" : "#ccc";
    });
}
// --------------------------------------------------------------------------------------------------------------------------------

// INIT ---------------------------------------------------------------------------------------------------------------------------
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

    // RATINGS ----------------------------------------------------------------------------------------------------------------------
    const ratingEl = document.querySelector("#ratingSection");

    ratingEl.addEventListener("mouseover", (e) => {
        const star = e.target.closest(".star");
        if (!star) return;

        const hovered = Number(star.dataset.value);

        // Efeito de hover só funciona em estrelas ACIMA da nota salva.
        // Se o usuário já avaliou com 4, passar o mouse no 1, 2, 3 ou 4
        // não faz nada — só acima do 4 mostra o efeito.
        if (hovered > currentRatingState) {
            hoverRatingState = hovered;
            updateStarColors(hoverRatingState);
        }
    });

    ratingEl.addEventListener("mouseout", (e) => {
        const star = e.target.closest(".star");
        if (!star) return;

        // Ao sair do hover, volta a mostrar só a nota salva
        hoverRatingState = 0;
        updateStarColors(currentRatingState);
    });

    ratingEl.addEventListener("click", async (e) => {
        const star = e.target.closest(".star");
        if (!star) return;

        const clicked = Number(star.dataset.value);

        // Dono não avalia — checagem extra no front
        if (serviceState.owner_id === userIdState) return;

        // Só permite clicar em estrelas acima da nota atual
        // (mesma regra do hover)
        if (clicked <= currentRatingState) return;

        const ratingMsg = document.querySelector("#ratingMsg");

        try {
            ratingMsg.textContent = "Salvando...";

            await saveRating(serviceIdState, clicked);

            // Atualiza o estado local com a nova nota
            currentRatingState = clicked;
            hoverRatingState = 0;

            // Recarrega a média e re-renderiza o bloco todo
            const summary = await fetchRatingSummary(serviceIdState);
            renderRating(serviceState, userIdState, currentRatingState, summary);

            // Mostra confirmação (o ratingMsg foi re-renderizado, busca de novo)
            const newMsg = document.querySelector("#ratingMsg");
            if (newMsg) newMsg.textContent = "Avaliação salva!";
        } catch (err) {
            console.error(err);
            if (ratingMsg) ratingMsg.textContent = err?.message ?? "Erro ao salvar avaliação.";
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

        // Carrega avaliação do usuário e a média geral em paralelo
        const [myRating, summary] = await Promise.all([
            fetchMyRating(serviceIdState),
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