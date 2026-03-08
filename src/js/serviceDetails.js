import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

const msg = document.querySelector("#msg");
const detailsEl = document.querySelector("#details");
const logoutLink = document.querySelector("#logoutLink");

let userIdState = null;
let serviceIdState = null;

function setMsg(t = "") {
    msg.textContent = t;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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
        .delete()
        .eq("id", serviceId);

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
            : ""
        }
    `;
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

    // Event delegation:
    // os botões são renderizados depois, então o listener fica no pai fixo.
    detailsEl.addEventListener("click", async (e) => {
        const editBtn = e.target.closest("#editServiceBtn");
        const deleteBtn = e.target.closest("#deleteServiceBtn");

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
        }
    });

    if (!serviceIdState) {
        setMsg("Missing service id in URL.");
        return;
    }

    setMsg("Loading...");

    try {
        const service = await fetchServiceById(serviceIdState);
        renderServiceDetails(service, userIdState);
        setMsg("");
    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Failed to load service.");
    }
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error.");
});