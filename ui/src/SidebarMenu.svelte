<script lang="ts">
    import { showMenuStore } from "./UiStateStore";
    import CategoryReportsAdmin from "./CategoryReportsAdmin.svelte";
    import ProfileEditor from "./ProfileEditor.svelte";
    import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";
    import { X } from "lucide-svelte";
    import { fade, fly } from "svelte/transition";

    export let store: any;
    export let myAgentPubKeyB64: string | undefined;
    export let avatarLoaded: boolean;

    let showCategoryAdmin = false;
    let showProfileEditor = false;
    let profileEditorComponent;

    function closeMenu() {
        $showMenuStore = false;
    }

    function handleProfileUpdated(event) {
        console.log("Profile updated event:", event);
    }
</script>

{#if $showMenuStore}
    <!-- Overlay -->
    <div
        class="overlay"
        on:click={closeMenu}
        transition:fade={{ duration: 200 }}
    />

    <!-- Sidebar Panel -->
    <div class="sidebar-panel" transition:fly={{ x: -320, duration: 300 }}>
        <div class="sidebar-header">
            <button class="close-button" on:click={closeMenu}>
                <X size={24} color="#343538" />
            </button>
        </div>

        <div class="sidebar-content">
            <!-- Profile Section -->
            {#if avatarLoaded && myAgentPubKeyB64}
                <div class="profile-section">
                    <div
                        class="avatar-container"
                        on:click={() => {
                            showProfileEditor = true;
                            if (!profileEditorComponent) return;
                            profileEditorComponent.open();
                        }}
                        title="Edit Your Profile"
                    >
                        <agent-avatar
                            size="72"
                            agent-pub-key={myAgentPubKeyB64}
                            disable-tooltip={true}
                            disable-copy={true}
                        ></agent-avatar>
                    </div>
                    <div class="profile-text">Click to edit profile</div>
                </div>
            {/if}

            <!-- Admin Section -->
            <div class="menu-section">
                <h3 class="section-title">Admin Tools</h3>

                <!-- Data controls -->
                <button
                    class="menu-button"
                    on:click={() => store.productStore?.fetchAllProducts()}
                >
                    Fetch API
                </button>

                <button
                    class="menu-button"
                    on:click={() => store.productStore?.loadFromSavedData()}
                >
                    Load Saved Data
                </button>

                <button
                    class="menu-button admin-btn"
                    on:click={() => {
                        showCategoryAdmin = true;
                        closeMenu();
                    }}
                >
                    <span>🏷️</span> Category Admin
                </button>
            </div>

            <!-- Support Section -->
            <div class="menu-section">
                <h3 class="section-title">Support</h3>

                <a
                    href="https://github.com/bur1dev/summon/issues"
                    class="menu-button"
                    target="_blank"
                    rel="noopener noreferrer"
                    on:click={closeMenu}
                >
                    <span>🐞</span> Report a Bug
                </a>
            </div>
        </div>
    </div>
{/if}

{#if showCategoryAdmin}
    <div class="admin-overlay">
        <CategoryReportsAdmin
            {store}
            onClose={() => (showCategoryAdmin = false)}
        />
    </div>
{/if}

<!-- Keep the ProfileEditor simple -->
{#if showProfileEditor || true}
    <ProfileEditor
        bind:this={profileEditorComponent}
        on:profile-updated={handleProfileUpdated}
    />
{/if}

<style>
    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1999;
    }

    .sidebar-panel {
        position: fixed;
        top: 0;
        left: 0;
        width: 320px;
        height: 100vh;
        background: white;
        box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
        z-index: 2000;
        display: flex;
        flex-direction: column;
    }

    .sidebar-header {
        display: flex;
        justify-content: flex-end;
        padding: 12px 16px;
        border-bottom: 1px solid #e0e0e0;
    }

    .close-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 8px;
        transition: background-color 0.2s;
    }

    .close-button:hover {
        background-color: #f5f5f5;
    }

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
    }

    .profile-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px 0;
        margin-bottom: 24px;
        border-bottom: 1px solid #e0e0e0;
    }

    .avatar-container {
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid #e0e0e0;
        cursor: pointer;
        width: 76px;
        height: 76px;
        transition:
            transform 0.2s,
            border-color 0.2s;
        margin-bottom: 12px;
    }

    .avatar-container:hover {
        border-color: none;
        transform: scale(1.05);
    }

    .profile-text {
        font-size: 14px;
        color: #666;
    }

    .menu-section {
        margin-bottom: 32px;
    }

    .section-title {
        font-size: 16px;
        font-weight: 600;
        color: #343538;
        margin-bottom: 12px;
    }

    .menu-button {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 16px;
        border: none;
        background: white;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
        color: #343538;
        text-align: left;
        transition: background-color 0.2s;
        margin-bottom: 8px;
        text-decoration: none;
    }

    .menu-button:hover {
        background: #f5f5f5;
    }

    .admin-btn {
        background-color: #f8f8f8;
    }

    .admin-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2100;
        background: rgba(255, 255, 255, 0.95);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
        overflow-y: auto;
    }
</style>
