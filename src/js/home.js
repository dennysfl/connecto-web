import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";
import { fetchCoverPhotos } from "./lib/api/photos.api.js";
import { renderMyCommunities, renderAvailableCommunities } from "./communities/communities-render.js"
import { fetchMyCommunity, fetchAvailableCommunities, joinCommunity, leaveCommunity } from "./communities/communities.api.js"
import { setPrimaryCommunity } from "./lib/api/favorites.api.js";

const msg = document.querySelector("#msg");
const logoutLink = document.querySelector("#logoutLink");
const communityList = document.querySelector("#communityList");
const communityAllList = document.querySelector("#communityAllList");

let userIdState = null;

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

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            await signOut();
            window.location.replace("/login.html");
        } catch (err) {
            console.error("Logout error:", err);
        }
    });

    try {
        const profile = await loadProfile(session.user.id);

        document.querySelector("#fullName").textContent = profile.full_name ?? session.user.email;
        document.querySelector("#userName").textContent = '@' + (profile.username ?? session.user.email);

        setMsg("Loading...");

        //  2 buscas independentes disparadas em paralelo
        const [result, allResult] = await Promise.all([
            fetchMyCommunity(session.user.id),
            fetchAvailableCommunities(session.user.id),
        ]);

        const showCommunities = result.data;
        const showAllCommunities = allResult.data;

        communityList.addEventListener("click", async (e) => {

            // FAVORITE COMMUNITY
            const favBtn = e.target.closest(".favBtn");

            if (favBtn) {
                const communityId = favBtn.dataset.communityId;

                favBtn.disabled = true;
                setMsg("");

                try {
                    await setPrimaryCommunity(userIdState, communityId);

                    const result = await fetchMyCommunity(userIdState);
                    communityList.innerHTML = renderMyCommunities(result.data);
                } catch (err) {
                    console.error(err);
                    setMsg(err?.message ?? "Action failed");
                } finally {
                    favBtn.disabled = false;
                }
            }

            // LEAVE COMMUNITY
            const leaveBtn = e.target.closest(".leaveBtn");
            if (leaveBtn) {
                const communityId = leaveBtn.dataset.communityId;

                leaveBtn.disabled = true;
                setMsg("");

                try {
                    await leaveCommunity(userIdState, communityId);

                    // saiu de "minhas" e volta a aparecer em "disponíveis"
                    const [myResult, availableResult] = await Promise.all([
                        fetchMyCommunity(userIdState),
                        fetchAvailableCommunities(userIdState),
                    ]);

                    communityList.innerHTML = renderMyCommunities(myResult.data);
                    communityAllList.innerHTML = renderAvailableCommunities(availableResult.data);

                } catch (err) {
                    console.error(err);
                    setMsg(err?.message ?? "Action failed");
                } finally {
                    leaveBtn.disabled = false;
                }
            }

        });

        communityList.innerHTML = renderMyCommunities(showCommunities);
        communityAllList.innerHTML = renderAvailableCommunities(showAllCommunities);

        // ── Ações na lista de comunidades disponíveis ────────────────
        communityAllList.addEventListener("click", async (e) => {

            // JOIN COMMUNITY
            const joinBtn = e.target.closest(".joinBtn");
            if (joinBtn) {
                const communityId = joinBtn.dataset.communityId;

                joinBtn.disabled = true;
                setMsg("");

                try {
                    await joinCommunity(userIdState, communityId);

                    // a comunidade migrou de "disponíveis" pra "minhas" —
                    // então as DUAS listas precisam ser re-buscadas e re-renderizadas
                    const [myResult, availableResult] = await Promise.all([
                        fetchMyCommunity(userIdState),
                        fetchAvailableCommunities(userIdState),
                    ]);

                    communityList.innerHTML = renderMyCommunities(myResult.data);
                    communityAllList.innerHTML = renderAvailableCommunities(availableResult.data);

                } catch (err) {
                    console.error(err);
                    setMsg(err?.message ?? "Action failed");
                } finally {
                    joinBtn.disabled = false; // inofensivo se o botão já não existir mais no DOM
                }
            }

            // VIEW COMMUNITY
            const viewBtn = e.target.closest(".viewBtn");
            if (viewBtn) {
                const communityId = viewBtn.dataset.communityId;

                viewBtn.disabled = true;
                setMsg("");

                try {

                    window.location.href = `/communityDetails.html?id=${communityId}`;

                } catch (err) {
                    console.error(err);
                    setMsg(err?.message ?? "Action failed");
                } finally {
                    viewBtn.disabled = false; // inofensivo se o botão já não existir mais no DOM
                }
            }

        });

        setMsg("");
    }
    catch (err) {
        console.error("Profile load error:", err);
        document.querySelector("#userName").textContent = session.user.email;
        setMsg("Erro ao carregar comunidades.");
    }
}

init();