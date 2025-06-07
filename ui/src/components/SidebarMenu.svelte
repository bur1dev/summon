<script lang="ts">
    import { showMenuStore } from "../stores/UiOnlyStore";
    import CategoryReportsAdmin from "./category reports/CategoryReportsAdmin.svelte";
    import ProfileEditor from "./ProfileEditor.svelte";
    import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";
    import { X, Tag, AlertTriangle } from "lucide-svelte";
    import { clickable } from "../actions/clickable";

    export let myAgentPubKeyB64: string | undefined;
    export let avatarLoaded: boolean;

    let showCategoryAdmin = false;
    let showProfileEditor = false;
    let profileEditorComponent: ProfileEditor | undefined;
    let isClosing = false;

    function closeMenu() {
        isClosing = true;
        setTimeout(() => {
            $showMenuStore = false;
            isClosing = false;
        }, 300); // Match animation duration
    }

    function handleProfileUpdated(event: CustomEvent) {
        console.log("Profile updated event:", event);
    }

    function handleAvatarClick() {
        showProfileEditor = true;
        if (!profileEditorComponent) return;
        profileEditorComponent.open();
    }
</script>

{#if $showMenuStore}
    <!-- Overlay -->
    <div
        class="overlay {isClosing ? 'fade-out' : 'fade-in'}"
        use:clickable={closeMenu}
    />

    <!-- Sidebar Panel -->
    <div class="sidebar-panel {isClosing ? 'slide-out-left' : 'slide-in-left'}">
        <div class="sidebar-header">
            <button
                class="delete-cart-btn btn btn-icon btn-icon-primary btn-icon-sm"
                on:click={closeMenu}
            >
                <X size={20} />
            </button>
        </div>

        <div class="sidebar-content">
            <!-- Profile Section -->
            {#if avatarLoaded && myAgentPubKeyB64}
                <div class="profile-section">
                    <div
                        class="avatar-container"
                        use:clickable={handleAvatarClick}
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

                <button
                    class="btn btn-menu btn-menu-gradient menu-button"
                    on:click={() => {
                        showCategoryAdmin = true;
                        closeMenu();
                    }}
                >
                    <Tag size={24} stroke-width={2} color="white" />
                    <span>Category Admin</span>
                </button>
            </div>

            <!-- Support Section -->
            <div class="menu-section">
                <h3 class="section-title">Support</h3>

                <a
                    href="https://github.com/bur1dev/summon/issues"
                    class="btn btn-menu menu-button"
                    target="_blank"
                    rel="noopener noreferrer"
                    on:click={closeMenu}
                >
                    <AlertTriangle size={24} stroke-width={2} />
                    <span>Report a Bug</span>
                </a>
            </div>
        </div>
    </div>
{/if}

{#if showCategoryAdmin}
    <div class="admin-overlay">
        <CategoryReportsAdmin onClose={() => (showCategoryAdmin = false)} />
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
        background: var(--overlay-dark);
        z-index: 1999;
    }

    .overlay.fade-in {
        animation: fadeIn var(--transition-fast) ease forwards;
    }

    .overlay.fade-out {
        animation: fadeOut var(--transition-fast) ease forwards;
    }

    .sidebar-panel {
        position: fixed;
        top: 0;
        left: 0;
        width: var(--sidebar-width);
        height: 100vh;
        background: var(--background);
        box-shadow: var(--shadow-sidebar);
        z-index: 2000;
        display: flex;
        flex-direction: column;
    }

    .sidebar-panel.slide-in-left {
        animation: slideInLeft var(--transition-normal) ease forwards;
    }

    .sidebar-panel.slide-out-left {
        animation: slideOutLeft var(--transition-normal) ease forwards;
    }

    .sidebar-header {
        display: flex;
        justify-content: flex-end;
        padding: 0 var(--spacing-md);
        border-bottom: var(--border-width-thin) solid var(--border);
        height: var(--component-header-height);
        align-items: center;
    }

    :global(.delete-cart-btn svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: var(--spacing-lg);
    }

    .profile-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--spacing-lg) 0;
        margin-bottom: var(--spacing-xl);
        border-bottom: var(--border-width-thin) solid var(--border);
    }

    .avatar-container {
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        overflow: hidden;
        border: var(--border-width) solid var(--primary);
        cursor: pointer;
        width: var(--avatar-size);
        height: var(--avatar-size);
        transition: var(--btn-transition);
        margin-bottom: var(--spacing-sm);
    }

    .avatar-container:hover {
        transform: scale(var(--hover-scale-subtle));
        box-shadow: var(--shadow-medium);
    }

    .profile-text {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
    }

    .menu-section {
        margin-bottom: var(--spacing-xxl);
    }

    .section-title {
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
        margin-bottom: var(--spacing-sm);
    }

    .admin-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2100;
        background: var(--overlay-light);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--spacing-lg);
        overflow-y: auto;
    }

    /* Add consistent button styling */
    .menu-button {
        height: var(--btn-height-md);
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
        margin-bottom: var(--spacing-md);
    }

    .menu-button span {
        flex: 1;
        text-align: left;
    }
</style>
