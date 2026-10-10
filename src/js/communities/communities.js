import { supabase } from "../supabaseClient.js";
import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";
import {
    fetchCommunityDetails,
    fetchCommunityServices,
    fetchCommunityEvents
} from "./communities.api.js";
import {
    renderHorizontalSection,
    renderServiceItem,
    renderEventItem
} from "./communities-render.js";

const msg = document.querySelector("#msg");
const logoutLink = document.querySelector("#logoutLink");
const communityServicesEl = document.querySelector("#communityServices");
const communityEventsEl = document.querySelector("#communityEvents");
const communityNewsEl = document.querySelector("#communityNews");

let communityId = null;

function setMsg(text = "") { msg.textContent = text; }

async function loadProfile(userId) {
    const { data, error } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId)
        .single();

    if (error) throw error;
    return data;
}

// ✏️ renomeado — antes era getEventIdFromUrl(), sobra do módulo de eventos
function getCommunityIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    try {
        const profile = await loadProfile(session.user.id);

        communityId = getCommunityIdFromUrl();
        if (!communityId) {
            setMsg("Missing community id in URL.");
            return;
        }

        document.querySelector("#fullName").textContent = profile.full_name ?? session.user.email;
        document.querySelector("#userName").textContent = '@' + (profile.username ?? session.user.email);

        setMsg("Loading...");

        // 3 buscas em paralelo — community.data é { data, count },
        // já services/events retornam array puro direto (ver comentário no .api.js)
        const [community, services, events] = await Promise.all([
            fetchCommunityDetails(communityId),
            fetchCommunityServices(communityId),
            fetchCommunityEvents(communityId)
        ]);

        const communityData = community.data[0]; // .single() não foi usado na query, então vem como array

        document.querySelector("#communityName").textContent = communityData?.name ?? "Community Details";
        document.querySelector("#communityDescription").textContent = communityData?.description ?? "No description available.";

        // 👇 ESTE ERA O PASSO QUE FALTAVA: escrever os dados buscados na tela
        communityServicesEl.innerHTML = renderHorizontalSection(
            "Services",
            `/services.html?community=${communityId}`,
            services,
            renderServiceItem
        );

        communityEventsEl.innerHTML = renderHorizontalSection(
            "Events",
            `/events.html?community=${communityId}`,
            events,
            renderEventItem
        );

        // News ainda não existe como tabela — deixa um placeholder por enquanto
        communityNewsEl.innerHTML = `<p class="muted">Coming soon.</p>`;

        setMsg("");
    }
    catch (err) {
        console.error("Profile load error:", err);
        setMsg("Erro ao carregar comunidade.");
    }

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            await signOut();
            window.location.replace("/login.html");
        } catch (err) {
            console.error("Logout error:", err);
        }
    });
}

init();